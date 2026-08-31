import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  CaseWorkPackageOperationalError,
  createTaskFromCaseWorkPackageItem,
  getCaseWorkPackage,
  mutateCaseWorkPackageItem,
} from '../src/modules/cases/caseWorkPackageOperational.service';
import {
  CASE_WORK_PACKAGE_SNAPSHOT_KEY,
  createCaseWorkPackageSnapshot,
} from '../src/modules/cases/caseWorkPackage.service';
import { backfillCaseWorkPackageRequiredness } from '../src/modules/cases/caseWorkPackageRequirednessBackfill.service';

const databaseUrl = process.env.WORK_PACKAGE_OPERATIONAL_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('work package operational runtime (PostgreSQL)', () => {
  const suffix = crypto.randomUUID();
  const ids = {
    admin: crypto.randomUUID(),
    collaborator: crypto.randomUUID(),
    lawyer: crypto.randomUUID(),
    trainee: crypto.randomUUID(),
    assistant: crypto.randomUUID(),
    partner: crypto.randomUUID(),
    external: crypto.randomUUID(),
    inactive: crypto.randomUUID(),
    clientUser: crypto.randomUUID(),
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
      { id: ids.lawyer, email: `wp-runtime-lawyer-${suffix}@example.invalid`, name: 'Runtime lawyer', role: 'LAWYER' },
      { id: ids.trainee, email: `wp-runtime-trainee-${suffix}@example.invalid`, name: 'Runtime trainee', role: 'TRAINEE' },
      { id: ids.assistant, email: `wp-runtime-assistant-${suffix}@example.invalid`, name: 'Runtime assistant', role: 'LEGAL_ASSISTANT' },
      { id: ids.partner, email: `wp-runtime-partner-${suffix}@example.invalid`, name: 'Runtime partner', role: 'PARTNER' },
      { id: ids.external, email: `wp-runtime-external-${suffix}@example.invalid`, name: 'Runtime external', role: 'EXTERNAL_REVIEWER' },
      { id: ids.inactive, email: `wp-runtime-inactive-${suffix}@example.invalid`, name: 'Runtime inactive', role: 'LAWYER', isActive: false },
      { id: ids.clientUser, email: `wp-runtime-client-${suffix}@example.invalid`, name: 'Runtime client user', role: 'CLIENT' },
      { id: ids.outsider, email: `wp-runtime-outsider-${suffix}@example.invalid`, name: 'Runtime outsider', role: 'LAWYER' },
    ] });
    await db.client.create({ data: { id: ids.client, name: `Runtime client ${suffix}` } });
    await db.matter.create({ data: { id: ids.matter, title: 'Runtime matter', matterType: 'CONTRACT', clientId: ids.client, status: 'OPEN' } });
    await db.case.create({ data: { id: ids.case, caseNumber: `WP-RUNTIME-${suffix.slice(0, 8)}`, title: 'Runtime case', caseType: 'OTHER', clientId: ids.client, matterId: ids.matter, createdById: ids.admin, assignedLawyerId: ids.admin } as never });
    await db.case.create({ data: { id: ids.otherCase, caseNumber: `WP-RUNTIME-OTHER-${suffix.slice(0, 8)}`, title: 'Other runtime case', caseType: 'OTHER', clientId: ids.client, createdById: ids.outsider } as never });
    await db.caseCollaborator.create({ data: { caseId: ids.case, userId: ids.collaborator, role: 'CONTRIBUTOR' } as never });
    await db.caseCollaborator.createMany({ data: [
      { caseId: ids.case, userId: ids.trainee, role: 'CONTRIBUTOR' },
      { caseId: ids.case, userId: ids.assistant, role: 'CONTRIBUTOR' },
      { caseId: ids.case, userId: ids.lawyer, role: 'CONTRIBUTOR' },
    ] as never });
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
    await db.user.deleteMany({ where: { id: { in: [ids.admin, ids.collaborator, ids.lawyer, ids.trainee, ids.assistant, ids.partner, ids.external, ids.inactive, ids.clientUser, ids.outsider] } } });
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

  it('requires active canonical-workforce roles and exact case eligibility for responsibility', async () => {
    for (const userId of [ids.clientUser, ids.external, ids.inactive, ids.outsider]) {
      const current = await getCaseWorkPackage(ids.case);
      await expect(mutateCaseWorkPackageItem(ids.case, ids.optionalItem, { expectedRevision: current!.revision, responsibleUserId: userId }))
        .rejects.toMatchObject({ code: 'RESPONSIBLE_NOT_CASE_ELIGIBLE', status: 403 });
    }
    for (const userId of [ids.admin, ids.partner, ids.lawyer, ids.collaborator, ids.trainee, ids.assistant]) {
      const current = await getCaseWorkPackage(ids.case);
      const assigned = await mutateCaseWorkPackageItem(ids.case, ids.optionalItem, { expectedRevision: current!.revision, responsibleUserId: userId });
      expect(assigned.item.responsibleId).toBe(userId);
    }
  });

  it('keeps requiredness immutable across template edits and source deletion', async () => {
    const scenarioIds = { caseType: crypto.randomUUID(), template: crypto.randomUUID(), case: crypto.randomUUID(), item: crypto.randomUUID() };
    const createScenario = async (isOptional: boolean) => {
      await db.caseTypeDefinition.create({ data: { id: scenarioIds.caseType, slug: `wp-snapshot-${crypto.randomUUID()}`, name: 'Snapshot type', createdById: ids.admin } });
      await db.workPackageTemplate.create({ data: {
        id: scenarioIds.template, caseTypeDefinitionId: scenarioIds.caseType, name: 'Snapshot template', status: 'ACTIVE', createdById: ids.admin,
        items: { create: { id: scenarioIds.item, moduleType: 'RESEARCH', moduleKey: 'snapshot-research', label: 'Snapshot research', isOptional, config: { topic: 'immutable' } } },
      } });
      await db.case.create({ data: { id: scenarioIds.case, caseNumber: `WP-SNAPSHOT-${crypto.randomUUID().slice(0, 8)}`, title: 'Snapshot case', caseType: 'OTHER', clientId: ids.client, createdById: ids.admin } as never });
      return db.$transaction((tx) => createCaseWorkPackageSnapshot(tx, scenarioIds.case, ids.admin, { caseTypeDefinitionId: scenarioIds.caseType }, 'OTHER'));
    };
    const dispose = async () => {
      await db.caseWorkPackageItem.deleteMany({ where: { caseWorkPackage: { caseId: scenarioIds.case } } });
      await db.caseWorkPackage.deleteMany({ where: { caseId: scenarioIds.case } });
      await db.workPackageTemplateItem.deleteMany({ where: { workPackageTemplateId: scenarioIds.template } });
      await db.workPackageTemplate.deleteMany({ where: { id: scenarioIds.template } });
      await db.caseTypeDefinition.deleteMany({ where: { id: scenarioIds.caseType } });
      await db.case.deleteMany({ where: { id: scenarioIds.case } });
    };

    const requiredSnapshot = await createScenario(false);
    const requiredItem = requiredSnapshot!.snapshot.items[0];
    expect((requiredItem.config as any).topic).toBe('immutable');
    expect((requiredItem.config as any)[CASE_WORK_PACKAGE_SNAPSHOT_KEY]).toEqual({ required: true });
    await db.workPackageTemplateItem.update({ where: { id: scenarioIds.item }, data: { isOptional: true } });
    expect((await getCaseWorkPackage(scenarioIds.case))!.items[0].required).toBe(true);
    await db.workPackageTemplateItem.delete({ where: { id: scenarioIds.item } });
    expect((await getCaseWorkPackage(scenarioIds.case))!.items[0].required).toBe(true);
    await dispose();

    Object.assign(scenarioIds, { caseType: crypto.randomUUID(), template: crypto.randomUUID(), case: crypto.randomUUID(), item: crypto.randomUUID() });
    const optionalSnapshot = await createScenario(true);
    const optionalItem = optionalSnapshot!.snapshot.items[0];
    expect((optionalItem.config as any)[CASE_WORK_PACKAGE_SNAPSHOT_KEY]).toEqual({ required: false });
    await db.workPackageTemplateItem.update({ where: { id: scenarioIds.item }, data: { isOptional: false } });
    let projection = (await getCaseWorkPackage(scenarioIds.case))!;
    expect(projection.items[0].required).toBe(false);
    expect(projection.progress).toMatchObject({ required: 0, requiredCompleted: 0, totalActive: 1 });
    await mutateCaseWorkPackageItem(scenarioIds.case, optionalItem.id, { expectedRevision: projection.revision, status: 'DISABLED' });
    projection = (await getCaseWorkPackage(scenarioIds.case))!;
    expect(projection.progress).toMatchObject({ total: 1, totalActive: 0, completed: 0, remaining: 0, required: 0, requiredCompleted: 0 });
    await db.workPackageTemplateItem.delete({ where: { id: scenarioIds.item } });
    projection = (await getCaseWorkPackage(scenarioIds.case))!;
    expect(projection.items[0].required).toBe(false);
    await dispose();
  });

  it('treats explicitly snapshotted case-added items as required without a template relation', async () => {
    const caseAdded = crypto.randomUUID();
    await db.caseWorkPackageItem.create({ data: {
      id: caseAdded, caseWorkPackageId: ids.package, moduleType: 'CUSTOM', moduleKey: 'case-added-required', label: 'Case added', createdById: ids.admin,
      config: { [CASE_WORK_PACKAGE_SNAPSHOT_KEY]: { required: true } },
    } });
    expect((await getCaseWorkPackage(ids.case))!.items.find((item) => item.id === caseAdded)?.required).toBe(true);
    await db.caseWorkPackageItem.delete({ where: { id: caseAdded } });
  });

  it('treats irrecoverable legacy items as required and prevents disabling them', async () => {
    const legacyItem = crypto.randomUUID();
    await db.caseWorkPackageItem.create({ data: {
      id: legacyItem,
      caseWorkPackageId: ids.package,
      moduleType: 'CUSTOM',
      moduleKey: 'legacy-no-provenance',
      label: 'Legacy item',
      createdById: ids.admin,
      config: { legacy: true },
      sourceTemplateItemId: null,
    } });

    const projection = (await getCaseWorkPackage(ids.case))!;
    expect(projection.items.find((item) => item.id === legacyItem)?.required).toBe(true);
    await expect(mutateCaseWorkPackageItem(ids.case, legacyItem, { status: 'DISABLED', expectedRevision: projection.revision }))
      .rejects.toMatchObject({ code: 'REQUIRED_ITEM_CANNOT_DISABLE' });
    expect(await db.caseWorkPackageItem.findUniqueOrThrow({ where: { id: legacyItem } })).toMatchObject({ sourceTemplateItemId: null, config: { legacy: true } });

    await db.caseWorkPackageItem.delete({ where: { id: legacyItem } });
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

  it('backfills only exact immutable-template legacy provenance and leaves unresolved rows untouched', async () => {
    const alreadySnapshotted = crypto.randomUUID();
    const unresolved = crypto.randomUUID();
    await db.caseWorkPackageItem.update({ where: { id: ids.requiredItem }, data: { config: { documentRole: 'legacy-required' } } });
    await db.caseWorkPackageItem.update({ where: { id: ids.optionalItem }, data: { config: { topic: 'legacy-optional' } } });
    await db.caseWorkPackageItem.update({ where: { id: ids.disabledItem }, data: { config: { topic: 'legacy-disabled' } } });
    await db.caseWorkPackageItem.createMany({ data: [
      { id: alreadySnapshotted, caseWorkPackageId: ids.package, moduleType: 'CUSTOM', moduleKey: 'already-snapshotted', label: 'Already snapshotted', createdById: ids.admin, config: { [CASE_WORK_PACKAGE_SNAPSHOT_KEY]: { required: false }, label: 'preserved' } },
      { id: unresolved, caseWorkPackageId: ids.package, moduleType: 'RESEARCH', moduleKey: 'legacy-unresolved', label: 'Legacy unresolved', createdById: ids.admin, config: { topic: 'unresolved' } },
    ] });

    const scope = { caseWorkPackageIds: [ids.package] };
    const dryRun = await backfillCaseWorkPackageRequiredness(db, { dryRun: true, batchSize: 2, ...scope });
    expect(dryRun.eligible).toBe(3);
    expect(dryRun.repaired).toBe(0);
    expect(dryRun.unresolvedByReason.SOURCE_TEMPLATE_ITEM_MISSING).toBe(1);

    const repaired = await backfillCaseWorkPackageRequiredness(db, { dryRun: false, batchSize: 2, ...scope });
    expect(repaired.repaired).toBe(3);
    expect(repaired.unresolvedByReason.SOURCE_TEMPLATE_ITEM_MISSING).toBe(1);
    expect(((await db.caseWorkPackageItem.findUniqueOrThrow({ where: { id: ids.requiredItem } })).config as any)).toMatchObject({ documentRole: 'legacy-required', [CASE_WORK_PACKAGE_SNAPSHOT_KEY]: { required: true } });
    expect(((await db.caseWorkPackageItem.findUniqueOrThrow({ where: { id: ids.optionalItem } })).config as any)).toMatchObject({ topic: 'legacy-optional', [CASE_WORK_PACKAGE_SNAPSHOT_KEY]: { required: false } });
    expect(((await db.caseWorkPackageItem.findUniqueOrThrow({ where: { id: alreadySnapshotted } })).config as any)).toEqual({ [CASE_WORK_PACKAGE_SNAPSHOT_KEY]: { required: false }, label: 'preserved' });
    expect(((await db.caseWorkPackageItem.findUniqueOrThrow({ where: { id: unresolved } })).config as any)).toEqual({ topic: 'unresolved' });
    expect((await backfillCaseWorkPackageRequiredness(db, { dryRun: false, ...scope })).repaired).toBe(0);

    await db.workPackageTemplateItem.update({ where: { id: ids.requiredTemplateItem }, data: { isOptional: true } });
    await db.workPackageTemplateItem.update({ where: { id: ids.optionalTemplateItem }, data: { isOptional: false } });
    let projection = (await getCaseWorkPackage(ids.case))!;
    expect(projection.items.find((item) => item.id === ids.requiredItem)?.required).toBe(true);
    expect(projection.items.find((item) => item.id === ids.optionalItem)?.required).toBe(false);
    await db.workPackageTemplateItem.deleteMany({ where: { id: { in: [ids.requiredTemplateItem, ids.optionalTemplateItem] } } });
    projection = (await getCaseWorkPackage(ids.case))!;
    expect(projection.items.find((item) => item.id === ids.requiredItem)?.required).toBe(true);
    expect(projection.items.find((item) => item.id === ids.optionalItem)?.required).toBe(false);
    await db.caseWorkPackageItem.deleteMany({ where: { id: { in: [alreadySnapshotted, unresolved] } } });
  });
});
