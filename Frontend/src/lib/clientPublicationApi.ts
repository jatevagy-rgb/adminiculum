import { fetchApi } from "@/lib/api";

export type PublicationStatus = "DRAFT" | "READY_FOR_APPROVAL" | "APPROVED" | "PUBLISHED" | "REVOKED" | "SUPERSEDED";

export interface ClientPortalGrantSummaryDTO {
  id: string;
  clientUserId: string | null;
  clientPortalIdentityId: string | null;
  clientId: string;
  caseId: string;
  role: string;
  status: string;
  permissions: string[];
  validUntil: string | null;
  validFrom: string | null;
  activatedAt: string | null;
  suspendedAt: string | null;
  revokedAt: string | null;
  revocationReasonSafe: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface ClientMatterPublicationDTO {
  id: string;
  caseId: string;
  clientId: string;
  status: PublicationStatus;
  currentRevisionId: string | null;
  approvedById: string | null;
  publishedById: string | null;
  publishedAt: string | null;
  revision: number;
  snapshot: {
    id: string;
    revisionNumber: number;
    clientSafeTitle: string;
    clientSafeStatus: string;
    clientSafeNextStep: string | null;
    clientSafeCurrentPosition?: string | null;
    clientSafeWaitingOn?: string | null;
    publicTargetDate?: string | null;
    responsibleLawyerDisplay: string | null;
    publishedDeadlinesSnapshot: unknown[];
    sourceFingerprint: string;
    audienceSnapshot: unknown;
    createdAt: string;
  } | null;
}

export interface CasePortalPublicationTarget {
  workspaceId: string;
  workspaceMembershipId: string;
  workspaceName: string;
  memberName: string;
  memberRole: string;
}

export interface ClientDocumentPublicationDTO {
  id: string;
  caseId: string;
  clientId: string;
  documentId: string;
  documentVersionId: string;
  status: PublicationStatus;
  clientFacingTitle: string;
  clientFacingExplanation: string | null;
  approvedById: string | null;
  publishedById: string | null;
  publishedAt: string | null;
  revokedAt: string | null;
  audienceSnapshot: unknown;
  sourceFingerprint: string;
  approvalReviewId: string | null;
  revision: number;
}

export interface ClientActionRequestDTO {
  id: string;
  type: string;
  clientSafeTitle: string;
  status: string;
  dueAt: string | null;
  revision: number;
}

export interface ClientSafeUpdateDTO {
  id: string;
  title: string;
  body: string;
  category: string;
  status: string;
  revision: number;
}

export interface PublicationWarning {
  level: "BLOCKING" | "ACK_REQUIRED" | "INFO";
  code: string;
  message: string;
}

export interface ClientPublicationOverviewDTO {
  caseId: string;
  clientId: string;
  gates: { foundationEnabled: boolean; portalReadEnabled: boolean; portalActionsEnabled: boolean };
  warnings: PublicationWarning[];
  grants: ClientPortalGrantSummaryDTO[];
  matterPublications: ClientMatterPublicationDTO[];
  documentPublications: ClientDocumentPublicationDTO[];
  actionRequests: ClientActionRequestDTO[];
  safeUpdates: ClientSafeUpdateDTO[];
  history: Array<{ id: string; action: string; grantId: string | null; fromStatus: string | null; toStatus: string | null; createdAt: string }>;
}

export async function getClientPublicationOverview(caseId: string, documentId?: string | null): Promise<ClientPublicationOverviewDTO> {
  const query = documentId ? `?documentId=${encodeURIComponent(documentId)}` : "";
  return fetchApi<ClientPublicationOverviewDTO>(`/client-publications/cases/${encodeURIComponent(caseId)}/overview${query}`, { cache: "no-store" });
}

export async function createClientPortalGrant(payload: { caseId: string; clientId: string; clientUserId: string; validUntil?: string | null }) {
  return fetchApi<ClientPortalGrantSummaryDTO>("/client-publications/grants", { method: "POST", body: JSON.stringify({ ...payload, permissions: ["MATTER_READ", "DOCUMENT_READ", "DOCUMENT_DOWNLOAD", "ACTION_REQUEST_READ", "UPDATE_READ"] }) });
}

export async function transitionClientPortalGrant(grantId: string, action: "activate" | "suspend" | "revoke", expectedRevision: number) {
  return fetchApi<ClientPortalGrantSummaryDTO>(`/client-publications/grants/${encodeURIComponent(grantId)}/${action}`, { method: "POST", body: JSON.stringify({ expectedRevision }) });
}

export async function createMatterPublicationDraft(payload: { caseId: string; clientSafeTitle: string; clientSafeStatus: string; clientSafeNextStep?: string; clientSafeCurrentPosition?: string; clientSafeWaitingOn?: string; publicTargetDate?: string | null; responsibleLawyerDisplay?: string }) {
  return fetchApi<ClientMatterPublicationDTO>("/client-publications/matters", { method: "POST", body: JSON.stringify(payload) });
}

export async function getCasePortalPublicationTargets(caseId: string): Promise<{ items: CasePortalPublicationTarget[] }> {
  return fetchApi(`/client-publications/cases/${encodeURIComponent(caseId)}/portal-publication-targets`, { cache: "no-store" });
}

export async function publishInternalCaseToPortal(caseId: string, payload: {
  workspaceId: string;
  workspaceMembershipId: string;
  clientSafeTitle: string;
  clientSafeStatus: string;
  clientSafeCurrentPosition?: string;
  clientSafeWaitingOn?: string;
  clientSafeNextStep?: string;
  publicTargetDate?: string | null;
  responsibleLawyerDisplay?: string;
}) {
  return fetchApi(`/client-publications/cases/${encodeURIComponent(caseId)}/portal-publication`, { method: "POST", body: JSON.stringify(payload) });
}

export async function createDocumentPublicationDraft(payload: { documentId: string; documentVersionId: string; clientFacingTitle: string; clientFacingExplanation?: string }) {
  return fetchApi<ClientDocumentPublicationDTO>("/client-publications/documents", { method: "POST", body: JSON.stringify(payload) });
}

export async function transitionMatterPublication(publicationId: string, action: "submit" | "approve" | "publish" | "revoke" | "supersede", expectedRevision: number) {
  return fetchApi<ClientMatterPublicationDTO>(`/client-publications/matters/${encodeURIComponent(publicationId)}/${action}`, { method: "POST", body: JSON.stringify({ expectedRevision, acknowledgement: action === "publish" ? "Explicit internal publish acknowledgement." : undefined }) });
}

export async function transitionDocumentPublication(publicationId: string, action: "submit" | "approve" | "publish" | "revoke" | "supersede", expectedRevision: number) {
  return fetchApi<ClientDocumentPublicationDTO>(`/client-publications/documents/${encodeURIComponent(publicationId)}/${action}`, { method: "POST", body: JSON.stringify({ expectedRevision, acknowledgeBlockingReview: true, acknowledgement: action === "publish" ? "Explicit exact-version publication acknowledgement." : undefined }) });
}

export async function createClientActionRequestDraft(payload: { caseId: string; type: string; clientSafeTitle: string; clientSafeInstructions?: string }) {
  return fetchApi<ClientActionRequestDTO>("/client-publications/action-requests", { method: "POST", body: JSON.stringify(payload) });
}

export async function approveClientActionRequest(requestId: string, expectedRevision: number) {
  return fetchApi<ClientActionRequestDTO>(`/client-publications/action-requests/${encodeURIComponent(requestId)}/approve`, { method: "POST", body: JSON.stringify({ expectedRevision }) });
}

export async function createClientSafeUpdateDraft(payload: { caseId: string; title: string; body: string; category: string }) {
  return fetchApi<ClientSafeUpdateDTO>("/client-publications/safe-updates", { method: "POST", body: JSON.stringify(payload) });
}

export async function transitionClientSafeUpdate(updateId: string, action: "approve" | "publish" | "revoke", expectedRevision: number) {
  return fetchApi<ClientSafeUpdateDTO>(`/client-publications/safe-updates/${encodeURIComponent(updateId)}/${action}`, { method: "POST", body: JSON.stringify({ expectedRevision }) });
}

// --- Customer-safe milestone publication (workforce) -----------------------

export type MilestoneCompletionState = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export interface MilestoneDraftItem {
  publicKey: string;
  sourceTaskId?: string | null;
  safeTitle: string;
  safeDescription?: string | null;
  displayOrder: number;
  weight?: number | null;
  completionState: MilestoneCompletionState;
  completedAt?: string | null;
}

export interface CustomerMilestone {
  reference: string;
  title: string;
  description: string | null;
  state: MilestoneCompletionState | string;
  displayOrder: number;
  weight: number | null;
  completedAt: string | null;
}

export interface EligibleMilestoneStep {
  taskId: string;
  stepKey: string | null;
  internalTitle: string;
  internalStatus: string;
  suggestedState: MilestoneCompletionState;
}

export interface MilestonePreview {
  milestones: CustomerMilestone[];
  progressPercentage: number | null;
}

export async function listEligibleMilestoneSteps(caseId: string): Promise<{ items: EligibleMilestoneStep[] }> {
  return fetchApi(`/client-publications/cases/${encodeURIComponent(caseId)}/milestones/eligible`, { cache: "no-store" });
}

export async function getMilestoneDraft(caseId: string): Promise<{ publicationId: string | null; publicationStatus: string | null; draft: MilestoneDraftItem[]; publishedMilestones: CustomerMilestone[]; publishedProgress: number | null }> {
  return fetchApi(`/client-publications/cases/${encodeURIComponent(caseId)}/milestones/draft`, { cache: "no-store" });
}

export async function saveMilestoneDraft(caseId: string, milestones: MilestoneDraftItem[]): Promise<{ publicationId: string; draft: MilestoneDraftItem[]; preview: MilestonePreview }> {
  return fetchApi(`/client-publications/cases/${encodeURIComponent(caseId)}/milestones/draft`, { method: "PUT", body: JSON.stringify({ milestones }) });
}

export async function previewMilestonePublication(caseId: string): Promise<MilestonePreview> {
  return fetchApi(`/client-publications/cases/${encodeURIComponent(caseId)}/milestones/preview`, { cache: "no-store" });
}

export async function publishMilestoneRevision(caseId: string): Promise<{ publicationId: string; revisionId: string; revisionNumber: number; milestones: CustomerMilestone[]; progressPercentage: number | null }> {
  return fetchApi(`/client-publications/cases/${encodeURIComponent(caseId)}/milestones/publish`, { method: "POST", body: JSON.stringify({}) });
}
