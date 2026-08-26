import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';

type Db = PrismaClient | Prisma.TransactionClient;
type Actor = { userId: string; role?: string | null };

export class WorkPackageAdminError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'WorkPackageAdminError';
  }
}

const MANAGER_ROLES = new Set(['ADMIN', 'PARTNER']);
const INTERNAL_ROLES = new Set(['ADMIN', 'PARTNER', 'LAWYER', 'COLLAB_LAWYER', 'TRAINEE', 'LEGAL_ASSISTANT']);
const MODULE_TYPES = [
  'DOCUMENT_WORK', 'RESEARCH', 'CLIENT_REQUEST', 'AI_PREWORK', 'REVIEW', 'APPROVAL',
  'COMMUNICATION', 'DEADLINE', 'COMPLIANCE', 'CLAUSE', 'DELIVERY', 'TASK_GROUP', 'CUSTOM',
] as const;
type ModuleType = typeof MODULE_TYPES[number];

const MODULE_LABELS: Record<ModuleType, string> = {
  DOCUMENT_WORK: 'Dokumentummunka', RESEARCH: 'Kutatás', CLIENT_REQUEST: 'Ügyfélkérés',
  AI_PREWORK: 'AI-előkészítés', REVIEW: 'Ellenőrzés', APPROVAL: 'Jóváhagyás',
  COMMUNICATION: 'Kommunikáció', DEADLINE: 'Határidő', COMPLIANCE: 'Megfelelés',
  CLAUSE: 'Záradék', DELIVERY: 'Kézbesítés', TASK_GROUP: 'Feladatcsoport', CUSTOM: 'Egyéni',
};

const CONFIG_KEYS: Record<ModuleType, Record<string, 'string' | 'number' | 'boolean'>> = {
  DOCUMENT_WORK: { documentRole: 'string' }, RESEARCH: { topic: 'string' }, CLIENT_REQUEST: { requestType: 'string' },
  AI_PREWORK: { promptKey: 'string' }, REVIEW: { reviewType: 'string' }, APPROVAL: { approvalRole: 'string' },
  COMMUNICATION: { channel: 'string' }, DEADLINE: { daysFromStart: 'number' }, COMPLIANCE: { requirementKey: 'string' },
  CLAUSE: { clauseKey: 'string' }, DELIVERY: { documentRole: 'string' }, TASK_GROUP: { groupKey: 'string' }, CUSTOM: { label: 'string' },
};

const MODULE_TYPE_SET = new Set<string>(MODULE_TYPES);
const MODULE_KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function manager(actor: Actor): void {
  if (!actor?.userId || !MANAGER_ROLES.has(String(actor.role || ''))) throw new WorkPackageAdminError(403, 'WORK_PACKAGE_ADMIN_FORBIDDEN', 'Only ADMIN or PARTNER may change work package definitions.');
}

function internal(actor: Actor): void {
  if (!actor?.userId || !INTERNAL_ROLES.has(String(actor.role || ''))) throw new WorkPackageAdminError(403, 'WORK_PACKAGE_READ_FORBIDDEN', 'Internal workforce access is required.');
}

function text(value: unknown, field: string, max: number, required = false): string | null {
  if (typeof value !== 'string') {
    if (required) throw new WorkPackageAdminError(400, 'FIELD_REQUIRED', `${field} is required.`);
    return value == null ? null : String(value).trim().slice(0, max) || null;
  }
  const output = value.trim();
  if (!output && required) throw new WorkPackageAdminError(400, 'FIELD_REQUIRED', `${field} is required.`);
  if (output.length > max) throw new WorkPackageAdminError(400, 'FIELD_TOO_LONG', `${field} is too long.`);
  return output || null;
}

function slug(value: unknown, field = 'slug'): string {
  const output = text(value, field, 80, true)!.toLowerCase();
  if (!SLUG_RE.test(output)) throw new WorkPackageAdminError(400, 'INVALID_SLUG', `${field} must use lowercase kebab-case.`);
  return output;
}

function moduleKey(value: unknown): string {
  const output = text(value, 'moduleKey', 100, true)!;
  if (!MODULE_KEY_RE.test(output)) throw new WorkPackageAdminError(400, 'INVALID_MODULE_KEY', 'moduleKey must use kebab-case.');
  return output;
}

function moduleType(value: unknown): ModuleType {
  const output = String(value || '');
  if (!MODULE_TYPE_SET.has(output)) throw new WorkPackageAdminError(400, 'INVALID_MODULE_TYPE', 'Unknown work package module type.');
  return output as ModuleType;
}

