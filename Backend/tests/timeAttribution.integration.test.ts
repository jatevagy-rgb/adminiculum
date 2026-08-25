/**
 * TIME-0 — deterministic recorded-time attribution read model (PostgreSQL).
 *
 * Proves: EXACT_CASE and valid TASK_DERIVED_CASE are included in the Case total;
 * MATTER_ONLY and AMBIGUOUS are never merged into a Case total; a Matter with
 * multiple Cases is never inferred from Matter alone.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { getCaseTimeSummary } from '../src/modules/time-attribution/service';

const databaseUrl =
  process.env.TIME_ATTRIBUTION_TEST_DATABASE_URL ||
  process.env.MIGRATION_REPLAY_DATABASE_URL ||
  process.env.CLIENT_IDENTITY_TEST_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('TIME-0 attribution read model (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const lawyerId = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  const matterSingle = crypto.randomUUID();
  const caseA = crypto.randomUUID();
  const matterMulti = crypto.randomUUID();
  const caseB = crypto.randomUUID();
  const caseC = crypto.randomUUID();
  const taskB = crypto.randomUUID();

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.createMany({
      data: [
        { id: adminId, email: `admin-${suffix}@test.invalid`, name: 'Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] },
        { id: lawyerId, email: `lawyer-${suffix}@test.invalid`, name: 'Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      ],
    });
    await db.client.create({ data: { id: clientId, name: `Time Client ${suffix}` } });
    // Matter with exactly one Case.
    await db.matter.create({ data: { id: matterSingle, title: 'Single Matter', matterType: 'CONTRACT', clientId } });
    await db.case.create({ data: { id: caseA, caseNumber: `T1-${suffix}`, title: 'Case A', caseType: 'CONTRACT_REVIEW', clientId, matterId: matterSingle, assignedLawyerId: lawyerId, createdById: adminId } as never });
    // Matter with two Cases (ambiguity source) + a Task on caseB.
    await db.matter.create({ data: { id: matterMulti, title: 'Multi Matter', matterType: 'CONTRACT', clientId } });
    await db.case.create({ data: { id: caseB, caseNumber: `T2-${suffix}`, title: 'Case B', caseType: 'CONTRACT_REVIEW', clientId, matterId: matterMulti, assignedLawyerId: lawyerId, createdById: adminId } as never });
    await db.case.create({ data: { id: caseC, caseNumber: `T3-${suffix}`, title: 'Case C', caseType: 'CONTRACT_REVIEW', clientId, matterId: matterMulti, assignedLawyerId: lawyerId, createdById: adminId } as never });
    await db.task.create({ data: { id: taskB, title: 'Review Contract', taskType: 'REVIEW_CONTRACT', caseId: caseB, matterId: matterMulti, assignedToId: lawyerId } as never });
  });

  beforeAll(async () => {
    // Time entries.
    await db.timeEntry.createMany({
      data: [
        { id: crypto.randomUUID(), matterId: matterSingle, userId: lawyerId, minutes: 30, workType: 'DRAFTING', billable: true },
        { id: crypto.randomUUID(), matterId: matterSingle, userId: lawyerId, minutes: 20, workType: 'REVIEW', billable: false },
        // Untasked on a multi-case Matter => AMBIGUOUS.
        { id: crypto.randomUUID(), matterId: matterMulti, userId: lawyerId, minutes: 60, workType: 'REVIEW', billable: true },
        // Task-linked on a multi-case Matter => TASK_DERIVED_CASE (caseB).
        { id: crypto.randomUUID(), matterId: matterMulti, userId: lawyerId, minutes: 45, workType: 'DRAFTING', billable: true, taskId: taskB },
      ],
    });
  });

  afterAll(async () => {
    // Cascade-safe cleanup: delete time entries, tasks, cases, matters, client, users.
    await db.timeEntry.deleteMany({ where: { matterId: { in: [matterSingle, matterMulti] } } });
    await db.task.deleteMany({ where: { id: taskB } });
    await db.case.deleteMany({ where: { id: { in: [caseA, caseB, caseC] } } });
    await db.matter.deleteMany({ where: { id: { in: [matterSingle, matterMulti] } } });
    await db.client.deleteMany({ where: { id: clientId } });
    await db.user.deleteMany({ where: { id: { in: [adminId, lawyerId] } } });
    await db.$disconnect();
  });

  it('includes only EXACT_CASE time in a single-Case Matter total', async () => {
    const summary = await getCaseTimeSummary({ caseId: caseA, recentLimit: 20 }, db);
    expect(summary).not.toBeNull();
    expect(summary!.attributedMinutes).toBe(50); // 30 + 20
    expect(summary!.exactCaseMinutes).toBe(50);
    expect(summary!.ambiguousMinutes).toBe(0);
    expect(summary!.totalMinutes).toBe(50);
  });

  it('includes only valid TASK_DERIVED_CASE time and excludes AMBIGUOUS from a multi-Case Matter total', async () => {
    const summary = await getCaseTimeSummary({ caseId: caseB, recentLimit: 20 }, db);
    expect(summary).not.toBeNull();
    expect(summary!.attributedMinutes).toBe(45); // task-derived only
    expect(summary!.taskDerivedCaseMinutes).toBe(45);
    expect(summary!.ambiguousMinutes).toBe(60); // untasked multi-case entry
    expect(summary!.totalMinutes).toBe(105); // 60 ambiguous + 45 task-derived on this Matter
    expect(summary!.hasAmbiguousMatterTime).toBe(true);
  });

  it('does not leak another Case no matter the mode', async () => {
    const summary = await getCaseTimeSummary({ caseId: caseB, recentLimit: 20 }, db);
    expect(summary!.attributedMinutes).not.toBe(105); // never the whole matter as Case time
  });
});
