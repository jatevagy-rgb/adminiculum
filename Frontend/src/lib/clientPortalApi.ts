import { fetchApi } from './api';

export type PortalMatter = {
  id: string;
  caseId: string;
  title: string;
  statusLabel: string;
  currentSummary?: string | null;
  waitingOnLabel?: string | null;
  waitingDescription?: string | null;
  nextStepLabel?: string | null;
  nextStepTitle?: string | null;
  nextStepDescription?: string | null;
  estimatedTiming?: string | null;
  responsibleLawyerDisplay?: string | null;
  responsibleLawyerContactSafe?: string | null;
  publicDeadlines?: Array<{ label?: string; dueAt?: string }>;
  publishedAt?: string | null;
  attentionCount?: number;
  documentCount?: number;
  latestUpdateAt?: string | null;
  lastClientVisibleUpdateAt?: string | null;
  messageCapabilities?: { canRead: boolean; canSend: boolean };
};

export type PortalDocument = {
  id: string;
  matterId?: string | null;
  matterTitle?: string | null;
  title: string;
  explanation?: string | null;
  versionLabel: string;
  publishedAt?: string | null;
  stateLabel: string;
  downloadAvailable: boolean;
  mimeType?: string | null;
  size?: number | null;
};

export type PortalActionRequest = {
  id: string;
  matterId?: string | null;
  matterTitle?: string | null;
  title: string;
  instructions?: string | null;
  typeLabel: string;
  dueAt?: string | null;
  statusLabel: string;
  readOnlyNote: string;
};

export type PortalSafeUpdate = {
  id: string;
  matterId?: string | null;
  matterTitle?: string | null;
  title: string;
  body: string;
  categoryLabel: string;
  publishedAt?: string | null;
};

export type PortalHome = {
  portalActionsEnabled: boolean;
  relationshipMode?: 'PORTAL_CENTRIC' | 'EMAIL_CENTRIC' | 'CONNECTED_SYSTEM';
  identity?: { displayName?: string | null; email?: string | null };
  access: { state: string; grantCount: number };
  attention: PortalActionRequest[];
  matters: PortalMatter[];
  updates: PortalSafeUpdate[];
};

export type PortalWorkspaceAction = {
  id: string;
  matterId: string;
  matterTitle: string;
  type: string;
  title: string;
  description?: string | null;
  dueAt?: string | null;
  status: string;
  bucket: 'now' | 'upcoming' | 'completed';
  actionUrl: string;
};

export type PortalWorkspaceDocument = {
  id: string;
  matterId?: string | null;
  matterTitle?: string | null;
  title: string;
  explanation?: string | null;
  description?: string | null;
  status?: string | null;
  publishedAt?: string | null;
  kind: 'SHARED_DOCUMENT' | 'DOCUMENT_REQUEST' | 'CORRECTION_REQUEST' | 'SUBMISSION' | 'CORRECTION_SUBMISSION';
  actionUrl: string;
};

export type PortalWorkspaceMessage = {
  id: string;
  matterId: string;
  matterTitle: string;
  subject: string;
  status: string;
  updatedAt?: string | null;
  actionUrl: string;
};

export type PortalWorkspace = {
  actions: PortalWorkspaceAction[];
  documents: PortalWorkspaceDocument[];
  messages: PortalWorkspaceMessage[];
  upcomingDeadlines: PortalWorkspaceAction[];
  matterCount: number;
};

export type PortalWorkspaceSummary = {
  publicReference: string;
  name: string;
  clientDisplayName: string;
  mode: 'INDIVIDUAL' | 'ORGANIZATION' | 'CASE_RELAY';
  status: 'ACTIVE';
  communicationMode: 'PORTAL_PRIMARY' | 'EMAIL_LINKED' | 'EXTERNAL_ONLY';
  connectedSystemState: 'NOT_CONFIGURED' | 'CONFIGURATION_REQUIRED' | 'READY' | 'DISABLED';
  membershipRole: 'MEMBER' | 'REPRESENTATIVE' | 'APPROVER';
  capabilities: { home: boolean; matters: boolean; tasks: boolean; documents: boolean; messages: boolean; intakes?: boolean; leadership?: boolean };
};

export type PortalOrganizationUnit = {
  id: string;
  name: string;
  descriptionSafe: string | null;
};

export type PortalOrganizationCaseRelationship = 'OWN' | 'SHARED';

export type PortalOrganizationCase = {
  publicReference: string;
  matterPublicationId: string;
  publicTitle: string;
  organizationUnitName: string | null;
  relationshipToCase: PortalOrganizationCaseRelationship;
  publicStatus: string;
  waitingOn: string;
  nextStep: string | null;
  publicTargetDate: string | null;
  customerActionRequired: boolean;
  lastPublishedUpdateAt: string | null;
};

