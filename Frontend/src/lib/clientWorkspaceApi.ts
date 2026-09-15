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
    isCurrent: boolean;
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
  counterpartySummary: string | null;
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
  ownerPersonActive: boolean | null;
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
  clientOwnerPersonActive: boolean | null;
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

export type WorkspaceCase = {
  id: string;
  caseNumber: string;
  title: string;
  status: string;
  deadline: string | null;
  responsibleLawyerName: string | null;
};

export type WorkspaceAttentionCode =
  | 'OPEN_IMPORTANT_FINDINGS'
  | 'CONTRACTS_WITHOUT_OWNER'
  | 'OBLIGATIONS_WITHOUT_OWNER'
  | 'INACTIVE_OWNER_PERSONS';

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
  cases: WorkspaceCase[];
  attention: Array<{ code: WorkspaceAttentionCode; count: number }>;
};

export type CompanyDataRoom = {
  clientIdentity: {
    id: string;
    name: string;
    company: string | null;
    companyRegistrationNumber: string | null;
    taxNumber: string | null;
    vatNumber: string | null;
    address: string | null;
  };
  operatingProfile: {
    status: string | null;
    complianceEnrollmentStatus: string;
    summary: string | null;
    lastReviewedAt: string | null;
    nextReviewAt: string | null;
  } | null;
  facts: Array<{
    id: string | null;
    type: string;
    value: unknown;
    answerStatus: 'ANSWERED' | 'UNKNOWN' | 'UNANSWERED';
    factDefinition: { key: string; domainCode: string; valueType: string } | null;
    scopeType: string | null;
    factSubjectId: string | null;
    verificationStatus: string | null;
    observedAt: string | null;
    effectiveAt: string | null;
    validFrom: string | null;
    validTo: string | null;
  }>;
  dataQuality: {
    answerStateSummary: { answered: number; unknown: number };
    coverageAvailable: boolean;
    relevantDataCoverage: {
      available: boolean;
      relevantDefinitionCount: number;
      answeredCount: number;
      unknownCount: number;
      unansweredCount: number;
      undeterminedCount: number;
      derivedAnsweredCount: number;
    };
    stale: unknown;
    staleAvailable: boolean;
    conflictingAvailable: boolean;
  };
  organization: {
    groupCount: number;
    activeGroupCount: number;
    personCount: number;
    activePersonCount: number;
    groups: Array<{ id: string; name: string; description: string | null; status: string; parentGroupId: string | null }>;
    people: Array<{ id: string; name: string; jobTitle: string | null; employmentStatus: string; organizationGroupId: string | null; organizationGroupName: string | null }>;
  };
  processes: Array<{
    id: string;
    name: string;
    category: string;
    description: string | null;
    criticality: string;
    frequency: string;
    status: string;
    owner: { id: string; name: string } | null;
    organizationGroup: { id: string; name: string } | null;
    steps: Array<{
      id: string;
      position: number;
      name: string;
      stepType: string;
      responsiblePerson: { id: string; name: string } | null;
      system: { id: string; name: string; category: string } | null;
      estimatedActiveMinutes: number | null;
      estimatedWaitingMinutes: number | null;
      isApproval: boolean;
    }>;
    latestMeasuredSnapshot: { id: string; observedAt: string; metricVersion: string; metrics: Array<{ code: string; value: number | boolean | null; unit: string; metricVersion: string }> } | null;
  }>;
  systems: Array<{
    id: string;
    name: string;
    category: string;
    vendor: string | null;
    purpose: string | null;
    status: string;
    owner: { id: string; name: string } | null;
    relatedProcessStepCount: number;
  }>;
  documents: { documentCount: number; currentVersionCount: number; evidenceLinkedRecordCount: number };
  contracts: { totalCount: number; byStatus: Array<{ status: string; count: number }> };
  complianceSummary: {
    currentOnly: true;
    evaluatedAt: string | null;
    evaluatedCount: number;
    applies: number;
    doesNotApply: number;
    insufficientFacts: number;
    legalReviewRequired: number;
    technicalReviewRequired: number;
    sourceSupportInsufficient: number;
    openFindings: number;
    openProposals: number;
  };
  evidenceSummary: { totalCount: number; bySourceType: Array<{ sourceType: string; count: number }>; byStatus: Array<{ status: string; count: number }> };
  developmentSummary: {
    initiativeCount: number;
    activeInitiativeCount: number;
    milestoneCount: number;
    plannedMilestoneCount: number;
    initiatives: Array<{ id: string; title: string; reason: string | null; currentState: string | null; targetState: string | null; priority: string; status: string; targetAt: string | null; startedAt: string | null; completedAt: string | null; clientOwnerPerson: { id: string; name: string } | null }>;
    milestones: Array<{ id: string; type: string; title: string; description: string | null; milestoneDate: string | null; targetDate: string | null; status: string; developmentInitiativeId: string | null }>;
    opportunityCountsByStatus: Array<{ status: string; count: number }>;
  };
  measurementSummary: {
    nonSyntheticOutcomeCount: number;
    byBasis: Array<{ basis: string; count: number }>;
    assumedCount: number;
    outcomes: Array<{ id: string; basis: string; businessProcess: { id: string; name: string } | null; developmentInitiative: { id: string; title: string } | null; opportunity: { id: string; title: string } | null; createdAt: string }>;
  };
};

export const clientWorkspaceApi = {
  getOverview(clientId: string) {
    return fetchApi<CompanyWorkspaceOverview>(`/company-workspace/clients/${encodeURIComponent(clientId)}/overview`);
  },
  getDataRoom(clientId: string) {
    return fetchApi<CompanyDataRoom>(`/company-workspace/clients/${encodeURIComponent(clientId)}/data-room`);
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
    default:
      return 'Figyelmet igénylő terület.';
  }
}

export function formatWorkspaceDate(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('hu-HU');
}
