/**
 * Matter Intake Service — WORKFLOW-CORE-INTAKE-MATTER-OPENING-1
 *
 * Data-access layer for the canonical intake/opening-readiness contract, the
 * explicit opening-task bundle, activation/decline transitions, and the intake
 * queue. Explicit Prisma `select` projections and bounded queries only — no raw
 * rows, no broad `include`, no sensitive identity detail beyond the approved
 * client contact fields, no Client Portal effect, no external notification.
 */

import { prisma } from '../../prisma/prisma.service';
import { createTask } from '../tasks/services';
import {
  ACTIVATION_TARGET_STATUS,
  DECLINE_TARGET_STATUS,
  deriveIntakeBlockers,
  deriveIntakeCapabilities,
  deriveIntakeChecklist,
  deriveIntakeReadiness,
  INTAKE_AVAILABILITY,
  INTAKE_STATUS,
  IntakeBlocker,
  IntakeCapabilities,
  IntakeChecklistItem,
  IntakeReadinessSummary,
  isValidOpeningTaskCode,
  OPENING_TASK_DEFINITIONS,
  openingTaskTypeForCode,
  validateMatterActivation,
  validateMatterDecline,
} from './intakeReadiness';

const PRIVILEGED_ROLES = new Set(['ADMIN', 'PARTNER']);
const OPEN_TASK_EXCLUDED = ['COMPLETED', 'DONE', 'APPROVED', 'REJECTED', 'DECLINED', 'CANCELLED', 'ARCHIVED'];
const QUEUE_SCAN_LIMIT = 200;
const QUEUE_MAX_LIMIT = 50;

export interface IntakeActor {
  userId: string;
  role?: string | null;
}

export class IntakeServiceError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public blockers?: IntakeBlocker[]
  ) {
    super(message);
    this.name = 'IntakeServiceError';
  }
}

export interface MatterIntakeReadinessDto {
  caseId: string;
  generatedAt: string;
  case: {
    displayName: string;
    reference?: string | null;
    status: string;
    clientRole?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  };
  client: {
    id: string;
    displayName: string;
    type?: string | null;
    identityStatus?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  responsibility: {
    responsibleLawyer?: { id: string; displayName: string } | null;
    collaborators: Array<{ id: string; displayName: string; role?: string | null }>;
  };
  conflictReview: {
    status: 'UNAVAILABLE' | 'NOT_RECORDED' | 'REVIEW_REQUIRED' | 'CLEARED' | 'BLOCKED';
    reviewedAt?: string | null;
    reviewer?: { id: string; displayName: string } | null;
    safeLabel?: string | null;
  };
  checklist: IntakeChecklistItem[];
  blockers: IntakeBlocker[];
  readiness: IntakeReadinessSummary;
  capabilities: IntakeCapabilities;
  availability: typeof INTAKE_AVAILABILITY;
}

function toIso(value?: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type IntakeCaseRow = {
  id: string;
  caseNumber: string;
  title: string;
  status: string;
  description: string | null;
  clientRole: string | null;
  deadline: Date | null;
  createdAt: Date;
  updatedAt: Date;
  assignedLawyerId: string | null;
  createdById: string;
  assignedLawyer: { id: string; name: string } | null;
  client: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    taxNumber: string | null;
    companyRegistrationNumber: string | null;
  } | null;
};

const INTAKE_CASE_SELECT = {
  id: true,
  caseNumber: true,
  title: true,
  status: true,
  description: true,
  clientRole: true,
  deadline: true,
  createdAt: true,
  updatedAt: true,
  assignedLawyerId: true,
  createdById: true,
  assignedLawyer: { select: { id: true, name: true } },
  client: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      taxNumber: true,
      companyRegistrationNumber: true,
    },
  },
} as const;

function isCaseManager(row: { assignedLawyerId: string | null; createdById: string }, actor: IntakeActor): boolean {
  if (!actor.userId) return false;
  if (actor.role && PRIVILEGED_ROLES.has(actor.role)) return true;
  return row.assignedLawyerId === actor.userId || row.createdById === actor.userId;
}

function clientHasContactData(client: IntakeCaseRow['client']): boolean {
  if (!client) return false;
  return Boolean(client.email || client.phone || client.taxNumber || client.companyRegistrationNumber);
}

function checklistInputFromRow(row: IntakeCaseRow, openTaskCount: number) {
  return {
    hasClient: Boolean(row.client),
    clientHasContactData: clientHasContactData(row.client),
    hasClientRole: Boolean(row.clientRole && row.clientRole.trim()),
    hasResponsibleLawyer: Boolean(row.assignedLawyerId),
    hasDescription: Boolean(row.description && row.description.trim()),
    openTaskCount,
    hasInitialDeadline: Boolean(row.deadline),
    caseId: row.id,
  };
}

