/**
 * CAPACITY-0 — truthful workload projection (PostgreSQL).
 *
 * Proves: per-user derived signals (open/urgent/overdue/deadline/review),
 * recorded-time windows, estimate truth (only when an explicit estimate is
 * stored), no billing/utilization, and the projection never fabricates a
 * capacity percentage.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { getWorkloadForUser } from '../src/modules/capacity/service';

const databaseUrl =
  process.env.CAPACITY_TEST_DATABASE_URL ||
  process.env.TIME_ATTRIBUTION_TEST_DATABASE_URL ||
  process.env.MIGRATION_REPLAY_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('CAPACITY-0 workload projection (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const lawyerId = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  const matterId = crypto.randomUUID();
  const caseId = crypto.randomUUID();

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.createMany({
      data: [
        { id: adminId, email: `admin-${suffix}@test.invalid`, name: 'Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] },
        { id: lawyerId, email: `lawyer-${suffix}@test.invalid`, name: 'Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      ],
    });
    await db.client.create({ data: { id: clientId, name: `Workload Client ${suffix}` } });
    await db.matter.create({ data: { id: matterId, title: 'Matter', matterType: 'CONTRACT', clientId } });
    await db.case.create({ data: { id: caseId, caseNumber: `W-${suffix}`, title: 'Case', caseType: 'CONTRACT_REVIEW', clientId, matterId, assignedLawyerId: lawyerId, createdById: adminId } as never });
  });

  afterAll(async () => {
    await db.timeEntry.deleteMany({ where: { userId: lawyerId } });
    await db.task.deleteMany({ where: { caseId } });
    await db.case.deleteMany({ where: { id: caseId } });
    await db.matter.deleteMany({ where: { id: matterId } });
    await db.client.deleteMany({ where: { id: clientId } });
    await db.user.deleteMany({ where: { id: { in: [adminId, lawyerId] } } });
    await db.$disconnect();
  });

  it('derives safe workload signals from canonical data (no fabricated capacity)', async () => {
    const now = new Date();
    await db.task.createMany({
      data: [
        { id: crypto.randomUUID(), title: 'Open', taskType: 'REVIEW_CONTRACT', caseId, matterId, assignedToId: lawyerId, priority: 'HIGH', estimatedMinutes: 30 },
        { id: crypto.randomUUID(), title: 'Overdue', taskType: 'REVIEW_CONTRACT', caseId, matterId, assignedToId: lawyerId, priority: 'URGENT', dueDate: new Date(now.getTime() - 86400000), estimatedMinutes: null },
        { id: crypto.randomUUID(), title: 'Upcoming', taskType: 'REVIEW_CONTRACT', caseId, matterId, assignedToId: lawyerId, dueDate: new Date(now.getTime() + 3 * 86400000), estimatedMinutes: 60 },
        { id: crypto.randomUUID(), title: 'In Review', taskType: 'REVIEW_CONTRACT', caseId, matterId, assignedToId: lawyerId, status: 'IN_REVIEW' },
      ],
    } as never);
    await db.timeEntry.createMany({
      data: [
        { id: crypto.randomUUID(), matterId, userId: lawyerId, minutes: 120, workType: 'DRAFTING', billable: true, workDate: now },
      ],
    });

    const w = await getWorkloadForUser(lawyerId, db);
    // 4 open tasks (none DONE/completed/cancelled), 2 urgent (HIGH+URGENT),
    // 1 overdue, 1 next-7-day deadline, 1 in-review, estimate known 30+60=90.
    expect(w.openTasks).toBe(4);
    expect(w.urgentTasks).toBeGreaterThanOrEqual(2);
    expect(w.overdueTasks).toBe(1);
    expect(w.deadlinesNext7Days).toBe(1);
    expect(w.reviewItems).toBe(1);
    expect(w.recordedTimeLast7DaysMinutes).toBe(120);
    expect(w.knownEstimatedRemainingMinutes).toBe(90);
    expect(w.unknownEstimateItemCount).toBe(2);
    expect(w.capacityKnown).toBe(true);
    expect(w.capacityLabel).toBe('Terhelés ismert adatok alapján');
    // Never billing/utilization.
    expect(w).not.toHaveProperty('utilization');
    expect(w).not.toHaveProperty('billing');
  });
});
