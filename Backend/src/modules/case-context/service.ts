/**
 * Case Context V2 — workforce-internal context-source service.
 *
 * Persists raw pasted case context (or a server-side snapshot of a
 * Communication body) immutably, and — after an approved, one-shot
 * DETECT → REVIEW → APPLY — a derived `anonymizedText` plus a safe,
 * non-reversible `anonymizationSnapshot`.
 *
 * This service reuses ONLY the pure anonymization foundation
 * (`Backend/src/modules/anonymization`): deterministic, in-memory, no network,
 * no DB, no external AI. It never routes through `preparePromptDraft` or the
 * document-coupled `anonymize` module.
 *
 * Invariants enforced here:
 *  - rawText is immutable: no update path exists (a correction creates a new row).
 *  - The reversible original→placeholder mapping is never persisted, logged, or
 *    returned; it exists only inside the in-memory operation and is discarded.
 *  - manualTerms are ephemeral: accepted by detect and anonymize, never stored.
 *  - anonymization application is one-shot and atomic (updateMany WHERE
 *    anonymizedText IS NULL).
 *  - No external AI is ever invoked.
 */

import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import {
  ANONYMIZATION_ALGORITHM_REVISION,
  MAX_INPUT_CHARS,
  applyApprovedRedactions,
  buildResult,
  createApprovedRedactions,
  detectCandidates,
  type AnonymizationCandidate,
  type ManualSensitiveTerm,
  type SensitiveCategory,
} from '../anonymization';

export type CaseContextOrigin = 'PASTED' | 'COMMUNICATION';

export type SafeAnonymizationSnapshot = {
  algorithmRevision: number;
  sourceHash: string;
  resultHash: string;
  appliedCount: number;
  categoryCounts: Record<string, number>;
  warnings: string[];
  mappingLocation: 'in-memory-only';
};

export type CaseContextCreatedBy = {
  id: string;
  name: string;
  email: string;
};

