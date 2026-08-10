import { fetchApi } from "./api";

// Internal portal administration API — membership review + identity-based grants
// for External ID customers. All routes require ADMIN/PARTNER (server-enforced).

export interface MembershipRequestDTO {
  id: string;
  clientPortalIdentityId: string;
  requestedMode: 'INDIVIDUAL' | 'ORGANIZATION' | 'CASE_RELAY' | null;
  requestedClientId: string | null;
  requestedOrganizationName: string | null;
  requestedGroupId: string | null;
  requestedGroupName: string | null;
  corporateEmail: string | null;
  verifiedEmailSnapshot: string | null;
  displayNameSnapshot: string | null;
  phoneSafe: string | null;
  claimedJobTitle: string | null;
  noteSafe: string | null;
  status: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectionReasonSafe: string | null;
  clientSafeDecisionMessage: string | null;
  approvedWorkspaceId: string | null;
  approvedMembershipId: string | null;
  revision: number;
}

export interface MembershipRequestDetail {
  request: MembershipRequestDTO & { internalDecisionNote: string | null; invitationId: string | null };
  identity: { normalizedEmail: string | null; displayName: string | null; status: string | null; accountType: string | null } | null;
}

export interface ActiveGrantSummary {
  id: string;
  caseId: string;
  status: string;
  permissions: string[];
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  revision: number;
  lifecycleEvents: Array<{
    id: string;
    grantId: string | null;
    action: string;
    fromStatus: string | null;
    toStatus: string | null;
    createdAt: string;
  }>;
}

export interface ActiveMembershipDTO {
  id: string;
  clientPortalIdentityId: string;
  clientId: string;
  groupId: string | null;
  status: string;
  approvedAt: string | null;
  revision: number;
  identityEmail: string | null;
  identityDisplayName: string | null;
  identityStatus: string | null;
  clientName: string | null;
  activeGrants: ActiveGrantSummary[];
}

export interface ClientPortalGrantDTO {
  id: string;
  clientPortalIdentityId: string | null;
  clientId: string;
  caseId: string;
  status: string;
  permissions: string[];
  validUntil: string | null;
  revision: number;
}

export interface WorkspaceMembershipDTO {
  id: string;
  clientPortalIdentityId: string;
  workspaceId: string;
  status: 'INVITED' | 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED';
  role: 'MEMBER' | 'REPRESENTATIVE' | 'APPROVER';
  revision: number;
  invitedAt: string | null;
  approvedAt: string | null;
}

export interface AdminWorkspaceDTO {
  id: string;
  clientId: string;
  clientName: string | null;
  name: string;
  mode: 'INDIVIDUAL' | 'ORGANIZATION' | 'CASE_RELAY';
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  communicationMode: 'PORTAL_PRIMARY' | 'EMAIL_LINKED' | 'EXTERNAL_ONLY';
  connectedSystemState: 'NOT_CONFIGURED' | 'CONFIGURATION_REQUIRED' | 'READY' | 'DISABLED';
  revision: number;
  activeMembershipCount: number;
  pendingInvitationCount: number;
  pendingApprovalCount: number;
  invitations: Array<{
    id: string;
    intendedEmail: string | null;
    status: string;
    deliveryStatus: string | null;
    deliveryCodeSafe: string | null;
    expiresAt: string;
    createdAt: string;
  }>;
  memberships: WorkspaceMembershipDTO[];
  events: Array<{ id: string; action: string; fromStatus: string | null; toStatus: string | null; createdAt: string }>;
}

export const GRANT_PERMISSIONS = [
  "MATTER_READ",
  "CLIENT_TIMELINE_READ",
  "DOCUMENT_READ",
  "DOCUMENT_DOWNLOAD",
  "DOCUMENT_UPLOAD",
  "MESSAGE_READ",
  "MESSAGE_SEND",
  "ACTION_REQUEST_READ",
  "UPDATE_READ",
] as const;

export type ParticipantRole = "REQUESTER" | "CLIENT_OWNER" | "PARTICIPANT" | "OBSERVER";
export type SummaryScopeType = "UNIT" | "ORGANIZATION";

export interface OrganizationUnitAdminDTO {
  id: string;
  name: string;
  status: string;
  descriptionSafe: string | null;
}

export interface CaseParticipantDTO {
  id: string;
  clientPortalIdentityId: string | null;
  participantRole: ParticipantRole | string | null;
  isRequester: boolean;
  permissions: string[];
  status: string;
  revision: number;
}

export interface SummaryScopeDTO {
  id: string;
  workspaceMembershipId: string;
  scopeType: SummaryScopeType | string;
  organizationGroupId: string | null;
  status: string;
  revision: number;
}

export async function listMembershipQueue(): Promise<{ items: MembershipRequestDTO[] }> {
  return fetchApi<{ items: MembershipRequestDTO[] }>("/client-identity/admin/membership-requests");
}

