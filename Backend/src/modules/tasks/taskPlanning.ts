/**
 * TASK PLANNING — reusable task type catalogue + task work roles.
 *
 * Contracts (reconstructed from the interrupted implementation):
 *
 * Catalogue:
 * - Legacy TaskType remains the persisted task type; TaskDefinition is an
 *   optional, additive reusable template on top.
 * - A free label remains possible without saving to the catalogue.
 * - Saving a reusable definition is an explicit action (saveToCatalogue).
 * - Definitions are archived, never deleted; an archived definition cannot be
 *   selected for new tasks but existing tasks keep working.
 * - The label is snapshotted onto the Task at write time
 *   (taskTypeLabelSnapshot); later catalogue edits never rewrite history.
 * - Estimate precedence: explicit estimatedMinutes > definition
 *   defaultEstimatedMinutes > attentionCategory band default > none.
 *
 * Work roles:
 * - assignedToId remains the maker/executor; nothing here replaces it.
 * - plannedReviewerId is an optional planned reviewer; a reviewer can never be
 *   the task's worker (assignedTo) and cannot be a collaborator.
 * - TaskCollaborator rows are optional parallel workers.
 * - Neither role grants Case access: the target user must already pass the
 *   canonical case-access policy (ADMIN/PARTNER, creator, assigned lawyer or
 *   CaseCollaborator). The planning role is metadata, not an ACL grant.
 * - The TaskSubmission/TaskReviewDecision lifecycle is untouched.
 */

import { Prisma, PrismaClient, ReviewAttentionLevel, TaskDefinitionStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { InteractionError, InternalActor, requireInternal, safeText } from '../client-interaction/base';
import { ATTENTION_DURATION_BANDS, parseEstimatedMinutes, isAttentionCategory } from './attentionCategory';

type Db = PrismaClient | Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Task type catalogue
// ---------------------------------------------------------------------------

export interface TaskDefinitionInput {
  clientId?: string | null;
  label: string;
  description?: string;
  defaultEstimatedMinutes?: number | null;
  defaultAttentionCategory?: string | null;
}

export async function listTaskDefinitions(
  actor: InternalActor,
  opts: { clientId?: string; includeArchived?: boolean } = {},
  db: Db = defaultPrisma,
) {
  requireInternal(actor);
  const rows = await db.taskDefinition.findMany({
    where: {
      ...(opts.clientId ? { OR: [{ clientId: opts.clientId }, { clientId: null }] } : {}),
      ...(opts.includeArchived ? {} : { status: 'ACTIVE' as TaskDefinitionStatus }),
    },
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: [{ status: 'asc' }, { label: 'asc' }],
  });
  return rows.map((d) => ({
    id: d.id,
    clientId: d.clientId,
    label: d.label,
    description: d.description,
    defaultEstimatedMinutes: d.defaultEstimatedMinutes,
    defaultAttentionCategory: d.defaultAttentionCategory,
    status: d.status,
    createdBy: d.createdBy ? { id: d.createdBy.id, name: d.createdBy.name } : null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }));
}

export async function createTaskDefinition(actor: InternalActor, input: TaskDefinitionInput, db: Db = defaultPrisma) {
  requireInternal(actor);
  const label = safeText(input.label, 'label', 120, true)!;
  const description = safeText(input.description, 'description', 2000, false);
  const minutes = parseOptionalEstimate(input.defaultEstimatedMinutes);
  const attention = input.defaultAttentionCategory
    ? (isAttentionCategory(input.defaultAttentionCategory) ? (input.defaultAttentionCategory as ReviewAttentionLevel) : null)
    : null;
  if (input.defaultAttentionCategory && !attention) {
    throw new InteractionError(400, 'ATTENTION_CATEGORY_INVALID', 'Invalid attention category.');
  }
  const clientId = input.clientId ? String(input.clientId) : null;
  if (clientId) {
    const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) throw new InteractionError(404, 'CLIENT_NOT_FOUND', 'Client not found.');
  }
  const row = await db.taskDefinition.create({
    data: {
      clientId,
      label,
      description,
      defaultEstimatedMinutes: minutes,
      defaultAttentionCategory: attention,
      createdById: actor.userId,
    },
  });
  return row;
}

