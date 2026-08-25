import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const databaseUrl = process.env.WORK_PACKAGE_SCHEMA_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('WP-1 work package schema foundation (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  const caseId = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const caseTypeDefinitionId = crypto.randomUUID();
  const workflowTemplateId = crypto.randomUUID();
  const workPackageTemplateId = crypto.randomUUID();
  const workPackageItemId = crypto.randomUUID();
  const secondWorkPackageItemId = crypto.randomUUID();
  const caseWorkPackageId = crypto.randomUUID();
  const caseWorkPackageItemId = crypto.randomUUID();
  const secondCaseWorkPackageItemId = crypto.randomUUID();

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.create({ data: { id: userId, email: `wp1-${suffix}@example.invalid`, name: 'WP-1 Test User', role: 'ADMIN' } });
    await db.client.create({ data: { id: clientId, name: `WP-1 Client ${suffix}` } });
    await db.case.create({
      data: {
        id: caseId,
        caseNumber: `WP1-${suffix}`,
        title: 'Legacy case preserved by WP-1',
        caseType: 'OTHER',
        clientId,
        createdById: userId,
      },
    });
    await db.task.create({
      data: {
        id: taskId,
        title: 'Legacy task preserved by WP-1',
        taskType: 'OTHER',
        caseId,
        requiredSkills: [],
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    });
  });

  afterAll(async () => {
    await db.task.update({ where: { id: taskId }, data: { workPackageItemId: null } });
    await db.task.delete({ where: { id: taskId } });
    await db.caseWorkPackageItem.deleteMany({ where: { caseWorkPackageId } });
    await db.caseWorkPackage.delete({ where: { id: caseWorkPackageId } });
    await db.workPackageTemplateItem.deleteMany({ where: { workPackageTemplateId } });
    await db.workPackageTemplate.delete({ where: { id: workPackageTemplateId } });
    await db.workflowTemplate.delete({ where: { id: workflowTemplateId } });
    await db.caseTypeDefinition.delete({ where: { id: caseTypeDefinitionId } });
    await db.case.delete({ where: { id: caseId } });
    await db.client.delete({ where: { id: clientId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  });

  it('keeps legacy Case and Task values unchanged and defaults new links to NULL', async () => {
    const legacyCase = await db.case.findUniqueOrThrow({ where: { id: caseId } });
    const legacyTask = await db.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(legacyCase.caseType).toBe('OTHER');
    expect(legacyCase.caseTypeDefinitionId).toBeNull();
    expect(legacyTask.workPackageItemId).toBeNull();
  });

  it('creates the five tables and three typed enums without bootstrap product rows', async () => {
    const tables = await db.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN (
        'case_type_definitions', 'work_package_templates', 'work_package_template_items',
        'case_work_packages', 'case_work_package_items'
      ) ORDER BY table_name`;
    const enums = await db.$queryRaw<Array<{ typname: string }>>`
      SELECT typname FROM pg_type WHERE typtype = 'e' AND typname IN (
        'WorkPackageModuleType', 'WorkPackageTemplateStatus', 'CaseWorkPackageItemStatus'
      ) ORDER BY typname`;
    expect(tables.map((row) => row.table_name)).toEqual([
      'case_type_definitions', 'case_work_package_items', 'case_work_packages',
      'work_package_template_items', 'work_package_templates',
    ]);
    expect(enums.map((row) => row.typname)).toEqual([
      'CaseWorkPackageItemStatus', 'WorkPackageModuleType', 'WorkPackageTemplateStatus',
    ]);
    expect(await db.caseTypeDefinition.count()).toBe(0);
    expect(await db.workPackageTemplate.count()).toBe(0);
  });

  it('persists versioned templates and allows repeated module types by moduleKey', async () => {
    await db.caseTypeDefinition.create({ data: { id: caseTypeDefinitionId, slug: `wp1-${suffix}`, name: 'WP-1 test case type' } });
    await db.workflowTemplate.create({ data: { id: workflowTemplateId, key: `wp1-workflow-${suffix}`, name: 'WP-1 workflow', status: 'ACTIVE' } });
    await db.workPackageTemplate.create({
      data: {
        id: workPackageTemplateId,
        caseTypeDefinitionId,
        name: 'WP-1 template',
        version: 1,
        status: 'ACTIVE',
        defaultWorkflowTemplateId: workflowTemplateId,
      },
    });
    await db.workPackageTemplateItem.createMany({
      data: [
        { id: workPackageItemId, workPackageTemplateId, moduleType: 'DOCUMENT_WORK', moduleKey: 'incoming-contract-review', label: 'Incoming review' },
        { id: secondWorkPackageItemId, workPackageTemplateId, moduleType: 'DOCUMENT_WORK', moduleKey: 'final-delivery', label: 'Final delivery' },
      ],
    });
    await expect(db.workPackageTemplate.create({ data: { caseTypeDefinitionId, name: 'duplicate version', version: 1 } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(db.workPackageTemplateItem.create({ data: { workPackageTemplateId, moduleType: 'RESEARCH', moduleKey: 'incoming-contract-review', label: 'Duplicate key' } })).rejects.toMatchObject({ code: 'P2002' });
    expect(await db.workPackageTemplateItem.count({ where: { workPackageTemplateId } })).toBe(2);
  });

  it('persists one case snapshot with revision zero and provenance-safe instance items', async () => {
    const snapshot = await db.caseWorkPackage.create({
      data: {
        id: caseWorkPackageId,
        caseId,
        workPackageTemplateId,
        workPackageTemplateVersion: 1,
        snapshotWorkflowTemplateId: workflowTemplateId,
        createdById: userId,
        items: {
          create: [
            { id: caseWorkPackageItemId, moduleType: 'DOCUMENT_WORK', moduleKey: 'incoming-contract-review', label: 'Snapshot review', sourceTemplateItemId: workPackageItemId, createdById: userId },
            { id: secondCaseWorkPackageItemId, moduleType: 'DOCUMENT_WORK', moduleKey: 'final-delivery', label: 'Snapshot delivery', sourceTemplateItemId: secondWorkPackageItemId, createdById: userId },
          ],
        },
      },
      include: { items: true },
    });
    expect(snapshot.revision).toBe(0);
    expect(snapshot.items).toHaveLength(2);
    await db.task.update({ where: { id: taskId }, data: { workPackageItemId: caseWorkPackageItemId } });
    expect((await db.task.findUniqueOrThrow({ where: { id: taskId } })).workPackageItemId).toBe(caseWorkPackageItemId);
    await expect(db.caseWorkPackage.create({ data: { caseId } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(db.caseWorkPackageItem.create({ data: { caseWorkPackageId, moduleType: 'RESEARCH', moduleKey: 'incoming-contract-review', label: 'Duplicate instance key' } })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects invalid provenance and protects referenced legal-work history from cascades', async () => {
    await expect(db.workPackageTemplate.create({ data: { caseTypeDefinitionId: crypto.randomUUID(), name: 'invalid FK' } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(db.workPackageTemplate.delete({ where: { id: workPackageTemplateId } })).rejects.toMatchObject({ code: 'P2003' });
    await db.workPackageTemplateItem.delete({ where: { id: workPackageItemId } });
    const snapshotItem = await db.caseWorkPackageItem.findUniqueOrThrow({ where: { id: caseWorkPackageItemId } });
    expect(snapshotItem.sourceTemplateItemId).toBeNull();
    await db.caseWorkPackageItem.delete({ where: { id: caseWorkPackageItemId } });
    const preservedTask = await db.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(preservedTask.id).toBe(taskId);
    expect(preservedTask.workPackageItemId).toBeNull();
  });
});
