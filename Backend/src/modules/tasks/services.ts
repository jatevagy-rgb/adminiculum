// ============================================================================
// TASK SERVICE - Case-alapú feladatkezelés
// ============================================================================

import { PrismaClient } from '@prisma/client';
import prisma from '../../config/database';
import taskSubmissionService from './taskSubmission.service';
import { canUserActOnTask } from './taskAuthorization';
export { canUserActOnTask } from './taskAuthorization';
import {
  SupportedTaskAction,
  validateTaskTransition,
  WorkflowTransitionError,
} from '../cases/workItems';

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
  REVIEW_CONTRACT: 'REVIEW_CONTRACT',
  DRAFT_CONTRACT: 'DRAFT_CONTRACT',
  CLIENT_MEETING: 'CLIENT_MEETING',
  RESEARCH: 'RESEARCH',
  COURT_FILING: 'COURT_FILING',
  DEADLINE: 'DEADLINE',
  APPROVAL: 'APPROVAL',
  REVIEW_ANONYMIZED: 'REVIEW_ANONYMIZED',
  QUALITY_CHECK: 'QUALITY_CHECK',
  OTHER: 'OTHER'
} as const;

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
  DEADLINE_SET: 'DEADLINE_SET',
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

const taskRescheduleSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  dueDate: true,
  caseId: true,
  assignedToId: true,
  assignedById: true,
  updatedAt: true,
} as const;

const taskReadSelect = {
  id: true,
  title: true,
  description: true,
  taskType: true,
  type: true,
  status: true,
  priority: true,
  assignedToId: true,
  assignedById: true,
  documentId: true,
  sourceCommunicationId: true,
  caseId: true,
  workflowEvent: true,
  matterId: true,
  dueDate: true,
  startedAt: true,
  completedAt: true,
  submittedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function getTaskForTransition(taskId: string) {
  return prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      caseId: true,
      status: true,
      dueDate: true,
      assignedToId: true,
      assignedById: true,
      stuckReason: true,
      stuckSince: true,
    },
  });
}

async function transitionTask(taskId: string, userId: string, action: SupportedTaskAction, extraData: Record<string, unknown> = {}) {
  if (!userId) {
    throw new WorkflowTransitionError(401, 'NOT_AUTHENTICATED', 'Authenticated user is required.');
  }

  const existing = await getTaskForTransition(taskId);
  if (!existing) {
    throw new WorkflowTransitionError(404, 'TASK_NOT_FOUND', 'Task not found.');
  }

  const actor = await canUserActOnTask(existing, userId);
  if (!actor.allowed) {
    throw new WorkflowTransitionError(403, 'TASK_ACTION_FORBIDDEN', 'You are not allowed to perform this task action.');
  }

  const transition = validateTaskTransition(existing, action, userId, actor.role);
  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...transition.data,
      ...extraData,
    } as any,
  });

  await createTimelineEvent({
    caseId: task.caseId,
    userId,
    type: transition.timelineType as TimelineType,
    payload: {
      taskId,
      taskTitle: task.title,
      action,
    },
  });

  return task;
}

function mapAnyTaskTypeToPrisma(taskType?: string): TaskType {
  const normalized = String(taskType || '').trim().toUpperCase();
  const map: Record<string, TaskType> = {
    CONTRACT_REVIEW: TaskType.REVIEW_CONTRACT,
    CONTRACT_DRAFTING: TaskType.DRAFT_CONTRACT,
    DOCUMENT_TRANSLATION: TaskType.OTHER,
    LEGAL_RESEARCH: TaskType.RESEARCH,
    CLIENT_COMMUNICATION: TaskType.CLIENT_MEETING,
    ADMIN_SUPPORT: TaskType.OTHER,
    REVIEW_CONTRACT: TaskType.REVIEW_CONTRACT,
    DRAFT_CONTRACT: TaskType.DRAFT_CONTRACT,
    CLIENT_MEETING: TaskType.CLIENT_MEETING,
    RESEARCH: TaskType.RESEARCH,
    COURT_FILING: TaskType.COURT_FILING,
    DEADLINE: TaskType.DEADLINE,
    APPROVAL: TaskType.APPROVAL,
    REVIEW_ANONYMIZED: TaskType.REVIEW_ANONYMIZED,
    QUALITY_CHECK: TaskType.QUALITY_CHECK,
    OTHER: TaskType.OTHER,
  };

  return map[normalized] || TaskType.OTHER;
}

