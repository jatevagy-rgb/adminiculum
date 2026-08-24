import { prisma } from '../../prisma/prisma.service';

export type CaseAttributionMode = 'EXACT_CASE' | 'TASK_DERIVED_CASE' | 'MATTER_ONLY' | 'AMBIGUOUS';

export type CaseAttribution = { mode: CaseAttributionMode; attributable: boolean };

type AttributionInput = {
  caseId: string;
  matterCaseIds: string[];
  task: { caseId: string; matterId: string | null } | null;
  matterId: string;
};

/** Time belongs to a Matter; a matching persisted Task is the only safe case-level narrowing signal. */
export function classifyCaseAttribution(input: AttributionInput): CaseAttribution {
  if (input.task) {
    if (input.task.matterId === input.matterId && input.task.caseId === input.caseId) return { mode: 'TASK_DERIVED_CASE', attributable: true };
    return { mode: 'AMBIGUOUS', attributable: false };
  }
  if (input.matterCaseIds.length === 0) return { mode: 'MATTER_ONLY', attributable: false };
  if (input.matterCaseIds.length === 1 && input.matterCaseIds[0] === input.caseId) return { mode: 'EXACT_CASE', attributable: true };
  return { mode: 'AMBIGUOUS', attributable: false };
}

function totals(rows: Array<{ _sum: { minutes: number | null }; billable: boolean }>) {
  const totalMinutes = rows.reduce((sum, row) => sum + (row._sum.minutes || 0), 0);
  const billableMinutes = rows.filter((row) => row.billable).reduce((sum, row) => sum + (row._sum.minutes || 0), 0);
  return { totalMinutes, billableMinutes, nonBillableMinutes: totalMinutes - billableMinutes };
}

function rangeWhere(periodStart?: Date, periodEnd?: Date) {
  return periodStart || periodEnd ? { workDate: { ...(periodStart ? { gte: periodStart } : {}), ...(periodEnd ? { lt: periodEnd } : {}) } } : {};
}

function caseEntryWhere(caseId: string, matterId: string, matterCaseIds: string[]) {
  const taskForCase = { task: { is: { caseId, matterId } } };
  return matterCaseIds.length === 1 && matterCaseIds[0] === caseId
    ? { matterId, OR: [{ taskId: null }, taskForCase] }
    : { matterId, ...taskForCase };
}

export async function getCaseTimeSummary(input: { caseId: string; periodStart?: Date; periodEnd?: Date; recentLimit: number }, db = prisma) {
  const caseRecord = await db.case.findUnique({ where: { id: input.caseId }, select: { id: true, matterId: true, matter: { select: { cases: { select: { id: true } } } } } });
  if (!caseRecord) return null;
  const matterCaseIds = caseRecord.matter?.cases.map((item) => item.id) || [];
  if (!caseRecord.matterId) return { periodStart: input.periodStart?.toISOString() || null, periodEnd: input.periodEnd?.toISOString() || null, ...totals([]), recentEntries: [], attributionMode: 'MATTER_ONLY' as CaseAttributionMode, hasAmbiguousMatterTime: false };

  const baseWhere = { ...caseEntryWhere(caseRecord.id, caseRecord.matterId, matterCaseIds), ...rangeWhere(input.periodStart, input.periodEnd) };
  const [grouped, recentEntries, ambiguousCount] = await Promise.all([
    db.timeEntry.groupBy({ by: ['billable'], where: baseWhere, _sum: { minutes: true } }),
    db.timeEntry.findMany({ where: baseWhere, select: { id: true, workType: true, description: true, minutes: true, billable: true, workDate: true, task: { select: { caseId: true, matterId: true } } }, orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }], take: input.recentLimit }),
    matterCaseIds.length > 1 ? db.timeEntry.count({ where: { matterId: caseRecord.matterId, taskId: null, ...rangeWhere(input.periodStart, input.periodEnd) } }) : Promise.resolve(0),
  ]);
  const modes = new Set(recentEntries.map((entry) => classifyCaseAttribution({ caseId: caseRecord.id, matterCaseIds, matterId: caseRecord.matterId!, task: entry.task }).mode));
  return {
    periodStart: input.periodStart?.toISOString() || null,
    periodEnd: input.periodEnd?.toISOString() || null,
    ...totals(grouped),
    attributionMode: modes.size === 1 ? [...modes][0] : 'AMBIGUOUS',
    hasAmbiguousMatterTime: ambiguousCount > 0,
    recentEntries: recentEntries.map(({ task, ...entry }) => ({ ...entry, workDate: entry.workDate.toISOString(), attributionMode: classifyCaseAttribution({ caseId: caseRecord.id, matterCaseIds, matterId: caseRecord.matterId!, task }).mode })),
  };
}

