import { PrismaClient } from '@prisma/client';
import { getOperationalMetrics } from '../src/modules/company-workspace/operationalMetricsService';

const databaseUrl = process.env.METRICS_TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const ids = { admin: 'wm-admin', assigned: 'wm-assigned', collab: 'wm-collab', other: 'wm-other', outsider: 'wm-outsider', inactive: 'wm-inactive', client: 'wm-client', otherClient: 'wm-other-client', visible: 'wm-visible', hidden: 'wm-hidden', otherCase: 'wm-other-case', cancelled: 'wm-cancelled' };
const query = { from: '2026-01-01', to: '2026-01-31' };
const actor = (userId: string) => ({ userId, role: userId === ids.admin ? 'ADMIN' : 'LAWYER' });

suite('operational metrics authorized PostgreSQL projection', () => {
  let db: PrismaClient;
  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    expect(['localhost', '127.0.0.1', '::1']).toContain(url.hostname);
    expect(url.pathname).toBe('/adminiculum_replay_ci');
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    await db.user.createMany({ data: [ids.admin, ids.assigned, ids.collab, ids.other, ids.outsider, ids.inactive].map(id => ({ id, name: id, email: `${id}@example.invalid`, role: id === ids.admin ? 'ADMIN' as const : 'LAWYER' as const, status: 'ACTIVE' as const, isActive: id !== ids.inactive, skills: [] })) });
    await db.client.createMany({ data: [{ id: ids.client, name: 'Synthetic metrics client' }, { id: ids.otherClient, name: 'Other synthetic client' }] });
    await db.case.createMany({ data: [
      { id: ids.visible, clientId: ids.client, assignedLawyerId: ids.assigned, completedAt: new Date('2026-01-02T00:00:00Z') },
      { id: ids.hidden, clientId: ids.client, assignedLawyerId: ids.admin, completedAt: new Date('2026-01-04T00:00:00Z') },
      { id: ids.otherCase, clientId: ids.otherClient, assignedLawyerId: ids.other, completedAt: new Date('2026-01-06T00:00:00Z') },
      { id: ids.cancelled, clientId: ids.client, assignedLawyerId: ids.assigned, completedAt: new Date('2026-01-08T00:00:00Z'), status: 'CANCELLED' as const },
    ].map(row => ({ ...row, caseNumber: row.id, title: row.id, caseType: 'CONTRACT_REVIEW' as const, createdById: row.assignedLawyerId, receivedAt: new Date('2026-01-01T00:00:00Z') })) });
    await db.caseCollaborator.create({ data: { caseId: ids.visible, userId: ids.collab, role: 'COLLABORATOR' } });
    await db.task.createMany({ data: [ids.visible, ids.hidden, ids.otherCase].map(caseId => ({ id: `${caseId}-task`, caseId, title: 'Synthetic review', taskType: 'OTHER' as const, requiredSkills: [] })) });
    await db.taskSubmission.createMany({ data: [ids.visible, ids.hidden, ids.otherCase].map(caseId => ({ id: `${caseId}-submission`, taskId: `${caseId}-task`, revisionNumber: 1, status: caseId === ids.visible ? 'RETURNED' as const : 'APPROVED' as const, createdById: ids.assigned, assignedReviewerId: ids.admin, submittedAt: new Date('2026-01-03T10:00:00Z'), returnedAt: caseId === ids.visible ? new Date('2026-01-03T12:00:00Z') : null, approvedAt: caseId === ids.visible ? null : new Date('2026-01-03T12:00:00Z') })) });
    await db.timeEntry.createMany({ data: [
      { id: 'wm-time-own', userId: ids.assigned, caseId: ids.visible, minutes: 30 },
      { id: 'wm-time-hidden', userId: ids.assigned, caseId: ids.hidden, minutes: 999 },
      { id: 'wm-time-other-worker', userId: ids.admin, caseId: ids.visible, minutes: 888 },
      { id: 'wm-time-cross-client', userId: ids.assigned, caseId: ids.otherCase, minutes: 777 },
    ].map(row => ({ ...row, description: 'Synthetic test', workType: 'REVIEW' as const, workDate: new Date('2026-01-03T12:00:00Z') })) });
  });
  afterAll(async () => {
    if (!db) return;
    await db.timeEntry.deleteMany({ where: { id: { startsWith: 'wm-time-' } } });
    await db.taskSubmission.deleteMany({ where: { id: { in: [ids.visible, ids.hidden, ids.otherCase].map(id => `${id}-submission`) } } });
    await db.task.deleteMany({ where: { id: { in: [ids.visible, ids.hidden, ids.otherCase].map(id => `${id}-task`) } } });
    await db.caseCollaborator.deleteMany({ where: { userId: ids.collab } });
    await db.case.deleteMany({ where: { id: { in: [ids.visible, ids.hidden, ids.otherCase, ids.cancelled] } } });
    await db.client.deleteMany({ where: { id: { in: [ids.client, ids.otherClient] } } });
    await db.user.deleteMany({ where: { id: { in: [ids.admin, ids.assigned, ids.collab, ids.other, ids.outsider, ids.inactive] } } });
    await db.$disconnect();
  });
  it('same-client aggregate includes only assigned cases; cancellation and other clients are excluded', async () => {
    const result = await getOperationalMetrics(actor(ids.assigned), ids.client, { ...query, metricKey: 'CASE_CYCLE' }, db);
    expect(result.items[0]).toMatchObject({ value: 1440, sampleCount: 1, sourceRefs: [{ type: 'Case', id: ids.visible, caseId: ids.visible }] });
    const manager = await getOperationalMetrics(actor(ids.admin), ids.client, { ...query, metricKey: 'CASE_CYCLE' }, db);
    expect(manager.items[0].value).toBe(2880);
    expect(manager.items[0].sampleCount).toBe(2);
  });
  it('recorded effort includes own entries only and respects case and client scope', async () => {
    const result = await getOperationalMetrics(actor(ids.assigned), ids.client, { ...query, metricKey: 'RECORDED_EFFORT' }, db);
    expect(result.items[0]).toMatchObject({ value: 30, sampleCount: 1, scope: { visibility: 'OWN_AUTHORIZED_TIME_ENTRIES' } });
    expect(result.items[0].sourceRefs.map(ref => ref.id)).toEqual(['wm-time-own']);
  });
  it('submission ratios join through authorized cases instead of reviewer or author identity', async () => {
    const limited = await getOperationalMetrics(actor(ids.assigned), ids.client, { ...query, metricKey: 'RETURN_FREQUENCY' }, db);
    expect(limited.items[0]).toMatchObject({ value: 1, sampleCount: 1 });
    expect(limited.items[0].sourceRefs.map(ref => ref.id)).toEqual([`${ids.visible}-submission`]);
    const manager = await getOperationalMetrics(actor(ids.admin), ids.client, { ...query, metricKey: 'RETURN_FREQUENCY' }, db);
    expect(manager.items[0]).toMatchObject({ value: 0.5, sampleCount: 2 });
  });
  it('collaboration is rechecked and revocation removes access on the next read', async () => {
    const result = await getOperationalMetrics(actor(ids.collab), ids.client, { ...query, metricKey: 'CASE_CYCLE' }, db);
    expect(result.items[0].sampleCount).toBe(1);
    await db.caseCollaborator.deleteMany({ where: { caseId: ids.visible, userId: ids.collab } });
    await expect(getOperationalMetrics(actor(ids.collab), ids.client, query, db)).rejects.toMatchObject({ status: 403 });
  });
  it('denies cross-client, no-case and inactive actors even with a spoofed manager role', async () => {
    for (const userId of [ids.other, ids.outsider, ids.inactive]) {
      await expect(getOperationalMetrics({ userId, role: 'ADMIN' }, ids.client, query, db)).rejects.toMatchObject({ status: 403 });
    }
  });
  it('empty authorized sources remain null and invalid definitions/periods are rejected', async () => {
    const empty = await getOperationalMetrics(actor(ids.assigned), ids.client, { from: '2025-12-01', to: '2025-12-31', metricKey: 'RETURN_FREQUENCY' }, db);
    expect(empty.items[0]).toMatchObject({ value: null, sampleCount: 0, denominator: null });
    await expect(getOperationalMetrics(actor(ids.admin), ids.client, { ...query, metricKey: '__proto__' }, db)).rejects.toMatchObject({ status: 400 });
    await expect(getOperationalMetrics(actor(ids.admin), ids.client, { from: '2026-02-30', to: '2026-03-01' }, db)).rejects.toMatchObject({ status: 400 });
  });
});
