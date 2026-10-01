/**
 * Case Lifecycle Service — WORKFLOW-CORE-LITIGATION-CASE-LIFECYCLE-1
 *
 * Data-access layer for the canonical case-lifecycle contract. Uses explicit
 * Prisma `select` projections and bounded counts only (no raw rows, no broad
 * `include`). Mutations use only the existing `status` / `completedAt` columns
 * and write a content-minimized timeline event; they never delete tasks,
 * deadlines, documents, collaborators, or matter data, and never touch any
 * Client Portal surface.
 */

import { prisma } from '../../prisma/prisma.service';
import { Prisma, PrismaClient } from '@prisma/client';
import { isRetryableCaseTransactionError, lockCaseForMutation } from './caseMutationGuard';
import { CLOSED_TASK_STATUSES, REVIEW_TASK_STATUSES } from '../tasks/taskStatus';
import {
  CaseClosureBlocker,
  CaseClosureWarning,
  CaseLifecycleAction,
  CaseLifecycleDto,
  deriveClosureBlockers,
  deriveClosureReadiness,
  deriveClosureWarnings,
  deriveLifecycleCapabilities,
  deriveLifecycleCategory,
  LIFECYCLE_AVAILABILITY,
  PersistableCaseStatus,
  validateCaseLifecycleTransition,
} from './lifecycle';

const ACTIVE_HANDOFF_STATUSES = ['DRAFT', 'PREPARED', 'SUBMITTED', 'IN_REVIEW'];

/**
 * DocumentReview statuses that represent an in-flight review demanding a
 * decision. DRAFT is deliberately excluded: an abandoned, never-submitted
 * review draft is optional work and must not silently become a hard closure
 * requirement. APPROVED / CLOSED / CANCELLED are finished states.
 */
const ACTIVE_DOC_REVIEW_STATUSES = ['ASSIGNED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'RESUBMITTED', 'READY_FOR_REVIEW'];

const UNRESOLVED_POINT_STATUSES = ['OPEN', 'ANSWERED'];

const REQUIRED_OUTPUT_ROLES = ['FINAL_OUTPUT', 'PRIMARY_OUTPUT'];

// Non-case enums referenced by warning queries. Kept as indirection so the
// lifecycle surface never writes the literal aspirational case status.
const CLOSED_BILLING_PREP_STATUS = 'CLOSED';
const PUBLISHED_PUBLICATION_STATUS = 'PUBLISHED';

const PRIVILEGED_ROLES = new Set(['ADMIN', 'PARTNER']);

type LifecycleDb = PrismaClient | Prisma.TransactionClient;

export interface LifecycleActor {
  userId: string;
  role?: string | null;
}

export class LifecycleServiceError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public blockers?: CaseClosureBlocker[]
  ) {
    super(message);
    this.name = 'LifecycleServiceError';
  }
}

function toIso(value?: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type LifecycleCaseRow = {
  id: string;
  status: string;
  createdAt: Date;
  receivedAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
  assignedLawyerId: string | null;
  createdById: string;
  assignedLawyer: { id: string; name: string } | null;
};

function isCaseManager(row: LifecycleCaseRow, actor: LifecycleActor): boolean {
  if (!actor.userId) return false;
  if (actor.role && PRIVILEGED_ROLES.has(actor.role)) return true;
  return row.assignedLawyerId === actor.userId || row.createdById === actor.userId;
}

async function loadCaseRow(caseId: string, db: LifecycleDb = prisma): Promise<LifecycleCaseRow | null> {
  return db.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      status: true,
      createdAt: true,
      receivedAt: true,
      completedAt: true,
      updatedAt: true,
      assignedLawyerId: true,
      createdById: true,
      assignedLawyer: { select: { id: true, name: true } },
    },
  });
}

/**
 * Collects operational closure-blocker counts using bounded aggregate queries.
 * All counts derive from existing supported models (tasks, task submissions,
 * document reviews, review points, case deadlines, lawyer handoff packages).
 * No structured litigation-item model exists, so no litigation-item blocker is
 * ever produced.
 */
