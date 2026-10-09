/**
 * Deterministic test that the anonymization source read reuses the SAME
 * canonical immutable-version source as the Document Reader.
 *
 * Reproduction of the B1 divergence: a document whose current DocumentVersion
 * carries its own storage reference but whose legacy document-level `spItemId`
 * is null. The reader (`GET /documents/:id/text`) resolves the version's own
 * storage and returns text; the old anonymize source read checked only
 * `document.spItemId` and reported "text unavailable". `resolveAnonymizeSourceText`
 * must now agree with the reader for exactly this fixture.
 *
 * All fixtures are synthetic plain text. No real documents or personal data.
 */
import { resolveAnonymizeSourceText } from '../src/modules/anonymize/sourceText';
import {
  planDocumentTextSources,
  readVersionContentText,
  versionStorageReference,
} from '../src/modules/documents/versionContent.service';

const DOCX_VERSION = {
  id: 'v1',
  documentId: 'd1',
  originalFileName: 'szerzodes.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  size: 1234,
  securityScanStatus: 'CLEAN' as const,
  storageReference: 'sp-v1',
  spItemId: null,
};

const TXT_VERSION = {
  id: 'v1',
  documentId: 'd1',
  originalFileName: 'szerzodes.txt',
  mimeType: 'text/plain',
  size: 64,
  securityScanStatus: 'CLEAN' as const,
  storageReference: 'sp-v1',
  spItemId: null,
};

describe('resolveAnonymizeSourceText — canonical source reuse', () => {
  it('resolves text from the current version storage when the document pointer is null', async () => {
    const download = async (storageId: string) =>
      storageId === 'sp-v1' ? Buffer.from('Szerződés Kovács Péter és Nagy Anna között.', 'utf-8') : null;

    const resolution = await resolveAnonymizeSourceText(
      { spItemId: null, mimeType: TXT_VERSION.mimeType, fileName: TXT_VERSION.originalFileName, currentVersion: TXT_VERSION },
      download,
    );

    expect(resolution.available).toBe(true);
    expect(resolution.scanBlocked).toBe(false);
    expect(resolution.text).toContain('Kovács Péter');
  });

  it('agrees with the Document Reader canonical source for the same version', async () => {
    const download = async (storageId: string) =>
      storageId === 'sp-v1' ? Buffer.from('Kovács Péter ügyfél szerződése.', 'utf-8') : null;

    const reader = await readVersionContentText(TXT_VERSION, download);
    const anonymize = await resolveAnonymizeSourceText(
      { spItemId: null, mimeType: TXT_VERSION.mimeType, fileName: TXT_VERSION.originalFileName, currentVersion: TXT_VERSION },
      download,
    );

    expect(reader.available).toBe(true);
    expect(anonymize.available).toBe(true);
    expect(anonymize.text).toBe(reader.text);
  });

  it('plans the version storage as authoritative even when the document pointer is null', () => {
    // The reader's own source plan (this is what GET /documents/:id/text uses).
    const attempts = planDocumentTextSources({
      currentVersion: TXT_VERSION,
      documentStorageId: null,
    });
    expect(attempts[0].source).toBe('VERSION');
    expect(attempts[0].storageId).toBe('sp-v1');
    // The legacy document pointer is genuinely absent, so a pointer-only read
    // (the old anonymize logic) had nothing to read.
    expect(versionStorageReference(TXT_VERSION)).toBe('sp-v1');
  });

  it('reports SOURCE_NOT_AVAILABLE (typed, not a generic message) when no storage exists anywhere', async () => {
    const resolution = await resolveAnonymizeSourceText(
      {
        spItemId: null,
        mimeType: 'text/plain',
        fileName: 'a.txt',
        currentVersion: { ...TXT_VERSION, storageReference: null, spItemId: null },
      },
      async () => null,
    );

    expect(resolution.available).toBe(false);
    expect(resolution.scanBlocked).toBe(false);
    expect(resolution.code).toBe('SOURCE_NOT_AVAILABLE');
    expect(resolution.limitationMessage).toBeTruthy();
  });

  it('returns the security-scan block code before any download', async () => {
    let downloads = 0;
    const resolution = await resolveAnonymizeSourceText(
      {
        spItemId: 'sp',
        mimeType: TXT_VERSION.mimeType,
        fileName: TXT_VERSION.originalFileName,
        currentVersion: { ...TXT_VERSION, securityScanStatus: 'SCAN_FAILED' },
      },
      async () => {
        downloads += 1;
        return Buffer.from('secret');
      },
    );

    expect(resolution.scanBlocked).toBe(true);
    expect(resolution.code).toBe('SECURITY_SCAN_BLOCKED');
    expect(downloads).toBe(0);
  });

  it('blocks anonymization (fail-closed) when there is no current version to carry a scan verdict', async () => {
    // P0: a legacy document with only a document-level pointer has no immutable
    // version and therefore no trustworthy securityScanStatus. Missing/unknown
    // status must remain blocked, never default to CLEAN.
    const download = jest.fn(async (storageId: string) => (storageId === 'sp-legacy' ? Buffer.from('Legacy content', 'utf-8') : null));
    const resolution = await resolveAnonymizeSourceText(
      { spItemId: 'sp-legacy', mimeType: 'text/plain', fileName: 'legacy.txt', currentVersion: null },
      download,
    );

    expect(resolution.available).toBe(false);
    expect(resolution.scanBlocked).toBe(true);
    expect(resolution.code).toBe('SECURITY_SCAN_BLOCKED');
    expect(download).not.toHaveBeenCalled();
  });

  it('fails closed when current storage fails even if old document bytes are readable', async () => {
    const download = jest.fn(async (id: string) => id === 'legacy-old' ? Buffer.from('OLD CONTENT') : null);
    const result = await resolveAnonymizeSourceText({ documentId: 'd1', currentVersion: TXT_VERSION, spItemId: 'legacy-old' }, download);
    expect(result).toMatchObject({ available: false, text: null, code: 'SOURCE_NOT_AVAILABLE' });
    expect(download.mock.calls).toEqual([['sp-v1']]);
  });

  it('rejects a wrong-parent version and never downloads its bytes', async () => {
    const download = jest.fn();
    expect(await resolveAnonymizeSourceText({ documentId: 'other', currentVersion: TXT_VERSION, spItemId: 'legacy' }, download))
      .toMatchObject({ available: false, code: 'SOURCE_NOT_AVAILABLE' });
    expect(download).not.toHaveBeenCalled();
  });
});
