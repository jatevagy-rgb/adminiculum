/**
 * T01 — normalized DTO validation.
 * Valid funding record accepted; schemaVersion enforced; invalid source
 * identity rejected / fails closed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { NormalizedExternalOpportunity } from '../src/types.ts';
import { OPPORTUNITY_SCHEMA_VERSION, validateNormalizedOpportunity } from '../src/types.ts';
import { groupVariants, toNormalizedOpportunity } from '../src/normalize/multilingual.ts';
import { loadFundingTendersReference } from '../src/reference/fundingTendersReference.ts';
import { normalizeFundingTendersRecord } from '../src/adapters/fundingTenders/normalize.ts';

const fixturePath = fileURLToPath(new URL('./fixtures/funding-tenders/topic-agrip-multi-2021-im.json', import.meta.url));

function buildFixtureOpportunity(observedAt = '2026-09-27T12:00:00.000Z'): NormalizedExternalOpportunity {
  const raw = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown;
  const reference = loadFundingTendersReference();
  const outcome = normalizeFundingTendersRecord(raw, reference);
  assert.ok(outcome.ok, 'fixture record must normalize');
  const group = groupVariants([outcome.variant])[0];
  assert.ok(group, 'single group expected');
  return toNormalizedOpportunity(group, observedAt);
}

test('T01: valid funding record is accepted by the DTO validator', () => {
  const opportunity = buildFixtureOpportunity();
  const result = validateNormalizedOpportunity(opportunity);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(opportunity.schemaVersion, OPPORTUNITY_SCHEMA_VERSION);
  assert.equal(opportunity.source, 'EU_FUNDING_TENDERS');
  assert.equal(opportunity.sourceIdentifier, 'AGRIP-MULTI-2021-IM');
  assert.equal(opportunity.kind, 'FUNDING');
});

test('T01: schemaVersion is enforced', () => {
  const opportunity = buildFixtureOpportunity();
  const wrong = { ...opportunity, schemaVersion: 99 };
  const result = validateNormalizedOpportunity(wrong);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('SCHEMA_VERSION_INVALID'));
});

test('T01: missing/invalid source identity fails closed', () => {
  const opportunity = buildFixtureOpportunity();
  for (const sourceIdentifier of ['', '   ', null]) {
    const broken = { ...opportunity, sourceIdentifier };
    const result = validateNormalizedOpportunity(broken);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes('SOURCE_IDENTIFIER_MISSING'), JSON.stringify(result.errors));
  }
});

test('T01: invalid contentHash and non-ISO observedAt fail closed', () => {
  const opportunity = buildFixtureOpportunity();
  const badHash = { ...opportunity, contentHash: 'not-hex' };
  assert.equal(validateNormalizedOpportunity(badHash).ok, false);
  const badObserved = { ...opportunity, observedAt: 'yesterday' };
  assert.equal(validateNormalizedOpportunity(badObserved).ok, false);
});

test('T01: non-object input fails closed', () => {
  for (const value of [null, 42, 'x', []]) {
    const result = validateNormalizedOpportunity(value);
    assert.equal(result.ok, false);
  }
});
