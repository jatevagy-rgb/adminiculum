/**
 * Version-bound document content pipeline — targeted repair coverage
 * (DOCUMENT-CONTENT-PIPELINE-1).
 *
 * Proves the pipeline behind the three connected UAT symptoms:
 *   1. "A kinyert szöveg nem érhető el" — the document reader must resolve text
 *      from the exact current DocumentVersion storage, not only from a
 *      document-level SharePoint pointer.
 *   2. "nem összehasonlítható" — two real DOCX versions with available bytes are
 *      comparable; unsupported/unavailable sources fail with a truthful reason
 *      rather than being pre-judged from incidental metadata.
 *   3. Text-range annotations — exact immutable version text, when available,
 *      yields a version-true TEXT_RANGE anchor (offsets + fingerprint).
 *
 * Fixture documents are generated through the existing `docx` test utility used
 * across the comparison suite, with the mandated V1/V2 contract sentences.
 */
import { Document, Packer, Paragraph, TextRun } from 'docx';

import {
  readVersionContentText,
  planDocumentTextSources,
  versionStorageReference,
  versionContentReasonMessage,
  type VersionContentDescriptor,
} from '../src/modules/documents/versionContent.service';
import { compareVersions } from '../src/modules/documents/comparison/diffEngine';
import { resolveVersionText, EXTRACTION_REVISION } from '../src/modules/documents/comparison/versionText';
import { createOrGetComparison } from '../src/modules/documents/comparison/comparisonService';
import { mapDocumentVersion } from '../src/modules/documents/services';
// The annotation anchor builder is the exact module the workspace uses, so this
// proves the real client-side anchor contract (imported the same way as
// annotationCapabilities.behaviour.test.ts).
import { buildTextAnchor, normalizeSelectedText } from '../../Frontend/src/lib/annotations/annotationAnchors';
import { TEXT_RENDERER_VERSION } from '../../Frontend/src/lib/annotations/annotationCapabilities';

const V1_TEXT = 'A szolgáltató felelőssége korlátlan.';
const V2_TEXT = 'A szolgáltató teljes felelőssége a nettó éves díj összegére korlátozott.';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function makeDocxBuffer(paragraphs: string[]): Promise<Buffer> {
  const doc = new Document({
    sections: [{ children: paragraphs.map((p) => new Paragraph({ children: [new TextRun(p)] })) }],
  });
  return Packer.toBuffer(doc);
}

function descriptor(overrides: Partial<VersionContentDescriptor> & { id: string }): VersionContentDescriptor {
  return {
    documentId: 'doc-1',
    originalFileName: `${overrides.id}.docx`,
    mimeType: DOCX_MIME,
    size: 1000,
    securityScanStatus: 'CLEAN',
    storageReference: `${overrides.id}-storage`,
    spItemId: `${overrides.id}-storage`,
    ...overrides,
  };
}

