import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../prisma/prisma.service';
import { evaluateTransition, candidateActions, type ReviewAction, type ReviewStatus } from './reviewWorkflow';

type Db = PrismaClient | Prisma.TransactionClient;
type Actor = { userId: string; role?: string };

const ACTIVE_REVIEW_STATUSES = ['DRAFT', 'ASSIGNED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'RESUBMITTED', 'READY_FOR_REVIEW'] as const;
const UNRESOLVED_POINT_STATUSES = ['OPEN', 'ANSWERED'] as const;
const RATIONALE_LIMIT = 2000;
const TITLE_LIMIT = 240;
const META_LIMIT = 2000;

export class DocumentReviewWorkflowError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'DocumentReviewWorkflowError';
  }
}

function safeText(value: unknown, limit = RATIONALE_LIMIT): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > limit) throw new DocumentReviewWorkflowError(400, 'TEXT_TOO_LONG', `Text must be ${limit} characters or fewer.`);
  return text;
}

function safeMeta(value: unknown): Prisma.InputJsonValue | undefined {
  if (value == null) return undefined;
  const text = JSON.stringify(value);
  if (text.length > META_LIMIT) throw new DocumentReviewWorkflowError(400, 'METADATA_TOO_LARGE', 'metadataSafe is too large.');
  if (/storageReference|storageKey|workspaceText|clientPortal|portalGrant/i.test(text)) {
    throw new DocumentReviewWorkflowError(400, 'UNSAFE_METADATA', 'metadataSafe contains forbidden review data.');
  }
  return value as Prisma.InputJsonValue;
}

async function documentFor(db: Db, documentId: string) {
  const document = await db.document.findUnique({
    where: { id: documentId },
    select: { id: true, caseId: true, name: true, fileName: true, currentVersionInt: true, currentVersion: true },
  });
  if (!document) throw new DocumentReviewWorkflowError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.');
  return document;
}

async function versionFor(db: Db, documentId: string, versionId?: string | null) {
  const version = versionId
    ? await db.documentVersion.findFirst({ where: { id: versionId, documentId }, select: { id: true, version: true, documentId: true, originalFileName: true } })
    : await db.documentVersion.findFirst({ where: { documentId, isCurrent: true }, orderBy: { version: 'desc' }, select: { id: true, version: true, documentId: true, originalFileName: true } });
  if (!version) throw new DocumentReviewWorkflowError(404, 'REVIEW_VERSION_NOT_FOUND', 'Review version not found for document.');
  return version;
}

async function userHasCaseAccess(db: Db, userId: string, caseId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true, status: true } });
  if (!user || user.isActive === false || user.status !== 'ACTIVE') return false;
  if (['ADMIN', 'PARTNER'].includes(String(user.role))) return true;
  const caseRow = await db.case.findUnique({ where: { id: caseId }, select: { assignedLawyerId: true, createdById: true } });
  if (!caseRow) return false;
  if (caseRow.assignedLawyerId === userId || caseRow.createdById === userId) return true;
  return Boolean(await db.caseCollaborator.findFirst({ where: { caseId, userId }, select: { id: true } }));
}

async function assertActorAccess(db: Db, actor: Actor, caseId: string) {
  if (!actor.userId || !(await userHasCaseAccess(db, actor.userId, caseId))) {
    throw new DocumentReviewWorkflowError(403, 'ACTOR_NOT_AUTHORIZED', 'Actor is not authorized for this review.');
  }
}

function includeReview() {
  return {
    document: { select: { id: true, fileName: true, name: true, caseId: true, currentVersionInt: true } },
    owner: { select: { id: true, name: true, email: true } },
    assignedReviewer: { select: { id: true, name: true, email: true } },
    approvedVersion: { select: { id: true, version: true, originalFileName: true } },
    currentRound: true,
    rounds: { orderBy: { roundNumber: 'asc' as const } },
    points: true,
    decisions: { orderBy: { createdAt: 'desc' as const }, take: 1 },
  };
}

async function loadReview(db: Db, reviewId: string) {
  const review = await db.documentReview.findUnique({ where: { id: reviewId }, include: includeReview() });
  if (!review) throw new DocumentReviewWorkflowError(404, 'REVIEW_NOT_FOUND', 'Document review not found.');
  if (!review.currentRound) throw new DocumentReviewWorkflowError(409, 'ACTIVE_ROUND_MISSING', 'Review has no active round.');
  return review;
}

async function latestVersion(db: Db, documentId: string) {
  return db.documentVersion.findFirstOrThrow({ where: { documentId }, orderBy: { version: 'desc' }, select: { id: true, version: true } });
}

