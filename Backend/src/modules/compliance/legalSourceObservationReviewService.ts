/**
 * W3A — human/internal review lifecycle for machine-ingested legal-source
 * observations.
 *
 * Hard boundaries:
 *  - W2 machine ingestion always lands reviewStatus NEW; this module never
 *    writes provenance fields, payload digest or idempotency state, and a
 *    rejected observation keeps its immutable W2 provenance row (never deleted);
 *  - transitions: NEW → IN_REVIEW → { NO_IMPACT | IMPACT_CONFIRMED | REJECTED }.
 *    Terminal states are immutable; every other transition is a 409 with the
 *    stable code OBSERVATION_REVIEW_INVALID_TRANSITION;
 *  - IMPACT_CONFIRMED means ONLY that a human reviewer confirmed this
 *    source-side event warrants downstream impact assessment. It is NOT a
 *    compliance finding, violation, remediation, task, notification, case,
 *    version approval or version activation;
 *  - version review is a DIFFERENT lifecycle: deciding an observation never
 *    mutates the linked LegalSourceVersion status or reviewStatus;
 *  - concurrency: each transition is one atomic conditional updateMany, so of
 *    concurrent actors exactly one wins.
 */
import type { Prisma as PrismaTypes, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { InteractionError, type InternalActor } from '../client-interaction/base';
import { normalizeCelex } from '../compliance-doc-intelligence/legalSourceBinding';
import { OBSERVATION_KINDS } from './legalSourceObservationService';

type Db = PrismaClient;

export const OBSERVATION_REVIEW_STATUS_NEW = 'NEW';
export const OBSERVATION_REVIEW_STATUS_IN_REVIEW = 'IN_REVIEW';
export const OBSERVATION_REVIEW_STATUS_NO_IMPACT = 'NO_IMPACT';
export const OBSERVATION_REVIEW_STATUS_IMPACT_CONFIRMED = 'IMPACT_CONFIRMED';
export const OBSERVATION_REVIEW_STATUS_REJECTED = 'REJECTED';

export const OBSERVATION_REVIEW_STATUSES = [
  OBSERVATION_REVIEW_STATUS_NEW,
  OBSERVATION_REVIEW_STATUS_IN_REVIEW,
  OBSERVATION_REVIEW_STATUS_NO_IMPACT,
  OBSERVATION_REVIEW_STATUS_IMPACT_CONFIRMED,
  OBSERVATION_REVIEW_STATUS_REJECTED,
] as const;
export type LegalSourceObservationReviewStatus = (typeof OBSERVATION_REVIEW_STATUSES)[number];

/** Terminal decision targets. No transition leaves a terminal state. */
export const OBSERVATION_REVIEW_TERMINAL_STATUSES = [
  OBSERVATION_REVIEW_STATUS_NO_IMPACT,
  OBSERVATION_REVIEW_STATUS_IMPACT_CONFIRMED,
  OBSERVATION_REVIEW_STATUS_REJECTED,
] as const;
export type LegalSourceObservationDecision = (typeof OBSERVATION_REVIEW_TERMINAL_STATUSES)[number];

export const OBSERVATION_REVIEW_DECISION_NOTE_MAX = 2000;
export const OBSERVATION_REVIEW_LIST_DEFAULT_LIMIT = 50;
export const OBSERVATION_REVIEW_LIST_MAX_LIMIT = 100;

const observationInclude = {
  legalSource: { select: { id: true, sourceKey: true, canonicalCitation: true, title: true } },
  legalSourceVersion: { select: { id: true, legalVersionKey: true, status: true, reviewStatus: true, effectiveFrom: true } },
  legalSourceCapture: { select: { id: true, sourceSha256: true, captureStatus: true, completeness: true } },
  reviewStartedBy: { select: { id: true, name: true } },
  decidedBy: { select: { id: true, name: true } },
} as const;

type ObservationWithRelations = PrismaTypes.LegalSourceObservationGetPayload<{ include: typeof observationInclude }>;

export interface ObservationReviewerSummaryDto {
  id: string;
  name: string;
}

export interface LegalSourceObservationReviewItemDto {
  id: string;
  kind: string;
  sourceIdentifier: string;
  relatedIdentifier: string;
  capturedAt: Date;
  ingestedAt: Date;
  effectiveFrom: Date | null;
  sourceUri: string;
  reviewStatus: LegalSourceObservationReviewStatus;
  reviewStartedAt: Date | null;
  reviewStartedBy: ObservationReviewerSummaryDto | null;
  decidedAt: Date | null;
  decidedBy: ObservationReviewerSummaryDto | null;
  decisionNote: string | null;
  legalSource: {
    id: string;
    sourceKey: string;
    canonicalCitation: string | null;
    title: string | null;
  } | null;
  legalSourceVersion: {
    id: string;
    legalVersionKey: string;
    status: string;
    reviewStatus: string;
    effectiveFrom: Date | null;
  } | null;
  legalSourceCapture: {
    id: string;
    sourceSha256: string;
    captureStatus: string;
    completeness: string;
  } | null;
}

export interface LegalSourceObservationReviewDetailDto extends LegalSourceObservationReviewItemDto {
  schemaVersion: number;
  source: string;
  identifierFamily: string;
  payloadDigest: string;
  evidenceSha256: string;
  warnings: unknown;
  queryProvenance: unknown;
}

function reviewerSummary(user: { id: string; name: string } | null): ObservationReviewerSummaryDto | null {
  return user ? { id: user.id, name: user.name } : null;
}

function toItemDto(row: ObservationWithRelations): LegalSourceObservationReviewItemDto {
  return {
    id: row.id,
    kind: String(row.kind),
    sourceIdentifier: row.sourceIdentifier,
    relatedIdentifier: row.relatedIdentifier,
    capturedAt: row.capturedAt,
    ingestedAt: row.ingestedAt,
    effectiveFrom: row.effectiveFrom,
    sourceUri: row.sourceUri,
    reviewStatus: row.reviewStatus as LegalSourceObservationReviewStatus,
    reviewStartedAt: row.reviewStartedAt,
    reviewStartedBy: reviewerSummary(row.reviewStartedBy),
    decidedAt: row.decidedAt,
    decidedBy: reviewerSummary(row.decidedBy),
    decisionNote: row.decisionNote,
    legalSource: row.legalSource
      ? {
          id: row.legalSource.id,
          sourceKey: row.legalSource.sourceKey,
          canonicalCitation: row.legalSource.canonicalCitation,
          title: row.legalSource.title,
        }
      : null,
    legalSourceVersion: row.legalSourceVersion
      ? {
          id: row.legalSourceVersion.id,
          legalVersionKey: row.legalSourceVersion.legalVersionKey,
          status: String(row.legalSourceVersion.status),
          reviewStatus: String(row.legalSourceVersion.reviewStatus),
          effectiveFrom: row.legalSourceVersion.effectiveFrom,
        }
      : null,
    legalSourceCapture: row.legalSourceCapture
      ? {
          id: row.legalSourceCapture.id,
          sourceSha256: row.legalSourceCapture.sourceSha256,
          captureStatus: String(row.legalSourceCapture.captureStatus),
          completeness: String(row.legalSourceCapture.completeness),
        }
      : null,
  };
}

function toDetailDto(row: ObservationWithRelations): LegalSourceObservationReviewDetailDto {
  return {
    ...toItemDto(row),
    schemaVersion: row.schemaVersion,
    source: row.source,
    identifierFamily: row.identifierFamily,
    payloadDigest: row.payloadDigest,
    evidenceSha256: row.evidenceSha256,
    warnings: row.warnings,
    queryProvenance: row.queryProvenance,
  };
}

function parseLimit(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return OBSERVATION_REVIEW_LIST_DEFAULT_LIMIT;
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new InteractionError(400, 'INVALID_PAGINATION', 'limit must be a number.');
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > OBSERVATION_REVIEW_LIST_MAX_LIMIT) {
    throw new InteractionError(400, 'INVALID_PAGINATION', `limit must be an integer between 1 and ${OBSERVATION_REVIEW_LIST_MAX_LIMIT}.`);
  }
  return value;
}

