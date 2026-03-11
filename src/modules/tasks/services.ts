// ============================================================================
// TASK SERVICE - Case-alapú feladatkezelés
// ============================================================================

import { PrismaClient } from '@prisma/client';
import prisma from '../../config/database.js';
import escalationService from '../escalation/services';

export class TaskNotFoundError extends Error {
  statusCode = 404;
  constructor(taskId: string) {
    super(`Task not found: ${taskId}`);
    this.name = 'TaskNotFoundError';
  }
}

export class TaskValidationError extends Error {
  statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'TaskValidationError';
  }
}

const TaskStatus = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  IN_REVIEW: 'IN_REVIEW',
  BLOCKED: 'BLOCKED',
  DONE: 'DONE'
} as const;

const TaskPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT'
} as const;

const TaskType = {
  CONTRACT_REVIEW: 'CONTRACT_REVIEW',
  CONTRACT_DRAFTING: 'CONTRACT_DRAFTING',
  DOCUMENT_TRANSLATION: 'DOCUMENT_TRANSLATION',
  LEGAL_RESEARCH: 'LEGAL_RESEARCH',
  CLIENT_COMMUNICATION: 'CLIENT_COMMUNICATION',
  ADMIN_SUPPORT: 'ADMIN_SUPPORT'
} as const;

const TASK_TYPE_TO_DB: Record<string, string> = {
  CONTRACT_REVIEW: 'REVIEW_CONTRACT',
  CONTRACT_DRAFTING: 'DRAFT_CONTRACT',
  DOCUMENT_TRANSLATION: 'OTHER',
  LEGAL_RESEARCH: 'RESEARCH',
  CLIENT_COMMUNICATION: 'CLIENT_MEETING',
  ADMIN_SUPPORT: 'OTHER',
  REVIEW_CONTRACT: 'REVIEW_CONTRACT',
  DRAFT_CONTRACT: 'DRAFT_CONTRACT',
  CLIENT_MEETING: 'CLIENT_MEETING',
  RESEARCH: 'RESEARCH',
  COURT_FILING: 'COURT_FILING',
  DEADLINE: 'DEADLINE',
  APPROVAL: 'APPROVAL',
  REVIEW_ANONYMIZED: 'REVIEW_ANONYMIZED',
  QUALITY_CHECK: 'QUALITY_CHECK',
  OTHER: 'OTHER',
};

function mapTaskTypeToDb(input: string): string {
  const normalized = String(input || '').trim().toUpperCase();
  const mapped = TASK_TYPE_TO_DB[normalized];
  if (!mapped) {
    throw new TaskValidationError(`Invalid enum value for taskType: ${input}`);
  }
  return mapped;
}

const TimelineType = {
  CASE_CREATED: 'CASE_CREATED',
  CASE_STATUS_CHANGED: 'CASE_STATUS_CHANGED',
  CASE_REOPENED: 'CASE_REOPENED',
  CLIENT_DATA_REGISTERED: 'CLIENT_DATA_REGISTERED',
  CONTRACT_GENERATED: 'CONTRACT_GENERATED',
  DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED',
  DOCUMENT_MOVED: 'DOCUMENT_MOVED',
  SENT_TO_REVIEW: 'SENT_TO_REVIEW',
  CONTRACT_APPROVED: 'CONTRACT_APPROVED',
  CONTRACT_REJECTED: 'CONTRACT_REJECTED',
  SENT_TO_CLIENT: 'SENT_TO_CLIENT',
  CLIENT_FEEDBACK_RECEIVED: 'CLIENT_FEEDBACK_RECEIVED',
  CASE_COMPLETED: 'CASE_COMPLETED',
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  TASK_STARTED: 'TASK_STARTED',
  TASK_SUBMITTED: 'TASK_SUBMITTED',
  TASK_COMPLETED: 'TASK_COMPLETED',
  TASK_REJECTED: 'TASK_REJECTED',
  CHECKED_OUT: 'CHECKED_OUT',
  CHECKED_IN: 'CHECKED_IN',
  VERSION_CREATED: 'VERSION_CREATED',
  PERMISSION_GRANTED: 'PERMISSION_GRANTED'
} as const;

