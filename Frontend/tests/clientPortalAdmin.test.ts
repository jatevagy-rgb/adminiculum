import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('internal portal-admin UI', () => {
  const api = () => read('src/lib/clientPortalAdminApi.ts');
  const page = () => read('src/app/client-portal-admin/page.tsx');
  const caseGrant = () => read('src/components/documents/publication/CasePortalIdentityGrant.tsx');
  const interactionApi = () => read('src/lib/clientInteractionApi.ts');
  const portalShell = () => read('src/components/client-portal/ClientPortalShell.tsx');

  it('defines the admin page route', () => {
    assert.equal(existsSync(path.join(root, 'src/app/client-portal-admin/page.tsx')), true);
  });

  it('api client targets the identity-based admin endpoints only', () => {
    const src = api();
    assert.match(src, /\/client-identity\/admin\/membership-requests/);
    assert.match(src, /\/client-identity\/admin\/memberships/);
    assert.match(src, /\/client-identity\/admin\/grants/);
    // Grant payload is membership/case/permissions/validity — no clientUserId.
    assert.match(src, /membershipId/);
    assert.match(src, /permissions/);
    assert.match(src, /validUntil/);
    // no clientUserId property is ever sent on the identity grant path
    assert.doesNotMatch(src, /clientUserId\s*[:=]/);
  });

  it('page wires approve, reject and identity grant', () => {
    const src = page();
    assert.match(src, /approveMembershipRequest/);
    assert.match(src, /rejectMembershipRequest/);
    assert.match(src, /createIdentityGrant/);
    assert.match(src, /createClient/);
    assert.match(src, /Új ügyfél létrehozása/);
    assert.match(src, /Lehetséges egyezés/);
    assert.match(src, /membership-request-row/);
    assert.match(src, /active-membership-row/);
    assert.match(src, /create-grant-btn/);
    // approval passes the request revision (optimistic concurrency).
    assert.match(src, /revision: r\.revision/);
    // no legacy clientUserId grant path in the admin surface.
    assert.doesNotMatch(src, /clientUserId/);
  });

  it('defines explicit customer and workforce interaction API boundaries', () => {
    const src = interactionApi();
    assert.match(src, /customerInteractionApi/);
    assert.match(src, /workforceInteractionApi/);
    assert.match(src, /authContext: "customer"/);
    assert.match(src, /authContext: "workforce"/);
    assert.match(src, /\/client-interaction\/cases/);
    assert.match(src, /\/internal\/client-interaction\/requests/);
    assert.doesNotMatch(src, /Invalid token/);
  });

  it('customer portal matter view renders client interaction foundation', () => {
    const src = portalShell();
    assert.match(src, /CustomerInteractionCard/);
    assert.match(src, /Kérdések és bekérések/);
    assert.match(src, /customerInteractionApi\.createQuestion/);
    assert.match(src, /customerInteractionApi\.submitAnswers/);
    assert.match(src, /customerInteractionApi\.uploadFile/);
    assert.match(src, /customerInteractionApi\.submitSubmission/);
    assert.match(src, /Mire várunk\?/);
    assert.match(src, /Most itt tartunk/);
    assert.match(src, /caseId={matter\.caseId}/);
  });

  it('case-level identity grant is available and identity-based', () => {
    const src = caseGrant();
    assert.match(src, /createIdentityGrant/);
    assert.match(src, /case-identity-grant/);
    assert.doesNotMatch(src, /clientUserId\s*[:=]/);
  });

  it('is registered in internal navigation', () => {
    const sidebar = read('src/components/Sidebar.tsx');
    assert.match(sidebar, /"client-portal-admin": "\/client-portal-admin"/);
    assert.match(sidebar, /client-portal-admin/);
    const nav = read('src/lib/mockData.ts');
    assert.match(nav, /id: 'client-portal-admin'/);
  });
});