function parseOffset(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return 0;
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new InteractionError(400, 'INVALID_PAGINATION', 'offset must be a number.');
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new InteractionError(400, 'INVALID_PAGINATION', 'offset must be a non-negative integer.');
  }
  return value;
}

function parseReviewStatusFilter(raw: unknown): LegalSourceObservationReviewStatus | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string') {
    throw new InteractionError(400, 'INVALID_REVIEW_STATUS', 'reviewStatus must be a single value.');
  }
  const token = raw.trim();
  if (!(OBSERVATION_REVIEW_STATUSES as readonly string[]).includes(token)) {
    throw new InteractionError(400, 'INVALID_REVIEW_STATUS', `reviewStatus must be one of: ${OBSERVATION_REVIEW_STATUSES.join(', ')}.`);
  }
  return token as LegalSourceObservationReviewStatus;
}

function parseKindFilter(raw: unknown): (typeof OBSERVATION_KINDS)[number] | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string') {
    throw new InteractionError(400, 'INVALID_KIND', 'kind must be a single value.');
  }
  const token = raw.trim();
  if (!(OBSERVATION_KINDS as readonly string[]).includes(token)) {
    throw new InteractionError(400, 'INVALID_KIND', `kind must be one of: ${OBSERVATION_KINDS.join(', ')}.`);
  }
  return token as (typeof OBSERVATION_KINDS)[number];
}

