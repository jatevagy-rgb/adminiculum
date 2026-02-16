declare const TaskPriority: {
    readonly LOW: "LOW";
    readonly MEDIUM: "MEDIUM";
    readonly HIGH: "HIGH";
    readonly URGENT: "URGENT";
};
declare const TaskType: {
    readonly CONTRACT_REVIEW: "CONTRACT_REVIEW";
    readonly CONTRACT_DRAFTING: "CONTRACT_DRAFTING";
    readonly DOCUMENT_TRANSLATION: "DOCUMENT_TRANSLATION";
    readonly LEGAL_RESEARCH: "LEGAL_RESEARCH";
    readonly CLIENT_COMMUNICATION: "CLIENT_COMMUNICATION";
    readonly ADMIN_SUPPORT: "ADMIN_SUPPORT";
};
type TaskType = typeof TaskType[keyof typeof TaskType];
type TaskPriority = typeof TaskPriority[keyof typeof TaskPriority];
/**
 * Create a new task
 */
export declare function createTask(data: {
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
}): Promise<{
    case: {
        id: string;
        status: import(".prisma/client").$Enums.CaseStatus;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        caseNumber: string;
        description: string | null;
        caseType: import(".prisma/client").$Enums.CaseType;
        priority: import(".prisma/client").$Enums.Priority;
        clientName: string | null;
        matterType: string | null;
        sharepointRoot: string | null;
        sharepointSite: string | null;
        caseAssignment: import("@prisma/client/runtime/library").JsonValue | null;
        spSiteId: string | null;
        spDriveId: string | null;
        spFolderPath: string | null;
        spMainFolderId: string | null;
        receivedAt: Date;
        deadline: Date | null;
        completedAt: Date | null;
        clientId: string;
        matterId: string | null;
        createdById: string;
        assignedLawyerId: string | null;
    };
    assignedTo: {
        department: string | null;
        id: string;
        email: string;
        passwordHash: string | null;
        name: string;
        role: import(".prisma/client").$Enums.UserRole;
        status: import(".prisma/client").$Enums.UserStatus;
        skills: string[];
        isActive: boolean;
        lastLoginAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    };
} & {
    id: string;
    status: import(".prisma/client").$Enums.TaskStatus;
    createdAt: Date;
    updatedAt: Date;
    title: string;
    skillProfile: import("@prisma/client/runtime/library").JsonValue | null;
    description: string | null;
    priority: import(".prisma/client").$Enums.Priority;
    completedAt: Date | null;
    matterId: string | null;
    type: string | null;
    caseId: string;
    documentId: string | null;
    taskType: import(".prisma/client").$Enums.TaskType;
    skillMatch: number | null;
    requiredSkills: string[];
    workflowEvent: string | null;
    dueDate: Date | null;
    startedAt: Date | null;
    submittedAt: Date | null;
    assignedToId: string | null;
    assignedById: string | null;
}>;
/**
 * Get all tasks for a case
 */
export declare function getCaseTasks(caseId: string, filters?: {
    status?: string;
    assignedTo?: string;
}): Promise<({
    assignedTo: {
        id: string;
        name: string;
        role: import(".prisma/client").$Enums.UserRole;
    };
} & {
    id: string;
    status: import(".prisma/client").$Enums.TaskStatus;
    createdAt: Date;
    updatedAt: Date;
    title: string;
    skillProfile: import("@prisma/client/runtime/library").JsonValue | null;
    description: string | null;
    priority: import(".prisma/client").$Enums.Priority;
    completedAt: Date | null;
    matterId: string | null;
    type: string | null;
    caseId: string;
    documentId: string | null;
    taskType: import(".prisma/client").$Enums.TaskType;
    skillMatch: number | null;
    requiredSkills: string[];
    workflowEvent: string | null;
    dueDate: Date | null;
    startedAt: Date | null;
    submittedAt: Date | null;
    assignedToId: string | null;
    assignedById: string | null;
})[]>;
/**
 * Get a single task by ID
 */