describe('canonical version-bound text (exact immutable version)', () => {
  let v1Buffer: Buffer;
  let v2Buffer: Buffer;

  beforeAll(async () => {
    v1Buffer = await makeDocxBuffer([V1_TEXT]);
    v2Buffer = await makeDocxBuffer([V2_TEXT]);
  });

  it('extracts the exact text of V1 and V2 and proves them different', async () => {
    const bytesByStorage: Record<string, Buffer> = { 'v1-storage': v1Buffer, 'v2-storage': v2Buffer };
    const download = async (storageId: string) => bytesByStorage[storageId] ?? null;

    const v1 = await readVersionContentText(descriptor({ id: 'v1' }), download);
    const v2 = await readVersionContentText(descriptor({ id: 'v2' }), download);

    expect(v1.available).toBe(true);
    expect(v2.available).toBe(true);
    expect(v1.text?.trim()).toBe(V1_TEXT);
    expect(v2.text?.trim()).toBe(V2_TEXT);
    expect(v1.text).not.toBe(v2.text);
  });

  it('reads only the selected version bytes and never the latest/current version', async () => {
    // The download function maps storage -> bytes; a non-current version must
    // resolve from its own storage reference only.
    const bytesByStorage: Record<string, Buffer> = { 'v1-storage': v1Buffer, 'v2-storage': v2Buffer };
    const download = jest.fn(async (storageId: string) => bytesByStorage[storageId] ?? null);

    const v1 = await readVersionContentText(
      // A historical (non-current) version: nothing in this call knows or cares
      // which version is current, so it cannot fall back to the latest one.
      descriptor({ id: 'v1' }),
      download,
    );

    expect(v1.text?.trim()).toBe(V1_TEXT);
    expect(v1.text).not.toContain('korlátozott');
    expect(download).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledWith('v1-storage');
    expect(download).not.toHaveBeenCalledWith('v2-storage');
  });

  it('prefers spItemId then storageReference and reports no reference when both are blank', () => {
    expect(versionStorageReference({ spItemId: 'sp', storageReference: 'store' })).toBe('sp');
    expect(versionStorageReference({ spItemId: null, storageReference: 'store' })).toBe('store');
    expect(versionStorageReference({ spItemId: '   ', storageReference: 'store' })).toBe('store');
    expect(versionStorageReference({ spItemId: null, storageReference: null })).toBeNull();
    expect(versionStorageReference({ spItemId: '', storageReference: '' })).toBeNull();
  });

  it('uses the version own mime/filename even when the document-level metadata is generic', async () => {
    const download = async () => v1Buffer;
    // A DOCX uploaded with a generic declared MIME: the filename extension must
    // still make it extractable, and the bytes are this version's own.
    const result = await readVersionContentText(
      descriptor({ id: 'v1', mimeType: 'application/octet-stream', originalFileName: 'Munkaszerződés.docx' }),
      download,
    );
    expect(result.available).toBe(true);
    expect(result.text).toContain('korlátlan');
  });
});

describe('truthful unavailability (no fabrication, no substitution)', () => {
  it('reports FORMAT_NOT_TEXT_EXTRACTABLE for legacy .doc without downloading', async () => {
    const download = jest.fn();
    const result = await readVersionContentText(
      descriptor({ id: 'v1', mimeType: 'application/msword', originalFileName: 'legacy.doc' }),
      download,
    );
    expect(result.available).toBe(false);
    expect(result.reasonCode).toBe('FORMAT_NOT_TEXT_EXTRACTABLE');
    expect(result.text).toBeNull();
    expect(download).not.toHaveBeenCalled();
  });

  it('reports NO_VERSION_STORAGE_REFERENCE instead of substituting other text', async () => {
    const download = jest.fn();
    const result = await readVersionContentText(
      descriptor({ id: 'demo-v1', spItemId: null, storageReference: null }),
      download,
    );
    expect(result.available).toBe(false);
    expect(result.reasonCode).toBe('NO_VERSION_STORAGE_REFERENCE');
    expect(result.text).toBeNull();
    expect(result.unavailableReason).toBe(versionContentReasonMessage('NO_VERSION_STORAGE_REFERENCE'));
    expect(download).not.toHaveBeenCalled();
  });

  it('reports CONTENT_UNAVAILABLE when the exact version bytes cannot be served', async () => {
    const result = await readVersionContentText(descriptor({ id: 'v1' }), async () => null);
    expect(result.available).toBe(false);
    expect(result.reasonCode).toBe('CONTENT_UNAVAILABLE');
  });

  it('never leaks a provider error when the download throws', async () => {
    const result = await readVersionContentText(descriptor({ id: 'v1' }), async () => {
      throw new Error('Graph 503 https://internal.sp.local/secret');
    });
    expect(result.available).toBe(false);
    expect(result.reasonCode).toBe('CONTENT_UNAVAILABLE');
    expect(JSON.stringify(result)).not.toMatch(/https|secret|graph/i);
  });

  it('reports NO_EXTRACTABLE_TEXT for an empty DOCX', async () => {
    const emptyDocx = await makeDocxBuffer([]);
    const result = await readVersionContentText(descriptor({ id: 'empty' }), async () => emptyDocx);
    expect(result.available).toBe(false);
    expect(result.reasonCode).toBe('NO_EXTRACTABLE_TEXT');
  });

  it('reports EXTRACTION_FAILED for a corrupt DOCX', async () => {
    const corrupt = Buffer.from('PK\x03\x04 not really a docx');
    const result = await readVersionContentText(descriptor({ id: 'corrupt' }), async () => corrupt);
    expect(result.available).toBe(false);
    expect(result.reasonCode).toBe('EXTRACTION_FAILED');
  });
});