export async function getCaseIntakeReadiness(
  caseId: string,
  actor: IntakeActor,
  now = new Date()
): Promise<MatterIntakeReadinessDto | null> {
  const caseRow = (await prisma.case.findUnique({
    where: { id: caseId },
    select: INTAKE_CASE_SELECT,
  })) as IntakeCaseRow | null;
  if (!caseRow) return null;

  const [openTaskCount, collaborators] = await Promise.all([
    prisma.task.count({ where: { caseId, status: { notIn: OPEN_TASK_EXCLUDED as any } } }),
    prisma.caseCollaborator.findMany({
      where: { caseId },
      orderBy: { addedAt: 'asc' },
      take: 12,
      select: { role: true, user: { select: { id: true, name: true } } },
    }),
  ]);

  const checklist = deriveIntakeChecklist(checklistInputFromRow(caseRow, openTaskCount));
  const blockers = deriveIntakeBlockers(checklist);
  const readiness = deriveIntakeReadiness(checklist, blockers);
  const manager = isCaseManager(caseRow, actor);

  return {
    caseId: caseRow.id,
    generatedAt: now.toISOString(),
    case: {
      displayName: caseRow.title || caseRow.caseNumber,
      reference: caseRow.caseNumber,
      status: caseRow.status,
      clientRole: caseRow.clientRole,
      createdAt: toIso(caseRow.createdAt),
      updatedAt: toIso(caseRow.updatedAt),
    },
    client: caseRow.client
      ? {
          id: caseRow.client.id,
          displayName: caseRow.client.name,
          // No person/organization type field and no identity-verification
          // status exist in the schema — both stay null (never inferred).
          type: null,
          identityStatus: null,
          email: caseRow.client.email,
          phone: caseRow.client.phone,
        }
      : null,
    responsibility: {
      responsibleLawyer: caseRow.assignedLawyer
        ? { id: caseRow.assignedLawyer.id, displayName: caseRow.assignedLawyer.name }
        : null,
      collaborators: collaborators.map((collaborator) => ({
        id: collaborator.user.id,
        displayName: collaborator.user.name,
        role: collaborator.role,
      })),
    },
    conflictReview: {
      // No structured conflict-review persistence exists in the schema.
      status: 'UNAVAILABLE',
      reviewedAt: null,
      reviewer: null,
      safeLabel: 'Az összeférhetetlenségi ellenőrzés nincs strukturáltan rögzítve.',
    },
    checklist,
    blockers,
    readiness,
    capabilities: deriveIntakeCapabilities({
      status: caseRow.status,
      isCaseManager: manager,
      readyForActivation: readiness.readyForActivation,
    }),
    availability: INTAKE_AVAILABILITY,
  };
}

// ---------------------------------------------------------------------------
// Opening task bundle — explicit, user-confirmed only
// ---------------------------------------------------------------------------

export interface CreateOpeningTasksResult {
  caseId: string;
  created: Array<{ id: string; code: string; title: string; dueAt: string | null }>;
  skippedExisting: string[];
  availableCodes: Array<{ code: string; title: string }>;
}

