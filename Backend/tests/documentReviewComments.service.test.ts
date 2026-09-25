/**
 * Narrow reader-comment authoring tests: caller-supplied annotationType /
 * anchorType can never be overridden; replies are restricted to REVIEW_COMMENT
 * targets on the exact document/version.
 */
const prismaMock: any = {
  documentAnnotation: { findFirst: jest.fn() },
};

const createDocumentAnnotation = jest.fn();
const createDocumentAnnotationComment = jest.fn();

class MockDocumentAnnotationError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
  }
}

jest.mock('../src/prisma/prisma.service', () => ({ prisma: prismaMock }));
jest.mock('../src/modules/documents/annotations.service', () => ({
  createDocumentAnnotation: (...args: unknown[]) => createDocumentAnnotation(...args),
  createDocumentAnnotationComment: (...args: unknown[]) => createDocumentAnnotationComment(...args),
  DocumentAnnotationError: MockDocumentAnnotationError,
}));

import {
  createDocumentReviewComment,
  createDocumentReviewCommentReply,
} from '../src/modules/documents/reviewComments.service';

const DOC = 'doc-1';
const VER = 'ver-1';
const ACTOR = 'reader-1';

beforeEach(() => {
  jest.clearAllMocks();
  createDocumentAnnotation.mockResolvedValue({ id: 'ann-1', annotationType: 'REVIEW_COMMENT' });
  createDocumentAnnotationComment.mockResolvedValue({ id: 'reply-1', body: 'reply' });
});

describe('createDocumentReviewComment', () => {
  it('fixes annotationType=REVIEW_COMMENT and anchorType=TEXT_RANGE and ignores overrides', async () => {
    await createDocumentReviewComment(DOC, VER, ACTOR, {
      selectedText: 'Megrendelő',
      startOffset: 0,
      endOffset: 10,
      body: 'Kérdés',
      // hostile overrides below must be ignored
      annotationType: 'INTERNAL_NOTE',
      anchorType: 'PAGE_POINT',
      reviewComment: 'hacked',
    } as any);

    expect(createDocumentAnnotation).toHaveBeenCalledTimes(1);
    const [docId, verId, actorId, payload] = createDocumentAnnotation.mock.calls[0];
    expect(docId).toBe(DOC);
    expect(verId).toBe(VER);
    expect(actorId).toBe(ACTOR);
    expect(payload.annotationType).toBe('REVIEW_COMMENT');
    expect(payload.anchorType).toBe('TEXT_RANGE');
    expect(payload.reviewComment).toBe('Kérdés');
    expect(payload.selectedText).toBe('Megrendelő');
    expect(payload.startOffset).toBe(0);
    expect(payload.endOffset).toBe(10);
  });

  it('requires a body', async () => {
    await expect(
      createDocumentReviewComment(DOC, VER, ACTOR, {
        selectedText: 'x',
        startOffset: 0,
        endOffset: 1,
        body: '   ',
      })
    ).rejects.toMatchObject({ code: 'COMMENT_REQUIRED' });
    expect(createDocumentAnnotation).not.toHaveBeenCalled();
  });

  it('rejects an invalid text range', async () => {
    await expect(
      createDocumentReviewComment(DOC, VER, ACTOR, {
        selectedText: 'x',
        startOffset: 4,
        endOffset: 2,
        body: 'body',
      })
    ).rejects.toMatchObject({ code: 'INVALID_TEXT_RANGE' });
  });
});

describe('createDocumentReviewCommentReply', () => {
  it('returns null when the target does not exist', async () => {
    prismaMock.documentAnnotation.findFirst.mockResolvedValue(null);
    const result = await createDocumentReviewCommentReply(DOC, VER, 'missing', ACTOR, 'body');
    expect(result).toBeNull();
  });

  it('rejects a reply on a non-REVIEW_COMMENT annotation', async () => {
    prismaMock.documentAnnotation.findFirst.mockResolvedValue({ id: 'ann-2', annotationType: 'INTERNAL_NOTE' });
    await expect(
      createDocumentReviewCommentReply(DOC, VER, 'ann-2', ACTOR, 'body')
    ).rejects.toMatchObject({ code: 'REVIEW_COMMENT_REQUIRED', status: 409 });
    expect(createDocumentAnnotationComment).not.toHaveBeenCalled();
  });

  it('delegates a REVIEW_COMMENT reply to the existing comment service', async () => {
    prismaMock.documentAnnotation.findFirst.mockResolvedValue({ id: 'ann-1', annotationType: 'REVIEW_COMMENT' });
    const reply = await createDocumentReviewCommentReply(DOC, VER, 'ann-1', ACTOR, 'válasz');
    expect(reply).toMatchObject({ id: 'reply-1' });
    expect(prismaMock.documentAnnotation.findFirst).toHaveBeenCalledWith({
      where: { id: 'ann-1', documentId: DOC, documentVersionId: VER, deletedAt: null },
      select: { id: true, annotationType: true },
    });
    expect(createDocumentAnnotationComment).toHaveBeenCalledWith(DOC, VER, 'ann-1', ACTOR, 'válasz');
  });
});
