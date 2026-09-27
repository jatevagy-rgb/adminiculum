/**
 * GWO-3A — backend boundary for the normalized external opportunity contract.
 *
 * Mirrors the accepted NormalizedExternalOpportunity schemaVersion 1 shape
 * (GWO-1 watcher) WITHOUT importing any watcher runtime code — the watcher
 * remains runtime-isolated. Everything here fails closed:
 *   - unknown schemaVersion  -> rejected;
 *   - source not in the fail-closed GWO-3A registry -> rejected;
 *   - unbounded / secret-shaped / prototype-polluting source metadata -> rejected.
 *
 * Identity: businessKey = sourceIdentifier; scopeKey = callIdentifier ??
 * sourceIdentifier (explicit helper; never title-derived). The idempotency key
 * is deterministic and bounded to the existing Observation column limit; an
 * over-long composition falls back to a deterministic SHA-256 representation,
 * never unsafe truncation.
 */
import { createHash } from 'node:crypto';
import { InteractionError } from '../../client-interaction/base';
import { validateNoSecrets } from './service';

export const GWO_SCHEMA_VERSION = 1 as const;

/** Fail-closed registry. Presence in a TypeScript union is not authorization. */
export const ACCEPTED_GWO_SOURCES = ['EU_FUNDING_TENDERS'] as const;
export type AcceptedGwoSource = (typeof ACCEPTED_GWO_SOURCES)[number];

export const GWO_OPPORTUNITY_KINDS = ['FUNDING', 'PROCUREMENT'] as const;

export const GWO_SOURCE_STATUSES = [
  'NOT_ANNOUNCED',
  'FORTHCOMING',
  'OPEN',
  'CLOSED',
  'AWARDED',
  'CANCELLED',
  'UNKNOWN',
] as const;

export const GWO_MAX_BATCH_RECORDS = 50;
export const GWO_MAX_METADATA_DEPTH = 4;
export const GWO_MAX_METADATA_KEYS = 64;
export const GWO_MAX_METADATA_BYTES = 8192;
export const GWO_IDEMPOTENCY_KEY_LIMIT = 255;

/** The validated schemaVersion 1 record shape consumed from the watcher. */
export interface GwoOpportunityRecord {
  schemaVersion: number;
  source: string;
  sourceIdentifier: string;
  sourceRevisionIdentifier: string | null;
  kind: string;
  title: string;
  status: string;
  sourceUrl: string;
  observedAt: string;
  contentHash: string;
  summary: string | null;
  programme: string | null;
  callIdentifier: string | null;
  authorityName: string | null;
  buyerName: string | null;
  publicationAt: string | null;
  openingAt: string | null;
  deadlineAt: string | null;
  language: string | null;
  cpvCodes: string[];
  activityCodes: string[];
  sectorHints: string[];
  eligibleCountries: string[];
  nutsCodes: string[];
  placeOfPerformance: string | null;
  estimatedValueMin: number | null;
  estimatedValueMax: number | null;
  fundingAmountMin: number | null;
  fundingAmountMax: number | null;
  currency: string | null;
  cofinancingRate: number | null;
  eligibilityText: string | null;
  sourceSpecificMetadata: Record<string, unknown>;
}

export interface GwoValidationIssue {
  recordIndex: number | null;
  code: string;
  message: string;
}

export interface GwoImportPayload {
  sourceType: string;
  records: GwoOpportunityRecord[];
}

const HEX64 = /^[0-9a-f]{64}$/;
const SENTINELS = new Set(['null', 'undefined', 'nan', 'n/a', 'none']);
const FORBIDDEN_METADATA_KEY_PATTERN = /secret|token|password|credential|apikey|api_key|privatekey|authorization|cookie|bearer/i;
const PROTOTYPE_POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOptionalString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isIsoTimestamp(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return true;
  return !Number.isNaN(Date.parse(value));
}

/**
 * Conservative bounds for bounded source metadata: object only, bounded
 * nesting depth, bounded total key count, bounded serialized size, secret/
 * credential-shaped keys rejected, prototype-pollution keys rejected.
 * Secret detection reuses the Observatory ingestion helper.
 */