export type PortalOrganizationCaseDetail = PortalOrganizationCase & {
  requesterDisplayName: string | null;
  currentStatusText: string;
  safeMilestones: Array<{ reference?: string; title?: string; description?: string | null; state?: string; displayOrder?: number; completedAt?: string | null }>;
  capabilities: {
    showTimeline: boolean;
    showDocuments: boolean;
    allowUploads: boolean;
    showMessages: boolean;
    allowMessages: boolean;
    showHours: boolean;
    showBillingStatement: boolean;
  };
};

export type PortalOrganizationIntakeStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'TRIAGE_IN_PROGRESS'
  | 'MORE_INFORMATION_REQUIRED'
  | 'LINKED_TO_EXISTING_CASE'
  | 'CONVERTED_TO_CASE'
  | 'DECLINED'
  | 'WITHDRAWN'
  | 'CLOSED'
  | string;

export type PortalOrganizationIntake = {
  reference: string;
  subject: string;
  descriptionSafe?: string | null;
  organizationGroupId: string | null;
  organizationGroupName?: string | null;
  urgency: string | null;
  requestedDeadline: string | null;
  status: PortalOrganizationIntakeStatus;
  submittedAt: string | null;
  customerResponseSafe?: string | null;
  linkedCaseId?: string | null;
  linkedCaseReference?: string | null;
  linkedMatterPublicationId?: string | null;
  revision: number;
  updatedAt?: string | null;
};

export type PortalLeadershipUnitAggregate = {
  organizationUnitName: string | null;
  activeCaseCount: number;
  closedCaseCount: number;
  waitingOnCustomerCount: number;
  waitingOnOfficeCount: number;
  approachingDeadlineCount: number;
  publicStageCounts: Record<string, number>;
  legalAreaDistribution: Record<string, number>;
  recentSafeActivity: Array<{ label: string; happenedAt: string }>;
};

export type OnboardingRequestView = {
  id: string;
  status: string;
  requestedMode: string | null;
  claimedOrganizationName: string | null;
  claimedUnitName: string | null;
  claimedJobTitle: string | null;
  submittedAt: string | null;
  decisionMessage: string | null;
  revision: number;
};

export type OnboardingInvitationView = {
  invitationId: string;
  organizationName: string | null;
  workspaceName: string | null;
  mode: string | null;
  expiresAt: string;
};

export type PortalOnboarding = {
  latestRequest: OnboardingRequestView | null;
  invitation: OnboardingInvitationView | null;
  invitations?: OnboardingInvitationView[];
  allowedNextAction: string;
};

export type PortalIdentityContext = {
  identity: { displayName: string; email: string; accountType: string; jobTitle?: string | null; organizationUnitName?: string | null };
  state:
    | 'READY' | 'SELECTION_REQUIRED'
    | 'ONBOARDING_REQUIRED' | 'REQUEST_PENDING' | 'REQUEST_REJECTED'
    | 'INVITATION_PENDING' | 'PENDING_APPROVAL' | 'ACCESS_SUSPENDED'
    // Retained for backward-compatibility; the resolver no longer emits it.
    | 'NO_ACCESS';
  workspaces: PortalWorkspaceSummary[];
  selectedWorkspace: PortalWorkspaceSummary | null;
  onboarding?: PortalOnboarding | null;
};

export const CLIENT_PORTAL_WORKSPACE_STORAGE_KEY = 'adminiculum:client-portal-workspace';

export function getStoredPortalWorkspace(): string | null {
  if (typeof window === 'undefined') return null;
  const value = localStorage.getItem(CLIENT_PORTAL_WORKSPACE_STORAGE_KEY);
  return value && value.trim() ? value : null;
}

export function setSelectedPortalWorkspace(publicReference: string | null): void {
  if (typeof window === 'undefined') return;
  if (publicReference) localStorage.setItem(CLIENT_PORTAL_WORKSPACE_STORAGE_KEY, publicReference);
  else localStorage.removeItem(CLIENT_PORTAL_WORKSPACE_STORAGE_KEY);
}

export async function getPortalIdentityContext(publicReference?: string | null) {
  const effectiveReference = publicReference || getStoredPortalWorkspace();
  return fetchApi<PortalIdentityContext>('/client-portal/me', {
    authContext: 'customer',
    skipWorkspaceContext: !effectiveReference,
    headers: effectiveReference ? { 'x-client-portal-workspace': effectiveReference } : undefined,
    suppressErrorStatuses: [401, 403, 409, 503],
    suppressErrorLogging: true,
  });
}

