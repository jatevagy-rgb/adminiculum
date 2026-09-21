import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// Client-scoped internal Portal Center convergence.
// The control surface must stay truthful: every count/status comes from the
// canonical server read models and no fabricated users, dates, statuses or
// documents are ever rendered.

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const page = read("src/app/clients/[clientId]/portal/page.tsx");
const memberAdmin = read("src/components/client-portal/ClientPortalMemberAdmin.tsx");
const publicationApi = read("src/lib/clientPublicationApi.ts");

test("A. active portal member count comes from the canonical workspace read model", () => {
  assert.match(page, /workspace\.activeMembershipCount/);
  // never recomputed client-side from the membership rows
  assert.doesNotMatch(page, /memberships\.filter\([^)]*ACTIVE[^)]*\)\.length/);
  assert.doesNotMatch(memberAdmin, /memberships\.filter\([\s\S]*?\)\.length[\s\S]*?>Aktív portál tag/);
});

test("B. suspended / inactive memberships stay visible as their own status, not as active", () => {
  assert.match(memberAdmin, /SUSPENDED: "Felfüggesztve"/);
  assert.match(memberAdmin, /REVOKED: "Visszavonva"/);
  assert.match(memberAdmin, /EXPIRED: "Meghívás lejárt"/);
  assert.match(page, /workspace \? statusLabels\[workspace\.status\] : "Nincs portál"/);
});

test("C. published-content count is server-authoritative and never fabricated", () => {
  assert.match(page, /getClientPublishedContent\(clientId\)/);
  assert.match(page, /published\.counts\.total/);
  // the page never derives a publication count from cases/documents
  assert.doesNotMatch(page, /getCases|publications\.length|documents\.length/);
  // the count/list is read from the canonical publication projection endpoint
  assert.match(publicationApi, /\/client-publications\/clients\/\$\{encodeURIComponent\(clientId\)\}\/published-content/);
});

test("D. exact-version document publication contract remains untouched", () => {
  assert.match(publicationApi, /transitionDocumentPublication/);
  assert.match(publicationApi, /Explicit exact-version publication acknowledgement/);
  assert.match(publicationApi, /documentVersionId/);
});

test("E/F. every read is scoped to the route client — no cross-client fixtures", () => {
  assert.match(page, /const clientId = String\(params\?\.clientId \|\| ""\)/);
  assert.match(page, /listAdminWorkspaces\(clientId\)/);
  assert.match(page, /getClientPublishedContent\(clientId\)/);
  // no hardcoded users, documents or client identifiers anywhere on the surface
  assert.doesNotMatch(page, /@example\.|00000000-0000-0000-0000-/);
  assert.doesNotMatch(memberAdmin, /@example\.|00000000-0000-0000-0000-/);
});

