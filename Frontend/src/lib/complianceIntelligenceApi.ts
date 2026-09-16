import { fetchApi } from './api';

/**
 * CDI-1 read model — derived INTERNAL compliance document intelligence.
 *
 * INTERNAL ONLY. These are the structured machine references that an
 * INTERNAL_ANALYSIS compliance master DOCX carries in its Word content controls
 * (clause x relation type x legal/case/authority anchor). They are internal
 * analysis provenance and are never projected to a customer surface.
 */
export type ComplianceAnchorType = 'LEGAL' | 'CASE' | 'AUTHORITY';

/** C3A canonical binding state (INTERNAL only). */
export type LegalSourceBindingStatus = 'RESOLVED' | 'UNRESOLVED';
export type LegalSourceBindingOrigin = 'PERSISTED_AT_INGEST' | 'READ_TIME_EXACT_CELEX';

export type ComplianceClauseAnchorRow = {
  id: string;
  documentVersionId: string;
  clauseRef: string;
  clauseTitle: string | null;
  clauseStableId: string | null;
  relationType: string;
  anchorType: ComplianceAnchorType;
  anchorDisplay: string;
  anchorStableId: string | null;
  /** Stable anchor identity. Null when the document transports no machine metadata for it. */
  anchorKey: string | null;
  eli: string | null;
  celex: string | null;
  locator: string | null;
  ecli: string | null;
  caseId: string | null;
  caseLocator: string | null;
  decisionId: string | null;
  authorityLocator: string | null;
  sourceUrl: string | null;
  rationale: string | null;
  /** Internal processing observations for this row. */
  ingestWarnings: string[];
  rowDigest: string;
  ingestedAt: string;
  /**
   * C3A canonical binding, exact CELEX match only. Present on the internal
   * projection; never part of a customer-safe payload.
   */
  legalSourceBindingStatus?: LegalSourceBindingStatus;
  canonicalLegalSourceVersionId?: string;
  canonicalCitation?: string | null;
  canonicalTitle?: string | null;
  bindingOrigin?: LegalSourceBindingOrigin;
  bindingReason?: string;
};

export type ComplianceClauseAnchorVersion = {
  documentVersionId: string;
  version: number;
  isCurrent: boolean;
  rows: ComplianceClauseAnchorRow[];
};

export type ComplianceClauseAnchorReadModel = {
  documentId: string;
  versions: ComplianceClauseAnchorVersion[];
};

export const complianceIntelligenceApi = {
  /** Structured clause x anchor relations captured for each version of a document. */
  clauseAnchors(clientId: string, documentId: string) {
    return fetchApi<ComplianceClauseAnchorReadModel>(
      `/compliance-intelligence/clients/${encodeURIComponent(clientId)}/documents/${encodeURIComponent(documentId)}/clause-anchors`,
    );
  },
};
