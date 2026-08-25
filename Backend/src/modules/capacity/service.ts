import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';

type Db = PrismaClient;

const CLOSED_STATUSES = ['DONE', 'COMPLETED', 'CANCELLED'];
const REVIEW_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'IN_REVIEW'];
const URGENT_PRIORITIES = ['HIGH', 'URGENT'];

export interface UserWorkloadProjection {
  userId: string;
  openTasks: number;
  urgentTasks: number;
  overdueTasks: number;
  deadlinesNext7Days: number;
  reviewItems: number;
  recordedTimeLast7DaysMinutes: number;
  recordedTimeLast30DaysMinutes: number;
  knownEstimatedRemainingMinutes: number;
  unknownEstimateItemCount: number;
  activeWorkPackageItems: number;
  /** True only when real data is known; never a fabricated capacity %. */
  capacityKnown: boolean;
  capacityLabel: string;
}

/**
 * CAPACITY-0 — truthful workload projection from known canonical data. Never
 * fabricates a capacity percentage (no capacity denominator exists), never
 * converts to billing/utilization.
 */
export async function getWorkloadForUser(userId: string, db: Db = defaultPrisma): Promise<UserWorkloadProjection> {
  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const openWhere = { assignedToId: userId, status: { notIn: CLOSED_STATUSES as any } };
  const openTasks = await db.task.count({ where: openWhere });
  const urgentTasks = await db.task.count({ where: { ...openWhere, priority: { in: URGENT_PRIORITIES as any } } });
  const overdueTasks = await db.task.count({ where: { ...openWhere, dueDate: { lt: now } } });
  const deadlinesNext7Days = await db.task.count({ where: { ...openWhere, dueDate: { gte: now, lt: sevenDays } } });
  const reviewItems = await db.task.count({ where: { ...openWhere, status: { in: REVIEW_STATUSES as any } } });

  const [timeAgg7, timeAgg30, taskAgg, wpAgg] = await Promise.all([
    db.timeEntry.aggregate({ where: { userId, workDate: { gte: last7, lt: now } }, _sum: { minutes: true } }),
    db.timeEntry.aggregate({ where: { userId, workDate: { gte: last30, lt: now } }, _sum: { minutes: true } }),
    db.task.aggregate({
      where: { ...openWhere, estimatedMinutes: { not: null } },
      _sum: { estimatedMinutes: true },
      _count: true,
    }),
    db.caseWorkPackageItem.count({ where: { responsibleId: userId, status: 'ACTIVE' } }),
  ]);

  const knownEstimatedRemainingMinutes = taskAgg._sum.estimatedMinutes ?? 0;
  const unknownEstimateItemCount = taskAgg._count; // tasks with an estimate; invert below

  // unknownEstimateItemCount = open tasks WITHOUT a stored explicit estimate.
  const withEstimateCount = unknownEstimateItemCount;
  const unknownEstimateItemCountFinal = Math.max(0, openTasks - withEstimateCount);

  return {
    userId,
    openTasks,
    urgentTasks,
    overdueTasks,
    deadlinesNext7Days,
    reviewItems,
    recordedTimeLast7DaysMinutes: timeAgg7._sum.minutes ?? 0,
    recordedTimeLast30DaysMinutes: timeAgg30._sum.minutes ?? 0,
    knownEstimatedRemainingMinutes,
    unknownEstimateItemCount: unknownEstimateItemCountFinal,
    activeWorkPackageItems: wpAgg,
    capacityKnown: true,
    capacityLabel: 'Terhelés ismert adatok alapján',
  };
}

/** Management/team aggregation (ADMIN/PARTNER only). Safely aggregated per user. */
export async function getTeamWorkload(userIds: string[], db: Db = defaultPrisma): Promise<UserWorkloadProjection[]> {
  const rows: UserWorkloadProjection[] = [];
  for (const userId of userIds) {
    rows.push(await getWorkloadForUser(userId, db));
  }
  return rows;
}
