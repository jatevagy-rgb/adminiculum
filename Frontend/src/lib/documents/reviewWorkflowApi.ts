import { fetchApi } from '@/lib/api';

export type ReviewStatus = 'DRAFT' | 'ASSIGNED' | 'IN_REVIEW' | 'CHANGES_REQUESTED' | 'RESUBMITTED' | 'APPROVED' | 'CANCELLED' | 'CLOSED';
export type ReviewPointType = 'ANNOTATION' | 'COMPARISON_CHANGE' | 'WHOLE_DOCUMENT';
export type ReviewPointSeverity = 'INFO' | 'NORMAL' | 'IMPORTANT' | 'BLOCKING';
export type ReviewPointStatus = 'OPEN' | 'ANSWERED' | 'RESOLVED' | 'REJECTED' | 'DEFERRED';

export interface DocumentReviewDto {
  id: string;
  documentId: string;
  status: ReviewStatus | string;
  currentRoundNumber: number;
  currentRoundId: string | null;
  reviewVersionId: string | null;
  approvedVersionId: string | null;
  dueAt: string | null;
  revision: number;
  owner: { id: string; name: string; email: string } | null;
  reviewer: { id: string; name: string; email: string } | null;
  counts: { open: number; blocking: number; resolved: number; total: number };
  rounds: Array<{ id: string; roundNumber: number; reviewVersionId: string; status: string }>;
  lastDecision: ReviewDecisionDto | null;
  permittedActions?: string[];
}

export interface ReviewPointDto {
  id: string;
  reviewId: string;
  reviewRoundId: string;
  type: ReviewPointType;
  status: ReviewPointStatus;
  severity: ReviewPointSeverity;
  title: string;
  internalRationale: string | null;
  annotationId: string | null;
  comparisonSegmentId: string | null;
  linkedTaskId: string | null;
  carriedFromPointId: string | null;
  revision: number;
}

export interface ReviewDecisionDto {
  id: string;
  action: string;
  actorId: string;
  versionId: string | null;
  safeRationale: string | null;
  createdAt: string;
}

export async function listDocumentReviews(documentId: string): Promise<DocumentReviewDto[]> {
  const res = await fetchApi<{ data: DocumentReviewDto[] }>(`/documents/${encodeURIComponent(documentId)}/reviews`, { cache: 'no-store' });
  return res.data;
}

export async function createDocumentReview(documentId: string, payload: { reviewVersionId?: string; reviewerId?: string; dueAt?: string }): Promise<DocumentReviewDto> {
  return fetchApi<DocumentReviewDto>(`/documents/${encodeURIComponent(documentId)}/reviews`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function getDocumentReview(reviewId: string): Promise<DocumentReviewDto> {
  return fetchApi<DocumentReviewDto>(`/document-reviews/${encodeURIComponent(reviewId)}`, { cache: 'no-store' });
}

export async function transitionDocumentReview(reviewId: string, action: 'assign' | 'start' | 'request-changes' | 'resubmit' | 'approve' | 'cancel' | 'close', payload: Record<string, unknown> = {}): Promise<DocumentReviewDto> {
  return fetchApi<DocumentReviewDto>(`/document-reviews/${encodeURIComponent(reviewId)}/${action}`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function listReviewPoints(reviewId: string, params: { status?: string; type?: string } = {}) {
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  if (params.type) q.set('type', params.type);
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return fetchApi<{ data: ReviewPointDto[]; total: number }>(`/document-reviews/${encodeURIComponent(reviewId)}/points${suffix}`, { cache: 'no-store' });
}

export async function addReviewPoint(reviewId: string, payload: Partial<ReviewPointDto> & { title: string; type: ReviewPointType; severity?: ReviewPointSeverity }) {
  return fetchApi<ReviewPointDto>(`/document-reviews/${encodeURIComponent(reviewId)}/points`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateReviewPoint(reviewId: string, pointId: string, payload: Partial<ReviewPointDto> & { expectedRevision: number }) {
  return fetchApi<ReviewPointDto>(`/document-reviews/${encodeURIComponent(reviewId)}/points/${encodeURIComponent(pointId)}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function listReviewDecisions(reviewId: string) {
  return fetchApi<{ data: ReviewDecisionDto[]; total: number }>(`/document-reviews/${encodeURIComponent(reviewId)}/decisions`, { cache: 'no-store' });
}