export function validateBoundedSourceMetadata(value: unknown): string[] {
  const issues: string[] = [];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return ['SOURCE_METADATA_NOT_AN_OBJECT'];
  }
  let keyCount = 0;
  const walk = (entry: unknown, depth: number, path: string): void => {
    if (entry === null || typeof entry !== 'object') return;
    if (depth > GWO_MAX_METADATA_DEPTH) {
      issues.push('SOURCE_METADATA_TOO_DEEP');
      return;
    }
    if (Array.isArray(entry)) {
      if (entry.length > GWO_MAX_METADATA_KEYS) issues.push('SOURCE_METADATA_ARRAY_TOO_LONG');
      for (const item of entry) walk(item, depth + 1, path);
      return;
    }
    for (const [key, child] of Object.entries(entry as Record<string, unknown>)) {
      keyCount += 1;
      if (PROTOTYPE_POLLUTION_KEYS.has(key)) {
        issues.push(`SOURCE_METADATA_PROTOTYPE_KEY:${path}${key}`);
      }
      if (FORBIDDEN_METADATA_KEY_PATTERN.test(key)) {
        issues.push(`SOURCE_METADATA_SECRET_KEY:${path}${key}`);
      }
      walk(child, depth + 1, `${path}${key}.`);
    }
  };
  walk(value, 1, '');
  if (keyCount > GWO_MAX_METADATA_KEYS) issues.push('SOURCE_METADATA_TOO_MANY_KEYS');
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    issues.push('SOURCE_METADATA_NOT_SERIALIZABLE');
    return issues;
  }
  if (serialized.length > GWO_MAX_METADATA_BYTES) issues.push('SOURCE_METADATA_TOO_LARGE');
  try {
    validateNoSecrets(value);
  } catch {
    issues.push('SOURCE_METADATA_SECRET_KEY');
  }
  return issues;
}

/** Validates one schemaVersion 1 record against the boundary contract. */
export function validateGwoOpportunityRecord(raw: unknown, expectedSource: string): GwoValidationIssue[] {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return [{ recordIndex: null, code: 'GWO_RECORD_NOT_AN_OBJECT', message: 'Record must be an object.' }];
  }
  const row = raw as Record<string, unknown>;
  const issues: GwoValidationIssue[] = [];
  const add = (code: string, message: string): void => {
    issues.push({ recordIndex: null, code, message });
  };

  if (row.schemaVersion !== GWO_SCHEMA_VERSION) {
    add('GWO_SCHEMA_VERSION_UNSUPPORTED', `schemaVersion must be exactly ${GWO_SCHEMA_VERSION}; unknown versions fail closed.`);
  }
  if (row.source !== expectedSource || !(ACCEPTED_GWO_SOURCES as readonly string[]).includes(String(row.source))) {
    add('GWO_SOURCE_NOT_ACCEPTED', 'Record source does not match the accepted GWO-3A source registry.');
  }
  if (!isNonEmptyString(row.sourceIdentifier)) add('GWO_SOURCE_IDENTIFIER_MISSING', 'sourceIdentifier is required.');
  if (!isOptionalString(row.sourceRevisionIdentifier)) add('GWO_SOURCE_REVISION_INVALID', 'sourceRevisionIdentifier must be string or null.');
  if (!(GWO_OPPORTUNITY_KINDS as readonly string[]).includes(String(row.kind))) add('GWO_KIND_INVALID', 'kind is not supported.');
  if (!isNonEmptyString(row.title)) add('GWO_TITLE_MISSING', 'title is required.');
  if (!(GWO_SOURCE_STATUSES as readonly string[]).includes(String(row.status))) add('GWO_STATUS_INVALID', 'status is not a canonical source status.');
  if (!isNonEmptyString(row.sourceUrl)) add('GWO_SOURCE_URL_MISSING', 'sourceUrl is required.');
  if (!isIsoTimestamp(row.observedAt)) add('GWO_OBSERVED_AT_INVALID', 'observedAt must be an ISO timestamp.');
  if (typeof row.contentHash !== 'string' || !HEX64.test(row.contentHash)) add('GWO_CONTENT_HASH_INVALID', 'contentHash must be a 64-char lowercase hex digest.');

  for (const key of ['summary', 'programme', 'callIdentifier', 'authorityName', 'buyerName', 'publicationAt', 'openingAt', 'deadlineAt', 'language', 'placeOfPerformance', 'currency', 'eligibilityText']) {
    if (!isOptionalString(row[key])) add('GWO_OPTIONAL_STRING_INVALID', `${key} must be string or null.`);
  }
  for (const key of ['cpvCodes', 'activityCodes', 'sectorHints', 'eligibleCountries', 'nutsCodes']) {
    if (!isStringArray(row[key])) add('GWO_STRING_ARRAY_INVALID', `${key} must be an array of strings.`);
  }
  for (const key of ['estimatedValueMin', 'estimatedValueMax', 'fundingAmountMin', 'fundingAmountMax', 'cofinancingRate']) {
    if (!isOptionalFiniteNumber(row[key])) add('GWO_NUMBER_INVALID', `${key} must be a finite number or null.`);
  }
  for (const metadataIssue of validateBoundedSourceMetadata(row.sourceSpecificMetadata)) {
    add(metadataIssue, 'sourceSpecificMetadata failed the bounded metadata safety rules.');
  }
  for (const [key, entry] of Object.entries(row)) {
    if (typeof entry === 'string' && SENTINELS.has(entry.trim().toLowerCase()) && key !== 'summary') {
      add('GWO_SENTINEL_VALUE', `${key} contains a sentinel placeholder value.`);
    }
  }
  return issues;
}

