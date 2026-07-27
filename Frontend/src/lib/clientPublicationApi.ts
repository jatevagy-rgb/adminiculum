import { fetchApi } from "@/lib/api";

export type PublicationStatus = "DRAFT" | "READY_FOR_APPROVAL" | "APPROVED" | "PUBLISHED" | "REVOKED" | "SUPERSEDED";

export interface ClientPortalGrantSummaryDTO {
  id: string;
  clientUserId: string;
  clientId: string;
  caseId: string;
  role: string;
  status: string;
  permissions: string[];
  validUntil: string | null;
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
    responsibleLawyerDisplay: string | null;
    publishedDeadlinesSnapshot: unknown[];
    sourceFingerprint: string;
    audienceSnapshot: unknown;
    createdAt: string;
  } | null;
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
  history: Array<{ id: string; action: string; fromStatus: string | null; toStatus: string | null; createdAt: string }>;
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

export async function createMatterPublicationDraft(payload: { caseId: string; clientSafeTitle: string; clientSafeStatus: string; clientSafeNextStep?: string; responsibleLawyerDisplay?: string }) {
  return fetchApi<ClientMatterPublicationDTO>("/client-publications/matters", { method: "POST", body: JSON.stringify(payload) });
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