function requireExpectedRevision(actual: number, expected: unknown) {
  if (expected == null) return;
  if (Number(expected) !== actual) throw new DocumentReviewWorkflowError(409, 'REVISION_CONFLICT', 'The review was modified by someone else. Reload and retry.');
}

async function decision(tx: Db, params: { reviewId: string; reviewRoundId?: string | null; action: string; actorId: string; versionId?: string | null; safeRationale?: string | null; metadataSafe?: unknown; idempotencyKey?: string | null }) {
  if (params.idempotencyKey) {
    const existing = await tx.reviewDecision.findUnique({ where: { idempotencyKey: params.idempotencyKey } });
    if (existing) return existing;
  }
  return tx.reviewDecision.create({ data: {
    reviewId: params.reviewId,
    reviewRoundId: params.reviewRoundId || null,
    action: params.action as any,
    actorId: params.actorId,
    versionId: params.versionId || null,
    safeRationale: safeText(params.safeRationale),
    metadataSafe: safeMeta(params.metadataSafe),
    idempotencyKey: params.idempotencyKey || null,
  } });
}

async function auditAndNotify(tx: Db, params: { action: string; actorId: string; caseId: string; documentId: string; reviewId: string; roundId?: string | null; versionId?: string | null; recipientId?: string | null }) {
  await tx.timelineEvent.create({ data: {
    eventType: 'DOCUMENT_UPLOADED',
    type: `DOCUMENT_REVIEW_${params.action}`,
    caseId: params.caseId,
    documentId: params.documentId,
    userId: params.actorId,
    description: `Document review ${params.action.toLowerCase().replace(/_/g, ' ')}`,
    metadata: { reviewId: params.reviewId, roundId: params.roundId || null, versionId: params.versionId || null, internalOnly: true },
  } });
  if (params.recipientId) {
    const link = `/cases/${encodeURIComponent(params.caseId)}/documents?documentId=${encodeURIComponent(params.documentId)}&mode=review`;
    const title = params.action === 'ASSIGNED' ? 'Review kijelölve' : `Review: ${params.action}`;
    const exists = await tx.notification.findFirst({ where: { userId: params.recipientId, type: 'REVIEW_REQUESTED', link, title, createdAt: { gte: new Date(Date.now() - 60_000) } }, select: { id: true } });
    if (!exists) await tx.notification.create({ data: { userId: params.recipientId, type: 'REVIEW_REQUESTED', title, message: 'Belső dokumentum-review figyelmet igényel.', link } });
  }
}

export async function createReview(documentId: string, actor: Actor, input: { reviewVersionId?: string; ownerId?: string; reviewerId?: string; dueAt?: string; idempotencyKey?: string }, db: PrismaClient = defaultPrisma) {
  return db.$transaction(async (tx) => {
    const document = await documentFor(tx, documentId);
    await assertActorAccess(tx, actor, document.caseId);
    const version = await versionFor(tx, documentId, input.reviewVersionId);
    const existing = await tx.documentReview.findFirst({ where: { documentId, status: { in: ACTIVE_REVIEW_STATUSES as any } }, include: includeReview() });
    if (existing) return existing;
    const review = await tx.documentReview.create({ data: {
      documentId,
      documentVersionId: version.id,
      status: 'DRAFT',
      ownerId: input.ownerId || actor.userId,
      assignedReviewerId: input.reviewerId || null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      createdById: actor.userId,
    } });
    const round = await tx.documentReviewRound.create({ data: { reviewId: review.id, roundNumber: 1, reviewVersionId: version.id, status: 'DRAFT', submittedAt: new Date(), createdById: actor.userId } });
    await tx.documentReview.update({ where: { id: review.id }, data: { currentRoundId: round.id, currentRoundNumber: 1 } });
    await decision(tx, { reviewId: review.id, reviewRoundId: round.id, action: 'CREATED', actorId: actor.userId, versionId: version.id, idempotencyKey: input.idempotencyKey || `review:create:${review.id}` });
    await auditAndNotify(tx, { action: 'CREATED', actorId: actor.userId, caseId: document.caseId, documentId, reviewId: review.id, roundId: round.id, versionId: version.id, recipientId: input.reviewerId || null });
    return loadReview(tx, review.id);
  });
}

export async function listReviews(documentId: string, actor: Actor, db: PrismaClient = defaultPrisma) {
  const document = await documentFor(db, documentId);
  await assertActorAccess(db, actor, document.caseId);
  return db.documentReview.findMany({ where: { documentId }, include: includeReview(), orderBy: { updatedAt: 'desc' } });
}