describe('document reader source planning (symptom 1)', () => {
  it('uses the current immutable version storage when the document pointer is missing', () => {
    const attempts = planDocumentTextSources({
      currentVersion: { spItemId: 'ver-store', storageReference: null },
      documentStorageId: null,
    });
    expect(attempts).toEqual([{ source: 'VERSION', storageId: 'ver-store' }]);
  });

  it('falls back to the legacy document pointer only when no version storage exists', () => {
    expect(planDocumentTextSources({
      currentVersion: { spItemId: null, storageReference: null },
      documentStorageId: 'doc-store',
    })).toEqual([{ source: 'DOCUMENT', storageId: 'doc-store' }]);

    expect(planDocumentTextSources({ currentVersion: null, documentStorageId: 'doc-store' }))
      .toEqual([{ source: 'DOCUMENT', storageId: 'doc-store' }]);
  });

  it('does not duplicate an identical version/document storage reference', () => {
    expect(planDocumentTextSources({
      currentVersion: { spItemId: 'same-store', storageReference: null },
      documentStorageId: 'same-store',
    })).toEqual([{ source: 'VERSION', storageId: 'same-store' }]);
  });

  it('orders version-first, then a distinct document pointer', () => {
    expect(planDocumentTextSources({
      currentVersion: { spItemId: 'ver-store', storageReference: null },
      documentStorageId: 'doc-store',
    })).toEqual([
      { source: 'VERSION', storageId: 'ver-store' },
      { source: 'DOCUMENT', storageId: 'doc-store' },
    ]);
  });

  it('plans no source for a genuinely metadata-only document', () => {
    expect(planDocumentTextSources({
      currentVersion: { spItemId: null, storageReference: null },
      documentStorageId: null,
    })).toEqual([]);
    expect(planDocumentTextSources({ currentVersion: null, documentStorageId: '   ' })).toEqual([]);
  });
});

