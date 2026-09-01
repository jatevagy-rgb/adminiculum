/**
 * Tests for Review Live Acceptance Harness
 *
 * Validates deterministic release identity checks, public auth gate fail-closed
 * enforcement, scanner readiness evaluation, and pass/fail/unprovable semantics.
 */

import {
  checkReleaseIdentity,
  checkAuthGate,
  checkScannerReadiness,
  runLiveAcceptanceHarness,
  formatAcceptanceReport,
  isValidSha,
  normalizeBaseUrl,
} from '../src/modules/acceptance/reviewLiveAcceptance';

const VALID_SHA_A = '4bfb3071a12a296fe385c1e8aff8e50b40a70d7d';
const VALID_SHA_B = '215b31a56e28bfc30a94b916d426e25d62cf75da';

function mockFetch(responses: Record<string, { status: number; body?: any; ok?: boolean }>) {
  return async (url: string) => {
    const matched = Object.entries(responses).find(([key]) => url.includes(key));
    if (!matched) {
      return {
        status: 404,
        ok: false,
        json: async () => ({ error: 'Not found' }),
      };
    }
    const [, res] = matched;
    return {
      status: res.status,
      ok: res.ok !== undefined ? res.ok : res.status >= 200 && res.status < 300,
      json: async () => res.body || {},
    };
  };
}

