import { ApiError, fetchApi } from "./api";
import type { ClientColorKey } from "./clientColors";

export type SubmissionReadinessCode =
  | "WORK_SUMMARY_REQUIRED"
  | "REVIEW_ATTENTION_REQUIRED"
  | "REVIEWER_REQUIRED"
  | "REVIEWER_INELIGIBLE"
  | "SELF_REVIEW_NOT_ALLOWED"
  | "OUTPUT_REQUIRED"
  | "TIME_ENTRY_OR_ZERO_CONFIRMATION_REQUIRED"
  | "TASK_STATE_NOT_SUBMITTABLE"
  | "SUBMISSION_NOT_DRAFT"
  | "DOCUMENT_SCOPE_INVALID"
  | "TIME_ENTRY_SCOPE_INVALID";

export type SubmissionWarningCode = "ZERO_TIME_CONFIRMED";

export interface SafeWorkflowUser {
  id: string;
  displayName: string;
  role: string;
}

export interface TaskSubmissionDocument {
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

export interface TaskSubmissionTimeEntry {
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

export interface TaskReviewDecision {
  id: string;
  decision: string;
  reviewer: SafeWorkflowUser;
  note: string | null;
  requestedCorrections: string | null;
  requiresFullReview: boolean;
  correctionDeadline: string | null;
  createdAt: string;
}

export interface TaskSubmission {
  id: string;
  taskId: string;
  revisionNumber: number;
  status: string;
  createdBy: SafeWorkflowUser;
  submittedBy: SafeWorkflowUser | null;
  assignedReviewer: SafeWorkflowUser;
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
  reviewDecision: TaskReviewDecision | null;
  documents: TaskSubmissionDocument[];
  timeEntries: TaskSubmissionTimeEntry[];
  documentCount: number;
  linkedTimeMinutes: number;
}

export interface SubmissionReadiness {
  ready: boolean;
  missingPrerequisites: SubmissionReadinessCode[];
  blockingErrors: SubmissionReadinessCode[];
  warnings: SubmissionWarningCode[];
}

export interface TaskSubmissionWorkflow {
  task: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    dueDate: string | null;
    caseId: string;
    matterId: string | null;
    assignee: SafeWorkflowUser | null;
    case: {
      id: string;
      caseNumber: string;
      title: string;
      client: { id: string; name: string };
    };
  };
  activeDraft: TaskSubmission | null;
  submissions: TaskSubmission[];
  latestSubmittedRevision: TaskSubmission | null;
  latestDecision: TaskReviewDecision | null;
  currentReviewer: SafeWorkflowUser | null;
  readiness: SubmissionReadiness | null;
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

export interface EligibleReviewer extends SafeWorkflowUser {
  preference:
    | "TASK_SUPERVISOR"
    | "CASE_RESPONSIBLE_LAWYER"
    | "CASE_CREATOR"
    | "CASE_COLLABORATOR"
    | "PRIVILEGED";
}

export interface TaskLifecycleListItem {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  dueDate?: string | null;
  matterId?: string | null;
  assignedToId?: string | null;
  sourceCommunicationId?: string | null;
  case: {
    id: string;
    caseNumber: string;
    clientName: string;
    matterType: string;
    title?: string;
    clientId?: string;
    clientColorKey?: ClientColorKey | null;
  };
  activeSubmissionId?: string | null;
  currentSubmittedRevisionId?: string | null;
  approvedRevisionId?: string | null;
  submissionStatus?: string | null;
  submissionRevision?: number | null;
  submittedAt?: string | null;
  assignedReviewer?: SafeWorkflowUser | null;
  requestedAttention?: string | null;
  latestDecisionType?: string | null;
  latestDecisionAt?: string | null;
  returnedCorrectionDeadline?: string | null;
  externalActionRequired?: boolean;
  externalActionType?: string | null;
  externalCompletedAt?: string | null;
  submissionDocumentCount?: number;
  linkedTimeMinutes?: number;
  nextActionCode: string;
}

export interface TaskReviewQueueItem {
  id: string;
  source: "TASK_SUBMISSION" | "LEGACY_TASK";
  taskId: string;
  submissionId?: string;
  revisionNumber?: number;
  title: string;
  status: string;
  taskStatus?: string;
  priority: string;
  dueDate?: string | null;
  submittedAt?: string | null;
  submittedBy?: SafeWorkflowUser | null;
  assignedReviewer?: SafeWorkflowUser | null;
  requestedAttention?: string | null;
  externalActionRequired?: boolean;
  workSummaryPreview?: string | null;
  submissionDocumentCount?: number;
  linkedTimeMinutes?: number;
  nextActionCode: string;
  case: {
    id: string;
    caseNumber: string;
    title?: string;
    clientId?: string;
    clientName: string;
    clientColorKey?: ClientColorKey | null;
    matterType: string;
  };
}

export interface TaskSubmissionReviewDetail {
  reviewVersion: string;
  task: {
    id: string;
    title: string;
    status: string;
    priority: string;
    deadline: string | null;
    assignee: SafeWorkflowUser | null;
  };
  matter: { id: string | null; displayName: string | null };
  case: { id: string; caseNumber: string; displayName: string };
  client: { id: string; displayName: string; clientColorKey?: ClientColorKey | null };
  submission: {
    id: string;
    revisionNumber: number;
    status: string;
    submittedBy: SafeWorkflowUser | null;
    submittedAt: string | null;
    assignedReviewer: SafeWorkflowUser;
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
    decision: TaskReviewDecision | null;
  }>;
  decision: TaskReviewDecision | null;
  permittedActions: {
    read: boolean;
    return: boolean;
    approve: boolean;
    revise: boolean;
    recordExternalCompletion: boolean;
  };
  nextActionCode: string;
}

export interface UpdateTaskSubmissionDraftInput {
  workSummary?: string | null;
  remainingIssues?: string | null;
  reviewerNote?: string | null;
  requestedAttention?: string | null;
  assignedReviewerId?: string;
  externalActionRequired?: boolean;
  externalActionType?: string | null;
  zeroTimeConfirmed?: boolean;
}

export interface ReviewMutationResult {
  idempotentReplay: boolean;
  review: TaskSubmissionReviewDetail;
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

function encoded(value: string): string {
  return encodeURIComponent(value);
}

export function createIdempotencyKey(operation: string): string {
  const randomPart = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `adm-${operation}-${randomPart}`.slice(0, 128);
}

export class StableMutationAttempt {
  private keyValue: string | null = null;