const UserRole = {
  LAWYER: 'LAWYER',
  COLLAB_LAWYER: 'COLLAB_LAWYER',
  TRAINEE: 'TRAINEE',
  LEGAL_ASSISTANT: 'LEGAL_ASSISTANT',
  ADMIN: 'ADMIN'
} as const;

type TaskType = typeof TaskType[keyof typeof TaskType];
type TaskStatus = typeof TaskStatus[keyof typeof TaskStatus];
type TaskPriority = typeof TaskPriority[keyof typeof TaskPriority];
type TimelineType = typeof TimelineType[keyof typeof TimelineType];
type UserRole = typeof UserRole[keyof typeof UserRole];
type TaskProgressReason = 'STATUS_CHANGE' | 'MATURITY_CHANGE' | 'COMMENT';

const ACTIONABLE_TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const;
type ActionableTaskStatus = (typeof ACTIONABLE_TASK_STATUSES)[number];

// ============================================================================
// TASK TEMPLATES - Automatikus feladat generálás workflow eseményekhez
// ============================================================================

const TASK_TEMPLATES: Record<string, { title: string; type: TaskType; priority: TaskPriority; requiredSkills: string[] }> = {
  DOCUMENT_GENERATED: {
    title: 'Szerződés első review',
    type: TaskType.CONTRACT_REVIEW,
    priority: TaskPriority.HIGH,
    requiredSkills: ['Contract Drafting', 'Legal Analysis']
  },
  SENT_TO_REVIEW: {
    title: 'Részletes jogi ellenőrzés',
    type: TaskType.CONTRACT_REVIEW,
    priority: TaskPriority.HIGH,
    requiredSkills: ['Contract Review', 'Compliance', 'Legal Analysis']
  },
  CONTRACT_REJECTED: {
    title: 'Javítások végrehajtása',
    type: TaskType.CONTRACT_DRAFTING,
    priority: TaskPriority.URGENT,
    requiredSkills: ['Contract Drafting']
  },
  SENT_TO_CLIENT: {
    title: 'Ügyfélkommunikáció',
    type: TaskType.CLIENT_COMMUNICATION,
    priority: TaskPriority.MEDIUM,
    requiredSkills: ['Client Communication']
  },
  CLIENT_FEEDBACK: {
    title: 'Visszajelzés feldolgozása',
    type: TaskType.CONTRACT_REVIEW,
    priority: TaskPriority.HIGH,
    requiredSkills: ['Legal Analysis', 'Contract Drafting']
  }
};

// ============================================================================
// ROLE-BASED ASSIGNMENT RULES
// ============================================================================

const CAN_ASSIGN_TO: Record<UserRole, UserRole[]> = {
  [UserRole.LAWYER]: [UserRole.TRAINEE, UserRole.LEGAL_ASSISTANT],
  [UserRole.COLLAB_LAWYER]: [UserRole.TRAINEE, UserRole.LEGAL_ASSISTANT],
  [UserRole.TRAINEE]: [UserRole.LEGAL_ASSISTANT],
  [UserRole.LEGAL_ASSISTANT]: [],
  [UserRole.ADMIN]: [UserRole.TRAINEE, UserRole.LEGAL_ASSISTANT, UserRole.COLLAB_LAWYER]
};

// ============================================================================
// SKILL MAPPING - Task type -> Required skills
// ============================================================================

const TASK_TYPE_SKILLS: Record<TaskType, string[]> = {
  [TaskType.CONTRACT_REVIEW]: ['Contract Review', 'Legal Analysis', 'Drafting'],
  [TaskType.CONTRACT_DRAFTING]: ['Contract Drafting', 'Legal Writing'],
  [TaskType.DOCUMENT_TRANSLATION]: ['Translation', 'Legal Terminology'],
  [TaskType.LEGAL_RESEARCH]: ['Legal Research', 'Legal Analysis'],
  [TaskType.CLIENT_COMMUNICATION]: ['Client Communication', 'Professional Writing'],
  [TaskType.ADMIN_SUPPORT]: ['Administrative Skills', 'Organization']
};

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================