export async function getPortalHome() {
  return fetchApi<PortalHome>('/client-portal/home', { suppressErrorStatuses: [401, 403, 503], suppressErrorLogging: true });
}

export async function getPortalWorkspace() {
  return fetchApi<PortalWorkspace>('/client-portal/workspace', { suppressErrorStatuses: [401, 403, 503], suppressErrorLogging: true });
}

export async function getPortalMatters() {
  return fetchApi<{ items: PortalMatter[] }>('/client-portal/matters', { suppressErrorStatuses: [401, 403, 503], suppressErrorLogging: true });
}

export type PortalMilestone = {
  reference: string;
  title: string;
  description: string | null;
  state: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | string;
  displayOrder: number;
  weight: number | null;
  completedAt: string | null;
};

export async function getPortalMatter(publicationId: string) {
  return fetchApi<PortalMatter & { documents: PortalDocument[]; actionRequests: PortalActionRequest[]; updates: PortalSafeUpdate[]; milestones?: PortalMilestone[] }>(`/client-portal/matters/${encodeURIComponent(publicationId)}`, { suppressErrorStatuses: [401, 403, 404, 503], suppressErrorLogging: true });
}

export async function getPortalDocument(publicationId: string) {
  return fetchApi<PortalDocument>(`/client-portal/documents/${encodeURIComponent(publicationId)}`, { suppressErrorStatuses: [401, 403, 404, 503], suppressErrorLogging: true });
}

export async function getPortalActionRequest(requestId: string) {
  return fetchApi<PortalActionRequest>(`/client-portal/action-requests/${encodeURIComponent(requestId)}`, { suppressErrorStatuses: [401, 403, 404, 503], suppressErrorLogging: true });
}

export async function getPortalUpdates() {
  return fetchApi<{ items: PortalSafeUpdate[] }>('/client-portal/updates', { suppressErrorStatuses: [401, 403, 503], suppressErrorLogging: true });
}

export type PortalCalendarCategory =
  | 'MATTER_TARGET'
  | 'PUBLISHED_DEADLINE'
  | 'ACTION_REQUEST'
  | 'CUSTOMER_REQUEST'
  | 'CONTRACT_DATE'
  | 'COMPANY_MILESTONE';

export type PortalCalendarStatus = 'OPEN' | 'DONE' | 'INFO';

export type PortalCalendarItem = {
  id: string;
  category: PortalCalendarCategory;
  categoryLabel: string;
  title: string;
  date: string;
  day: string;
  status: PortalCalendarStatus;
  href: string;
  matterTitle?: string | null;
};

export type PortalCalendar = {
  from: string;
  to: string;
  today: string;
  items: PortalCalendarItem[];
  categories: Array<{ key: PortalCalendarCategory; label: string; count: number }>;
  counts: {
    total: number;
    open: number;
    overdue: number;
    dueToday: number;
    dueNext7Days: number;
    dueNext30Days: number;
  };
};

export async function getPortalCalendar(params: { from?: string; to?: string } = {}) {
  const search = new URLSearchParams();
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  const query = search.toString();
  return fetchApi<PortalCalendar>(`/client-portal/calendar${query ? `?${query}` : ''}`, { suppressErrorStatuses: [400, 401, 403, 503], suppressErrorLogging: true });
}

export function portalDownloadUrl(publicationId: string) {
  const backendBaseUrl = process.env.NEXT_PUBLIC_BACKEND_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || '';
  const root = backendBaseUrl.replace(/\/+$/, '').replace(/\/api\/v1$/i, '');
  return `${root}/api/v1/client-portal/documents/${encodeURIComponent(publicationId)}/download`;
}

export async function getPortalOrganizationUnits() {
  return fetchApi<{ items: PortalOrganizationUnit[] }>('/client-portal/org/units', { authContext: 'customer', suppressErrorStatuses: [401, 403, 503], suppressErrorLogging: true });
}

export async function getPortalOrganizationCases(params: { relationship?: PortalOrganizationCaseRelationship | 'ALL'; unitId?: string; limit?: number; offset?: number } = {}) {
  const search = new URLSearchParams();
  if (params.relationship && params.relationship !== 'ALL') search.set('relationship', params.relationship);
  if (params.unitId) search.set('unitId', params.unitId);
  if (params.limit) search.set('limit', String(params.limit));
  if (params.offset) search.set('offset', String(params.offset));
  const query = search.toString();
  return fetchApi<{ items: PortalOrganizationCase[]; total: number; limit: number; offset: number }>(`/client-portal/org/cases${query ? `?${query}` : ''}`, { authContext: 'customer', suppressErrorStatuses: [401, 403, 503], suppressErrorLogging: true });
}

