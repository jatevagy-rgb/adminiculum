import { readFileSync } from 'fs';
import path from 'path';

/**
 * Static contract for the internal portal-admin membership approval + identity-
 * based grant path. Guards the invariants the browser/DB acceptance depends on:
 * admin-only, optimistic concurrency, cross-client rejection, active-membership
 * gating, and the identity-based (never clientUserId) grant for External ID
 * customers.
 */
const root = path.resolve(__dirname, '..');
const service = readFileSync(path.join(root, 'src/modules/client-identity/identityService.ts'), 'utf8');
const routes = readFileSync(path.join(root, 'src/modules/client-identity/routes.ts'), 'utf8');

describe('internal portal-admin grant contract', () => {
  it('exposes admin membership + grant routes behind ADMIN/PARTNER only', () => {
    expect(routes).toMatch(/clientIdentityRouter\.use\('\/admin',\s*authenticate,\s*requireRole\('ADMIN',\s*'PARTNER'\)\)/);
    expect(routes).toContain("clientIdentityRouter.get('/admin/membership-requests'");
    expect(routes).toContain("clientIdentityRouter.get('/admin/memberships'");
    expect(routes).toContain("clientIdentityRouter.post('/admin/grants'");
  });

  it('approval enforces optimistic concurrency and cross-client group rejection', () => {
    const fn = service.slice(service.indexOf('export async function approveMembershipRequest'), service.indexOf('export async function rejectMembershipRequest'));
    expect(fn).toMatch(/request\.revision !== revision/);
    expect(fn).toContain('REVISION_CONFLICT');
    expect(fn).toContain('CROSS_CLIENT_GROUP_REJECTED');
    // Approval activates the canonical identity + creates the membership.
    expect(fn).toContain("status: 'ACTIVE'");
    expect(fn).toContain('clientOrganizationMembership.create');
  });

  it('grant is identity-based and never uses the legacy clientUserId path', () => {
    const fn = service.slice(service.indexOf('export async function createGrantForApprovedMembership'), service.indexOf('export async function listActiveMemberships'));
    expect(fn).toContain('clientUserId: null');
    expect(fn).toContain('clientPortalIdentityId: identity.id');
    // Requires an active membership AND active identity AND a real case.
    expect(fn).toContain('ACTIVE_MEMBERSHIP_REQUIRED');
    expect(fn).toContain('ACTIVE_IDENTITY_REQUIRED');
    expect(fn).toContain('CASE_NOT_FOUND');
    // Whitelists permissions and supports a validity window.
    expect(fn).toContain('ALLOWED_GRANT_PERMISSIONS');
    expect(fn).toContain('validUntil');
    expect(fn).toContain('findFirst');
    expect(fn).toContain('GRANT_ALREADY_ACTIVE');
    expect(fn).toContain('GRANT_CONCURRENT_CONFLICT');
    expect(fn).toContain('GRANT_ACTIVATED');
    expect(fn).toContain('Serializable');
  });

  it('membership approval alone does not create any grant', () => {
    const approve = service.slice(service.indexOf('export async function approveMembershipRequest'), service.indexOf('export async function rejectMembershipRequest'));
    expect(approve).not.toContain('clientPortalGrant.create');
    // grantRequired signals the separate explicit grant step.
    expect(approve).toContain('grantRequired: true');
  });

  it('active-membership listing is reviewer-gated', () => {
    const fn = service.slice(service.indexOf('export async function listActiveMemberships'));
    expect(fn).toContain('requireReviewer(actor)');
    expect(fn).toContain("status: 'ACTIVE'");
  });
});
