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
  "DOCUMENT_READ",
  "DOCUMENT_DOWNLOAD",
  "ACTION_REQUEST_READ",
  "UPDATE_READ",
] as const;

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
