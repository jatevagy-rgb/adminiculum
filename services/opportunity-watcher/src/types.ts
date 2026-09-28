/**
 * GWO-1 — normalized external opportunity contract (design baseline: GWO-0).
 *
 * This module is pure data + validation. It has no Adminiculum imports and no
 * dependency on any database or tenant model. Nothing in this service may ever
 * carry client/case/document/workspace/person identifiers.
 */

export const OPPORTUNITY_SCHEMA_VERSION = 1 as const;

export type OpportunityKind = 'FUNDING' | 'PROCUREMENT';

export const OPPORTUNITY_SOURCES = ['EU_FUNDING_TENDERS', 'TED', 'EKR', 'PALYAZAT_GOV'] as const;
export type OpportunitySource = (typeof OPPORTUNITY_SOURCES)[number];

export const SOURCE_STATUSES = [
  'NOT_ANNOUNCED',
  'FORTHCOMING',
  'OPEN',
  'CLOSED',
  'AWARDED',
  'CANCELLED',
  'UNKNOWN',
] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

/**
 * Source-independent normalized opportunity. GWO-1 emits only
 * `source = EU_FUNDING_TENDERS`; the remaining sources are declared so the
 * contract does not need a breaking change later (GWO-2+).
 *
 * Unknown values are null / empty — never invented defaults.
 * `eligibilityText` is verbatim source text, never an eligibility conclusion.
 */
export interface NormalizedExternalOpportunity {
  schemaVersion: typeof OPPORTUNITY_SCHEMA_VERSION;
  source: OpportunitySource;
  /** Stable per-source business identity (grouping key across languages). */
  sourceIdentifier: string;
  /** Checksum / version when the source exposes one; null otherwise. */
  sourceRevisionIdentifier: string | null;
  kind: OpportunityKind;
  title: string;
  status: SourceStatus;
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
  /** Bounded, namespaced source-specific metadata. Never a raw API dump. */
  sourceSpecificMetadata: Record<string, unknown>;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const HEX64 = /^[0-9a-f]{64}$/;
const SENTINELS = new Set(['null', 'undefined', 'nan', 'n/a', 'none']);

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
 * Conservative validation. Used by tests, fixture replay and any future
 * ingestion boundary. It fails closed: an opportunity without a stable source
 * identity or a non-empty title is rejected.
 */
export function validateNormalizedOpportunity(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, errors: ['NOT_AN_OBJECT'] };
  }
  const row = value as Record<string, unknown>;

  if (row.schemaVersion !== OPPORTUNITY_SCHEMA_VERSION) errors.push('SCHEMA_VERSION_INVALID');
  if (!OPPORTUNITY_SOURCES.includes(row.source as OpportunitySource)) errors.push('SOURCE_INVALID');
  if (!isNonEmptyString(row.sourceIdentifier)) errors.push('SOURCE_IDENTIFIER_MISSING');
  if (!isOptionalString(row.sourceRevisionIdentifier)) errors.push('SOURCE_REVISION_INVALID');
  if (row.kind !== 'FUNDING' && row.kind !== 'PROCUREMENT') errors.push('KIND_INVALID');
  if (!isNonEmptyString(row.title)) errors.push('TITLE_MISSING');
  if (!SOURCE_STATUSES.includes(row.status as SourceStatus)) errors.push('STATUS_INVALID');
  if (!isNonEmptyString(row.sourceUrl)) errors.push('SOURCE_URL_MISSING');
  if (!isIsoTimestamp(row.observedAt)) errors.push('OBSERVED_AT_INVALID');
  if (typeof row.contentHash !== 'string' || !HEX64.test(row.contentHash)) errors.push('CONTENT_HASH_INVALID');

  for (const key of ['summary', 'programme', 'callIdentifier', 'authorityName', 'buyerName', 'publicationAt', 'openingAt', 'deadlineAt', 'language', 'placeOfPerformance', 'currency', 'eligibilityText']) {
    if (!isOptionalString(row[key])) errors.push(`${key.toUpperCase()}_INVALID`);
  }
  for (const key of ['cpvCodes', 'activityCodes', 'sectorHints', 'eligibleCountries', 'nutsCodes']) {
    if (!isStringArray(row[key])) errors.push(`${key.toUpperCase()}_INVALID`);
  }
  for (const key of ['estimatedValueMin', 'estimatedValueMax', 'fundingAmountMin', 'fundingAmountMax', 'cofinancingRate']) {
    if (!isOptionalFiniteNumber(row[key])) errors.push(`${key.toUpperCase()}_INVALID`);
  }
  if (typeof row.sourceSpecificMetadata !== 'object' || row.sourceSpecificMetadata === null || Array.isArray(row.sourceSpecificMetadata)) {
    errors.push('SOURCE_SPECIFIC_METADATA_INVALID');
  }

  // The sentinel guard is defense in depth against later ingestion code that
  // might stringify missing values; the normalizer never produces these.
  for (const [key, entry] of Object.entries(row)) {
    if (typeof entry === 'string' && SENTINELS.has(entry.trim().toLowerCase()) && key !== 'summary') {
      errors.push(`SENTINEL_VALUE:${key}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
