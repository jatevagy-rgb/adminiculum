/**
 * Explicit DTO mappers for structured comparison (STRUCTURED-DOC-COMPARISON-1).
 *
 * The API returns only these shapes — never raw Prisma rows. No storage keys,
 * no binary content, no full document bodies, no stack traces, no extraction
 * paths. Excerpts are already bounded by the engine; nothing here re-expands them.
 */

export interface ComparisonDto {
  id: string;
  documentId: string;
  baseVersionId: string;
  targetVersionId: string;
  status: string;
  algorithmRevision: number;
  extractionRevision: number;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failureCode: string | null;
  failureMessageSafe: string | null;
  counts: {
    insert: number;
    delete: number;
    replace: number;
    formatOnly: number;
    moveCandidate: number;
    total: number;
    reviewed: number;
  };
}

export interface SegmentDto {
  id: string;
  comparisonId: string;
  sequence: number;
  changeType: string;
  baseStart: number | null;
  baseEnd: number | null;
  targetStart: number | null;
  targetEnd: number | null;
  baseExcerpt: string | null;
  targetExcerpt: string | null;
  contextBefore: string | null;
  contextAfter: string | null;
  confidence: number;
  reviewState: string;
  category: string;
  categorySource: string;
  internalRationale: string | null;
  linkedTaskId: string | null;
  linkedAnnotationId: string | null;
  revision: number;
}

const iso = (d: Date | string | null | undefined): string | null =>
  d ? new Date(d).toISOString() : null;

export function toComparisonDto(row: any): ComparisonDto {
  return {
    id: row.id,
    documentId: row.documentId,
    baseVersionId: row.baseVersionId,
    targetVersionId: row.targetVersionId,
    status: String(row.status),
    algorithmRevision: row.algorithmRevision,
    extractionRevision: row.extractionRevision,
    createdAt: iso(row.createdAt),
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
    failureCode: row.failureCode ?? null,
    failureMessageSafe: row.failureMessageSafe ?? null,
    counts: {
      insert: row.insertCount ?? 0,
      delete: row.deleteCount ?? 0,
      replace: row.replaceCount ?? 0,
      formatOnly: row.formatOnlyCount ?? 0,
      moveCandidate: row.moveCandidateCount ?? 0,
      total: row.totalSegmentCount ?? 0,
      reviewed: row.reviewedSegmentCount ?? 0,
    },
  };
}

export function toSegmentDto(row: any): SegmentDto {
  return {
    id: row.id,
    comparisonId: row.comparisonId,
    sequence: row.sequence,
    changeType: String(row.changeType),
    baseStart: row.baseStart ?? null,
    baseEnd: row.baseEnd ?? null,
    targetStart: row.targetStart ?? null,
    targetEnd: row.targetEnd ?? null,
    baseExcerpt: row.baseExcerpt ?? null,
    targetExcerpt: row.targetExcerpt ?? null,
    contextBefore: row.contextBefore ?? null,
    contextAfter: row.contextAfter ?? null,
    confidence: row.confidence ?? 0,
    reviewState: String(row.reviewState),
    category: String(row.category),
    categorySource: String(row.categorySource),
    internalRationale: row.internalRationale ?? null,
    linkedTaskId: row.linkedTaskId ?? null,
    linkedAnnotationId: row.linkedAnnotationId ?? null,
    revision: row.revision ?? 0,
  };
}