// ============================================================================
// TASK TEMPLATES - Automatikus feladat generálás workflow eseményekhez
// ============================================================================

const TASK_TEMPLATES: Record<string, { title: string; type: TaskType; priority: TaskPriority; requiredSkills: string[] }> = {
  DOCUMENT_GENERATED: {
    title: 'Szerződés első review',
    type: TaskType.REVIEW_CONTRACT,
    priority: TaskPriority.HIGH,
    requiredSkills: ['Contract Drafting', 'Legal Analysis']
  },
  SENT_TO_REVIEW: {
    title: 'Részletes jogi ellenőrzés',
    type: TaskType.REVIEW_CONTRACT,
    priority: TaskPriority.HIGH,
    requiredSkills: ['Contract Review', 'Compliance', 'Legal Analysis']
  },
  CONTRACT_REJECTED: {
    title: 'Javítások végrehajtása',
    type: TaskType.DRAFT_CONTRACT,
    priority: TaskPriority.URGENT,
    requiredSkills: ['Contract Drafting']
  },
  SENT_TO_CLIENT: {
    title: 'Ügyfélkommunikáció',
    type: TaskType.CLIENT_MEETING,
    priority: TaskPriority.MEDIUM,
    requiredSkills: ['Client Communication']
  },
  CLIENT_FEEDBACK: {
    title: 'Visszajelzés feldolgozása',
    type: TaskType.REVIEW_CONTRACT,
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
  [TaskType.REVIEW_CONTRACT]: ['Contract Review', 'Legal Analysis', 'Drafting'],
  [TaskType.DRAFT_CONTRACT]: ['Contract Drafting', 'Legal Writing'],
  [TaskType.CLIENT_MEETING]: ['Client Communication', 'Professional Writing'],
  [TaskType.RESEARCH]: ['Legal Research', 'Legal Analysis'],
  [TaskType.COURT_FILING]: ['Litigation', 'Court Procedure'],
  [TaskType.DEADLINE]: ['Deadline Management', 'Organization'],
  [TaskType.APPROVAL]: ['Quality Assurance', 'Review'],
  [TaskType.REVIEW_ANONYMIZED]: ['Anonymization', 'Legal Review'],
  [TaskType.QUALITY_CHECK]: ['Quality Control', 'Attention to Detail'],
  [TaskType.OTHER]: ['Administrative Skills', 'Organization']
};

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Create a new task
 */
export async function createTask(data: {
  caseId: string;
  title: string;
  description?: string;
  taskType?: TaskType | string;
  type?: TaskType | string;
  priority?: TaskPriority;
  assignedTo?: string;
  assignedBy: string;
  requiredSkills?: string[];
  dueDate?: Date;
  documentId?: string;
  sourceCommunicationId?: string;
}) {
  const prismaTaskType = mapAnyTaskTypeToPrisma((data.taskType as string | undefined) || (data.type as string | undefined));

  const task = await prisma.task.create({
    data: {
      caseId: data.caseId,
      title: data.title,
      description: data.description,
      taskType: prismaTaskType,
      type: String(data.type || data.taskType || prismaTaskType),
      priority: data.priority || TaskPriority.MEDIUM,
      status: 'TODO',
      assignedToId: data.assignedTo,
      assignedById: data.assignedBy,
      requiredSkills: data.requiredSkills || TASK_TYPE_SKILLS[prismaTaskType] || [],
      dueDate: data.dueDate,
      documentId: data.documentId,
      sourceCommunicationId: data.sourceCommunicationId
    } as any,
    include: {
      case: true,
      assignedTo: true
    }
  });

  // Create timeline event (non-blocking for task create success)
  try {
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
  } catch (timelineError) {
    console.warn('[TASK_CREATE] Timeline event creation failed (task remains created):', timelineError);
  }

  return task;
}

/**
 * Get all tasks for a case
 */
export async function getCaseTasks(caseId: string, filters?: { status?: string; assignedTo?: string }) {
  const tasks = await prisma.task.findMany({
    where: {
      caseId,
      ...(filters?.status && { status: filters.status as any }),
      ...(filters?.assignedTo && { assignedToId: filters.assignedTo })
    },
    select: {
      ...taskReadSelect,
      assignedTo: {
        select: { id: true, name: true, role: true }
      },
      submissions: {
        orderBy: { revisionNumber: 'desc' },
        take: 1,
        select: taskSubmissionProjectionSelect,
      },
    },
    orderBy: [
      { priority: 'desc' },
      { dueDate: 'asc' },
      { createdAt: 'desc' }
    ]
  });
  return tasks.map(withTaskSubmissionProjection);
}

/**
 * Get a single task by ID
 */
export async function getTask(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      ...taskReadSelect,
      case: true,
      assignedTo: true,
      submissions: {
        orderBy: { revisionNumber: 'desc' },
        take: 1,
        select: taskSubmissionProjectionSelect,
      },
    }
  });
  return task ? withTaskSubmissionProjection(task) : null;
}