export async function listActiveMemberships(): Promise<{ items: ActiveMembershipDTO[] }> {
  return fetchApi<{ items: ActiveMembershipDTO[] }>("/client-identity/admin/memberships");
}

export async function getMembershipRequestDetail(requestId: string): Promise<MembershipRequestDetail> {
  return fetchApi(`/client-identity/admin/membership-requests/${encodeURIComponent(requestId)}`);
}

export type PortalMembershipRole = 'MEMBER' | 'REPRESENTATIVE' | 'APPROVER';
export type OrganizationUnitRole = 'MEMBER' | 'CONTACT' | 'APPROVER' | 'MANAGER';
export type CustomerSurfaceMode = 'INDIVIDUAL' | 'ORGANIZATION' | 'CASE_RELAY';

export interface UnitMembershipDTO {
  id: string;
  clientPortalIdentityId: string;
  groupId: string | null;
  organizationGroupName: string | null;
  unitRole: OrganizationUnitRole;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  revision: number;
  identityEmail: string | null;
  identityDisplayName: string | null;
  approvedAt: string | null;
  suspendedAt: string | null;
  revokedAt: string | null;
}

export interface ApproveMembershipPayload {
  assignmentMode: 'EXISTING_CLIENT' | 'NEW_CLIENT';
  actualMode: CustomerSurfaceMode;
  portalMembershipRole: PortalMembershipRole;
  revision: number;
  // Existing client
  existingClientId?: string;
  existingWorkspaceId?: string;
  // New client / inline surface
  newClientInput?: { name: string; email?: string; phone?: string; companyRegistrationNumber?: string; taxNumber?: string; contactPerson?: string };
  createWorkspaceInput?: { name?: string; mode: CustomerSurfaceMode };
  // Organization unit (ORGANIZATION only)
  organizationGroupId?: string;
  newOrganizationGroupName?: string;
  unitRole?: OrganizationUnitRole;
  // Decision surfaces
  clientSafeDecisionMessage?: string;
  internalDecisionNote?: string;
}

