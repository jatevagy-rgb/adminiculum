import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import { getCaseWorkPackage, mutateCaseWorkPackageItem, createTaskFromCaseWorkPackageItem } from '../src/modules/cases/caseWorkPackageOperational.service';

const databaseUrl = process.env.WORK_PACKAGE_OPERATIONAL_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('WP-5A operational work package (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const ids = { user: crypto.randomUUID(), client: crypto.randomUUID(), case: crypto.randomUUID(), pkg: crypto.randomUUID(), item: crypto.randomUUID() };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.create({ data: { id: ids.user, email: `wp5a-${suffix}@example.invalid`, name: 'WP-5A User', role: 'ADMIN' } });
    await db.client.create({ data: { id: ids.client, name: `WP-5A Client ${suffix}` } });
    await db.case.create({ data: { id: ids.case, caseNumber: `WP5A-${suffix.slice(0, 8)}`, title: 'WP-5A case', caseType: 'OTHER', clientId: ids.client, createdById: ids.user, assignedLawyerId: ids.user } as any });
    await db.caseWorkPackage.create({ data: { id: ids.pkg, caseId: ids.case, createdById: ids.user } });
    await db.caseWorkPackageItem.create({ data: { id: ids.item, caseWorkPackageId: ids.pkg, moduleType: 'RESEARCH', moduleKey: 'research', label: 'Research', createdById: ids.user, config: { estimatedMinutes: 60, internalOnly: 'redacted' } } });
  });

  afterAll(async () => {
    await db.task.deleteMany({ where: { caseId: ids.case } });
    await db.timelineEvent.deleteMany({ where: { caseId: ids.case } });
    await db.caseWorkPackageItem.deleteMany({ where: { caseWorkPackageId: ids.pkg } });
    await db.caseWorkPackage.deleteMany({ where: { id: ids.pkg } });
    await db.case.deleteMany({ where: { id: ids.case } });
    await db.client.deleteMany({ where: { id: ids.client } });
    await db.user.deleteMany({ where: { id: ids.user } });
    await db.$disconnect();
  });

  it('reads a safe projection, derives progress, and mutates with revision protection', async () => {
    const initial = await getCaseWorkPackage(ids.case, db);
    expect(initial?.progress).toEqual({ totalItems: 1, completedItems: 0, activeItems: 1, blockedItems: 0 });
    expect(initial?.items[0]).toMatchObject({ moduleKey: 'research', status: 'ACTIVE', configuredMetadata: { estimatedMinutes: 60 }, taskSummary: { total: 0 } });
    expect(initial?.items[0]).not.toHaveProperty('config');
    const updated = await mutateCaseWorkPackageItem({ caseId: ids.case, itemId: ids.item, expectedRevision: initial!.revision, status: 'COMPLETED', responsibleId: ids.user });
    expect(updated?.progress.completedItems).toBe(1);
    await expect(mutateCaseWorkPackageItem({ caseId: ids.case, itemId: ids.item, expectedRevision: initial!.revision, status: 'ACTIVE' })).rejects.toMatchObject({ code: 'WORK_PACKAGE_REVISION_CONFLICT' });
  });

  it('creates an explicit linked task and rolls back a failed task create', async () => {
    const created = await createTaskFromCaseWorkPackageItem({ caseId: ids.case, itemId: ids.item, title: 'Research task', assignedById: ids.user });
    expect(created.task).toMatchObject({ caseId: ids.case, workPackageItemId: ids.item, title: 'Research task' });
    expect(await db.task.count({ where: { caseId: ids.case, workPackageItemId: ids.item } })).toBe(1);
    await expect(createTaskFromCaseWorkPackageItem({ caseId: ids.case, itemId: ids.item, title: 'Rollback task', assignedById: ids.user, dueDate: 'not-a-date' })).rejects.toThrow();
    expect(await db.task.count({ where: { caseId: ids.case, title: 'Rollback task' } })).toBe(0);
  });
});
