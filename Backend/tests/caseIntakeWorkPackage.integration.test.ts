import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

jest.mock('../src/modules/sharepoint', () => ({
  driveService: { createCaseFolders: jest.fn().mockResolvedValue(null) },
}));

import { createCaseIntake } from '../src/modules/cases/intakeCreate.service';
import { CaseWorkPackageError, CASE_WORK_PACKAGE_SNAPSHOT_KEY } from '../src/modules/cases/caseWorkPackage.service';

const databaseUrl = process.env.WORK_PACKAGE_INTAKE_TEST_DATABASE_URL
  || process.env.WORK_PACKAGE_CASE_CREATION_TEST_DATABASE_URL
  || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('Case intake Work Package unification (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const lawyerId = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  const caseTypeDefinitionId = crypto.randomUUID();
  const workflowTemplateId = crypto.randomUUID();
  const workPackageTemplateId = crypto.randomUUID();
  const createdCaseIds: string[] = [];

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.createMany({
      data: [
        { id: adminId, email: `intake-wp-admin-${suffix}@example.invalid`, name: 'Intake WP Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true },
        { id: lawyerId, email: `intake-wp-lawyer-${suffix}@example.invalid`, name: 'Intake WP Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true },
      ],
    });
    await db.client.create({ data: { id: clientId, name: `Intake WP Client ${suffix}` } });
    await db.caseTypeDefinition.create({
      data: { id: caseTypeDefinitionId, slug: `intake-wp-${suffix}`, name: 'Intake Work Package Type', isActive: true },
    });
    await db.workflowTemplate.create({
      data: {
        id: workflowTemplateId,
        key: `intake-wp-workflow-${suffix}`,
        name: 'Intake Work Package Workflow',
        status: 'ACTIVE',
        version: 1,
        steps: [{ key: 'review', title: 'Review', dependsOn: [], publicMilestoneCandidate: true }],
      },
    });
    await db.workPackageTemplate.create({
      data: {
        id: workPackageTemplateId,
        caseTypeDefinitionId,
        name: 'Intake Work Package v1',
        version: 1,
        status: 'ACTIVE',
        defaultWorkflowTemplateId: workflowTemplateId,
        items: {
          create: [
            { moduleType: 'DOCUMENT_WORK', moduleKey: 'required-review', label: 'Required review', isOptional: false, order: 1, config: { documentRole: 'contract' } },
            { moduleType: 'RESEARCH', moduleKey: 'optional-research', label: 'Optional research', isOptional: true, order: 2, config: { topic: 'background' } },
            { moduleType: 'COMPLIANCE', moduleKey: 'optional-compliance', label: 'Optional compliance', isOptional: true, order: 3, config: { scope: 'standard' } },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    for (const caseId of createdCaseIds) {
      await db.task.deleteMany({ where: { caseId } }).catch(() => {});
      await db.timelineEvent.deleteMany({ where: { caseId } }).catch(() => {});
      await db.caseWorkPackageItem.deleteMany({ where: { caseWorkPackage: { caseId } } }).catch(() => {});
      await db.caseWorkPackage.deleteMany({ where: { caseId } }).catch(() => {});
      await db.case.delete({ where: { id: caseId } }).catch(() => {});
    }
    await db.workPackageTemplateItem.deleteMany({ where: { workPackageTemplateId } }).catch(() => {});
    await db.workPackageTemplate.delete({ where: { id: workPackageTemplateId } }).catch(() => {});
    await db.workflowTemplate.delete({ where: { id: workflowTemplateId } }).catch(() => {});
    await db.caseTypeDefinition.delete({ where: { id: caseTypeDefinitionId } }).catch(() => {});
    await db.client.delete({ where: { id: clientId } }).catch(() => {});
    await db.user.deleteMany({ where: { id: { in: [adminId, lawyerId] } } }).catch(() => {});
    await db.$disconnect();
  });

  async function intake(overrides: Record<string, unknown> = {}) {
    const result = await createCaseIntake(adminId, {
      clientId,
      title: `Intake ${suffix}`,
      matterType: 'OTHER',
      assignedLawyerId: lawyerId,
      caseTypeDefinitionId,
      ...overrides,
    });
    createdCaseIds.push(result.case.id);
    return result;
  }

  it('creates the canonical snapshot, hydrates its response, and instantiates workflow exactly once', async () => {
    const result = await intake({
      initialTasks: [{ title: 'Client-provided task', priority: 'MEDIUM' }],
    });
    expect(result.workPackage?.items.map((item) => item.moduleKey)).toEqual([
      'required-review', 'optional-research', 'optional-compliance',
    ]);
    expect(result.workPackage?.snapshotWorkflowTemplateId).toBe(workflowTemplateId);

    const tasks = await db.task.findMany({ where: { caseId: result.case.id } });
    expect(tasks).toHaveLength(2);
    expect(tasks.filter((task) => task.workflowInstanceId)).toHaveLength(1);
    expect(tasks.filter((task) => !task.workflowInstanceId)).toHaveLength(1);
    expect(tasks.find((task) => !task.workflowInstanceId)?.workPackageItemId).toBeNull();

    const snapshot = await db.caseWorkPackage.findUniqueOrThrow({
      where: { caseId: result.case.id },
      include: { items: true },
    });
    expect((snapshot.items.find((item) => item.moduleKey === 'required-review')?.config as any)[CASE_WORK_PACKAGE_SNAPSHOT_KEY]).toEqual({ required: true });
  });

  it('honors optional selection and rejects required-module omission atomically', async () => {
    const selected = await intake({ selectedModuleKeys: ['required-review', 'optional-compliance'] });
    expect(selected.workPackage?.items.map((item) => item.moduleKey)).toEqual(['required-review', 'optional-compliance']);

    const beforeCases = await db.case.count({ where: { clientId } });
    const beforePackages = await db.caseWorkPackage.count();
    await expect(intake({ selectedModuleKeys: ['optional-research'] })).rejects.toBeInstanceOf(CaseWorkPackageError);
    expect(await db.case.count({ where: { clientId } })).toBe(beforeCases);
    expect(await db.caseWorkPackage.count()).toBe(beforePackages);
  });

  it('keeps the immutable snapshot after the active template is edited', async () => {
    const result = await intake({ selectedModuleKeys: ['required-review'] });
    await db.workPackageTemplateItem.updateMany({
      where: { workPackageTemplateId, moduleKey: 'required-review' },
      data: { label: 'Edited template label', config: { documentRole: 'amended' } },
    });
    const snapshot = await db.caseWorkPackage.findUniqueOrThrow({
      where: { caseId: result.case.id },
      include: { items: true },
    });
    expect(snapshot.items[0].label).toBe('Required review');
    expect((snapshot.items[0].config as any)[CASE_WORK_PACKAGE_SNAPSHOT_KEY]).toEqual({ required: true });
  });

  it('preserves legacy intake without a Case Type and safely rolls back invalid canonical input', async () => {
    const legacy = await createCaseIntake(adminId, {
      clientId,
      title: `Legacy intake ${suffix}`,
      matterType: 'OTHER',
    });
    createdCaseIds.push(legacy.case.id);
    expect(legacy.workPackage).toBeUndefined();
    expect(await db.caseWorkPackage.findUnique({ where: { caseId: legacy.case.id } })).toBeNull();

    const beforeCases = await db.case.count({ where: { clientId } });
    await expect(intake({ selectedModuleKeys: ['required-review', 'unknown-module'] })).rejects.toMatchObject({
      code: 'MODULE_NOT_IN_TEMPLATE',
    });
    expect(await db.case.count({ where: { clientId } })).toBe(beforeCases);
  });
});