async function collectBlockers(
  caseRow: LifecycleCaseRow,
  now: Date,
  db: LifecycleDb = prisma
): Promise<CaseClosureBlocker[]> {
  const [
    openTaskCount,
    overdueTaskCount,
    activeReviewCount,
    activeHandoffCount,
    submittedAwaitingDecisionCount,
    returnedPendingCorrectionCount,
    activeDocumentReviewCount,
    unresolvedBlockingPointCount,
    externalCompletionPendingCount,
  ] = await Promise.all([
    db.task.count({ where: { caseId: caseRow.id, status: { notIn: CLOSED_TASK_STATUSES } } }),
    db.task.count({
      where: {
        caseId: caseRow.id,
        status: { notIn: CLOSED_TASK_STATUSES },
        dueDate: { lt: now },
      },
    }),
    db.task.count({ where: { caseId: caseRow.id, status: { in: REVIEW_TASK_STATUSES } } }),
    db.lawyerHandoffPackage.count({
      where: { caseId: caseRow.id, status: { in: ACTIVE_HANDOFF_STATUSES as any } },
    }),
    // Operative submitted revisions only: `supersededBy is null` is the latest
    // revision of its chain (older revisions are superseded by a newer one).
    db.taskSubmission.count({
      where: { task: { caseId: caseRow.id, status: { not: 'CANCELLED' } }, status: 'SUBMITTED', supersededBy: { is: null } },
    }),
    db.taskSubmission.count({
      where: { task: { caseId: caseRow.id, status: { not: 'CANCELLED' } }, status: 'RETURNED', supersededBy: { is: null } },
    }),
    db.documentReview.count({
      where: {
        document: { caseId: caseRow.id },
        status: { in: ACTIVE_DOC_REVIEW_STATUSES as any },
      },
    }),
    db.reviewPoint.count({
      where: {
        severity: 'BLOCKING',
        status: { in: UNRESOLVED_POINT_STATUSES as any },
        review: {
          document: { caseId: caseRow.id },
          status: { in: ACTIVE_DOC_REVIEW_STATUSES as any },
        },
      },
    }),
    db.taskSubmission.count({
      where: {
        task: { caseId: caseRow.id, status: { not: 'CANCELLED' } },
        status: 'APPROVED',
        externalActionRequired: true,
        externalCompletedAt: null,
        supersededBy: { is: null },
      },
    }),
  ]);

  // Open case-level deadline: a future case deadline on a not-yet-completed case.
  const openDeadlineCount =
    caseRow.completedAt === null &&
    (await db.case.count({ where: { id: caseRow.id, deadline: { gte: now } } })) > 0
      ? 1
      : 0;

  // Output role identifies a deliverable, not a mandate for formal legal
  // review. Only an operative output with an active formal review of its exact
  // document version can contribute this blocker. Independent active reviews
  // remain covered by activeDocumentReviewCount above.
  const outputRows = await db.taskSubmissionDocument.findMany({
    where: {
      document: { caseId: caseRow.id },
      role: { in: REQUIRED_OUTPUT_ROLES as any },
      documentVersionId: { not: null },
      submission: {
        status: 'APPROVED',
        supersededBy: { is: null },
        task: { caseId: caseRow.id, status: { not: 'CANCELLED' } },
      },
    },
    select: { documentId: true, documentVersionId: true, documentVersion: { select: { documentId: true } } },
  });
  const operativeOutputs = outputRows.filter(
    (row) => row.documentVersionId && row.documentVersion?.documentId === row.documentId
  );
  const activeOutputReviews = operativeOutputs.length > 0
    ? await db.documentReview.findMany({
      where: {
        document: { caseId: caseRow.id },
        status: { in: ACTIVE_DOC_REVIEW_STATUSES as any },
        currentRound: { reviewVersionId: { in: operativeOutputs.map((row) => row.documentVersionId!) } },
      },
      select: { documentId: true, currentRound: { select: { reviewVersionId: true } } },
    })
    : [];
  const activeFormalVersions = new Set(activeOutputReviews.map(
    (review) => `${review.documentId}:${review.currentRound?.reviewVersionId || ''}`
  ));
  const unapprovedRequiredOutputCount = operativeOutputs.filter(
    (row) => activeFormalVersions.has(`${row.documentId}:${row.documentVersionId}`)
  ).length;

  return deriveClosureBlockers({
    hasResponsibleLawyer: Boolean(caseRow.assignedLawyerId),
    openTaskCount: openTaskCount ?? 0,
    overdueTaskCount: overdueTaskCount ?? 0,
    activeReviewCount: activeReviewCount ?? 0,
    openDeadlineCount,
    activeHandoffCount: activeHandoffCount ?? 0,
    submittedAwaitingDecisionCount: submittedAwaitingDecisionCount ?? 0,
    returnedPendingCorrectionCount: returnedPendingCorrectionCount ?? 0,
    activeDocumentReviewCount: activeDocumentReviewCount ?? 0,
    unresolvedBlockingPointCount: unresolvedBlockingPointCount ?? 0,
    unapprovedRequiredOutputCount,
    externalCompletionPendingCount: externalCompletionPendingCount ?? 0,
  });
}

