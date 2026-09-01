/**
 * SEC-2: Provider-Neutral Malware Scanner Adapter for All Uploads
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
 * Development/test may use a deterministic mock scanner via setScanner().
 */

import { httpScannerFromEnv } from './httpMalwareScanner';

export type ScanOutcome = 'CLEAN' | 'INFECTED' | 'UNSUPPORTED' | 'SCAN_FAILED';

export interface ScanInput {
  buffer: Buffer;
  detectedMimeType: string | null;
  sizeBytes: number;
  fileName: string;
}

export interface ScanResult {
  outcome: ScanOutcome;
  provider: string;
  /** Bounded, non-sensitive code — never raw provider output. */
  codeSafe: string;
}

export interface MalwareScanner {
  readonly provider: string;
  scan(input: ScanInput): Promise<ScanResult>;
}

/** Default scanner when none is configured: never returns CLEAN. */
class UnconfiguredScanner implements MalwareScanner {
  readonly provider = 'NONE';
  async scan(): Promise<ScanResult> {
    return { outcome: 'SCAN_FAILED', provider: 'NONE', codeSafe: 'SCANNER_NOT_CONFIGURED' };
  }
}

let cached: MalwareScanner | null = null;

/**
 * Resolve the active workforce scanner.
 *
 * Provider selection (fail-closed): when WORKFORCE_MALWARE_SCANNER=http and a
 * WORKFORCE_MALWARE_SCANNER_URL is configured, the production HTTP adapter is
 * used. Otherwise the unconfigured scanner is used, which can NEVER return
 * CLEAN — so with no provider provisioned, uploads stay blocked. The result is
 * cached; use setScanner(null) to force re-resolution (tests) or after
 * a config change.
 */
export function getScanner(env: NodeJS.ProcessEnv = process.env): MalwareScanner {
  if (cached) return cached;
  cached = httpScannerFromEnv(env) ?? new UnconfiguredScanner();
  return cached;
}

/** Test seam / provider wiring point. */
export function setScanner(scanner: MalwareScanner | null): void {
  cached = scanner;
}

export function scannerConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return getScanner(env).provider !== 'NONE';
}

export interface ScannerReadiness {
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
export function scannerReadiness(env: NodeJS.ProcessEnv = process.env): ScannerReadiness {
  const scanner = getScanner(env);
  return { configured: scanner.provider !== 'NONE', provider: scanner.provider };
}

/**
 * Map a scan outcome to a file status string.
 * Production policy: only CLEAN is acceptable.
 */
export function fileStatusForScan(outcome: ScanOutcome): string {
  return outcome;
}

/**
 * A file may be accepted into the document store only when its scan status is CLEAN.
 */
export function isAcceptableFileStatus(status: string): boolean {
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
export function shouldRejectScan(result: ScanResult): boolean {
  return result.outcome !== 'CLEAN';
}

/**
 * Deterministic mock scanner for development and testing.
 * Returns CLEAN for files that pass basic heuristics, SCAN_FAILED for others.
 * This is NOT safe for production — use only in test environments.
 */
export class DevMockScanner implements MalwareScanner {
  readonly provider = 'DEV_MOCK';

  async scan(input: ScanInput): Promise<ScanResult> {
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


