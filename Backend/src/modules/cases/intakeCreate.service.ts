/**
 * Transactional matter intake (CASE-INTAKE-REDESIGN-1).
 *
 * Creates a matter together with everything the user configured at intake —
 * participants, typed deadlines, communication thread links and initial tasks —
 * inside ONE transaction. Either the whole work context exists or nothing does;
 * a half-created matter is never left behind.
 *
 * The legacy `POST /cases` endpoint is untouched and remains the simple path.
 * This is an additive, explicitly versioned intake endpoint.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';

export class CaseIntakeError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
    this.name = 'CaseIntakeError';
  }
}

// ---- bounds -------------------------------------------------------------
const MAX_TITLE = 300;
const MAX_CONTEXT = 4000;
const MAX_NAME = 200;
const MAX_ROLE = 64;
const MAX_NOTE = 2000;
const MAX_PARTICIPANTS = 25;
const MAX_DEADLINES = 10;
const MAX_TASKS = 20;
const MAX_THREADS = 20;
const MAX_REMINDER_MINUTES = 43200; // 30 days

const DEADLINE_TYPES = new Set(['STATUTORY', 'CLIENT_COMMITMENT', 'INTERNAL', 'NEXT_ACTION', 'OTHER']);
const RELATIVE_UNITS: Record<string, number> = { MINUTE: 60_000, HOUR: 3_600_000, DAY: 86_400_000, WEEK: 604_800_000 };
const PARTICIPANT_SIDES = new Set(['CLIENT', 'OPPOSING', 'NEUTRAL', 'OTHER']);
const TASK_PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

export interface CaseIntakeInput {
  clientId?: unknown;
  title?: unknown;
  matterType?: unknown;
  clientRole?: unknown;
  internalReference?: unknown;
  assignedLawyerId?: unknown;
  startingContext?: unknown;
  participants?: unknown;
  externalParticipants?: unknown;
  deadlines?: unknown;
  communicationThreadIds?: unknown;
  primaryCommunicationThreadId?: unknown;
  initialTasks?: unknown;
}

// ---- scalar helpers -----------------------------------------------------
function str(value: unknown, max: number, field: string, required = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new CaseIntakeError('FIELD_REQUIRED', `${field} is required.`);
    return null;
  }
  if (typeof value !== 'string') throw new CaseIntakeError('INVALID_FIELD', `${field} must be a string.`);
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) throw new CaseIntakeError('FIELD_REQUIRED', `${field} is required.`);
    return null;
  }
  if (trimmed.length > max) throw new CaseIntakeError('FIELD_TOO_LONG', `${field} is too long.`);
  return trimmed;
}

function arr(value: unknown, max: number, field: string): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new CaseIntakeError('INVALID_FIELD', `${field} must be an array.`);
  if (value.length > max) throw new CaseIntakeError('TOO_MANY_ITEMS', `${field} accepts at most ${max} items.`);
  return value;
}

function obj(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CaseIntakeError('INVALID_FIELD', `${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function isoDate(value: unknown, field: string): Date {
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new CaseIntakeError('INVALID_DATE', `${field} is not a valid date.`);
  return parsed;
}

/**
 * Resolve a deadline to an absolute moment. Relative input is converted here on
 * the server so the stored dueAt never depends on the client's clock drift, and
 * the original expression is preserved for display.
 */
export function resolveDeadlineDueAt(
  raw: Record<string, unknown>,
  now: Date = new Date()
): { dueAt: Date; inputMode: 'ABSOLUTE' | 'RELATIVE'; relativeValue: number | null; relativeUnit: string | null } {
  const mode = String(raw.inputMode || 'ABSOLUTE').toUpperCase();
  if (mode === 'RELATIVE') {
    const unit = String(raw.relativeUnit || '').toUpperCase();
    const ms = RELATIVE_UNITS[unit];
    if (!ms) throw new CaseIntakeError('INVALID_RELATIVE_UNIT', 'relativeUnit must be MINUTE, HOUR, DAY or WEEK.');
    const amount = Number(raw.relativeValue);
    if (!Number.isInteger(amount) || amount <= 0 || amount > 1000) {
      throw new CaseIntakeError('INVALID_RELATIVE_VALUE', 'relativeValue must be a positive integer (max 1000).');
    }
    return { dueAt: new Date(now.getTime() + amount * ms), inputMode: 'RELATIVE', relativeValue: amount, relativeUnit: unit };
  }
  if (mode !== 'ABSOLUTE') throw new CaseIntakeError('INVALID_INPUT_MODE', 'inputMode must be ABSOLUTE or RELATIVE.');
  return { dueAt: isoDate(raw.dueAt, 'dueAt'), inputMode: 'ABSOLUTE', relativeValue: null, relativeUnit: null };
}

