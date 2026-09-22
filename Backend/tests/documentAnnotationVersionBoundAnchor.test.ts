/**
 * Version-bound TEXT_RANGE annotation readiness (DOCUMENT-CONTENT-PIPELINE-1).
 *
 * Proves the end-to-end contract behind UAT symptom 3:
 *   exact immutable DocumentVersion bytes
 *     -> exact version text (readVersionContentText)
 *     -> version-true TEXT_RANGE anchor (offsets + fingerprint, real client module)
 *     -> accepted and persisted by the EXISTING annotation service
 * with no schema change and no invented passage geometry.
 *
 * The annotation service is exercised against a mocked Prisma client, exactly as
 * documentAnnotationsService.behaviour.test.ts does, so this asserts the real
 * anchor-validation and persistence payload rather than source strings.
 */
const prismaMock: any = {
  documentVersion: { findFirst: jest.fn() },
  document: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  caseCollaborator: { findFirst: jest.fn() },
  documentAnnotation: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
  documentAnnotationComment: { findMany: jest.fn(), create: jest.fn() },
  documentAnnotationEvent: { create: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock('../src/prisma/prisma.service', () => ({ prisma: prismaMock }));

import { Document, Packer, Paragraph, TextRun } from 'docx';

import { createDocumentAnnotation } from '../src/modules/documents/annotations.service';
import { readVersionContentText, type VersionContentDescriptor } from '../src/modules/documents/versionContent.service';
import { buildTextAnchor, normalizeSelectedText } from '../../Frontend/src/lib/annotations/annotationAnchors';
import { TEXT_RENDERER_VERSION } from '../../Frontend/src/lib/annotations/annotationCapabilities';

const V2_TEXT = 'A szolgáltató teljes felelőssége a nettó éves díj összegére korlátozott.';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOC = 'doc-1';
const VER = 'ver-2';
const ACTOR = 'user-1';

async function makeDocxBuffer(paragraphs: string[]): Promise<Buffer> {
  const doc = new Document({
    sections: [{ children: paragraphs.map((p) => new Paragraph({ children: [new TextRun(p)] })) }],
  });
  return Packer.toBuffer(doc);
}

function versionDescriptor(): VersionContentDescriptor {
  return {
    id: VER,
    documentId: DOC,
    originalFileName: 'Munkaszerződés_minta_belso_revizios_v2.docx',
    mimeType: DOCX_MIME,
    size: 1000,
    securityScanStatus: 'CLEAN',
    storageReference: 'v2-storage',
    spItemId: 'v2-storage',
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.documentVersion.findFirst.mockResolvedValue({ id: VER });
  prismaMock.$transaction.mockImplementation(async (arg: any) =>
    typeof arg === 'function' ? arg(prismaMock) : Promise.all(arg)
  );
  prismaMock.documentAnnotationEvent.create.mockResolvedValue({});
  // Echo the persisted create payload so the mapped DTO is the real stored shape.
  prismaMock.documentAnnotation.create.mockImplementation(async ({ data }: any) => ({
    id: 'ann-1',
    status: 'OPEN',
    visibility: 'INTERNAL',
    headline: null,
    internalNote: null,
    reviewComment: null,
    modificationReason: null,
    clientExplanationDraft: null,
    legalRisk: null,
    openQuestion: null,
    decisionText: null,
    resolutionNote: null,
    pageNumber: null,
    pageIndex: null,
    rectX: null, rectY: null, rectWidth: null, rectHeight: null,
    pointX: null, pointY: null,
    pageRotation: null,
    structuralPath: null,
    assignedToId: null,
    resolvedById: null,
    createdAt: new Date('2026-09-21T10:00:00Z'),
    updatedAt: new Date('2026-09-21T10:00:00Z'),
    resolvedAt: null,
    createdBy: { id: ACTOR, name: 'Teszt Ügyvéd', email: 'teszt@example.invalid' },
    assignedTo: null,
    resolvedBy: null,
    ...data,
  }));
});

describe('version-bound TEXT_RANGE anchor acceptance', () => {
  it('persists a TEXT_RANGE annotation anchored to the exact immutable version text', async () => {
    const docx = await makeDocxBuffer([V2_TEXT]);
    const versionText = await readVersionContentText(versionDescriptor(), async () => docx);
    expect(versionText.available).toBe(true);
    const text = versionText.text as string;

    const anchorResult = buildTextAnchor({
      rawSelection: 'nettó éves díj összegére',
      versionText: text,
      rendererVersion: TEXT_RENDERER_VERSION,
    });
    expect(anchorResult.ok).toBe(true);
    if (!anchorResult.ok) return;
    const anchor = anchorResult.anchor;

    const created = await createDocumentAnnotation(DOC, VER, ACTOR, {
      annotationType: 'INTERNAL_NOTE',
      anchorType: 'TEXT_RANGE',
      headline: 'Felelősségkorlátozás',
      internalNote: 'A felelősség a nettó éves díjra korlátozott.',
      selectedText: anchor.selectedText,
      textPrefix: anchor.textPrefix,
      textSuffix: anchor.textSuffix,
      startOffset: anchor.startOffset,
      endOffset: anchor.endOffset,
      rendererVersion: anchor.rendererVersion,
      contentFingerprint: anchor.contentFingerprint,
    });

    // The persisted payload is version-bound: offsets index into THIS version's
    // exact text and the fingerprint is derived from it.
    const data = prismaMock.documentAnnotation.create.mock.calls[0][0].data;
    expect(data.documentId).toBe(DOC);
    expect(data.documentVersionId).toBe(VER);
    expect(data.anchorType).toBe('TEXT_RANGE');
    expect(data.startOffset).toBe(anchor.startOffset);
    expect(data.endOffset).toBe(anchor.endOffset);
    expect(text.slice(data.startOffset, data.endOffset)).toBe('nettó éves díj összegére');
    expect(data.contentFingerprint).toBe(anchor.contentFingerprint);
    expect(data.contentFingerprint).toContain('txt:');
    expect(data.rendererVersion).toBe(TEXT_RENDERER_VERSION);
    expect(data.normalizedSelectedText).toBe(normalizeSelectedText('nettó éves díj összegére'));

    // And the service returns the stored anchor unchanged.
    expect(created.anchorType).toBe('TEXT_RANGE');
    expect(created.documentVersionId).toBe(VER);
    expect(created.startOffset).toBe(anchor.startOffset);
    expect(created.endOffset).toBe(anchor.endOffset);
    expect(created.selectedText).toBe('nettó éves díj összegére');
  });

  it('rejects a fabricated offset range that does not match the selected text length', async () => {
    const docx = await makeDocxBuffer([V2_TEXT]);
    const versionText = await readVersionContentText(versionDescriptor(), async () => docx);
    const text = versionText.text as string;
    const realStart = text.indexOf('nettó éves díj összegére');

    await expect(createDocumentAnnotation(DOC, VER, ACTOR, {
      anchorType: 'TEXT_RANGE',
      selectedText: 'nettó éves díj összegére',
      startOffset: realStart,
      endOffset: realStart, // empty range is invalid
    })).rejects.toMatchObject({ code: 'INVALID_TEXT_RANGE' });
    expect(prismaMock.documentAnnotation.create).not.toHaveBeenCalled();
  });

  it('preserves the PAGE_RECTANGLE fallback for non-text (scanned PDF) anchors', async () => {
    await createDocumentAnnotation(DOC, VER, ACTOR, {
      anchorType: 'PAGE_RECTANGLE',
      pageIndex: 0,
      rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
    });
    const data = prismaMock.documentAnnotation.create.mock.calls[0][0].data;
    expect(data.anchorType).toBe('PAGE_RECTANGLE');
    expect(Number(data.rectX)).toBeCloseTo(0.1);
    expect(Number(data.rectWidth)).toBeCloseTo(0.3);
  });
});