export async function updateTaskDefinition(
  actor: InternalActor,
  definitionId: string,
  patch: Partial<TaskDefinitionInput>,
  db: Db = defaultPrisma,
) {
  requireInternal(actor);
  const def = await db.taskDefinition.findUnique({ where: { id: definitionId } });
  if (!def) throw new InteractionError(404, 'TASK_DEFINITION_NOT_FOUND', 'Task definition not found.');

  const data: Prisma.TaskDefinitionUpdateInput = {};
  if (patch.label !== undefined) data.label = safeText(patch.label, 'label', 120, true)!;
  if (patch.description !== undefined) data.description = safeText(patch.description, 'description', 2000, false);
  if (patch.defaultEstimatedMinutes !== undefined) data.defaultEstimatedMinutes = parseOptionalEstimate(patch.defaultEstimatedMinutes);
  if (patch.defaultAttentionCategory !== undefined) {
    if (patch.defaultAttentionCategory == null) {
      data.defaultAttentionCategory = null;
    } else if (isAttentionCategory(patch.defaultAttentionCategory)) {
      data.defaultAttentionCategory = patch.defaultAttentionCategory as ReviewAttentionLevel;
    } else {
      throw new InteractionError(400, 'ATTENTION_CATEGORY_INVALID', 'Invalid attention category.');
    }
  }
  // Editing a catalogue entry never rewrites tasks that already snapshotted it.
  return db.taskDefinition.update({ where: { id: definitionId }, data });
}

export async function archiveTaskDefinition(actor: InternalActor, definitionId: string, db: Db = defaultPrisma) {
  requireInternal(actor);
  const def = await db.taskDefinition.findUnique({ where: { id: definitionId } });
  if (!def) throw new InteractionError(404, 'TASK_DEFINITION_NOT_FOUND', 'Task definition not found.');
  if (def.status === 'ARCHIVED') return def;
  return db.taskDefinition.update({
    where: { id: definitionId },
    data: { status: 'ARCHIVED' as TaskDefinitionStatus },
  });
}

// ---------------------------------------------------------------------------
// Planning resolution — the create/edit-time contract
// ---------------------------------------------------------------------------

export interface ResolvedTaskPlanning {
  taskDefinitionId: string | null;
  taskTypeLabelSnapshot: string | null;
  plannedReviewerId: string | null;
  estimatedMinutes: number | null;
  attentionCategory: string | null;
}

/** Band default = midpoint of the canonical attention duration range. */
function attentionBandDefault(category: string | null): number | null {
  if (!category || !isAttentionCategory(category)) return null;
  const band = ATTENTION_DURATION_BANDS[category];
  return Math.round((band.minMinutes + band.maxMinutes) / 2);
}

/**
 * Parse an optional estimate: absent/null → null; a provided value must be a
 * valid estimate (same rule as the task write path) or it is rejected.
 */
function parseOptionalEstimate(value: unknown): number | null {
  if (value == null) return null;
  const parsed = parseEstimatedMinutes(value);
  if (!parsed.ok) {
    throw new InteractionError(400, 'ESTIMATED_MINUTES_INVALID', `Invalid estimatedMinutes (${(parsed as { reason: string }).reason}).`);
  }
  return parsed.value;
}

/**
 * Resolves the additive planning fields for task create/update.
 *
 * Precedence for the persisted estimate:
 *   explicit estimatedMinutes > definition default > attention band > none.
 * The definition label is snapshotted at this moment; a free label is
 * snapshotted verbatim (without creating a catalogue entry).
 */