export function validateModuleConfig(type: ModuleType, value: unknown): Record<string, string | number | boolean> {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new WorkPackageAdminError(400, 'INVALID_MODULE_CONFIG', 'Module config must be an object.');
  const config = value as Record<string, unknown>;
  const allowed = CONFIG_KEYS[type];
  for (const [key, raw] of Object.entries(config)) {
    const expected = allowed[key];
    if (!expected) throw new WorkPackageAdminError(400, 'UNKNOWN_MODULE_CONFIG_KEY', `Unknown config key for ${type}: ${key}.`);
    if (typeof raw !== expected || (expected === 'number' && !Number.isFinite(raw as number))) throw new WorkPackageAdminError(400, 'INVALID_MODULE_CONFIG_VALUE', `Invalid config value for ${key}.`);
  }
  return config as Record<string, string | number | boolean>;
}

function normalizeItem(input: unknown): {
  moduleType: ModuleType; moduleKey: string; label: string; description: string | null; order: number; isOptional: boolean; config: Record<string, string | number | boolean>;
} {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const type = moduleType(raw.moduleType);
  const order = raw.order == null ? 0 : Number(raw.order);
  if (!Number.isInteger(order) || order < 0) throw new WorkPackageAdminError(400, 'INVALID_ITEM_ORDER', 'Item order must be a non-negative integer.');
  return {
    moduleType: type,
    moduleKey: moduleKey(raw.moduleKey),
    label: text(raw.label, 'label', 200, true)!,
    description: text(raw.description, 'description', 2000),
    order,
    isOptional: raw.isOptional === true,
    config: validateModuleConfig(type, raw.config),
  };
}

function dto(row: any) {
  return {
    id: row.id,
    caseTypeDefinitionId: row.caseTypeDefinitionId,
    name: row.name,
    description: row.description ?? null,
    status: row.status,
    version: row.version,
    defaultWorkflowTemplateId: row.defaultWorkflowTemplateId ?? null,
    defaultWorkflowTemplate: row.defaultWorkflowTemplate ? { name: row.defaultWorkflowTemplate.name, version: row.defaultWorkflowTemplate.version } : null,
    items: (row.items || []).map((item: any) => ({
      id: item.id, moduleType: item.moduleType, moduleLabel: MODULE_LABELS[item.moduleType as ModuleType], moduleKey: item.moduleKey,
      label: item.label, description: item.description ?? null, order: item.order, isOptional: item.isOptional, config: item.config || {},
    })),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

const templateInclude = {
  items: { orderBy: { order: 'asc' as const } },
  defaultWorkflowTemplate: { select: { name: true, version: true } },
};

async function validateWorkflowBinding(id: string | null, db: Db): Promise<void> {
  if (id == null) return;
  const row = await db.workflowTemplate.findUnique({ where: { id }, select: { id: true } });
  if (!row) throw new WorkPackageAdminError(400, 'WORKFLOW_TEMPLATE_NOT_FOUND', 'The selected workflow template version does not exist.');
}

async function currentMaxVersion(caseTypeDefinitionId: string, db: Db): Promise<number> {
  const result = await db.workPackageTemplate.aggregate({ where: { caseTypeDefinitionId }, _max: { version: true } });
  return result._max.version || 0;
}

async function withSerializableRetry<T>(db: PrismaClient, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) continue;
      throw error;
    }
  }
  throw new WorkPackageAdminError(409, 'WORK_PACKAGE_CONCURRENT_UPDATE', 'The work package changed concurrently. Reload and retry.');
}

export async function listCaseTypes(actor: Actor, db: Db = defaultPrisma) {
  internal(actor);
  return db.caseTypeDefinition.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { workPackageTemplates: { orderBy: { version: 'desc' }, include: templateInclude } } });
}