export async function getClientTimeSummary(input: { clientId: string; periodStart?: Date; periodEnd?: Date; recentLimit: number; includeLawyers: boolean }, db = prisma) {
  const where = { matter: { clientId: input.clientId }, ...rangeWhere(input.periodStart, input.periodEnd) };
  const [grouped, recentEntries, matters] = await Promise.all([
    db.timeEntry.groupBy({ by: ['matterId', 'userId', 'billable'], where, _sum: { minutes: true } }),
    db.timeEntry.findMany({ where, select: { id: true, description: true, minutes: true, billable: true, workDate: true, matter: { select: { id: true, title: true } }, user: { select: { name: true } } }, orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }], take: input.recentLimit }),
    db.matter.findMany({ where: { clientId: input.clientId }, select: { id: true, title: true } }),
  ]);
  const matterNames = new Map(matters.map((matter) => [matter.id, matter.title]));
  const byMatterMap = new Map<string, Array<{ _sum: { minutes: number | null }; billable: boolean }>>();
  const byLawyerMap = new Map<string, Array<{ _sum: { minutes: number | null }; billable: boolean }>>();
  for (const row of grouped) { byMatterMap.set(row.matterId, [...(byMatterMap.get(row.matterId) || []), row]); byLawyerMap.set(row.userId, [...(byLawyerMap.get(row.userId) || []), row]); }
  const users = input.includeLawyers && byLawyerMap.size ? await db.user.findMany({ where: { id: { in: [...byLawyerMap.keys()] } }, select: { id: true, name: true } }) : [];
  const userNames = new Map(users.map((user) => [user.id, user.name || 'Unknown']));
  return {
    periodStart: input.periodStart?.toISOString() || null, periodEnd: input.periodEnd?.toISOString() || null, ...totals(grouped), activeMatterCountWithTime: byMatterMap.size,
    byMatter: [...byMatterMap.entries()].map(([matterId, rows]) => ({ matterId, matterName: matterNames.get(matterId) || null, ...totals(rows) })),
    ...(input.includeLawyers ? { byLawyer: [...byLawyerMap.entries()].map(([userId, rows]) => ({ userId, lawyerName: userNames.get(userId) || null, ...totals(rows) })) } : {}),
    recentEntries: recentEntries.map((entry) => ({ id: entry.id, description: entry.description, minutes: entry.minutes, billable: entry.billable, workDate: entry.workDate.toISOString(), matter: entry.matter, lawyerName: entry.user.name || null })),
  };
}

export async function getCurrentUserTimeSummary(userId: string, now = new Date(), db = prisma) {
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(dayStart); weekStart.setDate(dayStart.getDate() - ((dayStart.getDay() + 6) % 7));
  const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);
  const summarize = async (start: Date) => totals(await db.timeEntry.groupBy({ by: ['billable'], where: { userId, workDate: { gte: start, lt: now } }, _sum: { minutes: true } }));
  const [today, thisWeek, thisMonth] = await Promise.all([summarize(dayStart), summarize(weekStart), summarize(monthStart)]);
  return { today, thisWeek, thisMonth };
}