export async function resolveTaskPlanning(
  input: {
    taskDefinitionId?: string | null;
    taskTypeLabel?: string | null;
    plannedReviewerId?: string | null;
    estimatedMinutes?: number | null;
    attentionCategory?: string | null;
    saveToCatalogue?: boolean;
    taskDefinitionClientId?: string | null;
  },
  actor: InternalActor,
  db: Db = defaultPrisma,
): Promise<ResolvedTaskPlanning> {
  let definition: {
    id: string; label: string; status: TaskDefinitionStatus;
    defaultEstimatedMinutes: number | null; defaultAttentionCategory: ReviewAttentionLevel | null;
  } | null = null;

  if (input.taskDefinitionId) {
    definition = await db.taskDefinition.findUnique({ where: { id: String(input.taskDefinitionId) } });
    if (!definition) throw new InteractionError(404, 'TASK_DEFINITION_NOT_FOUND', 'Task definition not found.');
    if (definition.status !== 'ACTIVE') {
      throw new InteractionError(422, 'TASK_DEFINITION_ARCHIVED', 'An archived task definition cannot be applied to new work.');
    }
  }

  const freeLabel = safeText(input.taskTypeLabel, 'taskTypeLabel', 120, false);

  // Explicit catalogue save: only on explicit request, only for a free label.
  if (input.saveToCatalogue && freeLabel && !definition) {
    const minutes = parseOptionalEstimate(input.estimatedMinutes);
    const attention = input.attentionCategory && isAttentionCategory(input.attentionCategory)
      ? (input.attentionCategory as ReviewAttentionLevel)
      : null;
    const clientId = input.taskDefinitionClientId ? String(input.taskDefinitionClientId) : null;
    // clientId may be NULL (firm-wide); the [clientId,label] unique index does
    // not dedupe NULLs in Postgres, so dedupe by findFirst + create.
    const existing = await db.taskDefinition.findFirst({ where: { clientId, label: freeLabel } });
    const created = existing ?? (await db.taskDefinition.create({
      data: {
        clientId,
        label: freeLabel,
        defaultEstimatedMinutes: minutes,
        defaultAttentionCategory: attention,
        createdById: actor.userId,
      },
    }));
    definition = created;
    if (created.status !== 'ACTIVE') {
      throw new InteractionError(422, 'TASK_DEFINITION_ARCHIVED', 'An archived task definition cannot be applied to new work.');
    }
  }

  const labelSnapshot = definition?.label ?? freeLabel;

  const explicit = parseOptionalEstimate(input.estimatedMinutes);
  const defDefault = definition?.defaultEstimatedMinutes ?? null;
  const band = attentionBandDefault(input.attentionCategory ?? definition?.defaultAttentionCategory ?? null);
  const estimatedMinutes = explicit ?? defDefault ?? band;

  return {
    taskDefinitionId: definition?.id ?? null,
    taskTypeLabelSnapshot: labelSnapshot,
    plannedReviewerId: input.plannedReviewerId ? String(input.plannedReviewerId) : null,
    estimatedMinutes,
    attentionCategory: input.attentionCategory ?? definition?.defaultAttentionCategory ?? null,
  };
}

// ---------------------------------------------------------------------------
// Work roles — planned reviewer + collaborators. No case access is granted;
// eligibility requires the target user to ALREADY have case access.
// ---------------------------------------------------------------------------

async function assertUserCanBePlannedOnTask(
  caseId: string | null,
  userId: string,
  db: Db,
): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, status: true, isActive: true } });
  if (!user || user.isActive === false || String(user.status) !== 'ACTIVE') {
    throw new InteractionError(422, 'TASK_ROLE_USER_INELIGIBLE', 'The selected user is not an active workforce member.');
  }
  if (['ADMIN', 'PARTNER'].includes(String(user.role))) return;
  if (!caseId) {
    throw new InteractionError(422, 'TASK_ROLE_CASE_ACCESS_REQUIRED', 'Planning roles require existing case access.');
  }
  const caseRow = await db.case.findUnique({ where: { id: caseId }, select: { createdById: true, assignedLawyerId: true } });
  if (!caseRow) throw new InteractionError(404, 'CASE_NOT_FOUND', 'Case not found.');
  if (caseRow.createdById === userId || caseRow.assignedLawyerId === userId) return;
  const collab = await db.caseCollaborator.findFirst({ where: { caseId, userId }, select: { id: true } });
  if (!collab) {
    throw new InteractionError(422, 'TASK_ROLE_CASE_ACCESS_REQUIRED', 'Planning roles never grant case access — the user must already have it.');
  }
}