export async function createOpeningTasks(
  caseId: string,
  actor: IntakeActor,
  body: unknown
): Promise<CreateOpeningTasksResult> {
  const caseRow = await prisma.case.findUnique({
    where: { id: caseId },
    select: { id: true, status: true, assignedLawyerId: true, createdById: true },
  });
  if (!caseRow) {
    throw new IntakeServiceError(404, 'CASE_NOT_FOUND', 'Case not found');
  }
  if (!isCaseManager(caseRow, actor)) {
    throw new IntakeServiceError(403, 'CASE_MANAGE_FORBIDDEN', 'A művelethez ügykezelői jogosultság szükséges.');
  }
  const status = String(caseRow.status || '').toUpperCase();
  if (status === 'ARCHIVED' || status === 'CANCELLED' || status === 'FINAL') {
    throw new IntakeServiceError(409, 'INVALID_INTAKE_STATE', 'Lezárt vagy archivált ügyhöz nem hozható létre nyitó feladat.');
  }

  const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  for (const forbidden of ['status', 'caseId', 'createdById', 'assignedById', 'description', 'metadata', 'workspaceText']) {
    if (forbidden in payload) {
      throw new IntakeServiceError(400, 'UNSUPPORTED_OPENING_TASK_FIELD', `Field ${forbidden} is not accepted for opening-task creation.`);
    }
  }

  const rawTasks = Array.isArray(payload.tasks) ? payload.tasks : null;
  if (!rawTasks || rawTasks.length === 0) {
    throw new IntakeServiceError(400, 'NO_TASKS_SELECTED', 'Legalább egy nyitó feladatot ki kell választani. Automatikus létrehozás nincs.');
  }
  if (rawTasks.length > OPENING_TASK_DEFINITIONS.length) {
    throw new IntakeServiceError(400, 'TOO_MANY_TASKS', 'Túl sok nyitó feladat.');
  }

  type ParsedSelection = { code: string; title: string; assigneeId?: string; dueAt?: Date };
  const parsed: ParsedSelection[] = [];
  const seenCodes = new Set<string>();
  for (const entry of rawTasks) {
    const item = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
    const code = String(item.code || '').trim().toUpperCase();
    if (!isValidOpeningTaskCode(code)) {
      throw new IntakeServiceError(400, 'INVALID_OPENING_TASK_CODE', `Ismeretlen nyitó feladat kód: ${code || '(üres)'}`);
    }
    if (seenCodes.has(code)) continue; // deduplicate within request
    seenCodes.add(code);

    let dueAt: Date | undefined;
    if (item.dueAt) {
      const parsedDate = new Date(String(item.dueAt));
      if (Number.isNaN(parsedDate.getTime())) {
        throw new IntakeServiceError(400, 'INVALID_DUE_DATE', 'Érvénytelen határidő.');
      }
      dueAt = parsedDate;
    }

    const assigneeId = typeof item.assigneeId === 'string' && item.assigneeId.trim() ? item.assigneeId.trim() : undefined;
    const definition = OPENING_TASK_DEFINITIONS.find((candidate) => candidate.code === code)!;
    parsed.push({ code, title: definition.title, assigneeId, dueAt });
  }

  // Assignees must be part of the authorized case team.
  const requestedAssignees = [...new Set(parsed.map((item) => item.assigneeId).filter(Boolean))] as string[];
  if (requestedAssignees.length > 0) {
    const collaborators = await prisma.caseCollaborator.findMany({
      where: { caseId, userId: { in: requestedAssignees } },
      select: { userId: true },
    });
    const allowed = new Set<string>([
      ...(caseRow.assignedLawyerId ? [caseRow.assignedLawyerId] : []),
      caseRow.createdById,
      ...collaborators.map((collaborator) => collaborator.userId),
    ]);
    for (const assigneeId of requestedAssignees) {
      if (!allowed.has(assigneeId)) {
        throw new IntakeServiceError(400, 'ASSIGNEE_NOT_ON_CASE_TEAM', 'A feladat csak az ügy csapatának tagjára osztható ki.');
      }
    }
  }

  // Structured dedupe via the existing Task.type code convention: an open task
  // with the same case + opening code is not recreated (deterministic repeat).
  const existing = await prisma.task.findMany({
    where: {
      caseId,
      type: { in: parsed.map((item) => openingTaskTypeForCode(item.code)) },
      status: { notIn: OPEN_TASK_EXCLUDED as any },
    },
    select: { type: true },
  });
  const existingTypes = new Set(existing.map((task) => String(task.type)));

  const created: CreateOpeningTasksResult['created'] = [];
  const skippedExisting: string[] = [];

  for (const selection of parsed) {
    const typeCode = openingTaskTypeForCode(selection.code);
    if (existingTypes.has(typeCode)) {
      skippedExisting.push(selection.code);
      continue;
    }
    const task = await createTask({
      caseId,
      title: selection.title,
      taskType: 'OTHER',
      type: typeCode,
      assignedTo: selection.assigneeId,
      assignedBy: actor.userId,
      dueDate: selection.dueAt,
    });
    created.push({
      id: task.id,
      code: selection.code,
      title: task.title,
      dueAt: task.dueDate ? task.dueDate.toISOString() : null,
    });
  }

  return {
    caseId,
    created,
    skippedExisting,
    availableCodes: OPENING_TASK_DEFINITIONS.map((definition) => ({ code: definition.code, title: definition.title })),
  };
}

// ---------------------------------------------------------------------------
// Activation / decline — explicit transitions on real CaseStatus values only
// ---------------------------------------------------------------------------

