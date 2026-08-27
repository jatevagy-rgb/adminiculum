import { Prisma, CaseWorkPackageItemStatus } from '@prisma/client';
import prisma from '../../config/database';

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

const VALID_ITEM_STATUSES = new Set<string>(['ACTIVE', 'DISABLED', 'COMPLETED']);

// ─── Read ────────────────────────────────────────────────────────────────────

export async function getCaseWorkPackage(caseId: string) {
  const wp = await prisma.caseWorkPackage.findUnique({
    where: { caseId },
    include: {
      items: {
        orderBy: [{ order: 'asc' }, { moduleKey: 'asc' }],
        include: {
          responsible: { select: { id: true, name: true, role: true } },
          tasks: {
            select: { id: true, title: true, status: true, assignedToId: true },
            orderBy: { createdAt: 'desc' },
          },
        },
      },
      workPackageTemplate: { select: { id: true, name: true, version: true } },
    },
  });

  if (!wp) return null;

  const totalItems = wp.items.length;
  const completedItems = wp.items.filter((i) => i.status === 'COMPLETED').length;

  return {
    id: wp.id,
    caseId: wp.caseId,
    revision: wp.revision,
    template: wp.workPackageTemplate,
    createdAt: wp.createdAt,
    updatedAt: wp.updatedAt,
    progress: {
      total: totalItems,
      completed: completedItems,
      percentage: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
    },
    items: wp.items.map((item) => ({
      id: item.id,
      moduleType: item.moduleType,
      moduleKey: item.moduleKey,
      label: item.label,
      config: item.config,
      order: item.order,
      status: item.status,
      note: item.note,
      responsible: item.responsible,
      tasks: item.tasks,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
  };
}

// ─── Mutate item status ──────────────────────────────────────────────────────

export async function mutateCaseWorkPackageItem(
  caseId: string,
  itemId: string,
  input: {
    status?: CaseWorkPackageItemStatus;
    responsibleId?: string | null;
    note?: string | null;
    expectedRevision: number;
  },
  actorId: string,
) {
  const wp = await prisma.caseWorkPackage.findUnique({
    where: { caseId },
    select: { id: true, revision: true, caseId: true },
  });

  if (!wp) {
    throw new CaseWorkPackageOperationalError('WORK_PACKAGE_NOT_FOUND', 'Case has no work package.', 404);
  }

  if (wp.revision !== input.expectedRevision) {
    throw new CaseWorkPackageOperationalError(
      'STALE_REVISION',
      `Work package has been modified since you last loaded it. Expected revision ${input.expectedRevision}, found ${wp.revision}. Please reload and try again.`,
      409,
    );
  }

  const item = await prisma.caseWorkPackageItem.findFirst({
    where: { id: itemId, caseWorkPackageId: wp.id },
    select: { id: true, status: true },
  });

  if (!item) {
    throw new CaseWorkPackageOperationalError('ITEM_NOT_FOUND', 'Work package item not found.', 404);
  }

  const updateData: Record<string, unknown> = {};

  if (input.status !== undefined) {
    if (!VALID_ITEM_STATUSES.has(input.status)) {
      throw new CaseWorkPackageOperationalError('INVALID_STATUS', `Status must be one of: ACTIVE, DISABLED, COMPLETED.`);
    }
    updateData.status = input.status;
  }

  if (input.responsibleId !== undefined) {
    if (input.responsibleId !== null) {
      const user = await prisma.user.findUnique({
        where: { id: input.responsibleId },
        select: { id: true, isActive: true },
      });
      if (!user || user.isActive === false) {
        throw new CaseWorkPackageOperationalError('INVALID_RESPONSIBLE', 'Assigned responsible user is not available.');
      }
    }
    updateData.responsibleId = input.responsibleId;
  }

  if (input.note !== undefined) {
    updateData.note = input.note;
  }

  if (Object.keys(updateData).length === 0) {
    throw new CaseWorkPackageOperationalError('NO_FIELDS', 'At least one mutable field must be provided.');
  }

  const [updatedItem] = await prisma.$transaction([
    prisma.caseWorkPackageItem.update({
      where: { id: itemId },
      data: updateData,
    }),
    prisma.caseWorkPackage.update({
      where: { id: wp.id },
      data: { revision: { increment: 1 } },
    }),
  ]);

  return {
    item: updatedItem,
    revision: wp.revision + 1,
  };
}

// ─── Create task from work package item ──────────────────────────────────────

export async function createTaskFromCaseWorkPackageItem(
  caseId: string,
  itemId: string,
  input: {
    title: string;
    description?: string;
    assignedToId?: string;
    dueDate?: Date | null;
  },
  actorId: string,
) {
  const wp = await prisma.caseWorkPackage.findUnique({
    where: { caseId },
    select: { id: true, caseId: true },
  });

  if (!wp) {
    throw new CaseWorkPackageOperationalError('WORK_PACKAGE_NOT_FOUND', 'Case has no work package.', 404);
  }

  const item = await prisma.caseWorkPackageItem.findFirst({
    where: { id: itemId, caseWorkPackageId: wp.id },
    select: { id: true, moduleKey: true, label: true, status: true },
  });

  if (!item) {
    throw new CaseWorkPackageOperationalError('ITEM_NOT_FOUND', 'Work package item not found.', 404);
  }

  if (item.status === 'DISABLED') {
    throw new CaseWorkPackageOperationalError(
      'ITEM_DISABLED',
      'Cannot create a task for a disabled work package item.',
    );
  }

  const title = input.title.trim();
  if (!title) {
    throw new CaseWorkPackageOperationalError('TITLE_REQUIRED', 'Task title is required.');
  }

  if (input.assignedToId) {
    const assignee = await prisma.user.findUnique({
      where: { id: input.assignedToId },
      select: { id: true, isActive: true },
    });
    if (!assignee || assignee.isActive === false) {
      throw new CaseWorkPackageOperationalError('INVALID_ASSIGNEE', 'Assigned user is not available.');
    }
  }

  const task = await prisma.task.create({
    data: {
      caseId: wp.caseId,
      title,
      description: input.description ?? null,
      taskType: 'OTHER',
      type: `WORK_PACKAGE_${item.moduleKey}`,
      priority: 'MEDIUM',
      status: 'TODO',
      assignedToId: input.assignedToId ?? null,
      assignedById: actorId,
      dueDate: input.dueDate ?? null,
      workPackageItemId: item.id,
    },
    include: {
      assignedTo: { select: { id: true, name: true, role: true } },
    },
  });

  return {
    task: {
      id: task.id,
      title: task.title,
      caseId: task.caseId,
      status: task.status,
      assignedTo: task.assignedTo,
      workPackageItemId: task.workPackageItemId,
      dueDate: task.dueDate,
      createdAt: task.createdAt,
    },
    source: {
      type: 'WORK_PACKAGE_ITEM' as const,
      itemId: item.id,
      moduleKey: item.moduleKey,
      label: item.label,
    },
  };
}