async function loadTaskForPlanning(taskId: string, db: Db) {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: { id: true, caseId: true, assignedToId: true, plannedReviewerId: true },
  });
  if (!task) throw new InteractionError(404, 'TASK_NOT_FOUND', 'Task not found.');
  return task;
}

export async function setPlannedReviewer(
  actor: InternalActor,
  taskId: string,
  reviewerId: string | null,
  db: Db = defaultPrisma,
) {
  requireInternal(actor);
  const task = await loadTaskForPlanning(taskId, db);
  if (reviewerId) {
    if (task.assignedToId && reviewerId === task.assignedToId) {
      throw new InteractionError(422, 'REVIEWER_CANNOT_BE_WORKER', 'The planned reviewer cannot be the task worker.');
    }
    await assertUserCanBePlannedOnTask(task.caseId, reviewerId, db);
  }
  return db.task.update({ where: { id: taskId }, data: { plannedReviewerId: reviewerId } });
}

export async function addTaskCollaborator(
  actor: InternalActor,
  taskId: string,
  userId: string,
  db: Db = defaultPrisma,
) {
  requireInternal(actor);
  const task = await loadTaskForPlanning(taskId, db);
  if (task.assignedToId && userId === task.assignedToId) {
    throw new InteractionError(422, 'COLLABORATOR_IS_WORKER', 'The assignee is already the task worker.');
  }
  if (task.plannedReviewerId && userId === task.plannedReviewerId) {
    throw new InteractionError(422, 'COLLABORATOR_IS_REVIEWER', 'The planned reviewer cannot also be a collaborator.');
  }
  await assertUserCanBePlannedOnTask(task.caseId, userId, db);
  return db.taskCollaborator.upsert({
    where: { taskId_userId: { taskId, userId } },
    create: { taskId, userId, addedById: actor.userId },
    update: {},
  });
}

export async function removeTaskCollaborator(
  actor: InternalActor,
  taskId: string,
  userId: string,
  db: Db = defaultPrisma,
) {
  requireInternal(actor);
  const row = await db.taskCollaborator.findUnique({ where: { taskId_userId: { taskId, userId } } });
  if (!row) return { removed: false };
  await db.taskCollaborator.delete({ where: { id: row.id } });
  return { removed: true };
}

/**
 * Validates the full planning-role set for a task create/update before the row
 * is written: reviewer is not the worker, collaborators are neither worker nor
 * reviewer, and every role user already has case access.
 */
export async function assertTaskPlanningRolesEligible(
  caseId: string | null,
  roles: { assigneeId?: string | null; plannedReviewerId?: string | null; collaboratorUserIds?: string[] },
  db: Db = defaultPrisma,
): Promise<void> {
  const assignee = roles.assigneeId ?? null;
  const reviewer = roles.plannedReviewerId ?? null;
  const collaborators = Array.from(new Set((roles.collaboratorUserIds ?? []).filter(Boolean)));
  if (reviewer) {
    if (assignee && reviewer === assignee) {
      throw new InteractionError(422, 'REVIEWER_CANNOT_BE_WORKER', 'The planned reviewer cannot be the task worker.');
    }
    if (collaborators.includes(reviewer)) {
      throw new InteractionError(422, 'REVIEWER_CANNOT_BE_WORKER', 'The planned reviewer cannot also be a collaborator.');
    }
    await assertUserCanBePlannedOnTask(caseId, reviewer, db);
  }
  for (const uid of collaborators) {
    if (assignee && uid === assignee) {
      throw new InteractionError(422, 'COLLABORATOR_IS_WORKER', 'The assignee is already the task worker.');
    }
    await assertUserCanBePlannedOnTask(caseId, uid, db);
  }
}

export async function listTaskCollaborators(actor: InternalActor, taskId: string, db: Db = defaultPrisma) {
  requireInternal(actor);
  const rows = await db.taskCollaborator.findMany({
    where: { taskId },
    include: { user: { select: { id: true, name: true, role: true } }, addedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => ({
    id: r.id,
    taskId: r.taskId,
    user: { id: r.user.id, name: r.user.name, role: r.user.role },
    addedBy: r.addedBy ? { id: r.addedBy.id, name: r.addedBy.name } : null,
    createdAt: r.createdAt.toISOString(),
  }));
}
