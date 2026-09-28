/**
 * GWO-1 — deterministic multilingual grouping.
 *
 * One business opportunity must not become N opportunities. Variants sharing
 * the same sourceIdentifier are one group; the display variant is:
 *   1. Hungarian when an actual HU representation exists;
 *   2. otherwise English when an actual EN representation exists;
 *   3. otherwise deterministic lexical ordering (language, then title).
 *
 * No machine translation, no synthesized Hungarian content. Language is never
 * business identity: the sourceIdentifier carries identity; the display
 * language and per-language variant hashes ride along in the content
 * projection, so a pure language-representation change stays UNCHANGED.
 */

import type { OpportunityVariantInput } from './variant.ts';
import type { NormalizedExternalOpportunity } from '../types.ts';
import { OPPORTUNITY_SCHEMA_VERSION } from '../types.ts';
import { compareCodePoints } from '../hash/contentHash.ts';
import { contentProjection, hashCanonical, variantHash } from '../hash/contentHash.ts';

export interface GroupedVariant {
  sourceIdentifier: string;
  variants: OpportunityVariantInput[];
  display: OpportunityVariantInput;
}

function baseLanguage(language: string | null): string {
  if (language === null) return '';
  return language.trim().toLowerCase().split('-')[0] ?? '';
}

function isDisplayPreferred(language: string | null): 'HU' | 'EN' | null {
  const base = baseLanguage(language);
  if (base === 'hu') return 'HU';
  if (base === 'en') return 'EN';
  return null;
}

function compareVariants(a: OpportunityVariantInput, b: OpportunityVariantInput): number {
  const byLanguage = compareCodePoints(baseLanguage(a.language), baseLanguage(b.language));
  if (byLanguage !== 0) return byLanguage;
  return compareCodePoints(a.title, b.title);
}

export function selectDisplayVariant(variants: OpportunityVariantInput[]): OpportunityVariantInput {
  const sorted = [...variants].sort(compareVariants);
  const hu = sorted.find((entry) => isDisplayPreferred(entry.language) === 'HU');
  if (hu) return hu;
  const en = sorted.find((entry) => isDisplayPreferred(entry.language) === 'EN');
  if (en) return en;
  return sorted[0] ?? variants[0];
}

/** Groups variants by business identity; display selection is deterministic. */
export function groupVariants(variants: readonly OpportunityVariantInput[]): GroupedVariant[] {
  const groups = new Map<string, OpportunityVariantInput[]>();
  for (const variant of variants) {
    const existing = groups.get(variant.sourceIdentifier) ?? [];
    existing.push(variant);
    groups.set(variant.sourceIdentifier, existing);
  }
  const grouped: GroupedVariant[] = [];
  for (const [sourceIdentifier, members] of groups) {
    const display = selectDisplayVariant(members);
    grouped.push({ sourceIdentifier, variants: members, display });
  }
  grouped.sort((a, b) => compareCodePoints(a.sourceIdentifier, b.sourceIdentifier));
  return grouped;
}

/**
 * Builds the normalized DTO for one business group. The content hash covers
 * the language-independent business projection, the display language, the
 * revision signal and every per-language variant hash; observedAt is excluded.
 */
export function toNormalizedOpportunity(group: GroupedVariant, observedAt: string): NormalizedExternalOpportunity {
  const display = group.display;
  const language = baseLanguage(display.language) || null;
  const revision = display.sourceRevisionIdentifier;
  const variantEntries = group.variants.map((entry) => ({
    language: baseLanguage(entry.language) || 'und',
    hash: variantHash({
      title: entry.title,
      summary: entry.summary,
      eligibilityText: entry.eligibilityText,
      revision: entry.sourceRevisionIdentifier,
    }),
  }));
  const opportunity: NormalizedExternalOpportunity = {
    schemaVersion: OPPORTUNITY_SCHEMA_VERSION,
    source: display.source,
    sourceIdentifier: display.sourceIdentifier,
    sourceRevisionIdentifier: display.sourceRevisionIdentifier,
    kind: display.kind,
    title: display.title,
    status: display.status,
    sourceUrl: display.sourceUrl,
    observedAt,
    contentHash: '',
    summary: display.summary,
    programme: display.programme,
    callIdentifier: display.callIdentifier,
    authorityName: display.authorityName,
    buyerName: display.buyerName,
    publicationAt: display.publicationAt,
    openingAt: display.openingAt,
    deadlineAt: display.deadlineAt,
    language,
    cpvCodes: [...display.cpvCodes],
    activityCodes: [...display.activityCodes],
    sectorHints: [...display.sectorHints],
    eligibleCountries: [...display.eligibleCountries],
    nutsCodes: [...display.nutsCodes],
    placeOfPerformance: display.placeOfPerformance,
    estimatedValueMin: display.estimatedValueMin,
    estimatedValueMax: display.estimatedValueMax,
    fundingAmountMin: display.fundingAmountMin,
    fundingAmountMax: display.fundingAmountMax,
    currency: display.currency,
    cofinancingRate: display.cofinancingRate,
    eligibilityText: display.eligibilityText,
    sourceSpecificMetadata: display.sourceSpecificMetadata,
  };
  const projection = contentProjection(opportunity, language, revision, variantEntries);
  opportunity.contentHash = hashCanonical(projection);
  return opportunity;
}
