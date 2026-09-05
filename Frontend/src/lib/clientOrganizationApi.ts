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
  email: string | null;
  phone: string | null;
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

export interface CreateOrgGroupInput {
  name: string;
  descriptionSafe?: string | null;
  parentGroupId?: string | null;
  workspaceId?: string | null;
}

export interface UpdateOrgGroupInput {
  name?: string;
  descriptionSafe?: string | null;
  parentGroupId?: string | null;
}

export interface CreateOrgPersonInput {
  name: string;
  jobTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  organizationGroupId?: string | null;
  managerPersonId?: string | null;
  deputyPersonId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  responsibilitiesSummary?: string | null;
  portalMembershipId?: string | null;
  employmentStatus?: string;
}

export interface UpdateOrgPersonInput {
  name?: string;
  jobTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  organizationGroupId?: string | null;
  managerPersonId?: string | null;
  deputyPersonId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  responsibilitiesSummary?: string | null;
  portalMembershipId?: string | null;
}

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
  createGroup(clientId: string, data: CreateOrgGroupInput) {
    return fetchApi<OrgGroupDTO>(url(clientId, '/groups'), {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  updateGroup(groupId: string, data: UpdateOrgGroupInput) {
    return fetchApi<OrgGroupDTO>(`/client-organization/groups/${encodeURIComponent(groupId)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  listPersons(clientId: string) {
    return fetchApi<{ items: OrgPersonDTO[] }>(url(clientId, '/persons'));
  },
  getPerson(personId: string) {
    return fetchApi<OrgPersonDTO>(`/client-organization/persons/${encodeURIComponent(personId)}`);
  },
  createPerson(clientId: string, data: CreateOrgPersonInput) {
    return fetchApi<OrgPersonDTO>(url(clientId, '/persons'), {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  updatePerson(personId: string, data: UpdateOrgPersonInput) {
    return fetchApi<OrgPersonDTO>(`/client-organization/persons/${encodeURIComponent(personId)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  transitionPerson(personId: string, employmentStatus: string) {
    return fetchApi<OrgPersonDTO>(`/client-organization/persons/${encodeURIComponent(personId)}/status`, {
      method: "POST",
      body: JSON.stringify({ employmentStatus }),
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
