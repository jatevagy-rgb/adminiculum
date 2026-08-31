import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

jest.mock('../src/modules/sharepoint', () => ({
  driveService: { createCaseFolders: jest.fn().mockResolvedValue(null) },
}));

import casesService from '../src/modules/cases/services';

const databaseUrl = process.env.WORK_PACKAGE_CASE_CREATION_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('WP-3 case creation work package integration (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  const caseTypeDefinitionId = crypto.randomUUID();
  const workflowTemplateId = crypto.randomUUID();
  const workPackageTemplateId = crypto.randomUUID();
  const requiredItemId = crypto.randomUUID();
  const optionalItemId = crypto.randomUUID();
  let createdCaseId: string;

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.create({ data: { id: userId, email: `wp3-${suffix}@example.invalid`, name: 'WP-3 Test User', role: 'ADMIN' } });
    await db.client.create({ data: { id: clientId, name: `WP-3 Client ${suffix}` } });
    await db.caseTypeDefinition.create({ data: { id: caseTypeDefinitionId, slug: `wp3-${suffix}`, name: 'WP-3 type' } });
    await db.workflowTemplate.create({
      data: {
        id: workflowTemplateId,
        key: `wp3-workflow-${suffix}`,
        name: 'WP-3 workflow',
        status: 'ACTIVE',
        version: 1,
        steps: [{ key: 'review', title: 'Review', dependsOn: [], publicMilestoneCandidate: true }],
      },
    });
    await db.workPackageTemplate.create({
      data: {
        id: workPackageTemplateId,
        caseTypeDefinitionId,
        name: 'WP-3 active template',
        version: 1,
        status: 'ACTIVE',
        defaultWorkflowTemplateId: workflowTemplateId,
        items: {
          create: [
            { id: requiredItemId, moduleType: 'DOCUMENT_WORK', moduleKey: 'required-review', label: 'Required review', isOptional: false, config: { documentRole: 'contract' } },
            { id: optionalItemId, moduleType: 'RESEARCH', moduleKey: 'optional-research', label: 'Optional research', isOptional: true, config: { topic: 'background' } },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    if (createdCaseId) {
      await db.task.deleteMany({ where: { caseId: createdCaseId } });
      await db.timelineEvent.deleteMany({ where: { caseId: createdCaseId } });
      await db.caseWorkPackageItem.deleteMany({ where: { caseWorkPackage: { caseId: createdCaseId } } });
      await db.caseWorkPackage.deleteMany({ where: { caseId: createdCaseId } });
      await db.case.delete({ where: { id: createdCaseId } });
    }
    await db.workPackageTemplateItem.deleteMany({ where: { workPackageTemplateId } });
    await db.workPackageTemplate.delete({ where: { id: workPackageTemplateId } });
    await db.workflowTemplate.delete({ where: { id: workflowTemplateId } });
    await db.caseTypeDefinition.delete({ where: { id: caseTypeDefinitionId } });
    await db.client.delete({ where: { id: clientId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  });

  it('resolves the active template and snapshots selected modules and workflow provenance atomically', async () => {
    const result = await casesService.createCase({
      clientId, clientName: `WP-3 Client ${suffix}`, matterType: 'OTHER',
      caseTypeDefinitionId, selectedModuleKeys: ['required-review'], createdById: userId,
    }, db);
    createdCaseId = result.id;

    const snapshot = await db.caseWorkPackage.findUniqueOrThrow({ where: { caseId: result.id }, include: { items: true } });
    const createdCase = await db.case.findUniqueOrThrow({ where: { id: result.id } });
    const workflowTask = await db.task.findFirstOrThrow({ where: { caseId: result.id } });
    expect(createdCase.caseTypeDefinitionId).toBe(caseTypeDefinitionId);
    expect(snapshot.workPackageTemplateId).toBe(workPackageTemplateId);
    expect(snapshot.workPackageTemplateVersion).toBe(1);
    expect(snapshot.snapshotWorkflowTemplateId).toBe(workflowTemplateId);
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]).toMatchObject({ moduleKey: 'required-review', sourceTemplateItemId: requiredItemId });
    expect(workflowTask.workflowTemplateKey).toBe(`wp3-workflow-${suffix}`);
    expect(workflowTask.workflowTemplateVersion).toBe(1);
  });

  it('rolls back the Case when module selection is invalid', async () => {
    const before = await db.case.count();
    const wpBefore = await db.caseWorkPackage.count();
    await expect(casesService.createCase({
      clientId, clientName: `WP-3 Client ${suffix}`, matterType: 'OTHER',
      caseTypeDefinitionId, selectedModuleKeys: ['missing-module'], createdById: userId,
    }, db)).rejects.toMatchObject({ code: 'MODULE_NOT_IN_TEMPLATE' });
    expect(await db.case.count()).toBe(before);
    expect(await db.caseWorkPackage.count()).toBe(wpBefore);
  });
});
