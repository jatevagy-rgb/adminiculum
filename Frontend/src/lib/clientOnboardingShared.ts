/**
 * Pure, framework-free onboarding helpers shared by the onboarding UI and API
 * client. Kept side-effect free (no imports of api/window) so they can be unit
 * tested with the repository's node:test harness.
 */

export type OnboardingMode = 'INDIVIDUAL' | 'ORGANIZATION' | 'CASE_RELAY';

export interface OnboardingRequestInput {
  requestedMode: OnboardingMode;
  displayName?: string | null;
  phone?: string | null;
  claimedOrganizationName?: string | null;
  claimedUnitName?: string | null;
  claimedJobTitle?: string | null;
  corporateEmail?: string | null;
  note?: string | null;
}

/** Keys the onboarding payload must never contain — server-authoritative. */
export const FORBIDDEN_ONBOARDING_KEYS = [
  'clientId', 'requestedClientId', 'workspaceId', 'approvedWorkspaceId', 'role',
  'membershipRole', 'permissions', 'status', 'verifiedEmailSnapshot',
  'internalDecisionNote', 'approvedMembershipId', 'clientPortalIdentityId',
];

/** Build the explicit, server-safe onboarding payload. Mode-irrelevant fields
 *  are dropped so an INDIVIDUAL request never carries organization data. */
export function buildOnboardingPayload(input: OnboardingRequestInput): Record<string, unknown> {
  const payload: Record<string, unknown> = { requestedMode: input.requestedMode };
  const trimmed = (value?: string | null) => {
    const text = String(value ?? '').trim();
    return text.length ? text : undefined;
  };
  if (trimmed(input.displayName)) payload.displayName = trimmed(input.displayName);
  if (trimmed(input.phone)) payload.phone = trimmed(input.phone);
  if (trimmed(input.note)) payload.note = trimmed(input.note);
  if (input.requestedMode !== 'INDIVIDUAL') {
    if (trimmed(input.claimedOrganizationName)) payload.claimedOrganizationName = trimmed(input.claimedOrganizationName);
    if (trimmed(input.claimedUnitName)) payload.claimedUnitName = trimmed(input.claimedUnitName);
    if (trimmed(input.claimedJobTitle)) payload.claimedJobTitle = trimmed(input.claimedJobTitle);
    if (trimmed(input.corporateEmail)) payload.corporateEmail = trimmed(input.corporateEmail);
  }
  return payload;
}

export function onboardingPayloadIsSafe(payload: Record<string, unknown>): boolean {
  return !Object.keys(payload).some((key) => FORBIDDEN_ONBOARDING_KEYS.includes(key));
}