/** Exact/canonical identifier filter: normalized exactly like W2 ingestion. */
function parseSourceIdentifierFilter(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string') {
    throw new InteractionError(400, 'INVALID_SOURCE_IDENTIFIER', 'sourceIdentifier must be a single value.');
  }
  const normalized = normalizeCelex(raw);
  if (!normalized) {
    throw new InteractionError(400, 'INVALID_SOURCE_IDENTIFIER', 'sourceIdentifier must be a canonical CELEX identifier.');
  }
  return normalized;
}

export interface LegalSourceObservationListQuery {
  limit?: unknown;
  offset?: unknown;
  reviewStatus?: unknown;
  kind?: unknown;
  sourceIdentifier?: unknown;
}

export interface LegalSourceObservationListResult {
  items: LegalSourceObservationReviewItemDto[];
  pagination: { limit: number; offset: number; total: number; returned: number };
}

/** Internal review queue: ingestedAt DESC, id DESC, bounded pagination. */
export async function listLegalSourceObservations(
  query: LegalSourceObservationListQuery,
  prisma: Db = defaultPrisma,
): Promise<LegalSourceObservationListResult> {
  const limit = parseLimit(query.limit);
  const offset = parseOffset(query.offset);
  const reviewStatus = parseReviewStatusFilter(query.reviewStatus);
  const kind = parseKindFilter(query.kind);
  const sourceIdentifier = parseSourceIdentifierFilter(query.sourceIdentifier);

  const where: PrismaTypes.LegalSourceObservationWhereInput = {};
  if (reviewStatus) where.reviewStatus = reviewStatus;
  if (kind) where.kind = kind as never;
  if (sourceIdentifier) where.sourceIdentifier = sourceIdentifier;

  const [total, rows] = await Promise.all([
    prisma.legalSourceObservation.count({ where }),
    prisma.legalSourceObservation.findMany({
      where,
      include: observationInclude,
      orderBy: [{ ingestedAt: 'desc' }, { id: 'desc' }],
      skip: offset,
      take: limit,
    }),
  ]);

  return { items: rows.map(toItemDto), pagination: { limit, offset, total, returned: rows.length } };
}