/**
 * Set structured stuck reason on task (Task Intelligence D2)
 */
export async function setTaskStuckReason(
  taskId: string,
  stuckReason: string | null,
  note?: string,
  actorUserId?: string,
) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      stuckReason: true,
      stuckSince: true,
      maturityStage: true,
      complexityScore: true,
      riskScore: true,
      lastProgressAt: true,
      updatedAt: true,
    } as any,
  });

  if (!task) throw new TaskNotFoundError(taskId);

  const now = new Date();
  const nextStuckSince = stuckReason === null ? null : task.stuckReason === null ? now : task.stuckSince;

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      stuckReason: (stuckReason as any) ?? null,
      stuckSince: nextStuckSince,
    } as any,
    select: {
      id: true,
      stuckReason: true,
      stuckSince: true,
      maturityStage: true,
      complexityScore: true,
      riskScore: true,
      lastProgressAt: true,
      updatedAt: true,
    } as any,
  });

  await createTaskHistoryEntry({
    taskId,
    changedById: actorUserId,
    action: 'TASK_INTELLIGENCE_UPDATED',
    note,
    previousValue: {
      type: 'TASK_INTELLIGENCE',
      field: 'stuckReason',
      previous: { stuckReason: task.stuckReason, stuckSince: task.stuckSince },
      note: note || null,
      actorUserId: actorUserId || null,
    },
    newValue: {
      type: 'TASK_INTELLIGENCE',
      field: 'stuckReason',
      next: { stuckReason: updated.stuckReason, stuckSince: updated.stuckSince },
      note: note || null,
      actorUserId: actorUserId || null,
    },
  });

  return updated;
}

/**
 * Set structured maturity stage on task (Task Intelligence D2)
 */
export async function setTaskMaturityStage(
  taskId: string,
  maturityStage: string | null,
  note?: string,
  actorUserId?: string,
) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      maturityStage: true,
      lastProgressAt: true,
      stuckReason: true,
      stuckSince: true,
      complexityScore: true,
      riskScore: true,
      updatedAt: true,
    } as any,
  });

  if (!task) throw new TaskNotFoundError(taskId);

  const changed = (task as any).maturityStage !== maturityStage;

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      maturityStage: (maturityStage as any) ?? null,
    } as any,
    select: {
      id: true,
      stuckReason: true,
      stuckSince: true,
      maturityStage: true,
      complexityScore: true,
      riskScore: true,
      lastProgressAt: true,
      updatedAt: true,
    } as any,
  });

  if (changed) {
    await markTaskProgress(taskId, actorUserId, 'MATURITY_CHANGE', { historyNote: note, skipHistory: true });
    const refreshed = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        stuckReason: true,
        stuckSince: true,
        maturityStage: true,
        complexityScore: true,
        riskScore: true,
        lastProgressAt: true,
        updatedAt: true,
      } as any,
    });
    return refreshed || updated;
  }

  return updated;
}

/**
 * Set task intelligence scores (Task Intelligence D2)
 */