export async function getPortalOrganizationCase(caseReference: string) {
  return fetchApi<PortalOrganizationCaseDetail>(`/client-portal/org/cases/${encodeURIComponent(caseReference)}`, { authContext: 'customer', suppressErrorStatuses: [401, 403, 404, 503], suppressErrorLogging: true });
}

export async function getPortalOrganizationIntakes(params: { limit?: number; offset?: number } = {}) {
  const search = new URLSearchParams();
  if (params.limit) search.set('limit', String(params.limit));
  if (params.offset) search.set('offset', String(params.offset));
  const query = search.toString();
  return fetchApi<{ items: PortalOrganizationIntake[]; total?: number; limit?: number; offset?: number }>(`/client-portal/org/intakes${query ? `?${query}` : ''}`, { authContext: 'customer', suppressErrorStatuses: [401, 403, 503], suppressErrorLogging: true });
}

export async function createPortalOrganizationIntake(payload: { subject: string; organizationGroupId?: string; descriptionSafe?: string; urgency?: string; requestedDeadline?: string | null }) {
  return fetchApi<PortalOrganizationIntake>('/client-portal/org/intakes', { method: 'POST', body: JSON.stringify(payload), authContext: 'customer' });
}

export async function updatePortalOrganizationIntake(intakeId: string, payload: Partial<{ subject: string; organizationGroupId: string; descriptionSafe: string; urgency: string; requestedDeadline: string | null; expectedRevision: number }>) {
  return fetchApi<PortalOrganizationIntake>(`/client-portal/org/intakes/${encodeURIComponent(intakeId)}`, { method: 'PATCH', body: JSON.stringify(payload), authContext: 'customer' });
}

export async function submitPortalOrganizationIntake(intakeId: string, expectedRevision: number) {
  return fetchApi<PortalOrganizationIntake>(`/client-portal/org/intakes/${encodeURIComponent(intakeId)}/submit`, { method: 'POST', body: JSON.stringify({ expectedRevision }), authContext: 'customer' });
}

export async function withdrawPortalOrganizationIntake(intakeId: string, expectedRevision: number) {
  return fetchApi<PortalOrganizationIntake>(`/client-portal/org/intakes/${encodeURIComponent(intakeId)}/withdraw`, { method: 'POST', body: JSON.stringify({ expectedRevision }), authContext: 'customer' });
}

export async function getPortalOrganizationSummary() {
  return fetchApi<{ units: PortalLeadershipUnitAggregate[] }>('/client-portal/org/summary/organization', { authContext: 'customer', suppressErrorStatuses: [401, 403, 404, 503], suppressErrorLogging: true });
}

export type PortalWorkSummary = {
  period: { from: string; to: string };
  totalMinutes: number;
  matters: Array<{ matterId: string; title: string; minutes: number }>;
};

export async function getPortalWorkSummary() {
  return fetchApi<PortalWorkSummary>('/client-portal/org/work-summary', { authContext: 'customer', suppressErrorStatuses: [401, 403, 404, 503], suppressErrorLogging: true });
}