/**
 * Start a task (TODO -> IN_PROGRESS)
 */
export async function startTask(taskId: string, userId: string) {
  return transitionTask(taskId, userId, 'START');
}

export class SourceLinkedTaskError extends Error {
  constructor(public statusCode: number, public code: string, message: string) {
    super(message);
    this.name = 'SourceLinkedTaskError';
  }
}

const DOCUMENT_TASK_KINDS = new Set(['REVIEW', 'FOLLOW_UP']);
const COMMUNICATION_TASK_KINDS = new Set(['FOLLOW_UP', 'REVIEW_ATTACHMENT']);

function parseSourceTaskBody(
  body: unknown,
  allowedKinds: Set<string>,
  fallbackTitle: string,
): { title: string; assigneeId?: string; dueAt?: Date; kind: string } {
  const payload = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  for (const forbidden of ['status', 'caseId', 'createdById', 'assignedById', 'description', 'priority', 'content', 'workspaceText']) {
    if (forbidden in payload) {
      throw new SourceLinkedTaskError(400, 'UNSUPPORTED_TASK_PAYLOAD_FIELD', `Field ${forbidden} is not accepted for source-linked task creation.`);
    }
  }

  const kind = String(payload.kind || '').trim().toUpperCase();
  if (!kind || !allowedKinds.has(kind)) {
    throw new SourceLinkedTaskError(400, 'INVALID_SOURCE_TASK_KIND', 'Unsupported source-linked task kind.');
  }

  let dueAt: Date | undefined;
  if (payload.dueAt) {
    const parsed = new Date(String(payload.dueAt));
    if (Number.isNaN(parsed.getTime())) {
      throw new SourceLinkedTaskError(400, 'INVALID_DUE_DATE', 'Invalid dueAt value.');
    }
    dueAt = parsed;
  }

  const titleInput = typeof payload.title === 'string' ? payload.title.trim() : '';
  const assigneeId = typeof payload.assigneeId === 'string' && payload.assigneeId.trim() ? payload.assigneeId.trim() : undefined;
  return {
    title: titleInput || fallbackTitle,
    assigneeId,
    dueAt,
    kind,
  };
}

function sourceKindToTaskType(kind: string): TaskType {
  if (kind === 'REVIEW' || kind === 'REVIEW_ATTACHMENT') return TaskType.REVIEW_CONTRACT;
  return TaskType.OTHER;
}

