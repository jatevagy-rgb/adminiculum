import { fetchApi } from './api';

export type ComplianceWorkspaceOutcome =
  | 'APPLIES'
  | 'DOES_NOT_APPLY'
  | 'INSUFFICIENT_FACTS'
  | 'LEGAL_REVIEW_REQUIRED'
  | 'TECHNICAL_REVIEW_REQUIRED'
  | 'SOURCE_SUPPORT_INSUFFICIENT';

export type ComplianceWorkspaceFactRef = {
  factKey: string;
  label: string | null;
  value: string | null;
};

export type ComplianceWorkspaceMissingFact = {
  factKey: string;
  label: string | null;
  profileAnswerable: boolean;
};

export type ComplianceWorkspaceCitation = {
  supportRole: string;
  sourceTitle: string | null;
  canonicalCitation: string | null;
  versionLabel: string | null;
  locator: string | null;
  article: string | null;
  section: string | null;
  paragraph: string | null;
};

export type ComplianceWorkspaceArea = {
  applicabilityId: string;
  requirementKey: string | null;
  title: string;
  domainLabel: string | null;
  outcome: ComplianceWorkspaceOutcome;
  scopeType: string | null;
  subjectLabel: string | null;
  evaluationAt: string;
  sourceSupportState: string;
  specialistRequirement: string;
  activeFindingId: string | null;
  usedFacts: ComplianceWorkspaceFactRef[];
  missingFacts: ComplianceWorkspaceMissingFact[];
  citations: ComplianceWorkspaceCitation[];
};

export type ComplianceWorkspaceSummary = {
  enrollment: 'ENROLLED' | 'NOT_ENROLLED' | 'SUSPENDED' | null;
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

export type ComplianceWorkspace = {
  summary: ComplianceWorkspaceSummary;
  evaluatedAt: string | null;
  areas: ComplianceWorkspaceArea[];
};

export const complianceWorkspaceApi = {
  getWorkspace(clientId: string) {
    return fetchApi<ComplianceWorkspace>(`/compliance/clients/${encodeURIComponent(clientId)}/workspace`);
  },
};
