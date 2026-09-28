/**
 * W2 — legal-source observation ingestion (machine-only, internal).
 *
 * Turns authenticated watcher observations into durable provenance:
 *
 *   authenticated observation → validation → idempotent LegalSourceObservation
 *   → (CONSOLIDATED_VERSION_AVAILABLE only) optional CANDIDATE LegalSourceVersion
 *   → optional LegalSourceCapture
 *
 * Hard boundaries:
 *  - an internal occurrence of a legal event NEVER mutates canonical state by
 *    itself: no activation, no approval, no supersession, no requirement,
 *    finding, task, case, request or notification is ever produced here;
 *  - the existing tenant/client Observation model is never touched;
 *  - unknown sources are rejected, never provisioned;
 *  - one transaction PER item; a rejected item rolls back alone, and a valid
 *    sibling still commits its own transaction.
 */
import { createHash } from 'node:crypto';
import type { Prisma as PrismaTypes, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { InteractionError } from '../client-interaction/base';
import { normalizeCelex, sourceKeyForCelex } from '../compliance-doc-intelligence/legalSourceBinding';

type Db = PrismaClient;

export const LEGAL_SOURCE_OBSERVATION_SCHEMA_VERSION = 1;
export const LEGAL_SOURCE_OBSERVATION_MAX_BATCH = 100;
export const OBSERVATION_SOURCE_EUR_LEX = 'EUR_LEX';
export const OBSERVATION_IDENTIFIER_FAMILY_CELEX = 'CELEX';

export const OBSERVATION_KIND_AMENDMENT_PUBLISHED = 'AMENDMENT_PUBLISHED';
export const OBSERVATION_KIND_CONSOLIDATED_VERSION_AVAILABLE = 'CONSOLIDATED_VERSION_AVAILABLE';

export const OBSERVATION_KINDS = [
  OBSERVATION_KIND_AMENDMENT_PUBLISHED,
  OBSERVATION_KIND_CONSOLIDATED_VERSION_AVAILABLE,
] as const;
export type LegalSourceObservationKind = (typeof OBSERVATION_KINDS)[number];

export const OBSERVATION_RESULT_ACCEPTED = 'ACCEPTED';
export const OBSERVATION_RESULT_DUPLICATE = 'DUPLICATE';
export const OBSERVATION_RESULT_REJECTED = 'REJECTED';
export type LegalSourceObservationResultStatus =
  | typeof OBSERVATION_RESULT_ACCEPTED
  | typeof OBSERVATION_RESULT_DUPLICATE
  | typeof OBSERVATION_RESULT_REJECTED;

export interface LegalSourceObservationItemResult {
  idempotencyKey: string | null;
  status: LegalSourceObservationResultStatus;
  reason: string | null;
  warnings: string[];
}

export interface LegalSourceObservationIngestResponse {
  schemaVersion: number;
  results: LegalSourceObservationItemResult[];
}

/** Consolidated CELEX v1 grammar: 02016R0679-20160504. Cannot collide with the seeded V1 base grammar. */
const CONSOLIDATED_CELEX_TOKEN = /^0[0-9]{4}[A-Z][0-9]{4}-[0-9]{8}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const ISO_WITH_TIMEZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;
const MAX_IDEMPOTENCY_KEY_LENGTH = 255;
const MAX_SOURCE_URI_LENGTH = 2048;
const MAX_WARNINGS = 50;
const MAX_WARNING_LENGTH = 500;
const MAX_PROVENANCE_DEPTH = 6;
const MAX_PROVENANCE_CHARS = 8192;

/**
 * Deterministic JSON canonicalization: object keys are sorted recursively so the
 * digest never depends on key order. Array order is preserved (it can be
 * semantic), and primitives pass through unchanged.
 */
export function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) out[key] = canonicalizeJson(record[key]);
    return out;
  }
  return value;
}

/** Trim + uppercase and accept ONLY the exact consolidated CELEX shape. */
export function normalizeConsolidatedCelex(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const token = String(raw).trim().toUpperCase();
  if (!token) return null;
  return CONSOLIDATED_CELEX_TOKEN.test(token) ? token : null;
}

