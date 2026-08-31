import { prisma } from '../../prisma/prisma.service';
import type { CaseStatus } from '@prisma/client';
import { buildCaseReadScope } from '../cases/authorization';
import { CLOSED_TASK_STATUSES } from '../tasks/taskStatus';
import {
  compactSafeText,
  compareDeadlines,
  deriveCaseDeadlineStatus,
  deriveDeadlineCapabilities,
  deriveDeadlineUrgency,
  deriveTaskDeadlineStatus,
  mapImportance,
  toSafeIsoDate,
  WorkflowDeadlineDto,
  WorkflowDeadlineStatus,
} from './deadlineEngine';

export type AgendaScope = 'MY_WORK' | 'MY_CASES' | 'CASE';

const CLOSED_CASE_STATUSES = ['FINAL', 'CANCELLED', 'ARCHIVED'] satisfies CaseStatus[];

export interface WorkflowAgendaDto {
  generatedAt: string;
  timezone: string;
  range: { from: string; to: string };
  scope: AgendaScope;
  summary: {
    overdue: number;
    today: number;
    tomorrow: number;
    thisWeek: number;
    later: number;
    completedRecently: number;
  };
  days: Array<{ date: string; items: WorkflowDeadlineDto[] }>;
  pagination: { limit: number; offset: number; hasMore: boolean };
  availability: {
    taskDueDates: boolean;
    caseDeadlines: boolean;
    hearings: boolean;
    reminders: boolean;
    teamScope: boolean;
    externalCalendar: false;
  };
}

export class AgendaRequestError extends Error {
  constructor(public statusCode: number, public code: string, message: string) {
    super(message);
    this.name = 'AgendaRequestError';
  }
}

const MAX_RANGE_DAYS = 45;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 100;
const CLOSED_STATUSES = new Set<WorkflowDeadlineStatus>(['COMPLETED', 'CANCELLED', 'SUPERSEDED']);