export async function createCaseType(actor: Actor, input: Record<string, unknown>, db: Db = defaultPrisma) {
  manager(actor);
  try {
    return await db.caseTypeDefinition.create({ data: { ...(input.id ? { id: String(input.id) } : {}), slug: slug(input.slug), name: text(input.name, 'name', 200, true)!, description: text(input.description, 'description', 2000), icon: text(input.icon, 'icon', 80), sortOrder: input.sortOrder == null ? 0 : Number(input.sortOrder), legacyCaseTypeKey: text(input.legacyCaseTypeKey, 'legacyCaseTypeKey', 80), createdById: actor.userId } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new WorkPackageAdminError(409, 'CASE_TYPE_SLUG_TAKEN', 'This case type slug already exists.');
    throw error;
  }
}

export async function updateCaseType(actor: Actor, id: string, input: Record<string, unknown>, db: Db = defaultPrisma) {
  manager(actor);
  const existing = await db.caseTypeDefinition.findUnique({ where: { id } });
  if (!existing) throw new WorkPackageAdminError(404, 'CASE_TYPE_NOT_FOUND', 'Case type not found.');
  if (input.slug !== undefined && slug(input.slug) !== existing.slug) throw new WorkPackageAdminError(409, 'CASE_TYPE_SLUG_IMMUTABLE', 'Stable case type slugs cannot be changed.');
  try {
    return await db.caseTypeDefinition.update({ where: { id }, data: {
      name: input.name === undefined ? undefined : text(input.name, 'name', 200, true),
      description: input.description === undefined ? undefined : text(input.description, 'description', 2000),
      icon: input.icon === undefined ? undefined : text(input.icon, 'icon', 80),
      sortOrder: input.sortOrder === undefined ? undefined : Number(input.sortOrder),
      legacyCaseTypeKey: input.legacyCaseTypeKey === undefined ? undefined : text(input.legacyCaseTypeKey, 'legacyCaseTypeKey', 80),
    } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new WorkPackageAdminError(409, 'CASE_TYPE_SLUG_TAKEN', 'This case type slug already exists.');
    throw error;
  }
}

export async function setCaseTypeActive(actor: Actor, id: string, isActive: boolean, db: Db = defaultPrisma) {
  manager(actor);
  try { return await db.caseTypeDefinition.update({ where: { id }, data: { isActive } }); }
  catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new WorkPackageAdminError(404, 'CASE_TYPE_NOT_FOUND', 'Case type not found.'); throw error; }
}

export async function resolveCaseTypeDefinition(caseRow: { caseTypeDefinitionId: string | null; caseType: string }, db: Db = defaultPrisma) {
  if (caseRow.caseTypeDefinitionId) return db.caseTypeDefinition.findUnique({ where: { id: caseRow.caseTypeDefinitionId } });
  return db.caseTypeDefinition.findFirst({ where: { legacyCaseTypeKey: caseRow.caseType } });
}

export async function getTemplate(id: string, actor: Actor, db: Db = defaultPrisma) {
  internal(actor);
  const row = await db.workPackageTemplate.findUnique({ where: { id }, include: templateInclude });
  if (!row) throw new WorkPackageAdminError(404, 'WORK_PACKAGE_TEMPLATE_NOT_FOUND', 'Work package template not found.');
  return dto(row);
}

export async function listTemplates(caseTypeDefinitionId: string, actor: Actor, db: Db = defaultPrisma) {
  internal(actor);
  const rows = await db.workPackageTemplate.findMany({ where: { caseTypeDefinitionId }, orderBy: { version: 'desc' }, include: templateInclude });
  return rows.map(dto);
}

export async function listCaseCreationOptions(actor: Actor, db: Db = defaultPrisma) {
  internal(actor);
  const rows = await db.caseTypeDefinition.findMany({
    where: { isActive: true, workPackageTemplates: { some: { status: 'ACTIVE' } } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true, slug: true, name: true, description: true, icon: true,
      workPackageTemplates: {
        where: { status: 'ACTIVE' }, orderBy: { version: 'desc' }, take: 1,
        include: templateInclude,
      },
    },
  });
  return rows.map((row) => ({
    caseTypeDefinition: { id: row.id, slug: row.slug, name: row.name, description: row.description, icon: row.icon },
    template: row.workPackageTemplates[0] ? dto(row.workPackageTemplates[0]) : null,
  }));
}

async function createTemplateRow(tx: Prisma.TransactionClient, actor: Actor, caseTypeDefinitionId: string, input: Record<string, unknown>, version: number, source?: any) {
  const type = await tx.caseTypeDefinition.findUnique({ where: { id: caseTypeDefinitionId }, select: { id: true } });
  if (!type) throw new WorkPackageAdminError(404, 'CASE_TYPE_NOT_FOUND', 'Case type not found.');
  const workflowId = input.defaultWorkflowTemplateId === undefined ? (source?.defaultWorkflowTemplateId ?? null) : (input.defaultWorkflowTemplateId ? String(input.defaultWorkflowTemplateId) : null);
  await validateWorkflowBinding(workflowId, tx);
  const rawItems = input.items === undefined ? (source?.items || []) : input.items;
  if (!Array.isArray(rawItems)) throw new WorkPackageAdminError(400, 'INVALID_TEMPLATE_ITEMS', 'Template items must be an array.');
  const items = rawItems.map(normalizeItem);
  if (new Set(items.map((item) => item.moduleKey)).size !== items.length) throw new WorkPackageAdminError(409, 'DUPLICATE_MODULE_KEY', 'moduleKey must be unique within a template.');
  const row = await tx.workPackageTemplate.create({ data: {
    caseTypeDefinitionId, name: input.name === undefined ? source?.name : text(input.name, 'name', 200, true), description: input.description === undefined ? (source?.description ?? null) : text(input.description, 'description', 2000),
    status: 'DRAFT', version, defaultWorkflowTemplateId: workflowId, createdById: actor.userId,
    items: { create: items.map((item) => ({ moduleType: item.moduleType, moduleKey: item.moduleKey, label: item.label, description: item.description, order: item.order, isOptional: item.isOptional, config: item.config })) },
  }, include: templateInclude });
  return row;
}

export async function createTemplate(actor: Actor, input: Record<string, unknown>, db: PrismaClient = defaultPrisma) {
  manager(actor);
  const caseTypeDefinitionId = String(input.caseTypeDefinitionId || '');
  if (!caseTypeDefinitionId) throw new WorkPackageAdminError(400, 'CASE_TYPE_REQUIRED', 'A case type is required.');
  const row = await withSerializableRetry(db, async (tx) => {
    const version = (await currentMaxVersion(caseTypeDefinitionId, tx)) + 1;
    return createTemplateRow(tx, actor, caseTypeDefinitionId, input, version);
  });
  return dto(row);
}

export async function updateTemplate(actor: Actor, id: string, input: Record<string, unknown>, db: PrismaClient = defaultPrisma) {
  manager(actor);
  const existing = await db.workPackageTemplate.findUnique({ where: { id }, include: { items: { orderBy: { order: 'asc' } } } });
  if (!existing) throw new WorkPackageAdminError(404, 'WORK_PACKAGE_TEMPLATE_NOT_FOUND', 'Work package template not found.');
  if (existing.status === 'ACTIVE') {
    const row = await withSerializableRetry(db, async (tx) => {
      const nextVersion = (await currentMaxVersion(existing.caseTypeDefinitionId, tx)) + 1;
      return createTemplateRow(tx, actor, existing.caseTypeDefinitionId, input, nextVersion, existing);
    });
    return dto(row);
  }
  if (existing.status === 'ARCHIVED') throw new WorkPackageAdminError(409, 'WORK_PACKAGE_TEMPLATE_IMMUTABLE', 'Archived templates cannot be edited.');
  const row = await db.$transaction(async (tx) => {
    const normalizedItems = input.items === undefined ? null : (Array.isArray(input.items) ? input.items.map(normalizeItem) : (() => { throw new WorkPackageAdminError(400, 'INVALID_TEMPLATE_ITEMS', 'Template items must be an array.'); })());
    if (normalizedItems && new Set(normalizedItems.map((item) => item.moduleKey)).size !== normalizedItems.length) throw new WorkPackageAdminError(409, 'DUPLICATE_MODULE_KEY', 'moduleKey must be unique within a template.');
    const workflowId = input.defaultWorkflowTemplateId === undefined ? existing.defaultWorkflowTemplateId : (input.defaultWorkflowTemplateId ? String(input.defaultWorkflowTemplateId) : null);
    await validateWorkflowBinding(workflowId, tx);
    if (normalizedItems) {
      await tx.workPackageTemplateItem.deleteMany({ where: { workPackageTemplateId: id } });
      await tx.workPackageTemplateItem.createMany({ data: normalizedItems.map((item) => ({ workPackageTemplateId: id, ...item })) });
    }
    return tx.workPackageTemplate.update({ where: { id }, data: { name: input.name === undefined ? undefined : text(input.name, 'name', 200, true), description: input.description === undefined ? undefined : text(input.description, 'description', 2000), defaultWorkflowTemplateId: workflowId }, include: templateInclude });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return dto(row);
}

export async function activateTemplate(actor: Actor, id: string, db: PrismaClient = defaultPrisma) {
  manager(actor);
  const result = await withSerializableRetry(db, async (tx) => {
    const row = await tx.workPackageTemplate.findUnique({ where: { id }, include: { items: true } });
    if (!row) throw new WorkPackageAdminError(404, 'WORK_PACKAGE_TEMPLATE_NOT_FOUND', 'Work package template not found.');
    if (row.status === 'ACTIVE') return row;
    if (row.status === 'ARCHIVED') throw new WorkPackageAdminError(409, 'WORK_PACKAGE_TEMPLATE_IMMUTABLE', 'Archived templates cannot be activated.');
    await validateWorkflowBinding(row.defaultWorkflowTemplateId, tx);
    await tx.workPackageTemplate.updateMany({ where: { caseTypeDefinitionId: row.caseTypeDefinitionId, status: 'ACTIVE', id: { not: id } }, data: { status: 'ARCHIVED' } });
    return tx.workPackageTemplate.update({ where: { id }, data: { status: 'ACTIVE' }, include: templateInclude });
  });
  return dto(result);
}

export const moduleLabels = MODULE_LABELS;
