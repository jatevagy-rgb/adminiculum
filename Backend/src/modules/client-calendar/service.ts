/**
 * CLIENT CALENDAR (read-only projection) — internal workforce service.
 *
 * Projects canonical, already-stored business dates (ContractRecord,
 * ClientObligation, ContractEntitlement, CompanyMilestone, Case.deadline,
 * Task.dueDate, CaseIntakeDeadline.dueAt) into one normalized, client-scoped
 * calendar read DTO.
 *
 * Hard rules:
 * - No new persistence model; this module only reads canonical records.
 * - A null source date produces NO calendar item (never invent dates:
 *   noticePeriodDays/autoRenewal never derive a date).
 * - Strict client scoping via assertClientReadAccess; case-derived rows are
 *   additionally limited to the actor's readable case scope
 *   (internalCaseScope), so no cross-client or unauthorized case data leaks.
 * - Read-only; no writes, no derived/renewed dates.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import {
  InteractionError,
  InternalActor,
  assertClientReadAccess,
  internalCaseScope,
} from '../client-interaction/base';

type Prisma = typeof defaultPrisma;

export const CALENDAR_SOURCE_TYPES = [
  'CONTRACT',
  'OBLIGATION',
  'ENTITLEMENT',
  'COMPANY_MILESTONE',
  'CASE_DEADLINE',
  'TASK',
  'CASE_INTAKE_DEADLINE',
] as const;

export type CalendarSourceType = (typeof CALENDAR_SOURCE_TYPES)[number];

export const CALENDAR_DATE_KINDS = [
  'SIGNATURE',
  'EFFECTIVE',
  'EXPIRY',
  'CRITICAL_DATE',
  'NEXT_DUE',
  'EXERCISE_BY',
  'TARGET_DATE',
  'MILESTONE_DATE',
  'DEADLINE',
  'DUE_DATE',
  'INTAKE_DUE',
] as const;

export type CalendarDateKind = (typeof CALENDAR_DATE_KINDS)[number];

export interface ClientCalendarItem {
  id: string;
  sourceType: CalendarSourceType;
  sourceId: string;
  dateKind: CalendarDateKind;
  title: string;
  /** ISO-8601 timestamp of the authoritative stored date. */
  date: string;
  status?: string | null;
  caseId?: string;
  contractId?: string;
}

export interface ClientCalendarResponse {
  clientId: string;
  from: string;
  to: string;
  items: ClientCalendarItem[];
}

export interface ClientCalendarQuery {
  from?: unknown;
  to?: unknown;
}

/**
 * Maximum accepted range: 5 calendar years + a small boundary tolerance.
 * 5 * 366 days covers any 5-calendar-year window including every leap day;
 * the extra day absorbs inclusive-boundary edge cases.
 */
const MAX_RANGE_DAYS = 5 * 366 + 1;

const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/;

function parseDateParam(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !DATE_PARAM.test(value)) {
    throw new InteractionError(400, 'CALENDAR_RANGE_INVALID', `${field} must be a YYYY-MM-DD date.`);
  }
  const [y, m, d] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) {
    throw new InteractionError(400, 'CALENDAR_RANGE_INVALID', `${field} is not a real calendar date.`);
  }
  return parsed;
}