export declare function getTask(taskId: string): Promise<{
    case: {
        id: string;
        status: import(".prisma/client").$Enums.CaseStatus;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        caseNumber: string;
        description: string | null;
        caseType: import(".prisma/client").$Enums.CaseType;
        priority: import(".prisma/client").$Enums.Priority;
        clientName: string | null;
        matterType: string | null;
        sharepointRoot: string | null;
        sharepointSite: string | null;
        caseAssignment: import("@prisma/client/runtime/library").JsonValue | null;
        spSiteId: string | null;
        spDriveId: string | null;
        spFolderPath: string | null;
        spMainFolderId: string | null;
        receivedAt: Date;
        deadline: Date | null;
        completedAt: Date | null;
        clientId: string;
        matterId: string | null;
        createdById: string;
        assignedLawyerId: string | null;
    };
    assignedTo: {
        department: string | null;
        id: string;
        email: string;
        passwordHash: string | null;
        name: string;
        role: import(".prisma/client").$Enums.UserRole;
        status: import(".prisma/client").$Enums.UserStatus;
        skills: string[];
        isActive: boolean;
        lastLoginAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    };
} & {
    id: string;
    status: import(".prisma/client").$Enums.TaskStatus;
    createdAt: Date;
    updatedAt: Date;
    title: string;
    skillProfile: import("@prisma/client/runtime/library").JsonValue | null;
    description: string | null;
    priority: import(".prisma/client").$Enums.Priority;
    completedAt: Date | null;
    matterId: string | null;
    type: string | null;
    caseId: string;
    documentId: string | null;
    taskType: import(".prisma/client").$Enums.TaskType;
    skillMatch: number | null;
    requiredSkills: string[];
    workflowEvent: string | null;
    dueDate: Date | null;
    startedAt: Date | null;
    submittedAt: Date | null;
    assignedToId: string | null;
    assignedById: string | null;
}>;
/**
 * Start a task (TODO -> IN_PROGRESS)
 */
export declare function startTask(taskId: string, userId: string): Promise<{
    id: string;
    status: import(".prisma/client").$Enums.TaskStatus;
    createdAt: Date;
    updatedAt: Date;
    title: string;
    skillProfile: import("@prisma/client/runtime/library").JsonValue | null;
    description: string | null;
    priority: import(".prisma/client").$Enums.Priority;
    completedAt: Date | null;
    matterId: string | null;
    type: string | null;
    caseId: string;
    documentId: string | null;
    taskType: import(".prisma/client").$Enums.TaskType;
    skillMatch: number | null;
    requiredSkills: string[];
    workflowEvent: string | null;
    dueDate: Date | null;
    startedAt: Date | null;
    submittedAt: Date | null;
    assignedToId: string | null;
    assignedById: string | null;
}>;
/**
 * Submit task for review (IN_PROGRESS -> IN_REVIEW)
 */
export declare function submitTask(taskId: string, userId: string, notes?: string): Promise<{
    id: string;
    status: import(".prisma/client").$Enums.TaskStatus;
    createdAt: Date;
    updatedAt: Date;
    title: string;
    skillProfile: import("@prisma/client/runtime/library").JsonValue | null;
    description: string | null;
    priority: import(".prisma/client").$Enums.Priority;
    completedAt: Date | null;
    matterId: string | null;
    type: string | null;
    caseId: string;
    documentId: string | null;
    taskType: import(".prisma/client").$Enums.TaskType;
    skillMatch: number | null;
    requiredSkills: string[];
    workflowEvent: string | null;
    dueDate: Date | null;
    startedAt: Date | null;
    submittedAt: Date | null;
    assignedToId: string | null;
    assignedById: string | null;
}>;
/**
 * Complete a task (IN_REVIEW -> DONE)
 */
export declare function completeTask(taskId: string, userId: string, approved: boolean, notes?: string): Promise<{
    id: string;
    status: import(".prisma/client").$Enums.TaskStatus;
    createdAt: Date;
    updatedAt: Date;
    title: string;
    skillProfile: import("@prisma/client/runtime/library").JsonValue | null;
    description: string | null;
    priority: import(".prisma/client").$Enums.Priority;
    completedAt: Date | null;
    matterId: string | null;
    type: string | null;
    caseId: string;
    documentId: string | null;
    taskType: import(".prisma/client").$Enums.TaskType;
    skillMatch: number | null;
    requiredSkills: string[];
    workflowEvent: string | null;
    dueDate: Date | null;
    startedAt: Date | null;
    submittedAt: Date | null;
    assignedToId: string | null;
    assignedById: string | null;
}>;
/**
 * Reassign a task
 */
export declare function reassignTask(taskId: string, newAssigneeId: string, reassignedBy: string): Promise<{
    assignedTo: {
        id: string;
        name: string;
    };
} & {
    id: string;
    status: import(".prisma/client").$Enums.TaskStatus;
    createdAt: Date;
    updatedAt: Date;
    title: string;
    skillProfile: import("@prisma/client/runtime/library").JsonValue | null;
    description: string | null;
    priority: import(".prisma/client").$Enums.Priority;
    completedAt: Date | null;
    matterId: string | null;
    type: string | null;
    caseId: string;
    documentId: string | null;
    taskType: import(".prisma/client").$Enums.TaskType;
    skillMatch: number | null;
    requiredSkills: string[];
    workflowEvent: string | null;
    dueDate: Date | null;
    startedAt: Date | null;
    submittedAt: Date | null;
    assignedToId: string | null;
    assignedById: string | null;
}>;
/**
 * Get skill-based recommendations for task assignment
 */