/** Strict ISO-8601 with an explicit timezone; normalized to a UTC Date. */
function parseTimestampWithTimezone(raw: unknown): Date | null {
  if (typeof raw !== 'string') return null;
  const token = raw.trim();
  if (!ISO_WITH_TIMEZONE.test(token)) return null;
  const parsed = new Date(token);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isValidHttpsUri(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  const token = raw.trim();
  if (!token || token.length > MAX_SOURCE_URI_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(token);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  return true;
}

function isPlainJsonValue(value: unknown, depth = 0): boolean {
  if (depth > MAX_PROVENANCE_DEPTH) return false;
  if (value === null) return true;
  const kind = typeof value;
  if (kind === 'string' || kind === 'boolean') return true;
  if (kind === 'number') return Number.isFinite(value as number);
  if (Array.isArray(value)) return value.every((entry) => isPlainJsonValue(entry, depth + 1));
  if (kind === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    return Object.values(value as Record<string, unknown>).every((entry) => isPlainJsonValue(entry, depth + 1));
  }
  return false;
}

function boundedProvenance(value: unknown): { ok: true; value: unknown } | { ok: false } {
  if (!isPlainJsonValue(value)) return { ok: false };
  const serialized = JSON.stringify(canonicalizeJson(value));
  if (serialized.length > MAX_PROVENANCE_CHARS) return { ok: false };
  return { ok: true, value };
}

function boundedWarnings(value: unknown): { ok: true; warnings: string[] } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, warnings: [] };
  if (!Array.isArray(value) || value.length > MAX_WARNINGS) return { ok: false };
  const warnings: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') return { ok: false };
    const trimmed = entry.trim();
    if (!trimmed || trimmed.length > MAX_WARNING_LENGTH) return { ok: false };
    warnings.push(trimmed);
  }
  return { ok: true, warnings: [...new Set(warnings)].sort() };
}

interface NormalizedObservation {
  idempotencyKey: string;
  kind: LegalSourceObservationKind;
  source: string;
  identifierFamily: string;
  sourceIdentifier: string;
  relatedIdentifier: string;
  effectiveFrom: Date | null;
  effectiveFromIso: string | null;
  sourceUri: string;
  evidenceSha256: string;
  capturedAt: Date;
  capturedAtIso: string;
  queryProvenance: unknown | null;
  warnings: string[];
  payloadDigest: string;
}

/**
 * SHA-256 over the canonicalized semantic payload. Independent of raw JSON
 * formatting and of object key order; every semantic field is covered.
 */
