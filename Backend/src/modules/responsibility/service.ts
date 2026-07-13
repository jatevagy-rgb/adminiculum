import { prisma } from '../../prisma/prisma.service';
import { deriveResponsibilityCapabilities, isPrivilegedRole } from './capabilities';

const OPEN_TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED'];
const REVIEW_TASK_STATUSES = ['IN_REVIEW', 'SUBMITTED'];

type Actor = {
  userId: string;
  role?: string | null;
};

type WorkloadScope = 'MY_WORK' | 'MY_CASES' | 'TEAM';

export class WorkflowResponsibilityError extends Error {
  constructor(public statusCode: number, public code: string, message: string) {
    super(message);
    this.name = 'WorkflowResponsibilityError';
  }
}

function toIso(value?: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asMinutes(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function isOpenStatus(status?: string | null): boolean {
  return Boolean(status && OPEN_TASK_STATUSES.includes(status));
}

function isOverdue(dueDate?: Date | string | null): boolean {
  if (!dueDate) return false;
  const date = dueDate instanceof Date ? dueDate : new Date(dueDate);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

function isDueSoon(dueDate?: Date | string | null): boolean {
  if (!dueDate) return false;
  const date = dueDate instanceof Date ? dueDate : new Date(dueDate);
  if (Number.isNaN(date.getTime())) return false;
  const diff = date.getTime() - Date.now();
  return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
}

export async function getCaseResponsibility(caseId: string, actor: Actor) {
  const caseRecord = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      caseNumber: true,
      title: true,
      status: true,
      deadline: true,
      matterId: true,
      assignedLawyerId: true,
      createdById: true,
      assignedLawyer: { select: { id: true, name: true, email: true, role: true } },
      createdBy: { select: { id: true, name: true, email: true, role: true } },
      collaborators: {
        select: {
          id: true,
          userId: true,
          role: true,
          addedAt: true,
          user: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: { addedAt: 'asc' },
      },
      tasks: {
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
          assignedToId: true,
          assignedTo: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      },
    },
  });

  if (!caseRecord) {
    return null;
  }

  const isCollaborator = caseRecord.collaborators.some((collaborator) => collaborator.userId === actor.userId);
  const capabilities = deriveResponsibilityCapabilities(actor, {
    assignedLawyerId: caseRecord.assignedLawyerId,
    createdById: caseRecord.createdById,
    isCollaborator,
    hasMatter: Boolean(caseRecord.matterId),
  });

  const openTasks = caseRecord.tasks.filter((task) => isOpenStatus(String(task.status)));
  const timeEntries = caseRecord.matterId
    ? await prisma.timeEntry.findMany({
        where: { matterId: caseRecord.matterId },
        select: { minutes: true, userId: true, workDate: true },
      })
    : [];

  const totalMinutes = timeEntries.reduce((sum, entry) => sum + asMinutes(entry.minutes), 0);
  const currentUserMinutes = timeEntries
    .filter((entry) => entry.userId === actor.userId)
    .reduce((sum, entry) => sum + asMinutes(entry.minutes), 0);

  return {
    case: {
      id: caseRecord.id,
      caseNumber: caseRecord.caseNumber,
      title: caseRecord.title,
      status: caseRecord.status,
      deadline: toIso(caseRecord.deadline),
      matterId: caseRecord.matterId,
    },
    responsibleLawyer: caseRecord.assignedLawyer,
    createdBy: caseRecord.createdBy,
    collaborators: caseRecord.collaborators.map((collaborator) => ({
      id: collaborator.id,
      userId: collaborator.userId,
      role: collaborator.role,
      addedAt: toIso(collaborator.addedAt),
      user: collaborator.user,
    })),
    work: {
      openTaskCount: openTasks.length,
      overdueTaskCount: openTasks.filter((task) => isOverdue(task.dueDate)).length,
      dueSoonTaskCount: openTasks.filter((task) => isDueSoon(task.dueDate)).length,
      reviewTaskCount: caseRecord.tasks.filter((task) => REVIEW_TASK_STATUSES.includes(String(task.status))).length,
      blockedTaskCount: caseRecord.tasks.filter((task) => String(task.status) === 'BLOCKED').length,
      assignedPeople: buildPeopleFromTasks(caseRecord.tasks),
    },
    time: {
      supported: Boolean(caseRecord.matterId),
      matterId: caseRecord.matterId,
      totalMinutes: capabilities.canViewCaseTime ? totalMinutes : null,
      currentUserMinutes,
      activeTimerSupported: false,
    },
    capabilities,
  };
}

function buildPeopleFromTasks(tasks: Array<{
  assignedToId: string | null;
  assignedTo?: { id: string; name: string | null; email: string | null; role: string | null } | null;
  status: unknown;
  dueDate: Date | null;
}>) {
  const people = new Map<string, {
    user: { id: string; name: string | null; email: string | null; role: string | null };
    openTaskCount: number;
    overdueTaskCount: number;
    dueSoonTaskCount: number;
  }>();

  for (const task of tasks) {
    if (!task.assignedToId || !task.assignedTo || !isOpenStatus(String(task.status))) continue;
    const current = people.get(task.assignedToId) || {
      user: task.assignedTo,
      openTaskCount: 0,
      overdueTaskCount: 0,
      dueSoonTaskCount: 0,
    };
    current.openTaskCount += 1;
    if (isOverdue(task.dueDate)) current.overdueTaskCount += 1;
    if (isDueSoon(task.dueDate)) current.dueSoonTaskCount += 1;
    people.set(task.assignedToId, current);
  }

  return Array.from(people.values()).sort((a, b) => b.overdueTaskCount - a.overdueTaskCount || b.openTaskCount - a.openTaskCount);
}

export async function getWorkflowWorkload(actor: Actor, options: { scope?: WorkloadScope; caseId?: string }) {
  const scope = options.scope || 'MY_WORK';
  if (scope === 'TEAM' && !isPrivilegedRole(actor.role)) {
    throw new WorkflowResponsibilityError(403, 'WORKLOAD_TEAM_FORBIDDEN', 'Team workload is available to privileged internal roles only.');
  }

  const caseWhere =
    scope === 'TEAM'
      ? {}
      : {
          OR: [
            { assignedLawyerId: actor.userId },
            { createdById: actor.userId },
            { collaborators: { some: { userId: actor.userId } } },
          ],
        };

  const cases = await prisma.case.findMany({
    where: {
      ...caseWhere,
      ...(options.caseId ? { id: options.caseId } : {}),
    },
    select: {
      id: true,
      caseNumber: true,
      title: true,
      status: true,
      deadline: true,
      matterId: true,
      assignedLawyerId: true,
      assignedLawyer: { select: { id: true, name: true, email: true, role: true } },
      tasks: {
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
          assignedToId: true,
          assignedTo: { select: { id: true, name: true, email: true, role: true } },
        },
      },
    },
    orderBy: [{ deadline: 'asc' }, { updatedAt: 'desc' }],
  });

  const matterIds = Array.from(new Set(cases.map((item) => item.matterId).filter(Boolean))) as string[];
  const timeEntries = matterIds.length
    ? await prisma.timeEntry.findMany({
        where: {
          matterId: { in: matterIds },
          ...(scope === 'MY_WORK' ? { userId: actor.userId } : {}),
        },
        select: { matterId: true, userId: true, minutes: true },
      })
    : [];

  const people = new Map<string, {
    user: { id: string; name: string | null; email: string | null; role: string | null };
    openTaskCount: number;
    overdueTaskCount: number;
    dueSoonTaskCount: number;
    reviewTaskCount: number;
    blockedTaskCount: number;
    recordedMinutes: number;
    caseIds: Set<string>;
  }>();

  const ensurePerson = (user: { id: string; name: string | null; email: string | null; role: string | null }) => {
    const current = people.get(user.id) || {
      user,
      openTaskCount: 0,
      overdueTaskCount: 0,
      dueSoonTaskCount: 0,
      reviewTaskCount: 0,
      blockedTaskCount: 0,
      recordedMinutes: 0,
      caseIds: new Set<string>(),
    };
    people.set(user.id, current);
    return current;
  };

  for (const caseRecord of cases) {
    if (caseRecord.assignedLawyer) {
      ensurePerson(caseRecord.assignedLawyer).caseIds.add(caseRecord.id);
    }
    for (const task of caseRecord.tasks) {
      if (!task.assignedToId || !task.assignedTo || !isOpenStatus(String(task.status))) continue;
      if (scope === 'MY_WORK' && task.assignedToId !== actor.userId) continue;
      const person = ensurePerson(task.assignedTo);
      person.caseIds.add(caseRecord.id);
      person.openTaskCount += 1;
      if (isOverdue(task.dueDate)) person.overdueTaskCount += 1;
      if (isDueSoon(task.dueDate)) person.dueSoonTaskCount += 1;
      if (REVIEW_TASK_STATUSES.includes(String(task.status))) person.reviewTaskCount += 1;
      if (String(task.status) === 'BLOCKED') person.blockedTaskCount += 1;
    }
  }

  for (const entry of timeEntries) {
    if (!entry.userId) continue;
    const existingUser = people.get(entry.userId)?.user;
    if (!existingUser) continue;
    people.get(entry.userId)!.recordedMinutes += asMinutes(entry.minutes);
  }

  const personSummaries = Array.from(people.values()).map((person) => ({
    user: person.user,
    openTaskCount: person.openTaskCount,
    overdueTaskCount: person.overdueTaskCount,
    dueSoonTaskCount: person.dueSoonTaskCount,
    reviewTaskCount: person.reviewTaskCount,
    blockedTaskCount: person.blockedTaskCount,
    recordedMinutes: person.recordedMinutes,
    caseCount: person.caseIds.size,
  })).sort((a, b) => b.overdueTaskCount - a.overdueTaskCount || b.dueSoonTaskCount - a.dueSoonTaskCount || b.openTaskCount - a.openTaskCount);

  return {
    scope,
    generatedAt: new Date().toISOString(),
    summary: {
      caseCount: cases.length,
      openTaskCount: personSummaries.reduce((sum, item) => sum + item.openTaskCount, 0),
      overdueTaskCount: personSummaries.reduce((sum, item) => sum + item.overdueTaskCount, 0),
      dueSoonTaskCount: personSummaries.reduce((sum, item) => sum + item.dueSoonTaskCount, 0),
      recordedMinutes: personSummaries.reduce((sum, item) => sum + item.recordedMinutes, 0),
      activeTimerSupported: false,
    },
    people: personSummaries,
    cases: cases.map((caseRecord) => ({
      id: caseRecord.id,
      caseNumber: caseRecord.caseNumber,
      title: caseRecord.title,
      status: caseRecord.status,
      deadline: toIso(caseRecord.deadline),
      matterId: caseRecord.matterId,
      responsibleLawyerId: caseRecord.assignedLawyerId,
      openTaskCount: caseRecord.tasks.filter((task) => isOpenStatus(String(task.status))).length,
      overdueTaskCount: caseRecord.tasks.filter((task) => isOpenStatus(String(task.status)) && isOverdue(task.dueDate)).length,
      dueSoonTaskCount: caseRecord.tasks.filter((task) => isOpenStatus(String(task.status)) && isDueSoon(task.dueDate)).length,
    })),
    availability: {
      teamScope: isPrivilegedRole(actor.role),
      caseTime: matterIds.length > 0,
      activeTimer: false,
      passiveTracking: false,
    },
  };
}