function reminderMinutes(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_REMINDER_MINUTES) {
    throw new CaseIntakeError('INVALID_REMINDER', 'reminderMinutesBefore must be between 0 and 43200.');
  }
  return parsed;
}

// ---- normalization ------------------------------------------------------
function normalizeParticipants(value: unknown) {
  return arr(value, MAX_PARTICIPANTS, 'participants').map((entry) => {
    const p = obj(entry, 'participant');
    return {
      userId: str(p.userId, 64, 'participant.userId', true) as string,
      role: (str(p.role, MAX_ROLE, 'participant.role') || 'COLLABORATOR').toUpperCase(),
    };
  });
}

function normalizeExternals(value: unknown) {
  return arr(value, MAX_PARTICIPANTS, 'externalParticipants').map((entry) => {
    const p = obj(entry, 'externalParticipant');
    const side = (str(p.side, 32, 'externalParticipant.side') || 'OTHER').toUpperCase();
    if (!PARTICIPANT_SIDES.has(side)) throw new CaseIntakeError('INVALID_SIDE', 'externalParticipant.side is unsupported.');
    return {
      name: str(p.name, MAX_NAME, 'externalParticipant.name', true) as string,
      // A participant is never just a name: the role is mandatory and persisted.
      role: str(p.role, MAX_ROLE, 'externalParticipant.role', true) as string,
      side,
      organization: str(p.organization, MAX_NAME, 'externalParticipant.organization'),
      email: str(p.email, MAX_NAME, 'externalParticipant.email'),
      phone: str(p.phone, 64, 'externalParticipant.phone'),
      note: str(p.note, MAX_NOTE, 'externalParticipant.note'),
    };
  });
}

function normalizeDeadlines(value: unknown, now: Date) {
  return arr(value, MAX_DEADLINES, 'deadlines').map((entry) => {
    const d = obj(entry, 'deadline');
    const deadlineType = String(d.deadlineType || 'OTHER').toUpperCase();
    if (!DEADLINE_TYPES.has(deadlineType)) throw new CaseIntakeError('INVALID_DEADLINE_TYPE', 'deadline.deadlineType is unsupported.');
    const resolved = resolveDeadlineDueAt(d, now);
    return {
      title: str(d.title, MAX_TITLE, 'deadline.title', true) as string,
      deadlineType,
      ...resolved,
      reminderMinutesBefore: reminderMinutes(d.reminderMinutesBefore),
      responsibleId: str(d.responsibleId, 64, 'deadline.responsibleId'),
      note: str(d.note, MAX_NOTE, 'deadline.note'),
    };
  });
}

function normalizeTasks(value: unknown) {
  return arr(value, MAX_TASKS, 'initialTasks').map((entry) => {
    const t = obj(entry, 'initialTask');
    const priority = (str(t.priority, 16, 'initialTask.priority') || 'MEDIUM').toUpperCase();
    if (!TASK_PRIORITIES.has(priority)) throw new CaseIntakeError('INVALID_TASK_PRIORITY', 'initialTask.priority is unsupported.');
    return {
      title: str(t.title, MAX_TITLE, 'initialTask.title', true) as string,
      description: str(t.description, MAX_CONTEXT, 'initialTask.description'),
      assignedToId: str(t.assignedToId, 64, 'initialTask.assignedToId'),
      dueDate: t.dueDate ? isoDate(t.dueDate, 'initialTask.dueDate') : null,
      priority,
    };
  });
}

function normalizeStartingContext(value: unknown) {
  if (value === undefined || value === null) return {};
  const c = obj(value, 'startingContext');
  return {
    intakeOriginReason: str(c.originReason, MAX_CONTEXT, 'startingContext.originReason'),
    intakeCurrentSituation: str(c.currentSituation, MAX_CONTEXT, 'startingContext.currentSituation'),
    intakeClientExpectation: str(c.clientExpectation, MAX_CONTEXT, 'startingContext.clientExpectation'),
    intakeUrgentAction: str(c.urgentAction, MAX_CONTEXT, 'startingContext.urgentAction'),
    intakeNextStep: str(c.nextStep, MAX_CONTEXT, 'startingContext.nextStep'),
  };
}