export function computeObservationPayloadDigest(input: Omit<NormalizedObservation, 'payloadDigest'>): string {
  const payload = canonicalizeJson({
    schemaVersion: LEGAL_SOURCE_OBSERVATION_SCHEMA_VERSION,
    kind: input.kind,
    source: input.source,
    identifierFamily: input.identifierFamily,
    sourceIdentifier: input.sourceIdentifier,
    relatedIdentifier: input.relatedIdentifier,
    effectiveFrom: input.effectiveFromIso,
    sourceUri: input.sourceUri,
    evidenceSha256: input.evidenceSha256,
    capturedAt: input.capturedAtIso,
    queryProvenance: input.queryProvenance,
    warnings: input.warnings,
  });
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

type ItemValidation =
  | { ok: true; item: NormalizedObservation }
  | { ok: false; warnedKey: string | null; reason: string; warnings: string[] };

function rejectedKey(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() && raw.trim().length <= MAX_IDEMPOTENCY_KEY_LENGTH ? raw.trim() : null;
}

/**
 * Normalize ONE observation item. The order is deliberate: identity, then the
 * typed event identifiers, then evidence, then the derived digest.
 */
export function normalizeObservationItem(raw: unknown): ItemValidation {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, warnedKey: null, reason: 'INVALID_OBSERVATION_ITEM', warnings: [] };
  }
  const record = raw as Record<string, unknown>;

  const idempotencyKey = typeof record.idempotencyKey === 'string' ? record.idempotencyKey.trim() : '';
  if (!idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return { ok: false, warnedKey: rejectedKey(record.idempotencyKey), reason: 'INVALID_IDEMPOTENCY_KEY', warnings: [] };
  }

  const kind = String(record.kind || '');
  if (!(OBSERVATION_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, warnedKey: idempotencyKey, reason: 'UNKNOWN_KIND', warnings: [] };
  }
  if (String(record.source || '') !== OBSERVATION_SOURCE_EUR_LEX) {
    return { ok: false, warnedKey: idempotencyKey, reason: 'UNSUPPORTED_SOURCE', warnings: [] };
  }
  if (String(record.identifierFamily || '') !== OBSERVATION_IDENTIFIER_FAMILY_CELEX) {
    return { ok: false, warnedKey: idempotencyKey, reason: 'UNSUPPORTED_IDENTIFIER_FAMILY', warnings: [] };
  }

  const sourceIdentifier = normalizeCelex(typeof record.sourceIdentifier === 'string' ? record.sourceIdentifier : null);
  if (!sourceIdentifier) {
    return { ok: false, warnedKey: idempotencyKey, reason: 'INVALID_SOURCE_IDENTIFIER', warnings: [] };
  }

  const rawRelated = typeof record.relatedIdentifier === 'string' ? record.relatedIdentifier : null;
  const relatedIdentifier = kind === OBSERVATION_KIND_AMENDMENT_PUBLISHED
    ? normalizeCelex(rawRelated)
    : normalizeConsolidatedCelex(rawRelated);
  if (!relatedIdentifier) {
    return { ok: false, warnedKey: idempotencyKey, reason: 'INVALID_RELATED_IDENTIFIER', warnings: [] };
  }

  let effectiveFrom: Date | null = null;
  if (record.effectiveFrom !== undefined && record.effectiveFrom !== null && record.effectiveFrom !== '') {
    effectiveFrom = parseTimestampWithTimezone(record.effectiveFrom);
    if (!effectiveFrom) {
      return { ok: false, warnedKey: idempotencyKey, reason: 'INVALID_EFFECTIVE_FROM', warnings: [] };
    }
  }

  const evidence = record.evidence;
  if (evidence === null || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return { ok: false, warnedKey: idempotencyKey, reason: 'INVALID_EVIDENCE', warnings: [] };
  }
  const evidenceRecord = evidence as Record<string, unknown>;

  if (!isValidHttpsUri(evidenceRecord.sourceUri)) {
    return { ok: false, warnedKey: idempotencyKey, reason: 'INVALID_SOURCE_URI', warnings: [] };
  }
  const sourceUri = String(evidenceRecord.sourceUri).trim();

  const evidenceSha256 = typeof evidenceRecord.sha256 === 'string' ? evidenceRecord.sha256.trim().toLowerCase() : '';
  if (!SHA256_HEX.test(evidenceSha256)) {
    return { ok: false, warnedKey: idempotencyKey, reason: 'INVALID_SHA256', warnings: [] };
  }

  const capturedAt = parseTimestampWithTimezone(evidenceRecord.capturedAt);
  if (!capturedAt) {
    return { ok: false, warnedKey: idempotencyKey, reason: 'INVALID_CAPTURED_AT', warnings: [] };
  }

  let queryProvenance: unknown | null = null;
  if (evidenceRecord.queryProvenance !== undefined && evidenceRecord.queryProvenance !== null) {
    const bounded = boundedProvenance(evidenceRecord.queryProvenance);
    if (bounded.ok === false) {
      return { ok: false, warnedKey: idempotencyKey, reason: 'INVALID_QUERY_PROVENANCE', warnings: [] };
    }
    queryProvenance = bounded.value;
  }

  const boundedWarningsResult = boundedWarnings(record.warnings);
  if (boundedWarningsResult.ok === false) {
    return { ok: false, warnedKey: idempotencyKey, reason: 'INVALID_WARNINGS', warnings: [] };
  }

  const base = {
    idempotencyKey,
    kind: kind as LegalSourceObservationKind,
    source: OBSERVATION_SOURCE_EUR_LEX,
    identifierFamily: OBSERVATION_IDENTIFIER_FAMILY_CELEX,
    sourceIdentifier,
    relatedIdentifier,
    effectiveFrom,
    effectiveFromIso: effectiveFrom ? effectiveFrom.toISOString() : null,
    sourceUri,
    evidenceSha256,
    capturedAt,
    capturedAtIso: capturedAt.toISOString(),
    queryProvenance,
    warnings: boundedWarningsResult.warnings,
  };
  return { ok: true, item: { ...base, payloadDigest: computeObservationPayloadDigest(base) } };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'P2002');
}

