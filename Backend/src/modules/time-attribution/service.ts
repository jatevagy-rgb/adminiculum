import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';
import { classifyTimeAttribution, TimeAttributionKind } from './attribution';

type AttributionClient = PrismaClient | Prisma.TransactionClient;

export class TaskTimeAttributionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'TaskTimeAttributionError';
  }
}

export type ResolvedTaskTimeAttribution = {
  taskId: string;
  caseId: string;
  matterId: string;
  workPackageItemId: string | null;
  assignedToId: string | null;
  assignedById: string | null;
};

export async function resolveTaskTimeAttribution(
  taskId: string,
  db: AttributionClient = prisma,
): Promise<ResolvedTaskTimeAttribution | null> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      caseId: true,
      matterId: true,
      assignedToId: true,
      assignedById: true,
      workPackageItemId: true,
      case: { select: { id: true, clientId: true, matterId: true } },
      workPackageItem: {
        select: { caseWorkPackage: { select: { caseId: true } } },
      },
    },
  });
  if (!task) return null;

  const taskMatterId = task.matterId;
  const caseMatterId = task.case.matterId;
  if (!taskMatterId && !caseMatterId) {
    throw new TaskTimeAttributionError(
      'TASK_TIME_SCOPE_UNRESOLVED',
      'The task does not have an authoritative matter scope.',
      409,
    );
  }
  if (taskMatterId && caseMatterId && taskMatterId !== caseMatterId) {
    throw new TaskTimeAttributionError(
      'TASK_TIME_SCOPE_UNRESOLVED',
      'The task and case matter scopes are inconsistent.',
      409,
    );
  }

  const matterId = taskMatterId || caseMatterId!;
  const matter = await db.matter.findUnique({
    where: { id: matterId },
    select: { id: true, clientId: true },
  });
  if (!matter || matter.clientId !== task.case.clientId) {
    throw new TaskTimeAttributionError(
      'TASK_TIME_SCOPE_UNRESOLVED',
      'The task matter scope cannot be resolved safely.',
      409,
    );
  }

  const workPackageCaseId = task.workPackageItem?.caseWorkPackage.caseId;
  if (task.workPackageItemId && workPackageCaseId !== task.caseId) {
    throw new TaskTimeAttributionError(
      'TASK_TIME_SCOPE_UNRESOLVED',
      'The task work package scope is inconsistent with its case.',
      409,
    );
  }

  return {
    taskId: task.id,
    caseId: task.caseId,
    matterId,
    workPackageItemId: task.workPackageItemId,
    assignedToId: task.assignedToId,
    assignedById: task.assignedById,
  };
}

export type CaseTimeAttributionSummary = {
  caseId: string;
  matterId: string | null;
  totalMinutes: number;
  attributedMinutes: number;
  exactCaseMinutes: number;
  taskDerivedCaseMinutes: number;
  matterOnlyMinutes: number;
  ambiguousMinutes: number;
  entries: Array<{ id: string; minutes: number; kind: TimeAttributionKind; taskId: string | null }>;
};

export async function getCaseTimeAttributionSummary(
  caseId: string,
  db: AttributionClient = prisma,
): Promise<CaseTimeAttributionSummary | null> {
  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    select: { id: true, matterId: true },
  });
  if (!caseRecord) return null;
  if (!caseRecord.matterId) {
    return {
      caseId,
      matterId: null,
      totalMinutes: 0,
      attributedMinutes: 0,
      exactCaseMinutes: 0,
      taskDerivedCaseMinutes: 0,
      matterOnlyMinutes: 0,
      ambiguousMinutes: 0,
      entries: [],
    };
  }

  const matter = await db.matter.findUnique({
    where: { id: caseRecord.matterId },
    select: { cases: { select: { id: true } } },
  });
  if (!matter) return null;

  const entries = await db.timeEntry.findMany({
    where: { matterId: caseRecord.matterId },
    select: {
      id: true,
      minutes: true,
      taskId: true,
      task: {
        select: {
          caseId: true,
          matterId: true,
          workPackageItem: { select: { caseWorkPackage: { select: { caseId: true } } } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const totals = {
    exactCaseMinutes: 0,
    taskDerivedCaseMinutes: 0,
    matterOnlyMinutes: 0,
    ambiguousMinutes: 0,
  };
  const classifiedEntries = entries.map((entry) => {
    const kind = classifyTimeAttribution({
      caseId,
      matterId: caseRecord.matterId!,
      matterCaseIds: matter.cases.map((record) => record.id),
      task: entry.task
        ? {
            caseId: entry.task.caseId,
            matterId: entry.task.matterId,
            workPackageCaseId: entry.task.workPackageItem?.caseWorkPackage.caseId || null,
          }
        : null,
    });
    if (kind === 'EXACT_CASE') totals.exactCaseMinutes += entry.minutes;
    if (kind === 'TASK_DERIVED_CASE') totals.taskDerivedCaseMinutes += entry.minutes;
    if (kind === 'MATTER_ONLY') totals.matterOnlyMinutes += entry.minutes;
    if (kind === 'AMBIGUOUS') totals.ambiguousMinutes += entry.minutes;
    return { id: entry.id, minutes: entry.minutes, kind, taskId: entry.taskId };
  });

  const totalMinutes = entries.reduce((sum, entry) => sum + entry.minutes, 0);
  return {
    caseId,
    matterId: caseRecord.matterId,
    totalMinutes,
    attributedMinutes: totals.exactCaseMinutes + totals.taskDerivedCaseMinutes,
    ...totals,
    entries: classifiedEntries,
  };
}
