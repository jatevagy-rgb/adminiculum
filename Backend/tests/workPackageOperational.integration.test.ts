import { PrismaClient, CaseWorkPackageItemStatus } from '@prisma/client';
import crypto from 'node:crypto';
import {
  getCaseWorkPackage,
  mutateCaseWorkPackageItem,
  createTaskFromCaseWorkPackageItem,
  CaseWorkPackageOperationalError,
} from '../src/modules/cases/caseWorkPackageOperational.service';

const databaseUrl = process.env.WORK_PACKAGE_OPERATIONAL_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('WP-5 work package operational runtime (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const otherUserId = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  const caseId = crypto.randomUUID();
  const caseWorkPackageId = crypto.randomUUID();
  const itemId = crypto.randomUUID();
  const disabledItemId = crypto.randomUUID();
  let taskWorkPackageItemId: string;

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.create({ data: { id: userId, email: `wp5-actor-${suffix}@example.invalid`, name: 'WP-5 Actor', role: 'ADMIN' } });
    await db.user.create({ data: { id: otherUserId, email: `wp5-other-${suffix}@example.invalid`, name: 'WP-5 Other', role: 'LAWYER' } });
    await db.client.create({ data: { id: clientId, name: `WP-5 Client ${suffix}` } });
    await db.case.create({
      data: {
        id: caseId,
        caseNumber: `WP5-${suffix.slice(0, 8)}`,
        title: 'WP-5 test case',
        caseType: 'OTHER',
        clientId,
        createdById: userId,
        assignedLawyerId: userId,
      },
    } as never);
    await db.caseWorkPackage.create({
      data: {
        id: caseWorkPackageId,
        caseId,
        createdById: userId,
        revision: 0,
        items: {
          create: [
            { id: itemId, moduleType: 'DOCUMENT_WORK', moduleKey: 'review', label: 'Review', config: {}, order: 0, createdById: userId },
            { id: disabledItemId, moduleType: 'RESEARCH', moduleKey: 'research', label: 'Research', config: {}, order: 1, status: 'DISABLED' as CaseWorkPackageItemStatus, createdById: userId },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    if (taskWorkPackageItemId) {
      await db.task.deleteMany({ where: { workPackageItemId: taskWorkPackageItemId } });
    }
    await db.task.deleteMany({ where: { caseId } });
    await db.caseWorkPackageItem.deleteMany({ where: { caseWorkPackage: { caseId } } });
    await db.caseWorkPackage.deleteMany({ where: { caseId } });
    await db.case.delete({ where: { id: caseId } });
    await db.client.delete({ where: { id: clientId } });
    await db.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await db.$disconnect();
  });

  // ── Read ─────────────────────────────────────────────────────────────────

  describe('getCaseWorkPackage', () => {
    it('returns work package with items and progress', async () => {
      const wp = await getCaseWorkPackage(caseId);
      expect(wp).not.toBeNull();
      expect(wp!.id).toBe(caseWorkPackageId);
      expect(wp!.revision).toBe(0);
      expect(wp!.items).toHaveLength(2);
      expect(wp!.progress.total).toBe(2);
      expect(wp!.progress.completed).toBe(0);
      expect(wp!.progress.percentage).toBe(0);
    });

    it('returns null for case without work package', async () => {
      const wp = await getCaseWorkPackage(crypto.randomUUID());
      expect(wp).toBeNull();
    });
  });

  // ── Mutate item status ───────────────────────────────────────────────────

  describe('mutateCaseWorkPackageItem', () => {
    it('updates item status and increments revision', async () => {
      const result = await mutateCaseWorkPackageItem(
        caseId,
        itemId,
        { status: 'COMPLETED', expectedRevision: 0 },
        userId,
      );
      expect(result.item.status).toBe('COMPLETED');
      expect(result.revision).toBe(1);

      const wp = await getCaseWorkPackage(caseId);
      expect(wp!.revision).toBe(1);
      expect(wp!.progress.completed).toBe(1);
      expect(wp!.progress.percentage).toBe(50);
    });

    it('rejects stale revision', async () => {
      await expect(
        mutateCaseWorkPackageItem(
          caseId,
          itemId,
          { status: 'ACTIVE', expectedRevision: 0 },
          userId,
        ),
      ).rejects.toMatchObject({ code: 'STALE_REVISION', status: 409 });
    });

    it('accepts correct revision', async () => {
      const result = await mutateCaseWorkPackageItem(
        caseId,
        itemId,
        { status: 'ACTIVE', expectedRevision: 1 },
        userId,
      );
      expect(result.item.status).toBe('ACTIVE');
      expect(result.revision).toBe(2);
    });

    it('rejects invalid status', async () => {
      await expect(
        mutateCaseWorkPackageItem(
          caseId,
          itemId,
          { status: 'INVALID' as CaseWorkPackageItemStatus, expectedRevision: 2 },
          userId,
        ),
      ).rejects.toMatchObject({ code: 'INVALID_STATUS' });
    });

    it('rejects non-existent item', async () => {
      await expect(
        mutateCaseWorkPackageItem(
          caseId,
          crypto.randomUUID(),
          { status: 'COMPLETED', expectedRevision: 2 },
          userId,
        ),
      ).rejects.toMatchObject({ code: 'ITEM_NOT_FOUND', status: 404 });
    });

    it('rejects non-existent work package', async () => {
      await expect(
        mutateCaseWorkPackageItem(
          crypto.randomUUID(),
          itemId,
          { status: 'COMPLETED', expectedRevision: 0 },
          userId,
        ),
      ).rejects.toMatchObject({ code: 'WORK_PACKAGE_NOT_FOUND', status: 404 });
    });

    it('updates responsible user', async () => {
      const result = await mutateCaseWorkPackageItem(
        caseId,
        itemId,
        { responsibleId: otherUserId, expectedRevision: 2 },
        userId,
      );
      expect(result.item.responsibleId).toBe(otherUserId);
    });

    it('rejects invalid responsible user', async () => {
      await expect(
        mutateCaseWorkPackageItem(
          caseId,
          itemId,
          { responsibleId: crypto.randomUUID(), expectedRevision: 3 },
          userId,
        ),
      ).rejects.toMatchObject({ code: 'INVALID_RESPONSIBLE' });
    });

    it('clears responsible user', async () => {
      const result = await mutateCaseWorkPackageItem(
        caseId,
        itemId,
        { responsibleId: null, expectedRevision: 3 },
        userId,
      );
      expect(result.item.responsibleId).toBeNull();
    });

    it('rejects empty mutation', async () => {
      await expect(
        mutateCaseWorkPackageItem(
          caseId,
          itemId,
          { expectedRevision: 4 },
          userId,
        ),
      ).rejects.toMatchObject({ code: 'NO_FIELDS' });
    });
  });

  // ── Create task from package item ────────────────────────────────────────

  describe('createTaskFromCaseWorkPackageItem', () => {
    it('creates task with workPackageItemId provenance', async () => {
      const result = await createTaskFromCaseWorkPackageItem(
        caseId,
        itemId,
        { title: 'Review the contract', assignedToId: otherUserId },
        userId,
      );
      taskWorkPackageItemId = itemId;
      expect(result.task.title).toBe('Review the contract');
      expect(result.task.workPackageItemId).toBe(itemId);
      expect(result.task.caseId).toBe(caseId);
      expect(result.source.type).toBe('WORK_PACKAGE_ITEM');
      expect(result.source.moduleKey).toBe('review');
    });

    it('rejects task creation on disabled item', async () => {
      await expect(
        createTaskFromCaseWorkPackageItem(
          caseId,
          disabledItemId,
          { title: 'Research task' },
          userId,
        ),
      ).rejects.toMatchObject({ code: 'ITEM_DISABLED' });
    });

    it('rejects empty title', async () => {
      await expect(
        createTaskFromCaseWorkPackageItem(
          caseId,
          itemId,
          { title: '   ' },
          userId,
        ),
      ).rejects.toMatchObject({ code: 'TITLE_REQUIRED' });
    });

    it('rejects non-existent item', async () => {
      await expect(
        createTaskFromCaseWorkPackageItem(
          caseId,
          crypto.randomUUID(),
          { title: 'Task' },
          userId,
        ),
      ).rejects.toMatchObject({ code: 'ITEM_NOT_FOUND', status: 404 });
    });

    it('rejects non-existent work package', async () => {
      await expect(
        createTaskFromCaseWorkPackageItem(
          crypto.randomUUID(),
          itemId,
          { title: 'Task' },
          userId,
        ),
      ).rejects.toMatchObject({ code: 'WORK_PACKAGE_NOT_FOUND', status: 404 });
    });

    it('rejects invalid assignee', async () => {
      await expect(
        createTaskFromCaseWorkPackageItem(
          caseId,
          itemId,
          { title: 'Task', assignedToId: crypto.randomUUID() },
          userId,
        ),
      ).rejects.toMatchObject({ code: 'INVALID_ASSIGNEE' });
    });

    it('task record in DB has workPackageItemId set', async () => {
      const task = await db.task.findFirst({
        where: { caseId, workPackageItemId: itemId },
        select: { id: true, workPackageItemId: true, title: true },
      });
      expect(task).not.toBeNull();
      expect(task!.workPackageItemId).toBe(itemId);
    });
  });

  // ── Authorization substitution ────────────────────────────────────────────

  describe('authorization substitution', () => {
    it('cross-case substitution fails closed', async () => {
      const otherCaseId = crypto.randomUUID();
      await db.case.create({
        data: { id: otherCaseId, caseNumber: `WP5X-${suffix.slice(0, 8)}`, title: 'Other case', caseType: 'OTHER', clientId, createdById: otherUserId } as never,
      });
      const otherWpId = crypto.randomUUID();
      const otherItemId = crypto.randomUUID();
      await db.caseWorkPackage.create({
        data: {
          id: otherWpId,
          caseId: otherCaseId,
          createdById: otherUserId,
          items: {
            create: { id: otherItemId, moduleType: 'RESEARCH', moduleKey: 'x', label: 'X', config: {}, order: 0, createdById: otherUserId },
          },
        },
      });

      // Attempt to mutate item from other case using our caseId
      await expect(
        mutateCaseWorkPackageItem(caseId, otherItemId, { status: 'COMPLETED', expectedRevision: 0 }, userId),
      ).rejects.toMatchObject({ code: 'ITEM_NOT_FOUND' });

      // Cleanup
      await db.task.deleteMany({ where: { caseId: otherCaseId } });
      await db.caseWorkPackageItem.deleteMany({ where: { caseWorkPackage: { caseId: otherCaseId } } });
      await db.caseWorkPackage.deleteMany({ where: { caseId: otherCaseId } });
      await db.case.delete({ where: { id: otherCaseId } });
    });
  });
});
