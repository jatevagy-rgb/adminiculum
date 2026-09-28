/**
 * T15 — deterministic report: stable counts, bounded sample rendering, stable
 * serialization across runs with identical inputs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDryRunReport, MAX_REPORT_SAMPLES, SOURCE_ATTRIBUTION } from '../src/report.ts';
import { runCli } from '../src/cli.ts';
import { CaptureStore } from '../src/capture/store.ts';
import type { NormalizedExternalOpportunity } from '../src/types.ts';

const fixturesDir = fileURLToPath(new URL('./fixtures/funding-tenders/', import.meta.url));

test('T15: report rendering is deterministic for identical inputs', () => {
  const opportunities: NormalizedExternalOpportunity[] = [];
  const base = {
    source: 'EU_FUNDING_TENDERS' as const,
    health: 'ACTIVE' as const,
    healthReason: 'Source responded successfully in this run.',
    requestedAt: '2026-09-27T12:00:00.000Z',
    completedAt: '2026-09-27T12:00:01.000Z',
    lastSuccessAt: null,
    fetchedCount: 1,
    normalizedCount: 1,
    rejectedCount: 0,
    opportunities,
    diff: { newCount: 1, updatedCount: 0, unchangedCount: 0, decisions: [] },
    errorCode: null,
    errorMessage: null,
  };
  const a = buildDryRunReport(base, 'dry-run', '2026-09-27T12:00:02.000Z');
  const b = buildDryRunReport(base, 'dry-run', '2026-09-27T12:00:02.000Z');
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(a.attribution, SOURCE_ATTRIBUTION);
});

test('T15: samples are bounded and sorted', () => {
  const make = (id: string): NormalizedExternalOpportunity =>
    ({
      schemaVersion: 1,
      source: 'EU_FUNDING_TENDERS',
      sourceIdentifier: id,
      sourceRevisionIdentifier: null,
      kind: 'FUNDING',
      title: `Title ${id}`,
      status: 'OPEN',
      sourceUrl: `https://example.invalid/${id}`,
      observedAt: '2026-09-27T12:00:00.000Z',
      contentHash: 'a'.repeat(64),
      summary: null,
      programme: null,
      callIdentifier: null,
      authorityName: null,
      buyerName: null,
      publicationAt: null,
      openingAt: null,
      deadlineAt: null,
      language: null,
      cpvCodes: [],
      activityCodes: [],
      sectorHints: [],
      eligibleCountries: [],
      nutsCodes: [],
      placeOfPerformance: null,
      estimatedValueMin: null,
      estimatedValueMax: null,
      fundingAmountMin: null,
      fundingAmountMax: null,
      currency: null,
      cofinancingRate: null,
      eligibilityText: null,
      sourceSpecificMetadata: {},
    }) as NormalizedExternalOpportunity;
  const opportunities = [make('c-topic'), make('a-topic'), make('b-topic'), make('d-topic')];
  const report = buildDryRunReport(
    {
      source: 'EU_FUNDING_TENDERS',
      health: 'ACTIVE',
      healthReason: 'test',
      requestedAt: '2026-09-27T12:00:00.000Z',
      completedAt: '2026-09-27T12:00:01.000Z',
      lastSuccessAt: null,
      fetchedCount: 4,
      normalizedCount: 4,
      rejectedCount: 0,
      opportunities,
      diff: { newCount: 4, updatedCount: 0, unchangedCount: 0, decisions: [] },
      errorCode: null,
      errorMessage: null,
    },
    'dry-run',
    '2026-09-27T12:00:02.000Z',
  );
  assert.equal(report.samples.length, MAX_REPORT_SAMPLES);
  assert.deepEqual(report.samples.map((s) => s.sourceIdentifier), ['a-topic', 'b-topic', 'c-topic']);
});

test('T15: CLI no-commit replay does not touch the capture store and is repeatable', async () => {
  const stateDir = mkdtempSync(join(tmpdir(), 'gwo-t15-'));
  try {
    const args = { mode: 'no-commit' as const, replayPath: fixturesDir + 'topic-agrip-multi-2021-im.json', stateDir };
    const first = await runCli(args);
    const second = await runCli(args);
    assert.equal(first.exitCode, 0);
    // Run timestamps differ by design; every count/sample/attribution field
    // must be identical across runs with identical inputs.
    const strip = (r: { generatedAt: string; requestedAt: string; completedAt: string; lastSuccessAt: string | null }) => {
      const { generatedAt: _g, requestedAt: _r, completedAt: _c, lastSuccessAt: _l, ...rest } = r;
      return rest;
    };
    assert.equal(JSON.stringify(strip(first.report)), JSON.stringify(strip(second.report)));
    assert.equal(first.report.newCount, 1);
    assert.equal(first.report.normalizedCount, 1);
    assert.equal(first.report.samples.length, 1);
    assert.equal(first.report.samples[0]?.sourceIdentifier, 'AGRIP-MULTI-2021-IM');
    const storeFile = join(stateDir, 'capture.json');
    assert.equal(existsSync(storeFile), false, 'no-commit must not write the store');
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test('T15: CLI dry-run updates the store and a second replay is UNCHANGED', async () => {
  const stateDir = mkdtempSync(join(tmpdir(), 'gwo-t15b-'));
  try {
    const args = { mode: 'dry-run' as const, replayPath: fixturesDir + 'topic-agrip-multi-2021-im.json', stateDir };
    const first = await runCli(args);
    const second = await runCli(args);
    assert.equal(first.report.newCount, 1);
    assert.equal(second.report.newCount, 0);
    assert.equal(second.report.unchangedCount, 1);
    const store = new CaptureStore(stateDir);
    assert.equal(store.all().length, 1);
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});
