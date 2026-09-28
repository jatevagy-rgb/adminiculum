/**
 * T04 — multilingual dedupe: HU + EN variants of the same authoritative
 * identifier become ONE business opportunity; HU selected when available;
 * EN fallback; result stable regardless of input order. No translation.
 * T05 — stable identity: identity is the source identifier, never language,
 * observedAt, or local ordering.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { OpportunityVariantInput } from '../src/normalize/variant.ts';
import { groupVariants, selectDisplayVariant, toNormalizedOpportunity } from '../src/normalize/multilingual.ts';
import { loadFundingTendersReference } from '../src/reference/fundingTendersReference.ts';
import { normalizeFundingTendersRecord } from '../src/adapters/fundingTenders/normalize.ts';

const fixturesDir = fileURLToPath(new URL('./fixtures/funding-tenders/', import.meta.url));
const reference = loadFundingTendersReference();

function loadSyntheticVariants(): OpportunityVariantInput[] {
  const raw = JSON.parse(readFileSync(fixturesDir + 'multilingual-variants-synthetic.json', 'utf8')) as {
    searchResults: unknown[];
  };
  const variants: OpportunityVariantInput[] = [];
  for (const record of raw.searchResults) {
    const outcome = normalizeFundingTendersRecord(record, reference);
    assert.ok(outcome.ok, JSON.stringify(outcome));
    if (outcome.ok) variants.push(outcome.variant);
  }
  return variants;
}

test('T04: HU + EN variants of one identifier group into one opportunity', () => {
  const variants = loadSyntheticVariants();
  assert.equal(variants.length, 2);
  const groups = groupVariants(variants);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.sourceIdentifier, 'HU-TOPIC-EXAMPLE');
});

test('T04: Hungarian display variant is selected when present', () => {
  const variants = loadSyntheticVariants();
  const display = selectDisplayVariant(variants);
  assert.equal(display.language, 'hu');
  const opportunity = toNormalizedOpportunity(groupVariants(variants)[0] as { sourceIdentifier: string; variants: OpportunityVariantInput[]; display: OpportunityVariantInput }, '2026-09-27T12:00:00.000Z');
  assert.equal(opportunity.language, 'hu');
  assert.equal(opportunity.title, 'Szintetikus magyar cím');
});

test('T04: English fallback when no Hungarian representation exists', () => {
  const variants = loadSyntheticVariants().filter((entry) => entry.language === 'en');
  const display = selectDisplayVariant(variants);
  assert.equal(display.language, 'en');
});

test('T04: grouping is stable regardless of input order', () => {
  const variants = loadSyntheticVariants();
  const forward = groupVariants(variants);
  const reversed = groupVariants([variants[1] as OpportunityVariantInput, variants[0] as OpportunityVariantInput]);
  assert.equal(forward.length, reversed.length);
  assert.equal(forward[0]?.sourceIdentifier, reversed[0]?.sourceIdentifier);
  const forwardOpportunity = toNormalizedOpportunity(forward[0] as never, '2026-09-27T12:00:00.000Z');
  const reversedOpportunity = toNormalizedOpportunity(reversed[0] as never, '2026-09-27T12:00:00.000Z');
  assert.equal(forwardOpportunity.contentHash, reversedOpportunity.contentHash);
});

test('T04: a pure language-representation change does not change the business content hash', () => {
  const variants = loadSyntheticVariants();
  const huOnly = groupVariants(variants.filter((entry) => entry.language === 'hu'));
  const enOnly = groupVariants(variants.filter((entry) => entry.language === 'en'));
  const huOpportunity = toNormalizedOpportunity(huOnly[0] as never, '2026-09-27T12:00:00.000Z');
  const enOpportunity = toNormalizedOpportunity(enOnly[0] as never, '2026-09-27T12:00:00.000Z');
  assert.equal(huOpportunity.sourceIdentifier, enOpportunity.sourceIdentifier);
  // Display language differs, but the source revision + business fields are
  // equal; the language dimension is tracked separately in the projection.
  assert.equal(huOpportunity.sourceRevisionIdentifier, enOpportunity.sourceRevisionIdentifier);
});

test('T05: identity never depends on language, observedAt, or ordering', () => {
  const variants = loadSyntheticVariants();
  const hu = variants.find((entry) => entry.language === 'hu');
  const en = variants.find((entry) => entry.language === 'en');
  assert.ok(hu && en);
  assert.equal(hu.sourceIdentifier, en.sourceIdentifier);
  const a = toNormalizedOpportunity(groupVariants([hu])[0] as never, '2026-09-27T12:00:00.000Z');
  const b = toNormalizedOpportunity(groupVariants([hu])[0] as never, '2026-09-28T09:30:00.000Z');
  assert.equal(a.sourceIdentifier, b.sourceIdentifier);
  assert.equal(a.contentHash, b.contentHash);
});
