"use strict";
// ============================================================================
// TASK SERVICE - Case-alapú feladatkezelés
// ============================================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTask = createTask;
exports.getCaseTasks = getCaseTasks;
exports.getTask = getTask;
exports.startTask = startTask;
exports.submitTask = submitTask;
exports.completeTask = completeTask;
exports.reassignTask = reassignTask;
exports.getTaskRecommendations = getTaskRecommendations;
exports.autoGenerateTask = autoGenerateTask;
exports.canAssign = canAssign;
exports.getUserTasks = getUserTasks;
const database_js_1 = __importDefault(require("../../config/database.js"));
const TaskStatus = {
    TODO: 'TODO',
    IN_PROGRESS: 'IN_PROGRESS',
    IN_REVIEW: 'IN_REVIEW',
    BLOCKED: 'BLOCKED',
    DONE: 'DONE'
};
const TaskPriority = {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    URGENT: 'URGENT'
};
const TaskType = {
    CONTRACT_REVIEW: 'CONTRACT_REVIEW',
    CONTRACT_DRAFTING: 'CONTRACT_DRAFTING',
    DOCUMENT_TRANSLATION: 'DOCUMENT_TRANSLATION',
    LEGAL_RESEARCH: 'LEGAL_RESEARCH',
    CLIENT_COMMUNICATION: 'CLIENT_COMMUNICATION',
    ADMIN_SUPPORT: 'ADMIN_SUPPORT'
};
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
};
const UserRole = {
    LAWYER: 'LAWYER',
    COLLAB_LAWYER: 'COLLAB_LAWYER',
    TRAINEE: 'TRAINEE',
    LEGAL_ASSISTANT: 'LEGAL_ASSISTANT',
    ADMIN: 'ADMIN'
};
// ============================================================================
// TASK TEMPLATES - Automatikus feladat generálás workflow eseményekhez
// ============================================================================
const TASK_TEMPLATES = {
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
const CAN_ASSIGN_TO = {
    [UserRole.LAWYER]: [UserRole.TRAINEE, UserRole.LEGAL_ASSISTANT],
    [UserRole.COLLAB_LAWYER]: [UserRole.TRAINEE, UserRole.LEGAL_ASSISTANT],
    [UserRole.TRAINEE]: [UserRole.LEGAL_ASSISTANT],
    [UserRole.LEGAL_ASSISTANT]: [],
    [UserRole.ADMIN]: [UserRole.TRAINEE, UserRole.LEGAL_ASSISTANT, UserRole.COLLAB_LAWYER]
};
// ============================================================================
// SKILL MAPPING - Task type -> Required skills
// ============================================================================
const TASK_TYPE_SKILLS = {
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
 * Create a new task
 */
async function createTask(data) {
    const task = await database_js_1.default.task.create({
        data: {
            caseId: data.caseId,
            title: data.title,
            description: data.description,
            type: data.type,
            priority: data.priority || TaskPriority.MEDIUM,
            status: 'TODO',
            assignedToId: data.assignedTo,
            assignedById: data.assignedBy,
            requiredSkills: data.requiredSkills || TASK_TYPE_SKILLS[data.type] || [],
            dueDate: data.dueDate,
            documentId: data.documentId
        },
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
    return task;
}
/**
 * Get all tasks for a case
 */
async function getCaseTasks(caseId, filters) {
    return database_js_1.default.task.findMany({
        where: {
            caseId,
            ...(filters?.status && { status: filters.status }),
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
async function getTask(taskId) {
    return database_js_1.default.task.findUnique({
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
async function startTask(taskId, userId) {
    const task = await database_js_1.default.task.update({
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
async function submitTask(taskId, userId, notes) {
    const task = await database_js_1.default.task.update({
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
async function completeTask(taskId, userId, approved, notes) {
    const task = await database_js_1.default.task.update({
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
async function reassignTask(taskId, newAssigneeId, reassignedBy) {
    const task = await database_js_1.default.task.update({
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
async function getTaskRecommendations(params) {
    const requiredSkills = params.requiredSkills || TASK_TYPE_SKILLS[params.taskType] || [];
    // Get all active users who can be assigned
    const eligibleUsers = await database_js_1.default.user.findMany({
        where: {
            status: 'ACTIVE',
            role: {
                in: ['TRAINEE', 'LEGAL_ASSISTANT', 'COLLAB_LAWYER']
            }
        }
    });
    // Get current workload for each user
    const userWorkloads = await database_js_1.default.task.groupBy({
        by: ['assignedToId'],
        where: {
            assignedToId: { in: eligibleUsers.map(u => u.id) },
            status: { in: ['TODO', 'IN_PROGRESS', 'IN_REVIEW'] }
        },
        _count: true
    });
    // Calculate recommendations
    const recommendations = eligibleUsers.map(user => {
        const workload = userWorkloads.find((w) => w.assignedTo === user.id)?._count || 0;
        // Calculate skill match score
        let skillScore = 0;
        if (user.skillProfile) {
            for (const skill of requiredSkills) {
                const skillKey = skill.toLowerCase().replace(/ /g, '');
                const skillValue = user.skillProfile[skillKey];
                if (typeof skillValue === 'number') {
                    skillScore += skillValue;
                }
            }
        }
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
            skills: requiredSkills.reduce((acc, skill) => {
                const skillKey = skill.toLowerCase().replace(/ /g, '');
                return {
                    ...acc,
                    [skill]: user.skillProfile?.[skillKey] || 0
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
async function autoGenerateTask(params) {
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
async function canAssign(assignerId, assigneeId) {
    const assigner = await database_js_1.default.user.findUnique({
        where: { id: assignerId },
        select: { role: true }
    });
    if (!assigner)
        return false;
    const assignee = await database_js_1.default.user.findUnique({
        where: { id: assigneeId },
        select: { role: true }
    });
    if (!assignee)
        return false;
    const allowedRoles = CAN_ASSIGN_TO[assigner.role] || [];
    return allowedRoles.includes(assignee.role);
}
/**
 * Get user's tasks
 */
async function getUserTasks(userId, filters) {
    return database_js_1.default.task.findMany({
        where: {
            assignedTo: userId,
            ...(filters?.status && { status: filters.status }),
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
async function createTimelineEvent(data) {
    return database_js_1.default.timelineEvent.create({
        data: {
            caseId: data.caseId,
            userId: data.userId,
            type: data.type,
            payload: data.payload
        }
    });
}
exports.default = {
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
    getUserTasks
};
//# sourceMappingURL=services.js.map