export async function createTaskFromDocumentSource(documentId: string, userId: string, body: unknown) {
  if (!userId) {
    throw new SourceLinkedTaskError(401, 'NOT_AUTHENTICATED', 'Authenticated user is required.');
  }

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      caseId: true,
      name: true,
      fileName: true,
      documentType: true,
    },
  });
  if (!document) {
    throw new SourceLinkedTaskError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.');
  }

  const parsed = parseSourceTaskBody(body, DOCUMENT_TASK_KINDS, `Dokumentum feldolgozása: ${document.fileName || document.name}`);
  const task = await createTask({
    caseId: document.caseId,
    title: parsed.title,
    taskType: sourceKindToTaskType(parsed.kind),
    type: parsed.kind === 'REVIEW' ? 'DOCUMENT_REVIEW' : 'DOCUMENT_FOLLOW_UP',
    priority: TaskPriority.MEDIUM,
    assignedTo: parsed.assigneeId,
    assignedBy: userId,
    dueDate: parsed.dueAt,
    documentId: document.id,
  });

  return {
    success: true,
    task: {
      id: task.id,
      title: task.title,
      caseId: task.caseId,
      documentId: task.documentId,
      status: task.status,
      dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    },
    source: {
      type: 'DOCUMENT',
      id: document.id,
      caseId: document.caseId,
    },
  };
}

export async function createTaskFromCommunicationSource(communicationId: string, userId: string, body: unknown) {
  if (!userId) {
    throw new SourceLinkedTaskError(401, 'NOT_AUTHENTICATED', 'Authenticated user is required.');
  }

  const communication = await prisma.communication.findUnique({
    where: { id: communicationId },
    select: {
      id: true,
      caseId: true,
      subject: true,
    },
  });
  if (!communication) {
    throw new SourceLinkedTaskError(404, 'COMMUNICATION_NOT_FOUND', 'Communication not found.');
  }
  if (!communication.caseId) {
    throw new SourceLinkedTaskError(409, 'COMMUNICATION_NOT_LINKED_TO_CASE', 'Communication must be linked to a case before creating a task.');
  }

  const parsed = parseSourceTaskBody(body, COMMUNICATION_TASK_KINDS, `Kommunikáció feldolgozása: ${communication.subject || communication.id}`);
  const task = await createTask({
    caseId: communication.caseId,
    title: parsed.title,
    taskType: sourceKindToTaskType(parsed.kind),
    type: parsed.kind === 'REVIEW_ATTACHMENT' ? 'COMMUNICATION_ATTACHMENT_REVIEW' : 'COMMUNICATION_FOLLOW_UP',
    priority: TaskPriority.MEDIUM,
    assignedTo: parsed.assigneeId,
    assignedBy: userId,
    dueDate: parsed.dueAt,
    sourceCommunicationId: communication.id,
  });

  return {
    success: true,
    task: {
      id: task.id,
      title: task.title,
      caseId: task.caseId,
      sourceCommunicationId: task.sourceCommunicationId,
      status: task.status,
      dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    },
    source: {
      type: 'COMMUNICATION',
      id: communication.id,
      caseId: communication.caseId,
    },
  };
}

/**
 * Submit task for review (IN_PROGRESS -> IN_REVIEW)
 */
export async function submitTask(taskId: string, userId: string, notes?: string) {
  return transitionTask(taskId, userId, 'SUBMIT_FOR_REVIEW', notes ? { lastProgressAt: new Date() } : {});
}

/**
 * Complete a task (IN_REVIEW -> DONE)
 */
export async function completeTask(taskId: string, userId: string, approved: boolean, notes?: string) {
  return transitionTask(taskId, userId, approved ? 'APPROVE' : 'RETURN_FOR_CORRECTION', notes ? { lastProgressAt: new Date() } : {});
}

export async function blockTask(taskId: string, userId: string, reason: string) {
  const allowedReasons = new Set([
    'INFORMATION_MISSING',
    'CLIENT_WAITING',
    'LEGAL_RESEARCH',
    'TECHNICAL_BLOCK',
    'DEPENDENCY',
    'INTERNAL_REVIEW',
    'EXTERNAL_APPROVAL',
  ]);
  const normalizedReason = String(reason || '').trim().toUpperCase();
  if (!allowedReasons.has(normalizedReason)) {
    throw new WorkflowTransitionError(400, 'INVALID_STUCK_REASON', 'Invalid blocker reason.');
  }
  return transitionTask(taskId, userId, 'BLOCK', { stuckReason: normalizedReason });
}

export async function unblockTask(taskId: string, userId: string) {
  return transitionTask(taskId, userId, 'UNBLOCK');
}