// ---- DTO ----------------------------------------------------------------
export interface CaseIntakeResult {
  case: {
    id: string; caseNumber: string; title: string; status: string; priority: string;
    matterType: string | null; clientRole: string | null;
    client: { id: string; name: string } | null;
    assignedLawyer: { id: string; name: string } | null;
    startingContext: {
      originReason: string | null; currentSituation: string | null;
      clientExpectation: string | null; urgentAction: string | null; nextStep: string | null;
    };
    createdAt: string;
  };
  participants: Array<{ id: string; userId: string; role: string }>;
  externalParticipants: Array<{ id: string; name: string; role: string; side: string }>;
  deadlines: Array<{
    id: string; title: string; deadlineType: string; dueAt: string;
    inputMode: string; relativeValue: number | null; relativeUnit: string | null;
    reminderMinutesBefore: number | null; responsibleId: string | null;
  }>;
  communicationLinks: Array<{ id: string; subject: string; isPrimary: boolean }>;
  tasks: Array<{ id: string; title: string; status: string; priority: string; dueDate: string | null; assignedToId: string | null }>;
}

/**
 * Create a matter and its whole starting work context atomically.
 * `actor` must already be authenticated by the route.
 */
export async function createCaseIntake(actorId: string, input: CaseIntakeInput): Promise<CaseIntakeResult> {
  if (!actorId) throw new CaseIntakeError('NOT_AUTHENTICATED', 'Authenticated user is required.', 401);

  // ---- validate scalars up front (cheap, before any write) --------------
  const clientId = str(input.clientId, 64, 'clientId', true) as string;
  const title = str(input.title, MAX_TITLE, 'title', true) as string;
  const matterType = str(input.matterType, 64, 'matterType') || 'OTHER';
  const clientRole = str(input.clientRole, MAX_ROLE, 'clientRole');
  const assignedLawyerId = str(input.assignedLawyerId, 64, 'assignedLawyerId');
  const startingContext = normalizeStartingContext(input.startingContext);
  const participants = normalizeParticipants(input.participants);
  const externals = normalizeExternals(input.externalParticipants);
  const now = new Date();
  const deadlines = normalizeDeadlines(input.deadlines, now);
  const tasks = normalizeTasks(input.initialTasks);
  const threadIds = arr(input.communicationThreadIds, MAX_THREADS, 'communicationThreadIds')
    .map((t, i) => str(t, 64, `communicationThreadIds[${i}]`, true) as string);
  const primaryThreadId = str(input.primaryCommunicationThreadId, 64, 'primaryCommunicationThreadId');

  // A duplicate id in the request must not create two links.
  const uniqueThreadIds = [...new Set(threadIds)];
  if (primaryThreadId && !uniqueThreadIds.includes(primaryThreadId)) {
    throw new CaseIntakeError('PRIMARY_THREAD_NOT_SELECTED', 'The primary communication thread must be among the selected threads.');
  }

  // ---- authorization / existence of every referenced resource ----------
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
  if (!client) throw new CaseIntakeError('CLIENT_NOT_FOUND', 'Client not found.', 404);

  const referencedUserIds = [...new Set([
    ...(assignedLawyerId ? [assignedLawyerId] : []),
    ...participants.map((p) => p.userId),
    ...deadlines.map((d) => d.responsibleId).filter(Boolean) as string[],
    ...tasks.map((t) => t.assignedToId).filter(Boolean) as string[],
  ])];
  if (referencedUserIds.length > 0) {
    const found = await prisma.user.findMany({ where: { id: { in: referencedUserIds } }, select: { id: true } });
    if (found.length !== referencedUserIds.length) {
      throw new CaseIntakeError('USER_NOT_FOUND', 'A referenced user does not exist.', 400);
    }
  }

  // Threads must exist, must not already belong to another case, and must belong
  // to this client where they carry a client — no cross-client assignment.
  let threads: Array<{ id: string; subject: string; caseId: string | null; clientId: string | null }> = [];
  if (uniqueThreadIds.length > 0) {
    threads = await prisma.communication.findMany({
      where: { id: { in: uniqueThreadIds } },
      select: { id: true, subject: true, caseId: true, clientId: true },
    });
    if (threads.length !== uniqueThreadIds.length) {
      throw new CaseIntakeError('COMMUNICATION_NOT_FOUND', 'A selected communication thread does not exist.', 404);
    }
    for (const thread of threads) {
      if (thread.caseId) {
        throw new CaseIntakeError('COMMUNICATION_ALREADY_LINKED', 'A selected communication thread is already linked to a case.', 409);
      }
      if (thread.clientId && thread.clientId !== clientId) {
        throw new CaseIntakeError('COMMUNICATION_CLIENT_MISMATCH', 'A selected communication thread belongs to a different client.', 403);
      }
    }
  }

  // ---- one transaction: all of it, or none of it ------------------------
  const created = await prisma.$transaction(async (tx) => {
    const year = now.getFullYear();
    const countThisYear = await tx.case.count({ where: { caseNumber: { startsWith: `CASE-${year}-` } } });
    const caseNumber = `CASE-${year}-${String(countThisYear + 1).padStart(3, '0')}`;

    const caseRow = await tx.case.create({
      data: {
        caseNumber,
        title,
        caseType: matterType as never,
        clientId,
        clientName: client.name,
        matterType,
        clientRole,
        createdById: actorId,
        assignedLawyerId: assignedLawyerId || null,
        ...startingContext,
      } as never,
      select: {
        id: true, caseNumber: true, title: true, status: true, priority: true,
        matterType: true, clientRole: true, createdAt: true,
        intakeOriginReason: true, intakeCurrentSituation: true,
        intakeClientExpectation: true, intakeUrgentAction: true, intakeNextStep: true,
        client: { select: { id: true, name: true } },
        assignedLawyer: { select: { id: true, name: true } },
      },
    });

    const participantRows = [];
    for (const p of participants) {
      participantRows.push(await tx.caseCollaborator.create({
        data: { caseId: caseRow.id, userId: p.userId, role: p.role },
        select: { id: true, userId: true, role: true },
      }));
    }

    const externalRows = [];
    for (const e of externals) {
      externalRows.push(await tx.caseExternalParticipant.create({
        data: { ...e, caseId: caseRow.id, createdById: actorId },
        select: { id: true, name: true, role: true, side: true },
      }));
    }

    const deadlineRows = [];
    for (const d of deadlines) {
      deadlineRows.push(await tx.caseIntakeDeadline.create({
        data: { ...d, caseId: caseRow.id, createdById: actorId },
        select: {
          id: true, title: true, deadlineType: true, dueAt: true, inputMode: true,
          relativeValue: true, relativeUnit: true, reminderMinutesBefore: true, responsibleId: true,
        },
      }));
    }

    const taskRows = [];
    for (const t of tasks) {
      taskRows.push(await tx.task.create({
        data: {
          caseId: caseRow.id,
          title: t.title,
          description: t.description,
          taskType: 'OTHER' as never,
          type: 'OTHER',
          status: 'TODO' as never,
          priority: t.priority as never,
          assignedToId: t.assignedToId,
          assignedById: actorId,
          dueDate: t.dueDate,
        } as never,
        select: { id: true, title: true, status: true, priority: true, dueDate: true, assignedToId: true },
      }));
    }

    const linkRows = [];
    for (const thread of threads) {
      const updated = await tx.communication.update({
        where: { id: thread.id },
        data: { caseId: caseRow.id, isPrimaryForCase: thread.id === primaryThreadId },
        select: { id: true, subject: true, isPrimaryForCase: true },
      });
      linkRows.push(updated);
    }

    // Audit metadata only — identifiers and counts, never the captured bodies.
    try {
      await tx.timelineEvent.create({
        data: {
          caseId: caseRow.id,
          userId: actorId,
          eventType: 'CASE_CREATED',
          description: `Matter intake: ${caseRow.caseNumber}`,
          metadata: {
            source: 'case_intake_v1',
            participantCount: participantRows.length,
            externalParticipantCount: externalRows.length,
            deadlineCount: deadlineRows.length,
            taskCount: taskRows.length,
            communicationLinkCount: linkRows.length,
            primaryCommunicationThreadId: primaryThreadId || null,
          },
        } as never,
      });
    } catch {
      // Timeline is advisory; never fail an otherwise valid intake because of it.
    }

    return { caseRow, participantRows, externalRows, deadlineRows, taskRows, linkRows };
  });

  const c = created.caseRow as Record<string, any>;
  return {
    case: {
      id: c.id, caseNumber: c.caseNumber, title: c.title,
      status: String(c.status), priority: String(c.priority),
      matterType: c.matterType ?? null, clientRole: c.clientRole ?? null,
      client: c.client ? { id: c.client.id, name: c.client.name } : null,
      assignedLawyer: c.assignedLawyer ? { id: c.assignedLawyer.id, name: c.assignedLawyer.name } : null,
      startingContext: {
        originReason: c.intakeOriginReason ?? null,
        currentSituation: c.intakeCurrentSituation ?? null,
        clientExpectation: c.intakeClientExpectation ?? null,
        urgentAction: c.intakeUrgentAction ?? null,
        nextStep: c.intakeNextStep ?? null,
      },
      createdAt: new Date(c.createdAt).toISOString(),
    },
    participants: created.participantRows.map((p: any) => ({ id: p.id, userId: p.userId, role: p.role })),
    externalParticipants: created.externalRows.map((e: any) => ({ id: e.id, name: e.name, role: e.role, side: e.side })),
    deadlines: created.deadlineRows.map((d: any) => ({
      id: d.id, title: d.title, deadlineType: d.deadlineType,
      dueAt: new Date(d.dueAt).toISOString(), inputMode: d.inputMode,
      relativeValue: d.relativeValue ?? null, relativeUnit: d.relativeUnit ?? null,
      reminderMinutesBefore: d.reminderMinutesBefore ?? null, responsibleId: d.responsibleId ?? null,
    })),
    communicationLinks: created.linkRows.map((l: any) => ({ id: l.id, subject: l.subject, isPrimary: Boolean(l.isPrimaryForCase) })),
    tasks: created.taskRows.map((t: any) => ({
      id: t.id, title: t.title, status: String(t.status), priority: String(t.priority),
      dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
      assignedToId: t.assignedToId ?? null,
    })),
  };
}

