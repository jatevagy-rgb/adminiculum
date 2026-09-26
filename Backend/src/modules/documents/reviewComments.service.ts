/**
 * Narrow reader-comment authoring for workforce case readers.
 *
 * This is a deliberate, SMALL addition — the generic annotation routes stay
 * manage-only. A legitimate workforce case reader (e.g. TRAINEE) may author a
 * REVIEW_COMMENT anchored to an immutable version, and reply to one. Callers can
 * never choose the annotationType/anchorType: those are fixed here and handed to
 * the existing annotation service, so no new annotation semantics are created.
 */
import { prisma } from '../../prisma/prisma.service';
import {
  createDocumentAnnotation,
  createDocumentAnnotationComment,
  DocumentAnnotationError,
} from './annotations.service';
import { AnchorValidationError, requireTextRange, trimToNull } from './anchorValidation';

const MAX_COMMENT_LENGTH = 4000;

export class ReviewCommentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = 'ReviewCommentError';
  }
}

export interface CreateReviewCommentInput {
  selectedText?: unknown;
  startOffset?: unknown;
  endOffset?: unknown;
  textPrefix?: unknown;
  textSuffix?: unknown;
  contentFingerprint?: unknown;
  body?: unknown;
}

function mapAnchorError(error: unknown): never {
  if (error instanceof AnchorValidationError) {
    throw new ReviewCommentError(error.code, error.message, error.status);
  }
  throw error;
}

/** Creates a REVIEW_COMMENT/TEXT_RANGE annotation with fixed type and anchor. */
export async function createDocumentReviewComment(
  documentId: string,
  versionId: string,
  actorId: string,
  input: CreateReviewCommentInput
) {
  const body = trimToNull(input.body, MAX_COMMENT_LENGTH, 'body');
  if (!body) {
    throw new ReviewCommentError('COMMENT_REQUIRED', 'Comment body is required.');
  }

  let range;
  try {
    range = requireTextRange(input);
  } catch (error) {
    mapAnchorError(error);
  }

  try {
    return await createDocumentAnnotation(documentId, versionId, actorId, {
      annotationType: 'REVIEW_COMMENT',
      anchorType: 'TEXT_RANGE',
      reviewComment: body,
      selectedText: range!.selectedText,
      startOffset: range!.startOffset,
      endOffset: range!.endOffset,
      textPrefix: range!.textPrefix ?? undefined,
      textSuffix: range!.textSuffix ?? undefined,
      contentFingerprint: range!.contentFingerprint ?? undefined,
    });
  } catch (error) {
    if (error instanceof DocumentAnnotationError) {
      throw new ReviewCommentError(error.code, error.message, error.status);
    }
    throw error;
  }
}

/**
 * Adds a reply to a REVIEW_COMMENT annotation, verifying the target is exactly
 * this document/version, not deleted and actually a REVIEW_COMMENT. Returns null
 * when the target does not exist (route maps to 404).
 */
export async function createDocumentReviewCommentReply(
  documentId: string,
  versionId: string,
  annotationId: string,
  actorId: string,
  body: unknown
) {
  const annotation = await prisma.documentAnnotation.findFirst({
    where: { id: annotationId, documentId, documentVersionId: versionId, deletedAt: null },
    select: { id: true, annotationType: true },
  });
  if (!annotation) return null;

  if (annotation.annotationType !== 'REVIEW_COMMENT') {
    throw new ReviewCommentError(
      'REVIEW_COMMENT_REQUIRED',
      'Replies are only allowed on review comments.',
      409
    );
  }

  try {
    return await createDocumentAnnotationComment(documentId, versionId, annotationId, actorId, body);
  } catch (error) {
    if (error instanceof DocumentAnnotationError) {
      throw new ReviewCommentError(error.code, error.message, error.status);
    }
    throw error;
  }
}