export async function setTaskScores(
  taskId: string,
  complexityScore: number,
  riskScore: number,
  note?: string,
  actorUserId?: string,
) {
  const isValid = (v: number) => Number.isInteger(v) && v >= 1 && v <= 5;
  if (!isValid(complexityScore)) throw new TaskValidationError('complexityScore must be an integer between 1 and 5');
  if (!isValid(riskScore)) throw new TaskValidationError('riskScore must be an integer between 1 and 5');

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      complexityScore: true,
      riskScore: true,
      stuckReason: true,
      stuckSince: true,
      maturityStage: true,
      lastProgressAt: true,
      updatedAt: true,
    } as any,
  });

  if (!task) throw new TaskNotFoundError(taskId);

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { complexityScore, riskScore } as any,
    select: {
      id: true,
      stuckReason: true,
      stuckSince: true,
      maturityStage: true,
      complexityScore: true,
      riskScore: true,
      lastProgressAt: true,
      updatedAt: true,
    } as any,
  });

  await createTaskHistoryEntry({
    taskId,
    changedById: actorUserId,
    action: 'TASK_INTELLIGENCE_UPDATED',
    note,
    previousValue: {
      type: 'TASK_INTELLIGENCE',
      field: 'scores',
      previous: { complexityScore: task.complexityScore, riskScore: task.riskScore },
      note: note || null,
      actorUserId: actorUserId || null,
    },
    newValue: {
      type: 'TASK_INTELLIGENCE',
      field: 'scores',
      next: { complexityScore: updated.complexityScore, riskScore: updated.riskScore },
      note: note || null,
      actorUserId: actorUserId || null,
    },
  });

  return updated;
}

/**
 * Create a new task
 */
export async function createTask(data: {
  caseId: string;
  title: string;
  description?: string;
  type: TaskType;
  priority?: TaskPriority;
  assignedTo?: string;
  assignedBy: string;
  requiredSkills?: string[];
  dueDate?: Date;
  documentId?: string;
}) {
  const mappedTaskType = mapTaskTypeToDb(data.type);

  const task = await prisma.task.create({
    data: {
      case: {
        connect: { id: data.caseId },
      },
      title: data.title,
      description: data.description ?? null,
      taskType: mappedTaskType as any,
      type: data.type ?? null,
      priority: data.priority || TaskPriority.MEDIUM,
      status: 'TODO',
      assignedToId: data.assignedTo ?? null,
      assignedById: data.assignedBy ?? null,
      requiredSkills: data.requiredSkills || TASK_TYPE_SKILLS[data.type] || [],
      dueDate: data.dueDate ?? null,
      documentId: data.documentId ?? null
    } as any,
    include: {
      case: true,
      assignedTo: true
    }
  });

  // Create timeline event
  await createTimelineEvent({
    caseId: data.caseId,
    userId: data.assignedBy,
    type: TimelineType.TASK_ASSIGNED,
    payload: {
      taskId: task.id,
      taskTitle: task.title,
      assignedTo: data.assignedTo
    }
  });

  // Escalation integration: evaluate immediate escalation eligibility (e.g. overdue on creation)
  await escalationService.evaluateTask(task.id);

  return task;
}

/**
 * Get all tasks for a case
 */
export async function getCaseTasks(caseId: string, filters?: { status?: string; assignedTo?: string }) {
  return prisma.task.findMany({
    where: {
      caseId,
      ...(filters?.status && { status: filters.status as any }),
      ...(filters?.assignedTo && { assignedToId: filters.assignedTo })
    },
    include: {
      assignedTo: {
        select: { id: true, name: true, role: true }
      }
    },
    orderBy: [
      { priority: 'desc' },
      { dueDate: 'asc' },
      { createdAt: 'desc' }
    ]
  });
}

/**
 * Get a single task by ID
 */
export async function getTask(taskId: string) {
  return prisma.task.findUnique({
    where: { id: taskId },
    include: {
      case: true,
      assignedTo: true
    }
  });
}

/**
 * Start a task (TODO -> IN_PROGRESS)
 */
export async function startTask(taskId: string, userId: string) {
  const previous = await prisma.task.findUnique({
    where: { id: taskId },
    select: { status: true }
  });

  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      status: 'IN_PROGRESS',
      startedAt: new Date()
    }
  });

  await createTimelineEvent({
    caseId: task.caseId,
    userId,
    type: TimelineType.TASK_STARTED,
    payload: { taskId, taskTitle: task.title }
  });

  const nextStatus = 'IN_PROGRESS';
  if ((previous?.status as any) !== nextStatus) {
    await markTaskProgress(task.id, userId, 'STATUS_CHANGE', {
      metadata: { previousStatus: previous?.status ?? null, nextStatus }
    });
  }

  await escalationService.evaluateTask(task.id);

  return task;
}