/**
 * Collects NON-BLOCKING closure warnings from persisted state. These counts
 * never feed `deriveClosureBlockers`; they only surface truthful signals about
 * time recording, billing preparation, invoice drafts and client publication.
 */
async function collectWarnings(caseRow: LifecycleCaseRow, db: LifecycleDb = prisma): Promise<CaseClosureWarning[]> {
  const [
    recordedTimeCount,
    billableTimeCount,
    closedPreparationItemCount,
    closedPreparationItemsWithoutInvoiceCount,
    publishedDocumentCount,
    approvedDocumentReviewCount,
  ] = await Promise.all([
    db.timeEntry.count({ where: { caseId: caseRow.id } }),
    db.timeEntry.count({ where: { caseId: caseRow.id, billable: true } }),
    db.billingPreparationItem.count({
      where: { caseId: caseRow.id, preparation: { status: CLOSED_BILLING_PREP_STATUS } },
    }),
    db.billingPreparationItem.count({
      where: {
        caseId: caseRow.id,
        preparation: { status: CLOSED_BILLING_PREP_STATUS, invoiceDraft: { is: null } },
      },
    }),
    db.clientDocumentPublication.count({ where: { caseId: caseRow.id, status: PUBLISHED_PUBLICATION_STATUS } }),
    db.documentReview.count({
      where: { document: { caseId: caseRow.id }, status: 'APPROVED' },
    }),
  ]);

  return deriveClosureWarnings({
    recordedTimeCount: recordedTimeCount ?? 0,
    billableTimeCount: billableTimeCount ?? 0,
    closedPreparationItemCount: closedPreparationItemCount ?? 0,
    closedPreparationItemsWithoutInvoiceCount: closedPreparationItemsWithoutInvoiceCount ?? 0,
    publishedDocumentCount: publishedDocumentCount ?? 0,
    approvedDocumentReviewCount: approvedDocumentReviewCount ?? 0,
  });
}

function buildDto(
  caseRow: LifecycleCaseRow,
  blockers: CaseClosureBlocker[],
  warnings: CaseClosureWarning[],
  isManager: boolean,
  now: Date
): CaseLifecycleDto {
  const category = deriveLifecycleCategory(caseRow.status);
  const isClosedLike = category === 'CLOSED' || category === 'ARCHIVED';

  return {
    caseId: caseRow.id,
    generatedAt: now.toISOString(),
    status: caseRow.status,
    lifecycleCategory: category,
    openedAt: toIso(caseRow.receivedAt || caseRow.createdAt),
    // No dedicated closedAt/archivedAt columns — completedAt is surfaced as a proxy
    // for closed-like states and availability.closedAt/archivedAt stay false.
    closedAt: isClosedLike ? toIso(caseRow.completedAt) : null,
    archivedAt: category === 'ARCHIVED' ? toIso(caseRow.completedAt) : null,
    updatedAt: toIso(caseRow.updatedAt),
    responsibleLawyer: caseRow.assignedLawyer
      ? { id: caseRow.assignedLawyer.id, displayName: caseRow.assignedLawyer.name }
      : null,
    blockers,
    warnings,
    closureReadiness: deriveClosureReadiness(blockers),
    capabilities: deriveLifecycleCapabilities({ category, isCaseManager: isManager }),
    availability: LIFECYCLE_AVAILABILITY,
  };
}