export async function getReview(reviewId: string, actor: Actor, db: PrismaClient = defaultPrisma) {
  const review = await loadReview(db, reviewId);
  await assertActorAccess(db, actor, review.document.caseId);
  return review;
}

export async function transitionReview(reviewId: string, action: ReviewAction, actor: Actor, input: { reviewerId?: string; versionId?: string; safeRationale?: string; expectedRevision?: number; idempotencyKey?: string } = {}, db: PrismaClient = defaultPrisma) {
  return db.$transaction(async (tx) => {
    const review = await loadReview(tx, reviewId);
    await assertActorAccess(tx, actor, review.document.caseId);
    requireExpectedRevision(review.revision, input.expectedRevision);
    const reviewerId = input.reviewerId || review.assignedReviewerId;
    if (action === 'ASSIGN' && !reviewerId) throw new DocumentReviewWorkflowError(400, 'REVIEWER_REQUIRED', 'reviewerId is required.');
    const reviewerHasAccess = reviewerId ? await userHasCaseAccess(tx, reviewerId, review.document.caseId) : true;
    const openPoints = await tx.reviewPoint.count({ where: { reviewId, status: { in: UNRESOLVED_POINT_STATUSES as any } } });
    const openBlockingPoints = await tx.reviewPoint.count({ where: { reviewId, severity: 'BLOCKING', status: { in: UNRESOLVED_POINT_STATUSES as any } } });
    const latest = await latestVersion(tx, review.documentId);
    const currentVersion = await tx.documentVersion.findUniqueOrThrow({ where: { id: review.currentRound!.reviewVersionId }, select: { id: true, version: true } });
    const verdict = evaluateTransition(String(review.status) as ReviewStatus, action, {
      actorAuthorized: true,
      reviewerHasAccess,
      openPoints,
      openBlockingPoints,
      hasRationale: Boolean(safeText(input.safeRationale)),
      reviewVersionId: currentVersion.id,
      reviewVersionNumber: currentVersion.version,
      latestVersionId: latest.id,
      latestVersionNumber: latest.version,
      approveVersionId: action === 'APPROVE' ? input.versionId || currentVersion.id : undefined,
      resubmitVersionId: action === 'RESUBMIT' ? input.versionId || latest.id : undefined,
      resubmitVersionNumber: action === 'RESUBMIT' ? latest.version : undefined,
    });
    if (!verdict.allowed) throw new DocumentReviewWorkflowError(verdict.reason === 'BLOCKING_POINTS_OPEN' ? 409 : 400, verdict.reason || 'TRANSITION_BLOCKED', 'Review transition is not allowed.');

    let roundId = review.currentRoundId;
    let versionId = currentVersion.id;
    if (action === 'RESUBMIT') {
      versionId = verdict.nextReviewVersionId!;
      const nextRoundNumber = review.currentRoundNumber + 1;
      const newRound = await tx.documentReviewRound.create({ data: { reviewId, roundNumber: nextRoundNumber, reviewVersionId: versionId, status: 'RESUBMITTED', submittedAt: new Date(), createdById: actor.userId } });
      roundId = newRound.id;
      const carry = await tx.reviewPoint.findMany({ where: { reviewId, status: { in: UNRESOLVED_POINT_STATUSES as any } } });
      for (const point of carry) {
        await tx.reviewPoint.create({ data: {
          reviewId, reviewRoundId: newRound.id, type: point.type, status: point.status, severity: point.severity, title: point.title,
          internalRationale: point.internalRationale, ownerId: point.ownerId, dueAt: point.dueAt, annotationId: point.annotationId,
          comparisonSegmentId: point.comparisonSegmentId, linkedTaskId: point.linkedTaskId, carriedFromPointId: point.id, createdById: actor.userId,
        } });
      }
      await tx.documentReview.update({ where: { id: reviewId }, data: { status: 'RESUBMITTED', currentRoundId: newRound.id, currentRoundNumber: nextRoundNumber, revision: { increment: 1 } } });
    } else {
      const data: Prisma.DocumentReviewUpdateInput = { status: verdict.nextStatus as any, revision: { increment: 1 } };
      if (action === 'ASSIGN') data.assignedReviewer = { connect: { id: reviewerId! } };
      if (action === 'APPROVE') { data.approvedVersion = { connect: { id: verdict.approvedVersionId! } }; data.completedAt = new Date(); }
      if (action === 'CANCEL' || action === 'CLOSE') data.completedAt = new Date();
      await tx.documentReview.update({ where: { id: reviewId }, data });
      await tx.documentReviewRound.update({ where: { id: review.currentRoundId! }, data: { status: verdict.nextStatus as any, startedAt: action === 'START' ? new Date() : review.currentRound!.startedAt, completedAt: ['APPROVE','CLOSE','CANCEL','REQUEST_CHANGES'].includes(action) ? new Date() : review.currentRound!.completedAt, revision: { increment: 1 } } });
    }
    const decisionAction = ({ ASSIGN: 'ASSIGNED', START: 'STARTED', REQUEST_CHANGES: 'CHANGES_REQUESTED', RESUBMIT: 'RESUBMITTED', APPROVE: 'APPROVED', CANCEL: 'CANCELLED', CLOSE: 'CLOSED' } as Record<ReviewAction, string>)[action];
    await decision(tx, { reviewId, reviewRoundId: roundId, action: decisionAction, actorId: actor.userId, versionId, safeRationale: input.safeRationale, metadataSafe: { fromStatus: review.status, toStatus: verdict.nextStatus }, idempotencyKey: input.idempotencyKey || null });
    await auditAndNotify(tx, { action: decisionAction, actorId: actor.userId, caseId: review.document.caseId, documentId: review.documentId, reviewId, roundId, versionId, recipientId: action === 'ASSIGN' ? reviewerId || null : review.ownerId });
    return loadReview(tx, reviewId);
  });
}

