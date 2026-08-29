import { CaseWorkPackageItemStatus, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { parseCanonicalStringId } from '../tasks/canonicalStringId';
import { canAssign, createTask } from '../tasks/services';

const MAX_NOTE_LENGTH = 2_000;
const MAX_TITLE_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 6_000;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const TERMINAL_TASK_STATUSES = new Set(['COMPLETED', 'DONE', 'CANCELLED']);
const PRIVILEGED_ROLES = new Set(['ADMIN', 'PARTNER']);

export class CaseWorkPackageOperationalError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = 'CaseWorkPackageOperationalError';
  }
}

type Db = Prisma.TransactionClient;

type ItemMutationInput = {
  status?: unknown;
  responsibleUserId?: unknown;
  note?: unknown;
  expectedRevision?: unknown;
};

type TaskInput = {
  title?: unknown;
  description?: unknown;
  assignedToId?: unknown;
  dueDate?: unknown;
};

function text(value: unknown, field: string, max: number, required = false): string | null {
  if (value === undefined || value === null) {
    if (required) throw new CaseWorkPackageOperationalError('FIELD_REQUIRED', `${field} is required.`);
    return null;
  }
  if (typeof value !== 'string') throw new CaseWorkPackageOperationalError('INVALID_FIELD', `${field} must be a string.`);
  const normalized = value.trim();
  if (!normalized) {
    if (required) throw new CaseWorkPackageOperationalError('FIELD_REQUIRED', `${field} is required.`);
    return null;
  }
  if (normalized.length > max || CONTROL_CHARACTER_PATTERN.test(normalized)) {
    throw new CaseWorkPackageOperationalError('INVALID_FIELD', `${field} is invalid.`);
  }
  return normalized;
}

function canonicalId(value: unknown, field: string, required = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new CaseWorkPackageOperationalError('FIELD_REQUIRED', `${field} is required.`);
    return null;
  }
  const id = parseCanonicalStringId(value);
  if (!id) throw new CaseWorkPackageOperationalError('INVALID_ID', `${field} must be a valid identifier.`);
  return id;
}

function expectedRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 2_147_483_647) {
    throw new CaseWorkPackageOperationalError('INVALID_REVISION', 'expectedRevision must be a non-negative integer.');
  }
  return value as number;
}

function allowedKeys(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CaseWorkPackageOperationalError('INVALID_BODY', 'Request body must be an object.');
  }
  const body = value as Record<string, unknown>;
  const unexpected = Object.keys(body).find((key) => !keys.includes(key));
  if (unexpected) throw new CaseWorkPackageOperationalError('UNEXPECTED_FIELD', `${unexpected} is not accepted.`);
  return body;
}

function parseMutation(input: ItemMutationInput) {
  const body = allowedKeys(input, ['status', 'responsibleUserId', 'note', 'expectedRevision']);
  const revision = expectedRevision(body.expectedRevision);
  const status = body.status === undefined ? undefined : String(body.status);
  if (status !== undefined && !Object.values(CaseWorkPackageItemStatus).includes(status as CaseWorkPackageItemStatus)) {
    throw new CaseWorkPackageOperationalError('INVALID_STATUS', 'status is not supported.');
  }
  const responsibleUserId = body.responsibleUserId === undefined
    ? undefined
    : body.responsibleUserId === null ? null : canonicalId(body.responsibleUserId, 'responsibleUserId', true);
  const note = body.note === undefined ? undefined : text(body.note, 'note', MAX_NOTE_LENGTH);
  if (status === undefined && responsibleUserId === undefined && note === undefined) {
    throw new CaseWorkPackageOperationalError('NO_FIELDS', 'At least one mutable field is required.');
  }
  return { expectedRevision: revision, status: status as CaseWorkPackageItemStatus | undefined, responsibleUserId, note };
}