class VersionStateConflict extends Error {
  constructor() {
    super('VERSION_STATE_CONFLICT');
    this.name = 'VersionStateConflict';
  }
}

/**
 * Reuse of an existing version row is allowed ONLY when it is still exactly a
 * candidate and carries the same effectiveFrom; the ACTIVE + APPROVED row and
 * every other lifecycle state remain untouched and un-reusable.
 */
function assertVersionReusable(version: {
  status: unknown;
  reviewStatus: unknown;
  effectiveFrom?: Date | string | null;
}, effectiveFromIso: string | null): void {
  if (String(version.status) !== 'CANDIDATE' || String(version.reviewStatus) !== 'UNREVIEWED') {
    throw new VersionStateConflict();
  }
  const existingIso = version.effectiveFrom ? new Date(version.effectiveFrom).toISOString() : null;
  if (existingIso !== effectiveFromIso) throw new VersionStateConflict();
}

async function duplicateOrConflict(
  prisma: Db,
  idempotencyKey: string,
  payloadDigest: string,
): Promise<LegalSourceObservationItemResult> {
  const existing = await prisma.legalSourceObservation.findUnique({ where: { idempotencyKey } });
  if (existing && existing.payloadDigest === payloadDigest) {
    return { idempotencyKey, status: OBSERVATION_RESULT_DUPLICATE, reason: null, warnings: [] };
  }
  if (existing) {
    return { idempotencyKey, status: OBSERVATION_RESULT_REJECTED, reason: 'IDEMPOTENCY_KEY_CONFLICT', warnings: [] };
  }
  return { idempotencyKey, status: OBSERVATION_RESULT_REJECTED, reason: 'PERSISTENCE_FAILED', warnings: [] };
}

async function ingestItem(prisma: Db, item: NormalizedObservation): Promise<LegalSourceObservationItemResult> {
  const existing = await prisma.legalSourceObservation.findUnique({ where: { idempotencyKey: item.idempotencyKey } });
  if (existing) return duplicateOrConflict(prisma, item.idempotencyKey, item.payloadDigest);

  const canonicalSourceKey = sourceKeyForCelex(item.sourceIdentifier);
  const source = await prisma.legalSource.findUnique({ where: { sourceKey: canonicalSourceKey }, select: { id: true } });
  if (!source) {
    return { idempotencyKey: item.idempotencyKey, status: OBSERVATION_RESULT_REJECTED, reason: 'LEGAL_SOURCE_NOT_FOUND', warnings: item.warnings };
  }

  try {
    await prisma.$transaction(async (tx) => {
      let legalSourceVersionId: string | null = null;
      let legalSourceCaptureId: string | null = null;

      if (item.kind === OBSERVATION_KIND_CONSOLIDATED_VERSION_AVAILABLE) {
        // legalVersionKey is DERIVED server-side from the relatedIdentifier; the
        // client-supplied payload has no versionKey to conflict with it.
        const version = await tx.legalSourceVersion.upsert({
          where: { legalSourceId_legalVersionKey: { legalSourceId: source.id, legalVersionKey: item.relatedIdentifier } },
          create: {
            legalSourceId: source.id,
            legalVersionKey: item.relatedIdentifier,
            status: 'CANDIDATE',
            reviewStatus: 'UNREVIEWED',
            effectiveFrom: item.effectiveFrom,
          },
          update: {},
        });
        assertVersionReusable(version, item.effectiveFromIso);
        legalSourceVersionId = version.id;

        const capture = await tx.legalSourceCapture.upsert({
          where: {
            legalSourceVersionId_sourceSha256: {
              legalSourceVersionId: version.id,
              sourceSha256: item.evidenceSha256,
            },
          },
          create: {
            legalSourceVersionId: version.id,
            sourceSha256: item.evidenceSha256,
            sourceUri: item.sourceUri,
            capturedAt: item.capturedAt,
            provenance: item.queryProvenance === null ? undefined : (item.queryProvenance as PrismaTypes.InputJsonValue),
          },
          update: {},
        });
        legalSourceCaptureId = capture.id;
      }

      await tx.legalSourceObservation.create({
        data: {
          schemaVersion: LEGAL_SOURCE_OBSERVATION_SCHEMA_VERSION,
          idempotencyKey: item.idempotencyKey,
          payloadDigest: item.payloadDigest,
          kind: item.kind as never,
          source: item.source,
          identifierFamily: item.identifierFamily,
          sourceIdentifier: item.sourceIdentifier,
          relatedIdentifier: item.relatedIdentifier,
          legalSourceId: source.id,
          effectiveFrom: item.effectiveFrom,
          sourceUri: item.sourceUri,
          evidenceSha256: item.evidenceSha256,
          capturedAt: item.capturedAt,
          queryProvenance: item.queryProvenance === null ? undefined : (item.queryProvenance as PrismaTypes.InputJsonValue),
          warnings: item.warnings.length ? (item.warnings as PrismaTypes.InputJsonValue) : undefined,
          legalSourceVersionId,
          legalSourceCaptureId,
        },
      });
    });
    return { idempotencyKey: item.idempotencyKey, status: OBSERVATION_RESULT_ACCEPTED, reason: null, warnings: item.warnings };
  } catch (error) {
    if (error instanceof VersionStateConflict) {
      return { idempotencyKey: item.idempotencyKey, status: OBSERVATION_RESULT_REJECTED, reason: 'VERSION_STATE_CONFLICT', warnings: item.warnings };
    }
    if (isUniqueViolation(error)) {
      // Unique-key race: re-read and apply the exact same comparison.
      return duplicateOrConflict(prisma, item.idempotencyKey, item.payloadDigest);
    }
    return { idempotencyKey: item.idempotencyKey, status: OBSERVATION_RESULT_REJECTED, reason: 'PERSISTENCE_FAILED', warnings: item.warnings };
  }
}

