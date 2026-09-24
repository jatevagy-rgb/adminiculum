import { fetchApi } from './api';

/**
 * C4D — office-wide Compliance Center read model (INTERNAL only).
 *
 * A bounded, derived cross-client projection. It never marks a client
 * non-compliant, never carries a compliance score, and never implies an
 * external legal-source watcher ran.
 */

export type OfficeReviewWorkKind = 'FINDING' | 'STALE_EVIDENCE' | 'CONTROL_REVIEW';

export interface OfficeClientRow {
  clientId: string;
  clientName: string;
  openFindings: number;
  staleEvidence: number;
  controlsNeedingReview: number;
}

export interface OfficeLegalSourceReviewSignal {
  legalSourceId: string;
  legalSourceVersionId: string;
  sourceKey: string;
  canonicalCitation: string | null;
  title: string | null;
  versionLabel: string | null;
  versionStatus: string;
  reviewStatus: string;
  sourceStatus: string;
  reviewRequired: boolean;
  impactedRequirementCount: number;
  impactedClientCount: number;
  impactedDocumentCount: number;
}

export interface OfficeReviewWorkItem {
  kind: OfficeReviewWorkKind;
  clientId: string;
  clientName: string;
  refId: string;
  title: string;
  dueAt: string | null;
}

export interface ComplianceCenterOverview {
  schemaVersion: number;
  generatedAt: string;
  summary: {
    clientsWithOpenWork: number;
    openFindings: number;
    staleEvidence: number;
    controlsNeedingReview: number;
    legalSourcesReviewRequired: number;
  };
  clients: OfficeClientRow[];
  legalSources: OfficeLegalSourceReviewSignal[];
  reviewWork: OfficeReviewWorkItem[];
}

export const complianceCenterApi = {
  getOverview() {
    return fetchApi<ComplianceCenterOverview>(`/compliance/office/overview`, { cache: 'no-store' });
  },
};
