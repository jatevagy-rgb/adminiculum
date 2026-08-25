import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import { getCaseAttentionSummary, listCaseAttentionSummaries } from '../src/modules/cases/attention.service';

const databaseUrl = process.env.CASE_ATTENTION_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('case attention read model (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const ids = { user: crypto.randomUUID(), clientA: crypto.randomUUID(), clientB: crypto.randomUUID(), caseA: crypto.randomUUID(), caseB: crypto.randomUUID(), caseClosed: crypto.randomUUID(), overdue: crypto.randomUUID(), future: crypto.randomUUID(), deadline: crypto.randomUUID() };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.create({ data: { id: ids.user, email: `attention-${suffix}@example.invalid`, name: 'Attention User', role: 'LAWYER' } });
    await db.client.createMany({ data: [{ id: ids.clientA, name: `Attention A ${suffix}` }, { id: ids.clientB, name: `Attention B ${suffix}` }] });
    await db.case.createMany({ data: [
      { id: ids.caseA, caseNumber: `ATT-A-${suffix.slice(0, 8)}`, title: 'Attention A', caseType: 'OTHER', clientId: ids.clientA, createdById: ids.user, assignedLawyerId: ids.user },
      { id: ids.caseB, caseNumber: `ATT-B-${suffix.slice(0, 8)}`, title: 'Attention B', caseType: 'OTHER', clientId: ids.clientB, createdById: ids.user, assignedLawyerId: null },
      { id: ids.caseClosed, caseNumber: `ATT-C-${suffix.slice(0, 8)}`, title: 'Closed attention', caseType: 'OTHER', clientId: ids.clientA, createdById: ids.user, status: 'ARCHIVED', assignedLawyerId: ids.user },
    ] as any });
    await db.task.createMany({ data: [
      { id: ids.overdue, caseId: ids.caseA, title: 'Overdue task', taskType: 'OTHER', type: 'OTHER', status: 'TODO', priority: 'HIGH', dueDate: new Date(Date.now() - 86_400_000), assignedById: ids.user, requiredSkills: [] },
      { id: ids.future, caseId: ids.caseA, title: 'Future task', taskType: 'OTHER', type: 'OTHER', status: 'TODO', priority: 'MEDIUM', dueDate: new Date(Date.now() + 10 * 86_400_000), assignedById: ids.user, requiredSkills: [] },
    ] as any });
    await db.caseIntakeDeadline.create({ data: { id: ids.deadline, caseId: ids.caseA, title: 'Imminent deadline', deadlineType: 'INTERNAL', dueAt: new Date(Date.now() + 86_400_000), createdById: ids.user } });
  });

  afterAll(async () => {
    await db.caseIntakeDeadline.deleteMany({ where: { caseId: { in: [ids.caseA, ids.caseB, ids.caseClosed] } } });
    await db.task.deleteMany({ where: { caseId: { in: [ids.caseA, ids.caseB, ids.caseClosed] } } });
    await db.case.deleteMany({ where: { id: { in: [ids.caseA, ids.caseB, ids.caseClosed] } } });
    await db.client.deleteMany({ where: { id: { in: [ids.clientA, ids.clientB] } } });
    await db.user.deleteMany({ where: { id: ids.user } });
    await db.$disconnect();
  });

  it('prioritizes overdue open work and ignores completed/closed cases', async () => {
    const summary = await getCaseAttentionSummary(ids.caseA, db);
    expect(summary?.urgency).toBe('URGENT');
    expect(summary?.nextAction?.sourceId).toBe(ids.overdue);
    await db.task.update({ where: { id: ids.overdue }, data: { status: 'DONE' } });
    const after = await getCaseAttentionSummary(ids.caseA, db);
    expect(after?.nextAction?.sourceType).toBe('INTAKE_DEADLINE');
    expect((await getCaseAttentionSummary(ids.caseClosed, db))?.nextAction).toBeNull();
  });

  it('exposes explicit deadlines, keeps ordering deterministic, and scopes dashboard results', async () => {
    const summary = await getCaseAttentionSummary(ids.caseA, db);
    expect(summary?.signals.some((signal) => signal.sourceType === 'INTAKE_DEADLINE')).toBe(true);
    const list = await listCaseAttentionSummaries({ userId: ids.user, role: 'LAWYER', clientId: ids.clientA, limit: 10 }, db);
    expect(list.map((item) => item.case.id)).toEqual([ids.caseA]);
    expect(list.every((item) => item.case.client.id === ids.clientA)).toBe(true);
  });
});
