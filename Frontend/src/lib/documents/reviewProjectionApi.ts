import { fetchApi } from "@/lib/api";

export type ReviewVersionRelationship = "NONE" | "ON_CURRENT_VERSION" | "ON_OTHER_VERSION";
export type AiSourceMode = "EXACT_VERSION_PAIR" | "CURRENT_VERSION" | "MIXED_VERSION_CONTEXT" | "LEGACY_DOCUMENT";

export interface DocumentReviewProjection {
  documentId: string;
  caseId: string;
  documentTitle: string;
  category: string | null;
  workStatus: string | null;
  currentVersion: {
    id: string;
    version: number;
    fileName: string | null;
    mimeType: string | null;
    size: number | null;
    securityScanStatus: string;
    createdAt: string;
  } | null;
  previousVersion: {
    id: string;
    version: number;
    fileName: string | null;
    mimeType: string | null;
    size: number | null;
    securityScanStatus: string;
    createdAt: string;
  } | null;
  review: {
    reviewId: string;
    documentVersionId: string;
    reviewVersionId: string;
    status: string;
    reviewer: { id: string; name: string; email: string | null } | null;
    openPointCount: number;
    blockingPointCount: number;
    pointsLinkedToSegmentsCount: number;
    openPointsLinkedToSegmentsCount: number;
    dueAt: string | null;
    currentRoundNumber: number;
    updatedAt: string;
    approvedVersionId?: string | null;
    approvedVersionNumber?: number | null;
  } | null;
  reviewContext: {
    boundToCurrentVersion: boolean;
    hasReviewForOtherVersion: boolean;
    otherVersionReview: {
      reviewId: string;
      documentVersionId: string;
      versionNumber: number | null;
      status: string;
    } | null;
    reviewedVersionId: string | null;
    reviewedVersionNumber: number | null;
    relationship: ReviewVersionRelationship;
    activeReviewId: string | null;
    activeReviewStatus: string | null;
    activeReviewVersionId: string | null;
    activeReviewVersionNumber: number | null;
    approvedVersionId: string | null;
    approvedVersionNumber: number | null;
  };
  comparison: {
    comparisonId: string;
    status: string;
    baseVersionId: string;
    targetVersionId: string;
    totalSegments: number;
    reviewedSegments: number;
    unresolvedSegments: number;
    segmentStates: {
      unreviewed: number;
      accepted: number;
      rejected: number;
      needsDiscussion: number;
      notRelevant: number;
    };
    counts: {
      insertCount: number;
      deleteCount: number;
      replaceCount: number;
      formatOnlyCount: number;
      moveCandidateCount: number;
    };
    categories: Record<string, number>;
  } | null;
  ai: {
    promptDraftId: string;
    status: string;
    templateKey: string;
    templateVersion: number;
    sourceDocumentVersionIds: string[];
    sourceMode: AiSourceMode;
    approved: boolean;
    artifactAvailability: {
      hasImportedResponse: boolean;
      hasRehydratedResponse: boolean;
    };
    attentionSuggested?: boolean;
    verifiedAt: string | null;
    approvedAt: string | null;
    updatedAt: string;
  } | null;
  nextAction: {
    code: string;
    label: string;
    rationale: string;
  };
  annotationSummary: {
    documentVersionId: string | null;
    totalCount: number;
    openCount: number;
    resolvedCount: number;
    byType: {
      INTERNAL_NOTE?: number;
      REVIEW_COMMENT?: number;
      MODIFICATION_REASON?: number;
      CLIENT_EXPLANATION_DRAFT?: number;
      QUESTION?: number;
      DECISION?: number;
      TASK_NOTE?: number;
    };
  };
  segments?: Array<{
    sequence: number;
    changeType: string;
    category: string;
    reviewState: string;
    baseExcerpt: string | null;
    targetExcerpt: string | null;
    internalRationale: string | null;
    revision: number;
  }>;
}

export async function getDocumentReviewProjection(documentId: string): Promise<DocumentReviewProjection> {
  return fetchApi<DocumentReviewProjection>(
    `/documents/${encodeURIComponent(documentId)}/review-projection`,
    { cache: "no-store" },
  );
}