export declare function getTaskRecommendations(params: {
    taskType: TaskType;
    caseId: string;
    requiredSkills?: string[];
}): Promise<{
    userId: string;
    name: string;
    role: import(".prisma/client").$Enums.UserRole;
    matchScore: number;
    skills: {
        [x: string]: number;
    };
    currentWorkload: string;
    totalScore: number;
}[]>;
/**
 * Auto-generate task based on workflow event
 */
export declare function autoGenerateTask(params: {
    caseId: string;
    workflowEvent: string;
    triggeredBy?: string;
    originalDocumentId?: string;
}): Promise<{
    case: {
        id: string;
        status: import(".prisma/client").$Enums.CaseStatus;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        caseNumber: string;
        description: string | null;
        caseType: import(".prisma/client").$Enums.CaseType;
        priority: import(".prisma/client").$Enums.Priority;
        clientName: string | null;
        matterType: string | null;
        sharepointRoot: string | null;
        sharepointSite: string | null;
        caseAssignment: import("@prisma/client/runtime/library").JsonValue | null;
        spSiteId: string | null;
        spDriveId: string | null;
        spFolderPath: string | null;
        spMainFolderId: string | null;
        receivedAt: Date;
        deadline: Date | null;
        completedAt: Date | null;
        clientId: string;
        matterId: string | null;
        createdById: string;
        assignedLawyerId: string | null;
    };
    assignedTo: {
        department: string | null;
        id: string;
        email: string;
        passwordHash: string | null;
        name: string;
        role: import(".prisma/client").$Enums.UserRole;
        status: import(".prisma/client").$Enums.UserStatus;
        skills: string[];
        isActive: boolean;
        lastLoginAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    };
} & {
    id: string;
    status: import(".prisma/client").$Enums.TaskStatus;
    createdAt: Date;
    updatedAt: Date;
    title: string;
    skillProfile: import("@prisma/client/runtime/library").JsonValue | null;
    description: string | null;
    priority: import(".prisma/client").$Enums.Priority;
    completedAt: Date | null;
    matterId: string | null;
    type: string | null;
    caseId: string;
    documentId: string | null;
    taskType: import(".prisma/client").$Enums.TaskType;
    skillMatch: number | null;
    requiredSkills: string[];
    workflowEvent: string | null;
    dueDate: Date | null;
    startedAt: Date | null;
    submittedAt: Date | null;
    assignedToId: string | null;
    assignedById: string | null;
}>;
/**
 * Check if user can assign to another user
 */
export declare function canAssign(assignerId: string, assigneeId: string): Promise<boolean>;
/**
 * Get user's tasks
 */
export declare function getUserTasks(userId: string, filters?: {
    status?: string;
    caseId?: string;
}): Promise<({
    case: {
        id: string;
        caseNumber: string;
        clientName: string;
        matterType: string;
    };
} & {
    id: string;
    status: import(".prisma/client").$Enums.TaskStatus;
    createdAt: Date;
    updatedAt: Date;
    title: string;
    skillProfile: import("@prisma/client/runtime/library").JsonValue | null;
    description: string | null;
    priority: import(".prisma/client").$Enums.Priority;
    completedAt: Date | null;
    matterId: string | null;
    type: string | null;
    caseId: string;
    documentId: string | null;
    taskType: import(".prisma/client").$Enums.TaskType;
    skillMatch: number | null;
    requiredSkills: string[];
    workflowEvent: string | null;
    dueDate: Date | null;
    startedAt: Date | null;
    submittedAt: Date | null;
    assignedToId: string | null;
    assignedById: string | null;
})[]>;
declare const _default: {
    createTask: typeof createTask;
    getCaseTasks: typeof getCaseTasks;
    getTask: typeof getTask;
    startTask: typeof startTask;
    submitTask: typeof submitTask;
    completeTask: typeof completeTask;
    reassignTask: typeof reassignTask;
    getTaskRecommendations: typeof getTaskRecommendations;
    autoGenerateTask: typeof autoGenerateTask;
    canAssign: typeof canAssign;
    getUserTasks: typeof getUserTasks;
};
export default _default;
//# sourceMappingURL=services.d.ts.map