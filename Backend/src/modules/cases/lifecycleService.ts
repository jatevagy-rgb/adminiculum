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
import { CLOSED_TASK_STATUSES, REVIEW_TASK_STATUSES } from '../tasks/taskStatus';
import {
  CaseClosureBlocker,
  CaseLifecycleAction,
  CaseLifecycleDto,
  deriveClosureBlockers,
  deriveClosureReadiness,
  deriveLifecycleCapabilities,
  deriveLifecycleCategory,
  LIFECYCLE_AVAILABILITY,
  PersistableCaseStatus,
  validateCaseLifecycleTransition,
} from './lifecycle';

const ACTIVE_HANDOFF_STATUSES = ['DRAFT', 'PREPARED', 'SUBMITTED', 'IN_REVIEW'];

const PRIVILEGED_ROLES = new Set(['ADMIN', 'PARTNER']);

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

async function loadCaseRow(caseId: string): Promise<LifecycleCaseRow | null> {
  return prisma.case.findUnique({
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
 * All counts derive from existing supported models (tasks, case deadline,
 * lawyer handoff packages). No structured litigation-item model exists, so no
 * litigation-item blocker is ever produced.
 */
async function collectBlockers(caseRow: LifecycleCaseRow, now: Date): Promise<CaseClosureBlocker[]> {
  const [openTaskCount, overdueTaskCount, activeReviewCount, activeHandoffCount] = await Promise.all([
    prisma.task.count({ where: { caseId: caseRow.id, status: { notIn: CLOSED_TASK_STATUSES } } }),
    prisma.task.count({
      where: {
        caseId: caseRow.id,
        status: { notIn: CLOSED_TASK_STATUSES },
        dueDate: { lt: now },
      },
    }),
    prisma.task.count({ where: { caseId: caseRow.id, status: { in: REVIEW_TASK_STATUSES } } }),
    prisma.lawyerHandoffPackage.count({
      where: { caseId: caseRow.id, status: { in: ACTIVE_HANDOFF_STATUSES as any } },
    }),
  ]);

  // Open case-level deadline: a future case deadline on a not-yet-completed case.
  const openDeadlineCount =
    caseRow.completedAt === null &&
    (await prisma.case.count({ where: { id: caseRow.id, deadline: { gte: now } } })) > 0
      ? 1
      : 0;

  return deriveClosureBlockers({
    hasResponsibleLawyer: Boolean(caseRow.assignedLawyerId),
    openTaskCount,
    overdueTaskCount,
    activeReviewCount,
    openDeadlineCount,
    activeHandoffCount,
  });
}

function buildDto(caseRow: LifecycleCaseRow, blockers: CaseClosureBlocker[], isManager: boolean, now: Date): CaseLifecycleDto {
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

  const blockers = await collectBlockers(caseRow, now);
  return buildDto(caseRow, blockers, isCaseManager(caseRow, actor), now);
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
  now: Date
): Promise<CaseLifecycleDto> {
  const caseRow = await loadCaseRow(caseId);
  if (!caseRow) {
    throw new LifecycleServiceError(404, 'CASE_NOT_FOUND', 'Case not found');
  }

  const manager = isCaseManager(caseRow, actor);
  const category = deriveLifecycleCategory(caseRow.status);
  const blockers = action === 'CLOSE' ? await collectBlockers(caseRow, now) : [];

  const decision = validateCaseLifecycleTransition({
    action,
    currentCategory: category,
    isCaseManager: manager,
    blockers,
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
  const fromStatus = caseRow.status;

  await prisma.$transaction(async (tx) => {
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
          fromStatus,
          toStatus: targetStatus,
        },
      },
    });
  });

  const updatedRow = await loadCaseRow(caseId);
  const finalRow = updatedRow || { ...caseRow, status: targetStatus };
  const postBlockers = deriveLifecycleCategory(finalRow.status) === 'CLOSED' || deriveLifecycleCategory(finalRow.status) === 'ARCHIVED'
    ? []
    : await collectBlockers(finalRow, now);
  return buildDto(finalRow, postBlockers, isCaseManager(finalRow, actor), now);
}

export function closeCase(caseId: string, actor: LifecycleActor, now = new Date()): Promise<CaseLifecycleDto> {
  return applyLifecycleAction(caseId, 'CLOSE', actor, now);
}

export function reopenCase(caseId: string, actor: LifecycleActor, now = new Date()): Promise<CaseLifecycleDto> {
  return applyLifecycleAction(caseId, 'REOPEN', actor, now);
}

export function archiveCase(caseId: string, actor: LifecycleActor, now = new Date()): Promise<CaseLifecycleDto> {
  return applyLifecycleAction(caseId, 'ARCHIVE', actor, now);
}
