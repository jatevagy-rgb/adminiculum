import { fetchApi } from './api';

export type ContractPartyDTO = {
  id: string;
  roleCode: string;
  displayName: string;
  registrationNumber: string | null;
  taxNumber: string | null;
  country: string | null;
};

export type ContractRecordDTO = {
  id: string;
  clientId: string;
  title: string;
  contractType: string;
  status: string;
  businessOwnerLabel: string | null;
  lawFirmOwnerUserId: string | null;
  sourceCaseId: string | null;
  canonicalDocumentVersionId: string | null;
  signatureDate: string | null;
  effectiveDate: string | null;
  expiryDate: string | null;
  termType: string | null;
  noticePeriodDays: number | null;
  autoRenewal: boolean;
  nextCriticalDate: string | null;
  securityClassification: string | null;
  parentContractId: string | null;
  familyRootContractId: string | null;
  parties?: ContractPartyDTO[];
  obligations?: ClientObligationDTO[];
  entitlements?: ContractEntitlementDTO[];
  amendments?: ContractRecordDTO[];
  createdAt: string;
  updatedAt: string;
};

export type ClientObligationDTO = {
  id: string;
  sourceType: string;
  sourceContractId: string | null;
  sourceReference: string | null;
  title: string;
  description: string | null;
  ownerLabel: string | null;
  triggerType: string;
  frequencyCode: string | null;
  nextDueDate: string | null;
  status: string;
  relatedTaskId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContractEntitlementDTO = {
  id: string;
  contractId: string;
  type: string;
  title: string;
  description: string | null;
  sourceReference: string | null;
  exerciseByDate: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

function url(clientId: string, path: string): string {
  return `/client-contracts/clients/${encodeURIComponent(clientId)}${path}`;
}

export const clientContractsApi = {
  listContracts(clientId: string, opts: { status?: string } = {}) {
    const q = opts.status ? `?status=${encodeURIComponent(opts.status)}` : '';
    return fetchApi<{ items: ContractRecordDTO[] }>(`${url(clientId, '/contracts')}${q}`);
  },
  createContract(clientId: string, payload: Partial<ContractRecordDTO>) {
    return fetchApi<ContractRecordDTO>(url(clientId, '/contracts'), { method: 'POST', body: JSON.stringify(payload) });
  },
  getContract(contractId: string) {
    return fetchApi<ContractRecordDTO & { parties: ContractPartyDTO[]; obligations: ClientObligationDTO[]; entitlements: ContractEntitlementDTO[]; amendments: ContractRecordDTO[] }>(`/client-contracts/contracts/${encodeURIComponent(contractId)}`);
  },
  getContractFamily(contractId: string) {
    return fetchApi<{ rootId: string; members: (ContractRecordDTO & { parties: ContractPartyDTO[] })[] }>(`/client-contracts/contracts/${encodeURIComponent(contractId)}/family`);
  },
  transitionContract(contractId: string, status: string) {
    return fetchApi<ContractRecordDTO>(`/client-contracts/contracts/${encodeURIComponent(contractId)}/status`, { method: 'POST', body: JSON.stringify({ status }) });
  },
  setCanonicalDocument(contractId: string, documentVersionId: string | null) {
    return fetchApi<ContractRecordDTO>(`/client-contracts/contracts/${encodeURIComponent(contractId)}/canonical-document`, { method: 'POST', body: JSON.stringify({ documentVersionId }) });
  },
  listObligations(clientId: string) {
    return fetchApi<{ items: ClientObligationDTO[] }>(url(clientId, '/obligations'));
  },
  listEntitlements(contractId: string) {
    return fetchApi<{ items: ContractEntitlementDTO[] }>(`/client-contracts/contracts/${encodeURIComponent(contractId)}/entitlements`);
  },
};

export function contractStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Piszkozat',
    NEGOTIATION: 'Tárgyalás alatt',
    AWAITING_SIGNATURE: 'Aláírásra vár',
    SIGNED_NOT_EFFECTIVE: 'Aláírt, hatályba nem lépett',
    ACTIVE: 'Hatályos',
    TERMINATING: 'Megszüntetés alatt',
    EXPIRED: 'Lejárt',
    TERMINATED: 'Megszüntetve',
    SUPERSEDED: 'Felváltva',
  };
  return labels[status] || status;
}

export function contractTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    B2B_SUPPLY: 'B2B beszállítás',
    SERVICE: 'Szolgáltatás',
    LEASE: 'Bérlet',
    EMPLOYMENT: 'Munkaviszony',
    FINANCING: 'Finanszírozás',
    NDA: 'Titoktartás',
    PARTNERSHIP: 'Partnerség',
    IT_SYSTEM: 'IT-rendszer',
    SALES: 'Értékesítés',
    PURCHASE: 'Beszerzés',
    OTHER: 'Egyéb',
  };
  return labels[type] || type;
}

export function partyRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    CUSTOMER: 'Ügyfél',
    SUPPLIER: 'Beszállító',
    PARTNER: 'Partner',
    LEASOR: 'Bérbeadó',
    LESSEE: 'Bérlő',
    LENDER: 'Hitelező',
    BORROWER: 'Adós',
    EMPLOYER: 'Munkáltató',
    EMPLOYEE: 'Munkavállaló',
    OTHER: 'Egyéb',
  };
  return labels[role] || role;
}

export function obligationStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    OPEN: 'Nyitott',
    IN_PROGRESS: 'Folyamatban',
    SATISFIED: 'Teljesítve',
    WAIVED: 'Elengedve',
    EXPIRED: 'Lejárt',
  };
  return labels[status] || status;
}

export function entitlementStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    ACTIVE: 'Aktív',
    EXERCISED: 'Érvényesítve',
    EXPIRED: 'Lejárt',
    WAIVED: 'Elengedve',
  };
  return labels[status] || status;
}

export function entitlementTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    PRICE_INDEXATION: 'Árindexálás',
    AUDIT_RIGHT: 'Auditjog',
    TERMINATION_RIGHT: 'Felmondási jog',
    PENALTY_CLAIM: 'Kötbérkövetelés',
    GUARANTEE_CALL: 'Garanciaérvényesítés',
    RENEWAL_OPTION: 'Megújítási opció',
    EXCLUSIVITY: 'Kizárólagosság',
  };
  return labels[type] || type;
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('hu-HU');
}
