export interface ReviewSafeUserDto {
  id: string;
  displayName: string;
  role: string;
}

export interface TaskReviewDecisionDto {
  id: string;
  decision: string;
  reviewer: ReviewSafeUserDto;
  note: string | null;
  requestedCorrections: string | null;
  requiresFullReview: boolean;
  correctionDeadline: string | null;
  createdAt: string;
}

export interface TaskSubmissionReviewDetailDto {
  reviewVersion: string;
  task: {
    id: string;
    title: string;
    status: string;
    priority: string;
    deadline: string | null;
    assignee: ReviewSafeUserDto | null;
  };
  matter: {
    id: string | null;
    displayName: string | null;
  };
  case: {
    id: string;
    caseNumber: string;
    displayName: string;
  };
  client: {
    id: string;
    displayName: string;
    clientColorKey: string | null;
  };
  submission: {
    id: string;
    revisionNumber: number;
    status: string;
    submittedBy: ReviewSafeUserDto | null;
    submittedAt: string | null;
    assignedReviewer: ReviewSafeUserDto;
    requestedAttention: string | null;
    externalActionRequired: boolean;
    externalActionType: string | null;
    externalCompletedAt: string | null;
    workSummary: string | null;
    remainingIssues: string | null;
    zeroTimeConfirmed: boolean;
  };
  outputs: Array<{
    id: string;
    documentId: string;
    documentVersionId: string | null;
    role: string;
    name: string;
    category: string;
    currentVersion: number;
    linkedVersion: number | null;
  }>;
  time: {
    entries: Array<{
      id: string;
      timeEntryId: string;
      workType: string;
      minutes: number;
      billable: boolean;
      workDate: string;
    }>;
    totalMinutes: number;
    billableMinutes: number;
    nonBillableMinutes: number;
  };
  history: Array<{
    id: string;
    revisionNumber: number;
    status: string;
    submittedAt: string | null;
    returnedAt: string | null;
    approvedAt: string | null;
    supersedesSubmissionId: string | null;
    decision: TaskReviewDecisionDto | null;
  }>;
  decision: TaskReviewDecisionDto | null;
  permittedActions: {
    read: boolean;
    return: boolean;
    approve: boolean;
    revise: boolean;
    recordExternalCompletion: boolean;
  };
  nextActionCode: string;
}

export interface ReturnSubmissionInput {
  note: unknown;
  requestedCorrections: unknown;
  requiresFullReview: unknown;
  correctionDeadline?: unknown;
}

export interface ApproveSubmissionInput {
  note?: unknown;
}

export interface ExternalCompletionInput {
  completedAt?: unknown;
  actionType: unknown;
}

export interface ReviewMutationResult {
  idempotentReplay: boolean;
  review: TaskSubmissionReviewDetailDto;
}

export interface ReviseSubmissionResult {
  idempotentReplay: boolean;
  draft: {
    id: string;
    taskId: string;
    revisionNumber: number;
    status: string;
    supersedesSubmissionId: string;
    assignedReviewerId: string;
    requestedAttention: string | null;
    externalActionRequired: boolean;
    externalActionType: string | null;
  };
}
