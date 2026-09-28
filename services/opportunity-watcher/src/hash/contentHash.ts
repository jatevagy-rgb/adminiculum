/**
 * GWO-1 — deterministic content hashing.
 *
 * contentHash projection (documented contract):
 * - business projection: source, sourceIdentifier, kind, status, sourceUrl,
 *   programme, callIdentifier, authority/buyer, publication/opening/deadline,
 *   classification/location/financial fields, sorted business metadata subset;
 * - display language and canonical revision signal;
 * - per-language variant hashes (title/summary/eligibilityText/revision).
 *
 * EXCLUDED from hashing: observedAt, fetch/report timestamps, local paths,
 * array ordering without source semantics (known list fields are sorted).
 *
 * The same meaningful source state fetched twice always produces the same
 * contentHash. A pure language-representation change does not alter the
 * business projection and is classified as UNCHANGED by the diff layer.
 */

import { createHash } from 'node:crypto';
import type { NormalizedExternalOpportunity } from '../types.ts';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Deterministic, order-independent normalization of semantically unordered lists. */
export function sortStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((entry) => entry.trim()).filter((entry) => entry.length > 0))].sort(compareCodePoints);
}

/** Stable codepoint comparison (locale-independent). */
export function compareCodePoints(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Canonical JSON: object keys sorted recursively; arrays preserved in order. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== undefined);
    entries.sort(([a], [b]) => compareCodePoints(a, b));
    const sorted: Record<string, unknown> = {};
    for (const [key, entry] of entries) sorted[key] = sortValue(entry);
    return sorted;
  }
  return value;
}

export function hashCanonical(value: unknown): string {
  return sha256Hex(canonicalize(value));
}

export interface VariantText {
  title: string;
  summary: string | null;
  eligibilityText: string | null;
  revision: string | null;
}

export function variantHash(input: VariantText): string {
  return hashCanonical({
    title: input.title,
    summary: input.summary,
    eligibilityText: input.eligibilityText,
    revision: input.revision,
  });
}

const BUSINESS_METADATA_KEYS = ['datasource', 'frameworkProgrammeCode', 'programmeDivisionCode', 'rawStatusCodes'] as const;

function businessMetadata(opportunity: NormalizedExternalOpportunity): Record<string, unknown> {
  const container = opportunity.sourceSpecificMetadata['fundingTenders'];
  const out: Record<string, unknown> = {};
  if (container !== null && typeof container === 'object' && !Array.isArray(container)) {
    const meta = container as Record<string, unknown>;
    for (const key of BUSINESS_METADATA_KEYS) {
      if (meta[key] !== undefined) out[key] = meta[key];
    }
  }
  return out;
}

/** Variant-independent business fields. Excludes language-dependent text. */
export function businessProjection(opportunity: NormalizedExternalOpportunity): Record<string, unknown> {
  return {
    source: opportunity.source,
    sourceIdentifier: opportunity.sourceIdentifier,
    kind: opportunity.kind,
    status: opportunity.status,
    sourceUrl: opportunity.sourceUrl,
    programme: opportunity.programme,
    callIdentifier: opportunity.callIdentifier,
    authorityName: opportunity.authorityName,
    buyerName: opportunity.buyerName,
    publicationAt: opportunity.publicationAt,
    openingAt: opportunity.openingAt,
    deadlineAt: opportunity.deadlineAt,
    cpvCodes: sortStrings(opportunity.cpvCodes),
    activityCodes: sortStrings(opportunity.activityCodes),
    sectorHints: sortStrings(opportunity.sectorHints),
    eligibleCountries: sortStrings(opportunity.eligibleCountries),
    nutsCodes: sortStrings(opportunity.nutsCodes),
    placeOfPerformance: opportunity.placeOfPerformance,
    estimatedValueMin: opportunity.estimatedValueMin,
    estimatedValueMax: opportunity.estimatedValueMax,
    fundingAmountMin: opportunity.fundingAmountMin,
    fundingAmountMax: opportunity.fundingAmountMax,
    currency: opportunity.currency,
    cofinancingRate: opportunity.cofinancingRate,
    sourceMetadata: businessMetadata(opportunity),
  };
}

export interface VariantHashEntry {
  language: string;
  hash: string;
}

export function contentProjection(
  opportunity: NormalizedExternalOpportunity,
  language: string | null,
  revision: string | null,
  variants: readonly VariantHashEntry[],
): Record<string, unknown> {
  const sortedVariants = [...variants].sort((a, b) => compareCodePoints(a.language, b.language));
  return {
    business: businessProjection(opportunity),
    language,
    revision,
    variants: sortedVariants,
  };
}
