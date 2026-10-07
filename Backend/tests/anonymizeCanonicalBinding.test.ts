const mockDb: any = {
  document: { findUnique: jest.fn() },
  contractGeneration: { findUnique: jest.fn() },
  anonymousDocument: { create: jest.fn() },
  timelineEvent: { create: jest.fn() },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(async (callback) => callback(mockDb)),
};
const mockDownload = jest.fn();
jest.mock('../src/config/database', () => ({ __esModule: true, default: mockDb }));
jest.mock('../src/modules/sharepoint/driveService', () => ({ __esModule: true, default: { downloadDocument: (...args: any[]) => mockDownload(...args) } }));
import { anonymizeDocument } from '../src/modules/anonymize/services';
import { rehydrateDocument } from '../src/modules/anonymize/rehydration';

const version = { id: 'v2', documentId: 'document', version: 2, securityScanStatus: 'CLEAN', originalFileName: 'source.txt', mimeType: 'text/plain', size: 60, storageReference: 'current-blob', spItemId: null };
const document = { id: 'document', caseId: 'case', clientId: 'client', name: 'Source', spItemId: 'old-blob', mimeType: 'text/plain', versions: [version], case: { clientName: '', client: { name: 'Synthetic Client' } } };
const params = { documentId: 'document', userId: 'worker', metadata: { knownParties: [
  { name: 'Alpha Person', legalRole: 'CLIENT' }, { name: 'Beta Person', legalRole: 'CLIENT' },
] } };

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.document.findUnique.mockResolvedValue(document);
  mockDb.anonymousDocument.create.mockImplementation(async ({ data }: any) => ({ id: 'artifact', ...data }));
  mockDb.timelineEvent.create.mockResolvedValue({ id: 'event' });
  mockDownload.mockResolvedValue(Buffer.from('Alpha Person + Beta Person.'));
});

test.each(['INFECTED', 'PENDING_SCAN', 'SCAN_FAILED'])('%s plus arbitrary caller text cannot write any artifact', async (status) => {
  mockDb.document.findUnique.mockResolvedValue({ ...document, versions: [{ ...version, securityScanStatus: status }] });
  const result = await anonymizeDocument({ ...params, sourceText: 'Forged caller text' });
  expect(result).toMatchObject({ success: false, code: 'SECURITY_SCAN_BLOCKED' });
  expect(mockDownload).not.toHaveBeenCalled();
  expect(mockDb.anonymousDocument.create).not.toHaveBeenCalled();
  expect(mockDb.timelineEvent.create).not.toHaveBeenCalled();
});

test('even a clean version cannot be replaced by caller text', async () => {
  expect(await anonymizeDocument({ ...params, sourceText: 'Forged' })).toMatchObject({ success: false, code: 'SOURCE_NOT_AVAILABLE' });
  expect(mockDb.anonymousDocument.create).not.toHaveBeenCalled();
});

test('generation uses current bytes, distinct tokens and records exact source identity', async () => {
  const result = await anonymizeDocument(params);
  expect(result.success).toBe(true);
  expect(mockDownload.mock.calls).toEqual([['current-blob']]);
  expect(result.redactedText).toBe('[ÜGYFÉL_1] + [ÜGYFÉL_2].');
  expect(rehydrateDocument(result.redactedText!, result.redactedItems!).rehydratedContent).toBe('Alpha Person + Beta Person.');
  expect(mockDb.timelineEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ payload: expect.objectContaining({ sourceVersionId: 'v2', sourceKind: 'DOCUMENT_VERSION' }) }) }));
});

test('current download failure never falls back to an older readable blob', async () => {
  mockDownload.mockImplementation(async (id) => id === 'old-blob' ? Buffer.from('Old content') : null);
  expect(await anonymizeDocument(params)).toMatchObject({ success: false, code: 'SOURCE_NOT_AVAILABLE' });
  expect(mockDownload.mock.calls).toEqual([['current-blob']]);
  expect(mockDb.anonymousDocument.create).not.toHaveBeenCalled();
});

test.each(['version', 'scan', 'parent'])('a changed %s identity before persistence rejects artifact creation', async (change) => {
  const freshVersion = change === 'version' ? { ...version, id: 'v3' } : change === 'scan' ? { ...version, securityScanStatus: 'INFECTED' } : { ...version, documentId: 'other' };
  mockDb.document.findUnique.mockResolvedValueOnce(document).mockResolvedValueOnce({ ...document, versions: [freshVersion] });
  expect(await anonymizeDocument(params)).toMatchObject({ success: false });
  expect(mockDb.anonymousDocument.create).not.toHaveBeenCalled();
  expect(mockDb.timelineEvent.create).not.toHaveBeenCalled();
});

test('processing exceptions are converted to safe typed errors', async () => {
  mockDb.document.findUnique.mockRejectedValueOnce(new Error('Secret provider connection text'));
  const result = await anonymizeDocument(params);
  expect(result).toMatchObject({ success: false, code: 'PROCESSING_FAILURE' });
  expect(JSON.stringify(result)).not.toContain('Secret');
});
