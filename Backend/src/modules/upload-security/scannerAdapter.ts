/**
 * SEC-2: Provider-Neutral Malware Scanner Adapter for Workforce Uploads
 *
 * SAFETY INVARIANT: with no real scanner configured, a file can NEVER become
 * CLEAN. The unconfigured scanner returns SCAN_FAILED (code SCANNER_NOT_CONFIGURED)
 * so acceptance stays blocked. This is the correct production behavior when no
 * scanner is provisioned — it is NOT a PASS, it is an EXTERNAL_AV_ACCEPTANCE_GAP.
 *
 * Production policy:
 *   INFECTED  → reject
 *   ERROR     → fail closed (reject)
 *   UNAVAILABLE → fail closed (reject) when scanner is required
 *   SCAN_FAILED → reject (scanner could not complete)
 *
 * Development/test may use a deterministic mock scanner via setWorkforceScanner().
 */

import { httpScannerFromEnv } from './httpMalwareScanner';

export type WorkforceScanOutcome = 'CLEAN' | 'INFECTED' | 'UNSUPPORTED' | 'SCAN_FAILED';

export interface WorkforceScanInput {
  buffer: Buffer;
  detectedMimeType: string | null;
  sizeBytes: number;
  fileName: string;
}

export interface WorkforceScanResult {
  outcome: WorkforceScanOutcome;
  provider: string;
  /** Bounded, non-sensitive code — never raw provider output. */
  codeSafe: string;
}

export interface WorkforceMalwareScanner {
  readonly provider: string;
  scan(input: WorkforceScanInput): Promise<WorkforceScanResult>;
}

/** Default scanner when none is configured: never returns CLEAN. */
class UnconfiguredWorkforceScanner implements WorkforceMalwareScanner {
  readonly provider = 'NONE';
  async scan(): Promise<WorkforceScanResult> {
    return { outcome: 'SCAN_FAILED', provider: 'NONE', codeSafe: 'SCANNER_NOT_CONFIGURED' };
  }
}

let cached: WorkforceMalwareScanner | null = null;

/**
 * Resolve the active workforce scanner.
 *
 * Provider selection (fail-closed): when WORKFORCE_MALWARE_SCANNER=http and a
 * WORKFORCE_MALWARE_SCANNER_URL is configured, the production HTTP adapter is
 * used. Otherwise the unconfigured scanner is used, which can NEVER return
 * CLEAN — so with no provider provisioned, uploads stay blocked. The result is
 * cached; use setWorkforceScanner(null) to force re-resolution (tests) or after
 * a config change.
 */
export function getWorkforceScanner(env: NodeJS.ProcessEnv = process.env): WorkforceMalwareScanner {
  if (cached) return cached;
  cached = httpScannerFromEnv(env) ?? new UnconfiguredWorkforceScanner();
  return cached;
}

/** Test seam / provider wiring point. */
export function setWorkforceScanner(scanner: WorkforceMalwareScanner | null): void {
  cached = scanner;
}

export function workforceScannerConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return getWorkforceScanner(env).provider !== 'NONE';
}

export interface WorkforceScannerReadiness {
  /** True only when a real (non-NONE) scanner provider is resolved. */
  configured: boolean;
  /** Stable provider label only — never a URL, key, or provider internals. */
  provider: string;
}

/**
 * Safe internal readiness signal for operations. Distinguishes
 * SCANNER_CONFIGURED vs SCANNER_UNAVAILABLE without exposing any credential,
 * endpoint, or provider internals.
 */
export function workforceScannerReadiness(env: NodeJS.ProcessEnv = process.env): WorkforceScannerReadiness {
  const scanner = getWorkforceScanner(env);
  return { configured: scanner.provider !== 'NONE', provider: scanner.provider };
}

/**
 * Map a scan outcome to a file status string.
 * Production policy: only CLEAN is acceptable.
 */
export function workforceFileStatusForScan(outcome: WorkforceScanOutcome): string {
  return outcome;
}

/**
 * A file may be accepted into the document store only when its scan status is CLEAN.
 */
export function isWorkforceAcceptableFileStatus(status: string): boolean {
  return status === 'CLEAN';
}

/**
 * Determine whether the scan result should cause rejection.
 *
 * Production policy:
 * - INFECTED → always reject
 * - ERROR → fail closed (reject)
 * - UNAVAILABLE → fail closed when scanner is required
 * - SCAN_FAILED → reject
 * - CLEAN → accept
 */
export function shouldRejectWorkforceScan(result: WorkforceScanResult): boolean {
  return result.outcome !== 'CLEAN';
}

/**
 * Deterministic mock scanner for development and testing.
 * Returns CLEAN for files that pass basic heuristics, SCAN_FAILED for others.
 * This is NOT safe for production — use only in test environments.
 */
export class DevMockWorkforceScanner implements WorkforceMalwareScanner {
  readonly provider = 'DEV_MOCK';

  async scan(input: WorkforceScanInput): Promise<WorkforceScanResult> {
    // In dev mode, accept common office document types
    const safeMimes = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/zip', // DOCX
    ]);

    if (input.detectedMimeType && safeMimes.has(input.detectedMimeType)) {
      return { outcome: 'CLEAN', provider: 'DEV_MOCK', codeSafe: 'MOCK_SCAN_PASSED' };
    }

    return { outcome: 'UNSUPPORTED', provider: 'DEV_MOCK', codeSafe: 'MOCK_UNSUPPORTED_TYPE' };
  }
}