function parseTaskInput(input: TaskInput) {
  const body = allowedKeys(input, ['title', 'description', 'assignedToId', 'dueDate']);
  const title = text(body.title, 'title', MAX_TITLE_LENGTH, true) as string;
  const description = body.description === undefined ? null : text(body.description, 'description', MAX_DESCRIPTION_LENGTH);
  const assignedToId = body.assignedToId === undefined ? null : canonicalId(body.assignedToId, 'assignedToId');
  let dueDate: Date | null = null;
  if (body.dueDate !== undefined && body.dueDate !== null && body.dueDate !== '') {
    if (typeof body.dueDate !== 'string') throw new CaseWorkPackageOperationalError('INVALID_DATE', 'dueDate must be an ISO date string.');
    dueDate = new Date(body.dueDate);
    if (Number.isNaN(dueDate.getTime())) throw new CaseWorkPackageOperationalError('INVALID_DATE', 'dueDate is invalid.');
  }
  return { title, description, assignedToId, dueDate };
}

async function caseWorkforceEligible(tx: Db, caseRow: { id: string; assignedLawyerId: string | null; createdById: string }, userId: string): Promise<boolean> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true, status: true, isActive: true } });
  if (!user || user.status !== 'ACTIVE' || user.isActive === false) return false;
  if (String(user.role) === 'CLIENT') return false;
  if (PRIVILEGED_ROLES.has(String(user.role))) return true;
  if (caseRow.assignedLawyerId === userId || caseRow.createdById === userId) return true;
  return Boolean(await tx.caseCollaborator.findFirst({ where: { caseId: caseRow.id, userId }, select: { id: true } }));
}