export function formatPortalWorkDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} perc`;
  if (!remainder) return `${hours} óra`;
  return `${hours} óra ${remainder} perc`;
}

export type PortalOrgHomeMatter = {
  publicationId: string;
  title: string;
  status: string;
  currentPosition: string;
  nextStep: string | null;
  waitingOn: string;
  publicTargetDate: string | null;
  progressPercentage?: number | null;
  milestones: Array<{ reference?: string | null; title?: string | null; state?: string | null; displayOrder?: number; completedAt?: string | null }>;
};

export type PortalOrgHomeRow = {
  publicReference: string;
  matterPublicationId: string;
  publicTitle: string;
  organizationUnitName: string | null;
  relationshipToCase: string;
  publicStatus: string;
  waitingOn: string;
  nextStep: string | null;
  publicTargetDate: string | null;
  customerActionRequired: boolean;
  lastPublishedUpdateAt: string | null;
};

export type PortalOrgHomeDocument = {
  id: string;
  matterTitle?: string | null;
  title: string;
  publishedAt?: string | null;
  downloadAvailable: boolean;
};

export type PortalOrgHomeAction = {
  id: string;
  matterPublicationId?: string | null;
  matterTitle?: string | null;
  title: string;
  instructions?: string | null;
  dueAt?: string | null;
  typeLabel: string;
  readOnlyNote: string;
  area?: 'LEGAL' | 'GROW' | 'COMPLIANCE';
  actionUrl?: string;
};

export type PortalOrgHomeGrowSummary = {
  activeInitiativesCount: number;
  initiatives: Array<{ id: string; title: string; statusLabel: string; targetState: string | null }>;
  knownProcessesCount: number;
};

export type PortalOrgHomeComplianceSummary = {
  attentionCount: number;
  inProgressCount: number;
  noActionExpectedCount: number;
  topics: Array<{ topicId: string; topicLabel: string; state: string; nextAction: string | null }>;
};

export type PortalOrgHomeDigitalTwinSummary = {
  organizationUnitsCount: number;
  knownProcessesCount: number;
  knownSystemsCount: number;
  employeeCount: number | null;
};

export type PortalOrgHome = {
  customer: { name: string };
  currentMatter?: PortalOrgHomeMatter;
  matters: PortalOrgHomeRow[];
  actions: PortalOrgHomeAction[];
  recentDocuments: PortalOrgHomeDocument[];
  contactSummary: { openCount: number; unreadCount: number; latestPreview: string | null; latestUpdatedAt: string | null };
  growSummary?: PortalOrgHomeGrowSummary;
  complianceSummary?: PortalOrgHomeComplianceSummary;
  digitalTwinSummary?: PortalOrgHomeDigitalTwinSummary;
};

export async function getPortalOrgHome() {
  return fetchApi<PortalOrgHome>('/client-portal/org/home', { authContext: 'customer', suppressErrorStatuses: [401, 403, 404, 503], suppressErrorLogging: true });
}

export async function getPortalUnitSummary(groupId: string) {
  return fetchApi<PortalLeadershipUnitAggregate>(`/client-portal/org/summary/unit/${encodeURIComponent(groupId)}`, { authContext: 'customer', suppressErrorStatuses: [401, 403, 404, 503], suppressErrorLogging: true });
}

export type PortalOrgContractPublishedDoc = {
  publicationId: string;
  title: string | null;
  versionLabel: string;
  publishedAt: string | null;
  downloadAvailable: boolean;
};

export type PortalOrgContract = {
  reference: string;
  title: string;
  statusLabel: string;
  lifecycle: "active" | "upcoming" | "terminating";
  relatedMatterTitle: string | null;
  nextStep: string | null;
  customerActionRequired: boolean;
  keyDate: string | null;
  publishedDoc: PortalOrgContractPublishedDoc | null;
};

export type PortalOrgCompanyGroup = {
  id: string;
  name: string;
  parentGroupId: string | null;
};

export type PortalOrgCompanyVisibleArea = {
  areaName: string;
  visibleMatterCount: number;
};

export type PortalOrgCompanySystem = {
  id: string;
  name: string;
  category: string;
  purpose: string | null;
};

export type PortalOrgCompanyProcess = {
  id: string;
  name: string;
  category: string;
  criticality: string;
  frequency: string;
};

export type PortalOrgCompany = {
  companyName: string;
  profileHeadline: string | null;
  employeeCount?: number | null;
  groups: PortalOrgCompanyGroup[];
  visibleMattersByArea: PortalOrgCompanyVisibleArea[];
  totalVisibleMatterCount: number;
  milestones: Array<{ id: string; title: string; date: string | null }>;
  initiatives: Array<{ id: string; title: string; targetState: string | null; statusLabel: string; targetAt: string | null }>;
  systems?: PortalOrgCompanySystem[];
  processes?: PortalOrgCompanyProcess[];
};

export async function getPortalOrganizationContracts() {
  return fetchApi<{ items: PortalOrgContract[] }>('/client-portal/org/contracts', { authContext: 'customer', suppressErrorStatuses: [401, 403, 404, 503], suppressErrorLogging: true });
}

export async function getPortalOrganizationCompany() {
  return fetchApi<PortalOrgCompany>('/client-portal/org/company', { authContext: 'customer', suppressErrorStatuses: [401, 403, 404, 503], suppressErrorLogging: true });
}

export type PortalGrowProcessStep = {
  id: string;
  position: number;
  name: string;
  stepType: string;
  isApproval: boolean;
  systemName: string | null;
  systemCategory: string | null;
};

export type PortalGrowProcess = {
  id: string;
  name: string;
  category: string;
  criticality: string;
  frequency: string;
  organizationGroupName: string | null;
  steps: PortalGrowProcessStep[];
};

export type PortalGrowInitiativeMilestone = {
  id: string;
  title: string;
  statusLabel: string;
  date: string | null;
};

export type PortalGrowInitiative = {
  id: string;
  title: string;
  targetState: string | null;
  statusLabel: string;
  targetAt: string | null;
  hasRelatedMatter: boolean;
  milestones: PortalGrowInitiativeMilestone[];
};

export type PortalGrowOutcome = {
  id: string;
  basis: 'MEASURED' | 'CALCULATED' | 'ESTIMATED';
  basisLabel: string;
  initiativeTitle: string | null;
  processName: string | null;
};

export type PortalGrowOpportunity = {
  publicationId: string;
  title: string;
  summary: string;
  direction: string | null;
  publishedAt: string;
};

export type PortalOrgGrow = {
  customerName: string;
  processes: PortalGrowProcess[];
  initiatives: PortalGrowInitiative[];
  outcomes: {
    measured: PortalGrowOutcome[];
    calculatedOrEstimated: PortalGrowOutcome[];
  };
  opportunities: PortalGrowOpportunity[];
  opportunitiesDeferredNotice: string | null;
  surveys?: PortalGrowSurveyItem[];
};

export async function getPortalOrgGrow() {
  return fetchApi<PortalOrgGrow>('/client-portal/org/grow', {
    authContext: 'customer',
    suppressErrorStatuses: [401, 403, 404, 503],
    suppressErrorLogging: true,
  });
}

export type SubmitPortalGrowSurveyInput = {
  categories: string[];
  freeText?: string;
  processId?: string;
  idempotencyKey: string;
};

export type PortalGrowSurveyResult = {
  success: boolean;
  replayed: boolean;
  message: string;
  submittedAt: string;
};

export type PortalGrowSurveyItem = {
  submittedAt: string;
  categoryLabels: string[];
  freeText: string | null;
  processName: string | null;
};

export async function submitPortalGrowSurvey(payload: SubmitPortalGrowSurveyInput) {
  return fetchApi<PortalGrowSurveyResult>('/client-portal/org/grow-survey', {
    authContext: 'customer',
    method: 'POST',
    body: JSON.stringify(payload),
    suppressErrorStatuses: [400, 401, 403, 409],
    suppressErrorLogging: true,
  });
}

export async function listPortalGrowSurveys() {
  return fetchApi<{ items: PortalGrowSurveyItem[] }>('/client-portal/org/grow-survey', {
    authContext: 'customer',
    suppressErrorStatuses: [401, 403, 404, 503],
    suppressErrorLogging: true,
  });
}

// --- GROW CUSTOMER ASSESSMENT JOURNEY -------------------------------------

export type PortalGrowAssessmentResultScope = {
  processId: string | null;
  processName: string | null;
  completedAt: string;
  findingCount: number;
  resultAvailable: boolean;
};

export type PortalGrowAssessmentCatalogueItem = {
  packKey: string;
  version: number;
  titleHu: string;
  descriptionHu: string;
  estimatedMinutes: number;
  questionCount: number;
  status: 'NOT_STARTED' | 'COMPLETED';
  latestCompletedAt: string | null;
  latestFindingCount: number;
  latestSummaryHu: string | null;
  latestResultAvailable: boolean;
  allowsProcessReference: boolean;
  resultScopes: PortalGrowAssessmentResultScope[];
};

export type PortalGrowAssessmentFinding = {
  titleHu: string;
  summaryHu: string;
};

export type PortalGrowAssessmentDirection = {
  labelHu: string;
};

export type PortalGrowAssessmentEvidence = {
  title: string;
  authors: string | null;
  year: number | null;
  doi: string | null;
  locator: string | null;
  boundedClaim: string | null;
  limitations: string | null;
  strengthLabelHu: string;
};

export type PortalGrowAssessmentResult = {
  packKey: string;
  packVersion: number;
  titleHu: string;
  completedAt: string;
  findings: PortalGrowAssessmentFinding[];
  directions: PortalGrowAssessmentDirection[];
  evidence: PortalGrowAssessmentEvidence[];
  attentionAreaCount: number;
  unknownAreaCount: number;
  summaryHu: string;
  noticeHu: string;
};

export type PortalGrowAssessmentCatalogue = {
  packs: PortalGrowAssessmentCatalogueItem[];
  aggregatedFindings: PortalGrowAssessmentFinding[];
  aggregatedAttentionAreaCount: number;
  aggregatedUnknownAreaCount: number;
  noticeHu: string;
};

export type PortalGrowAssessmentQuestion = {
  questionKey: string;
  promptHu: string;
  helpTextHu: string | null;
  options: Array<{ value: string; labelHu: string }>;
};

export type PortalGrowAssessmentDetail = {
  definition: {
    packKey: string;
    version: number;
    titleHu: string;
    descriptionHu: string;
    estimatedMinutes: number;
    allowsProcessReference: boolean;
    questions: PortalGrowAssessmentQuestion[];
  };
  latestResult: PortalGrowAssessmentResult | null;
  latestResultAvailable: boolean;
  resultScope: { processId: string | null; processName: string | null } | null;
};

export type PortalGrowAssessmentSubmissionResult = {
  status: number;
  submission: {
    packKey: string;
    packVersion: number;
    replayed: boolean;
    completedAt: string;
  };
  result: PortalGrowAssessmentResult;
};

export async function listPortalGrowAssessments() {
  return fetchApi<PortalGrowAssessmentCatalogue>('/client-portal/org/grow-assessments', {
    authContext: 'customer',
    suppressErrorStatuses: [401, 403, 404, 503],
    suppressErrorLogging: true,
  });
}

export async function getPortalGrowAssessment(packKey: string, processId?: string | null) {
  const query =
    processId !== undefined && processId !== null && processId !== ''
      ? `?processId=${encodeURIComponent(processId)}`
      : '';
  return fetchApi<PortalGrowAssessmentDetail>(
    `/client-portal/org/grow-assessments/${encodeURIComponent(packKey)}${query}`,
    {
      authContext: 'customer',
      suppressErrorStatuses: [401, 403, 404, 503],
      suppressErrorLogging: true,
    },
  );
}

export async function submitPortalGrowAssessment(
  packKey: string,
  payload: { answers: Array<{ questionKey: string; answer: string }>; idempotencyKey: string; processId?: string },
) {
  return fetchApi<PortalGrowAssessmentSubmissionResult>(
    `/client-portal/org/grow-assessments/${encodeURIComponent(packKey)}/submissions`,
    {
      authContext: 'customer',
      method: 'POST',
      body: JSON.stringify(payload),
      suppressErrorStatuses: [400, 401, 403, 409],
      suppressErrorLogging: true,
    },
  );
}

export type PortalComplianceMissingInfo = {
  label: string;
  portalAnswerable: boolean;
  questionKey?: string | null;
  valueType?: "NUMBER" | "BOOLEAN" | "STRING" | "ENUM" | "DATE";
  options?: string[];
  integerOnly?: boolean;
};

export type PortalComplianceDocument = {
  publicationId: string;
  title: string;
  versionLabel: string;
  publishedAt: string;
  downloadAvailable: boolean;
};

export type PortalComplianceTopic = {
  topicId: string;
  topicLabel: string;
  state: 'REVIEW_RECOMMENDED' | 'MORE_INFORMATION_NEEDED' | 'LAWYER_REVIEW_REQUIRED' | 'ACTION_IN_PROGRESS' | 'RESOLVED';
  shortExplanation: string;
  missingInformation: PortalComplianceMissingInfo[];
  nextAction: string | null;
  documents: PortalComplianceDocument[];
};

export type PortalComplianceControlSummary = {
  requirementTitle: string;
  controls: Array<{
    title: string;
    implementationStatus: string | null;
    lastReviewedAt: string | null;
    nextReviewAt: string | null;
    evidence: { acceptedCurrent: number; stale: number; missing: boolean };
  }>;
};

export type PortalComplianceReadModel = {
  topics: PortalComplianceTopic[];
  // Already-returned client-safe control/checkpoint projection (per requirement).
  controlsSummary?: PortalComplianceControlSummary[];
};

export async function getPortalCompliance() {
  return fetchApi<PortalComplianceReadModel>('/client-portal/compliance', {
    authContext: 'customer',
    suppressErrorStatuses: [401, 403, 404, 503],
    suppressErrorLogging: true,
  });
}
export type PortalCompanyProfileSection =
  | "COMPANY"
  | "OPERATIONS"
  | "PEOPLE"
  | "SIZE"
  | "DATA"
  | "DIGITAL"
  | "MARKET"
  | "AI"
  | "FINANCE"
  | "PRODUCT"
  | "ENVIRONMENT"
  | "SECTOR"
  | "SPECIAL";

export type PortalCompanyProfileQuestion = {
  questionKey: string;
  label: string;
  helpText?: string | null;
  why?: string | null;
  section: PortalCompanyProfileSection;
  module?: string | null;
  valueType: "NUMBER" | "BOOLEAN" | "STRING" | "ENUM" | "MULTI_ENUM" | "DATE" | "JURISDICTION";
  options?: string[];
  codeCatalog?: "TEAOR25" | null;
  discoveryBaseline?: boolean;
  integerOnly?: boolean;
  order: number;
  status: "ANSWERED" | "UNKNOWN" | "UNANSWERED";
  value: number | string | boolean | string[] | null;
};

export type PortalCompanyProfileScreen = {
  screenKey: string;
  order: number;
  sectionKey: string;
  sectionTitleHu: string;
  titleHu: string;
  helpTextHu: string;
  whyHu: string;
  uiKind: string;
  factBindings: string[];
  questionAtomKeys: string[];
};

export type PortalCompanyProfileDiscovery = {
  client: { name: string | null };
  capabilities: { teaor25CatalogInstalled: boolean };
  screens: PortalCompanyProfileScreen[];
  questions: PortalCompanyProfileQuestion[];
};

export type PortalTeaor25Options = {
  installed: boolean;
  options: Array<{ code: string; labelHu: string }>;
};

export type PortalCompanyProfileAnswerPayload = {
  status: "ANSWERED" | "UNKNOWN";
  numberValue?: number;
  stringValue?: string;
  booleanValue?: boolean;
  enumValue?: string;
  dateValue?: string;
  jsonValue?: string[];
};

export type PortalCompanyProfileAnswerResult = {
  questionKey: string;
  status: string;
  answered: boolean;
};

export async function getPortalCompanyProfileDiscovery() {
  return fetchApi<PortalCompanyProfileDiscovery>('/client-portal/org/company-profile', {
    authContext: 'customer',
    suppressErrorStatuses: [401, 403, 404, 503],
    suppressErrorLogging: true,
  });
}

export async function answerPortalCompanyProfileQuestion(
  questionKey: string,
  payload: PortalCompanyProfileAnswerPayload,
) {
  return fetchApi<PortalCompanyProfileAnswerResult>(
    `/client-portal/org/company-profile/questions/${encodeURIComponent(questionKey)}`,
    {
      authContext: 'customer',
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  );
}

export async function answerPortalCompanyProfileScreen(
  screenKey: string,
  facts: Record<string, PortalCompanyProfileAnswerPayload>,
) {
  return fetchApi<{ screenKey: string; answers: PortalCompanyProfileAnswerResult[] }>(
    `/client-portal/org/company-profile/screens/${encodeURIComponent(screenKey)}`,
    {
      authContext: 'customer',
      method: 'PUT',
      body: JSON.stringify({ facts }),
    },
  );
}

export async function getPortalCompanyProfileTeaor25Options(query: string) {
  return fetchApi<PortalTeaor25Options>(
    `/client-portal/org/company-profile/teaor25-options?q=${encodeURIComponent(query)}`,
    {
      authContext: 'customer',
      suppressErrorStatuses: [404, 503],
      suppressErrorLogging: true,
    },
  );
}

// --- COMPANY PROFILE 2.0 — CONTROL / EVIDENCE FOLLOW-UP -------------------

export type PortalEvidenceRelevance =
  | "APPLIES"
  | "LEGAL_REVIEW_REQUIRED"
  | "DOES_NOT_APPLY"
  | "INSUFFICIENT_FACTS";

/**
 * Machine-readable follow-up state of one applicable control, derived from the
 * persisted ClientControl row and its evidence links. PENDING is "the customer
 * still owes an answer"; ANSWERED covers a persisted YES (current evidence) and
 * a persisted NO (explicitly not implemented); STALE is persisted evidence that
 * is no longer current and needs review rather than a fresh answer.
 */
export type PortalCompanyProfileEvidenceState = "PENDING" | "ANSWERED" | "STALE";

export type PortalCompanyProfileEvidenceItem = {
  controlKey: string;
  module: "DATA" | "WHISTLEBLOWING" | "CYBER";
  questionHu: string;
  relevance: PortalEvidenceRelevance;
  implemented: boolean;
  evidenceLinked: boolean;
  evidenceState: PortalCompanyProfileEvidenceState;
  stateHu: string;
};

export type PortalCompanyProfileReusableDocument = {
  documentVersionId: string;
  label: string;
};

export type PortalCompanyProfileEvidenceJourney = {
  items: PortalCompanyProfileEvidenceItem[];
  reusableDocuments: PortalCompanyProfileReusableDocument[];
};

export type PortalCompanyProfileEvidenceAnswer = {
  answer: "YES" | "NO" | "UNKNOWN";
  documentVersionId?: string;
};

export type PortalCompanyProfileEvidenceResult = {
  controlKey: string;
  module: string;
  route: "UPLOAD_OR_REUSE_DOCUMENT" | "MISSING_CONTROL_EVIDENCE" | "LAWYER_REVIEW";
  messageHu: string;
  implemented: boolean;
  documentVersionId: string | null;
};

export async function getPortalCompanyProfileEvidence() {
  return fetchApi<PortalCompanyProfileEvidenceJourney>(
    "/client-portal/org/company-profile/evidence",
    {
      authContext: "customer",
      suppressErrorStatuses: [401, 403, 404, 503],
      suppressErrorLogging: true,
    },
  );
}

export async function answerPortalCompanyProfileEvidence(
  controlKey: string,
  answer: PortalCompanyProfileEvidenceAnswer,
) {
  return fetchApi<PortalCompanyProfileEvidenceResult>(
    `/client-portal/org/company-profile/evidence/${encodeURIComponent(controlKey)}`,
    {
      authContext: "customer",
      method: "PUT",
      body: JSON.stringify(answer),
    },
  );
}
