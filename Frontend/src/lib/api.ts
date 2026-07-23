// Simple API utility for Adminiculum frontend

import type { ClientColorKey } from './clientColors';
import type { AttentionCategory } from './attentionCategory';

// Use canonical env var for backend base URL, keep legacy fallback for compatibility.
// Values should be host roots (e.g. http://localhost:3001), API_BASE appends /api/v1.
const backendBaseUrl =
  process.env.NEXT_PUBLIC_BACKEND_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL;

const normalizedBackendBaseUrl = backendBaseUrl
  ? backendBaseUrl.replace(/\/+$/, '').replace(/\/api\/v1$/i, '')
  : '';

const API_BASE = normalizedBackendBaseUrl
  ? `${normalizedBackendBaseUrl}/api/v1`
  : '/api/v1';

export interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
  suppressErrorStatuses?: number[];
  suppressErrorLogging?: boolean;
  waitForAuthMs?: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public endpoint?: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const AUTH_TOKEN_KEY = 'auth_token';
const AUTH_TOKEN_EVENT = 'adminiculum:auth-token-updated';
const DEFAULT_AUTH_WAIT_MS = 3000;

function readAuthToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
}

async function waitForAuthToken(timeoutMs = DEFAULT_AUTH_WAIT_MS): Promise<string | null> {
  const immediate = readAuthToken();
  if (immediate) return immediate;
  if (typeof window === 'undefined' || timeoutMs <= 0) return null;

  return await new Promise<string | null>((resolve) => {
    const startedAt = Date.now();

    const finish = (token: string | null) => {
      window.removeEventListener(AUTH_TOKEN_EVENT, onTokenEvent as EventListener);
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
      resolve(token);
    };

    const checkNow = () => {
      const token = readAuthToken();
      if (token) {
        finish(token);
      } else if (Date.now() - startedAt >= timeoutMs) {
        finish(null);
      }
    };

    const onTokenEvent = () => checkNow();
    window.addEventListener(AUTH_TOKEN_EVENT, onTokenEvent as EventListener);

    const pollTimer = window.setInterval(checkNow, 150);
    const timeoutTimer = window.setTimeout(() => finish(null), timeoutMs + 50);
  });
}

export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  window.dispatchEvent(new Event(AUTH_TOKEN_EVENT));
}

export function clearAuthToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  window.dispatchEvent(new Event(AUTH_TOKEN_EVENT));
}

function asErrorPayload(value: unknown): { code?: string; message?: string; error?: string } {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  return {
    code: typeof record.code === 'string' ? record.code : undefined,
    message: typeof record.message === 'string' ? record.message : undefined,
    error: typeof record.error === 'string' ? record.error : undefined,
  };
}

export async function fetchApi<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { skipAuth, suppressErrorStatuses, suppressErrorLogging, waitForAuthMs, ...fetchOptions } = options;
  
  const token = skipAuth ? null : await waitForAuthToken(waitForAuthMs ?? DEFAULT_AUTH_WAIT_MS);
  if (!skipAuth && !token) {
    throw new ApiError(401, 'Authentication token unavailable', endpoint);
  }
  const hasBody = fetchOptions.body !== undefined && fetchOptions.body !== null;
  const isFormData = typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData;
  const customHeaders = fetchOptions.headers || {};
  
  const headers: HeadersInit = {
    ...(hasBody && !isFormData ? { 'Content-Type': 'application/json' } : {}),
    'Accept': 'application/json',
    ...(token && !skipAuth ? { 'Authorization': `Bearer ${token}` } : {}),
    ...customHeaders,
  };

  const url = `${API_BASE}${endpoint}`;
  
  // Log request in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`[API] ${fetchOptions.method || 'GET'} ${url}`);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...fetchOptions,
      headers,
    });
  } catch (networkError) {
    console.error(`[API] Network error calling ${url}:`, networkError);
    throw new ApiError(0, 'A művelet nem érhető el. Ellenőrizd a kapcsolatot vagy próbáld újra.', endpoint);
  }

  if (!response.ok) {
    let errorMessage = `HTTP error ${response.status}`;
    let errorDetails: unknown = null;
    let errorCode: string | undefined;
    
    try {
      errorDetails = await response.json();
      const payload = asErrorPayload(errorDetails);
      errorCode = payload.code;
      errorMessage = payload.message || payload.error || errorMessage;
    } catch {
      // Not JSON - try to get raw text
      try {
        const rawText = await response.text();
        if (rawText) {
          errorMessage = rawText.substring(0, 200); // Limit length
        }
      } catch {
        // Could not read response
      }
    }
    
    const shouldLogError =
      !suppressErrorLogging &&
      !(Array.isArray(suppressErrorStatuses) && suppressErrorStatuses.includes(response.status));
    if (shouldLogError) {
      console.error(`[API] Error calling ${url}:`, {
        status: response.status,
        message: errorMessage,
        details: errorDetails
      });
    }
    
    throw new ApiError(response.status, errorMessage, endpoint, errorCode);
  }

  // Log successful response in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`[API] Success: ${url}`);
  }

  // Some endpoints legitimately return empty body (e.g. 204 No Content)
  if (response.status === 204 || response.status === 205 || (fetchOptions.method || 'GET').toUpperCase() === 'HEAD') {
    return undefined as T;
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength === '0') {
    return undefined as T;
  }

  const text = await response.text();
  if (!text || text.trim().length === 0) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text) as T;
    } catch {
      // Avoid hard crash on malformed/empty-ish JSON responses on navigation/dashboard paths.
      // Returning raw text keeps the caller flow resilient while still surfacing backend issues via logs.
      return (text as unknown) as T;
    }
  }

  return (text as unknown) as T;
}

// Dashboard Stats
export interface DashboardStats {
  stats: {
    totalCases: number;
    inReview: number;
    pendingClient: number;
    completedThisMonth: number;
  };
  recentActivity: Array<{
    id: string;
    type: string;
    text: string;
    timestamp: string;
    caseId?: string;
    taskId?: string;
    documentId?: string;
    href?: string;
  }>;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return fetchApi<DashboardStats>('/cases/dashboard/stats');
}

export type DashboardOperationalGroupCode =
  | 'DEADLINE_APPROACHING'
  | 'OFFICE_ACTION'
  | 'REVIEW'
  | 'CLIENT_WAITING'
  | 'UNSPECIFIED';

export interface DashboardOperationalOverview {
  generatedAt: string;
  resume: {
    item: null | {
      id: string;
      taskId: string;
      submissionId: string | null;
      title: string;
      status: string;
      nextActionCode: 'START_TASK' | 'OPEN_TASK' | 'CONTINUE_SUBMISSION' | 'OPEN_REVIEW' | 'CONTINUE_RETURNED_WORK' | 'RECORD_EXTERNAL_COMPLETION';
      actionLabel: string;
      href: string;
      dueAt: string | null;
      case: {
        id: string;
        caseNumber: string;
        title: string;
        client: { id: string; displayName: string; clientColorKey: ClientColorKey | null };
      };
    };
  };
  summary: { openCaseCount: number };
  groups: Array<{ code: DashboardOperationalGroupCode; label: string; count: number }>;
  attentionWorkload?: {
    categories: Array<{
      attentionCategory: AttentionCategory;
      count: number;
      minMinutes: number;
      maxMinutes: number;
      nearestDeadline: string | null;
    }>;
    unclassified: {
      count: number;
      nearestDeadline: string | null;
    };
  };
  items: Array<{
    id: string;
    caseNumber: string;
    title: string;
    client: { id: string; displayName: string; clientColorKey: ClientColorKey | null };
    responsible: { id: string; displayName: string } | null;
    status: string;
    priority: string;
    groupCode: DashboardOperationalGroupCode;
    groupLabel: string;
    waitingLabel: string;
    nearestDeadline: string | null;
    overdue: boolean;
    openTaskCount: number;
    reviewCount: number;
    oldestOpenActivityAt: string;
    nextAction: { code: string; label: string; href: string };
    openHref: string;
  }>;
}

export async function getDashboardOperationalOverview(): Promise<DashboardOperationalOverview> {
  return fetchApi<DashboardOperationalOverview>('/cases/dashboard/operational-overview', { cache: 'no-store' });
}

export interface NewsFeedItem {
  title: string;
  source: string;
  date: string;
  url?: string;
  description?: string;
}

export interface NewsFeedResult {
  articles: NewsFeedItem[];
  error?: string;
  isLoading?: boolean;
}

export async function getNewsFeed(category: 'legal' | 'ecofin'): Promise<NewsFeedResult> {
  return fetchApi<NewsFeedResult>(`/news-feed/${category}`);
}

// Cases
export interface CaseListItem {
  id: string;
  caseNumber: string;
  title: string;
  clientName: string;
  matterType: string;
  status: string;
  priority: string;
  deadline: string | null;
  clientRole?: string | null;
  clientColorKey?: ClientColorKey | null;
  createdAt: string;
  updatedAt: string;
  clientId?: string;
  assignedLawyer?: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
  collaboratorCount?: number;
}