/**
 * Full request validation. A structurally invalid batch MUST be rejected here,
 * before any write. Returns the validated payload or throws (400, zero writes).
 */
export function validateGwoImportPayload(payload: unknown): GwoImportPayload {
  const issues: GwoValidationIssue[] = [];
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new InteractionError(400, 'GWO_IMPORT_INVALID', 'Import payload must be an object.');
  }
  const row = payload as Record<string, unknown>;
  const sourceType = typeof row.sourceType === 'string' ? row.sourceType : '';
  if (!(ACCEPTED_GWO_SOURCES as readonly string[]).includes(sourceType)) {
    issues.push({ recordIndex: null, code: 'GWO_SOURCE_NOT_ACCEPTED', message: 'sourceType is not enabled for GWO-3A.' });
  }
  const records = Array.isArray(row.records) ? row.records : null;
  if (!records) {
    throw new InteractionError(400, 'GWO_IMPORT_INVALID', 'records must be an array.');
  }
  if (records.length === 0 || records.length > GWO_MAX_BATCH_RECORDS) {
    issues.push({ recordIndex: null, code: 'GWO_BATCH_SIZE_INVALID', message: `records must contain 1..${GWO_MAX_BATCH_RECORDS} entries.` });
  }
  const validated: GwoOpportunityRecord[] = [];
  records.forEach((record, index) => {
    const recordIssues = validateGwoOpportunityRecord(record, sourceType);
    if (recordIssues.length === 0) {
      validated.push(record as GwoOpportunityRecord);
    } else {
      for (const issue of recordIssues.slice(0, 4)) {
        issues.push({ recordIndex: index, code: issue.code, message: issue.message });
      }
    }
  });
  if (issues.length > 0) {
    const summary = issues.slice(0, 5).map((issue) => `${issue.recordIndex === null ? 'request' : `record[${issue.recordIndex}]`}:${issue.code}`).join(', ');
    throw new InteractionError(400, 'GWO_IMPORT_INVALID', `Import rejected with zero writes (${issues.length} issue(s)): ${summary}`);
  }
  return { sourceType, records: validated };
}

/** businessKey — the stable per-source business identity. */
export function deriveBusinessKey(record: GwoOpportunityRecord): string {
  return record.sourceIdentifier;
}

