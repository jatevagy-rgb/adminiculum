/**
 * Behavioural tests for the annotation service runtime (not source-string
 * assertions). Exercises anchor validation, the PATCH immutability whitelist,
 * assignee scope enforcement and soft-delete/idempotency behaviour against a
 * mocked Prisma client.
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

import {
  createDocumentAnnotation,
  updateDocumentAnnotation,
  listDocumentAnnotations,
  DocumentAnnotationError,
} from '../src/modules/documents/annotations.service';

const DOC = 'doc-1';
const VER = 'ver-1';
const ACTOR = 'user-1';

function baseAnnotationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ann-1', documentId: DOC, documentVersionId: VER,
    annotationType: 'INTERNAL_NOTE', anchorType: 'TEXT_RANGE', status: 'OPEN', visibility: 'INTERNAL',
    headline: null, internalNote: 'note', reviewComment: null, modificationReason: null,
    clientExplanationDraft: null, legalRisk: null, openQuestion: null, decisionText: null, resolutionNote: null,
    selectedText: 'foo', normalizedSelectedText: 'foo', textPrefix: null, textSuffix: null,
    startOffset: 0, endOffset: 3, pageNumber: null, pageIndex: null,
    rectX: null, rectY: null, rectWidth: null, rectHeight: null, pointX: null, pointY: null,
    pageRotation: null, structuralPath: null, rendererVersion: null, contentFingerprint: null,
    createdById: ACTOR, assignedToId: null, resolvedById: null,
    createdAt: new Date('2026-07-23'), updatedAt: new Date('2026-07-23'), resolvedAt: null,
    createdBy: { id: ACTOR, name: 'Teszt', email: 't@e.com' }, assignedTo: null, resolvedBy: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.documentVersion.findFirst.mockResolvedValue({ id: VER });
  prismaMock.$transaction.mockImplementation(async (arg: any) =>
    typeof arg === 'function' ? arg(prismaMock) : Promise.all(arg)
  );
  prismaMock.documentAnnotation.create.mockResolvedValue(baseAnnotationRow());
  prismaMock.documentAnnotationEvent.create.mockResolvedValue({});
});

describe('anchor validation on create', () => {
  it('rejects TEXT_RANGE without selected text', async () => {
    await expect(createDocumentAnnotation(DOC, VER, ACTOR, { anchorType: 'TEXT_RANGE', selectedText: '   ' }))
      .rejects.toMatchObject({ code: 'INVALID_TEXT_ANCHOR' });
    expect(prismaMock.documentAnnotation.create).not.toHaveBeenCalled();
  });

  it('rejects reversed / impossible text offsets', async () => {
    await expect(createDocumentAnnotation(DOC, VER, ACTOR, { anchorType: 'TEXT_RANGE', selectedText: 'x', startOffset: 10, endOffset: 4 }))
      .rejects.toMatchObject({ code: 'INVALID_TEXT_RANGE' });
  });

  it('rejects a zero-area rectangle', async () => {
    await expect(createDocumentAnnotation(DOC, VER, ACTOR, { anchorType: 'PAGE_RECTANGLE', pageIndex: 0, rect: { x: 0.1, y: 0.1, width: 0, height: 0.2 } }))
      .rejects.toMatchObject({ code: 'INVALID_RECT_ANCHOR' });
  });

  it('rejects a rectangle that leaves the page bounds', async () => {
    await expect(createDocumentAnnotation(DOC, VER, ACTOR, { anchorType: 'PAGE_RECTANGLE', pageIndex: 0, rect: { x: 0.9, y: 0.1, width: 0.5, height: 0.2 } }))
      .rejects.toMatchObject({ code: 'INVALID_RECT_ANCHOR' });
  });

  it('rejects non-normalized (pixel) coordinates', async () => {
    await expect(createDocumentAnnotation(DOC, VER, ACTOR, { anchorType: 'PAGE_RECTANGLE', pageIndex: 0, rect: { x: 120, y: 300, width: 40, height: 20 } }))
      .rejects.toMatchObject({ code: 'INVALID_ANCHOR' });
  });

  it('rejects geometry without a page index', async () => {
    await expect(createDocumentAnnotation(DOC, VER, ACTOR, { anchorType: 'PAGE_RECTANGLE', rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } }))
      .rejects.toMatchObject({ code: 'INVALID_PAGE_ANCHOR' });
  });

  it('rejects an unsupported anchor type', async () => {
    await expect(createDocumentAnnotation(DOC, VER, ACTOR, { anchorType: 'MAGIC' }))
      .rejects.toBeInstanceOf(DocumentAnnotationError);
  });

  it('rejects an unsupported page rotation', async () => {
    await expect(createDocumentAnnotation(DOC, VER, ACTOR, { anchorType: 'TEXT_RANGE', selectedText: 'x', pageRotation: 37 }))
      .rejects.toMatchObject({ code: 'INVALID_PAGE_ROTATION' });
  });

  it('accepts a valid normalized rectangle and stores it as decimals', async () => {
    prismaMock.documentAnnotation.create.mockResolvedValue(baseAnnotationRow({ anchorType: 'PAGE_RECTANGLE', rectX: 0.1, rectY: 0.2, rectWidth: 0.3, rectHeight: 0.4, pageIndex: 1 }));
    const result = await createDocumentAnnotation(DOC, VER, ACTOR, { anchorType: 'PAGE_RECTANGLE', pageIndex: 1, rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } });
    expect(result.rect).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
    const data = prismaMock.documentAnnotation.create.mock.calls[0][0].data;
    expect(Number(data.rectX)).toBeCloseTo(0.1);
    expect(data.documentId).toBe(DOC);
    expect(data.documentVersionId).toBe(VER);
    expect(data.createdById).toBe(ACTOR);
  });
});

describe('assignee scope enforcement', () => {
  it('rejects an assignee that does not exist (controlled 400, not an FK 500)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(createDocumentAnnotation(DOC, VER, ACTOR, { anchorType: 'TEXT_RANGE', selectedText: 'x', assignedToId: 'ghost' }))
      .rejects.toMatchObject({ code: 'ASSIGNEE_NOT_FOUND', status: 400 });
    expect(prismaMock.documentAnnotation.create).not.toHaveBeenCalled();
  });

  it('rejects an assignee with no access to the owning case', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'outsider', role: 'LAWYER' });
    prismaMock.document.findUnique.mockResolvedValue({ caseId: 'case-1', case: { assignedLawyerId: 'other', createdById: 'other' } });
    prismaMock.caseCollaborator.findFirst.mockResolvedValue(null);
    await expect(createDocumentAnnotation(DOC, VER, ACTOR, { anchorType: 'TEXT_RANGE', selectedText: 'x', assignedToId: 'outsider' }))
      .rejects.toMatchObject({ code: 'ASSIGNEE_NOT_ALLOWED', status: 403 });
  });

  it('accepts an assignee who collaborates on the case', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'collab', role: 'LAWYER' });
    prismaMock.document.findUnique.mockResolvedValue({ caseId: 'case-1', case: { assignedLawyerId: 'other', createdById: 'other' } });
    prismaMock.caseCollaborator.findFirst.mockResolvedValue({ id: 'cc-1' });
    await expect(createDocumentAnnotation(DOC, VER, ACTOR, { anchorType: 'TEXT_RANGE', selectedText: 'x', assignedToId: 'collab' }))
      .resolves.toBeTruthy();
  });
});

describe('PATCH immutability whitelist', () => {
  beforeEach(() => {
    prismaMock.documentAnnotation.findFirst.mockResolvedValue({ id: 'ann-1', status: 'OPEN', assignedToId: null });
    prismaMock.documentAnnotation.update.mockResolvedValue(baseAnnotationRow());
  });

  it.each([
    ['documentVersionId', { documentVersionId: 'ver-2' }],
    ['documentId', { documentId: 'doc-2' }],
    ['anchorType', { anchorType: 'PAGE_POINT' }],
    ['selectedText', { selectedText: 'moved' }],
    ['startOffset', { startOffset: 99 }],
    ['rect', { rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } }],
    ['createdById', { createdById: 'someone-else' }],
    ['status', { status: 'RESOLVED' }],
    ['deletedAt', { deletedAt: new Date().toISOString() }],
  ])('rejects an attempt to mutate %s', async (_label, payload) => {
    await expect(updateDocumentAnnotation(DOC, VER, 'ann-1', ACTOR, payload as never))
      .rejects.toMatchObject({ code: 'IMMUTABLE_FIELD' });
    expect(prismaMock.documentAnnotation.update).not.toHaveBeenCalled();
  });

  it('allows editing ordinary content fields', async () => {
    await updateDocumentAnnotation(DOC, VER, 'ann-1', ACTOR, { internalNote: 'frissítve', headline: 'Fejléc' });
    expect(prismaMock.documentAnnotation.update).toHaveBeenCalledTimes(1);
    const data = prismaMock.documentAnnotation.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ internalNote: 'frissítve', headline: 'Fejléc' });
    expect(data).not.toHaveProperty('documentVersionId');
    expect(data).not.toHaveProperty('anchorType');
  });
});

describe('listing is version-scoped and excludes soft-deleted rows', () => {
  it('always filters by document, version and deletedAt null', async () => {
    prismaMock.documentAnnotation.findMany.mockResolvedValue([]);
    prismaMock.documentAnnotation.count.mockResolvedValue(0);
    await listDocumentAnnotations(DOC, VER, {});
    const where = prismaMock.documentAnnotation.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ documentId: DOC, documentVersionId: VER, deletedAt: null });
  });

  it('bounds the page size to the configured maximum', async () => {
    prismaMock.documentAnnotation.findMany.mockResolvedValue([]);
    prismaMock.documentAnnotation.count.mockResolvedValue(0);
    await listDocumentAnnotations(DOC, VER, { limit: '5000' });
    expect(prismaMock.documentAnnotation.findMany.mock.calls[0][0].take).toBeLessThanOrEqual(50);
  });

  it('rejects an invalid status filter instead of ignoring it', async () => {
    await expect(listDocumentAnnotations(DOC, VER, { status: 'NOT_A_STATUS' }))
      .rejects.toBeInstanceOf(DocumentAnnotationError);
  });
});

describe('idempotency', () => {
  it('returns the existing annotation instead of creating a duplicate', async () => {
    prismaMock.documentAnnotation.findFirst.mockResolvedValue(baseAnnotationRow());
    const result = await createDocumentAnnotation(DOC, VER, ACTOR, { anchorType: 'TEXT_RANGE', selectedText: 'foo', idempotencyKey: 'k1' });
    expect(result.id).toBe('ann-1');
    expect(prismaMock.documentAnnotation.create).not.toHaveBeenCalled();
  });
});