export interface CasesResponse {
  data: CaseListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

// Case workspace overview read projection (GET /cases/:caseId/workspace).
export interface CaseWorkspace {
  case: {
    id: string; caseNumber: string; title: string; status: string; priority: string;
    client: { id: string; name: string; colorKey: string | null } | null;
    assignedLawyer: { id: string; name: string } | null;
    description: string | null; nextStep: string | null;
    createdAt: string | null; updatedAt: string | null;
  };
  metrics: {
    openTaskCount: number; documentCount: number; openDeadlineCount: number;
    communicationCount: number; reviewCount: number | null; loggedMinutes: number | null;
  };
  tasks: Array<{ id: string; title: string; status: string; priority: string; attentionCategory: string | null; estimatedMinutes: number | null; dueDate: string | null; assignee: { id: string; name: string } | null; documentId: string | null }>;
  documents: Array<{ id: string; fileName: string; mimeType: string | null; type: string | null; category: string | null; version: string | null; uploadedAt: string | null; uploadedBy: { id: string; name: string } | null; summary: string | null; commentCount: number | null }>;
  deadlines: Array<{ id: string; title: string; dueAt: string | null; status: string; assignee: { id: string; name: string } | null; taskId: string | null; documentId: string | null }>;
  time: { available: true; loggedMinutes: number; billableMinutes: number | null } | { available: false; reason: string };
  communications: Array<{ id: string; type: string; subject: string | null; contentPreview: string | null; sender: string | null; timestamp: string | null; internal: boolean; taskId: string | null; documentId: string | null }>;
  activity: Array<{ id: string; actor: string | null; actionLabel: string; objectLabel: string; occurredAt: string; objectType: string; objectId: string | null }>;
  comments: Array<{ id: string; author: { id: string; name: string } | null; content: string; status: 'OPEN' | 'RESOLVED'; createdAt: string | null }>;
  warnings: Array<{ section: string; code: string; message: string }>;
}

export async function getCaseWorkspace(caseId: string): Promise<CaseWorkspace> {
  return fetchApi<CaseWorkspace>(`/cases/${encodeURIComponent(caseId)}/workspace`, { cache: 'no-store' });
}

// ---- Case-level internal notes (Comment model, caseId set) ----
export interface CaseCommentDto {
  id: string;
  caseId: string;
  author: { id: string; displayName: string };
  content: string;
  status: 'OPEN' | 'RESOLVED';
  createdAt: string;
  updatedAt: string | null;
  capabilities: { canResolve: boolean; canReopen: boolean; canDelete: false };
}
export interface CaseCommentsResponse {
  comments: CaseCommentDto[];
  pagination: { limit: number; offset: number };
}
export async function getCaseComments(caseId: string, params: { limit?: number; offset?: number } = {}): Promise<CaseCommentsResponse> {
  const search = new URLSearchParams();
  if (params.limit != null) search.set('limit', String(params.limit));
  if (params.offset != null) search.set('offset', String(params.offset));
  const qs = search.toString();
  return fetchApi<CaseCommentsResponse>(`/cases/${encodeURIComponent(caseId)}/comments${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
}
export async function createCaseComment(caseId: string, content: string): Promise<CaseCommentDto> {
  return fetchApi<CaseCommentDto>(`/cases/${encodeURIComponent(caseId)}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}
export async function resolveCaseComment(caseId: string, commentId: string): Promise<CaseCommentDto> {
  return fetchApi<CaseCommentDto>(`/cases/${encodeURIComponent(caseId)}/comments/${encodeURIComponent(commentId)}/resolve`, { method: 'POST' });
}
export async function reopenCaseComment(caseId: string, commentId: string): Promise<CaseCommentDto> {
  return fetchApi<CaseCommentDto>(`/cases/${encodeURIComponent(caseId)}/comments/${encodeURIComponent(commentId)}/reopen`, { method: 'POST' });
}

// ---- General task detail update (PATCH /tasks/:id) ----
export interface UpdateTaskDetailsData {
  title?: string;
  description?: string | null;
  priority?: string;
  dueDate?: string | null;
  assignedToId?: string | null;
  attentionCategory?: string | null;
  estimatedMinutes?: number | null;
}
export async function updateTask(taskId: string, patch: UpdateTaskDetailsData): Promise<TaskItem> {
  return fetchApi<TaskItem>(`/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function getCases(page = 1, limit = 50, assignedLawyerId?: string, clientId?: string): Promise<CasesResponse> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));
  if (assignedLawyerId) {
    params.set('assignedLawyerId', assignedLawyerId);
  }
  if (clientId) {
    params.set('clientId', clientId);
  }
  return fetchApi<CasesResponse>(`/cases?${params.toString()}`);
}

export async function getCaseById(caseId: string): Promise<CaseListItem> {
  return fetchApi<CaseListItem>(`/cases/${caseId}`);
}

export type CaseWorkflowNextActionKind =
  | 'OVERDUE_TASK'
  | 'HANDOFF_REVIEW'
  | 'DOCUMENT_REVIEW'
  | 'DUE_SOON_TASK'
  | 'UPCOMING_DEADLINE'
  | 'BLOCKED_ITEM'
  | 'OPEN_TASK';

export interface CaseWorkflowSummary {
  caseId: string;
  generatedAt: string;
  case: {
    displayName: string;
    reference?: string | null;
    status?: string | null;
    clientRole?: string | null;
    updatedAt?: string | null;
  };
  nextAction: {
    kind: CaseWorkflowNextActionKind;
    title: string;
    explanation: string;
    dueAt?: string | null;
    sourceType: 'TASK' | 'DEADLINE' | 'DOCUMENT_REVIEW' | 'HANDOFF';
    sourceId?: string | null;
    href?: string | null;
    scope: 'MY_WORK' | 'CASE';
  } | null;
  waitingOn: {
    category: 'CLIENT' | 'COUNTERPARTY' | 'AUTHORITY' | 'INTERNAL' | 'UNKNOWN';
    label: string;
    since?: string | null;
    sourceType?: string | null;
    sourceId?: string | null;
  } | null;
  nextDeadline: {
    id: string;
    title: string;
    dueAt: string;
    urgency: 'OVERDUE' | 'TODAY' | 'SOON' | 'LATER';
    href?: string | null;
  } | null;
  taskStats: {
    open: number;
    overdue: number;
    dueSoon: number;
    blocked: number;
    review: number;
  };
  latestCommunication: {
    id: string;
    subject?: string | null;
    contentPreview?: string | null;
    occurredAt?: string | null;
    direction?: string | null;
    attachmentCount?: number;
    sourceTaskCount?: number;
    href?: string | null;
  } | null;
  activeReview: {
    id: string;
    documentId?: string | null;
    displayName: string;
    status?: string | null;
    responsibleName?: string | null;
    updatedAt?: string | null;
    href?: string | null;
  } | null;
  responsibility: {
    responsibleLawyer?: {
      id: string;
      displayName: string;
    } | null;
    collaborators: Array<{
      id: string;
      displayName: string;
      role?: string | null;
    }>;
  };
  handoff: {
    id: string;
    status: string;
    fromName?: string | null;
    toName?: string | null;
    updatedAt?: string | null;
    href?: string | null;
  } | null;
  availability: {
    tasks: boolean;
    deadlines: boolean;
    communications: boolean;
    reviews: boolean;
    collaborators: boolean;
    handoff: boolean;
  };
}

export async function getCaseWorkflowSummary(caseId: string): Promise<CaseWorkflowSummary> {
  return fetchApi<CaseWorkflowSummary>(`/cases/${caseId}/workflow-summary`);
}

export interface CaseResponsibilityResponse {
  case: {
    id: string;
    caseNumber: string;
    title: string;
    status: string;
    deadline: string | null;
    matterId: string | null;
  };
  responsibleLawyer: { id: string; name: string | null; email: string | null; role: string | null } | null;
  createdBy: { id: string; name: string | null; email: string | null; role: string | null } | null;
  collaborators: CaseCollaborator[];
  work: {
    openTaskCount: number;
    overdueTaskCount: number;
    dueSoonTaskCount: number;
    reviewTaskCount: number;
    blockedTaskCount: number;
    assignedPeople: Array<{
      user: { id: string; name: string | null; email: string | null; role: string | null };
      openTaskCount: number;
      overdueTaskCount: number;
      dueSoonTaskCount: number;
    }>;
  };
  time: {
    supported: boolean;
    matterId: string | null;
    totalMinutes: number | null;
    currentUserMinutes: number;
    activeTimerSupported: boolean;
  };
  capabilities: {
    canChangeResponsibleLawyer: boolean;
    canAddCollaborator: boolean;
    canRemoveCollaborator: boolean;
    canChangeCollaboratorRole: boolean;
    canAssignWork: boolean;
    canRecordTime: boolean;
    canViewCaseTime: boolean;
    canViewTeamWorkload: boolean;
  };
}

export async function getCaseResponsibility(caseId: string): Promise<CaseResponsibilityResponse> {
  return fetchApi<CaseResponsibilityResponse>(`/cases/${caseId}/responsibility`);
}

export interface CaseWorkItemCapabilities {
  canStart: boolean;
  canComplete: boolean;
  canBlock: boolean;
  canUnblock: boolean;
  canSubmitForReview: boolean;
  canApprove: boolean;
  canReturnForCorrection: boolean;
  canCreateHandoff: boolean;
  canAcceptHandoff: boolean;
  canReturnHandoff: boolean;
  canOpenSource: boolean;
}

export interface CaseWorkItem {
  id: string;
  type: 'TASK' | 'REVIEW' | 'HANDOFF' | 'DOCUMENT' | 'COMMUNICATION';
  title: string;
  safeDescription?: string | null;
  status: string;
  workflowCategory: 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'WAITING' | 'REVIEW' | 'HANDOFF' | 'COMPLETED';
  priority?: string | null;
  dueAt?: string | null;
  completedAt?: string | null;
  updatedAt?: string | null;
  caseId: string;
  isMine: boolean;
  assignee?: { id: string; displayName: string } | null;
  createdBy?: { id: string; displayName: string } | null;
  review?: {
    reviewer?: { id: string; displayName: string } | null;
    state?: string | null;
    requestedAt?: string | null;
    reviewedAt?: string | null;
  } | null;
  handoff?: {
    id: string;
    status: string;
    from?: { id: string; displayName: string } | null;
    to?: { id: string; displayName: string } | null;
    updatedAt?: string | null;
  } | null;
  blocker?: {
    category?: string | null;
    safeLabel?: string | null;
    since?: string | null;
  } | null;
  source?: {
    type?: 'DOCUMENT' | 'COMMUNICATION' | 'DEADLINE' | 'CASE' | null;
    id?: string | null;
    displayName?: string | null;
    href?: string | null;
  } | null;
  urgency: 'OVERDUE' | 'TODAY' | 'SOON' | 'LATER' | 'NONE';
  capabilities: CaseWorkItemCapabilities;
  href?: string | null;
}

export interface CaseWorkItemsResponse {
  caseId: string;
  generatedAt: string;
  summary: {
    open: number;
    mine: number;
    overdue: number;
    dueSoon: number;
    blocked: number;
    waiting: number;
    reviewRequired: number;
    handoffRequired: number;
    completedRecently: number;
  };
  items: CaseWorkItem[];
  availability: {
    taskTransitions: boolean;
    blockerState: boolean;
    waitingState: boolean;
    reviewWorkflow: boolean;
    handoffWorkflow: boolean;
  };
}

export async function getCaseWorkItems(caseId: string): Promise<CaseWorkItemsResponse> {
  return fetchApi<CaseWorkItemsResponse>(`/cases/${caseId}/work-items`);
}

export interface CaseActivityItem {
  id: string;
  kind: 'TASK' | 'DOCUMENT' | 'COMMUNICATION' | 'TIMELINE';
  source: 'tasks' | 'documents' | 'communications' | 'timeline_events';
  title: string;
  safeDescription: string | null;
  occurredAt: string;
  caseId: string;
  documentId?: string | null;
  communicationId?: string | null;
  taskId?: string | null;
  href?: string | null;
  meta: {
    status?: string | null;
    type?: string | null;
    attachmentCount?: number;
    sourceTaskCount?: number;
  };
}

export interface CaseActivityResponse {
  caseId: string;
  generatedAt: string;
  pagination: {
    limit: number;
    offset: number;
    returned: number;
  };
  items: CaseActivityItem[];
  privacy: {
    rawDocumentTextIncluded: false;
    rawCommunicationBodyIncluded: false;
    attachmentBytesIncluded: false;
  };
}

export async function getCaseActivity(caseId: string): Promise<CaseActivityResponse> {
  return fetchApi<CaseActivityResponse>(`/cases/${caseId}/activity?limit=30`);
}

// ===========================================================================
// Case lifecycle + litigation dossier (WORKFLOW-CORE-LITIGATION-CASE-LIFECYCLE-1)
// ===========================================================================

export type CaseLifecycleCategory = 'INTAKE' | 'ACTIVE' | 'ON_HOLD' | 'CLOSING' | 'CLOSED' | 'ARCHIVED';

export interface CaseClosureBlocker {
  code:
    | 'OPEN_TASKS'
    | 'OVERDUE_TASKS'
    | 'ACTIVE_REVIEW'
    | 'OPEN_DEADLINES'
    | 'ACTIVE_HANDOFF'
    | 'UNRESOLVED_LITIGATION_ITEM'
    | 'MISSING_RESPONSIBLE_LAWYER';
  label: string;
  count?: number;
  href?: string | null;
}

export interface CaseLifecycleResponse {
  caseId: string;
  generatedAt: string;
  status: string;
  lifecycleCategory: CaseLifecycleCategory;
  openedAt?: string | null;
  closedAt?: string | null;
  archivedAt?: string | null;
  updatedAt?: string | null;
  responsibleLawyer?: { id: string; displayName: string } | null;
  blockers: CaseClosureBlocker[];
  closureReadiness: { ready: boolean; reasons: string[] };
  capabilities: {
    canChangeStatus: boolean;
    canStartClosing: boolean;
    canClose: boolean;
    canReopen: boolean;
    canArchive: boolean;
  };
  availability: {
    closingState: boolean;
    closedAt: boolean;
    archivedAt: boolean;
    litigationBlockers: boolean;
    closureChecklist: boolean;
  };
}

export async function getCaseLifecycle(caseId: string): Promise<CaseLifecycleResponse> {
  return fetchApi<CaseLifecycleResponse>(`/cases/${caseId}/lifecycle`);
}

export async function closeCaseLifecycle(caseId: string): Promise<CaseLifecycleResponse> {
  return fetchApi<CaseLifecycleResponse>(`/cases/${caseId}/close`, { method: 'POST' });
}

export async function reopenCaseLifecycle(caseId: string): Promise<CaseLifecycleResponse> {
  return fetchApi<CaseLifecycleResponse>(`/cases/${caseId}/reopen`, { method: 'POST' });
}

export async function archiveCaseLifecycle(caseId: string): Promise<CaseLifecycleResponse> {
  return fetchApi<CaseLifecycleResponse>(`/cases/${caseId}/archive`, { method: 'POST' });
}

export interface LitigationDossierEvidence {
  id: string;
  displayName: string;
  type?: string | null;
  status?: string | null;
  relation: 'SUPPORTING' | 'CONTRADICTING' | 'NEUTRAL' | 'UNCLASSIFIED';
  issueIds: string[];
  document?: { id: string; displayName: string; href?: string | null } | null;
  capabilities: {
    canOpen: boolean;
    canCompare: boolean;
    canCreateTask: boolean;
    canLinkToIssue: boolean;
    canUnlinkFromIssue: boolean;
  };
}

export interface LitigationDossierPleading {
  id: string;
  displayName: string;
  type?: string | null;
  status?: string | null;
  filedAt?: string | null;
  updatedAt?: string | null;
  relatedDocumentId?: string | null;
  relatedTaskIds: string[];
  capabilities: {
    canOpen: boolean;
    canCompare: boolean;
    canCreateReviewTask: boolean;
    canSubmitForReview: boolean;
    canApprove: boolean;
    canReturnForCorrection: boolean;
    canMarkFiled: boolean;
    canSupersede: boolean;
  };
}

export interface LitigationDossierProceduralDate {
  id: string;
  title: string;
  dueAt: string;
  urgency: string;
  sourceType: string;
  href?: string | null;
}

export interface LitigationDossierResponse {
  caseId: string;
  generatedAt: string;
  summary: {
    activeIssues: number;
    unresolvedIssues: number;
    evidenceItems: number;
    pleadingsInDraft: number;
    pleadingsInReview: number;
    filedPleadings: number;
    upcomingProceduralDates: number;
  };
  issues: unknown[];
  evidence: LitigationDossierEvidence[];
  pleadings: LitigationDossierPleading[];
  proceduralDates: LitigationDossierProceduralDate[];
  availability: {
    issues: boolean;
    evidence: boolean;
    issueEvidenceRelations: boolean;
    pleadings: boolean;
    filingStatus: boolean;
    proceduralDates: boolean;
    parties: boolean;
    burdenOfProof: boolean;
  };
}

export async function getCaseLitigationDossier(caseId: string): Promise<LitigationDossierResponse> {
  return fetchApi<LitigationDossierResponse>(`/cases/${caseId}/litigation-dossier`);
}

// ===========================================================================
// Intake & matter opening (WORKFLOW-CORE-INTAKE-MATTER-OPENING-1)
// ===========================================================================

export interface IntakeChecklistItem {
  code:
    | 'CLIENT_SELECTED'
    | 'CLIENT_IDENTITY'
    | 'CLIENT_ROLE'
    | 'RESPONSIBLE_LAWYER'
    | 'CONFLICT_REVIEW'
    | 'MATTER_DESCRIPTION'
    | 'INITIAL_TASKS'
    | 'INITIAL_DEADLINE';
  label: string;
  required: boolean;
  complete: boolean;
  available: boolean;
  href?: string | null;
}

export interface IntakeBlockerItem {
  code: string;
  label: string;
  href?: string | null;
}

export interface IntakeReadinessSummary {
  readyForActivation: boolean;
  completedRequiredItems: number;
  totalRequiredItems: number;
}

export interface MatterIntakeReadinessResponse {
  caseId: string;
  generatedAt: string;
  case: {
    displayName: string;
    reference?: string | null;
    status: string;
    clientRole?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  };
  client: {
    id: string;
    displayName: string;
    type?: string | null;
    identityStatus?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  responsibility: {
    responsibleLawyer?: { id: string; displayName: string } | null;
    collaborators: Array<{ id: string; displayName: string; role?: string | null }>;
  };
  conflictReview: {
    status: 'UNAVAILABLE' | 'NOT_RECORDED' | 'REVIEW_REQUIRED' | 'CLEARED' | 'BLOCKED';
    reviewedAt?: string | null;
    reviewer?: { id: string; displayName: string } | null;
    safeLabel?: string | null;
  };
  checklist: IntakeChecklistItem[];
  blockers: IntakeBlockerItem[];
  readiness: IntakeReadinessSummary;
  capabilities: {
    canEditClientLink: boolean;
    canEditClientRole: boolean;
    canChangeResponsibleLawyer: boolean;
    canManageCollaborators: boolean;
    canRecordConflictReview: boolean;
    canCreateOpeningTasks: boolean;
    canSetInitialDeadline: boolean;
    canActivateMatter: boolean;
    canDeclineMatter: boolean;
  };
  availability: {
    clientIdentity: boolean;
    clientRole: boolean;
    parties: boolean;
    opposingParties: boolean;
    conflictReviewPersistence: boolean;
    engagementState: boolean;
    openingTaskBundle: boolean;
    initialDeadline: boolean;
  };
}

export async function getCaseIntakeReadiness(caseId: string): Promise<MatterIntakeReadinessResponse> {
  return fetchApi<MatterIntakeReadinessResponse>(`/cases/${caseId}/intake-readiness`);
}

export interface CreateOpeningTasksResponse {
  caseId: string;
  created: Array<{ id: string; code: string; title: string; dueAt: string | null }>;
  skippedExisting: string[];
  availableCodes: Array<{ code: string; title: string }>;
}

export async function createOpeningTasks(
  caseId: string,
  tasks: Array<{ code: string; assigneeId?: string; dueAt?: string }>
): Promise<CreateOpeningTasksResponse> {
  return fetchApi<CreateOpeningTasksResponse>(`/cases/${caseId}/opening-tasks`, {
    method: 'POST',
    body: JSON.stringify({ tasks }),
  });
}

export async function activateMatterIntake(caseId: string): Promise<MatterIntakeReadinessResponse> {
  return fetchApi<MatterIntakeReadinessResponse>(`/cases/${caseId}/activate`, { method: 'POST' });
}

export async function declineMatterIntake(caseId: string): Promise<MatterIntakeReadinessResponse> {
  return fetchApi<MatterIntakeReadinessResponse>(`/cases/${caseId}/decline-intake`, { method: 'POST' });
}

export interface IntakeQueueResponse {
  generatedAt: string;
  summary: {
    total: number;
    missingClient: number;
    missingResponsibleLawyer: number;
    conflictReviewRequired: number;
    readyForActivation: number;
    blocked: number;
  };
  items: Array<{
    caseId: string;
    displayName: string;
    reference?: string | null;
    status: string;
    client?: { id: string; displayName: string } | null;
    responsibleLawyer?: { id: string; displayName: string } | null;
    readiness: IntakeReadinessSummary;
    blockers: Array<{ code: string; label: string }>;
    nextStep?: { code: string; label: string; href?: string | null } | null;
    updatedAt?: string | null;
    href: string;
  }>;
  pagination: { limit: number; offset: number; hasMore: boolean };
  availability: {
    conflictReview: boolean;
    engagementState: boolean;
    teamScope: boolean;
  };
}

export async function getIntakeQueue(params: {
  scope?: 'MY_INTAKES' | 'MY_CASES' | 'TEAM';
  status?: 'ALL' | 'NEEDS_ATTENTION' | 'READY';
  limit?: number;
  offset?: number;
} = {}): Promise<IntakeQueueResponse> {
  const query = new URLSearchParams();
  if (params.scope) query.set('scope', params.scope);
  if (params.status) query.set('status', params.status);
  if (params.limit) query.set('limit', String(params.limit));
  if (params.offset) query.set('offset', String(params.offset));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return fetchApi<IntakeQueueResponse>(`/intake${suffix}`);
}

export interface ClientLookupCandidate {
  id: string;
  displayName: string;
  type?: string | null;
  email?: string | null;
  phone?: string | null;
  matchSignals: Array<'EXACT_EMAIL' | 'EXACT_REGISTRATION_ID' | 'EXACT_TAX_ID' | 'SIMILAR_NAME'>;
  warning: 'REVIEW_REQUIRED';
  capabilities: { canSelect: boolean; canEdit: boolean };
}

export async function lookupClients(query: string): Promise<{ query: string; candidates: ClientLookupCandidate[] }> {
  return fetchApi<{ query: string; candidates: ClientLookupCandidate[] }>(
    `/clients/lookup?q=${encodeURIComponent(query)}`
  );
}

export type WorkflowDeadlineUrgency = 'OVERDUE' | 'TODAY' | 'TOMORROW' | 'THIS_WEEK' | 'LATER';
export type WorkflowDeadlineStatus = 'OPEN' | 'COMPLETED' | 'CANCELLED' | 'SUPERSEDED';

export interface WorkflowDeadlineItem {
  id: string;
  sourceType: 'TASK' | 'CASE_DEADLINE';
  sourceId: string;
  caseId: string;
  title: string;
  safeDescription?: string | null;
  startsAt?: string | null;
  dueAt: string;
  allDay: boolean;
  status: WorkflowDeadlineStatus;
  urgency: WorkflowDeadlineUrgency;
  importance: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW' | 'UNSPECIFIED';
  legalSignificance: null;
  responsibility: {
    assignee?: { id: string; displayName: string } | null;
    responsibleLawyer?: { id: string; displayName: string } | null;
  };
  source: {
    type: 'TASK' | 'CASE';
    id: string;
    displayName?: string | null;
    href?: string | null;
  };
  capabilities: {
    canOpen: boolean;
    canComplete: boolean;
    canReopen: boolean;
    canReschedule: boolean;
    canCancel: boolean;
    canCreateTask: boolean;
  };
  href?: string | null;
  updatedAt?: string | null;
}

export interface WorkflowAgendaResponse {
  generatedAt: string;
  timezone: string;
  range: { from: string; to: string };
  scope: 'MY_WORK' | 'MY_CASES' | 'CASE';
  summary: {
    overdue: number;
    today: number;
    tomorrow: number;
    thisWeek: number;
    later: number;
    completedRecently: number;
  };
  days: Array<{ date: string; items: WorkflowDeadlineItem[] }>;
  pagination: { limit: number; offset: number; hasMore: boolean };
  availability: {
    taskDueDates: boolean;
    caseDeadlines: boolean;
    hearings: boolean;
    reminders: boolean;
    teamScope: boolean;
    externalCalendar: false;
  };
}

export async function getWorkflowAgenda(params?: {
  from?: string;
  to?: string;
  scope?: 'MY_WORK' | 'MY_CASES' | 'CASE';
  status?: 'OPEN' | 'COMPLETED' | 'ALL';
  caseId?: string;
  limit?: number;
  offset?: number;
}): Promise<WorkflowAgendaResponse> {
  const query = new URLSearchParams();
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  if (params?.scope) query.set('scope', params.scope);
  if (params?.status) query.set('status', params.status);
  if (params?.caseId) query.set('caseId', params.caseId);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return fetchApi<WorkflowAgendaResponse>(`/agenda${suffix}`);
}

export async function rescheduleTaskDeadline(taskId: string, dueAt: string | null): Promise<TaskItem> {
  return fetchApi<TaskItem>(`/tasks/${taskId}/reschedule`, {
    method: 'POST',
    body: JSON.stringify({ dueAt }),
  });
}

export interface SourceLinkedTaskResponse {
  success: boolean;
  task: {
    id: string;
    title: string;
    caseId: string;
    documentId?: string | null;
    sourceCommunicationId?: string | null;
    status: string;
    dueDate: string | null;
  };
  source: {
    type: 'DOCUMENT' | 'COMMUNICATION';
    id: string;
    caseId: string;
  };
}

export async function createDocumentSourceTask(
  documentId: string,
  data: { kind: 'REVIEW' | 'FOLLOW_UP'; title?: string; assigneeId?: string; dueAt?: string }
): Promise<SourceLinkedTaskResponse> {
  return fetchApi<SourceLinkedTaskResponse>(`/documents/${documentId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function createCommunicationSourceTask(
  communicationId: string,
  data: { kind: 'FOLLOW_UP' | 'REVIEW_ATTACHMENT'; title?: string; assigneeId?: string; dueAt?: string }
): Promise<SourceLinkedTaskResponse> {
  return fetchApi<SourceLinkedTaskResponse>(`/communications/${communicationId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Case Assignment
export interface AssignCaseData {
  userId: string;
  role: string;
}

export interface AssignCaseResponse {
  assignmentId: string;
  caseId: string;
  userId: string;
  role: string;
}

export async function assignCase(caseId: string, data: AssignCaseData): Promise<AssignCaseResponse> {
  return fetchApi<AssignCaseResponse>(`/cases/${caseId}/assign`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Case Collaborators
export interface CaseCollaborator {
  id: string;
  userId: string;
  role: string;
  addedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

export async function getCaseCollaborators(caseId: string): Promise<CaseCollaborator[]> {
  return fetchApi<CaseCollaborator[]>(`/cases/${caseId}/collaborators`);
}

export async function addCaseCollaborator(
  caseId: string,
  userId: string,
  role: string = 'COLLABORATOR'
): Promise<CaseCollaborator> {
  return fetchApi<CaseCollaborator>(`/cases/${caseId}/collaborators`, {
    method: 'POST',
    body: JSON.stringify({ userId, role }),
  });
}

export async function removeCaseCollaborator(caseId: string, collaboratorId: string): Promise<void> {
  return fetchApi<void>(`/cases/${caseId}/collaborators/${collaboratorId}`, {
    method: 'DELETE',
  });
}

export interface CreateCaseData {
  clientName: string;
  clientId?: string;
  matterType: string;
  priority?: string;
  description?: string;
  clientRole?: string;
  deadline?: string;
}

export interface CreateCaseResponse {
  id: string;
  caseNumber: string;
  status: string;
  createdAt: string;
}

export async function createCase(data: CreateCaseData): Promise<CreateCaseResponse> {
  const { clientName, clientId, matterType, description, clientRole, deadline } = data;
  const payload: Record<string, unknown> = { clientName, matterType };
  if (clientId) payload.clientId = clientId;
  if (description) payload.description = description;
  if (clientRole) payload.clientRole = clientRole;
  if (deadline) payload.deadline = deadline;
  return fetchApi<CreateCaseResponse>('/cases', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// Tasks
export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  attentionCategory?: AttentionCategory | null;
  estimatedMinutes?: number | null;
  dueDate?: string;
  submittedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  documentId?: string | null;
  sourceCommunicationId?: string | null;
  assignedTo?: {
    id: string;
    name: string;
    role?: string;
  };
  assignedBy?: {
    id: string;
    name: string;
    role?: string;
  };
  case: {
    id: string;
    caseNumber: string;
    clientName: string;
    matterType: string;
    title?: string;
    clientId?: string;
    clientColorKey?: ClientColorKey | null;
  };
}

export async function getMyTasks(): Promise<TaskItem[]> {
  return fetchApi<TaskItem[]>('/tasks/my/tasks');
}

export async function getCaseTasks(caseId: string): Promise<TaskItem[]> {
  return fetchApi<TaskItem[]>(`/tasks?caseId=${caseId}`);
}

export async function startTask(taskId: string): Promise<TaskItem> {
  return fetchApi<TaskItem>(`/tasks/${taskId}/start`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function submitTask(taskId: string, notes?: string): Promise<TaskItem> {
  return fetchApi<TaskItem>(`/tasks/${taskId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  });
}

export async function completeTask(taskId: string, approved: boolean, notes?: string): Promise<TaskItem> {
  return fetchApi<TaskItem>(`/tasks/${taskId}/complete`, {
    method: 'POST',
    body: JSON.stringify({ approved, notes }),
  });
}

export async function blockTask(taskId: string, reason: string): Promise<TaskItem> {
  return fetchApi<TaskItem>(`/tasks/${taskId}/block`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function unblockTask(taskId: string): Promise<TaskItem> {
  return fetchApi<TaskItem>(`/tasks/${taskId}/unblock`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function reassignTask(taskId: string, newAssigneeId: string): Promise<TaskItem> {
  return fetchApi<TaskItem>(`/tasks/${taskId}/reassign`, {
    method: 'POST',
    body: JSON.stringify({ newAssigneeId }),
  });
}

export async function setTaskDeadline(taskId: string, dueDate: string, note?: string): Promise<TaskItem> {
  return fetchApi<TaskItem>(`/tasks/${taskId}/deadline`, {
    method: 'PATCH',
    body: JSON.stringify({ dueDate, note }),
  });
}

export async function updateCaseStatus(caseId: string, status: string, comment?: string): Promise<Record<string, unknown>> {
  return fetchApi<Record<string, unknown>>(`/cases/${caseId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, comment }),
  });
}

export interface UpdateCaseData {
  deadline?: string | null;
  priority?: string;
  description?: string;
  clientRole?: string | null;
}

export async function updateCase(caseId: string, data: UpdateCaseData): Promise<{ success: boolean; id: string; deadline?: string | null; priority?: string; description?: string | null; clientRole?: string | null; updatedAt: string }> {
  return fetchApi<{ success: boolean; id: string; deadline?: string | null; priority?: string; description?: string | null; clientRole?: string | null; updatedAt: string }>(`/cases/${caseId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export interface CreateTaskData {
  caseId: string;
  title: string;
  type: string;
  description?: string;
  priority?: string;
  dueDate?: string;
  assignedTo?: string;
  attentionCategory?: AttentionCategory | null;
  estimatedMinutes?: number | null;
}

export async function createTask(data: CreateTaskData): Promise<TaskItem> {
  return fetchApi<TaskItem>('/tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface UpdateTaskAttentionData {
  attentionCategory?: AttentionCategory | null;
  estimatedMinutes?: number | null;
}

export async function updateTaskAttention(taskId: string, data: UpdateTaskAttentionData): Promise<TaskItem> {
  return fetchApi<TaskItem>(`/tasks/${taskId}/attention`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// Timeline Events
export interface TimelineEvent {
  id: string;
  caseId: string;
  type: string;
  payload?: Record<string, unknown>;
  userId?: string;
  userName?: string;
  createdAt: string;
}

export interface CaseSummaryResponse {
  case: {
    id: string;
    caseNumber: string;
    title: string;
    clientName: string;
    clientId?: string;
    matterId?: string;
    matterType: string;
    status: string;
    description?: string;
    priority: string;
    sharePointFolderPath?: string;
    createdAt: string;
    updatedAt: string;
  };
  last5TimelineEvents: TimelineEvent[];
  activeDocuments: Array<{
    id: string;
    fileName: string;
    documentType: string;
    version: string;
    status: string;
    spWebUrl?: string;
    createdAt: string;
  }>;
  stats: {
    totalDocuments: number;
    approvedDocuments: number;
    pendingReview: number;
  };
}

export interface CaseWorkflowHistoryItem {
  eventType: string;
  fromStatus?: string;
  toStatus?: string;
  comment?: string;
  userId?: string;
  createdAt: string;
}

// Workflow Graph Types
export type WorkflowStatus = 
  | 'CLIENT_INPUT'
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'SENT_TO_CLIENT'
  | 'CLIENT_FEEDBACK'
  | 'FINAL'
  | 'CLOSED';

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

export interface DeadlineItem {
  id: string;
  caseId: string;
  documentId: string;
  extractedPhrase: string;
  triggerDate: string;
  durationDays: number;
  businessDays: boolean;
  dueDate: string;
  ruleSet: string;
  confidence: number;
  status: string;
  createdAt: string;
}

export async function getCaseSummary(caseId: string): Promise<CaseSummaryResponse> {
  return fetchApi<CaseSummaryResponse>(`/cases/${caseId}/summary`);
}

export async function getCaseWorkflowHistory(caseId: string): Promise<CaseWorkflowHistoryItem[]> {
  return fetchApi<CaseWorkflowHistoryItem[]>(`/cases/${caseId}/workflow-history`);
}

export async function getWorkflowGraph(caseId: string): Promise<WorkflowGraph> {
  return fetchApi<WorkflowGraph>(`/cases/${caseId}/workflow-graph`);
}

export interface CaseDeadlineAgendaResponse {
  caseId: string;
  generatedAt: string;
  timezone: string;
  items: WorkflowDeadlineItem[];
  pagination: WorkflowAgendaResponse['pagination'];
  availability: WorkflowAgendaResponse['availability'];
}

export async function getCaseDeadlines(caseId: string): Promise<CaseDeadlineAgendaResponse> {
  return fetchApi<CaseDeadlineAgendaResponse>(`/cases/${caseId}/deadlines`);
}

export async function extractDeadlines(data: {
  caseId: string;
  documentId: string;
  servedAt?: string;
}): Promise<{ count: number; deadlines: DeadlineItem[] }> {
  return fetchApi<{ count: number; deadlines: DeadlineItem[] }>('/deadlines/extract', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Instructions
export interface Instruction {
  id: string;
  caseId: string;
  createdById: string;
  createdByName?: string;
  title?: string;
  content: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'COMPLETED';
  createdAt: string;
  updatedAt: string;
}

export async function getCaseInstructions(caseId: string): Promise<Instruction[]> {
  return fetchApi<Instruction[]>(`/cases/${caseId}/instructions`);
}

export async function createInstruction(caseId: string, data: { title?: string; content: string }): Promise<Instruction> {
  return fetchApi<Instruction>(`/cases/${caseId}/instructions`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateInstruction(instructionId: string, data: { title?: string; content?: string; status?: string }): Promise<Instruction> {
  return fetchApi<Instruction>(`/cases/instructions/${instructionId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteInstruction(instructionId: string): Promise<{ success: boolean }> {
  return fetchApi<{ success: boolean }>(`/cases/instructions/${instructionId}`, {
    method: 'DELETE',
  });
}

// Documents
export interface DocumentItem {
  id: string;
  caseId: string;
  fileName: string;
  documentType: string;
  spItemId?: string;
  spWebUrl?: string;
  version: string;
  folder: string;
  isLatest: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentSearchItem {
  id: string;
  caseId: string;
  fileName: string;
  documentType: string;
  caseNumber: string;
  caseTitle: string;
  clientId: string;
  clientName: string;
  updatedAt: string;
  createdAt: string;
}

export async function getCaseDocuments(caseId: string): Promise<DocumentItem[]> {
  return fetchApi<DocumentItem[]>(`/cases/${caseId}/documents`);
}

export async function searchDocuments(query: string, limit = 50): Promise<DocumentSearchItem[]> {
  const q = query.trim();
  if (!q) {
    return [];
  }
  const params = new URLSearchParams();
  params.set('q', q);
  params.set('limit', String(limit));
  return fetchApi<DocumentSearchItem[]>(`/documents/search?${params.toString()}`);
}

export async function uploadCaseDocument(data: {
  caseId: string;
  fileName: string;
  fileContentBase64: string;
  mimeType?: string;
  documentType?: string;
  folder?: string;
}): Promise<DocumentItem> {
  return fetchApi<DocumentItem>('/documents', {
    method: 'POST',
    body: JSON.stringify({
      caseId: data.caseId,
      fileName: data.fileName,
      fileContent: data.fileContentBase64,
      mimeType: data.mimeType,
      documentType: data.documentType || 'OTHER',
      folder: data.folder,
    }),
  });
}

export async function deleteDocument(documentId: string): Promise<void> {
  return fetchApi<void>(`/documents/${encodeURIComponent(documentId)}`, {
    method: 'DELETE',
  });
}

export async function uploadDocumentNewVersion(documentId: string, fileContentBase64: string, comment?: string): Promise<DocumentItem> {
  return fetchApi<DocumentItem>(`/documents/${documentId}/version`, {
    method: 'POST',
    body: JSON.stringify({ fileContent: fileContentBase64, comment }),
  });
}

export async function submitDocumentForReview(documentId: string): Promise<{ success: boolean; message?: string }> {
  return fetchApi<{ success: boolean; message?: string }>(`/documents/${documentId}/submit-review`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function approveDocument(documentId: string, comment?: string): Promise<{ success: boolean; message?: string }> {
  return fetchApi<{ success: boolean; message?: string }>(`/documents/${documentId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ comment }),
  });
}

export async function rejectDocument(documentId: string, reason: string): Promise<{ success: boolean; message?: string }> {
  return fetchApi<{ success: boolean; message?: string }>(`/documents/${documentId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

/**
 * Download a document from SharePoint
 */
export async function downloadDocument(documentId: string): Promise<Blob> {
  const token = await waitForAuthToken(DEFAULT_AUTH_WAIT_MS);
  const headers: HeadersInit = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(`${API_BASE}/documents/${documentId}/download`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    let message = `Download failed (${response.status})`;
    try {
      const bodyText = await response.text();
      if (bodyText) {
        message = bodyText;
      }
    } catch {
      // ignore
    }
    throw new ApiError(response.status, message, `/documents/${documentId}/download`);
  }

  return response.blob();
}

export async function classifyDocument(documentId: string): Promise<Record<string, unknown>> {
  return fetchApi<Record<string, unknown>>(`/documents/${documentId}/classify`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function getDocumentClassification(documentId: string): Promise<Record<string, unknown>> {
  return fetchApi<Record<string, unknown>>(`/documents/${documentId}/classification`);
}

export interface DocumentTextResult {
  documentId: string;
  source: 'UPLOADED' | 'ANONYMIZED' | 'GENERATED';
  text: string;
  format?: string;
  pageCount?: number;
  extractedAt?: string;
  unavailableReason?: string;
}

export async function getDocumentText(documentId: string): Promise<DocumentTextResult> {
  return fetchApi<DocumentTextResult>(`/documents/${documentId}/text`);
}

export type LegalAnalysisStatus =
  | 'DRAFT'
  | 'CANDIDATE_REVIEW'
  | 'LAWYER_REVIEW'
  | 'READY_FOR_APPROVAL'
  | 'APPROVED'
  | 'ARCHIVED';

export type LegalAnalysisSourceType = 'PASTED_AI_OUTPUT' | 'MANUAL';

export type LegalAnalysisSourceDocumentType = 'DOCUMENT' | 'CONTRACT_GENERATION' | 'ANONYMOUS_DOCUMENT';

export interface LegalAnalysisRecord {
  id: string;
  caseId: string;
  documentId: string | null;
  documentSourceType: LegalAnalysisSourceDocumentType;
  title: string;
  analysisText: string;
  status: LegalAnalysisStatus;
  sourceType: LegalAnalysisSourceType;
  aiToolName: string | null;
  anonymizedInputSnapshot: string | null;
  riskMatrixDetected: boolean;
  missingDataDetected: boolean;
  suggestedChangesDetected: boolean;
  lawyerDecisionPointsDetected: boolean;
  createdById: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLegalAnalysisPayload {
  caseId: string;
  documentSourceType?: LegalAnalysisSourceDocumentType;
  title?: string;
  analysisText: string;
  status?: LegalAnalysisStatus;
  sourceType?: LegalAnalysisSourceType;
  aiToolName?: string | null;
  anonymizedInputSnapshot?: string | null;
}

export interface UpdateLegalAnalysisPayload {
  title?: string;
  analysisText?: string;
  status?: LegalAnalysisStatus;
  aiToolName?: string | null;
  anonymizedInputSnapshot?: string | null;
}

export async function listDocumentLegalAnalyses(
  documentId: string,
  params?: { caseId?: string; documentSourceType?: LegalAnalysisSourceDocumentType },
): Promise<LegalAnalysisRecord[]> {
  const query = new URLSearchParams();
  if (params?.caseId) query.set('caseId', params.caseId);
  if (params?.documentSourceType) query.set('documentSourceType', params.documentSourceType);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return fetchApi<LegalAnalysisRecord[]>(`/documents/${encodeURIComponent(documentId)}/legal-analyses${suffix}`, {
    suppressErrorStatuses: [404],
  });
}

export async function createDocumentLegalAnalysis(
  documentId: string,
  payload: CreateLegalAnalysisPayload,
): Promise<LegalAnalysisRecord> {
  return fetchApi<LegalAnalysisRecord>(`/documents/${encodeURIComponent(documentId)}/legal-analyses`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getLegalAnalysis(id: string): Promise<LegalAnalysisRecord> {
  return fetchApi<LegalAnalysisRecord>(`/legal-analyses/${encodeURIComponent(id)}`);
}

export async function updateLegalAnalysis(
  id: string,
  payload: UpdateLegalAnalysisPayload,
): Promise<LegalAnalysisRecord> {
  return fetchApi<LegalAnalysisRecord>(`/legal-analyses/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteLegalAnalysis(id: string): Promise<void> {
  return fetchApi<void>(`/legal-analyses/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// Minimal structured counterparty input for extra-party context in anonymization
interface CounterpartyInput {
  name: string;
  side: 'OPPONENT' | 'ADDITIONAL_PARTY';
  partyType?: 'PERSON' | 'COMPANY' | 'UNKNOWN';
}

export interface AnonymizationMetadataInput {
  clientName?: string;
  clientRole?: string;
  counterparty?: string;
  notes?: string;
  knownParty?: {
    kind?: 'PERSON' | 'COMPANY';
    legalRole?: string;
    name?: string;
    role?: string;
    notes?: string;
    birthName?: string;
    birthPlace?: string;
    birthDate?: string;
    mothersName?: string;
    address?: string;
    taxId?: string;
    personalId?: string;
    personalIdentifierNumber?: string;
    identityCardNumber?: string;
    companyName?: string;
    seat?: string;
    companyTaxNumber?: string;
    euVatNumber?: string;
    companyRegistrationNumber?: string;
    representativeName?: string;
    representativeTitle?: string;
    contactEmail?: string;
    phone?: string;
  };
}

export interface AnonymizationSourceTextResponse {
  success: boolean;
  textAvailable: boolean;
  sourceText?: string;
  limitationMessage?: string;
  error?: string;
}

export async function anonymizeDocument(documentId: string, data?: {
  aiTask?: string;
  customPrompt?: string;
  redactionLevel?: string;
  /** Structured extra-party context — manually supplied counterparty names */
  counterparties?: CounterpartyInput[];
  /** Optional visible/edited source text from UI workspace */
  sourceText?: string;
  /** Minimal metadata context from anonymization workspace */
  metadata?: AnonymizationMetadataInput;
}): Promise<Record<string, unknown>> {
  return fetchApi<Record<string, unknown>>(`/documents/${documentId}/anonymize`, {
    method: 'POST',
    body: JSON.stringify(data || {}),
  });
}

export async function getAnonymizationSourceText(documentId: string): Promise<AnonymizationSourceTextResponse> {
  // This endpoint is a best-effort preview/helper endpoint.
  // Do not use fetchApi() here, because expected fallback statuses (e.g. 404/500/501)
  // should not emit noisy console.error entries and trigger Next dev overlay.
  const token = await waitForAuthToken(DEFAULT_AUTH_WAIT_MS);
  const endpoint = `/documents/${documentId}/anonymization-source`;
  const url = `${API_BASE}${endpoint}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    const bodyText = await response.text();
    const parsed = bodyText ? (() => {
      try {
        return JSON.parse(bodyText) as Partial<AnonymizationSourceTextResponse> & { message?: string; error?: string };
      } catch {
        return null;
      }
    })() : null;

    if (!response.ok) {
      return {
        success: false,
        textAvailable: false,
        limitationMessage: parsed?.limitationMessage,
        error: parsed?.error || parsed?.message || `HTTP ${response.status}`,
      };
    }

    return {
      success: Boolean(parsed?.success),
      textAvailable: Boolean(parsed?.textAvailable),
      sourceText: typeof parsed?.sourceText === 'string' ? parsed.sourceText : undefined,
      limitationMessage: typeof parsed?.limitationMessage === 'string' ? parsed.limitationMessage : undefined,
      error: typeof parsed?.error === 'string' ? parsed.error : undefined,
    };
  } catch {
    return {
      success: false,
      textAvailable: false,
      error: 'Network error while loading anonymization source text',
    };
  }
}

export async function getAnonymousDocument(anonymousDocumentId: string): Promise<Record<string, unknown>> {
  return fetchApi<Record<string, unknown>>(`/anonymous-documents/${anonymousDocumentId}`);
}

/**
 * Import external AI response and rehydrate anonymized content
 */
export interface ImportAIResponseResult {
  success: boolean;
  anonymousDocId: string;
  rehydrationStatus: 'PENDING' | 'COMPLETE' | 'PARTIAL' | 'FAILED';
  rehydratedContent?: string;
  warnings: Array<{
    token: string;
    reason: string;
    original?: string;
  }>;
  totalTokens: number;
  resolvedTokens: number;
  unresolvedTokens: number;
  error?: string;
}

export async function importAIResponse(
  anonymousDocumentId: string,
  aiResponseText: string
): Promise<ImportAIResponseResult> {
  return fetchApi<ImportAIResponseResult>(
    `/anonymous-documents/${anonymousDocumentId}/import-ai-response`,
    {
      method: 'POST',
      body: JSON.stringify({ aiResponseText }),
    }
  );
}

/**
 * Save rehydrated AI response as a reviewable Document
 */
export interface SaveRehydratedResultResponse {
  success: boolean;
  documentId?: string;
  fileName?: string;
  error?: string;
}

export async function saveRehydratedResultAsDocument(
  anonymousDocumentId: string
): Promise<SaveRehydratedResultResponse> {
  return fetchApi<SaveRehydratedResultResponse>(
    `/anonymous-documents/${anonymousDocumentId}/save-as-document`,
    {
      method: 'POST',
    }
  );
}

/**
 * Anonymous document list item (subset of fields for list view)
 */
export interface AnonymousDocumentListItem {
  id: string;
  name: string;
  sourceDocId: string;
  caseId: string;
  aiTask: string | null;
  customPrompt: string | null;
  rehydrationStatus: string | null;
  rehydratedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Anonymous document item with redactedText for workspace text loading
 */
export interface AnonymousDocumentItem {
  id: string;
  name: string;
  sourceDocId: string;
  caseId: string;
  aiTask: string | null;
  customPrompt: string | null;
  rehydrationStatus: string | null;
  rehydratedAt: string | null;
  createdAt: string;
  redactedText: string;
  redactedItems: unknown[];
}

/**
 * List anonymous documents for a case
 */
export async function getCaseAnonymousDocuments(caseId: string): Promise<AnonymousDocumentListItem[]> {
  return fetchApi<AnonymousDocumentListItem[]>(
    `/anonymous-documents?caseId=${encodeURIComponent(caseId)}`
  );
}

/**
 * List anonymized documents by source document ID (newest first).
 * Returns redactedText for workspace text loading.
 */
export async function getAnonymousDocumentsBySource(sourceDocumentId: string): Promise<AnonymousDocumentItem[]> {
  return fetchApi<AnonymousDocumentItem[]>(
    `/anonymous-documents/by-source/${encodeURIComponent(sourceDocumentId)}`,
    {
      suppressErrorStatuses: [404, 501],
    }
  );
}

export async function generateChangeReport(data: {
  documentId: string;
  fromVersionInt: number;
  toVersionInt: number;
}): Promise<{ id: string } & Record<string, unknown>> {
  return fetchApi<{ id: string } & Record<string, unknown>>('/change-reports/generate', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getChangeReport(changeReportId: string): Promise<Record<string, unknown>> {
  return fetchApi<Record<string, unknown>>(`/change-reports/${changeReportId}`);
}

// Users
export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export async function getUsers(): Promise<User[]> {
  const response = await fetchApi<{ data: User[] }>('/users');
  return response.data;
}

export async function getUserById(userId: string): Promise<User> {
  return fetchApi<User>(`/users/${userId}`);
}

// Current User Profile
export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export async function getCurrentUser(): Promise<CurrentUser> {
  return fetchApi<CurrentUser>('/auth/me');
}

// Clients
export interface Client {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  taxNumber?: string;
  companyRegistrationNumber?: string;
  authorizedRepresentative?: string;
  contactPerson?: string;
  colorKey?: ClientColorKey | null;
  houseStyleProfile?: ClientHouseStyleProfile | null;
}

export interface ClientHouseStyleProfile {
  id: string;
  clientId: string;
  officialName?: string | null;
  shortName?: string | null;
  registeredSeat?: string | null;
  taxNumber?: string | null;
  registrationNumber?: string | null;
  contactPerson?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  preferredLanguage?: string | null;
  documentLanguageMode?: string | null;
  fontFamily?: string | null;
  fontSize?: string | null;
  headingStyle?: string | null;
  numberingStyle?: string | null;
  headerRequirements?: string | null;
  footerRequirements?: string | null;
  signatureBlock?: string | null;
  headerAssetPath?: string | null;
  headerDescription?: string | null;
  brandingNotes?: string | null;
  bilingualNotes?: string | null;
  translationNotes?: string | null;
  preferredTone?: string | null;
  prohibitedWording?: string | null;
  reusablePromptInstructions?: string | null;
  wordFormattingInstructions?: string | null;
  externalAiInstructions?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type UpsertClientHouseStyleProfilePayload = Partial<Omit<ClientHouseStyleProfile, 'id' | 'clientId' | 'createdAt' | 'updatedAt'>>;

export async function getClients(): Promise<{ data: Client[] }> {
  return fetchApi<{ data: Client[] }>('/clients');
}

export async function getClient(clientId: string): Promise<Client> {
  return fetchApi<Client>(`/clients/${clientId}`);
}

export async function getClientHouseStyle(clientId: string): Promise<ClientHouseStyleProfile | null> {
  return fetchApi<ClientHouseStyleProfile | null>(`/clients/${clientId}/house-style`);
}

export async function upsertClientHouseStyle(
  clientId: string,
  data: UpsertClientHouseStyleProfilePayload,
): Promise<ClientHouseStyleProfile> {
  return fetchApi<ClientHouseStyleProfile>(`/clients/${clientId}/house-style`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getCaseClientHouseStyle(caseId: string): Promise<ClientHouseStyleProfile | null> {
  return fetchApi<ClientHouseStyleProfile | null>(`/cases/${caseId}/client-house-style`);
}

export interface CreateClientData {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  taxNumber?: string;
  companyRegistrationNumber?: string;
  authorizedRepresentative?: string;
  contactPerson?: string;
  colorKey?: ClientColorKey | null;
}

export async function createClient(data: CreateClientData): Promise<Client> {
  return fetchApi<Client>('/clients', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface UpdateClientData {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxNumber?: string;
  companyRegistrationNumber?: string;
  authorizedRepresentative?: string;
  contactPerson?: string;
  colorKey?: ClientColorKey | null;
}

export async function updateClient(clientId: string, data: UpdateClientData): Promise<Client> {
  return fetchApi<Client>(`/clients/${clientId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteClient(clientId: string): Promise<{ success: boolean }> {
  const response = await fetchApi<Record<string, unknown>>(`/clients/${clientId}`, {
    method: 'DELETE',
  });
  return { success: true };
}

// Contracts
export interface ContractTemplateItem {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  templateSource?: 'LOCAL' | 'SHAREPOINT';
  isDefault?: boolean;
  variables?: Array<{
    name: string;
    label?: string;
    type: string;
    required?: boolean;
  }>;
}



export interface ContractTemplateVariable {
  name: string;
  label?: string;
  type: string;
  required?: boolean;
  kind?: 'field' | 'condition';
  defaultValue?: string;
  placeholder?: string;
  description?: string;
}

export interface ClientProfileSummary {
  id: string;
  brandingMode: string;
  prefersVariant: boolean;
  brandVariantTemplateId?: string;
  defaultTemplateId?: string;
}

export interface ValidateTemplatePayloadResponse {
  success: boolean;
  errors?: string[];
}

export interface ContractGenerateResponse {
  success: boolean;
  document?: {
    id: string;
    title: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    templateId: string;
    caseId?: string;
    generatedAt: string;
    threadId?: string;
    threadTitle?: string;
    threadCategory?: string;
    revisionNumber?: number;
    isCurrentRevision?: boolean;
    isFinalRevision?: boolean;
    revisionNote?: string | null;
    status?: string;
  };
  bundleDocuments?: Array<{
    id: string;
    bundleItemId: string;
    title: string;
    fileName: string;
    generatedAt: string;
  }>;
  skippedBundleItems?: Array<{
    id: string;
    reason: string;
  }>;
  error?: string;
}

export interface BundleOptionItem {
  id: 'RECEIPT_ACKNOWLEDGEMENT' | 'HANDOVER_MINUTES' | 'REGISTRATION_SUPPORT_DOC' | 'B400_PREP';
  label: string;
  documentType: string;
  generatorType: 'TEXT_PLACEHOLDER' | 'PREP_EXPORT';
  eligible: boolean;
  reason: string;
}

export interface BundleOptionsResponse {
  contractType: string;
  options: BundleOptionItem[];
}

export interface EditorTemplateCapabilitiesDto {
  availability: {
    catalog: boolean;
    templateDetail: boolean;
    variablePreview: boolean;
    generation: boolean;
    generatedDocxDownload: boolean;
    automaticLocalImport: boolean;
    clauseCatalog: boolean;
    customClauses: boolean;
  };
  featureFlags: {
    templateGenerationEnabled: boolean;
    documentProcessingEnabled: boolean;
  };
  limits: {
    maxTemplates: number;
    maxVariables: number;
    maxStringLength: number;
  };
  selectedBranch: 'APPROVAL_READINESS_ONLY';
  reason: string;
  nextStep: string;
}

export interface CaseContractListItem {
  id: string;
  title: string;
  templateName: string;
  category: string;
  status: string;
  fileName: string;
  fileSize?: number;
  generatedAt: string;
  parentRevisionId?: string | null;
  threadId?: string;
  threadTitle?: string;
  threadCategory?: string;
  revisionNumber?: number;
  isCurrentRevision?: boolean;
  isFinalRevision?: boolean;
  revisionNote?: string | null;
  spItemId?: string | null;
  spWebUrl?: string | null;
  finalizedAt?: string | null;
  supersededAt?: string | null;
}

export interface EditDraftBlock {
  id: string;
  title: string;
  body: string;
  orderIndex: number;
  sourceClauseId?: string | null;
  reviewStatus?: 'OK' | 'REVIEW_NEEDED' | 'RISK_ISSUE';
}

export interface ContractEditDraftResponse {
  documentId: string;
  caseId: string;
  contractType: 'ADASVETEL';
  sourceMode: 'saved_draft' | 'assembly' | 'fallback_text' | 'empty';
  blocks: EditDraftBlock[];
  draftMeta: {
    generationDraftId?: string;
    updatedAt?: string;
    message?: string;
  };
}

export interface ContractEditDraftSaveResponse {
  success: boolean;
  documentId: string;
  caseId: string;
  contractType: 'ADASVETEL';
  blocks: EditDraftBlock[];
  draftId: string;
  updatedAt: string;
}

export interface ContractEditDraftGenerateResponse {
  success: boolean;
  error?: string;
  sourceDocumentId?: string;
  contract?: {
    id: string;
    title: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    templateId: string;
    caseId?: string;
    generatedAt: string;
    revisionNumber: number;
    parentRevisionId?: string;
  };
}

export interface ContractEditSuggestionItem {
  id: string;
  title: string;
  body: string;
  summary: string | null;
  clauseKind: string;
  category: string;
  representedSide: string;
  sortOrder: number;
  lawyerProfileId: string | null;
}

export interface ContractEditSuggestionsResponse {
  documentId: string;
  contractType: 'ADASVETEL';
  lawyerProfile: { id: string; lawyerName: string } | null;
  suggestions: ContractEditSuggestionItem[];
}

export interface ThreadRevisionItem {
  id: string;
  revisionNumber: number;
  isCurrent: boolean;
  isFinal: boolean;
  isArchived: boolean;
  note?: string | null;
  createdAt: string;
  finalizedAt?: string | null;
  archivedAt?: string | null;
  generationId?: string;
  fileName?: string;
  generatedAt?: string;
  status?: string;
  spItemId?: string | null;
  spWebUrl?: string | null;
  threadId?: string;
  threadTitle?: string;
  threadCategory?: string;
}

export interface ContractCompareBlock {
  id: string;
  status: 'unchanged' | 'modified' | 'added' | 'removed';
  sourceBlock: {
    id: string;
    title: string;
    body: string;
    orderIndex: number;
    sourceClauseId?: string | null;
  } | null;
  targetBlock: {
    id: string;
    title: string;
    body: string;
    orderIndex: number;
    sourceClauseId?: string | null;
  } | null;
  matchStrategy: 'CLAUSE_ID' | 'TITLE' | 'ORDER' | 'NONE';
  inlineDiff?: {
    granularity: 'word';
    sourceSegments: Array<{
      type: 'equal' | 'delete';
      text: string;
    }>;
    targetSegments: Array<{
      type: 'equal' | 'insert';
      text: string;
    }>;
  };
}

export interface ContractComparisonResponse {
  mode: 'BLOCK_LEVEL';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceReason: string;
  sourceSelection: 'EXPLICIT' | 'PARENT_LINEAGE' | 'INFERRED_PREVIOUS';
  source: {
    id: string;
    title: string;
    caseId: string | null;
    templateCategory: string;
    revisionNumber: number;
    isCurrentRevision: boolean;
    parentRevisionId?: string | null;
    generatedAt: string;
  };
  target: {
    id: string;
    title: string;
    caseId: string | null;
    templateCategory: string;
    revisionNumber: number;
    isCurrentRevision: boolean;
    parentRevisionId?: string | null;
    generatedAt: string;
  };
  summary: {
    total: number;
    unchanged: number;
    modified: number;
    added: number;
    removed: number;
  };
  blocks: ContractCompareBlock[];
  extraction: {
    sourceStrategy: 'EDIT_DRAFT' | 'ASSEMBLY' | 'TEXT_SPLIT' | 'EMPTY';
    targetStrategy: 'EDIT_DRAFT' | 'ASSEMBLY' | 'TEXT_SPLIT' | 'EMPTY';
  };
}

export async function getContractTemplates(category?: string): Promise<ContractTemplateItem[]> {
  const query = category ? `?category=${encodeURIComponent(category)}` : '';
  return fetchApi<ContractTemplateItem[]>(`/contracts/templates${query}`);
}

export async function getEditorTemplateCapabilities(): Promise<EditorTemplateCapabilitiesDto> {
  return fetchApi<EditorTemplateCapabilitiesDto>('/contracts/editor-template-capabilities');
}

export async function getContractTemplateById(templateId: string): Promise<ContractTemplateItem> {
  return fetchApi<ContractTemplateItem>(`/contracts/templates/${templateId}`);
}

export async function getAdasvetelTemplateVariables(): Promise<{
  category: string;
  variables: Array<{ name: string; label?: string; type: string; required?: boolean }>;
}> {
  return fetchApi('/contracts/templates/adasvetel/variables');
}

export async function generateContract(data: {
  templateId: string;
  caseId?: string;
  title?: string;
  data: Record<string, unknown>;
  selectedBundleItemIds?: string[];
}): Promise<ContractGenerateResponse> {
  return fetchApi<ContractGenerateResponse>('/contracts/generate', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getContractBundleOptions(data: {
  contractType: ClauseContractType;
  intakeData: Record<string, unknown>;
}): Promise<BundleOptionsResponse> {
  return fetchApi<BundleOptionsResponse>('/contracts/bundle-options', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function previewContract(data: {
  templateId: string;
  data: Record<string, unknown>;
}): Promise<{ success: boolean; preview?: { base64Content: string; fileName: string }; error?: string }> {
  return fetchApi('/contracts/preview', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function downloadContract(generationId: string): Promise<Blob> {
  const token = await waitForAuthToken(DEFAULT_AUTH_WAIT_MS);
  const headers: HeadersInit = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(`${API_BASE}/contracts/${generationId}/download`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    let message = `Letöltés sikertelen (${response.status})`;
    try {
      const bodyText = await response.text();
      if (bodyText) {
        message = bodyText;
      }
    } catch {
      // ignore
    }
    throw new ApiError(response.status, message, `/contracts/${generationId}/download`);
  }

  return response.blob();
}

export async function getCaseContracts(caseId: string): Promise<CaseContractListItem[]> {
  const capabilities = await getEditorTemplateCapabilities();
  if (!capabilities.availability.generation) return [];
  return fetchApi<CaseContractListItem[]>(`/contracts/case/${caseId}`);
}

export async function getContractEditDraft(contractId: string): Promise<ContractEditDraftResponse> {
  return fetchApi<ContractEditDraftResponse>(`/contracts/${encodeURIComponent(contractId)}/edit-draft`);
}

export async function saveContractEditDraft(
  contractId: string,
  blocks: Array<{
    id?: string;
    title?: string;
    body?: string;
    orderIndex?: number;
    sourceClauseId?: string | null;
  }>
): Promise<ContractEditDraftSaveResponse> {
  return fetchApi<ContractEditDraftSaveResponse>(`/contracts/${encodeURIComponent(contractId)}/edit-draft`, {
    method: 'PUT',
    body: JSON.stringify({ blocks }),
  });
}

export async function getContractEditSuggestions(
  contractId: string,
  search?: string
): Promise<ContractEditSuggestionsResponse> {
  const query = search && search.trim().length > 0
    ? `?search=${encodeURIComponent(search.trim())}`
    : '';
  return fetchApi<ContractEditSuggestionsResponse>(`/contracts/${encodeURIComponent(contractId)}/edit-suggestions${query}`);
}

export async function generateContractEditDraftRevision(contractId: string): Promise<ContractEditDraftGenerateResponse> {
  return fetchApi<ContractEditDraftGenerateResponse>(`/contracts/${encodeURIComponent(contractId)}/edit-draft/generate`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function uploadGeneratedContractToSharePoint(generationId: string): Promise<{ success: boolean; spItemId?: string; spWebUrl?: string }> {
  return fetchApi<{ success: boolean; spItemId?: string; spWebUrl?: string }>(`/contracts/${generationId}/upload-sharepoint`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function uploadContractRevision(params: { threadId: string; file: File; title?: string; note?: string }): Promise<ContractGenerateResponse> {
  const formData = new FormData();
  formData.append('file', params.file);
  if (params.title) {
    formData.append('title', params.title);
  }
  if (params.note) {
    formData.append('note', params.note);
  }

  const token = await waitForAuthToken(DEFAULT_AUTH_WAIT_MS);
  const response = await fetch(`${API_BASE}/contracts/threads/${encodeURIComponent(params.threadId)}/upload-revision`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!response.ok) {
    let message = `Upload failed (${response.status})`;
    try {
      const body = await response.json();
      if (body && body.message) {
        message = body.message;
      }
    } catch {
      // ignore
    }
    throw new ApiError(response.status, message, `/contracts/threads/${encodeURIComponent(params.threadId)}/upload-revision`);
  }

  return response.json();
}

export async function finalizeContract(threadId: string): Promise<{ success: boolean }> {
  return fetchApi<{ success: boolean }>(`/contracts/threads/${encodeURIComponent(threadId)}/finalize`, {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export async function getThreadRevisions(threadId: string): Promise<ThreadRevisionItem[]> {
  return fetchApi<ThreadRevisionItem[]>(`/contracts/threads/${encodeURIComponent(threadId)}/revisions`);
}

export async function getContractComparison(targetId: string, againstId?: string): Promise<ContractComparisonResponse> {
  const query = againstId ? `?against=${encodeURIComponent(againstId)}` : '';
  return fetchApi<ContractComparisonResponse>(`/contracts/${encodeURIComponent(targetId)}/compare${query}`);
}

// ============================================================================
// MISSING ENDPOINTS IMPLEMENTATION (Phase 3)
// ============================================================================

/**
 * Mark a contract generation as final (locked for editing)
 */
export interface FinalizeContractGenerationResponse {
  success: boolean;
  error?: string;
  contract?: {
    id: string;
    title: string;
    fileName: string;
    status: string;
    isFinalRevision: boolean;
    finalizedAt: string;
  };
}

export async function finalizeContractGeneration(contractId: string): Promise<FinalizeContractGenerationResponse> {
  return fetchApi<FinalizeContractGenerationResponse>(`/contracts/${contractId}/finalize`, {
    method: 'POST',
  });
}

/**
 * Create a revision (new version) of an existing contract generation
 */
export interface CreateContractGenerationRevisionResponse {
  success: boolean;
  error?: string;
  newContract?: {
    id: string;
    title: string;
    fileName: string;
    status: string;
    revisionNumber: number;
  };
}

export async function createContractGenerationRevision(contractId: string): Promise<CreateContractGenerationRevisionResponse> {
  return fetchApi<CreateContractGenerationRevisionResponse>(`/contracts/${contractId}/create-revision`, {
    method: 'POST',
  });
}

/**
 * Download all generated contracts for a case as a ZIP bundle
 */
export async function downloadCaseBundle(caseId: string): Promise<Blob> {
  const token = await waitForAuthToken(DEFAULT_AUTH_WAIT_MS);
  const headers: HeadersInit = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(`${API_BASE}/contracts/case/${caseId}/bundle-download`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    let message = `Bundle download failed (${response.status})`;
    try {
      const bodyText = await response.text();
      if (bodyText) {
        message = bodyText;
      }
    } catch {
      // ignore
    }
    throw new ApiError(response.status, message, `/contracts/case/${caseId}/bundle-download`);
  }

  return response.blob();
}

/**
 * Reject / Undo Approval - move contract back to GENERATED state
 * Also clears the final revision flag
 */
export interface RejectApprovalResponse {
  success: boolean;
  error?: string;
  contract?: {
    id: string;
    title: string;
    status: string;
    isFinalRevision: boolean;
  };
}

export async function rejectApproval(contractId: string, reason?: string): Promise<RejectApprovalResponse> {
  return fetchApi<RejectApprovalResponse>(`/contracts/${contractId}/reject-approval`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

/**
 * Back to Review - move contract to GENERATED state (sent back for review)
 */
export interface BackToReviewResponse {
  success: boolean;
  error?: string;
  contract?: {
    id: string;
    title: string;
    status: string;
  };
}

export async function backToReview(contractId: string, note?: string): Promise<BackToReviewResponse> {
  return fetchApi<BackToReviewResponse>(`/contracts/${contractId}/back-to-review`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}

/**
 * Get document-specific timeline events
 */
export interface ContractTimelineEvent {
  id: string;
  type: string;
  typeLabel: string;
  description: string;
  createdAt: string;
  userId?: string;
  payload?: Record<string, unknown>;
}

export interface ContractTimelineResponse {
  success: boolean;
  error?: string;
  events?: ContractTimelineEvent[];
}

export async function getContractTimeline(contractId: string): Promise<ContractTimelineResponse> {
  return fetchApi<ContractTimelineResponse>(`/contracts/${contractId}/timeline`);
}



// Phase 2A helpers: variant-aware contract validation and generation
export async function getContractTemplateVariables(templateId: string): Promise<ContractTemplateVariable[]> {
  const response = await fetchApi<{ templateId: string; variables: ContractTemplateVariable[] }>(`/contracts/templates/${templateId}/variables`);
  return response.variables || [];
}

export async function getClientProfiles(clientId: string): Promise<ClientProfileSummary[]> {
  return fetchApi<ClientProfileSummary[]>(`/contracts/client-profiles/${clientId}`);
}

export async function validateContractTemplateData(templateId: string, data: Record<string, unknown>): Promise<ValidateTemplatePayloadResponse> {
  return fetchApi<ValidateTemplatePayloadResponse>(`/contracts/templates/${templateId}/validate-data`, {
    method: 'POST',
    body: JSON.stringify({ data }),
  });
}

export interface GenerateForCasePayload {
  caseId: string;
  data: Record<string, unknown>;
  category?: string;
  templateId?: string;
  title?: string;
}

export async function generateContractForCase(payload: GenerateForCasePayload): Promise<ContractGenerateResponse> {
  return fetchApi<ContractGenerateResponse>('/contracts/generate-for-case', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// Timeline Events
export interface TimelineEventItem {
  id: string;
  caseId: string;
  type: string;
  typeLabel: string;
  color: string;
  description: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    role: string;
  } | null;
}

export async function getCaseTimeline(caseId: string): Promise<TimelineEventItem[]> {
  return fetchApi<TimelineEventItem[]>(`/cases/${caseId}/timeline`);
}

// Timeline Events (Phase 2A variant)
export interface DocumentReviewData {
  id: string;
  caseId: string;
  fileName: string;
  documentType: string | null;
  spItemId: string | null;
  spWebUrl: string | null;
  version: string | null;
  folder: string;
  isLatest: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export async function getDocumentById(documentId: string): Promise<DocumentReviewData | null> {
  return fetchApi<DocumentReviewData | null>(`/documents/${documentId}`);
}

export interface DocumentEditorDto {
  document: {
    id: string;
    caseId: string;
    name: string;
    category: string;
    documentType?: string | null;
    currentVersion?: number | null;
    updatedAt?: string | null;
  };
  persistence: {
    mode: 'DEDICATED_EDITOR' | 'FILE_BACKED_VERSION' | 'EXPORT_ONLY';
    serverSaved: boolean;
    savedAt?: string | null;
    versionToken?: string | null;
    contentAvailable: boolean;
  };
  content: null;
  review: {
    status?: string | null;
    relatedTaskId?: string | null;
  };
  capabilities: {
    canView: boolean;
    canEdit: boolean;
    canSave: boolean;
    canSaveNewVersion: boolean;
    canListVersions: boolean;
    canOpenVersion: boolean;
    canRestoreVersion: boolean;
    canSubmitForReview: boolean;
    canApprove: boolean;
    canReturnForCorrection: boolean;
    canCompare: boolean;
    canComment: boolean;
    canExportHtml: boolean;
    canExportText: boolean;
    canPrint: boolean;
    canExportDocx: boolean;
  };
  availability: {
    serverPersistence: boolean;
    autosave: boolean;
    contentVersions: boolean;
    restore: boolean;
    comments: boolean;
    anchoredComments: false;
    docxImport: false;
    docxExport: false;
    liveTrackChanges: false;
  };
}

export async function getDocumentEditorMetadata(documentId: string): Promise<DocumentEditorDto> {
  return fetchApi<DocumentEditorDto>(`/documents/${encodeURIComponent(documentId)}/editor`);
}

export type DocumentCommentStatus = 'OPEN' | 'RESOLVED';

export interface DocumentCommentDto {
  id: string;
  documentId: string;
  author: {
    id: string;
    displayName: string;
  };
  content: string;
  status: DocumentCommentStatus;
  createdAt: string;
  updatedAt?: string | null;
  resolvedAt?: string | null;
  capabilities: {
    canResolve: boolean;
    canReopen: boolean;
    canDelete: false;
  };
}

export interface DocumentCommentsResponse {
  comments: DocumentCommentDto[];
  pagination: {
    limit: number;
    offset: number;
  };
  availability: {
    anchoredComments: false;
    delete: false;
  };
}

export async function getDocumentComments(documentId: string, params: { limit?: number; offset?: number } = {}): Promise<DocumentCommentsResponse> {
  const search = new URLSearchParams();
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.offset !== undefined) search.set('offset', String(params.offset));
  const query = search.toString();
  return fetchApi<DocumentCommentsResponse>(`/documents/${encodeURIComponent(documentId)}/comments${query ? `?${query}` : ''}`);
}

export async function createDocumentComment(documentId: string, content: string): Promise<DocumentCommentDto> {
  return fetchApi<DocumentCommentDto>(`/documents/${encodeURIComponent(documentId)}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export async function resolveDocumentComment(documentId: string, commentId: string): Promise<DocumentCommentDto> {
  return fetchApi<DocumentCommentDto>(
    `/documents/${encodeURIComponent(documentId)}/comments/${encodeURIComponent(commentId)}/resolve`,
    { method: 'POST' }
  );
}

export async function reopenDocumentComment(documentId: string, commentId: string): Promise<DocumentCommentDto> {
  return fetchApi<DocumentCommentDto>(
    `/documents/${encodeURIComponent(documentId)}/comments/${encodeURIComponent(commentId)}/reopen`,
    { method: 'POST' }
  );
}

export interface SaveWorkspaceVersionResult {
  id: string;
  name: string;
  description: string | null;
  caseId: string;
  clientId: string;
  fileName: string;
  documentType: string | null;
  category: string;
  createdAt: string;
  updatedAt: string;
  _workspaceText?: string;
}

export async function saveWorkspaceDocumentVersion(
  documentId: string,
  payload: { text: string; title?: string; note?: string }
): Promise<SaveWorkspaceVersionResult> {
  return fetchApi<SaveWorkspaceVersionResult>(
    `/documents/${documentId}/save-workspace-version`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export type DocumentReviewWorkspaceSource = 'CONTRACT_WORKSPACE' | 'LITIGATION_WORKSPACE';
export type DocumentReviewSuggestionType = 'COMMENT' | 'REPLACEMENT' | 'DELETION';
export type DocumentReviewSuggestionStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface DocumentReviewSuggestion {
  id: string;
  caseId: string;
  documentId: string;
  documentVersionId?: string | null;
  workspaceSource: DocumentReviewWorkspaceSource;
  type: DocumentReviewSuggestionType;
  status: DocumentReviewSuggestionStatus;
  selectedTextPreview: string;
  rangeFrom?: number | null;
  rangeTo?: number | null;
  replacementText?: string | null;
  documentTextHash?: string | null;
  anchorMetadata?: unknown;
  helperText?: string | null;
  authorId?: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
}

export interface CreateDocumentReviewSuggestionPayload {
  workspaceSource: DocumentReviewWorkspaceSource;
  type: DocumentReviewSuggestionType;
  selectedTextPreview: string;
  rangeFrom?: number | null;
  rangeTo?: number | null;
  replacementText?: string | null;
  documentTextHash?: string | null;
  anchorMetadata?: unknown;
  helperText?: string | null;
  documentVersionId?: string | null;
}

export async function listDocumentReviewSuggestions(
  documentId: string,
  filters?: { workspaceSource?: DocumentReviewWorkspaceSource; status?: DocumentReviewSuggestionStatus }
): Promise<DocumentReviewSuggestion[]> {
  const query = new URLSearchParams();
  if (filters?.workspaceSource) query.set('workspaceSource', filters.workspaceSource);
  if (filters?.status) query.set('status', filters.status);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return fetchApi<DocumentReviewSuggestion[]>(`/documents/${documentId}/review-suggestions${suffix}`);
}

export async function createDocumentReviewSuggestion(
  documentId: string,
  payload: CreateDocumentReviewSuggestionPayload
): Promise<DocumentReviewSuggestion> {
  return fetchApi<DocumentReviewSuggestion>(`/documents/${documentId}/review-suggestions`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateDocumentReviewSuggestionStatus(
  documentId: string,
  suggestionId: string,
  status: Extract<DocumentReviewSuggestionStatus, 'ACCEPTED' | 'REJECTED'>
): Promise<DocumentReviewSuggestion> {
  return fetchApi<DocumentReviewSuggestion>(`/documents/${documentId}/review-suggestions/${suggestionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}


// Settings
export async function getSettings(): Promise<Record<string, unknown>> {
  return fetchApi<Record<string, unknown>>('/settings');
}

export async function getUiSettings(): Promise<Record<string, unknown>> {
  return fetchApi<Record<string, unknown>>('/settings/ui');
}

export async function updateUiSettings(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  return fetchApi<Record<string, unknown>>('/settings/ui', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function updateSettingValue(key: string, value: unknown): Promise<{ success: boolean }> {
  return fetchApi<{ success: boolean }>(`/settings/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
}

// Automations (admin/partner endpoints; caller should handle 403)
export async function getAutomationOperabilityStats(windowHours = 24, maxAgeMinutes = 30): Promise<Record<string, unknown>> {
  return fetchApi<Record<string, unknown>>(`/automation/stats/operability?windowHours=${windowHours}&maxAgeMinutes=${maxAgeMinutes}`);
}

export async function getAutomationLevel1Stats(): Promise<Record<string, unknown>> {
  return fetchApi<Record<string, unknown>>('/automation/stats/level1');
}

export async function getAutomationPreferences(): Promise<Record<string, unknown>> {
  return fetchApi<Record<string, unknown>>('/automation/preferences');
}

export async function updateAutomationPreferences(data: {
  suggestionsEnabled?: boolean;
  level1Enabled?: boolean;
  level2Enabled?: boolean;
  level3Enabled?: boolean;
}): Promise<Record<string, unknown>> {
  return fetchApi<Record<string, unknown>>('/automation/preferences', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function createAutomationSuppression(data: {
  suppressionType: 'ACTION_KEY' | 'TEMPLATE_ID';
  value: string;
}): Promise<Record<string, unknown>> {
  return fetchApi<Record<string, unknown>>('/automation/preferences/suppress', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getAutomationSuppressions(): Promise<Array<Record<string, unknown>>> {
  return fetchApi<Array<Record<string, unknown>>>('/automation/preferences/suppressions');
}

export async function deleteAutomationSuppression(id: string): Promise<{ success: boolean; id: string }> {
  return fetchApi<{ success: boolean; id: string }>(`/automation/preferences/suppressions/${id}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// COMMUNICATIONS MODULE - Official Communications Console
// ============================================================================

export interface CommunicationItem {
  id: string;
  type: 'EMAIL' | 'PHONE' | 'MEETING' | 'LETTER' | 'NOTE';
  subject: string | null;
  senderName: string | null;
  senderEmail: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  summary: string | null;
  contentPreview: string | null;
  caseId: string | null;
  clientId: string | null;
  clientColorKey: ClientColorKey | null;
  documentId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  attachmentCount: number;
  sourceTaskCount: number;
  case?: { id: string; caseNumber: string; title: string } | null;
  client?: { id: string; name: string; email: string } | null;
  createdBy?: { id: string; name: string; email: string };
}

export interface CommunicationDetail extends CommunicationItem {
  content: string | null;
  attachments: CommunicationAttachment[];
  relatedTasks: TaskListItem[];
  timelineEvents: CommunicationTimelineEventItem[];
}

export interface CommunicationAttachment {
  id: string;
  fileName: string;
  fileType: string | null;
  description: string | null;
  url: string | null;
  spItemId: string | null;
  communicationId: string;
  documentId: string | null;
  uploadedById: string;
  uploadedBy?: { id: string; name: string };
  createdAt: string;
}

export interface TaskListItem {
  id: string;
  title: string;
  description: string | null;
  taskType: string;
  type: string;
  status: string;
  priority: string;
  dueDate: string | null;
  assignedToId: string | null;
  assignedTo?: { id: string; name: string };
  createdAt: string;
}

export interface CommunicationTimelineEventItem {
  id: string;
  eventType: string;
  type: string | null;
  payload: Record<string, unknown> | null;
  description: string | null;
  createdAt: string;
}

export interface CommunicationsListResponse {
  communications: CommunicationItem[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

export async function getCommunications(params?: {
  caseId?: string;
  clientId?: string;
  type?: string;
  documentId?: string;
  limit?: number;
  offset?: number;
}): Promise<CommunicationsListResponse> {
  const queryParams = new URLSearchParams();
  if (params?.caseId) queryParams.set('caseId', params.caseId);
  if (params?.clientId) queryParams.set('clientId', params.clientId);
  if (params?.type) queryParams.set('type', params.type);
  if (params?.documentId) queryParams.set('documentId', params.documentId);
  if (params?.limit) queryParams.set('limit', String(params.limit));
  if (params?.offset) queryParams.set('offset', String(params.offset));
  
  return fetchApi<CommunicationsListResponse>(`/communications?${queryParams.toString()}`);
}

export async function getCommunicationById(id: string): Promise<CommunicationDetail | null> {
  return fetchApi<CommunicationDetail | null>(`/communications/${id}`);
}

export async function createCommunication(data: {
  type: string;
  subject: string;
  senderName?: string;
  senderEmail?: string;
  recipientName?: string;
  recipientEmail?: string;
  content?: string;
  summary?: string;
  caseId?: string;
  clientId?: string;
  documentId?: string;
}): Promise<CommunicationItem> {
  return fetchApi<CommunicationItem>('/communications', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function linkCommunicationToCase(
  communicationId: string,
  caseId: string
): Promise<{ success: boolean; communication: CommunicationItem; message: string }> {
  return fetchApi<{ success: boolean; communication: CommunicationItem; message: string }>(
    `/communications/${communicationId}/link-case`,
    {
      method: 'POST',
      body: JSON.stringify({ caseId }),
    }
  );
}

export async function getReviewTasks(): Promise<TaskItem[]> {
  return fetchApi<TaskItem[]>('/tasks/review-queue');
}

export async function linkCommunicationToTask(
  communicationId: string,
  taskId: string
): Promise<{
  success: boolean;
  linked: boolean;
  task: { id: string; title: string; caseId: string; status: string; sourceCommunicationId: string | null };
  message: string;
}> {
  return fetchApi(`/communications/${communicationId}/link-task`, {
    method: 'POST',
    body: JSON.stringify({ taskId }),
  });
}

export async function createCaseFromCommunication(
  communicationId: string,
  data: {
    title: string;
    matterType: string;
    clientId?: string;
    clientName?: string;
    priority?: string;
    deadline?: string;
    description?: string;
    task?: {
      title: string;
      description?: string;
      dueDate?: string;
      priority?: string;
    };
  }
): Promise<{
  success: boolean;
  case: { id: string; caseNumber: string; title: string };
  communication: { id: string; caseId: string };
  task?: { id: string; title: string };
}> {
  return fetchApi<{
    success: boolean;
    case: { id: string; caseNumber: string; title: string };
    communication: { id: string; caseId: string };
    task?: { id: string; title: string };
  }>(`/communications/${communicationId}/create-case`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function extractTaskFromCommunication(
  communicationId: string,
  data: {
    title?: string;
    description?: string;
    type?: string;
    priority?: string;
    dueDate?: string;
    assignedTo?: string;
    caseId?: string;
  }
): Promise<{ success: boolean; task: TaskListItem; message: string }> {
  return fetchApi<{ success: boolean; task: TaskListItem; message: string }>(
    `/communications/${communicationId}/extract-task`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
}

export async function extractDeadlineFromCommunication(
  communicationId: string,
  data: {
    deadline: string;
    description?: string;
    priority?: string;
    caseId?: string;
  }
): Promise<{
  success: boolean;
  timelineEvent: TimelineEventItem;
  caseDeadline: string | null;
  message: string;
}> {
  return fetchApi<{
    success: boolean;
    timelineEvent: TimelineEventItem;
    caseDeadline: string | null;
    message: string;
  }>(`/communications/${communicationId}/extract-deadline`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function addCommunicationAttachment(
  communicationId: string,
  data: {
    documentId?: string;
    fileName: string;
    fileType?: string;
    description?: string;
  }
): Promise<{ success: boolean; attachment: CommunicationAttachment; message: string }> {
  return fetchApi<{ success: boolean; attachment: CommunicationAttachment; message: string }>(
    `/communications/${communicationId}/add-attachment`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
}

export async function getCommunicationTasks(communicationId: string): Promise<TaskListItem[]> {
  return fetchApi<TaskListItem[]>(`/communications/${communicationId}/tasks`);
}

export async function getCommunicationAttachments(communicationId: string): Promise<CommunicationAttachment[]> {
  return fetchApi<CommunicationAttachment[]>(`/communications/${communicationId}/attachments`);
}

// ============================================================================
// GENERATION DRAFT - Persisted user-entered generation field data
// ============================================================================

export interface GenerationDraftItem {
  id: string;
  caseId: string;
  templateId: string | null;
  templateName: string | null;
  documentFamily: string | null;
  draftData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
  lastEditedById: string | null;
}

/**
 * Get all drafts for a case, or specific draft if templateId provided
 */
export async function getGenerationDraft(caseId: string, templateId?: string): Promise<GenerationDraftItem | GenerationDraftItem[]> {
  const query = templateId ? `?templateId=${encodeURIComponent(templateId)}` : '';
  return fetchApi<GenerationDraftItem | GenerationDraftItem[]>(`/generation-drafts/${caseId}${query}`);
}

/**
 * Upsert (create or update) draft
 */
export async function saveGenerationDraft(data: {
  caseId: string;
  templateId?: string;
  templateName?: string;
  documentFamily?: string;
  draftData: Record<string, unknown>;
}): Promise<{ id: string; isNew: boolean }> {
  return fetchApi<{ id: string; isNew: boolean }>(`/generation-drafts/${data.caseId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/**
 * Delete draft(s) for a case
 */
export async function deleteGenerationDraft(caseId: string, templateId?: string): Promise<{ success: boolean }> {
  const query = templateId ? `?templateId=${encodeURIComponent(templateId)}` : '';
  return fetchApi<{ success: boolean }>(`/generation-drafts/${caseId}${query}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// TIME ENTRIES - Billable hours tracking
// ============================================================================

export interface TimeEntry {
  id: string;
  matterId: string;
  taskId?: string | null;
  userId: string | null;
  departmentId: string | null;
  workType: string;
  description: string;
  minutes: number;
  workDate: string;
  billable: boolean;
  createdAt: string;
  updatedAt: string;
  matter?: {
    id: string;
    title: string;
    clientId?: string;
    client?: { id: string; name: string } | null;
    cases?: Array<{
      id: string;
      caseNumber: string;
      title: string;
      clientId?: string;
      clientName?: string | null;
      updatedAt?: string;
    }>;
  } | null;
  user?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
}

export interface TimeEntrySummary {
  totalEntries: number;
  totalMinutes: number;
  totalHours: string;
  byDepartment: Array<{
    departmentId: string | null;
    departmentName: string;
    entries: number;
    minutes: number;
    hours: string;
  }>;
}

export interface TimeEntryFilters {
  matterId?: string;
  userId?: string;
  workType?: string;
  startDate?: string;
  endDate?: string;
  departmentId?: string;
}

export type TimesheetTemplateFamily = 'HU_DETAILED_MONTHLY' | 'CORPORATE_SUMMARY';

export interface TimesheetTemplateField {
  key: string;
  label: string;
  type: 'text' | 'month' | 'number' | 'boolean' | 'textarea';
  required: boolean;
  description?: string;
}

export interface TimesheetReportTemplate {
  id: string;
  name: string;
  family: TimesheetTemplateFamily;
  language: 'hu' | 'en';
  style: 'DETAILED' | 'SUMMARY';
  isActive: boolean;
  headerFields: TimesheetTemplateField[];
  rowFields: TimesheetTemplateField[];
  footerFields: TimesheetTemplateField[];
}

export interface TimesheetReportRowInput {
  date?: string;
  taskDate?: string;
  description: string;
  lawyer: string;
  hours: number;
}

export interface GenerateTimesheetReportInput {
  templateId: string;
  reportPeriod: string;
  clientName: string;
  matterName?: string;
  caseReference?: string;
  monthlyClosure?: string;
  carriedHours?: number;
  overtimeHours?: number;
  aboveThresholdHours?: number;
  pendingOpenMattersNote?: string;
  rows: TimesheetReportRowInput[];
}

export interface TimesheetAutofillFilters {
  reportPeriod: string;
  clientId?: string;
  matterId?: string;
  caseId?: string;
  lawyerId?: string;
  lawyerName?: string;
  billableOnly?: boolean;
}

export interface TimesheetPreset {
  id: string;
  name: string;
  templateId: string;
  templateFamily?: TimesheetTemplateFamily;
  layer?: 'TEMPLATE_DEFAULT' | 'LAWYER_DEFAULT' | 'CLIENT_DEFAULT' | 'CLIENT_LAWYER_OVERRIDE';
  lawyerId?: string;
  lawyerName?: string;
  clientId?: string;
  clientName?: string;
  isActive?: boolean;
  defaults: {
    monthlyClosure?: string;
    pendingOpenMattersNote?: string;
    lawyerName?: string;
    clientClosingText?: string;
  };
  resolution?: {
    appliedLayers: string[];
    fieldSources: {
      monthlyClosure?: string;
      pendingOpenMattersNote?: string;
      lawyerName?: string;
      clientClosingText?: string;
    };
  };
}

export interface CreateTimesheetPresetInput {
  name: string;
  templateFamily: TimesheetTemplateFamily;
  layer: 'TEMPLATE_DEFAULT' | 'LAWYER_DEFAULT' | 'CLIENT_DEFAULT' | 'CLIENT_LAWYER_OVERRIDE';
  lawyerId?: string;
  lawyerName?: string;
  clientId?: string;
  clientName?: string;
  monthlyClosure?: string;
  pendingOpenMattersNote?: string;
  clientClosingText?: string;
  defaultLawyerName?: string;
  isActive?: boolean;
}

export type UpdateTimesheetPresetInput = Partial<CreateTimesheetPresetInput>;

export interface TimesheetAutofillResponse {
  filters: {
    reportPeriod: string;
    startDate: string;
    endDateExclusive: string;
    clientId: string | null;
    matterId: string | null;
    caseId: string | null;
    lawyerId: string | null;
    lawyerName: string | null;
    billableOnly: boolean;
  };
  rows: TimesheetReportRowInput[];
  sourceCount: number;
}

export interface GeneratedTimesheetReportPayload {
  reportId: string;
  generatedAt: string;
  template: {
    id: string;
    name: string;
    family: TimesheetTemplateFamily;
    language: 'hu' | 'en';
    style: 'DETAILED' | 'SUMMARY';
  };
  header: {
    reportPeriod: string;
    clientName: string;
    matterName: string | null;
    caseReference: string | null;
  };
  rows: Array<{
    rowNumber: number;
    date: string | null;
    description: string;
    lawyer: string;
    hours: number;
  }>;
  totals: {
    rowCount: number;
    totalHours: number;
    carriedHours: number;
    overtimeHours: number;
    aboveThresholdHours: number;
    finalHours: number;
  };
  footer: {
    monthlyClosure: string | null;
    pendingOpenMattersNote: string | null;
  };
  exportPayload: Record<string, unknown>;
}

export interface RenderedTimesheetReportOutput {
  fileName: string;
  mimeType: 'text/plain' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  format: 'TEXT_V1' | 'DOCX_V1';
  content?: string;
  contentBase64?: string;
}

export type RenderedTimesheetReportPayload = GeneratedTimesheetReportPayload & {
  renderedOutput: RenderedTimesheetReportOutput;
};

export type TimesheetReportInstanceStatus = 'DRAFT' | 'GENERATED';

export interface SaveTimesheetReportInstanceInput {
  templateId: string;
  reportPeriod: string;
  clientId?: string;
  clientName?: string;
  matterId?: string;
  matterName?: string;
  caseId?: string;
  caseReference?: string;
  presetId?: string;
  monthlyClosure?: string;
  pendingOpenMattersNote?: string;
  clientClosingText?: string;
  defaultLawyerName?: string;
  carriedHours?: number;
  overtimeHours?: number;
  aboveThresholdHours?: number;
  rows: TimesheetReportRowInput[];
  status?: TimesheetReportInstanceStatus;
}

export interface TimesheetReportInstancePayload {
  id: string;
  templateId: string;
  templateFamily: TimesheetTemplateFamily;
  reportPeriod: string;
  clientId: string | null;
  clientName: string | null;
  matterId: string | null;
  matterName: string | null;
  caseId: string | null;
  caseReference: string | null;
  presetId: string | null;
  monthlyClosure: string | null;
  pendingOpenMattersNote: string | null;
  clientClosingText: string | null;
  defaultLawyerName: string | null;
  carriedHours: number;
  overtimeHours: number;
  aboveThresholdHours: number;
  rows: TimesheetReportRowInput[];
  totalsSnapshot: {
    rowCount: number;
    totalHours: number;
    carriedHours: number;
    overtimeHours: number;
    aboveThresholdHours: number;
    finalHours: number;
  };
  status: TimesheetReportInstanceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TimesheetReportArtifactPayload {
  id: string;
  reportInstanceId: string;
  format: 'TEXT_V1' | 'DOCX_V1';
  mimeType: string;
  fileName: string;
  content?: string;
  contentBase64?: string;
  createdAt: string;
}

export async function getTimeEntries(filters?: TimeEntryFilters): Promise<TimeEntry[]> {
  const queryParams = new URLSearchParams();
  if (filters?.matterId) queryParams.set('matterId', filters.matterId);
  if (filters?.userId) queryParams.set('userId', filters.userId);
  if (filters?.workType) queryParams.set('workType', filters.workType);
  if (filters?.startDate) queryParams.set('startDate', filters.startDate);
  if (filters?.endDate) queryParams.set('endDate', filters.endDate);
  const query = queryParams.toString();
  return fetchApi<TimeEntry[]>(`/time-entries${query ? `?${query}` : ''}`);
}

export async function getTimeEntrySummary(filters?: TimeEntryFilters): Promise<TimeEntrySummary> {
  const queryParams = new URLSearchParams();
  if (filters?.matterId) queryParams.set('matterId', filters.matterId);
  if (filters?.userId) queryParams.set('userId', filters.userId);
  if (filters?.departmentId) queryParams.set('departmentId', filters.departmentId);
  if (filters?.startDate) queryParams.set('startDate', filters.startDate);
  if (filters?.endDate) queryParams.set('endDate', filters.endDate);
  const query = queryParams.toString();
  return fetchApi<TimeEntrySummary>(`/time-entries/summary${query ? `?${query}` : ''}`);
}

export async function getTimeEntryById(id: string): Promise<TimeEntry> {
  return fetchApi<TimeEntry>(`/time-entries/${encodeURIComponent(id)}`);
}

export interface CreateTimeEntryData {
  matterId: string;
  workType: string;
  description: string;
  minutes: number;
  workDate?: string;
  departmentId?: string;
  caseId?: string;
  billable?: boolean;
}

export async function createTimeEntry(data: CreateTimeEntryData): Promise<TimeEntry> {
  return fetchApi<TimeEntry>('/time-entries', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface UpdateTimeEntryData {
  workType?: string;
  description?: string;
  minutes?: number;
  workDate?: string;
  departmentId?: string;
  billable?: boolean;
}

export async function updateTimeEntry(id: string, data: UpdateTimeEntryData): Promise<TimeEntry> {
  return fetchApi<TimeEntry>(`/time-entries/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteTimeEntry(id: string): Promise<{ message: string }> {
  return fetchApi<{ message: string }>(`/time-entries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export interface WorkflowWorkloadResponse {
  scope: 'MY_WORK' | 'MY_CASES' | 'TEAM';
  generatedAt: string;
  summary: {
    caseCount: number;
    openTaskCount: number;
    overdueTaskCount: number;
    dueSoonTaskCount: number;
    recordedMinutes: number;
    activeTimerSupported: boolean;
  };
  people: Array<{
    user: { id: string; name: string | null; email: string | null; role: string | null };
    openTaskCount: number;
    overdueTaskCount: number;
    dueSoonTaskCount: number;
    reviewTaskCount: number;
    blockedTaskCount: number;
    recordedMinutes: number;
    caseCount: number;
  }>;
  cases: Array<{
    id: string;
    caseNumber: string;
    title: string;
    status: string;
    deadline: string | null;
    matterId: string | null;
    responsibleLawyerId: string | null;
    openTaskCount: number;
    overdueTaskCount: number;
    dueSoonTaskCount: number;
  }>;
  availability: {
    teamScope: boolean;
    caseTime: boolean;
    activeTimer: boolean;
    passiveTracking: boolean;
  };
}

export async function getWorkflowWorkload(params?: {
  scope?: 'MY_WORK' | 'MY_CASES' | 'TEAM';
  caseId?: string;
}): Promise<WorkflowWorkloadResponse> {
  const queryParams = new URLSearchParams();
  if (params?.scope) queryParams.set('scope', params.scope);
  if (params?.caseId) queryParams.set('caseId', params.caseId);
  const query = queryParams.toString();
  return fetchApi<WorkflowWorkloadResponse>(`/workload${query ? `?${query}` : ''}`);
}

export async function getTimesheetReportTemplates(): Promise<TimesheetReportTemplate[]> {
  return fetchApi<TimesheetReportTemplate[]>('/timesheet-reports/templates');
}

export async function getTimesheetReportPresets(): Promise<TimesheetPreset[]> {
  return fetchApi<TimesheetPreset[]>('/timesheet-reports/presets');
}

export async function getTimesheetReportPreset(id: string): Promise<TimesheetPreset> {
  return fetchApi<TimesheetPreset>(`/timesheet-reports/presets/${encodeURIComponent(id)}`);
}

export async function createTimesheetReportPreset(data: CreateTimesheetPresetInput): Promise<TimesheetPreset> {
  return fetchApi<TimesheetPreset>('/timesheet-reports/presets', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateTimesheetReportPreset(id: string, data: UpdateTimesheetPresetInput): Promise<TimesheetPreset> {
  return fetchApi<TimesheetPreset>(`/timesheet-reports/presets/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deactivateTimesheetReportPreset(id: string): Promise<TimesheetPreset> {
  return fetchApi<TimesheetPreset>(`/timesheet-reports/presets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function resolveTimesheetPreset(data: {
  presetId?: string;
  templateId?: string;
  clientId?: string;
  clientName?: string;
  lawyerId?: string;
  lawyerName?: string;
}): Promise<TimesheetPreset> {
  return fetchApi<TimesheetPreset>('/timesheet-reports/preset/resolve', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function autofillTimesheetReportRows(
  filters: TimesheetAutofillFilters
): Promise<TimesheetAutofillResponse> {
  return fetchApi<TimesheetAutofillResponse>('/timesheet-reports/autofill', {
    method: 'POST',
    body: JSON.stringify(filters),
  });
}

export async function generateTimesheetReportPayload(
  data: GenerateTimesheetReportInput
): Promise<GeneratedTimesheetReportPayload> {
  return fetchApi<GeneratedTimesheetReportPayload>('/timesheet-reports/generate', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function renderTimesheetReportOutput(
  data: GenerateTimesheetReportInput
): Promise<RenderedTimesheetReportPayload> {
  return fetchApi<RenderedTimesheetReportPayload>('/timesheet-reports/render', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function renderTimesheetReportDocxOutput(
  data: GenerateTimesheetReportInput
): Promise<RenderedTimesheetReportPayload> {
  return fetchApi<RenderedTimesheetReportPayload>('/timesheet-reports/render-docx', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listTimesheetReportInstances(limit = 30): Promise<TimesheetReportInstancePayload[]> {
  return fetchApi<TimesheetReportInstancePayload[]>(`/timesheet-reports/instances?limit=${Math.max(1, Math.min(200, Number(limit) || 30))}`);
}

export async function getTimesheetReportInstance(id: string): Promise<TimesheetReportInstancePayload> {
  return fetchApi<TimesheetReportInstancePayload>(`/timesheet-reports/instances/${encodeURIComponent(id)}`);
}

export async function createTimesheetReportInstance(
  data: SaveTimesheetReportInstanceInput
): Promise<TimesheetReportInstancePayload> {
  return fetchApi<TimesheetReportInstancePayload>('/timesheet-reports/instances', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateTimesheetReportInstance(
  id: string,
  data: SaveTimesheetReportInstanceInput
): Promise<TimesheetReportInstancePayload> {
  return fetchApi<TimesheetReportInstancePayload>(`/timesheet-reports/instances/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function renderTimesheetReportInstanceOutput(id: string): Promise<RenderedTimesheetReportPayload> {
  return fetchApi<RenderedTimesheetReportPayload>(`/timesheet-reports/instances/${encodeURIComponent(id)}/render`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function renderTimesheetReportInstanceDocxOutput(id: string): Promise<RenderedTimesheetReportPayload> {
  return fetchApi<RenderedTimesheetReportPayload>(`/timesheet-reports/instances/${encodeURIComponent(id)}/render-docx`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function listTimesheetReportArtifacts(instanceId: string, limit = 30): Promise<TimesheetReportArtifactPayload[]> {
  return fetchApi<TimesheetReportArtifactPayload[]>(`/timesheet-reports/instances/${encodeURIComponent(instanceId)}/artifacts?limit=${Math.max(1, Math.min(200, Number(limit) || 30))}`);
}

export async function getTimesheetReportArtifact(instanceId: string, artifactId: string): Promise<TimesheetReportArtifactPayload> {
  return fetchApi<TimesheetReportArtifactPayload>(`/timesheet-reports/instances/${encodeURIComponent(instanceId)}/artifacts/${encodeURIComponent(artifactId)}`);
}

// ============================================================================
// MATTERS - Legal matters / projects
// ============================================================================

export type MatterType = 'REAL_ESTATE' | 'EMPLOYMENT' | 'CONTRACT' | 'LITIGATION' | 'COMPLIANCE' | 'CORPORATE' | 'IP' | 'MERGERS_ACQUISITIONS' | 'OTHER';
export type MatterStatus = 'OPEN' | 'ON_HOLD' | 'CLOSED';

export interface Matter {
  id: string;
  title: string;
  description: string | null;
  matterType: MatterType;
  status: MatterStatus;
  budgetHours: number | null;
  totalMinutes: number;
  openedAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  clientId: string;
  departmentId: string | null;
  client: { id: string; name: string } | null;
  department: { id: string; name: string } | null;
  _count?: { cases: number; timeEntries: number };
  totalHours?: string;
}

export interface MatterDetail extends Matter {
  cases: Array<{
    id: string;
    caseNumber: string;
    title: string;
    assignedLawyer: { id: string; name: string } | null;
  }>;
  timeEntries: Array<{
    id: string;
    workType: string;
    description: string;
    minutes: number;
    workDate: string;
    billable: boolean;
    user: { id: string; name: string } | null;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
  }>;
  totalMinutes: number;
  totalHours: string;
}

export interface MatterTimeSummary {
  totalEntries: number;
  totalMinutes: number;
  totalHours: string;
  byWorkType: Array<{
    workType: string;
    entries: number;
    minutes: number;
    hours: string;
  }>;
  byUser: Array<{
    userId: string;
    userName: string;
    minutes: number;
    hours: string;
  }>;
  byDepartment: Array<{
    departmentId: string;
    departmentName: string;
    minutes: number;
    hours: string;
  }>;
  entries: Array<{
    id: string;
    workType: string;
    description: string;
    minutes: number;
    workDate: string;
    billable: boolean;
    user: { id: string; name: string } | null;
    department: { id: string; name: string } | null;
  }>;
}

export interface MatterFilters {
  clientId?: string;
  departmentId?: string;
  status?: MatterStatus;
  matterType?: MatterType;
}

export async function getMatters(filters?: MatterFilters): Promise<Matter[]> {
  const queryParams = new URLSearchParams();
  if (filters?.clientId) queryParams.set('clientId', filters.clientId);
  if (filters?.departmentId) queryParams.set('departmentId', filters.departmentId);
  if (filters?.status) queryParams.set('status', filters.status);
  if (filters?.matterType) queryParams.set('matterType', filters.matterType);
  const query = queryParams.toString();
  return fetchApi<Matter[]>(`/matters${query ? `?${query}` : ''}`);
}

export async function getMatter(id: string): Promise<MatterDetail> {
  return fetchApi<MatterDetail>(`/matters/${encodeURIComponent(id)}`);
}

export interface CreateMatterData {
  title: string;
  description?: string;
  matterType: MatterType;
  clientId: string;
  departmentId?: string;
  budgetHours?: number;
}

export async function createMatter(data: CreateMatterData): Promise<Matter> {
  return fetchApi<Matter>('/matters', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface UpdateMatterData {
  title?: string;
  description?: string;
  matterType?: MatterType;
  status?: MatterStatus;
  departmentId?: string;
  budgetHours?: number;
}

export async function updateMatter(id: string, data: UpdateMatterData): Promise<Matter> {
  return fetchApi<Matter>(`/matters/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function getMatterTimeSummary(id: string): Promise<MatterTimeSummary> {
  return fetchApi<MatterTimeSummary>(`/matters/${encodeURIComponent(id)}/time-summary`);
}

// ============================================================================
// WORKGROUPS - Client workload tracking
// ============================================================================

export interface Workgroup {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkloadRecord {
  id: string;
  workgroupId: string;
  period: string;
  reportedHours: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkloadSummaryItem {
  id: string;
  name: string;
  hours: number;
  percentage: number;
}

export interface WorkloadSummary {
  clientId: string;
  period: string;
  totalHours: number;
  workgroups: WorkloadSummaryItem[];
}

export async function getClientWorkgroups(clientId: string): Promise<Workgroup[]> {
  return fetchApi<Workgroup[]>(`/clients/${encodeURIComponent(clientId)}/workgroups`);
}

export async function getWorkgroup(id: string): Promise<Workgroup> {
  return fetchApi<Workgroup>(`/workgroups/${encodeURIComponent(id)}`);
}

export interface CreateWorkgroupData {
  name: string;
  description?: string;
}

export async function createWorkgroup(clientId: string, data: CreateWorkgroupData): Promise<Workgroup> {
  return fetchApi<Workgroup>(`/clients/${encodeURIComponent(clientId)}/workgroups`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface UpdateWorkgroupData {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export async function updateWorkgroup(id: string, data: UpdateWorkgroupData): Promise<Workgroup> {
  return fetchApi<Workgroup>(`/workgroups/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteWorkgroup(id: string): Promise<void> {
  await fetchApi<void>(`/workgroups/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export interface CreateWorkloadData {
  period: string;
  reportedHours: number;
  note?: string;
}

export async function recordWorkload(workgroupId: string, data: CreateWorkloadData): Promise<WorkloadRecord> {
  return fetchApi<WorkloadRecord>(`/workgroups/${encodeURIComponent(workgroupId)}/workload`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getWorkgroupWorkload(workgroupId: string): Promise<WorkloadRecord[]> {
  return fetchApi<WorkloadRecord[]>(`/workgroups/${encodeURIComponent(workgroupId)}/workload`);
}

export async function getClientWorkloadSummary(clientId: string, period: string): Promise<WorkloadSummary> {
  return fetchApi<WorkloadSummary>(`/clients/${encodeURIComponent(clientId)}/workload-summary?period=${encodeURIComponent(period)}`);
}

// ============================================================================
// CLAUSE LIBRARY — Contract Assembly Foundation
// ============================================================================

export type ClauseContractType = 'ADASVETEL' | 'BERLET' | 'MEGBIZAS' | 'MUNKASZERZODES' | 'VALLALKOZAS' | 'EGYEB';
export type ClauseKind = 'REQUIRED' | 'RECOMMENDED' | 'OPTIONAL' | 'SPECIAL';
export type RepresentedSide = 'EITHER' | 'ELOADO' | 'VEVO' | 'NEUTRAL';
export type ClauseCategory = 'PARTY' | 'PROPERTY' | 'OWNERSHIP_PROOF' | 'TITLE' | 'WARRANTIES' | 'PRICE' | 'FINANCING' | 'POSSESSION' | 'CLOSING' | 'SPECIAL';
export type AssemblyStatus = 'IN_PROGRESS' | 'READY' | 'GENERATED';

export interface ClauseLibraryItem {
  id: string;
  title: string;
  slug: string;
  body: string;
  summary: string | null;
  contractType: ClauseContractType;
  clauseKind: ClauseKind;
  representedSide: RepresentedSide;
  category: ClauseCategory;
  keywords: string[];
  isActive: boolean;
  sortOrder: number;
  version: number;
  sourceType: string | null;
  bankPackTag: string | null;
  lawyerProfileId: string | null;
  triggerConditions: TriggerCondition[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface TriggerCondition {
  field: string;
  operator: 'eq' | 'neq' | 'in' | 'nin' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'exists';
  value: any;
}

export interface ClauseRecommendation {
  clauseId: string;
  slug: string;
  title: string;
  kind: ClauseKind;
  representedSide: RepresentedSide;
  category: ClauseCategory;
  triggerMatched: TriggerCondition[];
  reason: string;
}

export interface LawyerProfile {
  id: string;
  lawyerName: string;
  lawyerEmail: string | null;
  preferredNumbering: string | null;
  defaultClosingText: string | null;
  styleNotes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AssemblyClauseEntry {
  clauseId: string;
  sortOrder: number;
  editedBody: string | null;
  isManual: boolean;
}

export interface ContractAssemblyDraft {
  id: string;
  caseId: string;
  contractType: ClauseContractType;
  intakeData: Record<string, unknown>;
  selectedClauses: Array<{
    id: string;
    clauseId: string;
    sortOrder: number;
    editedBody: string | null;
    isManual: boolean;
    clause: {
      id: string;
      title: string;
      slug: string;
      body: string;
      summary: string | null;
      clauseKind: ClauseKind;
      representedSide: RepresentedSide;
      category: ClauseCategory;
    };
  }>;
  assembledText: string | null;
  status: AssemblyStatus;
  lawyerProfileId: string | null;
  lawyerProfile: LawyerProfile | null;
  templateId: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
}

export interface ClauseGuidanceItem {
  clauseId: string;
  slug: string;
  title: string;
  kind: ClauseKind;
  category: ClauseCategory;
  reason: string;
}

export interface ReviewGuidanceResult {
  documentId: string;
  contractType: ClauseContractType;
  analyzedField: string;
  detected: ClauseGuidanceItem[];
  missing: ClauseGuidanceItem[];
  suggested: ClauseGuidanceItem[];
}

// Clause CRUD
export async function getClauseLibraryClauses(params?: {
  contractType?: ClauseContractType;
  clauseKind?: ClauseKind;
  representedSide?: RepresentedSide;
  category?: ClauseCategory;
  lawyerProfileId?: string | null;
  includeInactive?: boolean;
  search?: string;
}): Promise<ClauseLibraryItem[]> {
  const q = new URLSearchParams();
  if (params?.contractType) q.set('contractType', params.contractType);
  if (params?.clauseKind) q.set('clauseKind', params.clauseKind);
  if (params?.representedSide) q.set('representedSide', params.representedSide);
  if (params?.category) q.set('category', params.category);
  if (params?.lawyerProfileId !== undefined) q.set('lawyerProfileId', params.lawyerProfileId ?? 'null');
  if (params?.includeInactive) q.set('includeInactive', 'true');
  if (params?.search) q.set('search', params.search);
  const query = q.toString();
  return fetchApi<ClauseLibraryItem[]>(`/clause-library/clauses${query ? `?${query}` : ''}`);
}

export async function getClauseLibraryClause(id: string): Promise<ClauseLibraryItem> {
  return fetchApi<ClauseLibraryItem>(`/clause-library/clauses/${id}`);
}

export async function createClauseLibraryClause(data: {
  title: string;
  slug: string;
  body: string;
  summary?: string;
  contractType: ClauseContractType;
  clauseKind: ClauseKind;
  representedSide: RepresentedSide;
  category: ClauseCategory;
  keywords?: string[];
  triggerConditions?: TriggerCondition[];
  sortOrder?: number;
  sourceType?: string;
  bankPackTag?: string;
  lawyerProfileId?: string;
}): Promise<ClauseLibraryItem> {
  return fetchApi<ClauseLibraryItem>('/clause-library/clauses', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateClauseLibraryClause(id: string, data: Partial<{
  title: string;
  slug: string;
  body: string;
  summary: string;
  keywords: string[];
  triggerConditions: TriggerCondition[];
  sortOrder: number;
  isActive: boolean;
  clauseKind: ClauseKind;
  representedSide: RepresentedSide;
  category: ClauseCategory;
}>): Promise<ClauseLibraryItem> {
  return fetchApi<ClauseLibraryItem>(`/clause-library/clauses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteClauseLibraryClause(id: string): Promise<{ success: boolean }> {
  return fetchApi<{ success: boolean }>(`/clause-library/clauses/${id}`, {
    method: 'DELETE',
  });
}

// Lawyer Profiles
export async function getClauseLibraryProfiles(): Promise<LawyerProfile[]> {
  return fetchApi<LawyerProfile[]>('/clause-library/lawyer-profiles');
}

export async function getClauseLibraryProfile(id: string): Promise<LawyerProfile> {
  return fetchApi<LawyerProfile>(`/clause-library/lawyer-profiles/${id}`);
}

export async function upsertClauseLibraryProfile(data: {
  lawyerName: string;
  lawyerEmail?: string;
  preferredNumbering?: string;
  defaultClosingText?: string;
  styleNotes?: string;
}): Promise<LawyerProfile> {
  // Use lawyerEmail as unique key by passing it in the body (backend does upsert by email)
  return fetchApi<LawyerProfile>('/clause-library/lawyer-profiles/upsert', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// Clause Recommendation
export async function recommendClauses(params: {
  contractType: ClauseContractType;
  intakeData: Record<string, unknown>;
  lawyerProfileId?: string;
}): Promise<ClauseRecommendation[]> {
  return fetchApi<ClauseRecommendation[]>('/clause-library/assembly/recommend', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// Assembly Draft Management
export async function getClauseLibraryAssembly(caseId: string): Promise<ContractAssemblyDraft> {
  return fetchApi<ContractAssemblyDraft>(`/clause-library/assembly/${encodeURIComponent(caseId)}`);
}

export async function upsertClauseLibraryAssembly(data: {
  caseId: string;
  contractType?: ClauseContractType;
  intakeData: Record<string, unknown>;
  selectedClauses: AssemblyClauseEntry[];
  assembledText?: string;
  status?: AssemblyStatus;
  lawyerProfileId?: string;
  templateId?: string;
}): Promise<ContractAssemblyDraft> {
  return fetchApi<ContractAssemblyDraft>(`/clause-library/assembly/${encodeURIComponent(data.caseId)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function updateClauseLibraryAssemblyStatus(
  caseId: string,
  status: AssemblyStatus
): Promise<ContractAssemblyDraft> {
  return fetchApi<ContractAssemblyDraft>(`/clause-library/assembly/${encodeURIComponent(caseId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function deleteClauseLibraryAssembly(caseId: string): Promise<{ success: boolean }> {
  return fetchApi<{ success: boolean }>(`/clause-library/assembly/${encodeURIComponent(caseId)}`, {
    method: 'DELETE',
  });
}

export async function getClauseLibraryReviewGuidance(data: {
  documentId: string;
  contractType?: ClauseContractType;
  lawyerProfileId?: string;
}): Promise<ReviewGuidanceResult> {
  return fetchApi<ReviewGuidanceResult>('/clause-library/review-guidance', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ============================================================================
// REVIEW NOTES — Patch 6A: Persisted per-revision review notes
// ============================================================================
// Routes: GET/PUT /api/v1/contracts/:generationId/review-notes
// Backend: Backend/src/modules/review-notes/routes.ts

export type ReviewOverallStatus = 'NEEDS_REVISION' | 'APPROVED_FOR_NEXT_STEP' | 'FLAGGED';
export type BlockReviewStatus = 'OK' | 'REVIEW_NEEDED' | 'RISK_ISSUE';

export interface BlockNoteData {
  blockKey: string;
  blockOrderIndex?: number;
  sourceClauseId?: string;
  status: BlockReviewStatus;
  title?: string;
  note?: string;
}

export interface ReviewNotesResult {
  id: string;
  generationId: string;
  overallStatus: ReviewOverallStatus;
  overallTitle?: string;
  overallNote?: string;
  authorId?: string;
  createdAt: string;
  updatedAt: string;
  blockNotes: {
    id: string;
    blockKey: string;
    blockOrderIndex?: number;
    sourceClauseId?: string;
    status: BlockReviewStatus;
    title?: string;
    note?: string;
    createdAt: string;
    updatedAt: string;
  }[];
}

export async function getReviewNotes(generationId: string): Promise<ReviewNotesResult | null> {
  return fetchApi<ReviewNotesResult | null>(`/contracts/${generationId}/review-notes`);
}

export async function saveReviewNotes(data: {
  generationId: string;
  overallStatus: ReviewOverallStatus;
  overallTitle?: string;
  overallNote?: string;
  authorId?: string;
  blockNotes?: BlockNoteData[];
}): Promise<ReviewNotesResult> {
  return fetchApi<ReviewNotesResult>(`/contracts/${data.generationId}/review-notes`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function downloadReviewSummary(generationId: string): Promise<Blob> {
  const token = await waitForAuthToken(DEFAULT_AUTH_WAIT_MS);
  const headers: HeadersInit = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const endpoint = `/contracts/${encodeURIComponent(generationId)}/review-summary.txt`;
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    let message = `Review summary export failed (${response.status})`;
    try {
      const bodyText = await response.text();
      if (bodyText) {
        message = bodyText;
      }
    } catch {
      // ignore
    }
    throw new ApiError(response.status, message, endpoint);
  }

  return response.blob();
}

// ============================================================================
// LAWYER HANDOFF PACKAGES — v1A
// ============================================================================

export type LawyerHandoffPackageType =
  | 'STANDARD'
  | 'FINAL_APPROVAL';

export type LawyerHandoffStatus =
  | 'DRAFT'
  | 'PREPARED'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'ARCHIVED';

export type LawyerHandoffDecision =
  | 'APPROVED'
  | 'REJECTED_NEEDS_REVISION'
  | 'REJECTED_BLOCKING';

export interface LawyerHandoffPackageRecord {
  id: string;
  caseId: string;
  packageType: LawyerHandoffPackageType;
  status: LawyerHandoffStatus;
  sourceDocumentId?: string | null;
  anonymizedDocumentId?: string | null;
  generatedContractId?: string | null;
  legalAnalysisId?: string | null;
  reviewNotesId?: string | null;
  preparerSummary?: string | null;
  preparedById?: string | null;
  submittedAt?: string | null;
  reviewedById?: string | null;
  reviewedAt?: string | null;
  reviewDecision?: LawyerHandoffDecision | null;
  reviewComment?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLawyerHandoffPackagePayload {
  sourceDocumentId?: string;
  anonymizedDocumentId?: string;
  generatedContractId?: string;
  legalAnalysisId?: string;
  reviewNotesId?: string;
  preparerSummary?: string;
  packageType?: LawyerHandoffPackageType;
}

export interface UpdateLawyerHandoffPackagePayload {
  sourceDocumentId?: string | null;
  anonymizedDocumentId?: string | null;
  generatedContractId?: string | null;
  legalAnalysisId?: string | null;
  reviewNotesId?: string | null;
  preparerSummary?: string | null;
  status?: LawyerHandoffStatus;
}

export interface ReviewLawyerHandoffPackagePayload {
  decision: LawyerHandoffDecision;
  reviewComment?: string;
}

export async function listCaseHandoffPackages(
  caseId: string
): Promise<LawyerHandoffPackageRecord[]> {
  return fetchApi<LawyerHandoffPackageRecord[]>(
    `/cases/${encodeURIComponent(caseId)}/handoff-packages`
  );
}

export async function createCaseHandoffPackage(
  caseId: string,
  payload: CreateLawyerHandoffPackagePayload
): Promise<LawyerHandoffPackageRecord> {
  return fetchApi<LawyerHandoffPackageRecord>(
    `/cases/${encodeURIComponent(caseId)}/handoff-packages`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function getHandoffPackage(
  id: string
): Promise<LawyerHandoffPackageRecord> {
  return fetchApi<LawyerHandoffPackageRecord>(
    `/handoff-packages/${encodeURIComponent(id)}`
  );
}

export async function updateHandoffPackage(
  id: string,
  payload: UpdateLawyerHandoffPackagePayload
): Promise<LawyerHandoffPackageRecord> {
  return fetchApi<LawyerHandoffPackageRecord>(
    `/handoff-packages/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
}

export async function archiveHandoffPackage(
  id: string
): Promise<LawyerHandoffPackageRecord> {
  return fetchApi<LawyerHandoffPackageRecord>(
    `/handoff-packages/${encodeURIComponent(id)}/archive`,
    {
      method: 'POST',
    }
  );
}

export async function reviewHandoffPackage(
  id: string,
  payload: ReviewLawyerHandoffPackagePayload
): Promise<LawyerHandoffPackageRecord> {
  return fetchApi<LawyerHandoffPackageRecord>(
    `/handoff-packages/${encodeURIComponent(id)}/review`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

// ============================================================================
// Notifications
// ============================================================================

export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_DUE_SOON'
  | 'TASK_OVERDUE'
  | 'CASE_ASSIGNED'
  | 'CASE_STATUS_CHANGED'
  | 'DOCUMENT_UPLOADED'
  | 'DOCUMENT_APPROVED'
  | 'COMMENT_ADDED'
  | 'REVIEW_REQUESTED'
  | 'REVIEW_COMPLETED'
  | 'TIME_LOGGED'
  | 'SYSTEM';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  isRead: boolean;
  userId: string;
  createdAt: string;
  clientColorKey?: ClientColorKey | null;
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

export async function getNotifications(limit = 50, offset = 0): Promise<NotificationsResponse> {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  return fetchApi<NotificationsResponse>(`/notifications?${params.toString()}`);
}

export async function getUnreadNotificationsCount(): Promise<{ unreadCount: number }> {
  return fetchApi<{ unreadCount: number }>('/notifications/unread-count');
}

export async function markNotificationRead(notificationId: string): Promise<NotificationItem> {
  return fetchApi<NotificationItem>(`/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'PATCH',
    body: JSON.stringify({}),
  });
}

export async function markAllNotificationsRead(): Promise<{ updatedCount: number }> {
  return fetchApi<{ updatedCount: number }>('/notifications/read-all', {
    method: 'PATCH',
    body: JSON.stringify({}),
  });
}
