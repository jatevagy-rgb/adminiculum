/**
 * Provider-independent malware-scanner adapter for client uploads.
 *
 * SAFETY INVARIANT: with no real scanner configured, a file can NEVER become
 * CLEAN. The unconfigured scanner returns SCAN_FAILED (code SCANNER_NOT_CONFIGURED)
 * so acceptance stays blocked. Real providers (e.g. ClamAV, Defender) implement
 * MalwareScanner and are selected from configuration later.
 */

export type ScanOutcome = 'CLEAN' | 'INFECTED' | 'UNSUPPORTED' | 'SCAN_FAILED';

export interface ScanInput {
  buffer?: Buffer;
  storageReference?: string;
  sizeBytes: number;
  detectedMimeType?: string | null;
}

export interface ScanResult {
  outcome: ScanOutcome;
  provider: string;
  /** bounded, non-sensitive code — never a raw provider body */
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
 * Resolve the active scanner from configuration. Currently only the safe
 * unconfigured scanner exists; add provider selection here (e.g. from
 * CLIENT_PORTAL_MALWARE_SCANNER / *_URL) when a real scanner is provisioned.
 */
export function getScanner(_env: NodeJS.ProcessEnv = process.env): MalwareScanner {
  if (!cached) cached = new UnconfiguredScanner();
  return cached;
}

/** Test seam / provider wiring point. */
export function setScanner(scanner: MalwareScanner | null): void {
  cached = scanner;
}

export function scannerConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return getScanner(env).provider !== 'NONE';
}

/** Map a scan outcome to the persisted ClientSubmissionFile status. */
export function fileStatusForScan(outcome: ScanOutcome): 'CLEAN' | 'INFECTED' | 'UNSUPPORTED' | 'SCAN_FAILED' {
  return outcome;
}

/** A file may be accepted into a matter only when its scan status is CLEAN. */
export function isAcceptableFileStatus(status: string): boolean {
  return status === 'CLEAN';
}
