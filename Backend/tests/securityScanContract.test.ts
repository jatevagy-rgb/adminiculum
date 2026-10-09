/**
 * P0 — Malware scan gate contract tests.
 *
 * Proves the canonical security-scan primitive and the durable status
 * transition are fail-closed:
 *   - securityScanBlock only passes an explicit CLEAN; every other status
 *     (PENDING_SCAN, SCAN_FAILED, INFECTED, unknown/missing) is blocked.
 *   - scanDocumentVersionInBackground only persists a terminal verdict by
 *     transitioning FROM PENDING_SCAN, so a late/duplicate/concurrent scan can
 *     never overwrite an already-terminal verdict (most critically a late CLEAN
 *     can never downgrade a persisted INFECTED).
 */

import {
  securityScanBlock,
  scanDocumentVersionInBackground,
  retryDocumentVersionScan,
} from '../src/modules/documents/securityScan.service';
import { setScanner } from '../src/modules/upload-security/scannerAdapter';
import type { MalwareScanner } from '../src/modules/upload-security/scannerAdapter';

const mockPrismaUpdateMany = jest.fn();
const mockPrismaFindUnique = jest.fn();
const mockDownload = jest.fn();

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    documentVersion: {
      updateMany: (...args: unknown[]) => mockPrismaUpdateMany(...args),
      findUnique: (...args: unknown[]) => mockPrismaFindUnique(...args),
    },
  },
}));

jest.mock('../src/modules/sharepoint/driveService', () => ({
  __esModule: true,
  default: { downloadDocument: (...args: unknown[]) => mockDownload(...args) },
}));

const mockResume = jest.fn();
jest.mock('../src/modules/compliance-doc-intelligence/analysisJobService', () => ({
  resumeAnalysisJobsBlockedByScan: (...args: unknown[]) => mockResume(...args),
}));

function scannerReturning(outcome: 'CLEAN' | 'INFECTED' | 'SCAN_FAILED'): MalwareScanner {
  return {
    provider: 'FAKE',
    scan: async () => ({ outcome, provider: 'FAKE', codeSafe: `FAKE_${outcome}` }),
  };
}

describe('securityScanBlock — canonical fail-closed primitive', () => {
  it.each([
    'PENDING_SCAN',
    'SCAN_FAILED',
    'INFECTED',
    'UNKNOWN',
    null,
    undefined,
  ] as const)('blocks non-CLEAN / missing status (%s)', (status) => {
    const blocked = securityScanBlock(status as never);
    expect(blocked).toMatchObject({ code: 'DOCUMENT_SECURITY_SCAN_BLOCKED', status: 409 });
  });

  it('passes only an explicit CLEAN', () => {
    expect(securityScanBlock('CLEAN')).toBeNull();
  });
});