export async function rescheduleTaskDueDate(taskId: string, userId: string, body: unknown) {
  if (!userId) {
    throw new WorkflowTransitionError(401, 'NOT_AUTHENTICATED', 'Authenticated user is required.');
  }
  const payload = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const allowed = new Set(['dueAt']);
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) {
      throw new WorkflowTransitionError(400, 'UNSUPPORTED_RESCHEDULE_FIELD', `Field ${key} is not accepted for task rescheduling.`);
    }
  }
  if (!('dueAt' in payload)) {
    throw new WorkflowTransitionError(400, 'DUE_AT_REQUIRED', 'dueAt is required.');
  }

  let dueDate: Date | null = null;
  if (payload.dueAt !== null && payload.dueAt !== '') {
    const parsed = new Date(String(payload.dueAt));
    if (Number.isNaN(parsed.getTime())) {
      throw new WorkflowTransitionError(400, 'INVALID_DUE_DATE', 'Invalid dueAt value.');
    }
    dueDate = parsed;
  }

  const existing = await getTaskForTransition(taskId);
  if (!existing) {
    throw new WorkflowTransitionError(404, 'TASK_NOT_FOUND', 'Task not found.');
  }
  const status = String(existing.status || '').toUpperCase();
  if (['COMPLETED', 'DONE', 'CANCELLED', 'ARCHIVED'].includes(status)) {
    throw new WorkflowTransitionError(409, 'TASK_DEADLINE_NOT_OPEN', 'Closed task deadlines cannot be rescheduled.');
  }
  const actor = await canUserActOnTask(existing, userId);
  if (!actor.allowed) {
    throw new WorkflowTransitionError(403, 'TASK_ACTION_FORBIDDEN', 'You are not allowed to reschedule this task.');
  }

  const currentDue = existing as typeof existing & { dueDate?: Date | null };
  const same =
    (!dueDate && !currentDue.dueDate) ||
    (dueDate && currentDue.dueDate && dueDate.getTime() === currentDue.dueDate.getTime());
  if (same) {
    return prisma.task.findUnique({ where: { id: taskId }, select: taskRescheduleSelect });
  }

  const task = await prisma.task.update({
    where: { id: taskId },
    data: { dueDate } as any,
    select: taskRescheduleSelect,
  });

  await createTimelineEvent({
    caseId: task.caseId,
    userId,
    type: TimelineType.DEADLINE_SET,
    payload: {
      taskId,
      source: 'task_due_date',
      dueAt: dueDate ? dueDate.toISOString() : null,
    },
  });

  return task;
}

/**
 * Reassign a task
 */
export async function reassignTask(taskId: string, newAssigneeId: string, reassignedBy: string) {
  if (!reassignedBy) {
    throw new WorkflowTransitionError(401, 'NOT_AUTHENTICATED', 'Authenticated user is required.');
  }

  const existingTask = await getTaskForTransition(taskId);
  if (!existingTask) {
    throw new WorkflowTransitionError(404, 'TASK_NOT_FOUND', 'Task not found.');
  }

  const actorAccess = await canUserActOnTask(existingTask, reassignedBy);
  if (!actorAccess.allowed) {
    throw new WorkflowTransitionError(403, 'TASK_ACCESS_FORBIDDEN', 'You do not have access to reassign this task.');
  }

  const assignee = await prisma.user.findUnique({
    where: { id: newAssigneeId },
    select: { id: true, role: true, isActive: true },
  });
  if (!assignee || assignee.isActive === false) {
    throw new WorkflowTransitionError(400, 'ASSIGNEE_NOT_AVAILABLE', 'Assignee is not available.');
  }

  const caseRecord = await prisma.case.findUnique({
    where: { id: existingTask.caseId },
    select: { assignedLawyerId: true, createdById: true },
  });
  const isCaseMember =
    caseRecord?.assignedLawyerId === newAssigneeId ||
    caseRecord?.createdById === newAssigneeId ||
    Boolean(await prisma.caseCollaborator.findFirst({
      where: { caseId: existingTask.caseId, userId: newAssigneeId },
      select: { id: true },
    }));

  if (!isCaseMember && !['ADMIN', 'PARTNER'].includes(String(assignee.role))) {
    throw new WorkflowTransitionError(403, 'ASSIGNEE_NOT_CASE_MEMBER', 'Task assignee must already be part of the case team.');
  }

  if (existingTask.assignedToId === newAssigneeId) {
    return getTask(taskId);
  }

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
    taskType: template.type,
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
  const tasks = await prisma.task.findMany({
    where: {
      assignedToId: userId,
      ...(filters?.status && { status: filters.status as any }),
      ...(filters?.caseId && { caseId: filters.caseId })
    },
    select: {
      ...taskReadSelect,
      case: {
        select: {
          id: true,
          caseNumber: true,
          clientName: true,
          matterType: true,
          client: { select: { colorKey: true } },
        }
      },
      submissions: {
        orderBy: { revisionNumber: 'desc' },
        take: 1,
        select: taskSubmissionProjectionSelect,
      },
    },
    orderBy: [
      { priority: 'desc' },
      { dueDate: 'asc' }
    ]
  });
  return tasks.map(withTaskSubmissionProjection);
}

