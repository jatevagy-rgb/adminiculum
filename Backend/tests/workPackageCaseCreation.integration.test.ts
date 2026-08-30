import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

jest.mock('../src/modules/sharepoint', () => ({
  driveService: { createCaseFolders: jest.fn().mockResolvedValue(null) },
}));

import casesService from '../src/modules/cases/services';
import { CaseWorkPackageError, CASE_WORK_PACKAGE_SNAPSHOT_KEY } from '../src/modules/cases/caseWorkPackage.service';

const databaseUrl = process.env.WORK_PACKAGE_CASE_CREATION_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('WP-3 Case Creation Work Package Integration & Productization Replay (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const lawyerId = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  const externalClientId = crypto.randomUUID();
  const inactiveUserId = crypto.randomUUID();
  const caseTypeDefinitionId = crypto.randomUUID();
  const inactiveCaseTypeId = crypto.randomUUID();
  const workflowTemplateId = crypto.randomUUID();
  const workPackageTemplateId = crypto.randomUUID();
  const requiredItemId = crypto.randomUUID();
  const optionalItemId = crypto.randomUUID();
  const extraOptionalItemId = crypto.randomUUID();
  const createdCaseIds: string[] = [];

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    // Users
    await db.user.createMany({
      data: [
        { id: adminId, email: `wp3-admin-${suffix}@example.invalid`, name: 'WP-3 Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true },
        { id: lawyerId, email: `wp3-lawyer-${suffix}@example.invalid`, name: 'WP-3 Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true },
        { id: externalClientId, email: `wp3-client-user-${suffix}@example.invalid`, name: 'WP-3 Client User', role: 'CLIENT', status: 'ACTIVE', isActive: true },
        { id: inactiveUserId, email: `wp3-inactive-${suffix}@example.invalid`, name: 'WP-3 Inactive User', role: 'LAWYER', status: 'INACTIVE', isActive: false },
      ],
    });

    // Clients
    await db.client.create({ data: { id: clientId, name: `WP-3 Client ${suffix}` } });

    // Case Types
    await db.caseTypeDefinition.createMany({
      data: [
        { id: caseTypeDefinitionId, slug: `wp3-${suffix}`, name: 'WP-3 Active Type', isActive: true },
        { id: inactiveCaseTypeId, slug: `wp3-inactive-${suffix}`, name: 'WP-3 Inactive Type', isActive: false },
      ],
    });

    // Workflow Template
    await db.workflowTemplate.create({
      data: {
        id: workflowTemplateId,
        key: `wp3-workflow-${suffix}`,
        name: 'WP-3 Workflow Template',
        status: 'ACTIVE',
        version: 1,
        steps: [{ key: 'review', title: 'Review', dependsOn: [], publicMilestoneCandidate: true }],
      },
    });

    // Work Package Template v1 with required and optional items
    await db.workPackageTemplate.create({
      data: {
        id: workPackageTemplateId,
        caseTypeDefinitionId,
        name: 'WP-3 Active Template v1',
        version: 1,
        status: 'ACTIVE',
        defaultWorkflowTemplateId: workflowTemplateId,
        items: {
          create: [
            { id: requiredItemId, moduleType: 'DOCUMENT_WORK', moduleKey: 'required-review', label: 'Required review', isOptional: false, order: 1, config: { documentRole: 'contract' } },
            { id: optionalItemId, moduleType: 'RESEARCH', moduleKey: 'optional-research', label: 'Optional research', isOptional: true, order: 2, config: { topic: 'background' } },
            { id: extraOptionalItemId, moduleType: 'COMPLIANCE_CHECK', moduleKey: 'optional-compliance', label: 'Optional compliance', isOptional: true, order: 3, config: { scope: 'standard' } },
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
    await db.workPackageTemplateItem.deleteMany({ where: { workPackageTemplate: { caseTypeDefinitionId } } }).catch(() => {});
    await db.workPackageTemplate.deleteMany({ where: { caseTypeDefinitionId } }).catch(() => {});
    await db.workflowTemplate.delete({ where: { id: workflowTemplateId } }).catch(() => {});
    await db.caseTypeDefinition.deleteMany({ where: { id: { in: [caseTypeDefinitionId, inactiveCaseTypeId] } } }).catch(() => {});
    await db.client.delete({ where: { id: clientId } }).catch(() => {});
    await db.user.deleteMany({ where: { id: { in: [adminId, lawyerId, externalClientId, inactiveUserId] } } }).catch(() => {});
    await db.$disconnect();
  });

  // A. Create case with Case Type default package
  it('Scenario A: creates case with Case Type default package (all template modules included)', async () => {
    const deadline = '2026-12-31';
    const result = await casesService.createCase({
      clientId,
      clientName: `WP-3 Client ${suffix}`,
      matterType: 'OTHER',
      title: 'Munkajogi peres ügy',
      caseTypeDefinitionId,
      deadline,
      assignedLawyerId: lawyerId,
      createdById: adminId,
    }, db);
    createdCaseIds.push(result.id);

    const createdCase = await db.case.findUniqueOrThrow({ where: { id: result.id } });
    expect(createdCase.title).toBe('Munkajogi peres ügy');
    expect(createdCase.caseTypeDefinitionId).toBe(caseTypeDefinitionId);
    expect(createdCase.assignedLawyerId).toBe(lawyerId);
    expect(createdCase.deadline).toBeInstanceOf(Date);

    const snapshot = await db.caseWorkPackage.findUniqueOrThrow({
      where: { caseId: result.id },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    expect(snapshot.workPackageTemplateId).toBe(workPackageTemplateId);
    expect(snapshot.workPackageTemplateVersion).toBe(1);
    expect(snapshot.snapshotWorkflowTemplateId).toBe(workflowTemplateId);
    expect(snapshot.items).toHaveLength(3);
    expect(snapshot.items.map((i) => i.moduleKey)).toEqual(['required-review', 'optional-research', 'optional-compliance']);
  });

  // B. Required/optional snapshot persisted with immutable PR96 metadata
  it('Scenario B: persists immutable requiredness snapshot in item config ($caseWorkPackageSnapshot)', async () => {
    const result = await casesService.createCase({
      clientId,
      clientName: `WP-3 Client ${suffix}`,
      matterType: 'OTHER',
      caseTypeDefinitionId,
      createdById: adminId,
    }, db);
    createdCaseIds.push(result.id);

    const snapshot = await db.caseWorkPackage.findUniqueOrThrow({
      where: { caseId: result.id },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    const reqItem = snapshot.items.find((i) => i.moduleKey === 'required-review')!;
    const optItem = snapshot.items.find((i) => i.moduleKey === 'optional-research')!;

    expect((reqItem.config as any)[CASE_WORK_PACKAGE_SNAPSHOT_KEY]).toEqual({ required: true });
    expect((reqItem.config as any).documentRole).toBe('contract');
    expect((optItem.config as any)[CASE_WORK_PACKAGE_SNAPSHOT_KEY]).toEqual({ required: false });
    expect((optItem.config as any).topic).toBe('background');
  });

  // C. Lawyer removes optional recommended module
  it('Scenario C: allows removing optional module when selectedModuleKeys explicitly excludes it', async () => {
    const result = await casesService.createCase({
      clientId,
      clientName: `WP-3 Client ${suffix}`,
      matterType: 'OTHER',
      caseTypeDefinitionId,
      selectedModuleKeys: ['required-review', 'optional-compliance'], // excluded 'optional-research'
      createdById: adminId,
    }, db);
    createdCaseIds.push(result.id);

    const snapshot = await db.caseWorkPackage.findUniqueOrThrow({
      where: { caseId: result.id },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    expect(snapshot.items).toHaveLength(2);
    expect(snapshot.items.map((i) => i.moduleKey)).toEqual(['required-review', 'optional-compliance']);
  });

  // D. Required module cannot be illegally removed
  it('Scenario D: rejects creation when a required module is omitted from selectedModuleKeys', async () => {
    const casesBefore = await db.case.count({ where: { clientId } });
    const wpBefore = await db.caseWorkPackage.count();

    await expect(
      casesService.createCase({
        clientId,
        clientName: `WP-3 Client ${suffix}`,
        matterType: 'OTHER',
        caseTypeDefinitionId,
        selectedModuleKeys: ['optional-research'], // omitted 'required-review'
        createdById: adminId,
      }, db),
    ).rejects.toThrow(CaseWorkPackageError);

    expect(await db.case.count({ where: { clientId } })).toBe(casesBefore);
    expect(await db.caseWorkPackage.count()).toBe(wpBefore);
  });

  // E. Allowed extra module added / unknown module rejected
  it('Scenario E: allows selecting subset of available modules but rejects unknown module keys', async () => {
    // Unknown module rejected
    await expect(
      casesService.createCase({
        clientId,
        clientName: `WP-3 Client ${suffix}`,
        matterType: 'OTHER',
        caseTypeDefinitionId,
        selectedModuleKeys: ['required-review', 'non-existent-module'],
        createdById: adminId,
      }, db),
    ).rejects.toMatchObject({ code: 'MODULE_NOT_IN_TEMPLATE' });

    // Invalid non-string module selection rejected
    await expect(
      casesService.createCase({
        clientId,
        clientName: `WP-3 Client ${suffix}`,
        matterType: 'OTHER',
        caseTypeDefinitionId,
        selectedModuleKeys: [123 as any],
        createdById: adminId,
      }, db),
    ).rejects.toMatchObject({ code: 'INVALID_MODULE_SELECTION' });
  });

  // F. Snapshot remains unchanged after template edit
  it('Scenario F: snapshot and item configuration remain immutable after template edit or new version', async () => {
    const result = await casesService.createCase({
      clientId,
      clientName: `WP-3 Client ${suffix}`,
      matterType: 'OTHER',
      caseTypeDefinitionId,
      selectedModuleKeys: ['required-review'],
      createdById: adminId,
    }, db);
    createdCaseIds.push(result.id);

    // Now update the template in DB (e.g. rename it or change items)
    await db.workPackageTemplate.update({
      where: { id: workPackageTemplateId },
      data: { name: 'Mutated Template Name' },
    });

    const snapshot = await db.caseWorkPackage.findUniqueOrThrow({
      where: { caseId: result.id },
      include: { items: true },
    });
    expect(snapshot.workPackageTemplateVersion).toBe(1);
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0].moduleKey).toBe('required-review');
    expect((snapshot.items[0].config as any)[CASE_WORK_PACKAGE_SNAPSHOT_KEY]).toEqual({ required: true });
  });

  // G. Snapshot remains unchanged after template deactivation
  it('Scenario G: snapshot remains intact and readable when work package template is deactivated', async () => {
    const result = await casesService.createCase({
      clientId,
      clientName: `WP-3 Client ${suffix}`,
      matterType: 'OTHER',
      caseTypeDefinitionId,
      createdById: adminId,
    }, db);
    createdCaseIds.push(result.id);

    // Deactivate template
    await db.workPackageTemplate.update({
      where: { id: workPackageTemplateId },
      data: { status: 'ARCHIVED' },
    });

    const snapshot = await db.caseWorkPackage.findUniqueOrThrow({
      where: { caseId: result.id },
      include: { items: true },
    });
    expect(snapshot.items).toHaveLength(3);

    // Re-activate for subsequent tests
    await db.workPackageTemplate.update({
      where: { id: workPackageTemplateId },
      data: { status: 'ACTIVE' },
    });
  });

  // H. Transaction failure does not leave half-created package
  it('Scenario H: transaction failure rolls back cleanly without orphan cases or packages', async () => {
    const casesBefore = await db.case.count();
    const wpBefore = await db.caseWorkPackage.count();
    const wpItemsBefore = await db.caseWorkPackageItem.count();

    // Module error inside transaction
    await expect(
      casesService.createCase({
        clientId,
        clientName: `WP-3 Client ${suffix}`,
        matterType: 'OTHER',
        caseTypeDefinitionId,
        selectedModuleKeys: ['unknown-extra-module'],
        createdById: adminId,
      }, db),
    ).rejects.toThrow();

    expect(await db.case.count()).toBe(casesBefore);
    expect(await db.caseWorkPackage.count()).toBe(wpBefore);
    expect(await db.caseWorkPackageItem.count()).toBe(wpItemsBefore);
  });

  // I. Wrong/cross-client/inactive case type fails closed
  it('Scenario I: fails closed for non-existent, inactive case type or invalid client', async () => {
    // Non-existent case type
    await expect(
      casesService.createCase({
        clientId,
        clientName: `WP-3 Client ${suffix}`,
        matterType: 'OTHER',
        caseTypeDefinitionId: crypto.randomUUID(),
        createdById: adminId,
      }, db),
    ).rejects.toMatchObject({ code: 'CASE_TYPE_NOT_FOUND' });

    // Inactive case type
    await expect(
      casesService.createCase({
        clientId,
        clientName: `WP-3 Client ${suffix}`,
        matterType: 'OTHER',
        caseTypeDefinitionId: inactiveCaseTypeId,
        createdById: adminId,
      }, db),
    ).rejects.toMatchObject({ code: 'CASE_TYPE_INACTIVE' });

    // Non-existent client
    await expect(
      casesService.createCase({
        clientId: crypto.randomUUID(),
        clientName: 'Fake Client',
        matterType: 'OTHER',
        caseTypeDefinitionId,
        createdById: adminId,
      }, db),
    ).rejects.toThrow('Client not found');
  });

  // J. Responsible lawyer canonical eligibility
  it('Scenario J: enforces workforce role eligibility for responsible lawyer', async () => {
    // Eligible workforce lawyer succeeds
    const okResult = await casesService.createCase({
      clientId,
      clientName: `WP-3 Client ${suffix}`,
      matterType: 'OTHER',
      caseTypeDefinitionId,
      assignedLawyerId: lawyerId,
      createdById: adminId,
    }, db);
    createdCaseIds.push(okResult.id);
    const okCase = await db.case.findUniqueOrThrow({ where: { id: okResult.id } });
    expect(okCase.assignedLawyerId).toBe(lawyerId);

    // CLIENT role fails closed
    await expect(
      casesService.createCase({
        clientId,
        clientName: `WP-3 Client ${suffix}`,
        matterType: 'OTHER',
        caseTypeDefinitionId,
        assignedLawyerId: externalClientId,
        createdById: adminId,
      }, db),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSIBLE_LAWYER' });

    // Inactive user fails closed
    await expect(
      casesService.createCase({
        clientId,
        clientName: `WP-3 Client ${suffix}`,
        matterType: 'OTHER',
        caseTypeDefinitionId,
        assignedLawyerId: inactiveUserId,
        createdById: adminId,
      }, db),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSIBLE_LAWYER' });

    // Non-existent user fails closed
    await expect(
      casesService.createCase({
        clientId,
        clientName: `WP-3 Client ${suffix}`,
        matterType: 'OTHER',
        caseTypeDefinitionId,
        assignedLawyerId: crypto.randomUUID(),
        createdById: adminId,
      }, db),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSIBLE_LAWYER' });
  });
});
