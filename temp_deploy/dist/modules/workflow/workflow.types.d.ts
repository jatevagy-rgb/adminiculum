/**
 * Workflow Types - Case Workflow State Machine
 *
 * Statusok és átmenetek definíciói
 */
export type WorkflowStatus = 'CLIENT_INPUT' | 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'SENT_TO_CLIENT' | 'CLIENT_FEEDBACK' | 'FINAL' | 'CLOSED';
export declare const WORKFLOW_STATUSES: WorkflowStatus[];
export declare const STATUS_TO_FOLDER: Record<WorkflowStatus, string>;
export declare const FOLDER_TO_STATUS: Record<string, WorkflowStatus>;
export declare const ALLOWED_TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]>;
export declare const STATUS_LABELS: Record<WorkflowStatus, string>;
export interface WorkflowNode {
    id: WorkflowStatus;
    label: string;
    status: 'completed' | 'current' | 'pending';
}
export interface WorkflowEdge {
    from: WorkflowStatus;
    to: WorkflowStatus;
}
export interface WorkflowGraph {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    currentStatus: WorkflowStatus;
    possibleTransitions: WorkflowStatus[];
}
export interface StatusChangeInput {
    caseId: string;
    fromStatus: WorkflowStatus;
    toStatus: WorkflowStatus;
    userId: string;
    comment?: string;
}
export interface StatusChangeResult {
    success: boolean;
    caseId: string;
    fromStatus: WorkflowStatus;
    toStatus: WorkflowStatus;
    timelineEventId?: string;
    documentsMoved: number;
    error?: string;
}
export type WorkflowEventType = 'CASE_CREATED' | 'STATUS_CHANGED' | 'DOCUMENT_UPLOADED' | 'DOCUMENT_MOVED' | 'USER_ASSIGNED' | 'REVIEW_REQUESTED' | 'APPROVED' | 'SENT_TO_CLIENT' | 'CLIENT_FEEDBACK_RECEIVED' | 'FINALIZED' | 'CLOSED';
export declare const WORKFLOW_EVENTS: WorkflowEventType[];
export type UserRole = 'ADMIN' | 'PARTNER' | 'LAWYER' | 'TRAINEE' | 'LEGAL_ASSISTANT' | 'CLIENT' | 'EXTERNAL_REVIEWER';
export declare const ROLE_ALLOWED_TRANSITIONS: Record<UserRole, WorkflowStatus[]>;
export interface WorkflowStats {
    totalCases: number;
    byStatus: Record<WorkflowStatus, number>;
    averageTimeInStatus: Record<WorkflowStatus, number>;
}
//# sourceMappingURL=workflow.types.d.ts.map