export async function getReviewTasksForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!user) return [];

  const submissionItems = await taskSubmissionService.getSubmissionReviewQueue(userId);
  const legacyTasks = await prisma.task.findMany({
    where: {
      status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'IN_REVIEW'] as any },
      NOT: { assignedToId: userId },
      submissions: { none: { status: 'SUBMITTED' } },
      OR: [
        { assignedById: userId },
        { case: { assignedLawyerId: userId } },
        { case: { createdById: userId } },
        { case: { collaborators: { some: { userId } } } },
      ],
    },
    select: {
      ...taskReadSelect,
      assignedTo: { select: { id: true, name: true, role: true } },
      assignedBy: { select: { id: true, name: true, role: true } },
      case: {
        select: {
          id: true,
          caseNumber: true,
          title: true,
          clientId: true,
          clientName: true,
          matterType: true,
        },
      },
    },
    orderBy: [
      { submittedAt: 'desc' },
      { priority: 'desc' },
      { dueDate: 'asc' },
    ],
  });
  return [
    ...submissionItems,
    ...legacyTasks.map((task) => ({ ...task, source: 'LEGACY_TASK', taskId: task.id, nextActionCode: 'OPEN_REVIEW' })),
  ].sort((left, right) => {
    const leftDate = left.submittedAt ? new Date(left.submittedAt).getTime() : 0;
    const rightDate = right.submittedAt ? new Date(right.submittedAt).getTime() : 0;
    return rightDate - leftDate;
  });
}

const taskSubmissionProjectionSelect = {
  id: true,
  status: true,
  revisionNumber: true,
  submittedAt: true,
  returnedAt: true,
  approvedAt: true,
  requestedAttention: true,
  externalActionRequired: true,
  externalActionType: true,
  externalCompletedAt: true,
  assignedReviewer: { select: { id: true, name: true, role: true } },
  reviewDecision: {
    select: { decision: true, createdAt: true, correctionDeadline: true },
  },
  _count: { select: { documents: true } },
  timeEntries: { select: { timeEntry: { select: { minutes: true } } } },
} as const;

function taskNextActionCode(taskStatus: unknown, submission?: any): string {
  const status = String(submission?.status || '').toUpperCase();
  if (status === 'DRAFT') return 'CONTINUE_SUBMISSION';
  if (status === 'SUBMITTED') return 'VIEW_SUBMISSION';
  if (status === 'RETURNED') return 'CONTINUE_RETURNED_WORK';
  if (status === 'APPROVED' && submission?.externalActionRequired && !submission?.externalCompletedAt) return 'RECORD_EXTERNAL_COMPLETION';
  if (status === 'APPROVED' || status === 'SUPERSEDED') return 'VIEW_COMPLETED';
  return ['PENDING', 'TODO'].includes(String(taskStatus || '').toUpperCase()) ? 'START_TASK' : 'OPEN_TASK';
}