async function applyIntakeTransition(
  caseId: string,
  actor: IntakeActor,
  action: 'ACTIVATE' | 'DECLINE',
  now: Date
): Promise<MatterIntakeReadinessDto> {
  const caseRow = (await prisma.case.findUnique({
    where: { id: caseId },
    select: INTAKE_CASE_SELECT,
  })) as IntakeCaseRow | null;
  if (!caseRow) {
    throw new IntakeServiceError(404, 'CASE_NOT_FOUND', 'Case not found');
  }

  const manager = isCaseManager(caseRow, actor);
  let decision;
  if (action === 'ACTIVATE') {
    const openTaskCount = await prisma.task.count({
      where: { caseId, status: { notIn: OPEN_TASK_EXCLUDED as any } },
    });
    const checklist = deriveIntakeChecklist(checklistInputFromRow(caseRow, openTaskCount));
    const blockers = deriveIntakeBlockers(checklist);
    decision = validateMatterActivation({ currentStatus: caseRow.status, isCaseManager: manager, blockers });
  } else {
    decision = validateMatterDecline({ currentStatus: caseRow.status, isCaseManager: manager });
  }

  if (!decision.allowed) {
    if (decision.errorCode === 'CASE_MANAGE_FORBIDDEN') {
      throw new IntakeServiceError(403, 'CASE_MANAGE_FORBIDDEN', decision.reason || 'Forbidden');
    }
    if (decision.errorCode === 'ACTIVATION_BLOCKED') {
      throw new IntakeServiceError(409, 'ACTIVATION_BLOCKED', decision.reason || 'Blocked', decision.blockers);
    }
    throw new IntakeServiceError(409, 'INVALID_INTAKE_STATE', decision.reason || 'Invalid state');
  }

  const targetStatus = decision.targetStatus as string;
  await prisma.$transaction(async (tx) => {
    await tx.case.update({
      where: { id: caseId },
      data: { status: targetStatus as any },
    });
    // Content-minimized audit event — no client data, no narrative.
    await tx.timelineEvent.create({
      data: {
        caseId,
        userId: actor.userId,
        eventType: 'CASE_STATUS_CHANGED',
        description: action === 'ACTIVATE' ? 'Ügy operatív aktiválása (beérkezésből)' : 'Beérkezett ügy elutasítása',
        metadata: {
          intakeAction: action,
          fromStatus: caseRow.status,
          toStatus: targetStatus,
        },
      },
    });
  });

  const refreshed = await getCaseIntakeReadiness(caseId, actor, now);
  if (!refreshed) {
    throw new IntakeServiceError(404, 'CASE_NOT_FOUND', 'Case not found');
  }
  return refreshed;
}

export function activateMatter(caseId: string, actor: IntakeActor, now = new Date()): Promise<MatterIntakeReadinessDto> {
  return applyIntakeTransition(caseId, actor, 'ACTIVATE', now);
}

export function declineIntake(caseId: string, actor: IntakeActor, now = new Date()): Promise<MatterIntakeReadinessDto> {
  return applyIntakeTransition(caseId, actor, 'DECLINE', now);
}

// ---------------------------------------------------------------------------
// Intake queue
// ---------------------------------------------------------------------------

export type IntakeQueueScope = 'MY_INTAKES' | 'MY_CASES' | 'TEAM';

export interface IntakeQueueDto {
  generatedAt: string;
  summary: {
    total: number;
    missingClient: number;
    missingResponsibleLawyer: number;
    conflictReviewRequired: number;
    readyForActivation: number;
    blocked: number;
  };
  items: Array<{
    caseId: string;
    displayName: string;
    reference?: string | null;
    status: string;
    client?: { id: string; displayName: string } | null;
    responsibleLawyer?: { id: string; displayName: string } | null;
    readiness: IntakeReadinessSummary;
    blockers: Array<{ code: string; label: string }>;
    nextStep?: { code: string; label: string; href?: string | null } | null;
    updatedAt?: string | null;
    href: string;
  }>;
  pagination: { limit: number; offset: number; hasMore: boolean };
  availability: {
    conflictReview: boolean;
    engagementState: boolean;
    teamScope: boolean;
  };
}

function parseQueueLimit(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return QUEUE_MAX_LIMIT;
  return Math.min(parsed, QUEUE_MAX_LIMIT);
}

