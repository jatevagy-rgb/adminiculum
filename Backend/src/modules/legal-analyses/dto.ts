// ============================================================================
// LEGAL ANALYSIS DTOs — Three-level response shaping (Summary / Working / Sensitive)
// ============================================================================

import type { LegalAnalysisResult } from './service';

/**
 * Summary DTO — safe metadata, no analysis text, no PII.
 * Returned in list endpoints and to any authenticated user with case read access.
 */
export interface LegalAnalysisSummary {
  id: string;
  caseId: string;
  documentId: string | null;
  documentSourceType: string;
  title: string;
  status: string;
  sourceType: string;
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