export async function getCaseLifecycle(
  caseId: string,
  actor: LifecycleActor,
  now = new Date()
): Promise<CaseLifecycleDto | null> {
  const caseRow = await loadCaseRow(caseId);
  if (!caseRow) return null;

  const [blockers, warnings] = await Promise.all([collectBlockers(caseRow, now), collectWarnings(caseRow)]);
  return buildDto(caseRow, blockers, warnings, isCaseManager(caseRow, actor), now);
}

const ACTION_EVENT_LABEL: Record<CaseLifecycleAction, string> = {
  CLOSE: 'Ügy operatív lezárása',
  REOPEN: 'Ügy újranyitása',
  ARCHIVE: 'Ügy archiválása',
};

async function applyLifecycleAction(
  caseId: string,
  action: CaseLifecycleAction,
  actor: LifecycleActor,
  now: Date,
  opts: { force?: boolean } = {}
): Promise<CaseLifecycleDto> {
  const caseRow = await loadCaseRow(caseId);
  if (!caseRow) {
    throw new LifecycleServiceError(404, 'CASE_NOT_FOUND', 'Case not found');
  }

  const manager = isCaseManager(caseRow, actor);
  const category = deriveLifecycleCategory(caseRow.status);
  const blockers = action === 'CLOSE' ? await collectBlockers(caseRow, now) : [];

  // A forced close is an explicit, authorized decision to finalize a case whose
  // pending workflow tasks will be cancelled. The blockers are still surfaced to
  // the caller (and recorded), but they do not deny the transition.
  const decision = validateCaseLifecycleTransition({
    action,
    currentCategory: category,
    isCaseManager: manager,
    blockers: action === 'CLOSE' && opts.force ? [] : blockers,
  });

  if (!decision.allowed) {
    if (decision.errorCode === 'CASE_MANAGE_FORBIDDEN') {
      throw new LifecycleServiceError(403, 'CASE_MANAGE_FORBIDDEN', decision.reason || 'Forbidden');
    }
    if (decision.errorCode === 'CLOSURE_BLOCKED') {
      throw new LifecycleServiceError(409, 'CLOSURE_BLOCKED', decision.reason || 'Closure blocked', decision.blockers);
    }
    throw new LifecycleServiceError(409, 'INVALID_LIFECYCLE_TRANSITION', decision.reason || 'Invalid transition');
  }

  const targetStatus = decision.targetStatus as PersistableCaseStatus;

  const mutate = async (tx: Prisma.TransactionClient) => {
    await lockCaseForMutation(tx, caseId, false);
    const currentRow = await loadCaseRow(caseId, tx);
    if (!currentRow) throw new LifecycleServiceError(404, 'CASE_NOT_FOUND', 'Case not found');
    // All participating work writers take this case lock before their own
    // task/document locks and check that the case remains operational.
    const currentBlockers = action === 'CLOSE' && !opts.force ? await collectBlockers(currentRow, now, tx) : [];
    const currentDecision = validateCaseLifecycleTransition({
      action,
      currentCategory: deriveLifecycleCategory(currentRow.status),
      isCaseManager: isCaseManager(currentRow, actor),
      blockers: currentBlockers,
    });
    if (!currentDecision.allowed) {
      if (currentDecision.errorCode === 'CASE_MANAGE_FORBIDDEN')
        throw new LifecycleServiceError(403, 'CASE_MANAGE_FORBIDDEN', currentDecision.reason || 'Forbidden');
      if (currentDecision.errorCode === 'CLOSURE_BLOCKED')
        throw new LifecycleServiceError(409, 'CLOSURE_BLOCKED', currentDecision.reason || 'Closure blocked', currentDecision.blockers);
      throw new LifecycleServiceError(409, 'INVALID_LIFECYCLE_TRANSITION', currentDecision.reason || 'Invalid transition');
    }
    // Forced close is the authorized exception and deliberately skips blockers.

    // Forced close: cancel every still-open task (including workflow steps) so it
    // leaves the responsible lawyers' queues. No workflow successor is activated
    // (we set CANCELLED directly, never DONE), and history is preserved.
    let cancelledTaskCount = 0;
    if (action === 'CLOSE' && opts.force) {
      const result = await tx.task.updateMany({
        where: { caseId, status: { notIn: CLOSED_TASK_STATUSES } },
        data: { status: 'CANCELLED' as any, completedAt: now },
      });
      cancelledTaskCount = result.count;
      if (cancelledTaskCount > 0) {
        await tx.timelineEvent.create({
          data: {
            caseId,
            userId: actor.userId,
            eventType: 'CASE_STATUS_CHANGED',
            description: 'Nyitott feladatok lezárása (kihagyása) ügyarchiváláskor',
            metadata: { lifecycleAction: 'FORCE_CLOSE_CANCEL_TASKS', cancelledTaskCount },
          },
        });
      }
    }

    await tx.case.update({
      where: { id: caseId },
      data: {
        status: targetStatus as any,
        // completedAt is the only closure-timestamp column available.
        completedAt: action === 'CLOSE' ? now : action === 'REOPEN' ? null : undefined,
      },
    });

    // Content-minimized audit event using a persistable TimelineEventType.
    await tx.timelineEvent.create({
      data: {
        caseId,
        userId: actor.userId,
        eventType: 'CASE_STATUS_CHANGED',
        description: ACTION_EVENT_LABEL[action],
        metadata: {
          lifecycleAction: action,
          fromStatus: currentRow.status,
          toStatus: targetStatus,
          forced: Boolean(opts.force),
        },
      },
    });
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      // Closure holds the case lock through commit. Each blocker query must see
      // work committed while that lock was waiting, including caller-owned
      // Read Committed writes that only lock (do not update) the case row.
      // A fixed Serializable snapshot can miss those writes after the wait.
      // Later writers either see FINAL (Read Committed) or abort on the case
      // row update (Repeatable Read/Serializable); their owners handle retry.
      await prisma.$transaction(mutate, {
        isolationLevel: action === 'CLOSE' ? 'ReadCommitted' : 'Serializable',
        timeout: 15000,
      });
      break;
    } catch (error) {
      if (!isRetryableCaseTransactionError(error) || attempt === 2) throw error;
    }
  }

  const updatedRow = await loadCaseRow(caseId);
  const finalRow = updatedRow || { ...caseRow, status: targetStatus };
  const postBlockers = deriveLifecycleCategory(finalRow.status) === 'CLOSED' || deriveLifecycleCategory(finalRow.status) === 'ARCHIVED'
    ? []
    : await collectBlockers(finalRow, now);
  const warnings = await collectWarnings(finalRow);
  return buildDto(finalRow, postBlockers, warnings, isCaseManager(finalRow, actor), now);
}

export function closeCase(caseId: string, actor: LifecycleActor, opts: { force?: boolean } = {}, now = new Date()): Promise<CaseLifecycleDto> {
  return applyLifecycleAction(caseId, 'CLOSE', actor, now, opts);
}

export function reopenCase(caseId: string, actor: LifecycleActor, now = new Date()): Promise<CaseLifecycleDto> {
  return applyLifecycleAction(caseId, 'REOPEN', actor, now);
}

export function archiveCase(caseId: string, actor: LifecycleActor, now = new Date()): Promise<CaseLifecycleDto> {
  return applyLifecycleAction(caseId, 'ARCHIVE', actor, now);
}