/** scopeKey — explicit actionable scope; F&T uses callIdentifier ?? sourceIdentifier. */
export function deriveScopeKey(record: GwoOpportunityRecord): string {
  const call = record.callIdentifier;
  return call !== null && call.trim().length > 0 ? call : record.sourceIdentifier;
}

/**
 * Deterministic idempotency key bounded to the Observation column limit.
 * Never truncates: over-long compositions use a deterministic SHA-256 form.
 */
export function deriveGwoIdempotencyKey(sourceType: string, record: GwoOpportunityRecord): string {
  const full = `gw:${sourceType}:${record.sourceIdentifier}:${record.sourceRevisionIdentifier ?? record.contentHash}`;
  if (full.length <= GWO_IDEMPOTENCY_KEY_LIMIT) return full;
  const digest = createHash('sha256').update(full).digest('hex');
  return `gw:${sourceType}:sha256:${digest}`;
}

/**
 * Source revision ordering states. Observation/arrival time is NEVER ordering;
 * checksums are NEVER lexically compared; DB insertion order is never used.
 *
 * The accepted watcher contract carries:
 * - revision identity (esST_checksum) — change/identity signal only;
 * - `sourceSpecificMetadata.fundingTenders.sourceOrderSignalStatus`
 *   (AUTHORITATIVE_TIMESTAMP | AUTHORITATIVE_NO_HISTORY) and, for the
 *   timestamp state, `sourceLastChangeAt` from the official topicDetails
 *   latestInfos[].lastChangeDate history;
 * - legacy/static records (revisionSource 'lastChangeDate' with the ISO
 *   timestamp as the revision identifier) remain compatible.
 *
 * Missing/malformed/mismatched/unknown evidence degrades to UNPROVEN.
 */
export type GwoRevisionOrdering =
  | { kind: 'authoritative_no_history' }
  | { kind: 'authoritative_timestamp'; valueMs: number }
  | { kind: 'unproven' };

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/;

function parseIsoTimestampMs(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  // Date.parse is lenient about legacy formats ("REV-1" parses!); require an
  // ISO date prefix before trusting the parsed value.
  if (!ISO_TIMESTAMP.test(trimmed)) return null;
  const valueMs = Date.parse(trimmed);
  return Number.isNaN(valueMs) ? null : valueMs;
}

export function classifyRevisionOrdering(record: GwoOpportunityRecord): GwoRevisionOrdering {
  const metadata = record.sourceSpecificMetadata;
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { kind: 'unproven' };
  }
  const namespace = (metadata as Record<string, unknown>)['fundingTenders'];
  if (namespace === null || typeof namespace !== 'object' || Array.isArray(namespace)) {
    return { kind: 'unproven' };
  }
  const ns = namespace as Record<string, unknown>;

  // Primary (GWO-1G) contract: explicit order-signal status.
  const status = ns['sourceOrderSignalStatus'];
  if (status === 'AUTHORITATIVE_TIMESTAMP') {
    const valueMs = parseIsoTimestampMs(ns['sourceLastChangeAt']);
    return valueMs === null ? { kind: 'unproven' } : { kind: 'authoritative_timestamp', valueMs };
  }
  if (status === 'AUTHORITATIVE_NO_HISTORY') {
    const raw = ns['sourceLastChangeAt'];
    if (raw !== null && raw !== undefined) return { kind: 'unproven' };
    return { kind: 'authoritative_no_history' };
  }
  if (status !== undefined && status !== null) {
    return { kind: 'unproven' };
  }

  // Legacy/static compatibility: revisionSource 'lastChangeDate' with the
  // authoritative timestamp as the revision identifier itself. Records stored
  // before the explicit status field existed still classify here.
  if (ns['revisionSource'] === 'lastChangeDate') {
    const valueMs = parseIsoTimestampMs(record.sourceRevisionIdentifier);
    return valueMs === null ? { kind: 'unproven' } : { kind: 'authoritative_timestamp', valueMs };
  }
  return { kind: 'unproven' };
}

