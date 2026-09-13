import type { AdminWorkspaceDTO, WorkspaceMembershipDTO } from "@/lib/clientPortalAdminApi";
import type { OrgPersonDTO } from "@/lib/clientOrganizationApi";

export type DerivedPortalMembership = {
  membership: WorkspaceMembershipDTO | null;
  status: "NONE" | "INVITED" | "PENDING_APPROVAL" | "ACTIVE" | "SUSPENDED" | "REVOKED" | "EXPIRED" | "AMBIGUOUS";
};

const normalized = (value: string | null | undefined) => value?.trim().toLocaleLowerCase("hu-HU") || "";

/** A directory row never establishes authorization; this only exposes an exact existing portal relationship. */
export function derivePortalMembership(person: OrgPersonDTO, workspaces: AdminWorkspaceDTO[]): DerivedPortalMembership {
  const activeOrganization = workspaces.filter((workspace) => workspace.status === "ACTIVE" && workspace.mode === "ORGANIZATION");
  const allMemberships = workspaces.flatMap((workspace) => workspace.memberships);
  if (person.portalMembershipId) {
    const membership = allMemberships.find((item) => item.id === person.portalMembershipId) || null;
    return membership ? { membership, status: membership.status } : { membership: null, status: "NONE" };
  }
  const email = normalized(person.email);
  if (!email) return { membership: null, status: "NONE" };
  const matches = activeOrganization.flatMap((workspace) => workspace.memberships)
    .filter((membership) => normalized(membership.identityEmail) === email);
  if (matches.length === 1) return { membership: matches[0], status: matches[0].status };
  if (matches.length > 1) return { membership: null, status: "AMBIGUOUS" };
  const pendingInvitation = activeOrganization.flatMap((workspace) => workspace.invitations)
    .some((invitation) => normalized(invitation.intendedEmail) === email && invitation.status === "ACTIVE");
  return { membership: null, status: pendingInvitation ? "INVITED" : "NONE" };
}

export function portalMembershipStatusLabel(status: DerivedPortalMembership["status"]): string {
  return ({ NONE: "Nincs hozzáférés", INVITED: "Meghívó elküldve", PENDING_APPROVAL: "Jóváhagyásra vár", ACTIVE: "Aktív", SUSPENDED: "Felfüggesztve", REVOKED: "Visszavonva", EXPIRED: "Lejárt", AMBIGUOUS: "Több lehetséges tagság — ellenőrzés szükséges" })[status];
}