export interface PortalIntakeCaseInput {
  clientId: string;
  title: string;
  description?: string | null;
  matterType?: string | null;
  assignedLawyerId?: string | null;
  deadline?: Date | null;
}

/**
 * Transaction-scoped canonical Case shell for CP1 intake conversion. It keeps
 * Case numbering, Client assignment and creation audit in the existing intake
 * creation module, but deliberately performs no external provider call.
 */
export async function createCaseFromPortalIntakeInTransaction(actorId: string, input: PortalIntakeCaseInput, tx: any) {
  if (!actorId) throw new CaseIntakeError('NOT_AUTHENTICATED', 'Authenticated user is required.', 401);
  const clientId = str(input.clientId, 64, 'clientId', true) as string;
  const title = str(input.title, MAX_TITLE, 'title', true) as string;
  const description = str(input.description, 6000, 'description');
  const matterType = str(input.matterType, 64, 'matterType') || 'OTHER';
  const assignedLawyerId = str(input.assignedLawyerId, 64, 'assignedLawyerId');
  const [client, actor, assigned] = await Promise.all([
    tx.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } }),
    tx.user.findUnique({ where: { id: actorId }, select: { id: true, status: true, isActive: true } }),
    assignedLawyerId ? tx.user.findUnique({ where: { id: assignedLawyerId }, select: { id: true, status: true, isActive: true } }) : Promise.resolve(null),
  ]);
  if (!client) throw new CaseIntakeError('CLIENT_NOT_FOUND', 'Client not found.', 404);
  if (!actor || actor.status !== 'ACTIVE' || actor.isActive === false) throw new CaseIntakeError('USER_NOT_FOUND', 'Authenticated user is inactive.', 403);
  if (assignedLawyerId && (!assigned || assigned.status !== 'ACTIVE' || assigned.isActive === false)) throw new CaseIntakeError('USER_NOT_FOUND', 'Assigned user is inactive.', 400);

  const year = new Date().getFullYear();
  const countThisYear = await tx.case.count({ where: { caseNumber: { startsWith: `CASE-${year}-` } } });
  const caseNumber = `CASE-${year}-${String(countThisYear + 1).padStart(3, '0')}`;
  const caseTypes = new Set(['CONTRACT_REVIEW', 'CONTRACT_DRAFTING', 'LITIGATION', 'CORPORATE', 'IP', 'EMPLOYMENT', 'REAL_ESTATE', 'MERGERS_ACQUISITIONS', 'OTHER']);
  const caseType = caseTypes.has(matterType) ? matterType : 'OTHER';
  const row = await tx.case.create({
    data: {
      caseNumber,
      title,
      description,
      caseType,
      clientId,
      clientName: client.name,
      matterType,
      createdById: actorId,
      assignedLawyerId: assignedLawyerId || null,
      deadline: input.deadline || null,
      status: 'CLIENT_INPUT',
      priority: 'MEDIUM',
    },
    select: { id: true, caseNumber: true, clientId: true, title: true, status: true, createdAt: true },
  });
  await tx.timelineEvent.create({
    data: {
      caseId: row.id,
      userId: actorId,
      eventType: 'CASE_CREATED',
      type: 'CASE_CREATED',
      description: `Portal intake conversion: ${row.caseNumber}`,
      payload: { source: 'client_portal_intake', caseNumber: row.caseNumber },
    },
  });
  return row;
}
