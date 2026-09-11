import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Client-scoped portal member administration contract for
// /clients/[clientId]/portal -> ClientPortalMemberAdmin.
// The surface must reuse the canonical workspace invitation/membership APIs
// and never duplicate the global /client-portal-admin control plane.

const page = readFileSync("src/app/clients/[clientId]/portal/page.tsx", "utf8");
const admin = readFileSync("src/components/client-portal/ClientPortalMemberAdmin.tsx", "utf8");
const globalAdmin = readFileSync("src/app/client-portal-admin/page.tsx", "utf8");

test("A. client-scoped portal renders memberships scoped to that client only", () => {
  assert.match(page, /listAdminWorkspaces\(clientId\)/);
  assert.match(page, /<ClientPortalMemberAdmin clientId=\{clientId\} workspaces=\{workspaces\}/);
  assert.match(admin, /selected\.memberships\.map/);
  // identity name/email come from the admin DTO join, not a new fetch path
  assert.match(admin, /member\.identityDisplayName \|\| member\.identityEmail \|\| "Ügyfélfelhasználó"/);
});

test("B. invitation form renders when a non-archived workspace exists", () => {
  assert.match(admin, /data-testid="invite-form"/);
  assert.match(admin, /Felhasználó meghívása/);
  assert.match(admin, /placeholder="E-mail \*"/);
  assert.match(admin, /placeholder="Név \(opcionális\)"/);
  assert.match(admin, /aria-label="Portál szerep"/);
  assert.match(admin, /aria-label="Lejárat"/);
  assert.match(admin, /Ügyfélnek szánt rövid üzenet/);
});

test("C. ORGANIZATION invite role selector includes APPROVER", () => {
  assert.match(admin, /mode === "ORGANIZATION"[\s\S]*?value: "APPROVER", label: "Jóváhagyó \/ vezetői kapcsolattartó"/);
});

test("D. INDIVIDUAL role options preserve existing semantics", () => {
  assert.match(admin, /mode === "INDIVIDUAL"[\s\S]*?value: "MEMBER", label: "Ügyfél"[\s\S]*?value: "REPRESENTATIVE", label: "Meghatalmazott \/ kapcsolattartó"/);
});

test("E. exactly one non-archived workspace auto-selects", () => {
  assert.match(admin, /manageable\.length === 1 \? manageable\[0\]/);
});

test("F. multiple workspaces require explicit selection", () => {
  assert.match(admin, /manageable\.length > 1/);
  assert.match(admin, /data-testid="workspace-select"/);
  assert.match(admin, /Válasszon munkateret/);
  // no arbitrary pick: with >1 workspaces selection stays null until chosen
  assert.match(admin, /manageable\.find\(\(workspace\) => workspace\.id === selectedId\) \|\| null/);
});

test("G. no workspace shows a truthful empty state and the global admin link", () => {
  assert.match(admin, /manageable\.length === 0/);
  assert.match(admin, /Ehhez az ügyfélhez még nincs aktív portál munkatér/);
  assert.match(admin, /href="\/client-portal-admin"/);
});

test("H. NEW invitation feedback records/sends and reports delivery", () => {
  assert.match(admin, /Meghívás elküldve\. \$\{delivery\}/);
  assert.match(admin, /Meghívás rögzítve\. \$\{delivery\}/);
  assert.match(admin, /deliverySummary\(result\.deliveryStatus, result\.deliveryCodeSafe\)/);
});

test("I. existing verified identity gets the attachment message, not a re-registration prompt", () => {
  assert.match(admin, /result\.state === "PENDING_APPROVAL" && result\.membershipId/);
  assert.match(admin, /Meglévő portálfiók hozzáadva ehhez az ügyfélfelülethez\./);
  // canonical approve transition reactivates the membership to ACTIVE
  assert.match(admin, /transitionAdminWorkspaceMembership\(membership\.id, "approve", membership\.revision\)/);
});

test("J. frontend never creates identities, clients or workspaces", () => {
  assert.doesNotMatch(admin, /createClientPortalIdentity|createClient\(|createAdminWorkspace|clientPortalIdentity\.create/);
  assert.doesNotMatch(page, /createAdminWorkspace|createClient\(/);
});

test("K. global /client-portal-admin remains intact and reuses the same canonical APIs", () => {
  assert.match(page, /href="\/client-portal-admin"/);
  assert.match(globalAdmin, /InvitationForm workspace=\{workspace\}/);
  assert.match(admin, /inviteAdminWorkspaceMember\(selected\.id/);
  assert.match(admin, /transitionAdminWorkspaceMembership\(membership\.id, action, membership\.revision\)/);
  assert.match(admin, /revokeAdminInvitation\(invitation\.id\)/);
  assert.match(admin, /cancelAdminInvitationNotification\(invitation\.id\)/);
});

test("L. APPROVER cannot leak to INDIVIDUAL/CASE_RELAY after a workspace switch or at submit", () => {
  // Switching the target workspace normalizes a stale role draft to an allowed role
  assert.match(admin, /selectWorkspace[\s\S]*?roleOptionsFor\(next\.mode\)\.some\(\(option\) => option\.value === current\.role\)[\s\S]*?role: "MEMBER"/);
  assert.match(admin, /onChange=\{\(event\) => selectWorkspace\(event\.target\.value\)\}/);
  // Submit re-validates against the selected mode's allowed roles, never sends a stale APPROVER
  assert.match(admin, /const allowedRole = roleOptionsFor\(selected\.mode\)\.some\(\(option\) => option\.value === draft\.role\) \? draft\.role : "MEMBER"/);
  assert.match(admin, /role: allowedRole,/);
  // INDIVIDUAL and CASE_RELAY role option sets contain no APPROVER
  const optionsFn = admin.match(/function roleOptionsFor[\s\S]*?\n\}/)![0];
  const individual = optionsFn.match(/mode === "INDIVIDUAL"[\s\S]*?\];/)![0];
  const relayReturn = optionsFn.split('mode === "ORGANIZATION"')[1].split('];').slice(1).join('];');
  assert.ok(!individual.includes('"APPROVER"'));
  assert.ok(!relayReturn.includes('"APPROVER"'));
  // APPROVER label must never masquerade as Ügyfél in INDIVIDUAL mode
  assert.match(admin, /if \(role === "APPROVER"\) return "Jóváhagyó \/ vezetői kapcsolattartó";/);
});

test("membership actions only expose canonical transitions supported by state", () => {
  assert.match(admin, /member\.status === "PENDING_APPROVAL" \|\| member\.status === "SUSPENDED"[\s\S]*?"approve"/);
  assert.match(admin, /member\.status === "ACTIVE" \|\| member\.status === "PENDING_APPROVAL"[\s\S]*?"suspend"/);
  assert.match(admin, /member\.status !== "REVOKED" && member\.status !== "EXPIRED"[\s\S]*?"revoke"/);
  assert.doesNotMatch(admin, /"pause"|"ban"|"merge"/);
});