describe('comparison over exact version text (symptom 2)', () => {
  let v1Buffer: Buffer;
  let v2Buffer: Buffer;

  beforeAll(async () => {
    v1Buffer = await makeDocxBuffer([V1_TEXT]);
    v2Buffer = await makeDocxBuffer([V2_TEXT]);
  });

  it('produces READY with a REPLACE segment carrying the exact excerpts', async () => {
    const bytesByStorage: Record<string, Buffer> = { 'v1-storage': v1Buffer, 'v2-storage': v2Buffer };
    const download = async (storageId: string) => bytesByStorage[storageId] ?? null;
    const v1 = await readVersionContentText(descriptor({ id: 'v1' }), download);
    const v2 = await readVersionContentText(descriptor({ id: 'v2' }), download);

    const diff = compareVersions({
      baseText: v1.text,
      targetText: v2.text,
      baseSupported: v1.available,
      targetSupported: v2.available,
      baseReasonCode: v1.reasonCode,
      targetReasonCode: v2.reasonCode,
    });

    expect(diff.status).toBe('READY');
    expect(diff.summary.replaces).toBe(1);
    expect(diff.segments[0].changeType).toBe('REPLACE');
    expect(diff.segments[0].baseExcerpt).toContain('korlátlan');
    expect(diff.segments[0].targetExcerpt).toContain('korlátozott');
  });

  it('is UNSUPPORTED with a truthful reason when one version has no usable text', () => {
    const diff = compareVersions({
      baseText: null,
      targetText: V2_TEXT,
      baseSupported: false,
      targetSupported: true,
      baseReasonCode: 'NO_VERSION_STORAGE_REFERENCE',
      targetReasonCode: null,
    });
    expect(diff.status).toBe('UNSUPPORTED');
    expect(diff.failureCode).toBe('NO_VERSION_STORAGE_REFERENCE');
    expect(diff.segments).toHaveLength(0);
  });

  it('is IDENTICAL (not an error) when both versions carry the same text', async () => {
    const docx = await makeDocxBuffer([V1_TEXT]);
    const download = async () => docx;
    const base = await readVersionContentText(descriptor({ id: 'v1' }), download);
    const target = await readVersionContentText(descriptor({ id: 'v2' }), download);
    const diff = compareVersions({
      baseText: base.text,
      targetText: target.text,
      baseSupported: base.available,
      targetSupported: target.available,
    });
    expect(diff.status).toBe('IDENTICAL');
    expect(diff.segments).toHaveLength(0);
  });

  it('persists a REPLACE segment through the comparison lifecycle without a latest-version fallback', async () => {
    const store: any = { comparison: null, segments: [] };
    const prisma: any = {
      documentVersion: {
        findMany: jest.fn(async () => [
          { id: 'v1', documentId: 'doc-1', version: 1, mimeType: DOCX_MIME, originalFileName: 'contract-v1.docx', size: v1Buffer.length },
          { id: 'v2', documentId: 'doc-1', version: 2, mimeType: DOCX_MIME, originalFileName: 'contract-v2.docx', size: v2Buffer.length },
        ]),
      },
      documentComparison: {
        findUnique: jest.fn(async () => store.comparison),
        create: jest.fn(async ({ data }: any) => { store.comparison = { id: 'cmp-1', ...data }; return store.comparison; }),
        update: jest.fn(async ({ data }: any) => { store.comparison = { ...store.comparison, ...data }; return store.comparison; }),
      },
      documentChangeSegment: {
        deleteMany: jest.fn(async () => { store.segments = []; }),
        createMany: jest.fn(async ({ data }: any) => { store.segments = data; return { count: data.length }; }),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    const bytesByVersion: Record<string, Buffer> = { v1: v1Buffer, v2: v2Buffer };

    const row = await createOrGetComparison(
      { actorId: 'u1', documentId: 'doc-1', baseVersionId: 'v1', targetVersionId: 'v2' },
      {
        prisma,
        resolveText: async (version) => {
          const resolved = await readVersionContentText(
            {
              id: version.id,
              documentId: version.documentId,
              originalFileName: version.originalFileName,
              mimeType: version.mimeType,
              size: version.size,
              spItemId: `${version.id}-storage`,
              storageReference: `${version.id}-storage`,
            },
            async (storageId) => bytesByVersion[storageId.replace('-storage', '')] ?? null,
          );
          return {
            supported: resolved.available,
            text: resolved.text,
            reasonCode: resolved.reasonCode,
            extractionRevision: EXTRACTION_REVISION,
          };
        },
      },
    );

    expect(row.status).toBe('READY');
    expect(row.replaceCount).toBe(1);
    expect(row.totalSegmentCount).toBe(1);
    expect(store.segments).toHaveLength(1);
    expect(store.segments[0].changeType).toBe('REPLACE');
    // Exact V1 text was used for the base side — not the current/latest V2 text.
    expect(store.segments[0].baseExcerpt).toContain('korlátlan');
    expect(store.segments[0].targetExcerpt).toContain('korlátozott');
  });
});

describe('comparison-path resolver still uses the exact version download', () => {
  it('resolveVersionText receives bytes for the requested version id only', async () => {
    const download = jest.fn(async (_documentId: string, versionId: string) => (
      versionId === 'v1' ? Buffer.from('első verzió szövege', 'utf8') : Buffer.from('második verzió szövege', 'utf8')
    ));
    const result = await resolveVersionText(
      { id: 'v1', documentId: 'doc-1', mimeType: 'text/plain', originalFileName: 'v1.txt', size: 100 },
      download,
    );
    expect(result.supported).toBe(true);
    expect(result.text).toContain('első verzió');
    expect(result.text).not.toContain('második');
    expect(download).toHaveBeenCalledWith('doc-1', 'v1');
  });
});

describe('version DTO exposes format-level comparability truth', () => {
  const row = (over: Record<string, unknown>) => mapDocumentVersion({
    id: 'v1',
    documentId: 'doc-1',
    version: 1,
    uploadedById: 'u1',
    createdAt: new Date(),
    originalFileName: 'contract.docx',
    mimeType: DOCX_MIME,
    isCurrent: true,
    ...over,
  });

  it('is true for DOCX, PDF and TXT', () => {
    expect(row({}).textExtractable).toBe(true);
    expect(row({ mimeType: 'application/pdf', originalFileName: 'contract.pdf' }).textExtractable).toBe(true);
    expect(row({ mimeType: 'text/plain', originalFileName: 'contract.txt' }).textExtractable).toBe(true);
  });

  it('is false for formats the comparison engine truthfully cannot extract', () => {
    expect(row({ mimeType: 'application/msword', originalFileName: 'legacy.doc' }).textExtractable).toBe(false);
    expect(row({ mimeType: 'text/html', originalFileName: 'page.html' }).textExtractable).toBe(false);
    expect(row({ mimeType: 'application/rtf', originalFileName: 'doc.rtf' }).textExtractable).toBe(false);
    expect(row({ mimeType: 'application/octet-stream', originalFileName: null, name: null }).textExtractable).toBe(false);
  });

  it('is derived from the version own metadata, not document-level guesses', () => {
    expect(row({ mimeType: 'application/octet-stream', originalFileName: 'contract.docx' }).textExtractable).toBe(true);
    expect(row({ mimeType: null, originalFileName: null, name: 'contract-v1.docx' }).textExtractable).toBe(true);
  });
});

describe('text-range annotation readiness from exact version text (symptom 3)', () => {
  let v2Buffer: Buffer;

  beforeAll(async () => {
    v2Buffer = await makeDocxBuffer([V2_TEXT]);
  });

  it('builds a version-true TEXT_RANGE anchor with real offsets and fingerprint', async () => {
    const versionText = await readVersionContentText(descriptor({ id: 'v2' }), async () => v2Buffer);
    expect(versionText.available).toBe(true);
    const text = versionText.text as string;

    const result = buildTextAnchor({
      rawSelection: 'nettó éves díj összegére',
      versionText: text,
      rendererVersion: TEXT_RENDERER_VERSION,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.anchor.anchorType).toBe('TEXT_RANGE');
    // Offsets are only reported when the selection is unambiguously located in
    // the exact version text, so a non-null offset proves a version-true anchor.
    expect(result.anchor.startOffset).not.toBeNull();
    expect(result.anchor.endOffset).not.toBeNull();
    expect(text.slice(result.anchor.startOffset as number, result.anchor.endOffset as number))
      .toBe('nettó éves díj összegére');
    expect(result.anchor.contentFingerprint).toContain('txt:');
    expect(normalizeSelectedText(result.anchor.selectedText)).toBe('nettó éves díj összegére');
  });

  it('refuses to anchor when no exact version text is available (no invention)', () => {
    const result = buildTextAnchor({
      rawSelection: 'bármi',
      versionText: null,
      rendererVersion: TEXT_RENDERER_VERSION,
    });
    expect(result).toMatchObject({ ok: false, reason: 'NO_RENDERED_TEXT' });
  });

  it('refuses a selection that is absent from the exact version text', async () => {
    const versionText = await readVersionContentText(descriptor({ id: 'v1' }), async () => v2Buffer);
    const result = buildTextAnchor({
      rawSelection: 'ez a szöveg nincs a verzióban',
      versionText: versionText.text as string,
      rendererVersion: TEXT_RENDERER_VERSION,
    });
    expect(result).toMatchObject({ ok: false, reason: 'NOT_FOUND_IN_VERSION' });
  });
});