export async function getLegalSourceObservationDetail(
  id: string,
  prisma: Db = defaultPrisma,
): Promise<LegalSourceObservationReviewDetailDto> {
  const row = await prisma.legalSourceObservation.findUnique({ where: { id }, include: observationInclude });
  if (!row) throw new InteractionError(404, 'OBSERVATION_NOT_FOUND', 'Legal source observation not found.');
  return toDetailDto(row);
}

function invalidTransition(currentStatus: unknown): InteractionError {
  return new InteractionError(
    409,
    'OBSERVATION_REVIEW_INVALID_TRANSITION',
    `The observation cannot make this review transition (current status: ${String(currentStatus)}).`,
  );
}

/**
 * NEW → IN_REVIEW. One atomic conditional updateMany: concurrent reviewers can
 * never both start the same observation; existing reviewer provenance is only
 * written when the row is still NEW.
 */
export async function startLegalSourceObservationReview(
  id: string,
  actor: InternalActor,
  prisma: Db = defaultPrisma,
): Promise<LegalSourceObservationReviewDetailDto> {
  const started = await prisma.legalSourceObservation.updateMany({
    where: { id, reviewStatus: OBSERVATION_REVIEW_STATUS_NEW },
    data: {
      reviewStatus: OBSERVATION_REVIEW_STATUS_IN_REVIEW,
      reviewStartedAt: new Date(),
      reviewStartedById: actor.userId,
    },
  });
  if (started.count === 1) return getLegalSourceObservationDetail(id, prisma);

  const existing = await prisma.legalSourceObservation.findUnique({
    where: { id },
    select: { id: true, reviewStatus: true },
  });
  if (!existing) throw new InteractionError(404, 'OBSERVATION_NOT_FOUND', 'Legal source observation not found.');
  throw invalidTransition(existing.reviewStatus);
}

function normalizeDecisionNote(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') throw new InteractionError(400, 'INVALID_DECISION_NOTE', 'note must be a string.');
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > OBSERVATION_REVIEW_DECISION_NOTE_MAX) {
    throw new InteractionError(400, 'DECISION_NOTE_TOO_LONG', `note must be at most ${OBSERVATION_REVIEW_DECISION_NOTE_MAX} characters.`);
  }
  return trimmed;
}

export interface LegalSourceObservationDecisionInput {
  decision?: unknown;
  note?: unknown;
}

/**
 * IN_REVIEW → NO_IMPACT | IMPACT_CONFIRMED | REJECTED. One atomic conditional
 * updateMany: concurrent terminal decisions can never both win, terminal rows
 * are immutable, and reviewStartedAt/reviewStartedById are never altered here.
 */
export async function decideLegalSourceObservationReview(
  id: string,
  input: LegalSourceObservationDecisionInput,
  actor: InternalActor,
  prisma: Db = defaultPrisma,
): Promise<LegalSourceObservationReviewDetailDto> {
  const decision = typeof input.decision === 'string' ? input.decision.trim() : '';
  if (!(OBSERVATION_REVIEW_TERMINAL_STATUSES as readonly string[]).includes(decision)) {
    throw new InteractionError(
      400,
      'INVALID_DECISION',
      `decision must be one of: ${OBSERVATION_REVIEW_TERMINAL_STATUSES.join(', ')}.`,
    );
  }
  const note = normalizeDecisionNote(input.note);

  const decided = await prisma.legalSourceObservation.updateMany({
    where: { id, reviewStatus: OBSERVATION_REVIEW_STATUS_IN_REVIEW },
    data: {
      reviewStatus: decision as LegalSourceObservationDecision,
      decidedAt: new Date(),
      decidedById: actor.userId,
      decisionNote: note,
    },
  });
  if (decided.count === 1) return getLegalSourceObservationDetail(id, prisma);

  const existing = await prisma.legalSourceObservation.findUnique({
    where: { id },
    select: { id: true, reviewStatus: true },
  });
  if (!existing) throw new InteractionError(404, 'OBSERVATION_NOT_FOUND', 'Legal source observation not found.');
  throw invalidTransition(existing.reviewStatus);
}
