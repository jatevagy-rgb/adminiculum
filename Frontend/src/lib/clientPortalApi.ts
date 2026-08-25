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
};

export type PortalOrgHome = {
  customer: { name: string };
  currentMatter?: PortalOrgHomeMatter;
  matters: PortalOrgHomeRow[];
  actions: PortalOrgHomeAction[];
  recentDocuments: PortalOrgHomeDocument[];
  contactSummary: { openCount: number; unreadCount: number; latestPreview: string | null; latestUpdatedAt: string | null };
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

export type PortalOrgCompany = {
  companyName: string;
  profileHeadline: string | null;
  groups: PortalOrgCompanyGroup[];
  visibleMattersByArea: PortalOrgCompanyVisibleArea[];
  totalVisibleMatterCount: number;
  milestones: Array<{ id: string; title: string; date: string | null }>;
  initiatives: Array<{ id: string; title: string; targetState: string | null; statusLabel: string; targetAt: string | null }>;
};

export async function getPortalOrganizationContracts() {
  return fetchApi<{ items: PortalOrgContract[] }>('/client-portal/org/contracts', { authContext: 'customer', suppressErrorStatuses: [401, 403, 404, 503], suppressErrorLogging: true });
}

export async function getPortalOrganizationCompany() {
  return fetchApi<PortalOrgCompany>('/client-portal/org/company', { authContext: 'customer', suppressErrorStatuses: [401, 403, 404, 503], suppressErrorLogging: true });
}
export type PortalCompanyProfileDiscovery = {
  client: { name: string | null };
  questions: Array<{
    questionKey: string;
    label: string;
    status: string;
    value: unknown;
  }>;
};
export async function getPortalCompanyProfileDiscovery() {
  return fetchApi<PortalCompanyProfileDiscovery>('/client-portal/org/company-profile', { authContext: 'customer' });
}
export async function answerPortalCompanyProfileQuestion(questionKey: string, payload: { status: string; numberValue?: number }) {
  return fetchApi<any>(`/client-portal/org/company-profile/questions/${questionKey}`, { authContext: 'customer', method: 'PUT', body: JSON.stringify(payload) });
}