/**
 * Submit task for review (IN_PROGRESS -> IN_REVIEW)
 */
export async function submitTask(taskId: string, userId: string, notes?: string) {
  const previous = await prisma.task.findUnique({
    where: { id: taskId },
    select: { status: true }
  });

  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      status: 'IN_REVIEW',
      submittedAt: new Date()
    }
  });

  await createTimelineEvent({
    caseId: task.caseId,
    userId,
    type: TimelineType.TASK_SUBMITTED,
    payload: { taskId, taskTitle: task.title, notes }
  });

  const nextStatus = 'IN_REVIEW';
  if ((previous?.status as any) !== nextStatus) {
    await markTaskProgress(task.id, userId, 'STATUS_CHANGE', {
      metadata: { previousStatus: previous?.status ?? null, nextStatus }
    });
  }

  await escalationService.evaluateTask(task.id);

  return task;
}

/**
 * Complete a task (IN_REVIEW -> DONE)
 */
export async function completeTask(taskId: string, userId: string, approved: boolean, notes?: string) {
  const previous = await prisma.task.findUnique({
    where: { id: taskId },
    select: { status: true }
  });

  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      status: approved ? 'DONE' : 'IN_PROGRESS',
      completedAt: approved ? new Date() : null
    }
  });

  await createTimelineEvent({
    caseId: task.caseId,
    userId,
    type: approved ? TimelineType.TASK_COMPLETED : TimelineType.TASK_REJECTED,
    payload: { taskId, taskTitle: task.title, notes }
  });

  const nextStatus = approved ? 'DONE' : 'IN_PROGRESS';
  if ((previous?.status as any) !== nextStatus) {
    await markTaskProgress(task.id, userId, 'STATUS_CHANGE', {
      metadata: { previousStatus: previous?.status ?? null, nextStatus }
    });
  }

  if (!approved) {
    await escalationService.evaluateTask(task.id);
  }

  return task;
}

/**
 * Set task status using existing domain flow operations where possible.
 */
export async function setTaskStatus(taskId: string, status: string, actorUserId: string, notes?: string) {
  const normalized = String(status || '').trim().toUpperCase();
  if (!ACTIONABLE_TASK_STATUSES.includes(normalized as ActionableTaskStatus)) {
    throw new TaskValidationError(`Unsupported status: ${status}. Allowed: ${ACTIONABLE_TASK_STATUSES.join(', ')}`);
  }

  if (normalized === 'IN_PROGRESS') {
    return startTask(taskId, actorUserId);
  }
  if (normalized === 'IN_REVIEW') {
    return submitTask(taskId, actorUserId, notes);
  }
  if (normalized === 'DONE') {
    return completeTask(taskId, actorUserId, true, notes);
  }

  const previous = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, status: true },
  });

  if (!previous) {
    throw new TaskNotFoundError(taskId);
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      status: 'TODO',
      completedAt: null,
      submittedAt: null,
    },
  });

  if ((previous.status as any) !== 'TODO') {
    await markTaskProgress(updated.id, actorUserId, 'STATUS_CHANGE', {
      metadata: { previousStatus: previous.status, nextStatus: 'TODO' },
    });
  }

  await escalationService.evaluateTask(updated.id);

  return updated;
}

/**
 * Set task deadline in domain layer.
 */
export async function setTaskDeadline(taskId: string, dueDate: Date, actorUserId?: string, note?: string) {
  if (!(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) {
    throw new TaskValidationError('dueDate must be a valid date');
  }

  const existing = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      dueDate: true,
      title: true,
      caseId: true,
    },
  });

  if (!existing) {
    throw new TaskNotFoundError(taskId);
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { dueDate },
  });

  await createTaskHistoryEntry({
    taskId,
    changedById: actorUserId,
    action: 'TASK_DEADLINE_SET',
    note,
    previousValue: {
      type: 'TASK_DEADLINE',
      previousDueDate: existing.dueDate ? existing.dueDate.toISOString() : null,
    },
    newValue: {
      type: 'TASK_DEADLINE',
      nextDueDate: dueDate.toISOString(),
    },
  });

  await escalationService.evaluateTask(updated.id);

  return updated;
}

