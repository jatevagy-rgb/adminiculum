import { fetchApi } from "./api";

// Internal portal administration API — membership review + identity-based grants
// for External ID customers. All routes require ADMIN/PARTNER (server-enforced).

export interface MembershipRequestDTO {
  id: string;
  clientPortalIdentityId: string;
  requestedClientId: string | null;
  requestedOrganizationName: string | null;
  requestedGroupId: string | null;
  requestedGroupName: string | null;
  corporateEmail: string | null;
  status: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectionReasonSafe: string | null;
  revision: number;
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

export async function approveMembershipRequest(
  requestId: string,
  payload: { clientId: string; groupId?: string; revision: number },
): Promise<{ membership: { id: string }; grantRequired: boolean; nextAction: string }> {
  return fetchApi(`/client-identity/admin/membership-requests/${encodeURIComponent(requestId)}/approve`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function rejectMembershipRequest(
  requestId: string,
  payload: { revision: number; rejectionReasonSafe?: string },
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

export async function inviteAdminWorkspaceMember(workspaceId: string, payload: { email: string; role: WorkspaceMembershipDTO['role'] }) {
  return fetchApi<{ state: string; membershipId?: string; invitationId?: string }>(`/client-identity/admin/workspaces/${encodeURIComponent(workspaceId)}/invitations`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function transitionAdminWorkspaceMembership(membershipId: string, action: 'approve' | 'suspend' | 'revoke', revision: number): Promise<WorkspaceMembershipDTO> {
  return fetchApi(`/client-identity/admin/workspace-memberships/${encodeURIComponent(membershipId)}/${action}`, { method: 'POST', body: JSON.stringify({ revision }) });
}
