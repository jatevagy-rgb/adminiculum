/**
 * T19, T20, T23, T24, T25 — end-to-end orchestrator behavior with a faked
 * adapter and a REAL temp state store. No live CELLAR, no backend writes.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runWatcher } from '../src/index';
import { createFileStateStore } from '../src/capture';
import { makeEvent } from './helpers';
import type { EurlexAdapter } from '../src/adapters/eurlex';
import type { ObservationEvent, WatcherState } from '../src/types';

const CONFIG = {
  manifestPath: '',
  stateDir: '',
  reportOutPath: null,
  eurlexEndpoint: 'https://publications.europa.eu/webapi/rdf/sparql',
  httpTimeoutMs: 1000,
  httpRetries: 0,
  httpBackoffMs: 100,
  httpBackoffFactor: 2,
  responseMaxBytes: 1024 * 1024,
  concurrency: 1,
};

class FakeAdapter implements EurlexAdapter {
  public calls: string[] = [];
  constructor(
    private readonly behavior: (celex: string) => ObservationEvent[] | Error,
  ) {}
  async observe(celex: string): Promise<ObservationEvent[]> {
    this.calls.push(celex);
    const result = this.behavior(celex);
    if (result instanceof Error) throw result;
    return result;
  }
}

function setup(runName: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `lw-run-${runName}-`));
  const manifestPath = path.join(dir, 'manifest.json');
  const stateDir = path.join(dir, 'state');
  return { dir, manifestPath, stateDir };
}

function writeManifest(
  manifestPath: string,
  sources: Array<Record<string, unknown>>,
  extra: Record<string, unknown> = {},
) {
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ schemaVersion: 1, generatedAt: '2026-09-27T00:00:00Z', sources, ...extra }),
    'utf8',
  );
}

function deps(adapter: FakeAdapter, stateDir: string) {
  let counter = 0;
  return {
    adapter,
    store: createFileStateStore(stateDir),
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    now: () => new Date('2026-09-27T12:00:00.000Z'),
    uuid: () => `test-run-${++counter}`,
  };
}

const AMEND = () => makeEvent('32016R0679', 'AMENDMENT_PUBLISHED', '32003R1882');

describe('watcher pipeline', () => {
  test('T19 partial multi-CELEX failure isolates the failed identifier', async () => {
    const { dir, manifestPath, stateDir } = setup('t19');
    try {
      writeManifest(manifestPath, [
        { identifierFamily: 'CELEX', sourceIdentifier: '32016R0679', locators: [], referenceCount: 1 },
        { identifierFamily: 'CELEX', sourceIdentifier: '32022L2555', locators: [], referenceCount: 1 },
      ]);
      const adapter = new FakeAdapter((celex) => {
        if (celex === '32022L2555') return new Error('boom');
        return [AMEND()];
      });
      const outcome = await runWatcher({ ...CONFIG, manifestPath, stateDir }, deps(adapter, stateDir));
      expect(outcome.report.overallStatus).toBe('PARTIAL');
      expect(outcome.report.failedCelexCount).toBe(1);
      expect(outcome.report.successfulCelexCount).toBe(1);
      expect(outcome.report.sourceErrorCount).toBe(1);
      expect(outcome.report.sanitizedErrors).toHaveLength(1);
      expect(outcome.exitCode).toBe(1);
      const state = createFileStateStore(stateDir).load();
      expect(Object.keys(state.entries)).toEqual(['32016R0679']);
      expect(Object.keys(state.entries['32016R0679'].events)).toEqual([AMEND().eventKey]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('T20 a failed/empty response never wipes the previous baseline', async () => {
    const { dir, manifestPath, stateDir } = setup('t20');
    try {
      writeManifest(manifestPath, [
        { identifierFamily: 'CELEX', sourceIdentifier: '32016R0679', locators: [], referenceCount: 1 },
      ]);
      const okAdapter = new FakeAdapter(() => [AMEND()]);
      const first = await runWatcher({ ...CONFIG, manifestPath, stateDir }, deps(okAdapter, stateDir));
      expect(first.report.overallStatus).toBe('OK');
      expect(first.report.firstSeenBaselineCount).toBe(1);
      expect(first.report.newAmendmentCount).toBe(0);

      const stateBefore = fs.readFileSync(path.join(stateDir, 'state.json'), 'utf8');

      const failingAdapter = new FakeAdapter(() => new Error('source down'));
      const second = await runWatcher({ ...CONFIG, manifestPath, stateDir }, deps(failingAdapter, stateDir));
      expect(second.report.overallStatus).toBe('FAILED');
      expect(second.report.sourceErrorCount).toBe(1);
      const state = createFileStateStore(stateDir).load();
      expect(Object.keys(state.entries['32016R0679'].events)).toEqual([AMEND().eventKey]);
      expect(fs.readFileSync(path.join(stateDir, 'state.json'), 'utf8')).toBe(stateBefore);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('T23 output contains zero client/case/document identities', async () => {
    const { dir, manifestPath, stateDir } = setup('t23');
    try {
      writeManifest(
        manifestPath,
        [
          {
            identifierFamily: 'CELEX',
            sourceIdentifier: '32016R0679',
            locators: [],
            referenceCount: 1,
            clientId: 'customer-1',
            documentId: 'doc-1',
          },
        ],
        { caseId: 'case-1' },
      );
      const adapter = new FakeAdapter(() => [AMEND()]);
      const outcome = await runWatcher({ ...CONFIG, manifestPath, stateDir }, deps(adapter, stateDir));
      const report = outcome.report;
      expect(report.manifest.droppedIdentityFields.sort()).toEqual(['caseId', 'clientId', 'documentId']);
      const serialized = JSON.stringify(report);
      // Identity VALUES are never propagated; the privacy guard reports only
      // the dropped field NAMES (never their values).
      expect(serialized).not.toContain('customer-1');
      expect(serialized).not.toContain('doc-1');
      expect(serialized).not.toContain('case-1');
      for (const observation of report.observations) {
        for (const key of Object.keys(observation)) {
          expect([
            'source',
            'sourceIdentifier',
            'eventKind',
            'eventKey',
            'relatedIdentifier',
            'sourceUri',
            'capturedAt',
            'payloadHash',
            'queryProvenance',
            'publicationDate',
            'effectiveDate',
          ]).toContain(key);
        }
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('T24 the dry-run report proves backend writes = 0', async () => {
    const { dir, manifestPath, stateDir } = setup('t24');
    try {
      writeManifest(manifestPath, [
        { identifierFamily: 'CELEX', sourceIdentifier: '32016R0679', locators: [], referenceCount: 1 },
      ]);
      const adapter = new FakeAdapter(() => [AMEND()]);
      const outcome = await runWatcher({ ...CONFIG, manifestPath, stateDir }, deps(adapter, stateDir));
      expect(outcome.report.adminiculumBackendWrites).toBe(0);
      expect(outcome.report.dryRun).toBe(true);
      // The only filesystem artifact is the watcher-owned state file.
      expect(fs.readdirSync(stateDir).sort()).toEqual(['state.json']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('T25 TV entries are skipped without any network calls', async () => {
    const { dir, manifestPath, stateDir } = setup('t25');
    try {
      writeManifest(manifestPath, [
        { identifierFamily: 'TV', sourceIdentifier: 'TV/2001/108', locators: ['art_5'], referenceCount: 2 },
      ]);
      const adapter = new FakeAdapter(() => [AMEND()]);
      const outcome = await runWatcher({ ...CONFIG, manifestPath, stateDir }, deps(adapter, stateDir));
      expect(adapter.calls).toEqual([]);
      expect(outcome.report.queriedCelexCount).toBe(0);
      expect(outcome.report.manifest.nonCelexSkipped).toBe(1);
      expect(outcome.report.overallStatus).toBe('OK');
      expect(fs.existsSync(stateDir)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('first then second identical run reports no new events on the second run', async () => {
    const { dir, manifestPath, stateDir } = setup('repeat');
    try {
      writeManifest(manifestPath, [
        { identifierFamily: 'CELEX', sourceIdentifier: '32016R0679', locators: [], referenceCount: 1 },
      ]);
      const adapter1 = new FakeAdapter(() => [AMEND()]);
      const first = await runWatcher({ ...CONFIG, manifestPath, stateDir }, deps(adapter1, stateDir));
      expect(first.report.firstSeenBaselineCount).toBe(1);
      expect(first.report.newAmendmentCount).toBe(0);
      const adapter2 = new FakeAdapter(() => [AMEND()]);
      const second = await runWatcher({ ...CONFIG, manifestPath, stateDir }, deps(adapter2, stateDir));
      expect(second.report.firstSeenBaselineCount).toBe(0);
      expect(second.report.unchangedCount).toBe(1);
      expect(second.report.newAmendmentCount).toBe(0);
      expect(second.report.newConsolidatedVersionCount).toBe(0);
      const state: WatcherState = createFileStateStore(stateDir).load();
      expect(Object.keys(state.entries['32016R0679'].events)).toEqual([AMEND().eventKey]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