function parseQueueOffset(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export async function getIntakeQueue(params: {
  actor: IntakeActor;
  scope?: unknown;
  status?: unknown;
  limit?: unknown;
  offset?: unknown;
  now?: Date;
}): Promise<IntakeQueueDto> {
  const now = params.now || new Date();
  const scope = String(params.scope || 'MY_INTAKES').trim().toUpperCase();
  if (scope !== 'MY_INTAKES' && scope !== 'MY_CASES' && scope !== 'TEAM') {
    throw new IntakeServiceError(400, 'INVALID_INTAKE_SCOPE', 'Unsupported intake scope.');
  }
  const isPrivileged = Boolean(params.actor.role && PRIVILEGED_ROLES.has(params.actor.role));
  if (scope === 'TEAM' && !isPrivileged) {
    throw new IntakeServiceError(403, 'TEAM_SCOPE_FORBIDDEN', 'Team intake scope requires a privileged role.');
  }

  const statusFilter = String(params.status || 'ALL').trim().toUpperCase();
  if (statusFilter !== 'ALL' && statusFilter !== 'NEEDS_ATTENTION' && statusFilter !== 'READY') {
    throw new IntakeServiceError(400, 'INVALID_INTAKE_STATUS_FILTER', 'Unsupported intake status filter.');
  }

  const limit = parseQueueLimit(params.limit);
  const offset = parseQueueOffset(params.offset);
  const userId = params.actor.userId;

  const where: any = { status: INTAKE_STATUS as any };
  if (scope === 'MY_INTAKES') {
    where.OR = [{ assignedLawyerId: userId }, { createdById: userId }];
  } else if (scope === 'MY_CASES') {
    where.OR = [
      { assignedLawyerId: userId },
      { createdById: userId },
      { collaborators: { some: { userId } } },
    ];
  }
  // TEAM (privileged): all intake-state cases.

  const caseRows = (await prisma.case.findMany({
    where,
    select: INTAKE_CASE_SELECT,
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: QUEUE_SCAN_LIMIT,
  })) as IntakeCaseRow[];

  const caseIds = caseRows.map((row) => row.id);
  const taskCounts = new Map<string, number>();
  if (caseIds.length > 0) {
    const openTasks = await prisma.task.findMany({
      where: { caseId: { in: caseIds }, status: { notIn: OPEN_TASK_EXCLUDED as any } },
      select: { caseId: true },
      take: 2000,
    });
    for (const task of openTasks) {
      taskCounts.set(task.caseId, (taskCounts.get(task.caseId) || 0) + 1);
    }
  }

  const allItems = caseRows.map((row) => {
    const checklist = deriveIntakeChecklist(checklistInputFromRow(row, taskCounts.get(row.id) || 0));
    const blockers = deriveIntakeBlockers(checklist);
    const readiness = deriveIntakeReadiness(checklist, blockers);
    const nextIncomplete = checklist.find((item) => item.required && item.available && !item.complete) || null;

    return {
      caseId: row.id,
      displayName: row.title || row.caseNumber,
      reference: row.caseNumber,
      status: row.status,
      client: row.client ? { id: row.client.id, displayName: row.client.name } : null,
      responsibleLawyer: row.assignedLawyer
        ? { id: row.assignedLawyer.id, displayName: row.assignedLawyer.name }
        : null,
      readiness,
      blockers: blockers.map((blocker) => ({ code: blocker.code, label: blocker.label })),
      nextStep: nextIncomplete
        ? { code: nextIncomplete.code, label: nextIncomplete.label, href: nextIncomplete.href ?? null }
        : null,
      updatedAt: toIso(row.updatedAt),
      href: `/cases/${encodeURIComponent(row.id)}`,
    };
  });

  const filtered = allItems.filter((item) => {
    if (statusFilter === 'NEEDS_ATTENTION') return !item.readiness.readyForActivation;
    if (statusFilter === 'READY') return item.readiness.readyForActivation;
    return true;
  });

  const page = filtered.slice(offset, offset + limit);

  return {
    generatedAt: now.toISOString(),
    summary: {
      total: allItems.length,
      missingClient: allItems.filter((item) => item.blockers.some((blocker) => blocker.code === 'MISSING_CLIENT')).length,
      missingResponsibleLawyer: allItems.filter((item) =>
        item.blockers.some((blocker) => blocker.code === 'MISSING_RESPONSIBLE_LAWYER')
      ).length,
      // No conflict-review persistence → this count is always 0 (never simulated).
      conflictReviewRequired: 0,
      readyForActivation: allItems.filter((item) => item.readiness.readyForActivation).length,
      blocked: allItems.filter((item) => item.blockers.length > 0).length,
    },
    items: page,
    pagination: { limit, offset, hasMore: filtered.length > offset + limit },
    availability: {
      conflictReview: false,
      engagementState: false,
      teamScope: isPrivileged,
    },
  };
}
