import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  CaseWorkPackageOperationalError,
  createTaskFromCaseWorkPackageItem,
  getCaseWorkPackage,
  mutateCaseWorkPackageItem,
} from '../src/modules/cases/caseWorkPackageOperational.service';

const databaseUrl = process.env.WORK_PACKAGE_OPERATIONAL_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('work package operational runtime (PostgreSQL)', () => {
  const suffix = crypto.randomUUID();
  const ids = {
    admin: crypto.randomUUID(),
    collaborator: crypto.randomUUID(),
    outsider: crypto.randomUUID(),
    client: crypto.randomUUID(),
    matter: crypto.randomUUID(),
    case: crypto.randomUUID(),
    otherCase: crypto.randomUUID(),
    caseType: crypto.randomUUID(),
    template: crypto.randomUUID(),
    requiredTemplateItem: crypto.randomUUID(),
    optionalTemplateItem: crypto.randomUUID(),
    package: crypto.randomUUID(),
    requiredItem: crypto.randomUUID(),
    optionalItem: crypto.randomUUID(),
    disabledItem: crypto.randomUUID(),
  };
  let db: PrismaClient;

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.createMany({ data: [
      { id: ids.admin, email: `wp-runtime-admin-${suffix}@example.invalid`, name: 'Runtime admin', role: 'ADMIN' },
      { id: ids.collaborator, email: `wp-runtime-collab-${suffix}@example.invalid`, name: 'Runtime collaborator', role: 'COLLAB_LAWYER' },
      { id: ids.outsider, email: `wp-runtime-outsider-${suffix}@example.invalid`, name: 'Runtime outsider', role: 'LAWYER' },
    ] });
    await db.client.create({ data: { id: ids.client, name: `Runtime client ${suffix}` } });
    await db.matter.create({ data: { id: ids.matter, title: 'Runtime matter', clientId: ids.client, status: 'OPEN' } as never });
    await db.case.create({ data: { id: ids.case, caseNumber: `WP-RUNTIME-${suffix.slice(0, 8)}`, title: 'Runtime case', caseType: 'OTHER', clientId: ids.client, matterId: ids.matter, createdById: ids.admin, assignedLawyerId: ids.admin } as never });
    await db.case.create({ data: { id: ids.otherCase, caseNumber: `WP-RUNTIME-OTHER-${suffix.slice(0, 8)}`, title: 'Other runtime case', caseType: 'OTHER', clientId: ids.client, createdById: ids.outsider } as never });
    await db.caseCollaborator.create({ data: { caseId: ids.case, userId: ids.collaborator, role: 'CONTRIBUTOR' } as never });
    await db.caseTypeDefinition.create({ data: { id: ids.caseType, slug: `wp-runtime-${suffix}`, name: 'Runtime type', createdById: ids.admin } });
    await db.workPackageTemplate.create({
      data: {
        id: ids.template,
        caseTypeDefinitionId: ids.caseType,
        name: 'Runtime template',
        status: 'ACTIVE',
        createdById: ids.admin,
        items: { create: [
          { id: ids.requiredTemplateItem, moduleType: 'DOCUMENT_WORK', moduleKey: 'required-review', label: 'Required review', isOptional: false },
          { id: ids.optionalTemplateItem, moduleType: 'RESEARCH', moduleKey: 'optional-research', label: 'Optional research', isOptional: true },
        ] },
      },
    });
    await db.caseWorkPackage.create({
      data: {
        id: ids.package,
        caseId: ids.case,
        workPackageTemplateId: ids.template,
        workPackageTemplateVersion: 1,
        createdById: ids.admin,
        items: { create: [
          { id: ids.requiredItem, moduleType: 'DOCUMENT_WORK', moduleKey: 'required-review', label: 'Required review', sourceTemplateItemId: ids.requiredTemplateItem, order: 0, createdById: ids.admin },
          { id: ids.optionalItem, moduleType: 'RESEARCH', moduleKey: 'optional-research', label: 'Optional research', sourceTemplateItemId: ids.optionalTemplateItem, order: 1, createdById: ids.admin },
          { id: ids.disabledItem, moduleType: 'RESEARCH', moduleKey: 'already-excluded', label: 'Excluded work', sourceTemplateItemId: ids.optionalTemplateItem, order: 2, status: 'DISABLED', createdById: ids.admin },
        ] },
      },
    });
  });

  afterAll(async () => {
    await db.timelineEvent.deleteMany({ where: { caseId: { in: [ids.case, ids.otherCase] } } });
    await db.task.deleteMany({ where: { caseId: { in: [ids.case, ids.otherCase] } } });
    await db.caseCollaborator.deleteMany({ where: { caseId: ids.case } });
    await db.caseWorkPackageItem.deleteMany({ where: { caseWorkPackage: { caseId: { in: [ids.case, ids.otherCase] } } } });
    await db.caseWorkPackage.deleteMany({ where: { caseId: { in: [ids.case, ids.otherCase] } } });
    await db.workPackageTemplateItem.deleteMany({ where: { workPackageTemplateId: ids.template } });
    await db.workPackageTemplate.deleteMany({ where: { id: ids.template } });
    await db.caseTypeDefinition.deleteMany({ where: { id: ids.caseType } });
    await db.case.deleteMany({ where: { id: { in: [ids.case, ids.otherCase] } } });
    await db.matter.deleteMany({ where: { id: ids.matter } });
    await db.client.deleteMany({ where: { id: ids.client } });
    await db.user.deleteMany({ where: { id: { in: [ids.admin, ids.collaborator, ids.outsider] } } });
    await db.$disconnect();
  });

  it('returns deterministic operational items and excludes disabled items from remaining work', async () => {
    const result = await getCaseWorkPackage(ids.case);
    expect(result?.items.map((item) => item.id)).toEqual([ids.requiredItem, ids.optionalItem, ids.disabledItem]);
    expect(result?.progress).toMatchObject({ total: 3, totalActive: 2, completed: 0, remaining: 2, required: 1 });
    expect(result?.items.find((item) => item.id === ids.requiredItem)?.required).toBe(true);
    expect(result?.items.find((item) => item.id === ids.optionalItem)?.required).toBe(false);
  });

  it('enforces bounded mutation input and protects required items', async () => {
    await expect(mutateCaseWorkPackageItem(ids.case, ids.requiredItem, { status: 'DISABLED', expectedRevision: 0 })).rejects.toMatchObject({ code: 'REQUIRED_ITEM_CANNOT_DISABLE' });
    await expect(mutateCaseWorkPackageItem(ids.case, ids.disabledItem, { status: 'ACTIVE', expectedRevision: 0 })).rejects.toMatchObject({ code: 'DISABLED_ITEM_IMMUTABLE' });
    await expect(mutateCaseWorkPackageItem(ids.case, ids.requiredItem, { expectedRevision: 0, note: 'x'.repeat(2_001) })).rejects.toMatchObject({ code: 'INVALID_FIELD' });
    await expect(mutateCaseWorkPackageItem(ids.case, ids.requiredItem, { expectedRevision: 0, ignored: true } as any)).rejects.toMatchObject({ code: 'UNEXPECTED_FIELD' });
  });

  it('uses atomic revision conflict semantics for concurrent writers', async () => {
    const current = await getCaseWorkPackage(ids.case);
    const attempts = await Promise.allSettled([
      mutateCaseWorkPackageItem(ids.case, ids.optionalItem, { expectedRevision: current!.revision, note: 'first' }),
      mutateCaseWorkPackageItem(ids.case, ids.optionalItem, { expectedRevision: current!.revision, note: 'second' }),
    ]);
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const rejected = attempts.find((result): result is PromiseRejectedResult => result.status === 'rejected')!;
    expect(rejected.reason).toMatchObject({ code: 'WORK_PACKAGE_REVISION_CONFLICT', status: 409 });
    expect((await getCaseWorkPackage(ids.case))!.revision).toBe(current!.revision + 1);
  });

  it('allows only case-eligible responsible users and keeps completed items closed', async () => {
    const current = await getCaseWorkPackage(ids.case);
    await expect(mutateCaseWorkPackageItem(ids.case, ids.optionalItem, { expectedRevision: current!.revision, responsibleUserId: ids.outsider })).rejects.toMatchObject({ code: 'RESPONSIBLE_NOT_CASE_ELIGIBLE' });
    const assigned = await mutateCaseWorkPackageItem(ids.case, ids.optionalItem, { expectedRevision: current!.revision, responsibleUserId: ids.collaborator });
    expect(assigned.item.responsibleId).toBe(ids.collaborator);
    const blockingTaskId = crypto.randomUUID();
    await db.task.create({ data: { id: blockingTaskId, caseId: ids.case, title: 'Blocking task', taskType: 'OTHER', status: 'TODO', priority: 'MEDIUM', assignedById: ids.admin, workPackageItemId: ids.optionalItem } as never });
    await expect(mutateCaseWorkPackageItem(ids.case, ids.optionalItem, { expectedRevision: assigned.revision, status: 'COMPLETED' })).rejects.toMatchObject({ code: 'ACTIVE_TASKS_BLOCK_COMPLETE' });
    await db.task.update({ where: { id: blockingTaskId }, data: { status: 'DONE' } });
    const completed = await mutateCaseWorkPackageItem(ids.case, ids.optionalItem, { expectedRevision: assigned.revision, status: 'COMPLETED' });
    expect(completed.item.status).toBe('COMPLETED');
    await expect(mutateCaseWorkPackageItem(ids.case, ids.optionalItem, { expectedRevision: completed.revision, status: 'ACTIVE' })).rejects.toMatchObject({ code: 'COMPLETED_ITEM_IMMUTABLE' });
  });

  it('creates one provenance task through the canonical task service and preserves matter/timeline links', async () => {
    const attempts = await Promise.all([
      createTaskFromCaseWorkPackageItem(ids.case, ids.requiredItem, { title: 'Prepare required review', assignedToId: ids.collaborator }, ids.admin),
      createTaskFromCaseWorkPackageItem(ids.case, ids.requiredItem, { title: 'Prepare required review', assignedToId: ids.collaborator }, ids.admin),
    ]);
    expect(attempts.filter((attempt) => attempt.created)).toHaveLength(1);
    expect(attempts.filter((attempt) => !attempt.created)).toHaveLength(1);
    const created = attempts.find((attempt) => attempt.created)!;
    expect(created.task).toMatchObject({ caseId: ids.case, matterId: ids.matter, workPackageItemId: ids.requiredItem });
    expect(await db.timelineEvent.findFirst({ where: { caseId: ids.case, type: 'TASK_ASSIGNED', payload: { path: ['taskId'], equals: created.task.id } } })).not.toBeNull();
    expect(await db.task.count({ where: { workPackageItemId: ids.requiredItem } })).toBe(1);
  });

  it('fails closed for cross-case items and retains canonical string task identifiers in the projection', async () => {
    const otherPackage = crypto.randomUUID();
    const otherItem = crypto.randomUUID();
    await db.caseWorkPackage.create({ data: { id: otherPackage, caseId: ids.otherCase, createdById: ids.outsider, items: { create: { id: otherItem, moduleType: 'RESEARCH', moduleKey: 'other', label: 'Other', createdById: ids.outsider } } } });
    await expect(createTaskFromCaseWorkPackageItem(ids.case, otherItem, { title: 'Nope' }, ids.admin)).rejects.toMatchObject({ code: 'WORK_PACKAGE_ITEM_NOT_FOUND', status: 404 });
    const stringTaskId = '0123456789abcdef0123456789abcdef';
    await db.task.create({ data: { id: stringTaskId, caseId: ids.case, title: 'Canonical string task', taskType: 'OTHER', status: 'TODO', priority: 'MEDIUM', assignedById: ids.admin, workPackageItemId: ids.requiredItem } as never });
    expect((await getCaseWorkPackage(ids.case))!.items.find((item) => item.id === ids.requiredItem)?.tasks.some((task) => task.id === stringTaskId)).toBe(true);
    await db.task.delete({ where: { id: stringTaskId } });
    await db.caseWorkPackageItem.deleteMany({ where: { caseWorkPackageId: otherPackage } });
    await db.caseWorkPackage.delete({ where: { id: otherPackage } });
  });
});
