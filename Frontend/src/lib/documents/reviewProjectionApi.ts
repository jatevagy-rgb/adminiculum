import { fetchApi } from "@/lib/api";

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
  } | null;
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
  } | null;
  nextAction: {
    code: string;
    label: string;
    rationale: string;
  };
}

export async function getDocumentReviewProjection(documentId: string): Promise<DocumentReviewProjection> {
  return fetchApi<DocumentReviewProjection>(
    `/documents/${encodeURIComponent(documentId)}/review-projection`,
    { cache: "no-store" },
  );
}