function formatDateParam(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Resolves and validates the [from, to] UTC range (inclusive day bounds). */
export function resolveCalendarRange(query: ClientCalendarQuery): { from: Date; to: Date } {
  const today = new Date();
  const defaultFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const defaultTo = new Date(defaultFrom.getTime() + 365 * 24 * 60 * 60 * 1000);

  const from = query.from == null ? defaultFrom : parseDateParam(query.from, 'from');
  const toBase = query.to == null ? defaultTo : parseDateParam(query.to, 'to');
  // `to` is an inclusive calendar-day bound.
  const to = new Date(toBase.getTime() + (24 * 60 * 60 * 1000) - 1);

  if (to < from) {
    throw new InteractionError(400, 'CALENDAR_RANGE_INVALID', 'from must not be after to.');
  }
  const spanDays = (toBase.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
  if (spanDays > MAX_RANGE_DAYS) {
    throw new InteractionError(400, 'CALENDAR_RANGE_TOO_LARGE', 'The requested range exceeds the supported five-year window.');
  }
  return { from, to };
}

export async function getClientCalendar(
  actor: InternalActor,
  clientId: string,
  query: ClientCalendarQuery = {},
  prisma: Prisma = defaultPrisma,
): Promise<ClientCalendarResponse> {
  const { from, to } = resolveCalendarRange(query);
  const client = await assertClientReadAccess(actor, clientId, prisma);
  const caseScope = await internalCaseScope(actor, prisma);
  // null scope = ADMIN/PARTNER global read; otherwise intersect with the
  // actor's readable cases so only authorized case dates are projected.
  const caseWhere = caseScope === null ? { clientId } : { clientId, id: { in: caseScope } };
  const range = { gte: from, lte: to };

  const [contracts, obligations, entitlements, milestones, cases, tasks, intakeDeadlines] = await Promise.all([
    prisma.contractRecord.findMany({
      where: {
        clientId,
        OR: [{ signatureDate: range }, { effectiveDate: range }, { expiryDate: range }, { nextCriticalDate: range }],
      },
      select: { id: true, title: true, status: true, signatureDate: true, effectiveDate: true, expiryDate: true, nextCriticalDate: true },
    }),
    prisma.clientObligation.findMany({
      where: { clientId, nextDueDate: range },
      select: { id: true, title: true, status: true, nextDueDate: true, sourceContractId: true },
    }),
    prisma.contractEntitlement.findMany({
      where: { clientId, exerciseByDate: range },
      select: { id: true, title: true, status: true, exerciseByDate: true, contractId: true },
    }),
    prisma.companyMilestone.findMany({
      where: { clientId, OR: [{ targetDate: range }, { milestoneDate: range }] },
      select: { id: true, title: true, status: true, targetDate: true, milestoneDate: true },
    }),
    prisma.case.findMany({
      where: { ...caseWhere, deadline: range },
      select: { id: true, title: true, caseNumber: true, status: true, deadline: true },
    }),
    prisma.task.findMany({
      where: { case: caseWhere, dueDate: range },
      select: { id: true, title: true, status: true, dueDate: true, caseId: true },
    }),
    prisma.caseIntakeDeadline.findMany({
      where: { case: caseWhere, dueAt: range },
      select: { id: true, title: true, dueAt: true, caseId: true },
    }),
  ]);

  // Multi-date rows match on ANY in-range date field, so each projected item
  // must re-check the range per date — a row-level match never widens other
  // dates on the same record into the response window.
  const inRange = (value: Date | null): value is Date => value !== null && value >= from && value <= to;

  const items: ClientCalendarItem[] = [];

  for (const contract of contracts) {
    const dates: Array<[CalendarDateKind, Date | null]> = [
      ['SIGNATURE', contract.signatureDate],
      ['EFFECTIVE', contract.effectiveDate],
      ['EXPIRY', contract.expiryDate],
      ['CRITICAL_DATE', contract.nextCriticalDate],
    ];
    for (const [dateKind, value] of dates) {
      if (!inRange(value)) continue;
      items.push({
        id: `CONTRACT:${contract.id}:${dateKind}`,
        sourceType: 'CONTRACT',
        sourceId: contract.id,
        dateKind,
        title: contract.title,
        date: value.toISOString(),
        status: contract.status,
        contractId: contract.id,
      });
    }
  }

  for (const obligation of obligations) {
    if (!obligation.nextDueDate) continue;
    items.push({
      id: `OBLIGATION:${obligation.id}:NEXT_DUE`,
      sourceType: 'OBLIGATION',
      sourceId: obligation.id,
      dateKind: 'NEXT_DUE',
      title: obligation.title,
      date: obligation.nextDueDate.toISOString(),
      status: obligation.status,
      contractId: obligation.sourceContractId ?? undefined,
    });
  }

  for (const entitlement of entitlements) {
    if (!entitlement.exerciseByDate) continue;
    items.push({
      id: `ENTITLEMENT:${entitlement.id}:EXERCISE_BY`,
      sourceType: 'ENTITLEMENT',
      sourceId: entitlement.id,
      dateKind: 'EXERCISE_BY',
      title: entitlement.title,
      date: entitlement.exerciseByDate.toISOString(),
      status: entitlement.status,
      contractId: entitlement.contractId,
    });
  }

  for (const milestone of milestones) {
    const dates: Array<[CalendarDateKind, Date | null]> = [
      ['TARGET_DATE', milestone.targetDate],
      ['MILESTONE_DATE', milestone.milestoneDate],
    ];
    for (const [dateKind, value] of dates) {
      if (!inRange(value)) continue;
      items.push({
        id: `COMPANY_MILESTONE:${milestone.id}:${dateKind}`,
        sourceType: 'COMPANY_MILESTONE',
        sourceId: milestone.id,
        dateKind,
        title: milestone.title,
        date: value.toISOString(),
        status: milestone.status,
      });
    }
  }

  for (const caseRow of cases) {
    if (!caseRow.deadline) continue;
    items.push({
      id: `CASE_DEADLINE:${caseRow.id}:DEADLINE`,
      sourceType: 'CASE_DEADLINE',
      sourceId: caseRow.id,
      dateKind: 'DEADLINE',
      title: `${caseRow.caseNumber} — ${caseRow.title}`,
      date: caseRow.deadline.toISOString(),
      status: caseRow.status,
      caseId: caseRow.id,
    });
  }

  for (const task of tasks) {
    if (!task.dueDate) continue;
    items.push({
      id: `TASK:${task.id}:DUE_DATE`,
      sourceType: 'TASK',
      sourceId: task.id,
      dateKind: 'DUE_DATE',
      title: task.title,
      date: task.dueDate.toISOString(),
      status: task.status,
      caseId: task.caseId,
    });
  }

  for (const deadline of intakeDeadlines) {
    if (!deadline.dueAt) continue;
    items.push({
      id: `CASE_INTAKE_DEADLINE:${deadline.id}:INTAKE_DUE`,
      sourceType: 'CASE_INTAKE_DEADLINE',
      sourceId: deadline.id,
      dateKind: 'INTAKE_DUE',
      title: deadline.title,
      date: deadline.dueAt.toISOString(),
      caseId: deadline.caseId,
    });
  }

  const typeOrder = new Map(CALENDAR_SOURCE_TYPES.map((t, i) => [t, i]));
  items.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const t = (typeOrder.get(a.sourceType) ?? 0) - (typeOrder.get(b.sourceType) ?? 0);
    if (t !== 0) return t;
    if (a.sourceId !== b.sourceId) return a.sourceId < b.sourceId ? -1 : 1;
    return a.dateKind < b.dateKind ? -1 : a.dateKind > b.dateKind ? 1 : 0;
  });

  return {
    clientId: client.id,
    from: formatDateParam(from),
    to: formatDateParam(new Date(to.getTime() + 1)),
    items,
  };
}
