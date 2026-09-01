#!/usr/bin/env node
/**
 * Adminiculum — Review Live Acceptance Harness
 *
 * Deterministic operator-facing release identity and public acceptance verifier.
 * Validates deployed backend and frontend release identities, verifies protected
 * auth boundary fail-closed semantics, and checks scanner readiness when configured.
 *
 * Usage:
 *   node scripts/review-live-acceptance.mjs \
 *     --backend-url https://adminiculum-api.azurewebsites.net \
 *     --frontend-url https://adminiculum-app.azurewebsites.net \
 *     --expected-sha 4bfb3071a12a296fe385c1e8aff8e50b40a70d7d \
 *     [--scanner-url https://scanner.example.com]
 *
 * Environment variables:
 *   BACKEND_BASE_URL
 *   FRONTEND_BASE_URL
 *   EXPECTED_SHA
 *   SCANNER_HEALTH_URL
 *   ACCEPTANCE_TIMEOUT_MS
 */

const SHA_HEX_PATTERN = /^[0-9a-f]{40}$/i;
const DEFAULT_TIMEOUT_MS = 10000;

export const PROTECTED_WORKFORCE_ENDPOINTS = [
  '/api/v1/cases',
  '/api/v1/tasks',
  '/api/v1/time-entries',
  '/api/v1/users',
];

/**
 * Normalizes a base URL by removing trailing slashes.
 */
export function normalizeBaseUrl(url) {
  if (!url || typeof url !== 'string') return '';
  return url.trim().replace(/\/+$/, '');
}

/**
 * Validates whether a string is a 40-character hexadecimal Git commit SHA.
 */
export function isValidSha(sha) {
  return typeof sha === 'string' && SHA_HEX_PATTERN.test(sha.trim());
}

/**
 * Performs an HTTP fetch with timeout protection.
 */
async function defaultFetch(url, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Adminiculum-Live-Acceptance-Harness/1.0',
        Accept: 'application/json, text/plain, */*',
        ...(options.headers || {}),
      },
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 1. Checks Backend & Frontend Release Identity.
 */