async function loadScopedItem(tx: Db, caseId: string, itemId: string) {
  const workPackage = await tx.caseWorkPackage.findUnique({
    where: { caseId },
    select: {
      id: true,
      caseId: true,
      revision: true,
      case: { select: { id: true, clientId: true, matterId: true, assignedLawyerId: true, createdById: true } },
    },
  });
  if (!workPackage) throw new CaseWorkPackageOperationalError('WORK_PACKAGE_NOT_FOUND', 'Case has no work package.', 404);
  const item = await tx.caseWorkPackageItem.findFirst({
    where: { id: itemId, caseWorkPackageId: workPackage.id },
    include: {
      sourceTemplateItem: { select: { id: true, isOptional: true, description: true } },
      tasks: { select: { id: true, title: true, status: true, assignedToId: true, dueDate: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!item) throw new CaseWorkPackageOperationalError('WORK_PACKAGE_ITEM_NOT_FOUND', 'Work package item is not available.', 404);
  return { workPackage, item };
}

export async function getCaseWorkPackage(caseIdInput: unknown) {
  const caseId = canonicalId(caseIdInput, 'caseId', true) as string;
  const workPackage = await prisma.caseWorkPackage.findUnique({
    where: { caseId },
    include: {
      items: {
        orderBy: [{ order: 'asc' }, { moduleKey: 'asc' }],
        include: {
          responsible: { select: { id: true, name: true, role: true } },
          sourceTemplateItem: { select: { isOptional: true, description: true } },
          tasks: {
            select: { id: true, title: true, status: true, assignedToId: true, dueDate: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
      workPackageTemplate: { select: { name: true, version: true } },
    },
  });
  if (!workPackage) return null;
  const items = workPackage.items.map((item) => {
    const required = item.sourceTemplateItem ? !item.sourceTemplateItem.isOptional : true;
    return {
      id: item.id,
      moduleKey: item.moduleKey,
      title: item.label,
      description: item.sourceTemplateItem?.description ?? null,
      required,
      status: item.status,
      responsible: item.responsible,
      note: item.note,
      order: item.order,
      tasks: item.tasks.map((task) => ({ id: task.id, title: task.title, status: task.status, assignedToId: task.assignedToId, dueDate: task.dueDate })),
      provenanceState: item.sourceTemplateItemId ? (item.sourceTemplateItem ? 'TEMPLATE_SNAPSHOT' : 'SOURCE_RETIRED') : 'CASE_ADDED',
    };
  });
  const active = items.filter((item) => item.status !== 'DISABLED');
  const completed = active.filter((item) => item.status === 'COMPLETED').length;
  return {
    id: workPackage.id,
    revision: workPackage.revision,
    source: workPackage.workPackageTemplate ? { name: workPackage.workPackageTemplate.name, version: workPackage.workPackageTemplate.version } : null,
    createdAt: workPackage.createdAt,
    progress: {
      total: items.length,
      totalActive: active.length,
      completed,
      remaining: active.length - completed,
      required: items.filter((item) => item.required).length,
      requiredCompleted: items.filter((item) => item.required && item.status === 'COMPLETED').length,
    },
    items,
  };
}

export async function mutateCaseWorkPackageItem(caseIdInput: unknown, itemIdInput: unknown, input: ItemMutationInput) {
  const caseId = canonicalId(caseIdInput, 'caseId', true) as string;
  const itemId = canonicalId(itemIdInput, 'itemId', true) as string;
  const mutation = parseMutation(input);
  try {
    return await prisma.$transaction(async (tx) => {
    const { workPackage, item } = await loadScopedItem(tx, caseId, itemId);
    const required = item.sourceTemplateItem ? !item.sourceTemplateItem.isOptional : true;
    if (mutation.status !== undefined) {
      if (item.status === 'COMPLETED' && mutation.status !== 'COMPLETED') {
        throw new CaseWorkPackageOperationalError('COMPLETED_ITEM_IMMUTABLE', 'Completed work package items cannot be reopened.');
      }
      if (item.status === 'DISABLED' && mutation.status !== 'DISABLED') {
        throw new CaseWorkPackageOperationalError('DISABLED_ITEM_IMMUTABLE', 'Disabled work package items cannot be reactivated.');
      }
      if (item.status === 'ACTIVE' && mutation.status !== 'ACTIVE' && mutation.status !== 'DISABLED' && mutation.status !== 'COMPLETED') {
        throw new CaseWorkPackageOperationalError('INVALID_STATUS_TRANSITION', 'Work package item status transition is not supported.', 409);
      }
      if (mutation.status === 'DISABLED') {
        if (required) throw new CaseWorkPackageOperationalError('REQUIRED_ITEM_CANNOT_DISABLE', 'Required work package items cannot be disabled.');
        if (item.tasks.some((task) => !TERMINAL_TASK_STATUSES.has(String(task.status)))) {
          throw new CaseWorkPackageOperationalError('ACTIVE_TASKS_BLOCK_DISABLE', 'Active linked tasks must be resolved before disabling this item.', 409);
        }
      }
      if (mutation.status === 'COMPLETED' && item.tasks.some((task) => !TERMINAL_TASK_STATUSES.has(String(task.status)))) {
        throw new CaseWorkPackageOperationalError('ACTIVE_TASKS_BLOCK_COMPLETE', 'Active linked tasks must be resolved before completing this item.', 409);
      }
    }
    if (mutation.responsibleUserId) {
      const eligible = await caseWorkforceEligible(tx, workPackage.case, mutation.responsibleUserId);
      if (!eligible) throw new CaseWorkPackageOperationalError('RESPONSIBLE_NOT_CASE_ELIGIBLE', 'Responsible user is not eligible for this case.', 403);
    }
    const claimed = await tx.caseWorkPackage.updateMany({
      where: { id: workPackage.id, revision: mutation.expectedRevision },
      data: { revision: { increment: 1 } },
    });
    if (claimed.count !== 1) {
      throw new CaseWorkPackageOperationalError('WORK_PACKAGE_REVISION_CONFLICT', 'Work package changed since it was loaded. Reload and try again.', 409);
    }
    const updated = await tx.caseWorkPackageItem.update({
      where: { id: item.id },
      data: {
        ...(mutation.status === undefined ? {} : { status: mutation.status }),
        ...(mutation.responsibleUserId === undefined ? {} : { responsibleId: mutation.responsibleUserId }),
        ...(mutation.note === undefined ? {} : { note: mutation.note }),
      },
      include: { responsible: { select: { id: true, name: true, role: true } } },
    });
    return { item: updated, revision: mutation.expectedRevision + 1 };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      throw new CaseWorkPackageOperationalError('WORK_PACKAGE_REVISION_CONFLICT', 'Work package changed since it was loaded. Reload and try again.', 409);
    }
    throw error;
  }
}

export async function createTaskFromCaseWorkPackageItem(caseIdInput: unknown, itemIdInput: unknown, input: TaskInput, actorIdInput: unknown) {
  const caseId = canonicalId(caseIdInput, 'caseId', true) as string;
  const itemId = canonicalId(itemIdInput, 'itemId', true) as string;
  const actorId = canonicalId(actorIdInput, 'actorId', true) as string;
  const taskInput = parseTaskInput(input);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const { workPackage, item } = await loadScopedItem(tx, caseId, itemId);
        if (item.status === 'DISABLED') throw new CaseWorkPackageOperationalError('ITEM_DISABLED', 'Disabled work package items cannot create tasks.', 409);
        if (item.status === 'COMPLETED') throw new CaseWorkPackageOperationalError('ITEM_COMPLETED', 'Completed work package items cannot create tasks.', 409);
        if (taskInput.assignedToId) {
          const eligible = await caseWorkforceEligible(tx, workPackage.case, taskInput.assignedToId);
          if (!eligible) throw new CaseWorkPackageOperationalError('ASSIGNEE_NOT_CASE_ELIGIBLE', 'Assigned user is not eligible for this case.', 403);
          if (!(await canAssign(actorId, taskInput.assignedToId))) {
            throw new CaseWorkPackageOperationalError('TASK_ASSIGNMENT_FORBIDDEN', 'You are not allowed to assign this task to that user.', 403);
          }
        }
        const existing = item.tasks[0];
        if (existing) {
          return { created: false, task: existing, source: { itemId: item.id, moduleKey: item.moduleKey } };
        }
        const claimed = await tx.caseWorkPackage.updateMany({
          where: { id: workPackage.id, revision: workPackage.revision },
          data: { revision: { increment: 1 } },
        });
        if (claimed.count !== 1) {
          throw new CaseWorkPackageOperationalError('WORK_PACKAGE_REVISION_CONFLICT', 'Work package changed while creating a task. Retrying.', 409);
        }
        const task = await createTask({
          caseId: workPackage.caseId,
          matterId: workPackage.case.matterId,
          title: taskInput.title,
          description: taskInput.description ?? undefined,
          taskType: 'OTHER',
          type: `WORK_PACKAGE_${item.moduleKey}`,
          priority: 'MEDIUM' as any,
          assignedTo: taskInput.assignedToId ?? undefined,
          assignedBy: actorId,
          dueDate: taskInput.dueDate ?? undefined,
          workPackageItemId: item.id,
        }, tx);
        return {
          created: true,
          task: { id: task.id, title: task.title, caseId: task.caseId, matterId: workPackage.case.matterId, status: task.status, assignedToId: task.assignedToId, workPackageItemId: item.id, dueDate: task.dueDate },
          source: { itemId: item.id, moduleKey: item.moduleKey },
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const retryableConflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034'
        || error instanceof CaseWorkPackageOperationalError && error.code === 'WORK_PACKAGE_REVISION_CONFLICT';
      if (retryableConflict && attempt < 2) continue;
      throw error;
    }
  }
  throw new CaseWorkPackageOperationalError('TASK_CREATE_CONFLICT', 'Task creation could not be completed. Please retry.', 409);
}
