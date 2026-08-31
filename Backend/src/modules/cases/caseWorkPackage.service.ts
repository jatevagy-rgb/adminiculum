import { Prisma } from '@prisma/client';

export class CaseWorkPackageError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
    this.name = 'CaseWorkPackageError';
  }
}

type Db = Prisma.TransactionClient;

// Template item config is a flat, allowlisted object. This reserved nested key is
// therefore outside the template-config contract and belongs only to a case snapshot.
export const CASE_WORK_PACKAGE_SNAPSHOT_KEY = '$caseWorkPackageSnapshot';

export function withCaseWorkPackageRequirednessSnapshot(config: unknown, required: boolean): Prisma.InputJsonValue {
  const base = config && typeof config === 'object' && !Array.isArray(config)
    ? { ...(config as Record<string, Prisma.InputJsonValue>) }
    : {};
  if (Object.prototype.hasOwnProperty.call(base, CASE_WORK_PACKAGE_SNAPSHOT_KEY)) {
    throw new CaseWorkPackageError('RESERVED_SNAPSHOT_CONFIG_KEY', 'Work package template config uses a reserved system key.', 409);
  }
  return {
    ...base,
    [CASE_WORK_PACKAGE_SNAPSHOT_KEY]: { required },
  } as Prisma.InputJsonValue;
}

export type CaseWorkPackageInput = {
  caseTypeDefinitionId?: string | null;
  selectedModuleKeys?: unknown;
};

function selectedKeys(value: unknown): Set<string> | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw new CaseWorkPackageError('INVALID_MODULE_SELECTION', 'selectedModuleKeys must be an array of non-empty strings.');
  }
  return new Set(value.map((entry) => String(entry).trim()));
}

export async function createCaseWorkPackageSnapshot(
  tx: Db,
  caseId: string,
  actorId: string,
  input: CaseWorkPackageInput,
  legacyCaseTypeKey: string,
) {
  const explicitId = input.caseTypeDefinitionId?.trim() || null;
  const caseType = explicitId
    ? await tx.caseTypeDefinition.findUnique({ where: { id: explicitId }, select: { id: true, isActive: true } })
    : await tx.caseTypeDefinition.findFirst({ where: { legacyCaseTypeKey, isActive: true }, select: { id: true, isActive: true } });

  if (explicitId && !caseType) throw new CaseWorkPackageError('CASE_TYPE_NOT_FOUND', 'The selected case type does not exist.', 404);
  if (!caseType) return null;
  if (!caseType.isActive) throw new CaseWorkPackageError('CASE_TYPE_INACTIVE', 'The selected case type is inactive.', 409);

  const template = await tx.workPackageTemplate.findFirst({
    where: { caseTypeDefinitionId: caseType.id, status: 'ACTIVE' },
    orderBy: { version: 'desc' },
    include: {
      items: { orderBy: [{ order: 'asc' }, { moduleKey: 'asc' }] },
      defaultWorkflowTemplate: true,
    },
  });
  if (!template) throw new CaseWorkPackageError('ACTIVE_WORK_PACKAGE_NOT_FOUND', 'No active work package exists for the selected case type.', 409);

  const requested = selectedKeys(input.selectedModuleKeys);
  const available = new Set(template.items.map((item) => item.moduleKey));
  if (requested) {
    for (const key of requested) {
      if (!available.has(key)) throw new CaseWorkPackageError('MODULE_NOT_IN_TEMPLATE', `Module ${key} is not part of the active work package.`);
    }
    for (const item of template.items) {
      if (!item.isOptional && !requested.has(item.moduleKey)) {
        throw new CaseWorkPackageError('REQUIRED_MODULE_NOT_SELECTED', `Required module ${item.moduleKey} must be selected.`);
      }
    }
  }
  const items = template.items.filter((item) => !requested || requested.has(item.moduleKey));

  const snapshot = await tx.caseWorkPackage.create({
    data: {
      caseId,
      workPackageTemplateId: template.id,
      workPackageTemplateVersion: template.version,
      snapshotWorkflowTemplateId: template.defaultWorkflowTemplateId,
      createdById: actorId,
      items: {
        create: items.map((item) => ({
          moduleType: item.moduleType,
          moduleKey: item.moduleKey,
          label: item.label,
          config: withCaseWorkPackageRequirednessSnapshot(item.config, !item.isOptional),
          order: item.order,
          sourceTemplateItemId: item.id,
          createdById: actorId,
        })),
      },
    },
    include: { items: { orderBy: [{ order: 'asc' }, { moduleKey: 'asc' }] } },
  });

  return { snapshot, template, caseTypeDefinitionId: caseType.id, selectedModuleKeys: items.map((item) => item.moduleKey) };
}
