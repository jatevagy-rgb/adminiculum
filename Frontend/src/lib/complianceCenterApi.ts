import { fetchApi } from './api';
import type { LegalSourceImpactProjection } from './complianceIntelligenceApi';

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

export interface OfficeDocumentFamilyMember {
  clientId: string;
  clientName: string;
  documentId: string;
  documentVersionId: string;
  version: number;
  isCurrent: boolean;
}

export interface OfficeDocumentFamily {
  name: string;
  members: OfficeDocumentFamilyMember[];
  legalSources: Array<{
    legalSourceId: string;
    legalSourceVersionId: string;
    sourceKey: string;
    canonicalCitation: string | null;
    reviewRequired: boolean;
  }>;
}

export interface ComplianceMonitoringManifest {
  schemaVersion: number;
  generatedAt: string;
  sources: Array<{ identifierFamily: string; sourceIdentifier: string; locators: string[]; referenceCount: number }>;
  unresolvedSummary: { count: number; reasons: Record<string, number> };
}

/**
 * W3A — human/internal review lifecycle for machine-ingested legal-source
 * observations. Workforce-only; deliberately kept out of the machine ingestion
 * client surface.
 */
export const LEGAL_SOURCE_OBSERVATION_REVIEW_STATUSES = [
  'NEW',
  'IN_REVIEW',
  'NO_IMPACT',
  'IMPACT_CONFIRMED',
  'REJECTED',
] as const;
export type LegalSourceObservationReviewStatus = (typeof LEGAL_SOURCE_OBSERVATION_REVIEW_STATUSES)[number];

export const LEGAL_SOURCE_OBSERVATION_DECISIONS = [
  'NO_IMPACT',
  'IMPACT_CONFIRMED',
  'REJECTED',
] as const;
export type LegalSourceObservationDecision = (typeof LEGAL_SOURCE_OBSERVATION_DECISIONS)[number];

export const LEGAL_SOURCE_OBSERVATION_KINDS = [
  'AMENDMENT_PUBLISHED',
  'CONSOLIDATED_VERSION_AVAILABLE',
] as const;
export type LegalSourceObservationKind = (typeof LEGAL_SOURCE_OBSERVATION_KINDS)[number];

export interface LegalSourceObservationReviewer {
  id: string;
  name: string;
}

export interface LegalSourceObservationLinkedSource {
  id: string;
  sourceKey: string;
  canonicalCitation: string | null;
  title: string | null;
}

export interface LegalSourceObservationLinkedVersion {
  id: string;
  legalVersionKey: string;
  status: string;
  reviewStatus: string;
  effectiveFrom: string | null;
}

export interface LegalSourceObservationListItem {
  id: string;
  kind: LegalSourceObservationKind;
  sourceIdentifier: string;
  relatedIdentifier: string;
  capturedAt: string;
  ingestedAt: string;
  effectiveFrom: string | null;
  sourceUri: string;
  reviewStatus: LegalSourceObservationReviewStatus;
  reviewStartedAt: string | null;
  reviewStartedBy: LegalSourceObservationReviewer | null;
  decidedAt: string | null;
  decidedBy: LegalSourceObservationReviewer | null;
  decisionNote: string | null;
  legalSource: LegalSourceObservationLinkedSource | null;
  legalSourceVersion: LegalSourceObservationLinkedVersion | null;
}

/**
 * The detail response also carries internal capture provenance (payload digest,
 * evidence hash, raw query provenance). Those fields are intentionally not
 * modeled here: the UI must not render them, and omitting them makes an
 * accidental render impossible at the type level.
 */
export type LegalSourceObservationDetail = LegalSourceObservationListItem;

export interface LegalSourceObservationListParams {
  reviewStatus?: LegalSourceObservationReviewStatus;
  kind?: LegalSourceObservationKind;
  sourceIdentifier?: string;
  limit?: number;
  offset?: number;
}

export interface LegalSourceObservationListResult {
  items: LegalSourceObservationListItem[];
  pagination: { limit: number; offset: number; total: number; returned: number };
}

export function buildLegalSourceObservationListQuery(params: LegalSourceObservationListParams = {}): string {
  const query = new URLSearchParams();
  if (params.reviewStatus) query.set('reviewStatus', params.reviewStatus);
  if (params.kind) query.set('kind', params.kind);
  if (params.sourceIdentifier && params.sourceIdentifier.trim()) {
    query.set('sourceIdentifier', params.sourceIdentifier.trim());
  }
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

export const complianceCenterApi = {
  getOverview() {
    return fetchApi<ComplianceCenterOverview>(`/compliance/office/overview`, { cache: 'no-store' });
  },
  getDocumentFamilies() {
    return fetchApi<{ documentFamilies: OfficeDocumentFamily[] }>(`/compliance/office/document-families`, { cache: 'no-store' });
  },
  listLegalSourceObservations(params: LegalSourceObservationListParams = {}) {
    return fetchApi<LegalSourceObservationListResult>(
      `/compliance/legal-source-observations${buildLegalSourceObservationListQuery(params)}`,
      { cache: 'no-store' },
    );
  },
  getLegalSourceObservation(id: string) {
    return fetchApi<LegalSourceObservationDetail>(
      `/compliance/legal-source-observations/${encodeURIComponent(id)}`,
      { cache: 'no-store' },
    );
  },
  /**
   * W3B — observation-specific impact projection. Only succeeds for an
   * IMPACT_CONFIRMED observation; the response is the existing
   * LegalSourceImpactProjection used by the C4C impact panel.
   */
  getLegalSourceObservationImpact(id: string) {
    return fetchApi<LegalSourceImpactProjection>(
      `/compliance/legal-source-observations/${encodeURIComponent(id)}/impact`,
      { cache: 'no-store' },
    );
  },
  startLegalSourceObservationReview(id: string) {
    return fetchApi<LegalSourceObservationDetail>(
      `/compliance/legal-source-observations/${encodeURIComponent(id)}/start-review`,
      { method: 'POST' },
    );
  },
  decideLegalSourceObservationReview(id: string, decision: LegalSourceObservationDecision, note?: string) {
    const trimmedNote = note?.trim();
    return fetchApi<LegalSourceObservationDetail>(
      `/compliance/legal-source-observations/${encodeURIComponent(id)}/decision`,
      {
        method: 'POST',
        body: JSON.stringify(trimmedNote ? { decision, note: trimmedNote } : { decision }),
      },
    );
  },
};