export async function addPoint(reviewId: string, actor: Actor, input: any, db: PrismaClient = defaultPrisma) {
  return db.$transaction(async (tx) => {
    const review = await loadReview(tx, reviewId);
    await assertActorAccess(tx, actor, review.document.caseId);
    const title = safeText(input.title, TITLE_LIMIT);
    if (!title) throw new DocumentReviewWorkflowError(400, 'TITLE_REQUIRED', 'title is required.');
    await validatePointSource(tx, review, input);
    const point = await tx.reviewPoint.create({ data: {
      reviewId,
      reviewRoundId: review.currentRoundId!,
      type: input.type,
      status: input.status || 'OPEN',
      severity: input.severity || 'NORMAL',
      title,
      internalRationale: safeText(input.internalRationale),
      ownerId: input.ownerId || null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      annotationId: input.annotationId || null,
      comparisonSegmentId: input.comparisonSegmentId || null,
      linkedTaskId: input.linkedTaskId || null,
      carriedFromPointId: input.carriedFromPointId || null,
      createdById: actor.userId,
    } });
    await decision(tx, { reviewId, reviewRoundId: review.currentRoundId, action: 'POINT_ADDED', actorId: actor.userId, metadataSafe: { pointId: point.id, type: point.type, severity: point.severity }, idempotencyKey: input.idempotencyKey || null });
    await auditAndNotify(tx, { action: 'POINT_ADDED', actorId: actor.userId, caseId: review.document.caseId, documentId: review.documentId, reviewId, roundId: review.currentRoundId, versionId: review.currentRound!.reviewVersionId, recipientId: review.assignedReviewerId });
    return point;
  });
}

export async function updatePoint(reviewId: string, pointId: string, actor: Actor, input: any, db: PrismaClient = defaultPrisma) {
  return db.$transaction(async (tx) => {
    const review = await loadReview(tx, reviewId);
    await assertActorAccess(tx, actor, review.document.caseId);
    const existing = await tx.reviewPoint.findFirst({ where: { id: pointId, reviewId } });
    if (!existing) throw new DocumentReviewWorkflowError(404, 'POINT_NOT_FOUND', 'Review point not found.');
    requireExpectedRevision(existing.revision, input.expectedRevision);
    const merged = { ...existing, ...input };
    await validatePointSource(tx, review, merged);
    const point = await tx.reviewPoint.update({ where: { id: pointId }, data: {
      type: input.type || undefined,
      status: input.status || undefined,
      severity: input.severity || undefined,
      title: input.title !== undefined ? safeText(input.title, TITLE_LIMIT)! : undefined,
      internalRationale: input.internalRationale !== undefined ? safeText(input.internalRationale) : undefined,
      ownerId: input.ownerId !== undefined ? input.ownerId || null : undefined,
      dueAt: input.dueAt !== undefined ? (input.dueAt ? new Date(input.dueAt) : null) : undefined,
      annotationId: input.annotationId !== undefined ? input.annotationId || null : undefined,
      comparisonSegmentId: input.comparisonSegmentId !== undefined ? input.comparisonSegmentId || null : undefined,
      linkedTaskId: input.linkedTaskId !== undefined ? input.linkedTaskId || null : undefined,
      revision: { increment: 1 },
    } });
    await decision(tx, { reviewId, reviewRoundId: point.reviewRoundId, action: 'POINT_UPDATED', actorId: actor.userId, metadataSafe: { pointId: point.id, status: point.status, severity: point.severity }, idempotencyKey: input.idempotencyKey || null });
    await auditAndNotify(tx, { action: 'POINT_UPDATED', actorId: actor.userId, caseId: review.document.caseId, documentId: review.documentId, reviewId, roundId: point.reviewRoundId, versionId: review.currentRound!.reviewVersionId, recipientId: review.assignedReviewerId });
    return point;
  });
}

