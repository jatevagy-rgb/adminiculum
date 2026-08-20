import { fetchApi } from './api';

export type WorkspaceFactGroup = {
  key: string;
  label: string;
  facts: Array<{
    id: string;
    type: string;
    value: string;
    verificationStatus: string;
    validFrom: string;
    validTo: string | null;
    sourceReference: string | null;
  }>;
};

export type WorkspaceFindingSummary = {
  id: string;
  title: string;
  severity: string;
  status: string;
};

export type WorkspaceAssessment = {
  id: string;
  title: string;
  type: string;
  status: string;
  reviewAt: string | null;
  completedAt: string | null;
  findingCount: number;
  openFindingCount: number;
  importantFindings: WorkspaceFindingSummary[];
};

export type WorkspaceContract = {
  id: string;
  title: string;
  contractType: string;
  status: string;
  partnerName: string | null;
  effectiveDate: string | null;
  expiryDate: string | null;
  nextCriticalDate: string | null;
  businessOwnerPersonId: string | null;
  businessOwnerDisplay: string | null;
  businessOwnerPersonActive: boolean | null;
  lawFirmOwnerName: string | null;
  openObligationCount: number;
};

export type WorkspaceObligation = {
  id: string;
  title: string;
  sourceContractId: string | null;
  sourceContractTitle: string | null;
  ownerPersonId: string | null;
  ownerDisplay: string | null;
  nextDueDate: string | null;
  status: string;
  sourceType: string;
};

export type WorkspaceKeyPerson = {
  id: string;
  name: string;
  jobTitle: string | null;
  groupName: string | null;
  employmentStatus: string;
  responsibilityLabels: string[];
};

export type WorkspaceGapList = {
  id: string;
  title: string;
};

export type WorkspaceInitiative = {
  id: string;
  title: string;
  priority: string;
  status: string;
  clientOwnerPersonId: string | null;
  clientOwnerDisplay: string | null;
  lawFirmOwnerName: string | null;
  targetAt: string | null;
  nextMilestone: {
    id: string;
    title: string;
    status: string;
    targetDate: string | null;
    milestoneDate: string | null;
  } | null;
};

export type WorkspaceMilestone = {
  id: string;
  title: string;
  type: string;
  status: string;
  targetDate: string | null;
  milestoneDate: string | null;
  developmentInitiativeId: string | null;
};

export type WorkspaceAttentionCode =
  | 'OPEN_IMPORTANT_FINDINGS'
  | 'CONTRACTS_WITHOUT_OWNER'
  | 'OBLIGATIONS_WITHOUT_OWNER'
  | 'INACTIVE_OWNER_PERSONS'
  | 'ACTIVE_INITIATIVES';

export type CompanyWorkspaceOverview = {
  client: { id: string; name: string };
  profile: {
    summary: string | null;
    status: string | null;
    lastReviewedAt: string | null;
    nextReviewAt: string | null;
  } | null;
  factGroups: WorkspaceFactGroup[];
  assessments: WorkspaceAssessment[];
  contracts: WorkspaceContract[];
  obligations: WorkspaceObligation[];
  organization: {
    groupCount: number;
    personCount: number;
    activePersonCount: number;
    keyPersons: WorkspaceKeyPerson[];
  };
  gaps: {
    contractsWithoutOwnerCount: number;
    obligationsWithoutOwnerCount: number;
    inactiveOwnerCount: number;
    contractsWithoutOwner: WorkspaceGapList[];
    obligationsWithoutOwner: WorkspaceGapList[];
    inactiveOwnerPersons: WorkspaceGapList[];
  };
  initiatives: WorkspaceInitiative[];
  milestones: WorkspaceMilestone[];
  attention: Array<{ code: WorkspaceAttentionCode; count: number }>;
};

export const clientWorkspaceApi = {
  getOverview(clientId: string) {
    return fetchApi<CompanyWorkspaceOverview>(`/company-workspace/clients/${encodeURIComponent(clientId)}/overview`);
  },
};

/** Owner display preference: linked person → legacy label → 'Nincs kijelölt felelős'. */
export function ownerDisplayText(display: string | null | undefined): string {
  return display || 'Nincs kijelölt felelős';
}

/** Human wording for the deterministic attention items (no raw codes/enums in the UI). */
export function attentionItemText(code: WorkspaceAttentionCode, count: number): string {
  switch (code) {
    case 'OPEN_IMPORTANT_FINDINGS':
      return `${count} nyitott, magas vagy kritikus súlyosságú megállapítás.`;
    case 'CONTRACTS_WITHOUT_OWNER':
      return `${count} szerződéshez még nincs kijelölt felelős.`;
    case 'OBLIGATIONS_WITHOUT_OWNER':
      return `${count} kötelezettséghez még nincs kijelölt felelős.`;
    case 'INACTIVE_OWNER_PERSONS':
      return `${count} kijelölt felelős már nem aktív.`;
    case 'ACTIVE_INITIATIVES':
      return `${count} aktív fejlesztési kezdeményezés folyamatban.`;
    default:
      return 'Figyelmet igénylő terület.';
  }
}

export function formatWorkspaceDate(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('hu-HU');
}