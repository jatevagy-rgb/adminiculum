import { test } from "node:test";
import assert from "node:assert/strict";
import { derivePortalMembership } from "../src/lib/organizationPortalMembership";
import type { AdminWorkspaceDTO } from "../src/lib/clientPortalAdminApi";
import type { OrgPersonDTO } from "../src/lib/clientOrganizationApi";

const person = (email: string | null, portalMembershipId: string | null = null): OrgPersonDTO => ({ id: "person", clientId: "client", organizationGroupId: null, managerPersonId: null, deputyPersonId: null, name: "Kolléga", jobTitle: null, email, phone: null, employmentStatus: "ACTIVE", startDate: null, endDate: null, responsibilitiesSummary: null, portalMembershipId });
const workspace = (membershipEmail?: string, membershipStatus: any = "ACTIVE", invitationEmail?: string): AdminWorkspaceDTO => ({ id: "workspace", clientId: "client", clientName: "Ügyfél", name: "Szervezet", mode: "ORGANIZATION", status: "ACTIVE", communicationMode: "PORTAL_PRIMARY", connectedSystemState: "READY", revision: 1, activeMembershipCount: 0, activeCaseGrantCount: 0, activeCaseGrants: [], pendingInvitationCount: 0, pendingApprovalCount: 0, memberships: membershipEmail ? [{ id: `membership-${membershipEmail}`, clientPortalIdentityId: "identity", workspaceId: "workspace", status: membershipStatus, role: "MEMBER", revision: 2, invitedAt: null, approvedAt: null, identityEmail: membershipEmail }] : [], invitations: invitationEmail ? [{ id: "invitation", intendedEmail: invitationEmail, status: "ACTIVE", deliveryStatus: "SENT", deliveryCodeSafe: null, expiresAt: "2099-01-01", createdAt: "2026-01-01" }] : [], events: [] });

test("derives one exact-email organization membership without persisting a person link", () => {
  const derived = derivePortalMembership(person("Member@example.test"), [workspace("member@example.test", "PENDING_APPROVAL")]);
  assert.equal(derived.status, "PENDING_APPROVAL");
  assert.equal(derived.membership?.id, "membership-member@example.test");
});

test("fails closed when exact email matches multiple organization memberships", () => {
  const derived = derivePortalMembership(person("member@example.test"), [workspace("member@example.test"), { ...workspace("member@example.test"), id: "workspace-2", memberships: [{ ...workspace("member@example.test").memberships[0], id: "membership-2", workspaceId: "workspace-2" }] }]);
  assert.equal(derived.status, "AMBIGUOUS");
  assert.equal(derived.membership, null);
});

test("reports a matching pending invitation separately from a membership", () => {
  const derived = derivePortalMembership(person("invite@example.test"), [workspace(undefined, "ACTIVE", "invite@example.test")]);
  assert.equal(derived.status, "INVITED");
  assert.equal(derived.membership, null);
});