  constructor(private readonly operation: string) {}

  begin(): string {
    this.keyValue = createIdempotencyKey(this.operation);
    return this.keyValue;
  }

  key(): string {
    return this.keyValue || this.begin();
  }

  complete(): void {
    this.keyValue = null;
  }
}

export function isUncertainMutationError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 0;
}

export function isStaleReviewError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 412 || error.code === "REVIEW_VERSION_STALE");
}

export async function listTaskLifecycleItems(): Promise<TaskLifecycleListItem[]> {
  return fetchApi<TaskLifecycleListItem[]>("/tasks");
}

export async function readTaskSubmissionWorkflow(taskId: string): Promise<TaskSubmissionWorkflow> {
  return fetchApi<TaskSubmissionWorkflow>(`/tasks/${encoded(taskId)}/workflow`);
}

export async function createTaskSubmissionDraft(taskId: string, assignedReviewerId?: string): Promise<TaskSubmissionWorkflow> {
  return fetchApi<TaskSubmissionWorkflow>(`/tasks/${encoded(taskId)}/submissions`, {
    method: "POST",
    body: JSON.stringify(assignedReviewerId ? { assignedReviewerId } : {}),
  });
}

export async function updateTaskSubmissionDraft(
  taskId: string,
  submissionId: string,
  input: UpdateTaskSubmissionDraftInput,
): Promise<TaskSubmissionWorkflow> {
  return fetchApi<TaskSubmissionWorkflow>(`/tasks/${encoded(taskId)}/submissions/${encoded(submissionId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function listEligibleTaskReviewers(taskId: string): Promise<EligibleReviewer[]> {
  return fetchApi<EligibleReviewer[]>(`/tasks/${encoded(taskId)}/eligible-reviewers`);
}

export async function readTaskSubmissionReadiness(taskId: string, submissionId: string): Promise<SubmissionReadiness> {
  return fetchApi<SubmissionReadiness>(`/tasks/${encoded(taskId)}/submissions/${encoded(submissionId)}/readiness`);
}

export async function attachTaskSubmissionDocument(
  taskId: string,
  submissionId: string,
  documentId: string,
  role: string,
): Promise<TaskSubmissionWorkflow> {
  return fetchApi<TaskSubmissionWorkflow>(`/tasks/${encoded(taskId)}/submissions/${encoded(submissionId)}/documents`, {
    method: "POST",
    body: JSON.stringify({ documentId, role }),
  });
}

export async function detachTaskSubmissionDocument(
  taskId: string,
  submissionId: string,
  documentId: string,
): Promise<TaskSubmissionWorkflow> {
  return fetchApi<TaskSubmissionWorkflow>(`/tasks/${encoded(taskId)}/submissions/${encoded(submissionId)}/documents/${encoded(documentId)}`, {
    method: "DELETE",
  });
}

export async function attachTaskSubmissionTimeEntry(
  taskId: string,
  submissionId: string,
  timeEntryId: string,
): Promise<TaskSubmissionWorkflow> {
  return fetchApi<TaskSubmissionWorkflow>(`/tasks/${encoded(taskId)}/submissions/${encoded(submissionId)}/time-entries`, {
    method: "POST",
    body: JSON.stringify({ timeEntryId }),
  });
}

export async function detachTaskSubmissionTimeEntry(
  taskId: string,
  submissionId: string,
  timeEntryId: string,
): Promise<TaskSubmissionWorkflow> {
  return fetchApi<TaskSubmissionWorkflow>(`/tasks/${encoded(taskId)}/submissions/${encoded(submissionId)}/time-entries/${encoded(timeEntryId)}`, {
    method: "DELETE",
  });
}

export async function submitTaskSubmissionForReview(
  taskId: string,
  submissionId: string,
  idempotencyKey: string,
): Promise<{ idempotentReplay: boolean; submission: TaskSubmission; workflow: TaskSubmissionWorkflow }> {
  return fetchApi(`/tasks/${encoded(taskId)}/submissions/${encoded(submissionId)}/submit`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({}),
  });
}

export async function listTaskReviewQueue(): Promise<TaskReviewQueueItem[]> {
  return fetchApi<TaskReviewQueueItem[]>("/tasks/review-queue");
}

export async function readTaskSubmissionReview(taskId: string, submissionId: string): Promise<TaskSubmissionReviewDetail> {
  return fetchApi<TaskSubmissionReviewDetail>(`/tasks/${encoded(taskId)}/submissions/${encoded(submissionId)}/review`, {
    cache: "no-store",
  });
}

export async function returnTaskSubmission(
  taskId: string,
  submissionId: string,
  reviewVersion: string,
  idempotencyKey: string,
  input: { note: string; requestedCorrections: string; requiresFullReview: boolean; correctionDeadline?: string },
): Promise<ReviewMutationResult> {
  return fetchApi(`/tasks/${encoded(taskId)}/submissions/${encoded(submissionId)}/return`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey, "If-Match": `"${reviewVersion}"` },
    body: JSON.stringify(input),
  });
}

export async function reviseTaskSubmission(
  taskId: string,
  submissionId: string,
  idempotencyKey: string,
): Promise<ReviseSubmissionResult> {
  return fetchApi(`/tasks/${encoded(taskId)}/submissions/${encoded(submissionId)}/revise`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({}),
  });
}

export async function approveTaskSubmission(
  taskId: string,
  submissionId: string,
  reviewVersion: string,
  idempotencyKey: string,
  note?: string,
): Promise<ReviewMutationResult> {
  return fetchApi(`/tasks/${encoded(taskId)}/submissions/${encoded(submissionId)}/approve`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey, "If-Match": `"${reviewVersion}"` },
    body: JSON.stringify(note?.trim() ? { note } : {}),
  });
}

export async function recordTaskExternalCompletion(
  taskId: string,
  submissionId: string,
  idempotencyKey: string,
  input: { actionType: string; completedAt?: string },
): Promise<ReviewMutationResult> {
  return fetchApi(`/tasks/${encoded(taskId)}/submissions/${encoded(submissionId)}/external-completion`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
}
