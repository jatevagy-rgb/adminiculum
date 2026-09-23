/**
 * F-003 targeted repair — ordinary case creation must be able to select an
 * EXISTING active case type, with or without an active work package. Global
 * case-type creation stays a separate, explicit feature.
 *
 * No database: these are the real service functions driven by a fake db/tx, so
 * they run in the default CI job.
 */
const prismaMock = { caseTypeDefinition: { findMany: jest.fn() } };
jest.mock('../src/prisma/prisma.service', () => ({ prisma: prismaMock }));
jest.mock('../src/middleware/auth', () => ({ authenticate: jest.fn() }));

import { listCaseCreationOptions, createUsableCaseType } from '../src/modules/work-package-admin/service';
import { createCaseWorkPackageSnapshot, CaseWorkPackageError } from '../src/modules/cases/caseWorkPackage.service';

const admin = { userId: 'admin-1', role: 'ADMIN' };

describe('creation catalogue exposes existing active case types', () => {
  it('offers an active case type that has no active work package, with a null template', async () => {
    const db: any = {
      caseTypeDefinition: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'type-szerzodes', slug: 'szerzodes', name: 'Szerződés', description: null, icon: null, workPackageTemplates: [] },
        ]),
      },
    };

    const options = await listCaseCreationOptions(admin, db);

    expect(options).toHaveLength(1);
    expect(options[0].caseTypeDefinition).toMatchObject({ id: 'type-szerzodes', name: 'Szerződés' });
    expect(options[0].template).toBeNull();
    // The eligibility gate must be "active case type", never "has an ACTIVE work package".
    expect(db.caseTypeDefinition.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
  });

  it('still enriches a type that does have an active work package', async () => {
    const db: any = {
      caseTypeDefinition: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'type-munkajog', slug: 'munkajog', name: 'Munkajog', description: null, icon: null,
            workPackageTemplates: [{ id: 'tpl-1', caseTypeDefinitionId: 'type-munkajog', name: 'Alap', description: null, status: 'ACTIVE', version: 1, defaultWorkflowTemplateId: null, items: [], createdAt: new Date(), updatedAt: new Date() }],
          },
        ]),
      },
    };

    const options = await listCaseCreationOptions(admin, db);
    expect(options[0].template?.id).toBe('tpl-1');
  });
});

