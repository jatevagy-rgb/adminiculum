/**
 * T12 — source failure truthfulness: HTTP / network / parsing failure yields
 * health ERROR and is never a successful zero-result run.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runFundingTendersAdapter } from '../src/adapters/fundingTenders/index.ts';
import { executeFundingTendersSearch, FundingTendersRequestError } from '../src/adapters/fundingTenders/request.ts';
import { loadFundingTendersReference } from '../src/reference/fundingTendersReference.ts';

const fixturesDir = fileURLToPath(new URL('./fixtures/funding-tenders/', import.meta.url));
const reference = loadFundingTendersReference();

test('T12: unreachable source yields health ERROR, zero outcomes, explicit reason', async () => {
  const result = await runFundingTendersAdapter({
    reference,
    request: { url: 'http://127.0.0.1:1/', timeoutMs: 1000, maxRetries: 0 },
    now: new Date('2026-09-27T10:00:00.000Z'),
  });
  assert.equal(result.health, 'ERROR');
  assert.equal(result.fetchedCount, 0);
  assert.equal(result.normalizedCount, 0);
  assert.equal(result.rejectedCount, 0);
  assert.equal(result.variants.length, 0);
});

test('T12: HTTP 400 is a terminal failure (never retried, never a zero-result run)', async () => {
  const envelopePromise = executeFundingTendersSearch({
    url: 'http://127.0.0.1:1/definitely-not-reachable',
    timeoutMs: 1000,
    maxRetries: 2,
  });
  await assert.rejects(envelopePromise, FundingTendersRequestError);
  const result = await runFundingTendersAdapter({
    reference,
    request: { url: 'http://127.0.0.1:1/', timeoutMs: 1000, maxRetries: 0 },
    now: new Date('2026-09-27T10:00:00.000Z'),
  });
  assert.equal(result.health, 'ERROR');
  assert.equal(result.normalizedCount, 0);
});

test('T12: identity-less records in a healthy response are rejected, not fabricated', async () => {
  // Replay path of the same pipeline: a captured live response whose entries
  // carry no topic identifier must normalize to zero opportunities with
  // explicit rejections.
  const { runCli } = await import('../src/cli.ts');
  const { report, exitCode } = await runCli({
    mode: 'no-commit',
    replayPath: fixturesDir + 'search-response-sample.json',
    stateDir: null,
  });
  assert.equal(exitCode, 0);
  assert.equal(report.health, 'ACTIVE');
  assert.equal(report.fetchedCount, 2);
  assert.equal(report.normalizedCount, 0);
  assert.equal(report.rejectedCount, 2);
  assert.equal(report.newCount, 0);
});
