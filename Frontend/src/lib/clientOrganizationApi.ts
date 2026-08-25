import { fetchApi } from './api';

export type OrgGroupDTO = {
  id: string;
  clientId: string;
  workspaceId: string | null;
  name: string;
  descriptionSafe: string | null;
  status: string;
  parentGroupId: string | null;
};

export type OrgResponsibilityDTO = { id: string; type: string; label: string };

export type OrgPersonDTO = {
  id: string;
  clientId: string;
  organizationGroupId: string | null;
  managerPersonId: string | null;
  deputyPersonId: string | null;
  name: string;
  jobTitle: string | null;
  employmentStatus: string;
  startDate: string | null;
  endDate: string | null;
  responsibilitiesSummary: string | null;
  portalMembershipId?: string | null;
  portalMembershipRole?: string | null;
  responsibilities?: OrgResponsibilityDTO[];
  organizationGroupName?: string | null;
  managerName?: string | null;
  deputyName?: string | null;
  ownedContracts?: { id: string; title: string; status: string }[];
  ownedObligations?: { id: string; title: string; status: string }[];
  ownedInitiatives?: { id: string; title: string; status: string }[];
};

export type ResponsibilityGaps = {
  contractsWithoutOwner: { id: string; title: string }[];
  obligationsWithoutOwner: { id: string; title: string }[];
  ownerPersonsInactive: { id: string; name: string }[];
};

function url(clientId: string, path: string): string {
  return `/client-organization/clients/${encodeURIComponent(clientId)}${path}`;
}

export const clientOrganizationApi = {
  listGroups(clientId: string) {
    return fetchApi<{ items: OrgGroupDTO[] }>(url(clientId, '/groups'));
  },
  listPersons(clientId: string) {
    return fetchApi<{ items: OrgPersonDTO[] }>(url(clientId, '/persons'));
  },
  getPerson(personId: string) {
    return fetchApi<OrgPersonDTO>(`/client-organization/persons/${encodeURIComponent(personId)}`);
  },
  updatePerson(personId: string, data: Partial<Pick<OrgPersonDTO, "jobTitle" | "organizationGroupId" | "managerPersonId" | "deputyPersonId">>) {
    return fetchApi<OrgPersonDTO>(`/client-organization/persons/${encodeURIComponent(personId)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  responsibilityGaps(clientId: string) {
    return fetchApi<ResponsibilityGaps>(url(clientId, '/gaps'));
  },
};

export function personStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    ACTIVE: 'Aktív',
    ON_LEAVE: 'Szabadságon',
    INACTIVE: 'Inaktív',
    ENDED: 'Lezárva',
  };
  return labels[status] || status;
}

export function responsibilityTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    MANAGEMENT: 'Ügyvezetés',
    FINANCE: 'Pénzügy',
    CONTRACT_OWNER: 'Szerződésgazda',
    OBLIGATION_OWNER: 'Kötelezettséggazda',
    DATA_PROTECTION: 'Adatvédelem',
    APPROVAL: 'Jóváhagyás',
    OPERATIONS: 'Operáció',
    HR: 'HR',
    OTHER: 'Egyéb',
  };
  return labels[type] || type;
}

export function contractOwnerStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Piszkozat',
    ACTIVE: 'Hatályos',
    EXPIRED: 'Lejárt',
    TERMINATED: 'Megszüntetve',
    SUPERSEDED: 'Felváltva',
  };
  return labels[status] || status;
}

export function obligationOwnerStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    OPEN: 'Nyitott',
    IN_PROGRESS: 'Folyamatban',
    SATISFIED: 'Teljesítve',
    WAIVED: 'Elengedve',
    EXPIRED: 'Lejárt',
  };
  return labels[status] || status;
}