describe('Review Live Acceptance Harness', () => {
  describe('Utility functions', () => {
    it('normalizes base URLs by stripping trailing slashes and whitespace', () => {
      expect(normalizeBaseUrl(' https://api.example.com/// ')).toBe('https://api.example.com');
      expect(normalizeBaseUrl('')).toBe('');
      expect(normalizeBaseUrl(null as any)).toBe('');
    });

    it('validates 40-character hexadecimal Git commit SHAs', () => {
      expect(isValidSha(VALID_SHA_A)).toBe(true);
      expect(isValidSha(VALID_SHA_A.toUpperCase())).toBe(true);
      expect(isValidSha('invalid-sha')).toBe(false);
      expect(isValidSha('12345')).toBe(false);
      expect(isValidSha('')).toBe(false);
      expect(isValidSha(null as any)).toBe(false);
    });
  });

  describe('1. Release Identity Check', () => {
    it('matching SHA — PASS when backend, frontend, and expected SHA match perfectly', async () => {
      const fetchFn = mockFetch({
        '/health/version': { status: 200, body: { commitSha: VALID_SHA_A } },
        '/health': { status: 200, body: { status: 'healthy' } },
        '/api/release-identity': { status: 200, body: { commitSha: VALID_SHA_A } },
      }) as any;

      const result = await checkReleaseIdentity({
        backendUrl: 'https://backend.example.com',
        frontendUrl: 'https://frontend.example.com',
        expectedSha: VALID_SHA_A,
        fetchFn,
      });

      expect(result.backendHealthPass).toBe(true);
      expect(result.backendIdentityPass).toBe(true);
      expect(result.frontendIdentityPass).toBe(true);
      expect(result.canonicalEqualityPass).toBe(true);
      expect(result.backendSha).toBe(VALID_SHA_A);
      expect(result.frontendSha).toBe(VALID_SHA_A);
      expect(result.errors).toHaveLength(0);
    });

    it('backend/frontend mismatch — FAIL when backend and frontend serve different SHAs', async () => {
      const fetchFn = mockFetch({
        '/health/version': { status: 200, body: { commitSha: VALID_SHA_A } },
        '/health': { status: 200, body: { status: 'healthy' } },
        '/api/release-identity': { status: 200, body: { commitSha: VALID_SHA_B } },
      }) as any;

      const result = await checkReleaseIdentity({
        backendUrl: 'https://backend.example.com',
        frontendUrl: 'https://frontend.example.com',
        expectedSha: VALID_SHA_A,
        fetchFn,
      });

      expect(result.backendIdentityPass).toBe(true);
      expect(result.frontendIdentityPass).toBe(true);
      expect(result.canonicalEqualityPass).toBe(false);
      expect(result.errors.some((e) => e.includes('SHA mismatch between backend'))).toBe(true);
    });

    it('expected SHA mismatch — FAIL when deployed SHA does not match EXPECTED_SHA', async () => {
      const fetchFn = mockFetch({
        '/health/version': { status: 200, body: { commitSha: VALID_SHA_B } },
        '/health': { status: 200, body: { status: 'healthy' } },
        '/api/release-identity': { status: 200, body: { commitSha: VALID_SHA_B } },
      }) as any;

      const result = await checkReleaseIdentity({
        backendUrl: 'https://backend.example.com',
        frontendUrl: 'https://frontend.example.com',
        expectedSha: VALID_SHA_A,
        fetchFn,
      });

      expect(result.backendIdentityPass).toBe(true);
      expect(result.frontendIdentityPass).toBe(true);
      expect(result.canonicalEqualityPass).toBe(false);
      expect(result.errors.some((e) => e.includes('does not match EXPECTED_SHA'))).toBe(true);
    });

    it('missing SHA — FAIL when EXPECTED_SHA or returned commitSha is missing/invalid', async () => {
      const fetchFn = mockFetch({
        '/health/version': { status: 200, body: { commitSha: null } },
        '/health': { status: 200, body: { status: 'healthy' } },
        '/api/release-identity': { status: 200, body: { commitSha: 'invalid-short' } },
      }) as any;

      const result = await checkReleaseIdentity({
        backendUrl: 'https://backend.example.com',
        frontendUrl: 'https://frontend.example.com',
        expectedSha: '',
        fetchFn,
      });

      expect(result.backendIdentityPass).toBe(false);
      expect(result.frontendIdentityPass).toBe(false);
      expect(result.canonicalEqualityPass).toBe(false);
      expect(result.errors.some((e) => e.includes('EXPECTED_SHA is required'))).toBe(true);
    });

    it('backend health failure — FAIL when /health returns 500 or errors', async () => {
      const fetchFn = mockFetch({
        '/health/version': { status: 200, body: { commitSha: VALID_SHA_A } },
        '/health': { status: 500, ok: false },
        '/api/release-identity': { status: 200, body: { commitSha: VALID_SHA_A } },
      }) as any;

      const result = await checkReleaseIdentity({
        backendUrl: 'https://backend.example.com',
        frontendUrl: 'https://frontend.example.com',
        expectedSha: VALID_SHA_A,
        fetchFn,
      });

      expect(result.backendHealthPass).toBe(false);
      expect(result.backendHealthStatus).toBe('FAIL');
      expect(result.errors.some((e) => e.includes('Backend /health returned HTTP 500'))).toBe(true);
    });

    it('frontend identity 404 — FAIL when /api/release-identity is missing or unreachable', async () => {
      const fetchFn = mockFetch({
        '/health/version': { status: 200, body: { commitSha: VALID_SHA_A } },
        '/health': { status: 200, body: { status: 'healthy' } },
        '/api/release-identity': { status: 404, ok: false },
      }) as any;

      const result = await checkReleaseIdentity({
        backendUrl: 'https://backend.example.com',
        frontendUrl: 'https://frontend.example.com',
        expectedSha: VALID_SHA_A,
        fetchFn,
      });

      expect(result.frontendIdentityPass).toBe(false);
      expect(result.canonicalEqualityPass).toBe(false);
      expect(result.errors.some((e) => e.includes('Frontend /api/release-identity returned HTTP 404'))).toBe(true);
    });
  });

  describe('2. Public Auth Gate Check', () => {
    it('PASS when all protected endpoints return 401 or 403', async () => {
      const fetchFn = mockFetch({
        '/api/v1/cases': { status: 401 },
        '/api/v1/tasks': { status: 401 },
        '/api/v1/time-entries': { status: 401 },
        '/api/v1/users': { status: 403 },
      }) as any;

      const result = await checkAuthGate({
        backendUrl: 'https://backend.example.com',
        fetchFn,
      });

      expect(result.pass).toBe(true);
      expect(result.endpointResults).toHaveLength(4);
      expect(result.endpointResults.every((r) => r.pass)).toBe(true);
    });

    it('FAIL when protected endpoint incorrectly returns 200 (security leak)', async () => {
      const fetchFn = mockFetch({
        '/api/v1/cases': { status: 401 },
        '/api/v1/tasks': { status: 200, body: [{ id: 'task-1' }] },
        '/api/v1/time-entries': { status: 401 },
        '/api/v1/users': { status: 401 },
      }) as any;

      const result = await checkAuthGate({
        backendUrl: 'https://backend.example.com',
        fetchFn,
      });

      expect(result.pass).toBe(false);
      expect(result.errors.some((e) => e.includes('SECURITY VIOLATION') && e.includes('/api/v1/tasks'))).toBe(true);
    });

    it('FAIL when protected endpoint crashes with 500 (fail-closed defect)', async () => {
      const fetchFn = mockFetch({
        '/api/v1/cases': { status: 401 },
        '/api/v1/tasks': { status: 500 },
        '/api/v1/time-entries': { status: 401 },
        '/api/v1/users': { status: 401 },
      }) as any;

      const result = await checkAuthGate({
        backendUrl: 'https://backend.example.com',
        fetchFn,
      });

      expect(result.pass).toBe(false);
      expect(result.errors.some((e) => e.includes('FAIL-CLOSED DEFECT') && e.includes('/api/v1/tasks'))).toBe(true);
    });
  });

  describe('3. Scanner Readiness Check', () => {
    it('PASS when scanner /health/ready returns 200 and ready payload', async () => {
      const fetchFn = mockFetch({
        '/health/ready': { status: 200, body: { status: 'ready' } },
      }) as any;

      const result = await checkScannerReadiness({
        scannerUrl: 'https://scanner.example.com',
        fetchFn,
      });

      expect(result.status).toBe('PASS');
      expect(result.pass).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('FAIL when scanner /health/ready returns 503 or error payload', async () => {
      const fetchFn = mockFetch({
        '/health/ready': { status: 503, ok: false, body: { status: 'unavailable' } },
      }) as any;

      const result = await checkScannerReadiness({
        scannerUrl: 'https://scanner.example.com',
        fetchFn,
      });

      expect(result.status).toBe('FAIL');
      expect(result.pass).toBe(false);
      expect(result.errors.some((e) => e.includes('Scanner /health/ready returned HTTP 503'))).toBe(true);
    });

    it('UNPROVABLE / SKIPPED when SCANNER_HEALTH_URL is omitted', async () => {
      const result = await checkScannerReadiness({
        scannerUrl: undefined,
      });

      expect(result.status).toBe('SKIPPED');
      expect(result.pass).toBeNull();
      expect(result.reason).toContain('UNPROVABLE: SCANNER_HEALTH_URL not provided');
    });
  });

  describe('4. Full Acceptance Harness & Report Formatting', () => {
    it('PUBLIC_ACCEPTANCE_PASS=YES when all mandatory gates pass and scanner is skipped', async () => {
      const fetchFn = mockFetch({
        '/health/version': { status: 200, body: { commitSha: VALID_SHA_A } },
        '/health': { status: 200, body: { status: 'healthy' } },
        '/api/release-identity': { status: 200, body: { commitSha: VALID_SHA_A } },
        '/api/v1/cases': { status: 401 },
        '/api/v1/tasks': { status: 401 },
        '/api/v1/time-entries': { status: 401 },
        '/api/v1/users': { status: 401 },
      }) as any;

      const result = await runLiveAcceptanceHarness({
        backendUrl: 'https://backend.example.com',
        frontendUrl: 'https://frontend.example.com',
        expectedSha: VALID_SHA_A,
        scannerUrl: undefined,
        fetchFn,
      });

      expect(result.publicAcceptancePass).toBe('YES');
      expect(result.backendHealth).toBe('PASS');
      expect(result.backendReleaseIdentity).toBe('PASS');
      expect(result.frontendReleaseIdentity).toBe('PASS');
      expect(result.canonicalDeployedEquality).toBe('PASS');
      expect(result.authGate).toBe('PASS');
      expect(result.scannerHealth).toContain('SKIPPED');

      const report = formatAcceptanceReport(result);
      expect(report).toContain(`EXPECTED_SHA=${VALID_SHA_A}`);
      expect(report).toContain(`BACKEND_SHA=${VALID_SHA_A}`);
      expect(report).toContain(`FRONTEND_SHA=${VALID_SHA_A}`);
      expect(report).toContain('BACKEND_HEALTH=PASS');
      expect(report).toContain('BACKEND_RELEASE_IDENTITY=PASS');
      expect(report).toContain('FRONTEND_RELEASE_IDENTITY=PASS');
      expect(report).toContain('CANONICAL_DEPLOYED_EQUALITY=PASS');
      expect(report).toContain('AUTH_GATE=PASS');
      expect(report).toContain('PUBLIC_ACCEPTANCE_PASS=YES');
    });

    it('PUBLIC_ACCEPTANCE_PASS=NO when any mandatory check fails', async () => {
      const fetchFn = mockFetch({
        '/health/version': { status: 200, body: { commitSha: VALID_SHA_A } },
        '/health': { status: 200, body: { status: 'healthy' } },
        '/api/release-identity': { status: 200, body: { commitSha: VALID_SHA_B } }, // Mismatch
        '/api/v1/cases': { status: 401 },
        '/api/v1/tasks': { status: 401 },
        '/api/v1/time-entries': { status: 401 },
        '/api/v1/users': { status: 401 },
      }) as any;

      const result = await runLiveAcceptanceHarness({
        backendUrl: 'https://backend.example.com',
        frontendUrl: 'https://frontend.example.com',
        expectedSha: VALID_SHA_A,
        fetchFn,
      });

      expect(result.publicAcceptancePass).toBe('NO');
      expect(result.canonicalDeployedEquality).toBe('FAIL');

      const report = formatAcceptanceReport(result);
      expect(report).toContain('PUBLIC_ACCEPTANCE_PASS=NO');
      expect(report).toContain('--- FAILURE DETAILS ---');
      expect(report).toContain('SHA mismatch between backend');
    });
  });
});