export interface IngestEnvelope {
  schemaVersion: number;
  observations: unknown[];
}

/** Envelope validation: only a structurally invalid batch is a 4xx. */
export function validateIngestEnvelope(body: unknown): IngestEnvelope {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new InteractionError(400, 'INVALID_ENVELOPE', 'A JSON object envelope is required.');
  }
  const record = body as Record<string, unknown>;
  if (Number(record.schemaVersion) !== LEGAL_SOURCE_OBSERVATION_SCHEMA_VERSION) {
    throw new InteractionError(400, 'UNSUPPORTED_SCHEMA_VERSION', `schemaVersion must be ${LEGAL_SOURCE_OBSERVATION_SCHEMA_VERSION}.`);
  }
  if (!Array.isArray(record.observations) || record.observations.length < 1 || record.observations.length > LEGAL_SOURCE_OBSERVATION_MAX_BATCH) {
    throw new InteractionError(400, 'INVALID_OBSERVATIONS', `observations must contain 1-${LEGAL_SOURCE_OBSERVATION_MAX_BATCH} items.`);
  }
  return { schemaVersion: LEGAL_SOURCE_OBSERVATION_SCHEMA_VERSION, observations: record.observations };
}

/**
 * Ingest a validated batch. A structurally valid batch always resolves to 200
 * with per-item outcomes; one rejected item never fails its siblings.
 */
export async function ingestLegalSourceObservations(
  body: unknown,
  prisma: Db = defaultPrisma,
): Promise<LegalSourceObservationIngestResponse> {
  const envelope = validateIngestEnvelope(body);
  const results: LegalSourceObservationItemResult[] = [];
  for (const raw of envelope.observations) {
    const normalized = normalizeObservationItem(raw);
    if (normalized.ok === false) {
      results.push({ idempotencyKey: normalized.warnedKey, status: OBSERVATION_RESULT_REJECTED, reason: normalized.reason, warnings: normalized.warnings });
      continue;
    }
    results.push(await ingestItem(prisma, normalized.item));
  }
  return { schemaVersion: LEGAL_SOURCE_OBSERVATION_SCHEMA_VERSION, results };
}
