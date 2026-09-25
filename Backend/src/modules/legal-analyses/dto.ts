// ============================================================================
// LEGAL ANALYSIS DTOs — Three-level response shaping (Summary / Working / Sensitive)
// ============================================================================

import type { LegalAnalysisResult } from './service';

/**
 * Summary DTO — safe metadata, no analysis text, no PII.
 * Returned in list endpoints and to any authenticated user with case read access.
 *
 * The four persisted detection booleans are non-content, non-PII state and are
 * required by the Case Workspace preparation surface to report risk-matrix
 * presence truthfully. They are intentionally part of the safe Summary shape;
 * analysisText, aiToolName and anonymizedInputSnapshot stay out of it.
 */
export interface LegalAnalysisSummary {
  id: string;
  caseId: string;
  documentId: string | null;
  documentSourceType: string;
  title: string;
  status: string;
  sourceType: string;
  riskMatrixDetected: boolean;
  missingDataDetected: boolean;
  suggestedChangesDetected: boolean;
  lawyerDecisionPointsDetected: boolean;
  createdById: string | null;
  reviewedById: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Working DTO — includes analysis text for review.
 * No PII fields (aiToolName, anonymizedInputSnapshot).
 */
export interface LegalAnalysisWorking extends LegalAnalysisSummary {
  analysisText: string;
}

/**
 * Sensitive DTO — full PII fields included.
 * Only for ADMIN/PARTNER/responsible lawyer/reviewer.
 */
export interface LegalAnalysisSensitive extends LegalAnalysisWorking {
  aiToolName: string | null;
  anonymizedInputSnapshot: string | null;
}

// ---------------------------------------------------------------------------
// Builder functions
// ---------------------------------------------------------------------------

export function toSummary(record: LegalAnalysisResult): LegalAnalysisSummary {
  return {
    id: record.id,
    caseId: record.caseId,
    documentId: record.documentId,
    documentSourceType: record.documentSourceType,
    title: record.title,
    status: record.status,
    sourceType: record.sourceType,
    riskMatrixDetected: record.riskMatrixDetected,
    missingDataDetected: record.missingDataDetected,
    suggestedChangesDetected: record.suggestedChangesDetected,
    lawyerDecisionPointsDetected: record.lawyerDecisionPointsDetected,
    createdById: record.createdById,
    reviewedById: record.reviewedById,
    reviewedAt: record.reviewedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function toWorking(record: LegalAnalysisResult): LegalAnalysisWorking {
  return {
    ...toSummary(record),
    analysisText: record.analysisText,
  };
}

export function toSensitive(record: LegalAnalysisResult): LegalAnalysisSensitive {
  return {
    ...toWorking(record),
    aiToolName: record.aiToolName,
    anonymizedInputSnapshot: record.anonymizedInputSnapshot,
  };
}