function withTaskSubmissionProjection<T extends { status: unknown; submissions: any[] }>(task: T) {
  const { submissions, ...safeTask } = task;
  const submission = submissions[0] || null;
  const caseRecord = (safeTask as any).case;
  const safeCase = caseRecord
    ? (() => {
        const { client, ...caseFields } = caseRecord;
        return { ...caseFields, clientColorKey: client?.colorKey || null };
      })()
    : undefined;
  return {
    ...safeTask,
    ...(safeCase ? { case: safeCase } : {}),
    activeSubmissionId: submission?.status === 'DRAFT' ? submission.id : null,
    currentSubmittedRevisionId: submission?.status === 'SUBMITTED' ? submission.id : null,
    approvedRevisionId: submission?.status === 'APPROVED' ? submission.id : null,
    submissionStatus: submission?.status || null,
    submissionRevision: submission?.revisionNumber || null,
    submittedAt: submission?.submittedAt || (safeTask as any).submittedAt || null,
    assignedReviewer: submission?.assignedReviewer || null,
    requestedAttention: submission?.requestedAttention || null,
    latestDecisionType: submission?.reviewDecision?.decision || null,
    latestDecisionAt: submission?.reviewDecision?.createdAt || null,
    returnedCorrectionDeadline: submission?.reviewDecision?.correctionDeadline || null,
    externalActionRequired: submission?.externalActionRequired || false,
    externalActionType: submission?.externalActionType || null,
    externalCompletedAt: submission?.externalCompletedAt || null,
    submissionDocumentCount: submission?._count?.documents || 0,
    linkedTimeMinutes: submission?.timeEntries?.reduce((sum: number, link: any) => sum + Number(link.timeEntry?.minutes || 0), 0) || 0,
    nextActionCode: taskNextActionCode(safeTask.status, submission),
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function createTimelineEvent(data: {
  caseId: string;
  userId?: string;
  type: TimelineType;
  payload?: Record<string, unknown>;
}) {
  const eventTypeMap: Record<string, string> = {
    CASE_CREATED: 'CASE_CREATED',
    CASE_STATUS_CHANGED: 'CASE_STATUS_CHANGED',
    CASE_REOPENED: 'CASE_STATUS_CHANGED',
    CLIENT_DATA_REGISTERED: 'CUSTOM',
    CONTRACT_GENERATED: 'CONTRACT_GENERATED',
    DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED',
    DOCUMENT_MOVED: 'CUSTOM',
    SENT_TO_REVIEW: 'REVIEW_REQUESTED',
    CONTRACT_APPROVED: 'DOCUMENT_APPROVED',
    CONTRACT_REJECTED: 'DOCUMENT_REJECTED',
    SENT_TO_CLIENT: 'DOCUMENT_SENT_TO_CLIENT',
    CLIENT_FEEDBACK_RECEIVED: 'CUSTOM',
    CASE_COMPLETED: 'CASE_STATUS_CHANGED',
    TASK_ASSIGNED: 'TASK_ASSIGNED',
    TASK_STARTED: 'TASK_STARTED',
    TASK_SUBMITTED: 'CUSTOM',
    TASK_COMPLETED: 'TASK_COMPLETED',
    TASK_REJECTED: 'TASK_BLOCKED',
    DEADLINE_SET: 'DEADLINE_SET',
    CHECKED_OUT: 'CUSTOM',
    CHECKED_IN: 'CUSTOM',
    VERSION_CREATED: 'DOCUMENT_VERSION_CREATED',
    PERMISSION_GRANTED: 'CUSTOM',
  };

  const mappedEventType = eventTypeMap[String(data.type)] || 'CUSTOM';

  return prisma.timelineEvent.create({
    data: {
      caseId: data.caseId,
      userId: data.userId,
      eventType: mappedEventType as any,
      type: data.type as any,
      payload: data.payload as any
    } as any
  });
}

export class TaskValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskValidationError';
  }
}

export default {
  createTask,
  getCaseTasks,
  getTask,
  startTask,
  submitTask,
  completeTask,
  blockTask,
  unblockTask,
  rescheduleTaskDueDate,
  reassignTask,
  getTaskRecommendations,
  autoGenerateTask,
  canAssign,
  getUserTasks,
  getReviewTasksForUser,
  TaskValidationError
};
