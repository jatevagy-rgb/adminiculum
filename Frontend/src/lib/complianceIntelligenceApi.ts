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
  /**
   * C4A derived canonical legal reference (`TV/<year>/<act>[/<opaque-tail>]`) when
   * the row was anchored through a canonical hyperlink target. Derived from
   * anchorKey on the internal read model; never a database column. INTERNAL ONLY.
   */
  canonicalReference?: string | null;
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
  /** C4C exact-version legal-source impact projection (INTERNAL only). */
  legalSourceImpact(legalSourceVersionId: string) {
    return fetchApi<LegalSourceImpactProjection>(
      `/compliance-intelligence/legal-source-impact?legalSourceVersionId=${encodeURIComponent(legalSourceVersionId)}`,
      { cache: 'no-store' },
    );
  },
  /** C4B read-only monitoring manifest (legal-source demand only, no identity). */
  monitoringManifest() {
    return fetchApi<ComplianceMonitoringManifest>(`/compliance-intelligence/monitoring-manifest`, { cache: 'no-store' });
  },
};

export interface ComplianceMonitoringManifest {
  schemaVersion: number;
  generatedAt: string;
  sources: Array<{ identifierFamily: string; sourceIdentifier: string; locators: string[]; referenceCount: number }>;
  unresolvedSummary: { count: number; reasons: Record<string, number> };
}

export type LegalSourceImpactKind =
  | 'DOCUMENT_REFERENCE_IMPACT'
  | 'APPLICABILITY_IMPACT'
  | 'CONTROL_IMPACT';

export interface LegalSourceImpactProjection {
  schemaVersion: number;
  generatedAt: string;
  subjectType: 'LEGAL_SOURCE_VERSION' | 'CANONICAL_REFERENCE';
  subject: {
    legalSourceVersionId: string;
    legalSourceId: string;
    sourceKey: string;
    canonicalCitation: string | null;
    title: string | null;
  } | null;
  canonicalReference: string | null;
  documentReferenceImpact: {
    kind: 'DOCUMENT_REFERENCE_IMPACT';
    references: Array<{
      clientId: string;
      clientName: string;
      documentId: string;
      documentName: string;
      documentVersionId: string;
      version: number;
      isCurrent: boolean;
      clauseRef: string;
      clauseTitle: string | null;
      anchorType: string;
      relationType: string;
      canonicalReference: string | null;
    }>;
    totals: { references: number; documents: number; documentVersions: number; clients: number };
  };
  requirementImpact: {
    kind: 'REQUIREMENT_IMPACT';
    derivable: boolean;
    citations: Array<{
      citationId: string;
      requirementVersionId: string;
      requirementId: string;
      requirementKey: string;
      requirementStatus: string;
      versionKey: string;
      versionTitle: string;
      versionStatus: string;
      supportRole: string;
      citationLocator: string | null;
    }>;
    requirements: Array<{ requirementId: string; requirementKey: string; domainCode: string; status: string }>;
    totals: { citations: number; requirementVersions: number; requirements: number };
  };
  controlImpact: {
    kind: 'CONTROL_IMPACT';
    derivable: boolean;
    controlDefinitions: Array<{
      controlDefinitionId: string;
      controlKey: string;
      title: string;
      type: string;
      status: string;
      viaRequirementVersionIds: string[];
    }>;
    clientControls: Array<{
      clientControlId: string;
      clientId: string;
      controlDefinitionId: string;
      implementationStatus: string;
      lastReviewedAt: string | null;
      nextReviewAt: string | null;
    }>;
    totals: { controlDefinitions: number; clientControls: number; clients: number };
  };
  applicabilityImpact: {
    kind: 'APPLICABILITY_IMPACT';
    derivable: boolean;
    applicabilities: Array<{
      applicabilityId: string;
      clientId: string;
      requirementVersionId: string;
      outcome: string;
      scopeType: string;
      evaluationAt: string;
    }>;
    totals: { applicabilities: number; clients: number };
  };
  clients: Array<{
    clientId: string;
    clientName: string | null;
    impactKinds: LegalSourceImpactKind[];
    documentReferenceCount: number;
    applicabilityCount: number;
    clientControlCount: number;
  }>;
  review: {
    reviewRequired: boolean;
    requirementCitationPresent: boolean;
    basis: LegalSourceImpactKind[];
    automaticActionsCreated: 0;
    note: string;
  };
}