export async function checkReleaseIdentity({
  backendUrl,
  frontendUrl,
  expectedSha,
  fetchFn = defaultFetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const normBackend = normalizeBaseUrl(backendUrl);
  const normFrontend = normalizeBaseUrl(frontendUrl);
  const normExpectedSha = typeof expectedSha === 'string' ? expectedSha.trim() : '';

  const report = {
    expectedSha: normExpectedSha || null,
    backendHealthStatus: 'FAIL',
    backendSha: null,
    frontendSha: null,
    backendHealthPass: false,
    backendIdentityPass: false,
    frontendIdentityPass: false,
    canonicalEqualityPass: false,
    errors: [],
  };

  if (!normBackend) {
    report.errors.push('BACKEND_BASE_URL is required but was not provided.');
  }
  if (!normFrontend) {
    report.errors.push('FRONTEND_BASE_URL is required but was not provided.');
  }
  if (!normExpectedSha) {
    report.errors.push('EXPECTED_SHA is required but was not provided.');
  } else if (!isValidSha(normExpectedSha)) {
    report.errors.push(`EXPECTED_SHA '${normExpectedSha}' is not a valid 40-character hex commit SHA.`);
  }

  // 1a. Probe Backend /health
  if (normBackend) {
    try {
      const healthRes = await fetchFn(`${normBackend}/health`, { timeoutMs });
      if (healthRes.ok) {
        report.backendHealthPass = true;
        report.backendHealthStatus = 'PASS';
      } else {
        report.errors.push(`Backend /health returned HTTP ${healthRes.status} (expected 200).`);
      }
    } catch (err) {
      report.errors.push(`Backend /health unreachable: ${err?.message || err}`);
    }

    // 1b. Probe Backend /health/version
    try {
      const versionRes = await fetchFn(`${normBackend}/health/version`, { timeoutMs });
      if (versionRes.ok) {
        const body = await versionRes.json().catch(() => null);
        const sha = body?.commitSha;
        if (isValidSha(sha)) {
          report.backendSha = sha.trim();
          report.backendIdentityPass = true;
        } else {
          report.errors.push(`Backend /health/version returned invalid or missing commitSha: ${JSON.stringify(sha)}`);
        }
      } else {
        report.errors.push(`Backend /health/version returned HTTP ${versionRes.status} (expected 200).`);
      }
    } catch (err) {
      report.errors.push(`Backend /health/version unreachable: ${err?.message || err}`);
    }
  }

  // 1c. Probe Frontend /api/release-identity
  if (normFrontend) {
    try {
      const feRes = await fetchFn(`${normFrontend}/api/release-identity`, { timeoutMs });
      if (feRes.ok) {
        const body = await feRes.json().catch(() => null);
        const sha = body?.commitSha;
        if (isValidSha(sha)) {
          report.frontendSha = sha.trim();
          report.frontendIdentityPass = true;
        } else {
          report.errors.push(`Frontend /api/release-identity returned invalid or missing commitSha: ${JSON.stringify(sha)}`);
        }
      } else {
        report.errors.push(`Frontend /api/release-identity returned HTTP ${feRes.status} (expected 200).`);
      }
    } catch (err) {
      report.errors.push(`Frontend /api/release-identity unreachable: ${err?.message || err}`);
    }
  }

  // 1d. Check canonical deployed equality
  if (
    report.backendIdentityPass &&
    report.frontendIdentityPass &&
    isValidSha(normExpectedSha)
  ) {
    const backendMatchesFrontend = report.backendSha.toLowerCase() === report.frontendSha.toLowerCase();
    const backendMatchesExpected = report.backendSha.toLowerCase() === normExpectedSha.toLowerCase();

    if (backendMatchesFrontend && backendMatchesExpected) {
      report.canonicalEqualityPass = true;
    } else {
      if (!backendMatchesFrontend) {
        report.errors.push(`SHA mismatch between backend (${report.backendSha}) and frontend (${report.frontendSha}).`);
      }
      if (!backendMatchesExpected) {
        report.errors.push(`Deployed SHA (${report.backendSha}) does not match EXPECTED_SHA (${normExpectedSha}).`);
      }
    }
  }

  return report;
}

/**
 * 2. Checks Public Auth Gate on protected workforce endpoints.
 */
export async function checkAuthGate({
  backendUrl,
  endpoints = PROTECTED_WORKFORCE_ENDPOINTS,
  fetchFn = defaultFetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const normBackend = normalizeBaseUrl(backendUrl);
  const report = {
    pass: false,
    endpointResults: [],
    errors: [],
  };

  if (!normBackend) {
    report.errors.push('BACKEND_BASE_URL is required for auth gate check.');
    return report;
  }

  let allEndpointsProtected = true;

  for (const endpoint of endpoints) {
    const fullUrl = `${normBackend}${endpoint}`;
    try {
      const res = await fetchFn(fullUrl, { timeoutMs });
      const status = res.status;
      const isExpectedAuthRejection = status === 401 || status === 403;

      report.endpointResults.push({
        endpoint,
        status,
        pass: isExpectedAuthRejection,
      });

      if (!isExpectedAuthRejection) {
        allEndpointsProtected = false;
        if (status === 200) {
          report.errors.push(`SECURITY VIOLATION: Protected endpoint ${endpoint} returned HTTP 200 without credentials.`);
        } else if (status >= 500) {
          report.errors.push(`FAIL-CLOSED DEFECT: Protected endpoint ${endpoint} crashed with HTTP ${status} (expected 401/403).`);
        } else {
          report.errors.push(`Protected endpoint ${endpoint} returned unexpected HTTP ${status} (expected 401/403).`);
        }
      }
    } catch (err) {
      allEndpointsProtected = false;
      report.endpointResults.push({
        endpoint,
        status: null,
        pass: false,
        error: err?.message || String(err),
      });
      report.errors.push(`Protected endpoint ${endpoint} network error: ${err?.message || err}`);
    }
  }

  report.pass = allEndpointsProtected && report.endpointResults.length > 0;
  return report;
}

/**
 * 3. Checks Scanner Readiness when URL is provided.
 */
export async function checkScannerReadiness({
  scannerUrl,
  fetchFn = defaultFetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const trimmed = typeof scannerUrl === 'string' ? scannerUrl.trim() : '';

  if (!trimmed) {
    return {
      status: 'SKIPPED',
      reason: 'UNPROVABLE: SCANNER_HEALTH_URL not provided',
      pass: null,
      errors: [],
    };
  }

  const normUrl = trimmed.replace(/\/+$/, '');
  const readyUrl = normUrl.endsWith('/health/ready') ? normUrl : `${normUrl}/health/ready`;

  try {
    const res = await fetchFn(readyUrl, { timeoutMs });
    if (res.ok) {
      const body = await res.json().catch(() => null);
      const isReady =
        body?.status === 'ready' ||
        body?.status === 'ok' ||
        body?.status === 'HEALTHY' ||
        body?.healthy === true;

      if (isReady) {
        return {
          status: 'PASS',
          url: readyUrl,
          httpStatus: res.status,
          pass: true,
          errors: [],
        };
      } else {
        return {
          status: 'FAIL',
          url: readyUrl,
          httpStatus: res.status,
          pass: false,
          errors: [`Scanner /health/ready returned non-ready payload: ${JSON.stringify(body)}`],
        };
      }
    } else {
      return {
        status: 'FAIL',
        url: readyUrl,
        httpStatus: res.status,
        pass: false,
        errors: [`Scanner /health/ready returned HTTP ${res.status} (expected 200).`],
      };
    }
  } catch (err) {
    return {
      status: 'FAIL',
      url: readyUrl,
      httpStatus: null,
      pass: false,
      errors: [`Scanner /health/ready unreachable: ${err?.message || err}`],
    };
  }
}

/**
 * Runs the full Live Acceptance verification suite.
 */
export async function runLiveAcceptanceHarness({
  backendUrl = process.env.BACKEND_BASE_URL,
  frontendUrl = process.env.FRONTEND_BASE_URL,
  expectedSha = process.env.EXPECTED_SHA,
  scannerUrl = process.env.SCANNER_HEALTH_URL,
  timeoutMs = Number(process.env.ACCEPTANCE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  fetchFn = defaultFetch,
} = {}) {
  const releaseIdentity = await checkReleaseIdentity({
    backendUrl,
    frontendUrl,
    expectedSha,
    fetchFn,
    timeoutMs,
  });

  const authGate = await checkAuthGate({
    backendUrl,
    fetchFn,
    timeoutMs,
  });

  const scanner = await checkScannerReadiness({
    scannerUrl,
    fetchFn,
    timeoutMs,
  });

  // Determine overall public acceptance pass:
  // Mandatory: Backend Health, Backend Identity, Frontend Identity, Canonical Equality, Auth Gate.
  // Scanner: If supplied, MUST pass. If omitted/skipped, does not fail the mandatory public gate.
  const mandatoryGatesPassed =
    releaseIdentity.backendHealthPass &&
    releaseIdentity.backendIdentityPass &&
    releaseIdentity.frontendIdentityPass &&
    releaseIdentity.canonicalEqualityPass &&
    authGate.pass;

  const scannerGatePassed = scanner.pass !== false; // true or null (skipped)

  const publicAcceptancePass = mandatoryGatesPassed && scannerGatePassed;

  return {
    expectedSha: releaseIdentity.expectedSha,
    backendSha: releaseIdentity.backendSha,
    frontendSha: releaseIdentity.frontendSha,
    backendHealth: releaseIdentity.backendHealthPass ? 'PASS' : 'FAIL',
    backendReleaseIdentity: releaseIdentity.backendIdentityPass ? 'PASS' : 'FAIL',
    frontendReleaseIdentity: releaseIdentity.frontendIdentityPass ? 'PASS' : 'FAIL',
    canonicalDeployedEquality: releaseIdentity.canonicalEqualityPass ? 'PASS' : 'FAIL',
    authGate: authGate.pass ? 'PASS' : 'FAIL',
    scannerHealth: scanner.status === 'PASS' ? 'PASS' : scanner.status === 'FAIL' ? 'FAIL' : 'SKIPPED (UNPROVABLE: SCANNER_HEALTH_URL not provided)',
    publicAcceptancePass: publicAcceptancePass ? 'YES' : 'NO',
    details: {
      releaseIdentity,
      authGate,
      scanner,
    },
  };
}

/**
 * Formats acceptance result into exact machine-readable + human-readable output.
 */
export function formatAcceptanceReport(result) {
  const lines = [
    `EXPECTED_SHA=${result.expectedSha || 'MISSING'}`,
    `BACKEND_SHA=${result.backendSha || 'UNAVAILABLE'}`,
    `FRONTEND_SHA=${result.frontendSha || 'UNAVAILABLE'}`,
    '',
    `BACKEND_HEALTH=${result.backendHealth}`,
    `BACKEND_RELEASE_IDENTITY=${result.backendReleaseIdentity}`,
    `FRONTEND_RELEASE_IDENTITY=${result.frontendReleaseIdentity}`,
    `CANONICAL_DEPLOYED_EQUALITY=${result.canonicalDeployedEquality}`,
    '',
    `AUTH_GATE=${result.authGate}`,
    `SCANNER_HEALTH=${result.scannerHealth}`,
    '',
    `PUBLIC_ACCEPTANCE_PASS=${result.publicAcceptancePass}`,
  ];

  const allErrors = [
    ...(result.details?.releaseIdentity?.errors || []),
    ...(result.details?.authGate?.errors || []),
    ...(result.details?.scanner?.errors || []),
  ];

  if (allErrors.length > 0) {
    lines.push('', '--- FAILURE DETAILS ---');
    for (const err of allErrors) {
      lines.push(`- ${err}`);
    }
  }

  return lines.join('\n');
}

/**
 * Parse CLI command-line arguments.
 */
export function parseCliArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--backend-url' && args[i + 1]) parsed.backendUrl = args[++i];
    else if (arg === '--frontend-url' && args[i + 1]) parsed.frontendUrl = args[++i];
    else if (arg === '--expected-sha' && args[i + 1]) parsed.expectedSha = args[++i];
    else if (arg === '--scanner-url' && args[i + 1]) parsed.scannerUrl = args[++i];
    else if (arg === '--timeout' && args[i + 1]) parsed.timeoutMs = Number(args[++i]);
    else if (arg === '--help' || arg === '-h') parsed.help = true;
  }
  return parsed;
}

// CLI Execution Entry Point
if (process.argv[1] && process.argv[1].endsWith('review-live-acceptance.mjs')) {
  const cliArgs = parseCliArgs(process.argv.slice(2));

  if (cliArgs.help) {
    console.log(`
Adminiculum Review Live Acceptance Harness

Usage:
  node scripts/review-live-acceptance.mjs [options]

Options:
  --backend-url   <url>   Backend base URL (or env BACKEND_BASE_URL)
  --frontend-url  <url>   Frontend base URL (or env FRONTEND_BASE_URL)
  --expected-sha  <sha>   Expected 40-char canonical Git commit SHA (or env EXPECTED_SHA)
  --scanner-url   <url>   Optional malware scanner health URL (or env SCANNER_HEALTH_URL)
  --timeout       <ms>    HTTP timeout in milliseconds (default: 10000)
  --help, -h              Show this help message
`);
    process.exit(0);
  }

  runLiveAcceptanceHarness(cliArgs)
    .then((result) => {
      console.log(formatAcceptanceReport(result));
      process.exit(result.publicAcceptancePass === 'YES' ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal harness error:', err);
      process.exit(1);
    });
}
