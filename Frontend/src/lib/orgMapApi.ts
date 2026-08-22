import { fetchApi } from './api';

/**
 * Internal law-firm organizational map DTO (Szervezet surface). This is a
 * workforce-only read projection. The person access summary is PRINCIPAL-DERIVED
 * from actual ClientPortalGrant / ClientPortalSummaryScope rows and is NEVER
 * inferred from the org graph (manager / deputy / group / responsibility).
 */

export type OrgMapGroupDTO = {
  id: string;
  clientId: string;
  workspaceId: string | null;
  name: string;
  descriptionSafe: string | null;
  status: string;
  parentGroupId: string | null;
};

export type OrgMapPersonAccessSummary = {
  /** Count of ACTIVE ClientPortalGrant rows to the person's portal identity. */
  casesShared: number;
  /** Count of ACTIVE unit summary scopes on the person's membership. */
  unitSummaries: number;
  /** Count of ACTIVE organization summary scopes on the person's membership. */
  organizationSummaries: number;
  /** Whether an ACTIVE ORGANIZATION summary scope grants company-summary visibility. */
  companySummaryVisible: boolean;
};

export type OrgMapPersonDTO = {
  id: string;
  name: string;
  jobTitle: string | null;
  employmentStatus: string;
  organizationGroupId: string | null;
  organizationGroupName: string | null;
  managerPersonId: string | null;
  managerName: string | null;
  deputyPersonId: string | null;
  deputyName: string | null;
  responsibilitiesSummary: string | null;
  portalMembershipId: string | null;
  portalStatus: 'ACTIVE' | 'SUSPENDED' | 'NONE';
  responsibilities: { id: string; type: string; label: string }[];
  accessSummary: OrgMapPersonAccessSummary;
};

export type OrgMapDTO = {
  client: { id: string; name: string; relationshipMode: string };
  /** Active portal workspace modes for the client. */
  workspaceModes: ('INDIVIDUAL' | 'ORGANIZATION' | 'CASE_RELAY')[];
  /** Whether any active workspace is ORGANIZATION or CASE_RELAY mode. */
  isOrganizational: boolean;
  groups: OrgMapGroupDTO[];
  persons: OrgMapPersonDTO[];
};

export function getOrganizationMap(clientId: string): Promise<OrgMapDTO> {
  return fetchApi<OrgMapDTO>(`/company-workspace/clients/${encodeURIComponent(clientId)}/organization-map`);
}

/** Determine whether a client is organizational for the Szervezet surface. */
export function isOrganizationClient(map: OrgMapDTO | null): boolean {
  // The organizational structure surface is only for clients that carry an
  // ACTIVE ORGANIZATION (or CASE_RELAY) workspace. Individual clients must not
  // render org structure. The guard uses the ACTUAL workspace mode, not a
  // CSS-only hide and not mere presence of people.
  return Boolean(map && map.isOrganizational);
}

export function portalStatusLabel(status: OrgMapPersonDTO['portalStatus']): string {
  const labels: Record<OrgMapPersonDTO['portalStatus'], string> = {
    ACTIVE: 'Portál: aktív',
    SUSPENDED: 'Portál: felfüggesztve',
    NONE: 'Nincs portál',
  };
  return labels[status] || status;
}

export function orgEmploymentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    ACTIVE: 'Aktív',
    ON_LEAVE: 'Szabadságon',
    INACTIVE: 'Inaktív',
    ENDED: 'Lezárva',
  };
  return labels[status] || status;
}