/**
 * P0 — Malware scan gate contract tests.
 *
 * Proves the canonical security-scan primitive and the durable status
 * transition are fail-closed:
 *   - securityScanBlock only passes an explicit CLEAN; every other status
 *     (PENDING_SCAN, SCAN_FAILED, INFECTED, unknown/missing) is blocked.
 *   - scanDocumentVersionInBackground only persists CLEAN on a real CLEAN
 *     verdict, INFECTED on infected, and SCAN_FAILED otherwise (never a
 *     fabricated CLEAN).
 */

import { securityScanBlock, scanDocumentVersionInBackground } from '../src/modules/documents/securityScan.service';
import { setScanner } from '../src/modules/upload-security/scannerAdapter';
import type { MalwareScanner } from '../src/modules/upload-security/scannerAdapter';

const mockPrismaUpdate = jest.fn();
jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    documentVersion: { update: (...args: unknown[]) => mockPrismaUpdate(...args) },
  },
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

describe('scanDocumentVersionInBackground — durable status transition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaUpdate.mockResolvedValue({});
    mockResume.mockResolvedValue(0);
  });

  afterEach(() => {
    setScanner(null);
  });

  it('CLEAN verdict → persists CLEAN and resumes blocked analysis', async () => {
    setScanner(scannerReturning('CLEAN'));
    await scanDocumentVersionInBackground('v1', Buffer.from('clean'));
    expect(mockPrismaUpdate).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { securityScanStatus: 'CLEAN' } });
    expect(mockResume).toHaveBeenCalledWith('v1');
  });

  it('INFECTED verdict → persists INFECTED (never CLEAN)', async () => {
    setScanner(scannerReturning('INFECTED'));
    await scanDocumentVersionInBackground('v1', Buffer.from('infected'));
    expect(mockPrismaUpdate).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { securityScanStatus: 'INFECTED' } });
    expect(mockResume).not.toHaveBeenCalled();
  });

  it('SCAN_FAILED verdict → persists SCAN_FAILED (never CLEAN)', async () => {
    setScanner(scannerReturning('SCAN_FAILED'));
    await scanDocumentVersionInBackground('v1', Buffer.from('fail'));
    expect(mockPrismaUpdate).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { securityScanStatus: 'SCAN_FAILED' } });
    expect(mockResume).not.toHaveBeenCalled();
  });

  it('scanner throws → persists SCAN_FAILED (never CLEAN)', async () => {
    setScanner({ provider: 'FAKE', scan: async () => { throw new Error('boom'); } });
    await scanDocumentVersionInBackground('v1', Buffer.from('boom'));
    expect(mockPrismaUpdate).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { securityScanStatus: 'SCAN_FAILED' } });
    expect(mockResume).not.toHaveBeenCalled();
  });
});
