import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import {
  activateTemplate, createCaseType, createTemplate, updateTemplate, listTemplates,
  resolveCaseTypeDefinition, validateModuleConfig, WorkPackageAdminError, updateCaseType,
} from '../src/modules/work-package-admin/service';

const databaseUrl = process.env.WORK_PACKAGE_ADMIN_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('WP-2 work package administration (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const partnerId = crypto.randomUUID();
  const lawyerId = crypto.randomUUID();
  const caseTypeId = crypto.randomUUID();
  const workflowId = crypto.randomUUID();
  const createdTemplateIds: string[] = [];

  const admin = { userId: adminId, role: 'ADMIN' };
  const partner = { userId: partnerId, role: 'PARTNER' };
  const lawyer = { userId: lawyerId, role: 'LAWYER' };
  const item = (moduleKey: string, moduleType = 'DOCUMENT_WORK') => ({ moduleType, moduleKey, label: `Label ${moduleKey}`, order: 0, config: {} });

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.createMany({ data: [
      { id: adminId, email: `wp2-admin-${suffix}@example.invalid`, name: 'WP2 Admin', role: 'ADMIN' },
      { id: partnerId, email: `wp2-partner-${suffix}@example.invalid`, name: 'WP2 Partner', role: 'PARTNER' },
      { id: lawyerId, email: `wp2-lawyer-${suffix}@example.invalid`, name: 'WP2 Lawyer', role: 'LAWYER' },
    ] });
    await db.workflowTemplate.create({ data: { id: workflowId, key: `wp2-workflow-${suffix}`, name: 'WP2 workflow', status: 'ACTIVE' } });
  });

  afterAll(async () => {
    await db.workPackageTemplateItem.deleteMany({ where: { workPackageTemplateId: { in: createdTemplateIds } } });
    await db.workPackageTemplate.deleteMany({ where: { id: { in: createdTemplateIds } } });
    await db.caseTypeDefinition.deleteMany({ where: { id: caseTypeId } });
    await db.workflowTemplate.delete({ where: { id: workflowId } });
    await db.user.deleteMany({ where: { id: { in: [adminId, partnerId, lawyerId] } } });
    await db.$disconnect();
  });

  it('enforces internal reads and ADMIN/PARTNER mutations', async () => {
    await expect(createCaseType(lawyer, { slug: `wp2-${suffix}`, name: 'Forbidden' }, db)).rejects.toBeInstanceOf(WorkPackageAdminError);
    const created = await createCaseType(admin, { id: caseTypeId, slug: `wp2-${suffix}`, name: 'Munkajog' }, db);
    expect(created.id).toBe(caseTypeId);
    await expect(createCaseType(lawyer, { slug: `wp2-other-${suffix}`, name: 'Forbidden' }, db)).rejects.toMatchObject({ status: 403 });
  });

  it('keeps the case type slug immutable and resolves explicit links before legacy keys', async () => {
    await db.caseTypeDefinition.update({ where: { id: caseTypeId }, data: { legacyCaseTypeKey: 'OTHER' } });
    await expect(updateCaseType(admin, caseTypeId, { slug: `changed-${suffix}` }, db)).rejects.toMatchObject({ code: 'CASE_TYPE_SLUG_IMMUTABLE' });
    const explicit = await resolveCaseTypeDefinition({ caseTypeDefinitionId: caseTypeId, caseType: 'OTHER' }, db);
    expect(explicit?.id).toBe(caseTypeId);
    const legacy = await resolveCaseTypeDefinition({ caseTypeDefinitionId: null, caseType: 'OTHER' }, db);
    expect(legacy?.id).toBe(caseTypeId);
  });

  it('creates a draft, validates workflow binding and module configs, and has no runtime work side effects', async () => {
    expect(() => validateModuleConfig('DEADLINE', { daysFromStart: '3' })).toThrow(WorkPackageAdminError);
    expect(() => validateModuleConfig('RESEARCH', { unsupported: true })).toThrow(WorkPackageAdminError);
    const before = await Promise.all([
      db.caseWorkPackage.count(), db.task.count(), db.document.count(),
    ]);
    const draft = await createTemplate(partner, { caseTypeDefinitionId: caseTypeId, name: 'Első sablon', defaultWorkflowTemplateId: workflowId, items: [item('review-contract'), item('final-delivery')] }, db);
    createdTemplateIds.push(draft.id);
    expect(draft.status).toBe('DRAFT');
    expect(draft.items).toHaveLength(2);
    await expect(createTemplate(admin, { caseTypeDefinitionId: caseTypeId, name: 'Bad workflow', defaultWorkflowTemplateId: crypto.randomUUID() }, db)).rejects.toMatchObject({ code: 'WORKFLOW_TEMPLATE_NOT_FOUND' });
    expect(await Promise.all([db.caseWorkPackage.count(), db.task.count(), db.document.count()])).toEqual(before);
  });

  it('activates one version, archives siblings, and makes active edits a new immutable version', async () => {
    const first = (await listTemplates(caseTypeId, admin, db)).find((row) => row.id === createdTemplateIds[0])!;
    await activateTemplate(admin, first.id, db);
    const versionTwo = await updateTemplate(partner, first.id, { name: 'Második verzió', items: [item('review-contract', 'REVIEW')] }, db);
    createdTemplateIds.push(versionTwo.id);
    expect(versionTwo.status).toBe('DRAFT');
    expect(versionTwo.version).toBe(first.version + 1);
    expect((await db.workPackageTemplate.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('ACTIVE');
    await activateTemplate(partner, versionTwo.id, db);
    const siblings = await db.workPackageTemplate.findMany({ where: { caseTypeDefinitionId: caseTypeId } });
    expect(siblings.filter((row) => row.status === 'ACTIVE')).toHaveLength(1);
    expect(siblings.find((row) => row.id === first.id)?.status).toBe('ARCHIVED');
    await expect(updateTemplate(admin, first.id, { name: 'Nope' }, db)).rejects.toMatchObject({ code: 'WORK_PACKAGE_TEMPLATE_IMMUTABLE' });
  });
});
