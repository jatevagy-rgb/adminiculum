/**
 * GWO-2 TED adapter — fixture-replay diff semantics through the existing
 * shared diff/classify contract: first capture NEW, identical content
 * UNCHANGED, notice-version (revision signal) change UPDATED.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { NormalizedExternalOpportunity } from '../src/types.ts';
import { groupVariants, toNormalizedOpportunity } from '../src/normalize/multilingual.ts';
import { normalizeTedNotice } from '../src/adapters/ted/normalize.ts';
import { classifyOpportunity } from '../src/diff/classify.ts';
import type { CaptureRecord } from '../src/capture/store.ts';

const fixturesDir = fileURLToPath(new URL('./fixtures/ted/', import.meta.url));

function opportunityFromFixture(file: string, index: number, observedAt: string): NormalizedExternalOpportunity {
  const parsed = JSON.parse(readFileSync(fixturesDir + file, 'utf8')) as { notices: unknown[] };
  const batch = normalizeTedNotice(parsed.notices[index]);
  assert.equal(batch.rejections.length, 0);
  const group = groupVariants(batch.variants)[0];
  assert.ok(group);
  return toNormalizedOpportunity(group, observedAt);
}

function capture(opportunity: NormalizedExternalOpportunity): CaptureRecord {
  return { contentHash: opportunity.contentHash, lastObservedAt: opportunity.observedAt, opportunity };
}

test('T-DIFF: first capture NEW, same exact source content UNCHANGED', () => {
  const first = opportunityFromFixture('notices-live-sample.json', 0, '2026-09-27T12:00:00.000Z');
  assert.equal(classifyOpportunity(first, null).classification, 'NEW');
  const second = opportunityFromFixture('notices-live-sample.json', 0, '2026-09-28T12:00:00.000Z');
  assert.equal(second.sourceIdentifier, first.sourceIdentifier);
  assert.notEqual(second.observedAt, first.observedAt);
  assert.equal(classifyOpportunity(second, capture(first)).classification, 'UNCHANGED');
});

test('T-DIFF: notice-version bump classifies UPDATED on the same scope', () => {
  const v1 = opportunityFromFixture('notices-live-sample.json', 0, '2026-09-27T12:00:00.000Z');
  const v2 = opportunityFromFixture('notices-synthetic-edge.json', 4, '2026-09-27T12:00:00.000Z');
  assert.equal(v1.sourceIdentifier, v2.sourceIdentifier);
  assert.notEqual(v1.sourceRevisionIdentifier, v2.sourceRevisionIdentifier);
  assert.equal(classifyOpportunity(v2, capture(v1)).classification, 'UPDATED');
});