function applicationTimezone(): string {
  return process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function parseDateOnly(value: unknown, fallback: Date): Date {
  if (!value) return fallback;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new AgendaRequestError(400, 'INVALID_DATE', 'Date parameters must use YYYY-MM-DD.');
  }
  const parsed = new Date(`${text}T00:00:00.000`);
  if (Number.isNaN(parsed.getTime())) {
    throw new AgendaRequestError(400, 'INVALID_DATE', 'Invalid date parameter.');
  }
  return parsed;
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function dateOnly(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function endOfDate(value: Date): Date {
  const end = new Date(value);
  end.setHours(23, 59, 59, 999);
  return end;
}

function parseLimit(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function parseOffset(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseScope(value: unknown): AgendaScope {
  const scope = String(value || 'MY_WORK').trim().toUpperCase();
  if (scope === 'MY_WORK' || scope === 'MY_CASES' || scope === 'CASE') return scope;
  throw new AgendaRequestError(400, 'INVALID_AGENDA_SCOPE', 'Unsupported agenda scope.');
}

function parseStatus(value: unknown): 'OPEN' | 'COMPLETED' | 'ALL' {
  const status = String(value || 'OPEN').trim().toUpperCase();
  if (status === 'OPEN' || status === 'COMPLETED' || status === 'ALL') return status;
  throw new AgendaRequestError(400, 'INVALID_AGENDA_STATUS', 'Unsupported agenda status.');
}

function validateRange(from: Date, to: Date): void {
  if (from.getTime() > to.getTime()) {
    throw new AgendaRequestError(400, 'INVALID_DATE_RANGE', 'from must be before or equal to to.');
  }
  const days = Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
  if (days > MAX_RANGE_DAYS) {
    throw new AgendaRequestError(400, 'DATE_RANGE_TOO_LARGE', `Agenda range cannot exceed ${MAX_RANGE_DAYS} days.`);
  }
}

function displayUser(user?: { id: string; name?: string | null; email?: string | null } | null) {
  if (!user?.id) return null;
  return { id: user.id, displayName: user.name || user.email || user.id };
}

function taskStatusFilter(status: 'OPEN' | 'COMPLETED' | 'ALL') {
  if (status === 'ALL') return {};
  if (status === 'COMPLETED') {
    return { status: { in: CLOSED_TASK_STATUSES } };
  }
  return { status: { notIn: CLOSED_TASK_STATUSES } };
}

function caseStatusFilter(status: 'OPEN' | 'COMPLETED' | 'ALL') {
  if (status === 'ALL') return {};
  if (status === 'COMPLETED') {
    return { OR: [{ completedAt: { not: null } }, { status: { in: CLOSED_CASE_STATUSES } }] };
  }
  return { completedAt: null, status: { notIn: CLOSED_CASE_STATUSES } };
}

export function makeDefaultAgendaRange(now = new Date()): { from: Date; to: Date } {
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  return { from, to: addDays(from, 14) };
}

export async function getWorkflowAgenda(params: {
  userId: string;
  userRole?: string;
  scope?: unknown;
  status?: unknown;
  caseId?: string;
  from?: unknown;
  to?: unknown;
  limit?: unknown;
  offset?: unknown;
  now?: Date;
  db?: typeof prisma;
}): Promise<WorkflowAgendaDto> {
  const db = params.db || prisma;
  const now = params.now || new Date();
  const defaults = makeDefaultAgendaRange(now);
  const from = parseDateOnly(params.from, defaults.from);
  const toStart = parseDateOnly(params.to, defaults.to);
  const to = endOfDate(toStart);
  validateRange(from, to);

  if (String(params.scope || '').trim().toUpperCase() === 'TEAM') {
    throw new AgendaRequestError(400, 'TEAM_SCOPE_NOT_AVAILABLE', 'Team agenda scope is not available in this release.');
  }

  const scope = parseScope(params.scope);
  const status = parseStatus(params.status);
  const limit = parseLimit(params.limit);
  const offset = parseOffset(params.offset);

  if (scope === 'CASE' && !params.caseId) {
    throw new AgendaRequestError(400, 'CASE_SCOPE_REQUIRES_CASE_ID', 'caseId is required for CASE scope.');
  }
  const caseReadScope = buildCaseReadScope(params.userId, params.userRole);
  if (scope === 'CASE' && params.caseId) {
    const readableCase = await db.case.findFirst({
      where: {
        AND: [
          { id: params.caseId },
          ...(caseReadScope ? [caseReadScope] : []),
        ],
      },
      select: { id: true },
    });
    if (!readableCase) throw new AgendaRequestError(404, 'CASE_NOT_FOUND', 'Case not found.');
  }

  const taskWhere: any = {
    dueDate: { gte: from, lte: to },
    ...taskStatusFilter(status),
    ...(caseReadScope ? { case: caseReadScope } : {}),
  };

  const caseWhere: any = {
    deadline: { gte: from, lte: to },
    ...caseStatusFilter(status),
  };
  if (caseReadScope) {
    taskWhere.case = caseReadScope;
    caseWhere.AND = [caseReadScope];
  }

  const intakeWhere: any = {
    dueAt: { gte: from, lte: to },
    case: {
      ...caseStatusFilter(status),
      ...(caseReadScope ? { AND: [caseReadScope] } : {}),
    },
  };

  if (scope === 'MY_WORK') {
    taskWhere.assignedToId = params.userId;
    caseWhere.OR = [
      { assignedLawyerId: params.userId },
      { createdById: params.userId },
    ];
    intakeWhere.OR = [
      { responsibleId: params.userId },
      { case: { assignedLawyerId: params.userId } },
    ];
  } else if (scope === 'CASE') {
    taskWhere.caseId = params.caseId;
    caseWhere.id = params.caseId;
    intakeWhere.caseId = params.caseId;
  }

  const [tasks, caseRows, intakeRows] = await Promise.all([
    db.task.findMany({
      where: taskWhere,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueDate: true,
        updatedAt: true,
        assignedToId: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        caseId: true,
        case: {
          select: {
            id: true,
            caseNumber: true,
            title: true,
            clientName: true,
            assignedLawyerId: true,
            assignedLawyer: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      take: MAX_LIMIT + offset + 1,
    }),
    db.case.findMany({
      where: caseWhere,
      select: {
        id: true,
        caseNumber: true,
        title: true,
        clientName: true,
        priority: true,
        status: true,
        deadline: true,
        completedAt: true,
        updatedAt: true,
        assignedLawyerId: true,
        assignedLawyer: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ deadline: 'asc' }, { id: 'asc' }],
      take: MAX_LIMIT + offset + 1,
    }),
    db.caseIntakeDeadline.findMany({
      where: intakeWhere,
      select: {
        id: true,
        title: true,
        deadlineType: true,
        dueAt: true,
        responsibleId: true,
        note: true,
        updatedAt: true,
        caseId: true,
        responsible: { select: { id: true, name: true, email: true } },
        case: {
          select: {
            id: true,
            caseNumber: true,
            title: true,
            clientName: true,
            priority: true,
            status: true,
            completedAt: true,
            assignedLawyerId: true,
            assignedLawyer: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      take: MAX_LIMIT + offset + 1,
    }),
  ]);

  const taskItems: WorkflowDeadlineDto[] = tasks
    .map((task) => {
      const dueAt = toSafeIsoDate(task.dueDate);
      if (!dueAt) return null;
      const deadlineStatus = deriveTaskDeadlineStatus(task.status);
      return {
        id: `TASK:${task.id}`,
        sourceType: 'TASK' as const,
        sourceId: task.id,
        caseId: task.caseId,
        title: task.title,
        safeDescription: compactSafeText(task.description),
        startsAt: null,
        dueAt,
        allDay: false,
        status: deadlineStatus,
        urgency: deriveDeadlineUrgency(dueAt, now),
        importance: mapImportance(task.priority),
        legalSignificance: null,
        responsibility: {
          assignee: displayUser(task.assignedTo),
          responsibleLawyer: displayUser(task.case?.assignedLawyer),
        },
        source: {
          type: 'TASK' as const,
          id: task.id,
          displayName: 'Feladat',
          href: `/tasks?taskId=${encodeURIComponent(task.id)}`,
        },
        capabilities: deriveDeadlineCapabilities({
          sourceType: 'TASK',
          status: deadlineStatus,
          isAssignedToCurrentUser: task.assignedToId === params.userId,
          isCaseManager: task.case?.assignedLawyerId === params.userId,
          taskStatus: task.status,
        }),
        href: `/tasks?taskId=${encodeURIComponent(task.id)}`,
        updatedAt: toSafeIsoDate(task.updatedAt),
      };
    })
    .filter(Boolean) as WorkflowDeadlineDto[];

  const intakeItems: WorkflowDeadlineDto[] = intakeRows
    .map((row) => {
      const dueAt = toSafeIsoDate(row.dueAt);
      if (!dueAt) return null;
      const deadlineStatus = deriveCaseDeadlineStatus(row.case?.status, row.case?.completedAt);
      return {
        id: `CASE_INTAKE_DEADLINE:${row.id}`,
        sourceType: 'CASE_DEADLINE' as const,
        sourceId: row.id,
        caseId: row.caseId,
        title: row.title || row.case?.title || row.case?.caseNumber || 'Ügyhatáridő',
        safeDescription: compactSafeText([
          row.case?.caseNumber,
          row.case?.clientName,
          row.deadlineType ? `Típus: ${row.deadlineType}` : null,
          row.note,
        ].filter(Boolean).join(' · ')),
        startsAt: null,
        dueAt,
        allDay: false,
        status: deadlineStatus,
        urgency: deriveDeadlineUrgency(dueAt, now),
        importance: mapImportance(row.case?.priority),
        legalSignificance: null,
        responsibility: {
          assignee: displayUser(row.responsible),
          responsibleLawyer: displayUser(row.case?.assignedLawyer),
        },
        source: {
          type: 'CASE' as const,
          id: row.caseId,
          displayName: row.case?.caseNumber || 'Ügy',
          href: `/cases/${encodeURIComponent(row.caseId)}`,
        },
        capabilities: deriveDeadlineCapabilities({
          sourceType: 'CASE_DEADLINE',
          status: deadlineStatus,
          isAssignedToCurrentUser: row.responsibleId === params.userId,
          isCaseManager: row.case?.assignedLawyerId === params.userId,
        }),
        href: `/cases/${encodeURIComponent(row.caseId)}`,
        updatedAt: toSafeIsoDate(row.updatedAt),
      };
    })
    .filter(Boolean) as WorkflowDeadlineDto[];

  const intakeKeys = new Set(intakeItems.map((item) => `${item.caseId}::${item.dueAt}`));

  const caseItems: WorkflowDeadlineDto[] = caseRows
    .map((caseRecord) => {
      const dueAt = toSafeIsoDate(caseRecord.deadline);
      if (!dueAt) return null;

      const deadlineStatus = deriveCaseDeadlineStatus(caseRecord.status, caseRecord.completedAt);
      return {
        id: `CASE_DEADLINE:${caseRecord.id}`,
        sourceType: 'CASE_DEADLINE' as const,
        sourceId: caseRecord.id,
        caseId: caseRecord.id,
        title: caseRecord.title || caseRecord.caseNumber,
        safeDescription: compactSafeText([caseRecord.caseNumber, caseRecord.clientName].filter(Boolean).join(' · ')),
        startsAt: null,
        dueAt,
        allDay: false,
        status: deadlineStatus,
        urgency: deriveDeadlineUrgency(dueAt, now),
        importance: mapImportance(caseRecord.priority),
        legalSignificance: null,
        responsibility: {
          assignee: null,
          responsibleLawyer: displayUser(caseRecord.assignedLawyer),
        },
        source: {
          type: 'CASE' as const,
          id: caseRecord.id,
          displayName: caseRecord.caseNumber,
          href: `/cases/${encodeURIComponent(caseRecord.id)}`,
        },
        capabilities: deriveDeadlineCapabilities({
          sourceType: 'CASE_DEADLINE',
          status: deadlineStatus,
          isCaseManager: caseRecord.assignedLawyerId === params.userId,
        }),
        href: `/cases/${encodeURIComponent(caseRecord.id)}`,
        updatedAt: toSafeIsoDate(caseRecord.updatedAt),
      };
    })
    .filter(Boolean) as WorkflowDeadlineDto[];

  const filtered = [...taskItems, ...intakeItems, ...caseItems]
    .filter((item) => status === 'ALL' || (status === 'OPEN' ? !CLOSED_STATUSES.has(item.status) : CLOSED_STATUSES.has(item.status)))
    .sort((left, right) => compareDeadlines(left, right, params.userId));
  const page = filtered.slice(offset, offset + limit);

  const summarySource = filtered;
  const summary = {
    overdue: summarySource.filter((item) => item.status === 'OPEN' && item.urgency === 'OVERDUE').length,
    today: summarySource.filter((item) => item.status === 'OPEN' && item.urgency === 'TODAY').length,
    tomorrow: summarySource.filter((item) => item.status === 'OPEN' && item.urgency === 'TOMORROW').length,
    thisWeek: summarySource.filter((item) => item.status === 'OPEN' && item.urgency === 'THIS_WEEK').length,
    later: summarySource.filter((item) => item.status === 'OPEN' && item.urgency === 'LATER').length,
    completedRecently: summarySource.filter((item) => CLOSED_STATUSES.has(item.status)).length,
  };

  const dayMap = new Map<string, WorkflowDeadlineDto[]>();
  for (const item of page) {
    const day = dateOnly(item.dueAt);
    dayMap.set(day, [...(dayMap.get(day) || []), item]);
  }

  return {
    generatedAt: now.toISOString(),
    timezone: applicationTimezone(),
    range: { from: dateOnly(from), to: dateOnly(toStart) },
    scope,
    summary,
    days: [...dayMap.entries()].map(([date, items]) => ({ date, items })),
    pagination: {
      limit,
      offset,
      hasMore: filtered.length > offset + limit,
    },
    availability: {
      taskDueDates: true,
      caseDeadlines: true,
      hearings: false,
      reminders: false,
      teamScope: false,
      externalCalendar: false,
    },
  };
}

export async function getCaseDeadlines(
  caseId: string,
  userId: string,
  query: { status?: unknown; limit?: unknown; offset?: unknown; now?: Date; userRole?: string } = {},
  db = prisma
) {
  const agenda = await getWorkflowAgenda({
    userId,
    userRole: query.userRole,
    scope: 'CASE',
    caseId,
    status: query.status || 'ALL',
    limit: query.limit || 50,
    offset: query.offset,
    now: query.now,
    db,
  });
  return {
    caseId,
    generatedAt: agenda.generatedAt,
    timezone: agenda.timezone,
    items: agenda.days.flatMap((day) => day.items),
    pagination: agenda.pagination,
    availability: agenda.availability,
  };
}