/**
 * Add checklist item through task domain history.
 */
export async function addTaskChecklistItem(taskId: string, checklistItem: string, actorUserId?: string) {
  const value = String(checklistItem || '').trim();
  if (!value) {
    throw new TaskValidationError('checklistItem is required');
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true },
  });

  if (!task) {
    throw new TaskNotFoundError(taskId);
  }

  const checklistEntryId = `chk_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const createdAt = new Date();

  await createTaskHistoryEntry({
    taskId,
    changedById: actorUserId,
    action: 'TASK_CHECKLIST_ITEM_ADDED',
    newValue: {
      type: 'TASK_CHECKLIST_ITEM',
      checklistEntryId,
      item: value,
      createdAt: createdAt.toISOString(),
      actorUserId: actorUserId || null,
    },
  });

  await markTaskProgress(taskId, actorUserId, 'COMMENT', { skipHistory: true });

  return {
    taskId,
    checklistEntryId,
    item: value,
    createdAt,
  };
}

/**
 * Reassign a task
 */
export async function reassignTask(taskId: string, newAssigneeId: string, reassignedBy: string) {
  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      assignedToId: newAssigneeId
    },
    include: {
      assignedTo: {
        select: { id: true, name: true }
      }
    }
  });

  await createTimelineEvent({
    caseId: task.caseId,
    userId: reassignedBy,
    type: TimelineType.TASK_ASSIGNED,
    payload: {
      taskId,
      taskTitle: task.title,
      assignedTo: newAssigneeId
    }
  });

  await escalationService.evaluateTask(task.id);

  return task;
}

/**
 * Get skill-based recommendations for task assignment
 */
export async function getTaskRecommendations(params: {
  taskType: TaskType;
  caseId: string;
  requiredSkills?: string[];
}) {
  const requiredSkills = params.requiredSkills || TASK_TYPE_SKILLS[params.taskType] || [];
  
  // Get all active users who can be assigned
  const eligibleUsers = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      role: {
        in: ['TRAINEE', 'LEGAL_ASSISTANT', 'COLLAB_LAWYER']
      }
    }
  });

  // Get current workload for each user
  const userWorkloads = await (prisma.task.groupBy as any)({
    by: ['assignedToId'],
    where: {
      assignedToId: { in: eligibleUsers.map(u => u.id) },
      status: { in: ['TODO', 'IN_PROGRESS', 'IN_REVIEW'] }
    },
    _count: true
  });

  // Calculate recommendations
  const recommendations = eligibleUsers.map(user => {
    const workload = userWorkloads.find((w: any) => w.assignedToId === user.id)?._count || 0;
    
    // Calculate skill match score (skillProfile not in schema, use default)
    let skillScore = 0;

    const maxPossibleScore = requiredSkills.length * 5;
    const matchScore = maxPossibleScore > 0 ? Math.round((skillScore / maxPossibleScore) * 100) : 50;

    // Workload score (lower is better)
    const workloadScore = workload >= 5 ? 0 : workload >= 3 ? 50 : 100;
    
    // Combined recommendation score
    const totalScore = Math.round(matchScore * 0.7 + workloadScore * 0.3);

    return {
      userId: user.id,
      name: user.name,
      role: user.role,
      matchScore,
      skills: requiredSkills.reduce((acc: Record<string, number>, skill) => {
        return {
          ...acc,
          [skill]: 0
        };
      }, {}),
      currentWorkload: workload >= 5 ? 'HIGH' : workload >= 3 ? 'MEDIUM' : 'LOW',
      totalScore
    };
  });

  // Sort by total score descending
  return recommendations.sort((a, b) => b.totalScore - a.totalScore);
}

/**
 * Auto-generate task based on workflow event
 */
export async function autoGenerateTask(params: {
  caseId: string;
  workflowEvent: string;
  triggeredBy?: string;
  originalDocumentId?: string;
}) {
  const template = TASK_TEMPLATES[params.workflowEvent];
  
  if (!template) {
    return null;
  }

  // Find best assignee based on required skills
  const recommendations = await getTaskRecommendations({
    taskType: template.type,
    caseId: params.caseId,
    requiredSkills: template.requiredSkills
  });

  const bestCandidate = recommendations[0];

  return createTask({
    caseId: params.caseId,
    title: template.title,
    type: template.type,
    priority: template.priority,
    requiredSkills: template.requiredSkills,
    assignedTo: bestCandidate?.userId,
    assignedBy: params.triggeredBy || 'SYSTEM',
    documentId: params.originalDocumentId
  });
}

/**
 * Check if user can assign to another user
 */
export async function canAssign(assignerId: string, assigneeId: string): Promise<boolean> {
  const assigner = await prisma.user.findUnique({
    where: { id: assignerId },
    select: { role: true }
  });

  if (!assigner) return false;

  const assignee = await prisma.user.findUnique({
    where: { id: assigneeId },
    select: { role: true }
  });

  if (!assignee) return false;

  const allowedRoles = CAN_ASSIGN_TO[assigner.role as UserRole] || [];
  return allowedRoles.includes(assignee.role as UserRole);
}

/**
 * Get user's tasks
 */
export async function getUserTasks(userId: string, filters?: { status?: string; caseId?: string }) {
  return prisma.task.findMany({
    where: {
      assignedToId: userId,
      ...(filters?.status && { status: filters.status as any }),
      ...(filters?.caseId && { caseId: filters.caseId })
    },
    include: {
      case: {
        select: { id: true, caseNumber: true, clientName: true, matterType: true }
      }
    },
    orderBy: [
      { priority: 'desc' },
      { dueDate: 'asc' }
    ]
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export async function markTaskProgress(
  taskId: string,
  actorUserId: string | undefined,
  reason: TaskProgressReason,
  options?: { historyNote?: string; metadata?: Record<string, unknown>; skipHistory?: boolean },
) {
  const now = new Date();

  await prisma.task.update({
    where: { id: taskId },
    data: { lastProgressAt: now } as any,
  });

  if (options?.skipHistory) return;

  await createTaskHistoryEntry({
    taskId,
    changedById: actorUserId,
    action: 'TASK_PROGRESS',
    note: options?.historyNote,
    newValue: {
      type: 'TASK_PROGRESS',
      reason,
      at: now.toISOString(),
      actorUserId: actorUserId || null,
      ...(options?.metadata || {}),
    },
  });
}

async function createTimelineEvent(data: {
  caseId: string;
  userId?: string;
  type: TimelineType;
  payload?: Record<string, unknown>;
}) {
  return prisma.timelineEvent.create({
    data: {
      caseId: data.caseId,
      userId: data.userId ?? null,
      type: data.type as any,
      payload: (data.payload as any) ?? null
    } as any
  });
}


async function createTaskHistoryEntry(data: {
  taskId: string;
  action: string;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  changedById?: string;
  note?: string;
}) {
  return (prisma as any).taskHistory.create({
    data: {
      taskId: data.taskId,
      action: data.action,
      previousValue: (data.previousValue || null) as any,
      newValue: (data.newValue || null) as any,
      changedById: data.changedById || null,
      reason: data.note || null,
    } as any,
  });
}

export default {
  createTask,
  getCaseTasks,
  getTask,
  startTask,
  submitTask,
  completeTask,
  setTaskStatus,
  setTaskDeadline,
  reassignTask,
  addTaskChecklistItem,
  getTaskRecommendations,
  autoGenerateTask,
  canAssign,
  getUserTasks,
  setTaskStuckReason,
  setTaskMaturityStage,
  setTaskScores,
  markTaskProgress
};