describe('scanDocumentVersionInBackground — conditional terminal transition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaUpdateMany.mockResolvedValue({ count: 1 });
    mockResume.mockResolvedValue(0);
  });

  afterEach(() => {
    setScanner(null);
  });

  const pendingWhere = (status: string) => ({
    where: { id: 'v1', securityScanStatus: 'PENDING_SCAN' },
    data: { securityScanStatus: status },
  });

  it('CLEAN verdict → transitions PENDING to CLEAN and resumes blocked analysis', async () => {
    setScanner(scannerReturning('CLEAN'));
    await scanDocumentVersionInBackground('v1', Buffer.from('clean'));
    expect(mockPrismaUpdateMany).toHaveBeenCalledWith(pendingWhere('CLEAN'));
    expect(mockResume).toHaveBeenCalledWith('v1');
  });

  it('INFECTED verdict → transitions PENDING to INFECTED (never CLEAN)', async () => {
    setScanner(scannerReturning('INFECTED'));
    await scanDocumentVersionInBackground('v1', Buffer.from('infected'));
    expect(mockPrismaUpdateMany).toHaveBeenCalledWith(pendingWhere('INFECTED'));
    expect(mockResume).not.toHaveBeenCalled();
  });

  it('SCAN_FAILED verdict → transitions PENDING to SCAN_FAILED (never CLEAN)', async () => {
    setScanner(scannerReturning('SCAN_FAILED'));
    await scanDocumentVersionInBackground('v1', Buffer.from('fail'));
    expect(mockPrismaUpdateMany).toHaveBeenCalledWith(pendingWhere('SCAN_FAILED'));
    expect(mockResume).not.toHaveBeenCalled();
  });

  it('scanner throws → transitions PENDING to SCAN_FAILED (never CLEAN)', async () => {
    setScanner({ provider: 'FAKE', scan: async () => { throw new Error('boom'); } });
    await scanDocumentVersionInBackground('v1', Buffer.from('boom'));
    expect(mockPrismaUpdateMany).toHaveBeenCalledWith(pendingWhere('SCAN_FAILED'));
    expect(mockResume).not.toHaveBeenCalled();
  });

  it('a no-op transition (already terminal) does not resume analysis even on a CLEAN verdict', async () => {
    mockPrismaUpdateMany.mockResolvedValue({ count: 0 });
    setScanner(scannerReturning('CLEAN'));
    await scanDocumentVersionInBackground('v1', Buffer.from('clean'));
    expect(mockResume).not.toHaveBeenCalled();
  });
});

describe('retryDocumentVersionScan — P1 recovery path', () => {
  const stored = {
    id: 'v1',
    originalFileName: 'gated.txt',
    mimeType: 'text/plain',
    storageReference: 'sp-v1',
    securityScanStatus: 'SCAN_FAILED',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaUpdateMany.mockResolvedValue({ count: 1 });
    mockPrismaFindUnique.mockResolvedValue({ ...stored });
    mockDownload.mockResolvedValue(Buffer.from('SecretClient ScanGate file text'));
    mockResume.mockResolvedValue(0);
  });

  afterEach(() => {
    setScanner(null);
  });

  it('recovers a stale PENDING_SCAN (process interruption) by rescanning exact stored bytes', async () => {
    mockPrismaFindUnique.mockResolvedValue({ ...stored, securityScanStatus: 'PENDING_SCAN' });
    const ok = await retryDocumentVersionScan('v1');
    expect(ok).toBe(true);
    expect(mockDownload).toHaveBeenCalledWith('sp-v1');
    expect(mockPrismaUpdateMany).toHaveBeenCalledWith({
      where: { id: 'v1', securityScanStatus: { in: ['SCAN_FAILED', 'PENDING_SCAN'] } },
      data: { securityScanStatus: 'PENDING_SCAN' },
    });
  });

  it('still recovers SCAN_FAILED (existing retry preserved)', async () => {
    const ok = await retryDocumentVersionScan('v1');
    expect(ok).toBe(true);
    expect(mockDownload).toHaveBeenCalledWith('sp-v1');
  });

  it('refuses to recover a trustworthy INFECTED verdict', async () => {
    mockPrismaFindUnique.mockResolvedValue({ ...stored, securityScanStatus: 'INFECTED' });
    const ok = await retryDocumentVersionScan('v1');
    expect(ok).toBe(false);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('refuses to recover a trustworthy CLEAN verdict', async () => {
    mockPrismaFindUnique.mockResolvedValue({ ...stored, securityScanStatus: 'CLEAN' });
    const ok = await retryDocumentVersionScan('v1');
    expect(ok).toBe(false);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('refuses to reset PENDING when a concurrent scan already established a terminal verdict', async () => {
    mockPrismaUpdateMany.mockResolvedValue({ count: 0 });
    const ok = await retryDocumentVersionScan('v1');
    expect(ok).toBe(false);
  });

  it('fails closed when the stored bytes cannot be downloaded', async () => {
    mockDownload.mockResolvedValue(null);
    const ok = await retryDocumentVersionScan('v1');
    expect(ok).toBe(false);
    expect(mockPrismaUpdateMany).not.toHaveBeenCalled();
  });
});