export type CaseContextSourceDTO = {
  id: string;
  origin: CaseContextOrigin;
  sourceCommunicationId: string | null;
  rawText: string;
  anonymizedText: string | null;
  anonymizationSnapshot: SafeAnonymizationSnapshot | null;
  createdBy: CaseContextCreatedBy | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ReviewCandidateDTO = {
  id: string;
  type: SensitiveCategory;
  start: number;
  end: number;
  originalText: string;
  proposedReplacement: string;
  detector: string;
  confidence: string;
  note?: string;
};

export type DetectResponseDTO = {
  sourceHash: string;
  optionsDigest: string;
  candidates: ReviewCandidateDTO[];
};

export type AnonymizeResponseDTO = {
  id: string;
  origin: CaseContextOrigin;
  anonymizedText: string;
  anonymizationSnapshot: SafeAnonymizationSnapshot;
  updatedAt: Date;
};

type PrismaLike = typeof defaultPrisma | Prisma.TransactionClient;

type Actor = { userId: string };

type CaseContextSourceRecord = {
  id: string;
  caseId: string;
  origin: CaseContextOrigin;
  rawText: string;
  anonymizedText: string | null;
  anonymizationSnapshot: Prisma.JsonValue | null;
  sourceCommunicationId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: CaseContextCreatedBy | null;
};

function fail(status: number, code: string, message: string): never {
  throw Object.assign(new Error(message), { status, code });
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function compareTerms(a: ManualSensitiveTerm, b: ManualSensitiveTerm): number {
  if (a.term !== b.term) return a.term < b.term ? -1 : 1;
  if (a.category !== b.category) return a.category < b.category ? -1 : 1;
  return 0;
}

/**
 * Canonical, order-insensitive normalization of the manual-term option surface.
 * Ordering (and duplicate entries) must never change the review identity, so we
 * stable-sort and de-duplicate before hashing. This does not change matching
 * behaviour: the foundation's exact-term detector de-duplicates identical,
 * contained and overlapping spans itself.
 */
function normalizeManualTerms(terms: ManualSensitiveTerm[]): ManualSensitiveTerm[] {
  const sorted = [...terms].sort(compareTerms);
  const seen = new Set<string>();
  const out: ManualSensitiveTerm[] = [];
  for (const term of sorted) {
    const key = `${term.term}\u0000${term.category}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ term: term.term, category: term.category });
  }
  return out;
}

/**
 * Deterministic digest of the EFFECTIVE detection options. Includes the
 * algorithm revision so a candidate review produced under one revision cannot
 * be silently applied under materially changed detection behaviour.
 */
export function computeOptionsDigest(manualTerms: ManualSensitiveTerm[]): string {
  const canonical = {
    algorithmRevision: ANONYMIZATION_ALGORITHM_REVISION,
    manualTerms: normalizeManualTerms(manualTerms),
  };
  return sha256(JSON.stringify(canonical));
}

export function computeSourceHash(rawText: string): string {
  return sha256(rawText);
}

function toSafeSnapshot(result: ReturnType<typeof buildResult>): SafeAnonymizationSnapshot {
  return {
    algorithmRevision: result.algorithmRevision,
    sourceHash: result.sourceHash,
    resultHash: result.resultHash,
    appliedCount: result.appliedCount,
    categoryCounts: result.categoryCounts,
    warnings: result.warnings,
    mappingLocation: result.mappingLocation,
  };
}

function toCandidateDTO(candidate: AnonymizationCandidate): ReviewCandidateDTO {
  return {
    id: candidate.id,
    type: candidate.type,
    start: candidate.start,
    end: candidate.end,
    originalText: candidate.originalText,
    proposedReplacement: candidate.proposedReplacement,
    detector: candidate.detector,
    confidence: candidate.confidence,
    ...(candidate.note ? { note: candidate.note } : {}),
  };
}

function parseSnapshot(json: Prisma.JsonValue | null): SafeAnonymizationSnapshot | null {
  if (json == null) return null;
  const value = json as SafeAnonymizationSnapshot;
  return {
    algorithmRevision: Number(value.algorithmRevision ?? 0),
    sourceHash: String(value.sourceHash ?? ''),
    resultHash: String(value.resultHash ?? ''),
    appliedCount: Number(value.appliedCount ?? 0),
    categoryCounts: (value.categoryCounts && typeof value.categoryCounts === 'object'
      ? value.categoryCounts
      : {}) as Record<string, number>,
    warnings: Array.isArray(value.warnings) ? value.warnings.map((w) => String(w)) : [],
    mappingLocation: 'in-memory-only',
  };
}

function toDTO(record: CaseContextSourceRecord): CaseContextSourceDTO {
  return {
    id: record.id,
    origin: record.origin,
    sourceCommunicationId: record.sourceCommunicationId,
    rawText: record.rawText,
    anonymizedText: record.anonymizedText,
    anonymizationSnapshot: parseSnapshot(record.anonymizationSnapshot),
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function loadSourceInCase(
  prismaClient: PrismaLike,
  caseId: string,
  sourceId: string,
): Promise<CaseContextSourceRecord> {
  const record = await prismaClient.caseContextSource.findUnique({
    where: { id: sourceId },
    include: { createdBy: { select: { id: true, name: true, email: true } } },
  }) as unknown as CaseContextSourceRecord | null;

  if (!record) {
    fail(404, 'CONTEXT_SOURCE_NOT_FOUND', 'Context source not found.');
  }
  if (record.caseId !== caseId) {
    fail(404, 'CONTEXT_SOURCE_NOT_FOUND', 'Context source not found for this case.');
  }
  return record;
}

function validateRawText(rawText: unknown): string {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    fail(400, 'EMPTY_RAW_TEXT', 'Context source text must be a non-empty string.');
  }
  if (rawText.length > MAX_INPUT_CHARS) {
    fail(400, 'RAW_TEXT_TOO_LARGE', `Context source text exceeds the maximum of ${MAX_INPUT_CHARS} characters.`);
  }
  return rawText;
}

/**
 * Create a PASTED context source. `rawText` is the only caller-supplied input;
 * caseId, createdById, origin and createdAt are server-derived. There is no
 * field for createdById / anonymizedText / anonymizationSnapshot on the input.
 */
export async function createPastedContextSource(
  actor: Actor,
  input: { caseId: string; rawText: unknown },
  prismaClient: PrismaLike = defaultPrisma,
): Promise<CaseContextSourceDTO> {
  if (!actor.userId) fail(401, 'AUTH_REQUIRED', 'Authentication is required.');
  const rawText = validateRawText(input.rawText);
  const record = await prismaClient.caseContextSource.create({
    data: {
      caseId: input.caseId,
      createdById: actor.userId,
      origin: 'PASTED',
      rawText,
    },
    include: { createdBy: { select: { id: true, name: true, email: true } } },
  }) as unknown as CaseContextSourceRecord;
  return toDTO(record);
}

/**
 * Create a COMMUNICATION context source. The caller supplies only a
 * communicationId; the server verifies the Communication belongs to the same
 * case and snapshots the canonical `content` body itself. Callers cannot spoof
 * provenance with arbitrary rawText.
 */
export async function createCommunicationContextSource(
  actor: Actor,
  input: { caseId: string; communicationId: unknown },
  prismaClient: PrismaLike = defaultPrisma,
): Promise<CaseContextSourceDTO> {
  if (!actor.userId) fail(401, 'AUTH_REQUIRED', 'Authentication is required.');
  if (typeof input.communicationId !== 'string' || !input.communicationId.trim()) {
    fail(400, 'COMMUNICATION_ID_REQUIRED', 'communicationId is required.');
  }

  const communication = await prismaClient.communication.findUnique({
    where: { id: input.communicationId },
    select: { id: true, caseId: true, content: true },
  });
  if (!communication) {
    fail(404, 'COMMUNICATION_NOT_FOUND', 'Communication not found.');
  }
  if (communication.caseId !== input.caseId) {
    fail(400, 'COMMUNICATION_CASE_MISMATCH', 'Communication does not belong to this case.');
  }

  const rawText = communication.content;
  if (typeof rawText !== 'string' || !rawText.trim()) {
    fail(400, 'COMMUNICATION_SOURCE_GAP', 'Communication has no snapshot-able body.');
  }
  if (rawText.length > MAX_INPUT_CHARS) {
    fail(400, 'RAW_TEXT_TOO_LARGE', `Communication body exceeds the maximum of ${MAX_INPUT_CHARS} characters.`);
  }

  const record = await prismaClient.caseContextSource.create({
    data: {
      caseId: input.caseId,
      createdById: actor.userId,
      origin: 'COMMUNICATION',
      sourceCommunicationId: communication.id,
      rawText,
    },
    include: { createdBy: { select: { id: true, name: true, email: true } } },
  }) as unknown as CaseContextSourceRecord;
  return toDTO(record);
}

export async function listContextSources(
  caseId: string,
  prismaClient: PrismaLike = defaultPrisma,
): Promise<CaseContextSourceDTO[]> {
  const records = await prismaClient.caseContextSource.findMany({
    where: { caseId },
    orderBy: { createdAt: 'asc' },
    include: { createdBy: { select: { id: true, name: true, email: true } } },
  }) as unknown as CaseContextSourceRecord[];
  return records.map(toDTO);
}

/**
 * DETECT: run deterministic detection over the immutable rawText and return a
 * safe review DTO (candidates + sourceHash + optionsDigest). The reversible
 * mapping is never produced here.
 */
export async function detectContextSource(
  input: { caseId: string; id: string; manualTerms?: ManualSensitiveTerm[] },
  prismaClient: PrismaLike = defaultPrisma,
): Promise<DetectResponseDTO> {
  const record = await loadSourceInCase(prismaClient, input.caseId, input.id);
  const manualTerms = normalizeManualTerms(input.manualTerms ?? []);
  const options = { manualTerms };

  const sourceHash = computeSourceHash(record.rawText);
  const optionsDigest = computeOptionsDigest(manualTerms);

  const { candidates } = detectCandidates(record.rawText, options);

  return {
    sourceHash,
    optionsDigest,
    candidates: candidates.map(toCandidateDTO),
  };
}

/**
 * APPLY / ANONYMIZE: verify sourceHash + optionsDigest, re-run deterministic
 * detection, fail closed on unknown/stale candidate ids, apply only the approved
 * candidates, then atomically persist the derived anonymizedText + safe snapshot
 * only if the source is still raw (one-shot). The reversible mapping is never
 * built or persisted.
 */
export async function anonymizeContextSource(
  input: {
    caseId: string;
    id: string;
    sourceHash: unknown;
    optionsDigest: unknown;
    manualTerms?: ManualSensitiveTerm[];
    approvedCandidateIds: unknown;
  },
  prismaClient: PrismaLike = defaultPrisma,
): Promise<AnonymizeResponseDTO> {
  const record = await loadSourceInCase(prismaClient, input.caseId, input.id);

  const sourceHash = computeSourceHash(record.rawText);
  if (typeof input.sourceHash !== 'string' || input.sourceHash !== sourceHash) {
    fail(409, 'SOURCE_HASH_MISMATCH', 'Source hash does not match the current source. Review is stale.');
  }

  const manualTerms = normalizeManualTerms(input.manualTerms ?? []);
  const optionsDigest = computeOptionsDigest(manualTerms);
  if (typeof input.optionsDigest !== 'string' || input.optionsDigest !== optionsDigest) {
    fail(409, 'OPTIONS_DIGEST_MISMATCH', 'Detection options no longer match. Review is stale.');
  }

  const approvedCandidateIds = Array.isArray(input.approvedCandidateIds)
    ? input.approvedCandidateIds.filter((id): id is string => typeof id === 'string')
    : [];

  const { candidates, warnings } = detectCandidates(record.rawText, { manualTerms });

  const validIds = new Set(candidates.map((candidate) => candidate.id));
  for (const id of approvedCandidateIds) {
    if (!validIds.has(id)) {
      fail(409, 'UNKNOWN_CANDIDATE_ID', `Unknown or stale candidate id: ${id}.`);
    }
  }

  const approval = createApprovedRedactions(candidates, approvedCandidateIds);
  const allWarnings = [...warnings, ...approval.warnings];
  const applied = applyApprovedRedactions(record.rawText, approval.redactions);
  const result = buildResult(
    record.rawText,
    applied.anonymizedText,
    applied.appliedCount,
    applied.categoryCounts,
    allWarnings,
  );

  const snapshot = toSafeSnapshot(result);

  // One-shot atomic apply: only write if anonymizedText is still null.
  const updated = await prismaClient.caseContextSource.updateMany({
    where: { id: record.id, anonymizedText: null },
    data: {
      anonymizedText: result.anonymizedText,
      anonymizationSnapshot: snapshot as unknown as Prisma.InputJsonValue,
    },
  });

  if (updated.count !== 1) {
    fail(409, 'CONTEXT_SOURCE_ALREADY_ANONYMIZED', 'Context source has already been anonymized.');
  }

  return {
    id: record.id,
    origin: record.origin,
    anonymizedText: result.anonymizedText,
    anonymizationSnapshot: snapshot,
    updatedAt: new Date(),
  };
}
