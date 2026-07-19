export type SubmissionReadinessCode =
  | 'WORK_SUMMARY_REQUIRED'
  | 'REVIEW_ATTENTION_REQUIRED'
  | 'REVIEWER_REQUIRED'
  | 'REVIEWER_INELIGIBLE'
  | 'SELF_REVIEW_NOT_ALLOWED'
  | 'OUTPUT_REQUIRED'
  | 'TIME_ENTRY_OR_ZERO_CONFIRMATION_REQUIRED'
  | 'TASK_STATE_NOT_SUBMITTABLE'
  | 'SUBMISSION_NOT_DRAFT'
  | 'DOCUMENT_SCOPE_INVALID'
  | 'TIME_ENTRY_SCOPE_INVALID';

export type SubmissionWarningCode = 'ZERO_TIME_CONFIRMED';

export interface SafeUserDto {
  id: string;
  displayName: string;
  role: string;
}

export interface TaskSubmissionDocumentDto {
  id: string;
  documentId: string;
  documentVersionId: string | null;
  role: string;
  createdAt: string;
  document: {
    id: string;
    name: string;
    category: string;
    currentVersion: number;
  };
}

export interface TaskSubmissionTimeEntryDto {
  id: string;
  timeEntryId: string;
  createdAt: string;
  timeEntry: {
    id: string;
    workType: string;
    minutes: number;
    billable: boolean;
    workDate: string;
    taskId: string | null;
    matterId: string;
  };
}

export interface TaskSubmissionDto {
  id: string;
  taskId: string;
  revisionNumber: number;
  status: string;
  createdBy: SafeUserDto;
  submittedBy: SafeUserDto | null;
  assignedReviewer: SafeUserDto;
  workSummary: string | null;
  remainingIssues: string | null;
  reviewerNote: string | null;
  requestedAttention: string | null;
  externalActionRequired: boolean;
  externalActionType: string | null;
  zeroTimeConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  returnedAt: string | null;
  approvedAt: string | null;
  supersededAt: string | null;
  externalCompletedAt: string | null;
  reviewDecision: {
    id: string;
    decision: string;
    reviewer: SafeUserDto;
    note: string | null;
    requestedCorrections: string | null;
    requiresFullReview: boolean;
    correctionDeadline: string | null;
    createdAt: string;
  } | null;
  documents: TaskSubmissionDocumentDto[];
  timeEntries: TaskSubmissionTimeEntryDto[];
  documentCount: number;
  linkedTimeMinutes: number;
}

export interface SubmissionReadinessDto {
  ready: boolean;
  missingPrerequisites: SubmissionReadinessCode[];
  blockingErrors: SubmissionReadinessCode[];
  warnings: SubmissionWarningCode[];
}

export interface TaskSubmissionWorkflowDto {
  task: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    dueDate: string | null;
    caseId: string;
    matterId: string | null;
    assignee: SafeUserDto | null;
    case: {
      id: string;
      caseNumber: string;
      title: string;
      client: { id: string; name: string };
    };
  };
  activeDraft: TaskSubmissionDto | null;
  submissions: TaskSubmissionDto[];
  latestSubmittedRevision: TaskSubmissionDto | null;
  latestDecision: TaskSubmissionDto['reviewDecision'];
  currentReviewer: SafeUserDto | null;
  readiness: SubmissionReadinessDto | null;
  permittedActions: {
    read: boolean;
    createDraft: boolean;
    editDraft: boolean;
    attachDocument: boolean;
    attachTimeEntry: boolean;
    assignReviewer: boolean;
    submit: boolean;
    reviewSubmitted: boolean;
    reviseReturned: boolean;
    recordExternalCompletion: boolean;
  };
  nextActionCode: string;
}

export interface EligibleReviewerDto extends SafeUserDto {
  preference: 'TASK_SUPERVISOR' | 'CASE_RESPONSIBLE_LAWYER' | 'CASE_CREATOR' | 'CASE_COLLABORATOR' | 'PRIVILEGED';
}

export interface CreateDraftInput {
  assignedReviewerId?: string;
}

export interface UpdateDraftInput {
  workSummary?: string | null;
  remainingIssues?: string | null;
  reviewerNote?: string | null;
  requestedAttention?: string | null;
  assignedReviewerId?: string;
  externalActionRequired?: boolean;
  externalActionType?: string | null;
  zeroTimeConfirmed?: boolean;
}

export interface AttachDocumentInput {
  documentId: string;
  role: string;
}

export interface AttachTimeEntryInput {
  timeEntryId: string;
}
