/**
 * T06 — content hash stability: same normalized content with different
 * observedAt / fetch timestamps yields the identical hash; unordered arrays
 * are normalized before hashing.
 * T07 — NEW: empty capture state + item -> NEW.
 * T08 — UNCHANGED: same state observed twice -> UNCHANGED.
 * T09 — UPDATED: material deadline / status / budget / eligibility change
 * -> UPDATED; a pure language-representation change -> UNCHANGED.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { NormalizedExternalOpportunity } from '../src/types.ts';
import { groupVariants, toNormalizedOpportunity } from '../src/normalize/multilingual.ts';
import { loadFundingTendersReference } from '../src/reference/fundingTendersReference.ts';
import { normalizeFundingTendersRecord } from '../src/adapters/fundingTenders/normalize.ts';
import type { CaptureRecord } from '../src/capture/store.ts';
import { classifyOpportunity } from '../src/diff/classify.ts';

const fixturesDir = fileURLToPath(new URL('./fixtures/funding-tenders/', import.meta.url));
const reference = loadFundingTendersReference();

function fixtureOpportunity(observedAt: string, mutate?: (o: NormalizedExternalOpportunity) => void): NormalizedExternalOpportunity {
  const raw = JSON.parse(readFileSync(fixturesDir + 'topic-agrip-multi-2021-im.json', 'utf8')) as unknown;
  const outcome = normalizeFundingTendersRecord(raw, reference);
  assert.ok(outcome.ok);
  if (!outcome.ok) throw new Error('fixture must normalize');
  const group = groupVariants([outcome.variant])[0];
  assert.ok(group);
  const opportunity = toNormalizedOpportunity(group, observedAt);
  mutate?.(opportunity);
  return opportunity;
}

function capture(opportunity: NormalizedExternalOpportunity): CaptureRecord {
  return { contentHash: opportunity.contentHash, lastObservedAt: opportunity.observedAt, opportunity };
}

test('T06: observedAt and fetch timestamps are excluded from the content hash', () => {
  const a = fixtureOpportunity('2026-09-27T08:00:00.000Z');
  const b = fixtureOpportunity('2026-09-28T21:15:00.000Z');
  assert.notEqual(a.observedAt, b.observedAt);
  assert.equal(a.contentHash, b.contentHash);
});

test('T06: unordered classification arrays are normalized before hashing', () => {
  const a = fixtureOpportunity('2026-09-27T08:00:00.000Z', (o) => {
    o.cpvCodes = ['a', 'b'];
    o.sectorHints = ['x', 'y'];
  });
  const b = fixtureOpportunity('2026-09-27T08:00:00.000Z', (o) => {
    o.cpvCodes = ['b', 'a'];
    o.sectorHints = ['y', 'x'];
  });
  // Recompute hashes after mutation (fixture helper hashed pre-mutation).
  a.contentHash = classifyHash(a);
  b.contentHash = classifyHash(b);
  assert.equal(a.contentHash, b.contentHash);
});

// Re-hash helper mirroring the DTO builder's projection.
import { contentProjection, hashCanonical, variantHash } from '../src/hash/contentHash.ts';
function classifyHash(o: NormalizedExternalOpportunity): string {
  return hashCanonical(
    contentProjection(
      o,
      o.language,
      o.sourceRevisionIdentifier,
      [{ language: o.language ?? 'und', hash: variantHash({ title: o.title, summary: o.summary, eligibilityText: o.eligibilityText, revision: o.sourceRevisionIdentifier }) }],
    ),
  );
}

test('T07: empty capture state classifies NEW', () => {
  const opportunity = fixtureOpportunity('2026-09-27T08:00:00.000Z');
  const decision = classifyOpportunity(opportunity, null);
  assert.equal(decision.classification, 'NEW');
  assert.equal(decision.previousHash, null);
});

test('T08: identical state observed twice classifies UNCHANGED', () => {
  const first = fixtureOpportunity('2026-09-27T08:00:00.000Z');
  const second = fixtureOpportunity('2026-09-28T08:00:00.000Z');
  const decision = classifyOpportunity(second, capture(first));
  assert.equal(decision.classification, 'UNCHANGED');
});

test('T09: deadline change classifies UPDATED', () => {
  const first = fixtureOpportunity('2026-09-27T08:00:00.000Z');
  const second = fixtureOpportunity('2026-09-27T08:00:00.000Z', (o) => {
    o.deadlineAt = '2026-06-30';
  });
  second.contentHash = classifyHash(second);
  assert.equal(classifyOpportunity(second, capture(first)).classification, 'UPDATED');
});

test('T09: status change classifies UPDATED', () => {
  const first = fixtureOpportunity('2026-09-27T08:00:00.000Z');
  const second = fixtureOpportunity('2026-09-27T08:00:00.000Z', (o) => {
    o.status = 'OPEN';
  });
  second.contentHash = classifyHash(second);
  assert.equal(classifyOpportunity(second, capture(first)).classification, 'UPDATED');
});

test('T09: budget change classifies UPDATED', () => {
  const first = fixtureOpportunity('2026-09-27T08:00:00.000Z');
  const second = fixtureOpportunity('2026-09-27T08:00:00.000Z', (o) => {
    o.fundingAmountMin = 9999999;
    o.fundingAmountMax = 9999999;
  });
  second.contentHash = classifyHash(second);
  assert.equal(classifyOpportunity(second, capture(first)).classification, 'UPDATED');
});

test('T09: authoritative eligibility revision (with revision-signal bump) classifies UPDATED', () => {
  const first = fixtureOpportunity('2026-09-27T08:00:00.000Z');
  const second = fixtureOpportunity('2026-09-27T08:00:00.000Z', (o) => {
    // The verified source record bumps its revision signal (latestInfos /
    // esST_checksum) whenever conditions are revised; text alone is
    // language-bound and tracked in the variant hashes.
    o.eligibilityText = 'Completely new conditions text.';
    o.sourceRevisionIdentifier = '2026-06-01T09:00:00.000';
  });
  second.contentHash = classifyHash(second);
  assert.equal(classifyOpportunity(second, capture(first)).classification, 'UPDATED');
});

test('T09: a pure language-representation change classifies UNCHANGED', () => {
  const first = fixtureOpportunity('2026-09-27T08:00:00.000Z');
  const second = fixtureOpportunity('2026-09-27T08:00:00.000Z', (o) => {
    o.language = 'hu';
    o.title = 'Magyar nyelvű cím ugyanahhoz a pályázathoz';
  });
  second.contentHash = classifyHash(second);
  assert.notEqual(first.contentHash, second.contentHash);
  assert.equal(classifyOpportunity(second, capture(first)).classification, 'UNCHANGED');
});