describe('case creation accepts a canonical case type without an active work package', () => {
  function txWithoutTemplate() {
    return {
      caseTypeDefinition: { findUnique: jest.fn().mockResolvedValue({ id: 'type-szerzodes', isActive: true }) },
      workPackageTemplate: { findFirst: jest.fn().mockResolvedValue(null) },
      caseWorkPackage: { create: jest.fn() },
    };
  }

  it('creates the case with the selected type and no work package snapshot when no modules were requested', async () => {
    const tx: any = txWithoutTemplate();

    const result = await createCaseWorkPackageSnapshot(tx, 'case-1', 'user-1', { caseTypeDefinitionId: 'type-szerzodes', selectedModuleKeys: [] }, 'CONTRACT');

    expect(result).toBeNull();
    expect(tx.caseWorkPackage.create).not.toHaveBeenCalled();
  });

  it('treats omitted module selection the same as an empty selection', async () => {
    const tx: any = txWithoutTemplate();
    await expect(createCaseWorkPackageSnapshot(tx, 'case-1', 'user-1', { caseTypeDefinitionId: 'type-szerzodes' }, 'CONTRACT')).resolves.toBeNull();
  });

  it('still fails closed when modules are explicitly requested but no template can bind them', async () => {
    const tx: any = txWithoutTemplate();
    await expect(
      createCaseWorkPackageSnapshot(tx, 'case-1', 'user-1', { caseTypeDefinitionId: 'type-szerzodes', selectedModuleKeys: ['research'] }, 'CONTRACT'),
    ).rejects.toMatchObject({ code: 'ACTIVE_WORK_PACKAGE_NOT_FOUND' });
  });

  it('still rejects an unknown or inactive case type', async () => {
    const missing: any = { caseTypeDefinition: { findUnique: jest.fn().mockResolvedValue(null) }, workPackageTemplate: { findFirst: jest.fn() } };
    await expect(
      createCaseWorkPackageSnapshot(missing, 'case-1', 'user-1', { caseTypeDefinitionId: 'nope' }, 'OTHER'),
    ).rejects.toMatchObject({ code: 'CASE_TYPE_NOT_FOUND' });

    const inactive: any = { caseTypeDefinition: { findUnique: jest.fn().mockResolvedValue({ id: 't', isActive: false }) }, workPackageTemplate: { findFirst: jest.fn() } };
    await expect(
      createCaseWorkPackageSnapshot(inactive, 'case-1', 'user-1', { caseTypeDefinitionId: 't' }, 'OTHER'),
    ).rejects.toMatchObject({ code: 'CASE_TYPE_INACTIVE' });
  });

  it('still snapshots and validates modules when an active template exists', async () => {
    const tx: any = {
      caseTypeDefinition: { findUnique: jest.fn().mockResolvedValue({ id: 'type-1', isActive: true }) },
      workPackageTemplate: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'tpl-1', caseTypeDefinitionId: 'type-1', version: 2, status: 'ACTIVE', defaultWorkflowTemplateId: 'wf-1',
          items: [{ id: 'item-1', moduleType: 'RESEARCH', moduleKey: 'research', label: 'Kutatás', isOptional: false, order: 0, config: { topic: 'x' } }],
        }),
      },
      caseWorkPackage: { create: jest.fn().mockResolvedValue({ id: 'wp-1' }) },
    };

    const result = await createCaseWorkPackageSnapshot(tx, 'case-1', 'user-1', { caseTypeDefinitionId: 'type-1', selectedModuleKeys: ['research'] }, 'OTHER');
    expect(result?.caseTypeDefinitionId).toBe('type-1');
    expect(result?.template.id).toBe('tpl-1');
    expect(tx.caseWorkPackage.create).toHaveBeenCalledTimes(1);

    await expect(
      createCaseWorkPackageSnapshot(tx, 'case-1', 'user-1', { caseTypeDefinitionId: 'type-1', selectedModuleKeys: [] }, 'OTHER'),
    ).rejects.toBeInstanceOf(CaseWorkPackageError);
  });
});

describe('explicit global case-type creation is preserved and still manager-only', () => {
  it('rejects non-managers before any database access', async () => {
    await expect(createUsableCaseType({ userId: 'lawyer-1', role: 'LAWYER' }, { name: 'Szerződés' })).rejects.toMatchObject({ status: 403 });
  });

  it('still creates the type with its atomically activated work package (opt-in path)', async () => {
    const created: any[] = [];
    const tx: any = {
      caseTypeDefinition: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ id: 'type-new' }),
        create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'type-new', slug: data.slug, name: data.name, description: null, icon: null })),
      },
      workPackageTemplate: {
        create: jest.fn().mockImplementation(async ({ data }: any) => { const row = { id: 'tpl-new', ...data, createdAt: new Date(), updatedAt: new Date(), items: [] }; created.push(row); return row; }),
        findUnique: jest.fn().mockImplementation(async () => created[created.length - 1]),
        updateMany: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockImplementation(async () => ({ ...created[created.length - 1], status: 'ACTIVE' })),
      },
    };
    const db: any = { $transaction: (fn: any) => fn(tx) };

    const option = await createUsableCaseType(admin, { name: 'Új ügytípus' }, db);
    expect(option.caseTypeDefinition.name).toBe('Új ügytípus');
    expect(option.template?.status).toBe('ACTIVE');
    expect(tx.workPackageTemplate.update).toHaveBeenCalledTimes(1);
  });
});
