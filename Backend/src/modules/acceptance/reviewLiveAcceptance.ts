/**
 * Adminiculum — Review Live Acceptance Harness Core
 *
 * Deterministic operator-facing release identity and public acceptance verifier.
 * Validates deployed backend and frontend release identities, verifies protected
 * auth boundary fail-closed semantics, and checks scanner readiness when configured.
 */

export const SHA_HEX_PATTERN = /^[0-9a-f]{40}$/i;
export const DEFAULT_TIMEOUT_MS = 10000;

export const PROTECTED_WORKFORCE_ENDPOINTS = [
  '/api/v1/cases',
  '/api/v1/tasks',
  '/api/v1/time-entries',
  '/api/v1/users',
];

export type FetchFn = (
  url: string,
  options?: RequestInit & { timeoutMs?: number }
) => Promise<Response | { status: number; ok: boolean; json: () => Promise<any> }>;

export interface ReleaseIdentityCheckOptions {
  backendUrl?: string | null;
  frontendUrl?: string | null;
  expectedSha?: string | null;
  fetchFn?: FetchFn;
  timeoutMs?: number;
}

export interface ReleaseIdentityCheckResult {
  expectedSha: string | null;
  backendHealthStatus: 'PASS' | 'FAIL';
  backendSha: string | null;
  frontendSha: string | null;
  backendHealthPass: boolean;
  backendIdentityPass: boolean;
  frontendIdentityPass: boolean;
  canonicalEqualityPass: boolean;
  errors: string[];
}

export interface AuthGateCheckOptions {
  backendUrl?: string | null;
  endpoints?: string[];
  fetchFn?: FetchFn;
  timeoutMs?: number;
}

export interface AuthGateCheckResult {
  pass: boolean;
  endpointResults: Array<{
    endpoint: string;
    status: number | null;
    pass: boolean;
    error?: string;
  }>;
  errors: string[];
}

export interface ScannerReadinessCheckOptions {
  scannerUrl?: string | null;
  fetchFn?: FetchFn;
  timeoutMs?: number;
}

export interface ScannerReadinessCheckResult {
  status: 'PASS' | 'FAIL' | 'SKIPPED';
  reason?: string;
  url?: string;
  httpStatus?: number | null;
  pass: boolean | null;
  errors: string[];
}

export interface LiveAcceptanceHarnessOptions {
  backendUrl?: string | null;
  frontendUrl?: string | null;
  expectedSha?: string | null;
  scannerUrl?: string | null;
  timeoutMs?: number;
  fetchFn?: FetchFn;
}

export interface LiveAcceptanceHarnessResult {
  expectedSha: string | null;
  backendSha: string | null;
  frontendSha: string | null;
  backendHealth: 'PASS' | 'FAIL';
  backendReleaseIdentity: 'PASS' | 'FAIL';
  frontendReleaseIdentity: 'PASS' | 'FAIL';
  canonicalDeployedEquality: 'PASS' | 'FAIL';
  authGate: 'PASS' | 'FAIL';
  scannerHealth: 'PASS' | 'FAIL' | string;
  publicAcceptancePass: 'YES' | 'NO';
  details: {
    releaseIdentity: ReleaseIdentityCheckResult;
    authGate: AuthGateCheckResult;
    scanner: ScannerReadinessCheckResult;
  };
}

/**
 * Normalizes a base URL by removing trailing slashes.
 */
export function normalizeBaseUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') return '';
  return url.trim().replace(/\/+$/, '');
}

/**
 * Validates whether a string is a 40-character hexadecimal Git commit SHA.
 */
export function isValidSha(sha?: string | null): boolean {
  return typeof sha === 'string' && SHA_HEX_PATTERN.test(sha.trim());
}

/**
 * Performs an HTTP fetch with timeout protection.
 */
async function defaultFetch(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
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
}: ReleaseIdentityCheckOptions): Promise<ReleaseIdentityCheckResult> {
  const normBackend = normalizeBaseUrl(backendUrl);
  const normFrontend = normalizeBaseUrl(frontendUrl);
  const normExpectedSha = typeof expectedSha === 'string' ? expectedSha.trim() : '';

  const report: ReleaseIdentityCheckResult = {
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
    } catch (err: any) {
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
    } catch (err: any) {
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
    } catch (err: any) {
      report.errors.push(`Frontend /api/release-identity unreachable: ${err?.message || err}`);
    }
  }

  // 1d. Check canonical deployed equality
  if (
    report.backendIdentityPass &&
    report.frontendIdentityPass &&
    isValidSha(normExpectedSha)
  ) {
    const backendMatchesFrontend = report.backendSha!.toLowerCase() === report.frontendSha!.toLowerCase();
    const backendMatchesExpected = report.backendSha!.toLowerCase() === normExpectedSha.toLowerCase();

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
}: AuthGateCheckOptions): Promise<AuthGateCheckResult> {
  const normBackend = normalizeBaseUrl(backendUrl);
  const report: AuthGateCheckResult = {
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
    } catch (err: any) {
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
}: ScannerReadinessCheckOptions): Promise<ScannerReadinessCheckResult> {
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
  } catch (err: any) {
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
}: LiveAcceptanceHarnessOptions = {}): Promise<LiveAcceptanceHarnessResult> {
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

  const mandatoryGatesPassed =
    releaseIdentity.backendHealthPass &&
    releaseIdentity.backendIdentityPass &&
    releaseIdentity.frontendIdentityPass &&
    releaseIdentity.canonicalEqualityPass &&
    authGate.pass;

  const scannerGatePassed = scanner.pass !== false;

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
    scannerHealth:
      scanner.status === 'PASS'
        ? 'PASS'
        : scanner.status === 'FAIL'
        ? 'FAIL'
        : 'SKIPPED (UNPROVABLE: SCANNER_HEALTH_URL not provided)',
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
export function formatAcceptanceReport(result: LiveAcceptanceHarnessResult): string {
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
export function parseCliArgs(args: string[]): Record<string, any> {
  const parsed: Record<string, any> = {};
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
