/**
 * Read + segment-mutation operations for structured comparison
 * (STRUCTURED-DOC-COMPARISON-1, Phase 6). Deterministic ordering, bounded
 * pagination, explicit filters, and optimistic concurrency on segment mutations.
 */
import { prisma as defaultPrisma } from '../../../prisma/prisma.service';
import { ComparisonError } from './comparisonService';

const MAX_RATIONALE = 2000;
const SEGMENT_PAGE_MAX = 200;

const CATEGORY_VALUES = new Set(['PARTY', 'DATE', 'AMOUNT', 'OBLIGATION', 'LIABILITY', 'TERMINATION', 'GOVERNING_LAW', 'DEFINITION', 'OTHER', 'UNCLASSIFIED']);
const REVIEW_STATE_VALUES = new Set(['UNREVIEWED', 'ACCEPTED', 'REJECTED', 'NEEDS_DISCUSSION', 'NOT_RELEVANT']);
const CHANGE_TYPE_VALUES = new Set(['INSERT', 'DELETE', 'REPLACE', 'MOVE_CANDIDATE', 'FORMAT_ONLY']);

export async function listComparisonsForDocument(documentId: string, prisma: any = defaultPrisma) {
  return prisma.documentComparison.findMany({ where: { documentId }, orderBy: { createdAt: 'desc' } });
}

export async function getComparison(comparisonId: string, prisma: any = defaultPrisma) {
  const row = await prisma.documentComparison.findUnique({ where: { id: comparisonId } });
  if (!row) throw new ComparisonError('COMPARISON_NOT_FOUND', 'Comparison not found.', 404);
  return row;
}

export interface SegmentQuery {
  changeType?: string;
  category?: string;
  reviewState?: string;
  unreviewedOnly?: boolean;
  limit?: number;
  offset?: number;
}

export async function listSegments(comparisonId: string, q: SegmentQuery, prisma: any = defaultPrisma) {
  const where: any = { comparisonId };
  if (q.changeType && CHANGE_TYPE_VALUES.has(q.changeType)) where.changeType = q.changeType;
  if (q.category && CATEGORY_VALUES.has(q.category)) where.category = q.category;
  if (q.unreviewedOnly) where.reviewState = 'UNREVIEWED';
  else if (q.reviewState && REVIEW_STATE_VALUES.has(q.reviewState)) where.reviewState = q.reviewState;

  const limit = Math.min(Math.max(1, q.limit ?? 100), SEGMENT_PAGE_MAX);
  const offset = Math.max(0, q.offset ?? 0);
  const [items, total] = await Promise.all([
    prisma.documentChangeSegment.findMany({ where, orderBy: { sequence: 'asc' }, skip: offset, take: limit }),
    prisma.documentChangeSegment.count({ where }),
  ]);
  return { items, total, limit, offset };
}

export interface SegmentPatch {
  category?: string;
  categorySource?: string;
  reviewState?: string;
  internalRationale?: string | null;
  /** Optimistic concurrency: the revision the client last saw. */
  expectedRevision: number;
}

export async function updateSegment(comparisonId: string, segmentId: string, patch: SegmentPatch, prisma: any = defaultPrisma) {
  const seg = await prisma.documentChangeSegment.findFirst({ where: { id: segmentId, comparisonId } });
  if (!seg) throw new ComparisonError('SEGMENT_NOT_FOUND', 'Change segment not found.', 404);
  if (typeof patch.expectedRevision !== 'number' || patch.expectedRevision !== seg.revision) {
    throw new ComparisonError('REVISION_CONFLICT', 'The segment was modified by someone else. Reload and retry.', 409);
  }
  const data: any = { revision: { increment: 1 } };
  if (patch.category !== undefined) {
    if (!CATEGORY_VALUES.has(patch.category)) throw new ComparisonError('INVALID_CATEGORY', 'Invalid category.');
    data.category = patch.category;
    data.categorySource = 'MANUAL';
  }
  if (patch.reviewState !== undefined) {
    if (!REVIEW_STATE_VALUES.has(patch.reviewState)) throw new ComparisonError('INVALID_REVIEW_STATE', 'Invalid review state.');
    data.reviewState = patch.reviewState;
  }
  if (patch.internalRationale !== undefined) {
    const r = patch.internalRationale;
    if (r != null && r.length > MAX_RATIONALE) throw new ComparisonError('RATIONALE_TOO_LONG', 'Rationale is too long.');
    data.internalRationale = r ? r.trim() : null;
  }

  const wasReviewed = seg.reviewState !== 'UNREVIEWED';
  const willBeReviewed = (data.reviewState ?? seg.reviewState) !== 'UNREVIEWED';

  return prisma.$transaction(async (tx: any) => {
    const updated = await tx.documentChangeSegment.update({ where: { id: segmentId }, data });
    if (wasReviewed !== willBeReviewed) {
      await tx.documentComparison.update({
        where: { id: comparisonId },
        data: { reviewedSegmentCount: { increment: willBeReviewed ? 1 : -1 } },
      });
    }
    return updated;
  });
}

export async function linkSegmentTask(comparisonId: string, segmentId: string, taskId: string | null, prisma: any = defaultPrisma) {
  const seg = await prisma.documentChangeSegment.findFirst({ where: { id: segmentId, comparisonId } });
  if (!seg) throw new ComparisonError('SEGMENT_NOT_FOUND', 'Change segment not found.', 404);
  if (taskId) {
    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
    if (!task) throw new ComparisonError('TASK_NOT_FOUND', 'Task not found.', 404);
  }
  return prisma.documentChangeSegment.update({ where: { id: segmentId }, data: { linkedTaskId: taskId, revision: { increment: 1 } } });
}

export async function linkSegmentAnnotation(comparisonId: string, segmentId: string, annotationId: string | null, prisma: any = defaultPrisma) {
  const seg = await prisma.documentChangeSegment.findFirst({ where: { id: segmentId, comparisonId } });
  if (!seg) throw new ComparisonError('SEGMENT_NOT_FOUND', 'Change segment not found.', 404);
  if (annotationId) {
    const ann = await prisma.documentAnnotation.findUnique({ where: { id: annotationId }, select: { id: true } });
    if (!ann) throw new ComparisonError('ANNOTATION_NOT_FOUND', 'Annotation not found.', 404);
  }
  return prisma.documentChangeSegment.update({ where: { id: segmentId }, data: { linkedAnnotationId: annotationId, revision: { increment: 1 } } });
}
