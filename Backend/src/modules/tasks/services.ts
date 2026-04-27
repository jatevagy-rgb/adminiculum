// ============================================================================
// TASK SERVICE - Case-alapú feladatkezelés
// ============================================================================

import { PrismaClient } from '@prisma/client';
import prisma from '../../config/database.js';

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
      documentId: data.documentId
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

  return task;
}

/**
 * Submit task for review (IN_PROGRESS -> IN_REVIEW)
 */
export async function submitTask(taskId: string, userId: string, notes?: string) {
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

  return task;
}

/**
 * Complete a task (IN_REVIEW -> DONE)
 */
export async function completeTask(taskId: string, userId: string, approved: boolean, notes?: string) {
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

  return task;
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
  reassignTask,
  getTaskRecommendations,
  autoGenerateTask,
  canAssign,
  getUserTasks,
  TaskValidationError
};
