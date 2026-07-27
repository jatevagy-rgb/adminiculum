import type { DocumentReview, DocumentReviewRound, ReviewDecision, ReviewPoint } from '@prisma/client';

export type ReviewBundle = DocumentReview & {
  currentRound?: DocumentReviewRound | null;
  rounds?: DocumentReviewRound[];
  points?: ReviewPoint[];
  decisions?: ReviewDecision[];
  document?: { id: string; fileName: string | null; name: string; caseId: string; currentVersionInt: number | null };
  assignedReviewer?: { id: string; name: string; email: string } | null;
  owner?: { id: string; name: string; email: string } | null;
  approvedVersion?: { id: string; version: number; originalFileName: string | null } | null;
};

export function toReviewDto(review: ReviewBundle) {
  return {
    id: review.id,
    documentId: review.documentId,
    status: String(review.status),
    owner: review.owner ? { id: review.owner.id, name: review.owner.name, email: review.owner.email } : null,
    reviewer: review.assignedReviewer ? { id: review.assignedReviewer.id, name: review.assignedReviewer.name, email: review.assignedReviewer.email } : null,
    dueAt: review.dueAt ? review.dueAt.toISOString() : null,
    currentRoundNumber: review.currentRoundNumber,
    currentRoundId: review.currentRoundId,
    reviewVersionId: review.currentRound?.reviewVersionId ?? review.documentVersionId,
    approvedVersionId: review.approvedVersionId,
    approvedVersion: review.approvedVersion ? { id: review.approvedVersion.id, version: review.approvedVersion.version, fileName: review.approvedVersion.originalFileName } : null,
    revision: review.revision,
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
    completedAt: review.completedAt ? review.completedAt.toISOString() : null,
    counts: countPoints(review.points || []),
    rounds: (review.rounds || []).map(toRoundDto),
    lastDecision: review.decisions?.[0] ? toDecisionDto(review.decisions[0]) : null,
  };
}

export function toRoundDto(round: DocumentReviewRound) {
  return {
    id: round.id,
    reviewId: round.reviewId,
    roundNumber: round.roundNumber,
    reviewVersionId: round.reviewVersionId,
    status: String(round.status),
    startedAt: round.startedAt ? round.startedAt.toISOString() : null,
    submittedAt: round.submittedAt ? round.submittedAt.toISOString() : null,
    completedAt: round.completedAt ? round.completedAt.toISOString() : null,
    revision: round.revision,
    createdAt: round.createdAt.toISOString(),
    updatedAt: round.updatedAt.toISOString(),
  };
}

export function toPointDto(point: ReviewPoint) {
  return {
    id: point.id,
    reviewId: point.reviewId,
    reviewRoundId: point.reviewRoundId,
    type: String(point.type),
    status: String(point.status),
    severity: String(point.severity),
    title: point.title,
    internalRationale: point.internalRationale,
    ownerId: point.ownerId,
    dueAt: point.dueAt ? point.dueAt.toISOString() : null,
    annotationId: point.annotationId,
    comparisonSegmentId: point.comparisonSegmentId,
    linkedTaskId: point.linkedTaskId,
    carriedFromPointId: point.carriedFromPointId,
    revision: point.revision,
    createdById: point.createdById,
    createdAt: point.createdAt.toISOString(),
    updatedAt: point.updatedAt.toISOString(),
  };
}

export function toDecisionDto(decision: ReviewDecision) {
  return {
    id: decision.id,
    reviewId: decision.reviewId,
    reviewRoundId: decision.reviewRoundId,
    action: String(decision.action),
    actorId: decision.actorId,
    versionId: decision.versionId,
    safeRationale: decision.safeRationale,
    metadataSafe: decision.metadataSafe,
    createdAt: decision.createdAt.toISOString(),
  };
}

function countPoints(points: ReviewPoint[]) {
  const unresolved = new Set(['OPEN', 'ANSWERED']);
  const open = points.filter((point) => unresolved.has(String(point.status))).length;
  const blocking = points.filter((point) => point.severity === 'BLOCKING' && unresolved.has(String(point.status))).length;
  const resolved = points.filter((point) => ['RESOLVED', 'REJECTED', 'DEFERRED'].includes(String(point.status))).length;
  return { open, blocking, resolved, total: points.length };
}
