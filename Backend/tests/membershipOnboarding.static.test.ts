import { readFileSync } from 'fs';
import path from 'path';

/**
 * Fast (no-DB) structural guard for the membership-onboarding vertical. Locks in
 * the security- and wiring-critical invariants so a later edit cannot silently
 * reintroduce the dead-end or leak the internal decision note.
 */
describe('membership onboarding static boundary', () => {
  const root = path.resolve(__dirname, '..');
  const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
  const schema = read('prisma/schema.prisma');
  const migration = read('prisma/migrations/20260805120000_client_portal_membership_onboarding/migration.sql');
  const identity = read('src/modules/client-identity/identityService.ts');
  const workspace = read('src/modules/client-workspace/workspaceService.ts');
  const portalRoutes = read('src/routes/clientPortal.ts');
  const identityRoutes = read('src/modules/client-identity/routes.ts');
  const frontendRoot = path.resolve(root, '../Frontend');
  const readFront = (rel: string) => readFileSync(path.join(frontendRoot, rel), 'utf8');

  it('extends the canonical request model rather than forking a parallel one', () => {
    expect(schema).toContain('model ClientOrganizationMembershipRequest');
    expect(schema).not.toContain('model PortalMembershipRequest');
    for (const field of ['requestedMode', 'verifiedEmailSnapshot', 'clientSafeDecisionMessage', 'internalDecisionNote', 'approvedWorkspaceId', 'approvedMembershipId']) {
      expect(schema).toContain(field);
    }
  });

  it('enforces one-pending idempotency with a partial unique index', () => {
    expect(migration).toContain('client_org_membership_request_one_pending_idx');
    expect(migration).toContain("WHERE \"status\" = 'PENDING_REVIEW'");
  });

  it('takes the verified e-mail from the server session, never the client', () => {
    expect(identity).toContain('verifiedEmailSnapshot: session.normalizedEmail');
    // Idempotent submit collapses duplicates instead of creating a second row.
    expect(identity).toContain("status: 'PENDING_REVIEW'");
    expect(identity).toContain('duplicate: true');
  });

  it('approval requires an assigned workspace, checks compatibility, and provisions an ACTIVE workspace membership', () => {
    expect(identity).toContain('APPROVAL_INPUT_REQUIRED');
    expect(identity).toContain('WORKSPACE_CLIENT_MISMATCH');
    expect(identity).toContain('WORKSPACE_MODE_MISMATCH');
    // The provisioning happens inside the approval transaction.
    const approveBlock = identity.slice(identity.indexOf('export async function approveMembershipRequest'), identity.indexOf('export async function rejectMembershipRequest'));
    expect(approveBlock).toContain('clientPortalWorkspaceMembership.upsert');
    expect(approveBlock).toContain("status: 'ACTIVE'");
    expect(approveBlock).toContain('$transaction');
    // Approval must NOT create any case grant.
    expect(approveBlock).not.toContain('clientPortalGrant.create');
  });

  it('keeps the internal decision note out of the customer projection', () => {
    const customerSelect = identity.slice(identity.indexOf('CUSTOMER_REQUEST_SELECT'), identity.indexOf('CUSTOMER_REQUEST_SELECT') + 400);
    expect(customerSelect).not.toContain('internalDecisionNote');
    expect(identity).toContain('export function toCustomerMembershipRequest');
  });

  it('resolves the five onboarding states and never dead-ends', () => {
    for (const state of ['ONBOARDING_REQUIRED', 'REQUEST_PENDING', 'REQUEST_REJECTED', 'INVITATION_PENDING', 'ACCESS_SUSPENDED']) {
      expect(workspace).toContain(state);
    }
    expect(workspace).toContain('export async function getOnboardingContext');
  });

  it('serves the resolver under the registered (not active) guard so onboarding is reachable', () => {
    expect(portalRoutes).toContain('getOnboardingContext');
    const meRoute = portalRoutes.slice(portalRoutes.indexOf("router.get('/me'"), portalRoutes.indexOf("router.get('/me'") + 500);
    expect(meRoute).toContain('requireRegisteredClientPortalSession');
    expect(meRoute).not.toContain('requireActiveClientPortalSession');
    expect(identityRoutes).toContain("clientIdentityRouter.post('/me/invitations/accept'");
    expect(identityRoutes).toContain("clientIdentityRouter.get('/admin/membership-requests/:requestId'");
  });

  it('keeps lawyer-sent invitations separate from customer-initiated membership requests', () => {
    const accept = identity.slice(identity.indexOf('export async function acceptPortalInvitation'), identity.indexOf('export async function cancelMembershipRequest'));
    expect(accept).toContain("status: 'ACTIVE'");
    expect(accept).toContain('clientPortalWorkspaceMembership.upsert');
    expect(accept).not.toContain("PENDING_REVIEW");
    const submit = identity.slice(identity.indexOf('export async function submitMembershipRequest'), identity.indexOf('export async function acceptPortalInvitation'));
    expect(submit).toContain("status: 'PENDING_REVIEW'");
    expect(submit).not.toContain('clientPortalWorkspaceMembership.upsert');
  });

  it('replaces the dead-end with an onboarding surface in the portal shell', () => {
    const shell = readFront('src/components/client-portal/ClientPortalShell.tsx');
    expect(shell).toContain('PortalOnboarding');
    expect(shell).toContain('ONBOARDING_REQUIRED');
    const onboarding = readFront('src/components/client-portal/PortalOnboarding.tsx');
    expect(onboarding).toContain('Hozzáférés igénylése');
    // Verified e-mail is read-only on the form.
    expect(onboarding).toContain('readOnly');
    // The customer never sends server-authoritative fields.
    const onboardingShared = readFront('src/lib/clientOnboardingShared.ts');
    expect(onboardingShared).toContain('FORBIDDEN_ONBOARDING_KEYS');
    expect(onboardingShared).toContain('workspaceId');
  });
});
