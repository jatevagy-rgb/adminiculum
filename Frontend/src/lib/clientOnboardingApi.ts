/**
 * Customer portal onboarding + membership-request API client.
 *
 * These calls run in the customer auth context but carry NO workspace header
 * (the identity has no active workspace yet). The payload sent to the server is
 * an explicit allowlist — the customer may never supply an authoritative client
 * id, workspace id, membership role, permission set, or server status. The
 * verified e-mail is always taken from the server-side session, never from here.
 */
import { fetchApi } from './api';
import { buildOnboardingPayload, type OnboardingMode, type OnboardingRequestInput } from './clientOnboardingShared';

export type { OnboardingMode, OnboardingRequestInput } from './clientOnboardingShared';
export { buildOnboardingPayload, onboardingPayloadIsSafe, FORBIDDEN_ONBOARDING_KEYS } from './clientOnboardingShared';

const CUSTOMER = { authContext: 'customer' as const, skipWorkspaceContext: true };

export interface SubmitRequestResult {
  id: string;
  status: string;
  duplicate?: boolean;
  message?: string;
}

export async function submitMembershipRequest(input: OnboardingRequestInput): Promise<SubmitRequestResult> {
  const payload = buildOnboardingPayload(input);
  return fetchApi<SubmitRequestResult>('/client-identity/me/membership-requests', {
    ...CUSTOMER, method: 'POST', body: JSON.stringify(payload),
  });
}

export async function cancelMembershipRequest(requestId: string, revision: number): Promise<{ id: string; status: string }> {
  return fetchApi(`/client-identity/me/membership-requests/${encodeURIComponent(requestId)}/cancel`, {
    ...CUSTOMER, method: 'POST', body: JSON.stringify({ revision }),
  });
}

export async function acceptInvitation(invitationId: string): Promise<{ workspaceReference: string; membershipId: string }> {
  return fetchApi('/client-identity/me/invitations/accept', {
    ...CUSTOMER, method: 'POST', body: JSON.stringify({ invitationId }),
  });
}

/** Map the selected /portal login-intent mode to the request mode enum. */
export function readSelectedModeIntent(): OnboardingMode | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem('adminiculum:client-portal-login-intent');
  if (raw === 'organization') return 'ORGANIZATION';
  if (raw === 'case-relay') return 'CASE_RELAY';
  if (raw === 'individual') return 'INDIVIDUAL';
  return null;
}