async function validatePointSource(tx: Db, review: Awaited<ReturnType<typeof loadReview>>, input: any) {
  const type = String(input.type || '');
  if (!['ANNOTATION', 'COMPARISON_CHANGE', 'WHOLE_DOCUMENT'].includes(type)) throw new DocumentReviewWorkflowError(400, 'INVALID_POINT_TYPE', 'Invalid point type.');
  if (type === 'WHOLE_DOCUMENT' && (input.annotationId || input.comparisonSegmentId)) throw new DocumentReviewWorkflowError(400, 'INVALID_POINT_SOURCE', 'Whole-document point cannot link annotation or comparison segment.');
  if (type === 'ANNOTATION') {
    if (!input.annotationId || input.comparisonSegmentId) throw new DocumentReviewWorkflowError(400, 'ANNOTATION_REQUIRED', 'Annotation point requires exactly one annotation.');
    const annotation = await tx.documentAnnotation.findUnique({ where: { id: input.annotationId }, select: { documentId: true, documentVersionId: true } });
    if (!annotation) throw new DocumentReviewWorkflowError(404, 'ANNOTATION_NOT_FOUND', 'Annotation not found.');
    if (annotation.documentId !== review.documentId) throw new DocumentReviewWorkflowError(400, 'ANNOTATION_NOT_IN_REVIEW_DOCUMENT', 'Annotation must belong to the reviewed document.');
  }
  if (type === 'COMPARISON_CHANGE') {
    if (!input.comparisonSegmentId || input.annotationId) throw new DocumentReviewWorkflowError(400, 'COMPARISON_SEGMENT_REQUIRED', 'Comparison point requires exactly one segment.');
    const segment = await tx.documentChangeSegment.findUnique({ where: { id: input.comparisonSegmentId }, select: { comparison: { select: { documentId: true } } } });
    if (!segment) throw new DocumentReviewWorkflowError(404, 'COMPARISON_SEGMENT_NOT_FOUND', 'Comparison segment not found.');
    if (segment.comparison.documentId !== review.documentId) throw new DocumentReviewWorkflowError(400, 'SEGMENT_NOT_IN_REVIEW_DOCUMENT', 'Comparison segment must belong to the reviewed document.');
  }
  if (input.linkedTaskId) {
    const task = await tx.task.findUnique({ where: { id: input.linkedTaskId }, select: { caseId: true } });
    if (!task) throw new DocumentReviewWorkflowError(404, 'TASK_NOT_FOUND', 'Task not found.');
    if (task.caseId !== review.document.caseId) throw new DocumentReviewWorkflowError(400, 'TASK_NOT_IN_REVIEW_CASE', 'Linked task must belong to the same case.');
  }
}

export async function listPoints(reviewId: string, actor: Actor, filters: { status?: string; type?: string; limit?: number; offset?: number }, db: PrismaClient = defaultPrisma) {
  await getReview(reviewId, actor, db);
  const where: any = { reviewId };
  if (filters.status) where.status = filters.status;
  if (filters.type) where.type = filters.type;
  const limit = Math.min(Math.max(Number(filters.limit || 50), 1), 100);
  const offset = Math.max(Number(filters.offset || 0), 0);
  const [items, total] = await Promise.all([db.reviewPoint.findMany({ where, orderBy: { createdAt: 'asc' }, take: limit, skip: offset }), db.reviewPoint.count({ where })]);
  return { items, total, limit, offset };
}

export async function listDecisions(reviewId: string, actor: Actor, filters: { limit?: number; offset?: number }, db: PrismaClient = defaultPrisma) {
  await getReview(reviewId, actor, db);
  const limit = Math.min(Math.max(Number(filters.limit || 50), 1), 100);
  const offset = Math.max(Number(filters.offset || 0), 0);
  const [items, total] = await Promise.all([db.reviewDecision.findMany({ where: { reviewId }, orderBy: { createdAt: 'asc' }, take: limit, skip: offset }), db.reviewDecision.count({ where: { reviewId } })]);
  return { items, total, limit, offset };
}

export function nextActions(status: string) { return candidateActions(status as ReviewStatus); }