test("G/H. invitation, approve, suspend and revoke remain the canonical transitions", () => {
  assert.match(memberAdmin, /inviteAdminWorkspaceMember\(selected\.id/);
  assert.match(memberAdmin, /transitionAdminWorkspaceMembership\(membership\.id, action, membership\.revision\)/);
  assert.match(memberAdmin, /membershipAction\(member, "approve"/);
  assert.match(memberAdmin, /membershipAction\(member, "suspend"/);
  assert.match(memberAdmin, /membershipAction\(member, "revoke"/);
});

test("I/J/K. individual, organization and case-relay modes are preserved, not replaced", () => {
  assert.match(page, /INDIVIDUAL: "Magánügyfél"/);
  assert.match(page, /ORGANIZATION: "Szervezeti ügyfél"/);
  assert.match(page, /CASE_RELAY: "Szervezeti ügyfél"/);
  assert.match(page, /workspace\?\.mode === "ORGANIZATION" \|\| workspace\?\.mode === "CASE_RELAY"/);
  assert.match(page, /\{organizationMode \? "Igen" : "Nem"\}/);
});

test("L. open-portal action uses the canonical client workspace context", () => {
  // rendered only for a canonical, non-archived workspace of this client
  assert.match(page, /\{workspace \? \([\s\S]*?href="\/portal"[\s\S]*?Portál megnyitása/);
  assert.match(page, /target="_blank"/);
});

test("M. no internal unpublished document can leak into the surface", () => {
  assert.doesNotMatch(page, /from "@\/lib\/api"[\s\S]*getDocuments|getDocumentVersions/);
  assert.doesNotMatch(page, /documentVersions|documentVersionId|storageReference/);
  // only the published projection is consumed
  assert.match(page, /publishedTypeLabels/);
});

test("published content renders real deep links into the canonical workflows", () => {
  assert.match(page, /item\.type === "DOCUMENT"[\s\S]*?\/cases\/\$\{encodeURIComponent\(item\.caseId\)\}\/documents/);
  assert.match(page, /\/cases\/\$\{encodeURIComponent\(item\.caseId\)\}\/client-portal/);
  assert.match(page, /data-testid="published-content-list"/);
});

test("member rows surface canonical inviter, invitation and acceptance timestamps", () => {
  assert.match(memberAdmin, /member\.invitedByName \? ` · meghívta: \$\{member\.invitedByName\}`/);
  assert.match(memberAdmin, /member\.approvedAt \? ` · elfogadva: \$\{formatPortalDate\(member\.approvedAt\)\}`/);
  assert.match(memberAdmin, /member\.expiresAt \? ` · lejár: \$\{formatPortalDate\(member\.expiresAt\)\}`/);
});

test("truthful empty, loading and error states are preserved", () => {
  assert.match(page, /Ehhez az ügyfélhez még nincs létrehozott portál\./);
  assert.match(page, /Jelenleg nincs ügyfélnek publikált tartalom/);
  assert.match(page, /Publikált tartalom betöltése…/);
  assert.match(page, /A publikált tartalom adatai jelenleg nem érhetők el\./);
});

// ─── State dimension separation ─────────────────────────────────────────────
// Portal preparation, workspace state, membership, invitation delivery and
// publication are independent server states. They may be presented next to each
// other, but none of them may be presented as, or derived from, another.

test("N. the five state dimensions are rendered as separate labelled groups", () => {
  for (const dimension of [
    'data-testid="portal-dimension-portal-workspace"',
    'data-testid="portal-dimension-membership"',
    'data-testid="portal-dimension-invitation"',
    'data-testid="portal-dimension-publication"',
  ]) {
    assert.ok(page.includes(dimension), `missing separated dimension: ${dimension}`);
  }
  // the client-level portal switch stays its own state, not the workspace state
  assert.ok(page.includes('client.portalAccessEnabled ? "Portál előkészítve" : "Portál hozzáférés kikapcsolva"'));
  // workspace state is labelled as the workspace, never as "Portál: ..."
  assert.doesNotMatch(page, /Portál: \{statusLabels\[workspace\.status\]\}/);
  assert.ok(page.includes('Munkatér: {workspace ? statusLabels[workspace.status] : "Nincs portál"}'));
});

test("O. invitation and delivery state comes from canonical invitation rows only", () => {
  assert.ok(page.includes("item.pendingInvitationCount"), "invitation count must come from the workspace read model");
  assert.ok(page.includes("deliverySummary(invitation.deliveryStatus, invitation.deliveryCodeSafe)"), "delivery wording must reuse the canonical mapping");
  // delivery state is never derived from the workspace status
  assert.doesNotMatch(page, /deliveryStatus[\s\S]{0,80}workspace\.status/);
  // and the surface states the separation explicitly in both directions
  assert.ok(page.includes("A meghívás rögzítése nem jelenti, hogy az e-mail kézbesítve lett; a kézbesítési hiba a munkatér állapotát nem változtatja meg."));
  assert.ok(page.includes("A portál-előkészítés ügyfélszintű kapcsoló; a munkatér állapota ettől független."));
});

test("P. membership state is canonical and never implies delivery or case access", () => {
  assert.ok(page.includes("workspace.pendingApprovalCount"), "pending approval count must come from the workspace read model");
  assert.ok(page.includes("A tagság önmagában nem ad ügyhozzáférést, és nem bizonyít e-mail-kézbesítést."));
});

test("Q. zero publication categories are never presented as published content", () => {
  assert.ok(page.includes("publicationTypes.filter(([, count]) => count > 0)"), "only non-zero publication categories may be rendered");
  assert.ok(page.includes("Nincs publikált tartalom."), "an empty publication state must stay honest");
  // the per-category breakdown no longer renders zero counts
  assert.doesNotMatch(page, /ügyállapot: \{published\.counts\.matters\}/);
  assert.ok(page.includes("A portál aktiválása nem publikál tartalmat; a publikáció külön, kifejezett lépés."));
});