export async function approveMembershipRequest(
  requestId: string,
  payload: ApproveMembershipPayload,
): Promise<{ membership: { id: string }; workspaceMembership: { id: string }; clientId: string; workspaceId: string; createdClient: boolean; createdWorkspace: boolean; actualMode: string; grantRequired: boolean; nextAction: string }> {
  return fetchApi(`/client-identity/admin/membership-requests/${encodeURIComponent(requestId)}/approve`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function rejectMembershipRequest(
  requestId: string,
  payload: { revision: number; clientSafeDecisionMessage?: string; internalDecisionNote?: string; rejectionReasonSafe?: string },
): Promise<MembershipRequestDTO> {
  return fetchApi(`/client-identity/admin/membership-requests/${encodeURIComponent(requestId)}/reject`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function transitionMembership(
  membershipId: string,
  action: "suspend" | "revoke",
): Promise<{ id: string; status: string }> {
  return fetchApi(`/client-identity/admin/memberships/${encodeURIComponent(membershipId)}/${action}`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

// Identity-based grant — never uses the legacy clientUserId path.
export async function createIdentityGrant(payload: {
  membershipId?: string;
  workspaceMembershipId?: string;
  caseId: string;
  permissions: string[];
  validUntil?: string | null;
}): Promise<ClientPortalGrantDTO> {
  return fetchApi("/client-identity/admin/grants", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listAdminWorkspaces(clientId?: string): Promise<{ items: AdminWorkspaceDTO[] }> {
  return fetchApi(`/client-identity/admin/workspaces${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ''}`);
}

export async function createAdminWorkspace(payload: { clientId: string; name: string; mode: AdminWorkspaceDTO['mode']; communicationMode: AdminWorkspaceDTO['communicationMode']; connectedSystemState: AdminWorkspaceDTO['connectedSystemState'] }): Promise<AdminWorkspaceDTO> {
  return fetchApi('/client-identity/admin/workspaces', { method: 'POST', body: JSON.stringify(payload) });
}

export async function transitionAdminWorkspace(workspaceId: string, action: 'activate' | 'suspend' | 'archive', revision: number): Promise<AdminWorkspaceDTO> {
  return fetchApi(`/client-identity/admin/workspaces/${encodeURIComponent(workspaceId)}/${action}`, { method: 'POST', body: JSON.stringify({ revision }) });
}

export async function updateAdminWorkspace(workspaceId: string, payload: { name: string; communicationMode: AdminWorkspaceDTO['communicationMode']; connectedSystemState: AdminWorkspaceDTO['connectedSystemState']; revision: number }): Promise<AdminWorkspaceDTO> {
  return fetchApi(`/client-identity/admin/workspaces/${encodeURIComponent(workspaceId)}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function revokeAdminInvitation(invitationId: string) {
  return fetchApi<{ id: string; status: string; notificationCancelled: boolean }>(`/client-identity/admin/invitations/${encodeURIComponent(invitationId)}/revoke`, { method: 'POST', body: JSON.stringify({}) });
}

export async function cancelAdminInvitationNotification(invitationId: string) {
  return fetchApi<{ invitationId: string; cancelled: boolean }>(`/client-identity/admin/invitations/${encodeURIComponent(invitationId)}/cancel-notification`, { method: 'POST', body: JSON.stringify({}) });
}

export async function inviteAdminWorkspaceMember(workspaceId: string, payload: { email: string; displayName?: string; role: WorkspaceMembershipDTO['role']; messageSafe?: string; expiresAt?: string }) {
  return fetchApi<{ state: string; membershipId?: string; invitationId?: string; deliveryStatus?: string; deliveryCodeSafe?: string | null; emailSent?: boolean; message?: string }>(`/client-identity/admin/workspaces/${encodeURIComponent(workspaceId)}/invitations`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function transitionAdminWorkspaceMembership(membershipId: string, action: 'approve' | 'suspend' | 'revoke', revision: number): Promise<WorkspaceMembershipDTO> {
  return fetchApi(`/client-identity/admin/workspace-memberships/${encodeURIComponent(membershipId)}/${action}`, { method: 'POST', body: JSON.stringify({ revision }) });
}

export async function createOrganizationGroup(payload: { clientId: string; name: string; descriptionSafe?: string }) {
  return fetchApi<OrganizationUnitAdminDTO>('/client-identity/admin/groups', { method: 'POST', body: JSON.stringify(payload) });
}

export async function listWorkspaceUnits(workspaceId: string) {
  return fetchApi<{ items: OrganizationUnitAdminDTO[] }>(`/client-identity/admin/workspaces/${encodeURIComponent(workspaceId)}/units`);
}

export async function linkWorkspaceUnit(workspaceId: string, groupId: string) {
  return fetchApi<{ id: string; workspaceId: string | null }>(`/client-identity/admin/workspaces/${encodeURIComponent(workspaceId)}/units/${encodeURIComponent(groupId)}/link`, { method: 'POST', body: JSON.stringify({}) });
}

export async function unlinkWorkspaceUnit(groupId: string) {
  return fetchApi<{ id: string; workspaceId: string | null }>(`/client-identity/admin/units/${encodeURIComponent(groupId)}/unlink`, { method: 'POST', body: JSON.stringify({}) });
}

export async function listUnitMemberships(workspaceId: string, workspaceMembershipId: string) {
  return fetchApi<{ items: UnitMembershipDTO[] }>(`/client-identity/admin/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(workspaceMembershipId)}/unit-memberships`);
}

export async function assignUnitMembership(workspaceId: string, workspaceMembershipId: string, payload: { groupId: string; unitRole: OrganizationUnitRole }) {
  return fetchApi<UnitMembershipDTO>(`/client-identity/admin/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(workspaceMembershipId)}/unit-memberships`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function revokeUnitMembership(unitMembershipId: string) {
  return fetchApi<{ id: string; status: string; revision: number }>(`/client-identity/admin/unit-memberships/${encodeURIComponent(unitMembershipId)}/revoke`, { method: 'POST', body: JSON.stringify({}) });
}

export async function listCaseParticipants(workspaceId: string, caseId: string) {
  return fetchApi<{ items: CaseParticipantDTO[] }>(`/client-identity/admin/workspaces/${encodeURIComponent(workspaceId)}/cases/${encodeURIComponent(caseId)}/participants`);
}

export async function createCaseParticipant(payload: { workspaceId: string; caseId: string; clientPortalIdentityId?: string; email?: string; participantRole: ParticipantRole; permissions: string[] }) {
  return fetchApi<CaseParticipantDTO & { idempotent: boolean; reactivated: boolean }>('/client-identity/admin/participants', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateCaseParticipant(grantId: string, payload: { revision: number; participantRole?: ParticipantRole; permissions?: string[] }) {
  return fetchApi<{ id: string; revision: number }>(`/client-identity/admin/participants/${encodeURIComponent(grantId)}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function revokeCaseParticipant(grantId: string) {
  return fetchApi<{ id: string; status: string }>(`/client-identity/admin/participants/${encodeURIComponent(grantId)}/revoke`, { method: 'POST', body: JSON.stringify({}) });
}

export async function listSummaryScopes(workspaceId: string) {
  return fetchApi<{ items: SummaryScopeDTO[] }>(`/client-identity/admin/workspaces/${encodeURIComponent(workspaceId)}/summary-scopes`);
}

export async function createSummaryScope(payload: { workspaceId: string; clientPortalIdentityId?: string; email?: string; scopeType: SummaryScopeType; organizationGroupId?: string }) {
  return fetchApi<SummaryScopeDTO>('/client-identity/admin/summary-scopes', { method: 'POST', body: JSON.stringify(payload) });
}

export async function transitionSummaryScope(scopeId: string, action: 'suspend' | 'revoke') {
  return fetchApi<{ id: string; status: string }>(`/client-identity/admin/summary-scopes/${encodeURIComponent(scopeId)}/${action}`, { method: 'POST', body: JSON.stringify({}) });
}
