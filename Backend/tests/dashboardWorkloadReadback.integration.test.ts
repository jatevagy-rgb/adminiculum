/**
 * Dashboard workload readback — persistence + aggregation (PostgreSQL).
 *
 * Proves the "Milyen munkák várnak rám?" attention workload reflects persisted
 * task classification for the acting user, with truthful unclassified handling.
 * No historical backfill is performed or required.
 */

import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createTask } from '../src/modules/tasks/services';
import { resolveTaskPlanning } from '../src/modules/tasks/taskPlanning';
import { getDashboardOperationalOverview } from '../src/modules/cases/dashboardOperational';

const databaseUrl = process.env.DASHBOARD_WORKLOAD_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('dashboard attention workload readback (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID().slice(0, 8);
  const ids = {
    admin: crypto.randomUUID(),
    userA: crypto.randomUUID(),
    userB: crypto.randomUUID(),
    client: crypto.randomUUID(),
    case: crypto.randomUUID(),
    definition: crypto.randomUUID(),
  };

  const categoryCount = (overview: Awaited<ReturnType<typeof getDashboardOperationalOverview>>, category: string) =>
    overview.attentionWorkload.categories.find((c) => c.attentionCategory === category)?.count ?? 0;

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.createMany({ data: [
      { id: ids.admin, email: `dw-admin-${suffix}@test.invalid`, name: 'DW Admin', role: 'ADMIN', status: 'ACTIVE' },
      { id: ids.userA, email: `dw-a-${suffix}@test.invalid`, name: 'DW User A', role: 'LAWYER', status: 'ACTIVE' },
      { id: ids.userB, email: `dw-b-${suffix}@test.invalid`, name: 'DW User B', role: 'LAWYER', status: 'ACTIVE' },
    ] as never });
    await db.client.create({ data: { id: ids.client, name: `DW Client ${suffix}` } as never });
    await db.case.create({ data: {
      id: ids.case, caseNumber: `DW-${suffix}`, title: 'DW case', caseType: 'OTHER', clientId: ids.client, createdById: ids.admin, assignedLawyerId: ids.userA,
    } as never });
    await db.taskDefinition.create({ data: {
      id: ids.definition, clientId: ids.client, label: 'DW approval type', defaultAttentionCategory: 'APPROVAL', status: 'ACTIVE', createdById: ids.admin,
    } as never });
  });

  afterAll(async () => { await db?.$disconnect(); });

  it('counts an explicit attention category for the assigned user', async () => {
    const before = await getDashboardOperationalOverview({ userId: ids.userA, role: 'LAWYER' });
    const baseline = categoryCount(before, 'QUICK_SCAN');
    await createTask({ caseId: ids.case, title: 'Explicit quick scan', taskType: 'OTHER', type: 'OTHER', priority: 'MEDIUM' as never, assignedBy: ids.admin, assignedTo: ids.userA, attentionCategory: 'QUICK_SCAN' });
    const after = await getDashboardOperationalOverview({ userId: ids.userA, role: 'LAWYER' });
    expect(categoryCount(after, 'QUICK_SCAN')).toBe(baseline + 1);
  });

  it('applies the TaskDefinition default attention category', async () => {
    const planning = await resolveTaskPlanning(
      { taskDefinitionId: ids.definition, taskDefinitionClientId: ids.client, taskTypeLabel: null, plannedReviewerId: null, estimatedMinutes: null, attentionCategory: null, saveToCatalogue: false },
      { userId: ids.admin, role: 'ADMIN' },
    );
    expect(planning.attentionCategory).toBe('APPROVAL');
    const before = await getDashboardOperationalOverview({ userId: ids.userA, role: 'LAWYER' });
    const baseline = categoryCount(before, 'APPROVAL');
    await createTask({ caseId: ids.case, title: 'Default approval', taskType: 'OTHER', type: 'OTHER', assignedBy: ids.admin, assignedTo: ids.userA, attentionCategory: planning.attentionCategory as never, taskDefinitionId: planning.taskDefinitionId });
    const after = await getDashboardOperationalOverview({ userId: ids.userA, role: 'LAWYER' });
    expect(categoryCount(after, 'APPROVAL')).toBe(baseline + 1);
  });

  it('keeps unclassified tasks truthful (Nincs besorolva) and never backfills', async () => {
    const before = await getDashboardOperationalOverview({ userId: ids.userA, role: 'LAWYER' });
    const baseline = before.attentionWorkload.unclassified.count;
    const task = await createTask({ caseId: ids.case, title: 'Unclassified', taskType: 'OTHER', type: 'OTHER', assignedBy: ids.admin, assignedTo: ids.userA, attentionCategory: null });
    const persisted = await db.task.findUnique({ where: { id: task.id } });
    expect(persisted?.attentionCategory).toBeNull();
    const after = await getDashboardOperationalOverview({ userId: ids.userA, role: 'LAWYER' });
    expect(after.attentionWorkload.unclassified.count).toBe(baseline + 1);
  });

  it('does not inflate another user\'s workload', async () => {
    const before = await getDashboardOperationalOverview({ userId: ids.userA, role: 'LAWYER' });
    const baseline = categoryCount(before, 'DETAILED_REVIEW');
    await createTask({ caseId: ids.case, title: 'Other user task', taskType: 'OTHER', type: 'OTHER', assignedBy: ids.admin, assignedTo: ids.userB, attentionCategory: 'DETAILED_REVIEW' });
    const after = await getDashboardOperationalOverview({ userId: ids.userA, role: 'LAWYER' });
    expect(categoryCount(after, 'DETAILED_REVIEW')).toBe(baseline);
  });

  it('excludes terminal tasks from the workload', async () => {
    const task = await createTask({ caseId: ids.case, title: 'Will close', taskType: 'OTHER', type: 'OTHER', assignedBy: ids.admin, assignedTo: ids.userA, attentionCategory: 'SIGNATURE' });
    const before = await getDashboardOperationalOverview({ userId: ids.userA, role: 'LAWYER' });
    const baseline = categoryCount(before, 'SIGNATURE');
    await db.task.update({ where: { id: task.id }, data: { status: 'DONE' } as never });
    const after = await getDashboardOperationalOverview({ userId: ids.userA, role: 'LAWYER' });
    expect(categoryCount(after, 'SIGNATURE')).toBe(baseline - 1);
  });
});
