import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import {
  classifyTimeAttribution,
  attributionLabel,
  type TimeAttributionClassification,
  type TimeAttributionResult,
} from './attribution';

type Db = PrismaClient;
type Range = { periodStart?: Date; periodEnd?: Date };

function rangeWhere(range: Range) {
  return range.periodStart || range.periodEnd
    ? { workDate: { ...(range.periodStart ? { gte: range.periodStart } : {}), ...(range.periodEnd ? { lt: range.periodEnd } : {}) } }
    : {};
}

type EntryRow = {
  id: string;
  minutes: number;
  billable: boolean;
  workDate: Date;
  taskId: string | null;
  description: string | null;
  workType: string | null;
  task: { caseId: string | null; matterId: string | null } | null;
};

type Classified = TimeAttributionResult & {
  minutes: number;
  billable: boolean;
  workDate: Date;
  workType: string | null;
};

export async function getCaseTimeSummary(
  input: { caseId: string; periodStart?: Date; periodEnd?: Date; recentLimit?: number },
  db: Db = defaultPrisma,
) {
  const caseRecord = await db.case.findUnique({
    where: { id: input.caseId },
    select: { id: true, matterId: true, matter: { select: { cases: { select: { id: true } } } } },
  });
  if (!caseRecord) return null;

  const matterCaseIds = caseRecord.matter?.cases.map((item) => item.id) || [];
  const matterId = caseRecord.matterId;

  if (!matterId) {
    return emptySummary(caseRecord.id, 'MATTER_ONLY');
  }

  const entries: EntryRow[] = await db.timeEntry.findMany({
    where: { matterId, ...rangeWhere(input) },
    select: {
      id: true,
      minutes: true,
      billable: true,
      workDate: true,
      taskId: true,
      description: true,
      workType: true,
      task: { select: { caseId: true, matterId: true } },
    },
    orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
  });

  const classified: Classified[] = entries.map((entry) => ({
    ...classifyTimeAttribution({
      matterId,
      matterCaseIds,
      caseId: caseRecord.id,
      task: entry.taskId
        ? { taskId: entry.taskId, caseId: entry.task?.caseId ?? null, matterId: entry.task?.matterId ?? null }
        : null,
    }),
    minutes: entry.minutes,
    billable: entry.billable,
    workDate: entry.workDate,
    workType: entry.workType,
  }));

  const buckets: Record<TimeAttributionClassification, number> = {
    EXACT_CASE: 0,
    TASK_DERIVED_CASE: 0,
    MATTER_ONLY: 0,
    AMBIGUOUS: 0,
  };
  let totalMinutes = 0;
  let billableMinutes = 0;
  let nonBillableMinutes = 0;

  for (const c of classified) {
    buckets[c.classification] += c.minutes;
    totalMinutes += c.minutes;
    if (c.billable) billableMinutes += c.minutes;
    else nonBillableMinutes += c.minutes;
  }

  const recent = classified.slice(0, input.recentLimit ?? 20).map((c) => ({
    classification: c.classification,
    label: attributionLabel(c.classification),
    minutes: c.minutes,
    billable: c.billable,
    workDate: c.workDate.toISOString(),
    workType: c.workType,
  }));

  const seen = new Set(classified.map((c) => c.classification));
  const attributionMode: TimeAttributionClassification =
    seen.size === 1 ? (classified[0]?.classification ?? 'MATTER_ONLY') : 'AMBIGUOUS';

  return {
    caseId: caseRecord.id,
    attributedMinutes: buckets.EXACT_CASE + buckets.TASK_DERIVED_CASE,
    exactCaseMinutes: buckets.EXACT_CASE,
    taskDerivedCaseMinutes: buckets.TASK_DERIVED_CASE,
    matterOnlyMinutes: buckets.MATTER_ONLY,
    ambiguousMinutes: buckets.AMBIGUOUS,
    totalMinutes,
    billableMinutes,
    nonBillableMinutes,
    attributionMode,
    hasAmbiguousMatterTime: buckets.AMBIGUOUS > 0 || classified.some((c) => c.taskId === null && matterCaseIds.length > 1),
    recentEntries: recent,
  };
}

function emptySummary(caseId: string, mode: TimeAttributionClassification) {
  return {
    caseId,
    attributedMinutes: 0,
    exactCaseMinutes: 0,
    taskDerivedCaseMinutes: 0,
    matterOnlyMinutes: 0,
    ambiguousMinutes: 0,
    totalMinutes: 0,
    billableMinutes: 0,
    nonBillableMinutes: 0,
    attributionMode: mode,
    hasAmbiguousMatterTime: false,
    recentEntries: [],
  };
}
