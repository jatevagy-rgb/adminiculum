import type { AdminWorkspaceDTO, WorkspaceMembershipDTO } from "@/lib/clientPortalAdminApi";
import type { OrgPersonDTO } from "@/lib/clientOrganizationApi";

export type DerivedPortalMembership = {
  membership: WorkspaceMembershipDTO | null;
  invitationDeliveryStatus?: string | null;
  invitationDeliveryCodeSafe?: string | null;
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
    .find((invitation) => normalized(invitation.intendedEmail) === email && invitation.status === "ACTIVE");
  return pendingInvitation
    ? { membership: null, status: "INVITED", invitationDeliveryStatus: pendingInvitation.deliveryStatus, invitationDeliveryCodeSafe: pendingInvitation.deliveryCodeSafe }
    : { membership: null, status: "NONE" };
}

export function portalMembershipStatusLabel(value: DerivedPortalMembership | DerivedPortalMembership["status"]): string {
  const status = typeof value === "string" ? value : value.status;
  if (status === "INVITED" && typeof value !== "string") {
    if (value.invitationDeliveryStatus === "SENT") return "Meghívó e-mail elküldve";
    if (value.invitationDeliveryStatus === "PENDING") return "Meghívás rögzítve · kézbesítésre vár";
    if (value.invitationDeliveryStatus === "SENDING") return "Meghívó küldése folyamatban";
    if (value.invitationDeliveryStatus === "FAILED_RETRYABLE" && value.invitationDeliveryCodeSafe === "MAIL_PROVIDER_NOT_CONFIGURED") return "Meghívás rögzítve · e-mail-küldés nincs konfigurálva";
    if (value.invitationDeliveryStatus === "FAILED_RETRYABLE") return "Meghívás rögzítve · e-mail-küldés átmenetileg sikertelen";
    if (value.invitationDeliveryStatus === "FAILED_FINAL") return "Meghívás rögzítve · e-mail-küldés sikertelen";
    return "Meghívás rögzítve · kézbesítési állapot nem ismert";
  }
  return ({ NONE: "Nincs hozzáférés", INVITED: "Meghívás rögzítve · kézbesítési állapot nem ismert", PENDING_APPROVAL: "Jóváhagyásra vár", ACTIVE: "Aktív", SUSPENDED: "Felfüggesztve", REVOKED: "Visszavonva", EXPIRED: "Lejárt", AMBIGUOUS: "Több lehetséges tagság — ellenőrzés szükséges" })[status];
}
