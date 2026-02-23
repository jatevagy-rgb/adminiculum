/**
 * Workflow Types - Case Workflow State Machine
 * 
 * Statusok és átmenetek definíciói
 */

// ============================================================================
// Workflow Status Enum
// ============================================================================

export type WorkflowStatus = 
  | 'CLIENT_INPUT'
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'SENT_TO_CLIENT'
  | 'CLIENT_FEEDBACK'
  | 'FINAL'
  | 'CLOSED';

export const WORKFLOW_STATUSES: WorkflowStatus[] = [
  'CLIENT_INPUT',
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'SENT_TO_CLIENT',
  'CLIENT_FEEDBACK',
  'FINAL',
  'CLOSED'
];

// ============================================================================
// Status → SharePoint Folder Mapping
// ============================================================================

export const STATUS_TO_FOLDER: Record<WorkflowStatus, string> = {
  'CLIENT_INPUT': '01_Client_Input',
  'DRAFT': '02_Drafts',
  'IN_REVIEW': '03_Review',
  'APPROVED': '04_Approved',
  'SENT_TO_CLIENT': '05_Sent_to_Client',
  'CLIENT_FEEDBACK': '06_Client_Feedback',
  'FINAL': '07_Final',
  'CLOSED': '07_Final'
};

export const FOLDER_TO_STATUS: Record<string, WorkflowStatus> = {
  '01_Client_Input': 'CLIENT_INPUT',
  '02_Drafts': 'DRAFT',
  '03_Review': 'IN_REVIEW',
  '04_Approved': 'APPROVED',
  '05_Sent_to_Client': 'SENT_TO_CLIENT',
  '06_Client_Feedback': 'CLIENT_FEEDBACK',
  '07_Final': 'FINAL'
};

// ============================================================================
// Status Transition Rules
// ============================================================================

export const ALLOWED_TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  'CLIENT_INPUT': ['DRAFT'],
  'DRAFT': ['IN_REVIEW', 'CLIENT_INPUT'],
  'IN_REVIEW': ['APPROVED', 'DRAFT'],
  'APPROVED': ['SENT_TO_CLIENT', 'IN_REVIEW'],
  'SENT_TO_CLIENT': ['CLIENT_FEEDBACK', 'FINAL', 'IN_REVIEW'],
  'CLIENT_FEEDBACK': ['FINAL', 'DRAFT', 'IN_REVIEW'],
  'FINAL': ['CLOSED'],
  'CLOSED': []
};

// ============================================================================
// Status Display Names (Hungarian)
// ============================================================================

export const STATUS_LABELS: Record<WorkflowStatus, string> = {
  'CLIENT_INPUT': 'Ügyfél adat',
  'DRAFT': 'Szerződés tervezet',
  'IN_REVIEW': 'Review',
  'APPROVED': 'Jóváhagyva',
  'SENT_TO_CLIENT': 'Elküldve ügyfélnek',
  'CLIENT_FEEDBACK': 'Ügyfél visszajelzés',
  'FINAL': 'Végleges',
  'CLOSED': 'Lezárt'
};

// ============================================================================
// Workflow Graph Types (for visualization)
// ============================================================================

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

// ============================================================================
// Status Change Event Types
// ============================================================================

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

// ============================================================================
// Workflow Event Types
// ============================================================================

export type WorkflowEventType = 
  | 'CASE_CREATED'
  | 'STATUS_CHANGED'
  | 'DOCUMENT_UPLOADED'
  | 'DOCUMENT_MOVED'
  | 'USER_ASSIGNED'
  | 'REVIEW_REQUESTED'
  | 'APPROVED'
  | 'SENT_TO_CLIENT'
  | 'CLIENT_FEEDBACK_RECEIVED'
  | 'FINALIZED'
  | 'CLOSED';

export const WORKFLOW_EVENTS: WorkflowEventType[] = [
  'CASE_CREATED',
  'STATUS_CHANGED',
  'DOCUMENT_UPLOADED',
  'DOCUMENT_MOVED',
  'USER_ASSIGNED',
  'REVIEW_REQUESTED',
  'APPROVED',
  'SENT_TO_CLIENT',
  'CLIENT_FEEDBACK_RECEIVED',
  'FINALIZED',
  'CLOSED'
];

// ============================================================================
// Role-based Transition Permissions
// ============================================================================

export type UserRole = 'ADMIN' | 'PARTNER' | 'LAWYER' | 'TRAINEE' | 'LEGAL_ASSISTANT' | 'CLIENT' | 'EXTERNAL_REVIEWER';

export const ROLE_ALLOWED_TRANSITIONS: Record<UserRole, WorkflowStatus[]> = {
  'ADMIN': [
    'CLIENT_INPUT',
    'DRAFT',
    'IN_REVIEW',
    'APPROVED',
    'SENT_TO_CLIENT',
    'CLIENT_FEEDBACK',
    'FINAL',
    'CLOSED'
  ],
  'PARTNER': [
    'CLIENT_INPUT',
    'DRAFT',
    'IN_REVIEW',
    'APPROVED',
    'SENT_TO_CLIENT',
    'CLIENT_FEEDBACK',
    'FINAL',
    'CLOSED'
  ],
  'LAWYER': [
    'DRAFT',
    'IN_REVIEW',
    'APPROVED',
    'SENT_TO_CLIENT',
    'CLIENT_FEEDBACK',
    'FINAL'
  ],
  'TRAINEE': [
    'DRAFT',
    'IN_REVIEW'
  ],
  'LEGAL_ASSISTANT': [
    'CLIENT_INPUT',
    'DRAFT',
    'IN_REVIEW',
    'CLIENT_FEEDBACK'
  ],
  'CLIENT': [
    'CLIENT_INPUT',
    'CLIENT_FEEDBACK'
  ],
  'EXTERNAL_REVIEWER': [
    'IN_REVIEW'
  ]
};

// ============================================================================
// Workflow Statistics
// ============================================================================

export interface WorkflowStats {
  totalCases: number;
  byStatus: Record<WorkflowStatus, number>;
  averageTimeInStatus: Record<WorkflowStatus, number>; // in hours
}
