/**
 * Typed structured-comparison API client (STRUCTURED-DOC-COMPARISON-1, Phase 7).
 *
 * The single place that speaks to the comparison endpoints. Components never
 * parse transport envelopes themselves — they consume these typed results, and
 * the distinct loading/empty/malformed/error states are decided here or by the
 * hooks, never re-derived per component.
 */
import { fetchApi } from "@/lib/api";

export type ComparisonStatus = "PENDING" | "PROCESSING" | "READY" | "IDENTICAL" | "UNSUPPORTED" | "FAILED" | "SUPERSEDED";
export type ChangeType = "INSERT" | "DELETE" | "REPLACE" | "MOVE_CANDIDATE" | "FORMAT_ONLY";
export type ReviewState = "UNREVIEWED" | "ACCEPTED" | "REJECTED" | "NEEDS_DISCUSSION" | "NOT_RELEVANT";
export type SegmentCategory = "PARTY" | "DATE" | "AMOUNT" | "OBLIGATION" | "LIABILITY" | "TERMINATION" | "GOVERNING_LAW" | "DEFINITION" | "OTHER" | "UNCLASSIFIED";
export type CategorySource = "MANUAL" | "RULE" | "NONE";

export interface ComparisonCounts {
  insert: number; delete: number; replace: number; formatOnly: number; moveCandidate: number; total: number; reviewed: number;
}
export interface ComparisonDto {
  id: string;
  documentId: string;
  baseVersionId: string;
  targetVersionId: string;
  status: ComparisonStatus;
  algorithmRevision: number;
  extractionRevision: number;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failureCode: string | null;
  failureMessageSafe: string | null;
  counts: ComparisonCounts;
}
export interface SegmentDto {
  id: string;
  comparisonId: string;
  sequence: number;
  changeType: ChangeType;
  baseStart: number | null;
  baseEnd: number | null;
  targetStart: number | null;
  targetEnd: number | null;
  baseExcerpt: string | null;
  targetExcerpt: string | null;
  contextBefore: string | null;
  contextAfter: string | null;
  confidence: number;
  reviewState: ReviewState;
  category: SegmentCategory;
  categorySource: CategorySource;
  internalRationale: string | null;
  linkedTaskId: string | null;
  linkedAnnotationId: string | null;
  revision: number;
}
export interface SegmentPage {
  data: SegmentDto[];
  total: number;
  limit: number;
  offset: number;
}
export interface SegmentFilters {
  changeType?: ChangeType;
  category?: SegmentCategory;
  reviewState?: ReviewState;
  unreviewedOnly?: boolean;
  limit?: number;
  offset?: number;
}
export interface SegmentPatch {
  category?: SegmentCategory;
  reviewState?: ReviewState;
  internalRationale?: string | null;
  expectedRevision: number;
}

/** Thrown for an optimistic-concurrency conflict (HTTP 409) so the UI can offer reload/reapply. */
export class ComparisonConflictError extends Error {
  constructor(message: string) { super(message); this.name = "ComparisonConflictError"; }
}

function isConflict(err: unknown): boolean {
  return err instanceof Error && /409|REVISION_CONFLICT|conflict/i.test(err.message);
}

export async function createComparison(documentId: string, baseVersionId: string, targetVersionId: string): Promise<ComparisonDto> {
  return fetchApi<ComparisonDto>(`/documents/${encodeURIComponent(documentId)}/comparisons`, {
    method: "POST",
    body: JSON.stringify({ baseVersionId, targetVersionId }),
  });
}

export async function listComparisons(documentId: string): Promise<ComparisonDto[]> {
  const res = await fetchApi<{ data: ComparisonDto[] }>(`/documents/${encodeURIComponent(documentId)}/comparisons`, { cache: "no-store" });
  return Array.isArray(res?.data) ? res.data : [];
}

export async function getComparison(comparisonId: string): Promise<ComparisonDto> {
  return fetchApi<ComparisonDto>(`/document-comparisons/${encodeURIComponent(comparisonId)}`, { cache: "no-store" });
}

export async function retryComparison(comparisonId: string): Promise<ComparisonDto> {
  return fetchApi<ComparisonDto>(`/document-comparisons/${encodeURIComponent(comparisonId)}/retry`, { method: "POST" });
}

export async function listSegments(comparisonId: string, filters: SegmentFilters = {}): Promise<SegmentPage> {
  const q = new URLSearchParams();
  if (filters.changeType) q.set("changeType", filters.changeType);
  if (filters.category) q.set("category", filters.category);
  if (filters.reviewState) q.set("reviewState", filters.reviewState);
  if (filters.unreviewedOnly) q.set("unreviewedOnly", "true");
  if (filters.limit != null) q.set("limit", String(filters.limit));
  if (filters.offset != null) q.set("offset", String(filters.offset));
  const suffix = q.toString() ? `?${q.toString()}` : "";
  const res = await fetchApi<SegmentPage>(`/document-comparisons/${encodeURIComponent(comparisonId)}/segments${suffix}`, { cache: "no-store" });
  return { data: Array.isArray(res?.data) ? res.data : [], total: res?.total ?? 0, limit: res?.limit ?? 100, offset: res?.offset ?? 0 };
}

export async function updateSegment(comparisonId: string, segmentId: string, patch: SegmentPatch): Promise<SegmentDto> {
  try {
    return await fetchApi<SegmentDto>(`/document-comparisons/${encodeURIComponent(comparisonId)}/segments/${encodeURIComponent(segmentId)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
      suppressErrorStatuses: [409],
    });
  } catch (err) {
    if (isConflict(err)) throw new ComparisonConflictError("A szegmenst időközben módosították. Töltsd újra és próbáld ismét.");
    throw err;
  }
}

export async function linkSegmentTask(comparisonId: string, segmentId: string, taskId: string): Promise<SegmentDto> {
  return fetchApi<SegmentDto>(`/document-comparisons/${encodeURIComponent(comparisonId)}/segments/${encodeURIComponent(segmentId)}/task-link`, {
    method: "POST", body: JSON.stringify({ taskId }),
  });
}
export async function unlinkSegmentTask(comparisonId: string, segmentId: string): Promise<SegmentDto> {
  return fetchApi<SegmentDto>(`/document-comparisons/${encodeURIComponent(comparisonId)}/segments/${encodeURIComponent(segmentId)}/task-link`, { method: "DELETE" });
}
export async function linkSegmentAnnotation(comparisonId: string, segmentId: string, annotationId: string): Promise<SegmentDto> {
  return fetchApi<SegmentDto>(`/document-comparisons/${encodeURIComponent(comparisonId)}/segments/${encodeURIComponent(segmentId)}/annotation-link`, {
    method: "POST", body: JSON.stringify({ annotationId }),
  });
}
export async function unlinkSegmentAnnotation(comparisonId: string, segmentId: string): Promise<SegmentDto> {
  return fetchApi<SegmentDto>(`/document-comparisons/${encodeURIComponent(comparisonId)}/segments/${encodeURIComponent(segmentId)}/annotation-link`, { method: "DELETE" });
}
