import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../../config/database';
import { createTask } from '../tasks/services';

type Db = PrismaClient | Prisma.TransactionClient;

export class CaseWorkPackageOperationalError extends Error {
  constructor(public statusCode: number, public code: string, message: string) {
    super(message);
    this.name = 'CaseWorkPackageOperationalError';
  }
}

const ITEM_STATUSES = new Set(['ACTIVE', 'DISABLED', 'COMPLETED']);

function safeConfig(config: Prisma.JsonValue): Record<string, unknown> {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {};
  const source = config as Record<string, unknown>;
  const allowed = ['description', 'estimatedMinutes', 'attentionCategory', 'dueOffsetDays'];
  return Object.fromEntries(allowed.filter((key) => Object.prototype.hasOwnProperty.call(source, key)).map((key) => [key, source[key]]));
}

function itemDto(item: any) {
  const tasks = Array.isArray(item.tasks) ? item.tasks : [];
  const completedTaskCount = tasks.filter((task: any) => ['DONE', 'COMPLETED', 'CANCELLED'].includes(String(task.status).toUpperCase())).length;
  return {
    id: item.id,
    moduleKey: item.moduleKey,
    moduleType: item.moduleType,
    label: item.label,
    status: item.status,
    responsible: item.responsible ? { id: item.responsible.id, displayName: item.responsible.name } : null,
    configuredMetadata: safeConfig(item.config),
    taskSummary: { total: tasks.length, open: tasks.length - completedTaskCount, completed: completedTaskCount },
    tasks: tasks.slice(0, 5).map((task: any) => ({ id: task.id, title: task.title, status: task.status, dueAt: task.dueDate ? new Date(task.dueDate).toISOString() : null, assignee: task.assignedTo ? { id: task.assignedTo.id, displayName: task.assignedTo.name } : null })),
  };
}

export async function getCaseWorkPackage(caseId: string, db: Db = prisma) {
  const packageRow = await db.caseWorkPackage.findUnique({
    where: { caseId },
    select: {
      id: true, caseId: true, revision: true, updatedAt: true,
      items: {
        orderBy: { order: 'asc' },
        select: {
          id: true, moduleKey: true, moduleType: true, label: true, status: true, config: true,
          responsible: { select: { id: true, name: true } },
          tasks: {
            orderBy: { createdAt: 'desc' }, take: 5,
            select: { id: true, title: true, status: true, dueDate: true, assignedTo: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });
  if (!packageRow) return null;
  const items = packageRow.items.map(itemDto);
  const completedItems = packageRow.items.filter((item) => item.status === 'COMPLETED').length;
  const activeItems = packageRow.items.filter((item) => item.status === 'ACTIVE').length;
  const blockedItems = packageRow.items.filter((item) => item.status === 'DISABLED').length;
  return {
    id: packageRow.id,
    caseId: packageRow.caseId,
    revision: packageRow.revision,
    updatedAt: packageRow.updatedAt.toISOString(),
    progress: { totalItems: packageRow.items.length, completedItems, activeItems, blockedItems },
    items,
  };
}

async function ensureCaseTeamMember(caseId: string, userId: string, db: Db): Promise<void> {
  const caseRow = await db.case.findUnique({ where: { id: caseId }, select: { assignedLawyerId: true, createdById: true } });
  if (!caseRow) throw new CaseWorkPackageOperationalError(404, 'CASE_NOT_FOUND', 'Case not found.');
  const collaborator = await db.caseCollaborator.findFirst({ where: { caseId, userId }, select: { id: true } });
  if (userId !== caseRow.assignedLawyerId && userId !== caseRow.createdById && !collaborator) {
    throw new CaseWorkPackageOperationalError(400, 'USER_NOT_ON_CASE_TEAM', 'The responsible person must be part of the case team.');
  }
}

export async function mutateCaseWorkPackageItem(params: { caseId: string; itemId: string; expectedRevision: number; status?: string; responsibleId?: string | null }) {
  if (!Number.isInteger(params.expectedRevision) || params.expectedRevision < 0) throw new CaseWorkPackageOperationalError(400, 'EXPECTED_REVISION_REQUIRED', 'expectedRevision is required.');
  if (params.status !== undefined && !ITEM_STATUSES.has(String(params.status).toUpperCase())) throw new CaseWorkPackageOperationalError(400, 'INVALID_ITEM_STATUS', 'Invalid work package item status.');
  return prisma.$transaction(async (tx) => {
    const item = await tx.caseWorkPackageItem.findFirst({ where: { id: params.itemId, caseWorkPackage: { caseId: params.caseId } }, select: { id: true } });
    if (!item) throw new CaseWorkPackageOperationalError(404, 'WORK_PACKAGE_ITEM_NOT_FOUND', 'Work package item not found.');
    if (params.responsibleId) await ensureCaseTeamMember(params.caseId, params.responsibleId, tx);
    const bumped = await tx.caseWorkPackage.updateMany({ where: { caseId: params.caseId, revision: params.expectedRevision }, data: { revision: { increment: 1 } } });
    if (bumped.count !== 1) throw new CaseWorkPackageOperationalError(409, 'WORK_PACKAGE_REVISION_CONFLICT', 'The work package changed. Reload before saving.');
    await tx.caseWorkPackageItem.update({ where: { id: params.itemId }, data: { ...(params.status !== undefined ? { status: params.status as any } : {}), ...(params.responsibleId !== undefined ? { responsibleId: params.responsibleId } : {}) } });
    return getCaseWorkPackage(params.caseId, tx);
  });
}

export async function createTaskFromCaseWorkPackageItem(params: { caseId: string; itemId: string; title: string; description?: string; assignedToId?: string | null; assignedById: string; dueDate?: string | null }) {
  const title = String(params.title || '').trim();
  if (!title || title.length > 240) throw new CaseWorkPackageOperationalError(400, 'INVALID_TASK_TITLE', 'A task title is required.');
  return prisma.$transaction(async (tx) => {
    const item = await tx.caseWorkPackageItem.findFirst({ where: { id: params.itemId, caseWorkPackage: { caseId: params.caseId } }, select: { id: true, label: true } });
    if (!item) throw new CaseWorkPackageOperationalError(404, 'WORK_PACKAGE_ITEM_NOT_FOUND', 'Work package item not found.');
    if (params.assignedToId) await ensureCaseTeamMember(params.caseId, params.assignedToId, tx);
    const task = await createTask({
      caseId: params.caseId, title, description: params.description, taskType: 'OTHER', type: 'OTHER',
      assignedTo: params.assignedToId || undefined, assignedBy: params.assignedById,
      dueDate: params.dueDate ? new Date(params.dueDate) : undefined, workPackageItemId: item.id, db: tx,
    });
    return { task: { id: task.id, caseId: params.caseId, workPackageItemId: item.id, title: task.title, status: task.status, assignedTo: task.assignedTo ? { id: task.assignedTo.id, displayName: task.assignedTo.name } : null }, package: await getCaseWorkPackage(params.caseId, tx) };
  });
}
