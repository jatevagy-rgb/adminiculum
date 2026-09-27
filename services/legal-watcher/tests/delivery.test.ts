/**
 * W2 delivery tests:
 *  - exact W2 payload mapping (amendment + consolidation)
 *  - schemaVersion=1 envelope exactness and identity privacy
 *  - default DRY_RUN: zero POSTs, no token request, W1 output preserved
 *  - DELIVER: Bearer header, ACCEPTED/DUPLICATE mark delivered
 *  - REJECTED stays undelivered with reason; retry on a later run
 *  - source-seen state and delivery state are separate
 *  - 400/401/403 fail closed; 429/5xx/network retries are bounded
 *  - token never enters logs/report/state
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runWatcher, type WatcherDeps } from '../src/index';
import { createFileStateStore } from '../src/capture';
import { ConfigError, parseArgs, resolveConfig } from '../src/config';
import type { WatcherConfig } from '../src/config';
import {
  buildW2Envelope,
  createFileDeliveryStateStore,
  mapEventToW2Observation,
  selectDeliveryCandidates,
} from '../src/delivery';
import type { DeliveryPostFn } from '../src/delivery';
import { createJsonLogger, type Logger } from '../src/logging';
import { TokenProviderError, type AccessTokenProvider } from '../src/tokenProvider';
import {
  STATE_SCHEMA_VERSION,
  W2_ENDPOINT_PATH,
  W2_SCHEMA_VERSION,
  type CelexRunResult,
  type DeliveryState,
  type ObservationEvent,
  type WatcherState,
} from '../src/types';
import type { EurlexAdapter } from '../src/adapters/eurlex';
import type { HttpStreamResponse } from '../src/http';
import { jsonResponse, makeEvent } from './helpers';

const BASE_CONFIG: Omit<WatcherConfig, 'manifestPath' | 'stateDir'> = {
  reportOutPath: null,
  eurlexEndpoint: 'https://example.test/sparql',
  httpTimeoutMs: 1000,
  httpRetries: 0,
  httpBackoffMs: 5,
  httpBackoffFactor: 2,
  responseMaxBytes: 1024 * 1024,
  concurrency: 1,
};

function watcherConfig(
  manifestPath: string,
  stateDir: string,
  extra: Partial<WatcherConfig> = {},
): WatcherConfig {
  return { ...BASE_CONFIG, manifestPath, stateDir, ...extra };
}

function setup(name: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `lw-delivery-${name}-`));
  return { dir, manifestPath: path.join(dir, 'manifest.json'), stateDir: path.join(dir, 'state') };
}

function writeManifest(manifestPath: string): void {
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: '2026-09-27T00:00:00Z',
      sources: [
        { identifierFamily: 'CELEX', sourceIdentifier: '32016R0679', locators: [], referenceCount: 1 },
      ],
    }),
    'utf8',
  );
}

function watcherState(eventsByCelex: Record<string, ObservationEvent[]>): WatcherState {
  const entries: WatcherState['entries'] = {};
  for (const [celex, events] of Object.entries(eventsByCelex)) {
    entries[celex] = {
      firstSeenAt: '2026-09-27T00:00:00.000Z',
      events: Object.fromEntries(events.map((event) => [event.eventKey, event])),
      lastSuccessfulRunId: 'test-run-0',
      lastSuccessfulAt: '2026-09-27T00:00:00.000Z',
    };
  }
  return { schemaVersion: STATE_SCHEMA_VERSION, entries };
}

function pendingRecord() {
  return {
    firstAttemptAt: '2026-09-27T00:00:00.000Z',
    lastAttemptAt: '2026-09-27T00:00:00.000Z',
    attempts: 1,
    lastStatus: 'REJECTED',
    lastReason: 'nope',
  };
}

class FakeAdapter implements EurlexAdapter {
  public calls: string[] = [];
  constructor(private readonly behavior: (celex: string) => ObservationEvent[] | Error) {}
  async observe(celex: string): Promise<ObservationEvent[]> {
    this.calls.push(celex);
    const result = this.behavior(celex);
    if (result instanceof Error) throw result;
    return result;
  }
}

interface PostCall {
  url: string;
  body: string;
  headers: Record<string, string>;
}

function fakeTokenProvider(token = 'fake-app-only-token'): {
  provider: AccessTokenProvider;
  calls: { count: number };
} {
  const calls = { count: 0 };
  return {
    provider: {
      async getAccessToken() {
        calls.count += 1;
        return token;
      },
    },
    calls,
  };
}

function scriptedPost(
  script: Array<HttpStreamResponse | Error | ((call: PostCall) => HttpStreamResponse | Error)>,
): { post: DeliveryPostFn; calls: PostCall[] } {
  const calls: PostCall[] = [];
  let index = 0;
  const post: DeliveryPostFn = async (url, body, headers, _signal) => {
    const call = { url, body, headers };
    calls.push(call);
    const step = script[Math.min(index, script.length - 1)];
    index++;
    const result = typeof step === 'function' ? step(call) : step;
    if (result instanceof Error) throw result;
    return result;
  };
  return { post, calls };
}

function w2Response(
  entries: Array<{
    key: string | null;
    status: 'ACCEPTED' | 'DUPLICATE' | 'REJECTED';
    reason?: string | null;
    warnings?: string[];
  }>,
  status = 200,
): HttpStreamResponse {
  return jsonResponse(
    JSON.stringify({
      schemaVersion: W2_SCHEMA_VERSION,
      results: entries.map((entry) => ({
        idempotencyKey: entry.key,
        status: entry.status,
        reason: entry.reason ?? null,
        warnings: entry.warnings ?? [],
      })),
    }),
    status,
  );
}

function runDeps(
  adapter: FakeAdapter,
  stateDir: string,
  options: {
    post?: DeliveryPostFn;
    tokenProvider?: AccessTokenProvider;
    logSink?: string[];
  } = {},
): WatcherDeps {
  let counter = 0;
  const logSink = options.logSink;
  const logger: Logger = logSink
    ? createJsonLogger((line) => logSink.push(line))
    : { info: () => undefined, warn: () => undefined, error: () => undefined };
  return {
    adapter,
    store: createFileStateStore(stateDir),
    deliveryStore: createFileDeliveryStateStore(stateDir),
    tokenProvider: options.tokenProvider,
    deliveryPost: options.post,
    logger,
    now: () => new Date('2026-09-27T12:00:00.000Z'),
    uuid: () => `test-run-${++counter}`,
  };
}

const AMEND_A = () => makeEvent('32016R0679', 'AMENDMENT_PUBLISHED', '31995L0046');
const AMEND_B = () => makeEvent('32016R0679', 'AMENDMENT_PUBLISHED', '32003R1882');
const CONSOLIDATION = () =>
  makeEvent('32016R0679', 'CONSOLIDATED_VERSION_AVAILABLE', '02016R0679-20160504');

describe('W2 payload mapping', () => {
  test('amendment maps watched base CELEX + amending CELEX and exact W1 evidence', () => {
    const event = makeEvent('32016R0679', 'AMENDMENT_PUBLISHED', '32003R1882', {
      publicationDate: '2016-04-27',
    });
    const observation = mapEventToW2Observation(event);
    expect(observation).toEqual({
      idempotencyKey: event.eventKey,
      kind: 'AMENDMENT_PUBLISHED',
      source: 'EUR_LEX',
      identifierFamily: 'CELEX',
      sourceIdentifier: '32016R0679',
      relatedIdentifier: '32003R1882',
      evidence: {
        sourceUri: event.sourceUri,
        sha256: event.payloadHash,
        capturedAt: event.capturedAt,
        queryProvenance: event.queryProvenance,
      },
      warnings: [],
    });
    expect(Object.keys(observation).sort()).toEqual([
      'evidence',
      'idempotencyKey',
      'identifierFamily',
      'kind',
      'relatedIdentifier',
      'source',
      'sourceIdentifier',
      'warnings',
    ]);
  });

  test('consolidation maps the dated consolidated CELEX and evidence', () => {
    const event = CONSOLIDATION();
    const observation = mapEventToW2Observation(event);
    expect(observation.kind).toBe('CONSOLIDATED_VERSION_AVAILABLE');
    expect(observation.sourceIdentifier).toBe('32016R0679');
    expect(observation.relatedIdentifier).toBe('02016R0679-20160504');
    expect(observation.idempotencyKey).toBe(event.eventKey);
  });

  test('existing W1 key is used verbatim as idempotencyKey', () => {
    const event = AMEND_B();
    expect(mapEventToW2Observation(event).idempotencyKey).toBe(event.eventKey);
  });

  test('a timezone timestamp maps to effectiveFrom; date-only metadata is not invented', () => {
    const withTimestamp = makeEvent(
      '32016R0679',
      'CONSOLIDATED_VERSION_AVAILABLE',
      '02016R0679-20160504',
      { effectiveDate: '2016-05-04T00:00:00Z' },
    );
    expect(mapEventToW2Observation(withTimestamp).effectiveFrom).toBe('2016-05-04T00:00:00Z');

    const dateOnlyAmendment = makeEvent('32016R0679', 'AMENDMENT_PUBLISHED', '32003R1882', {
      publicationDate: '2016-04-27',
    });
    const dateOnlyConsolidation = makeEvent(
      '32016R0679',
      'CONSOLIDATED_VERSION_AVAILABLE',
      '02016R0679-20160504',
      { effectiveDate: '2016-05-04' },
    );
    expect(mapEventToW2Observation(dateOnlyAmendment).effectiveFrom).toBeUndefined();
    expect(mapEventToW2Observation(dateOnlyConsolidation).effectiveFrom).toBeUndefined();
  });

  test('envelope is exactly schemaVersion=1 + observations with no identity fields', () => {
    const envelope = buildW2Envelope([mapEventToW2Observation(AMEND_B())]);
    expect(Object.keys(envelope).sort()).toEqual(['observations', 'schemaVersion']);
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.observations).toHaveLength(1);
    const serialized = JSON.stringify(envelope);
    for (const forbidden of [
      'legalVersionKey',
      'clientId',
      'caseId',
      'documentId',
      'userId',
      'finding',
      '"task"',
      '"request"',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  test('candidates are new events plus retryable pending events; baseline and delivered are excluded', () => {
    const baseline = AMEND_A();
    const delivered = AMEND_B();
    const fresh = CONSOLIDATION();
    const pendingRetry = makeEvent('32016R0679', 'AMENDMENT_PUBLISHED', '31998L0001');
    const state: DeliveryState = {
      schemaVersion: 1,
      delivered: { [delivered.eventKey]: { deliveredAt: 'x', backendStatus: 'ACCEPTED' } },
      pending: {},
    };
    const result: CelexRunResult = {
      sourceIdentifier: '32016R0679',
      status: 'NEW_CONSOLIDATED_VERSION',
      observedEvents: [baseline, delivered, fresh],
      baselineEvents: [],
      newEvents: [fresh],
      metadataChangedKeys: [],
      missingFromSourceKeys: [],
      error: null,
    };
    const sourceState = watcherState({
      '32016R0679': [baseline, delivered, fresh, pendingRetry],
    });
    expect(selectDeliveryCandidates([result], state, sourceState).map((e) => e.eventKey)).toEqual([
      fresh.eventKey,
    ]);

    const retryState: DeliveryState = {
      ...state,
      pending: { [pendingRetry.eventKey]: pendingRecord() },
    };
    const unchangedResult: CelexRunResult = {
      ...result,
      status: 'UNCHANGED',
      observedEvents: [delivered, pendingRetry],
      newEvents: [],
    };
    expect(
      selectDeliveryCandidates([unchangedResult], retryState, sourceState).map((e) => e.eventKey),
    ).toEqual([pendingRetry.eventKey]);
  });

  test('pending delivery is recovered from the durable source baseline when the event disappears from CELLAR', () => {
    const historical = AMEND_A();
    const pendingEvent = AMEND_B();
    const delivered = CONSOLIDATION();
    const retryState: DeliveryState = {
      schemaVersion: 1,
      delivered: { [delivered.eventKey]: { deliveredAt: 'x', backendStatus: 'ACCEPTED' } },
      pending: { [pendingEvent.eventKey]: pendingRecord() },
    };
    const sourceState = watcherState({ '32016R0679': [historical, pendingEvent, delivered] });
    const result: CelexRunResult = {
      sourceIdentifier: '32016R0679',
      status: 'UNCHANGED',
      observedEvents: [],
      baselineEvents: [],
      newEvents: [],
      metadataChangedKeys: [],
      missingFromSourceKeys: [historical.eventKey, pendingEvent.eventKey, delivered.eventKey],
      error: null,
    };
    const candidates = selectDeliveryCandidates([result], retryState, sourceState);
    // Only the pending event is recovered; the historical baseline event is not
    // selected and the delivered event is never retried.
    expect(candidates.map((e) => e.eventKey)).toEqual([pendingEvent.eventKey]);
    // Recovery reuses the authoritative baseline payload verbatim and never
    // reclassifies the source event as NEW.
    expect(candidates[0]).toEqual(pendingEvent);
    expect(result.newEvents).toEqual([]);
  });

  test('pending baseline event is retried while the current observation is SOURCE_ERROR', () => {
    const recovered = AMEND_B();
    const retryState: DeliveryState = {
      schemaVersion: 1,
      delivered: {},
      pending: { [recovered.eventKey]: pendingRecord() },
    };
    const result: CelexRunResult = {
      sourceIdentifier: '32016R0679',
      status: 'SOURCE_ERROR',
      observedEvents: [],
      baselineEvents: [],
      newEvents: [],
      metadataChangedKeys: [],
      missingFromSourceKeys: [],
      error: {
        sourceIdentifier: '32016R0679',
        phase: 'HTTP',
        code: 'NETWORK_ERROR',
        message: 'source down',
      },
    };
    const sourceState = watcherState({ '32016R0679': [AMEND_A(), recovered] });
    expect(
      selectDeliveryCandidates([result], retryState, sourceState).map((e) => e.eventKey),
    ).toEqual([recovered.eventKey]);
  });
});

describe('explicit delivery mode', () => {
  test('default DRY_RUN performs zero POSTs, requests no token and preserves W1 output', async () => {
    const { dir, manifestPath, stateDir } = setup('dry');
    try {
      writeManifest(manifestPath);
      const { provider, calls: tokenCalls } = fakeTokenProvider();
      const { post, calls } = scriptedPost([w2Response([])]);
      const outcome = await runWatcher(
        watcherConfig(manifestPath, stateDir),
        runDeps(new FakeAdapter(() => [AMEND_A()]), stateDir, { post, tokenProvider: provider }),
      );
      expect(outcome.report.dryRun).toBe(true);
      expect(outcome.report.deliveryMode).toBe('DRY_RUN');
      expect(outcome.report.delivery).toBeNull();
      expect(outcome.report.adminiculumBackendWrites).toBe(0);
      expect(outcome.report.firstSeenBaselineCount).toBe(1);
      expect(outcome.report.newAmendmentCount).toBe(0);
      expect(tokenCalls.count).toBe(0);
      expect(calls).toHaveLength(0);
      expect(fs.readdirSync(stateDir).sort()).toEqual(['state.json']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('DELIVER sends a Bearer-authenticated exact envelope; ACCEPTED marks delivered and is not reposted', async () => {
    const { dir, manifestPath, stateDir } = setup('accept');
    try {
      writeManifest(manifestPath);
      const k1 = AMEND_A();
      const k2 = AMEND_B();
      const baseline = await runWatcher(
        watcherConfig(manifestPath, stateDir),
        runDeps(new FakeAdapter(() => [k1]), stateDir),
      );
      expect(baseline.report.firstSeenBaselineCount).toBe(1);

      const { provider, calls: tokenCalls } = fakeTokenProvider('token-abc');
      const { post, calls } = scriptedPost([w2Response([{ key: k2.eventKey, status: 'ACCEPTED' }])]);
      const second = await runWatcher(
        watcherConfig(manifestPath, stateDir, {
          deliveryMode: 'DELIVER',
          backendEndpoint: 'https://backend.example.test',
          deliveryBatchSize: 10,
        }),
        runDeps(new FakeAdapter(() => [k1, k2]), stateDir, { post, tokenProvider: provider }),
      );
      expect(second.report.dryRun).toBe(false);
      expect(second.report.deliveryMode).toBe('DELIVER');
      expect(tokenCalls.count).toBe(1);
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(`https://backend.example.test${W2_ENDPOINT_PATH}`);
      expect(calls[0].headers.authorization).toBe('Bearer token-abc');
      expect(calls[0].headers['content-type']).toBe('application/json');
      const envelope = JSON.parse(calls[0].body);
      expect(envelope.schemaVersion).toBe(1);
      expect(envelope.observations).toHaveLength(1);
      expect(envelope.observations[0].idempotencyKey).toBe(k2.eventKey);
      expect(envelope.observations[0].source).toBe('EUR_LEX');
      expect(envelope.observations[0].identifierFamily).toBe('CELEX');
      const delivery = second.report.delivery;
      expect(delivery).not.toBeNull();
      expect(delivery!.acceptedCount).toBe(1);
      expect(delivery!.deliveredCount).toBe(1);
      expect(delivery!.attemptedCount).toBe(1);
      expect(second.report.adminiculumBackendWrites).toBe(1);
      expect(second.report.overallStatus).toBe('OK');
      const deliveryState = createFileDeliveryStateStore(stateDir).load();
      expect(deliveryState.delivered[k2.eventKey]).toEqual({
        deliveredAt: '2026-09-27T12:00:00.000Z',
        backendStatus: 'ACCEPTED',
      });
      expect(deliveryState.pending[k2.eventKey]).toBeUndefined();

      const { provider: provider3, calls: tokenCalls3 } = fakeTokenProvider('token-abc');
      const { post: post3, calls: calls3 } = scriptedPost([]);
      const third = await runWatcher(
        watcherConfig(manifestPath, stateDir, {
          deliveryMode: 'DELIVER',
          backendEndpoint: 'https://backend.example.test',
        }),
        runDeps(new FakeAdapter(() => [k1, k2]), stateDir, { post: post3, tokenProvider: provider3 }),
      );
      expect(third.report.newAmendmentCount).toBe(0);
      expect(tokenCalls3.count).toBe(0);
      expect(calls3).toHaveLength(0);
      expect(third.report.delivery!.candidateCount).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('DUPLICATE is a delivery success recorded as delivered', async () => {
    const { dir, manifestPath, stateDir } = setup('duplicate');
    try {
      writeManifest(manifestPath);
      const k1 = AMEND_A();
      const k2 = AMEND_B();
      await runWatcher(
        watcherConfig(manifestPath, stateDir),
        runDeps(new FakeAdapter(() => [k1]), stateDir),
      );
      const { provider } = fakeTokenProvider();
      const { post, calls } = scriptedPost([
        w2Response([{ key: k2.eventKey, status: 'DUPLICATE' }]),
      ]);
      const outcome = await runWatcher(
        watcherConfig(manifestPath, stateDir, {
          deliveryMode: 'DELIVER',
          backendEndpoint: 'https://backend.example.test',
        }),
        runDeps(new FakeAdapter(() => [k1, k2]), stateDir, { post, tokenProvider: provider }),
      );
      expect(calls).toHaveLength(1);
      const delivery = outcome.report.delivery!;
      expect(delivery.duplicateCount).toBe(1);
      expect(delivery.deliveredCount).toBe(1);
      expect(delivery.results[0].status).toBe('DUPLICATE');
      expect(outcome.report.adminiculumBackendWrites).toBe(0);
      const deliveryState = createFileDeliveryStateStore(stateDir).load();
      expect(deliveryState.delivered[k2.eventKey].backendStatus).toBe('DUPLICATE');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('REJECTED stays undelivered with reason; source-seen state advances independently and retry succeeds later', async () => {
    const { dir, manifestPath, stateDir } = setup('rejected');
    try {
      writeManifest(manifestPath);
      const k1 = AMEND_A();
      const k2 = AMEND_B();
      await runWatcher(
        watcherConfig(manifestPath, stateDir),
        runDeps(new FakeAdapter(() => [k1]), stateDir),
      );

      const { provider } = fakeTokenProvider();
      const { post, calls } = scriptedPost([
        w2Response([{ key: k2.eventKey, status: 'REJECTED', reason: 'identifier not recognised' }]),
      ]);
      const rejectedRun = await runWatcher(
        watcherConfig(manifestPath, stateDir, {
          deliveryMode: 'DELIVER',
          backendEndpoint: 'https://backend.example.test',
        }),
        runDeps(new FakeAdapter(() => [k1, k2]), stateDir, { post, tokenProvider: provider }),
      );
      expect(calls).toHaveLength(1);
      const rejectedDelivery = rejectedRun.report.delivery!;
      expect(rejectedDelivery.rejectedCount).toBe(1);
      expect(rejectedDelivery.deliveredCount).toBe(0);
      expect(rejectedDelivery.results[0].reason).toBe('identifier not recognised');
      expect(rejectedRun.report.overallStatus).toBe('PARTIAL');
      const afterReject = createFileDeliveryStateStore(stateDir).load();
      expect(afterReject.delivered[k2.eventKey]).toBeUndefined();
      expect(afterReject.pending[k2.eventKey].lastStatus).toBe('REJECTED');
      expect(afterReject.pending[k2.eventKey].lastReason).toBe('identifier not recognised');
      // Source-seen baseline advanced: the event is no longer NEW even though
      // delivery failed.
      const sourceState = createFileStateStore(stateDir).load();
      expect(sourceState.entries['32016R0679'].events[k2.eventKey]).toBeDefined();

      const { provider: retryProvider, calls: retryTokenCalls } = fakeTokenProvider();
      const { post: retryPost, calls: retryCalls } = scriptedPost([
        w2Response([{ key: k2.eventKey, status: 'ACCEPTED' }]),
      ]);
      const retryRun = await runWatcher(
        watcherConfig(manifestPath, stateDir, {
          deliveryMode: 'DELIVER',
          backendEndpoint: 'https://backend.example.test',
        }),
        runDeps(new FakeAdapter(() => [k1, k2]), stateDir, {
          post: retryPost,
          tokenProvider: retryProvider,
        }),
      );
      expect(retryRun.report.newAmendmentCount).toBe(0);
      expect(retryRun.report.celexResults[0].status).toBe('UNCHANGED');
      expect(retryTokenCalls.count).toBe(1);
      expect(retryCalls).toHaveLength(1);
      expect(retryCalls[0].body).toContain(k2.eventKey);
      expect(retryRun.report.delivery!.deliveredCount).toBe(1);
      const afterRetry = createFileDeliveryStateStore(stateDir).load();
      expect(afterRetry.delivered[k2.eventKey]).toBeDefined();
      expect(afterRetry.pending[k2.eventKey]).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('401/403 fail closed: no delivery mark, remaining batches skipped, events stay pending', async () => {
    const { dir, manifestPath, stateDir } = setup('auth');
    try {
      writeManifest(manifestPath);
      await runWatcher(
        watcherConfig(manifestPath, stateDir),
        runDeps(new FakeAdapter(() => []), stateDir),
      );
      const k2 = AMEND_A();
      const k3 = CONSOLIDATION();
      const { provider } = fakeTokenProvider();
      const { post, calls } = scriptedPost([jsonResponse('unauthorized', 401)]);
      const outcome = await runWatcher(
        watcherConfig(manifestPath, stateDir, {
          deliveryMode: 'DELIVER',
          backendEndpoint: 'https://backend.example.test',
          deliveryBatchSize: 1,
        }),
        runDeps(new FakeAdapter(() => [k2, k3]), stateDir, { post, tokenProvider: provider }),
      );
      expect(calls).toHaveLength(1);
      const delivery = outcome.report.delivery!;
      expect(delivery.errorCount).toBe(2);
      expect(delivery.deliveredCount).toBe(0);
      expect(delivery.batches[0].errorCode).toBe('AUTH_ERROR');
      expect(delivery.batches[0].httpStatus).toBe(401);
      expect(delivery.batches[1].httpStatus).toBeNull();
      expect(delivery.batches[1].errorCode).toBe('AUTH_ERROR');
      expect(outcome.report.overallStatus).toBe('PARTIAL');
      const deliveryState = createFileDeliveryStateStore(stateDir).load();
      expect(Object.keys(deliveryState.delivered)).toEqual([]);
      expect(deliveryState.pending[k2.eventKey].lastStatus).toBe('AUTH_ERROR');
      expect(deliveryState.pending[k3.eventKey].lastStatus).toBe('AUTH_ERROR');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('429/5xx retries are bounded; a transient 503 then 200 delivers', async () => {
    const { dir, manifestPath, stateDir } = setup('retry');
    try {
      writeManifest(manifestPath);
      await runWatcher(
        watcherConfig(manifestPath, stateDir),
        runDeps(new FakeAdapter(() => []), stateDir),
      );
      const k2 = AMEND_A();

      const { provider } = fakeTokenProvider();
      const { post, calls } = scriptedPost([
        jsonResponse('unavailable', 503),
        w2Response([{ key: k2.eventKey, status: 'ACCEPTED' }]),
      ]);
      const recovered = await runWatcher(
        watcherConfig(manifestPath, stateDir, {
          deliveryMode: 'DELIVER',
          backendEndpoint: 'https://backend.example.test',
          httpRetries: 2,
        }),
        runDeps(new FakeAdapter(() => [k2]), stateDir, { post, tokenProvider: provider }),
      );
      expect(calls).toHaveLength(2);
      expect(recovered.report.delivery!.acceptedCount).toBe(1);

      // Exhaustion is bounded to retries+1 attempts and stays pending.
      const k3 = AMEND_B();
      const { provider: provider2 } = fakeTokenProvider();
      const { post: post2, calls: calls2 } = scriptedPost([jsonResponse('slow down', 429)]);
      const exhausted = await runWatcher(
        watcherConfig(manifestPath, stateDir, {
          deliveryMode: 'DELIVER',
          backendEndpoint: 'https://backend.example.test',
          httpRetries: 2,
        }),
        runDeps(new FakeAdapter(() => [k2, k3]), stateDir, {
          post: post2,
          tokenProvider: provider2,
        }),
      );
      expect(calls2).toHaveLength(3);
      const delivery = exhausted.report.delivery!;
      expect(delivery.errorCount).toBe(1);
      expect(delivery.results[0].reason).toContain('RETRY_EXHAUSTED');
      const deliveryState = createFileDeliveryStateStore(stateDir).load();
      expect(deliveryState.pending[k3.eventKey]).toBeDefined();
      expect(deliveryState.delivered[k3.eventKey]).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('network failure is bounded and stays pending', async () => {
    const { dir, manifestPath, stateDir } = setup('network');
    try {
      writeManifest(manifestPath);
      await runWatcher(
        watcherConfig(manifestPath, stateDir),
        runDeps(new FakeAdapter(() => []), stateDir),
      );
      const k2 = AMEND_A();
      const { provider } = fakeTokenProvider();
      const { post, calls } = scriptedPost([new Error('fetch failed')]);
      const outcome = await runWatcher(
        watcherConfig(manifestPath, stateDir, {
          deliveryMode: 'DELIVER',
          backendEndpoint: 'https://backend.example.test',
          httpRetries: 2,
        }),
        runDeps(new FakeAdapter(() => [k2]), stateDir, { post, tokenProvider: provider }),
      );
      expect(calls).toHaveLength(3);
      expect(outcome.report.delivery!.errorCount).toBe(1);
      const deliveryState = createFileDeliveryStateStore(stateDir).load();
      expect(deliveryState.pending[k2.eventKey].lastStatus).toBe('RETRY_EXHAUSTED');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('HTTP 400 malformed envelope fails closed without retry', async () => {
    const { dir, manifestPath, stateDir } = setup('envelope400');
    try {
      writeManifest(manifestPath);
      await runWatcher(
        watcherConfig(manifestPath, stateDir),
        runDeps(new FakeAdapter(() => []), stateDir),
      );
      const k2 = AMEND_A();
      const { provider } = fakeTokenProvider();
      const { post, calls } = scriptedPost([jsonResponse('bad request', 400)]);
      const outcome = await runWatcher(
        watcherConfig(manifestPath, stateDir, {
          deliveryMode: 'DELIVER',
          backendEndpoint: 'https://backend.example.test',
          httpRetries: 2,
        }),
        runDeps(new FakeAdapter(() => [k2]), stateDir, { post, tokenProvider: provider }),
      );
      expect(calls).toHaveLength(1);
      const delivery = outcome.report.delivery!;
      expect(delivery.batches[0].errorCode).toBe('MALFORMED_ENVELOPE');
      expect(delivery.errorCount).toBe(1);
      const deliveryState = createFileDeliveryStateStore(stateDir).load();
      expect(deliveryState.pending[k2.eventKey].lastStatus).toBe('MALFORMED_ENVELOPE');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('malformed 200 response fails closed and stays pending', async () => {
    const { dir, manifestPath, stateDir } = setup('malformed');
    try {
      writeManifest(manifestPath);
      await runWatcher(
        watcherConfig(manifestPath, stateDir),
        runDeps(new FakeAdapter(() => []), stateDir),
      );
      const k2 = AMEND_A();
      const { provider } = fakeTokenProvider();
      const { post } = scriptedPost([jsonResponse('{"unexpected":true}')]);
      const outcome = await runWatcher(
        watcherConfig(manifestPath, stateDir, {
          deliveryMode: 'DELIVER',
          backendEndpoint: 'https://backend.example.test',
        }),
        runDeps(new FakeAdapter(() => [k2]), stateDir, { post, tokenProvider: provider }),
      );
      const delivery = outcome.report.delivery!;
      expect(delivery.batches[0].errorCode).toBe('MALFORMED_RESPONSE');
      expect(delivery.errorCount).toBe(1);
      const deliveryState = createFileDeliveryStateStore(stateDir).load();
      expect(deliveryState.pending[k2.eventKey].lastStatus).toBe('MALFORMED_RESPONSE');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('token provider failure fails closed: no POST, event stays pending', async () => {
    const { dir, manifestPath, stateDir } = setup('tokenfail');
    try {
      writeManifest(manifestPath);
      await runWatcher(
        watcherConfig(manifestPath, stateDir),
        runDeps(new FakeAdapter(() => []), stateDir),
      );
      const k2 = AMEND_A();
      const provider: AccessTokenProvider = {
        async getAccessToken(): Promise<string> {
          throw new TokenProviderError('token endpoint is unreachable', 'TOKEN_ENDPOINT_UNREACHABLE');
        },
      };
      const { post, calls } = scriptedPost([]);
      const outcome = await runWatcher(
        watcherConfig(manifestPath, stateDir, {
          deliveryMode: 'DELIVER',
          backendEndpoint: 'https://backend.example.test',
        }),
        runDeps(new FakeAdapter(() => [k2]), stateDir, { post, tokenProvider: provider }),
      );
      expect(calls).toHaveLength(0);
      const delivery = outcome.report.delivery!;
      expect(delivery.errorCount).toBe(1);
      expect(delivery.results[0].reason).toContain('TOKEN_ENDPOINT_UNREACHABLE');
      const deliveryState = createFileDeliveryStateStore(stateDir).load();
      expect(deliveryState.pending[k2.eventKey].lastStatus).toBe('TOKEN_ENDPOINT_UNREACHABLE');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('access token never enters logs, report or state', async () => {
    const { dir, manifestPath, stateDir } = setup('secrecy');
    try {
      writeManifest(manifestPath);
      await runWatcher(
        watcherConfig(manifestPath, stateDir),
        runDeps(new FakeAdapter(() => []), stateDir),
      );
      const k2 = AMEND_A();
      const token = 'SUPER-SECRET-TOKEN-XYZ';
      const { provider } = fakeTokenProvider(token);
      const { post, calls } = scriptedPost([
        w2Response([{ key: k2.eventKey, status: 'ACCEPTED' }]),
      ]);
      const logSink: string[] = [];
      const outcome = await runWatcher(
        watcherConfig(manifestPath, stateDir, {
          deliveryMode: 'DELIVER',
          backendEndpoint: 'https://backend.example.test',
        }),
        runDeps(new FakeAdapter(() => [k2]), stateDir, {
          post,
          tokenProvider: provider,
          logSink,
        }),
      );
      expect(calls[0].headers.authorization).toBe(`Bearer ${token}`);
      const artifacts = [
        JSON.stringify(outcome.report),
        fs.readFileSync(path.join(stateDir, 'state.json'), 'utf8'),
        fs.readFileSync(path.join(stateDir, 'delivery.json'), 'utf8'),
        ...logSink,
      ];
      for (const artifact of artifacts) {
        expect(artifact).not.toContain(token);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  test('per-CELEX source failure isolates delivery without touching the failed baseline', async () => {
    const { dir, manifestPath, stateDir } = setup('isolation');
    try {
      fs.writeFileSync(
        manifestPath,
        JSON.stringify({
          schemaVersion: 1,
          generatedAt: '2026-09-27T00:00:00Z',
          sources: [
            { identifierFamily: 'CELEX', sourceIdentifier: '32016R0679', locators: [], referenceCount: 1 },
            { identifierFamily: 'CELEX', sourceIdentifier: '32022L2555', locators: [], referenceCount: 1 },
          ],
        }),
        'utf8',
      );
      const k1 = AMEND_A();
      const k2 = AMEND_B();
      let goodCalls = 0;
      const adapter = new FakeAdapter((celex) => {
        if (celex === '32022L2555') return new Error('source down');
        goodCalls++;
        return goodCalls === 1 ? [k1] : [k1, k2];
      });
      const deliverConfig = watcherConfig(manifestPath, stateDir, {
        deliveryMode: 'DELIVER',
        backendEndpoint: 'https://backend.example.test',
      });

      const { provider: firstProvider } = fakeTokenProvider();
      const { post: firstPost } = scriptedPost([]);
      const first = await runWatcher(
        deliverConfig,
        runDeps(adapter, stateDir, { post: firstPost, tokenProvider: firstProvider }),
      );
      expect(first.report.overallStatus).toBe('PARTIAL');
      expect(first.report.failedCelexCount).toBe(1);
      expect(first.report.delivery!.candidateCount).toBe(0);

      const { provider: secondProvider } = fakeTokenProvider();
      const { post: secondPost, calls } = scriptedPost([
        w2Response([{ key: k2.eventKey, status: 'ACCEPTED' }]),
      ]);
      const second = await runWatcher(
        deliverConfig,
        runDeps(adapter, stateDir, { post: secondPost, tokenProvider: secondProvider }),
      );
      expect(second.report.overallStatus).toBe('PARTIAL');
      expect(second.report.failedCelexCount).toBe(1);
      expect(second.report.delivery!.acceptedCount).toBe(1);
      expect(calls).toHaveLength(1);
      const envelope = JSON.parse(calls[0].body);
      expect(envelope.observations).toHaveLength(1);
      expect(envelope.observations[0].sourceIdentifier).toBe('32016R0679');
      const state = createFileStateStore(stateDir).load();
      expect(Object.keys(state.entries)).toEqual(['32016R0679']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('failed delivery is retried from the durable W1 baseline after the event disappears from CELLAR', async () => {
    const { dir, manifestPath, stateDir } = setup('baseline-recovery');
    try {
      writeManifest(manifestPath);
      const k1 = AMEND_A();
      const recovered = AMEND_B();

      // Run 1: establish the durable source baseline without the event.
      const establish = await runWatcher(
        watcherConfig(manifestPath, stateDir),
        runDeps(new FakeAdapter(() => [k1]), stateDir),
      );
      expect(establish.report.firstSeenBaselineCount).toBe(1);

      // Run 2: the event is NEW; delivery fails and stays pending while the
      // source-seen baseline still advances (state separation preserved).
      const { post: failingPost } = scriptedPost([jsonResponse('unavailable', 503)]);
      const failedRun = await runWatcher(
        watcherConfig(manifestPath, stateDir, {
          deliveryMode: 'DELIVER',
          backendEndpoint: 'https://backend.example.test',
          httpRetries: 0,
        }),
        runDeps(new FakeAdapter(() => [k1, recovered]), stateDir, {
          post: failingPost,
          tokenProvider: fakeTokenProvider().provider,
        }),
      );
      expect(failedRun.report.newAmendmentCount).toBe(1);
      expect(failedRun.report.delivery!.candidateCount).toBe(1);
      expect(failedRun.report.delivery!.errorCount).toBe(1);
      expect(createFileDeliveryStateStore(stateDir).load().pending[recovered.eventKey]).toBeDefined();
      const sourceStateAfterFail = createFileStateStore(stateDir).load();
      expect(sourceStateAfterFail.entries['32016R0679'].events[recovered.eventKey]).toBeDefined();

      // Run 3: CELLAR no longer returns the event. W1 reports it as
      // missing-from-source and NOT NEW; delivery still recovers it from the
      // durable baseline and marks it delivered.
      const { provider, calls: tokenCalls } = fakeTokenProvider();
      const { post, calls } = scriptedPost([
        w2Response([{ key: recovered.eventKey, status: 'ACCEPTED' }]),
      ]);
      const recoveryRun = await runWatcher(
        watcherConfig(manifestPath, stateDir, {
          deliveryMode: 'DELIVER',
          backendEndpoint: 'https://backend.example.test',
        }),
        runDeps(new FakeAdapter(() => [k1]), stateDir, { post, tokenProvider: provider }),
      );
      expect(recoveryRun.report.newAmendmentCount).toBe(0);
      expect(recoveryRun.report.celexResults[0].status).toBe('UNCHANGED');
      expect(recoveryRun.report.celexResults[0].missingFromSourceKeys).toContain(
        recovered.eventKey,
      );
      expect(tokenCalls.count).toBe(1);
      expect(calls).toHaveLength(1);
      const envelope = JSON.parse(calls[0].body);
      expect(envelope.observations).toHaveLength(1);
      expect(envelope.observations[0].idempotencyKey).toBe(recovered.eventKey);
      expect(envelope.observations[0].evidence).toEqual({
        sourceUri: recovered.sourceUri,
        sha256: recovered.payloadHash,
        capturedAt: recovered.capturedAt,
        queryProvenance: recovered.queryProvenance,
      });
      expect(recoveryRun.report.delivery!.candidateCount).toBe(1);
      expect(recoveryRun.report.delivery!.attemptedCount).toBe(1);
      expect(recoveryRun.report.delivery!.acceptedCount).toBe(1);

      const afterRecovery = createFileDeliveryStateStore(stateDir).load();
      expect(afterRecovery.schemaVersion).toBe(1);
      expect(afterRecovery.delivered[recovered.eventKey]).toEqual({
        deliveredAt: '2026-09-27T12:00:00.000Z',
        backendStatus: 'ACCEPTED',
      });
      expect(afterRecovery.pending[recovered.eventKey]).toBeUndefined();
      // delivery.json remains bookkeeping-only: no event payload is duplicated.
      const deliveryText = fs.readFileSync(path.join(stateDir, 'delivery.json'), 'utf8');
      expect(deliveryText).not.toContain(recovered.sourceUri);
      expect(deliveryText).not.toContain(recovered.payloadHash);
      expect(deliveryText).not.toContain(recovered.queryProvenance);
      // W1 baseline semantics are preserved: the event is retained unchanged
      // and still not NEW.
      const sourceAfterRecovery = createFileStateStore(stateDir).load();
      expect(sourceAfterRecovery.entries['32016R0679'].events[recovered.eventKey]).toEqual(
        recovered,
      );

      // Run 4: with the event delivered, the baseline no longer produces a
      // candidate and no POST/token request happens.
      const { provider: settledProvider, calls: settledTokenCalls } = fakeTokenProvider();
      const { post: settledPost, calls: settledCalls } = scriptedPost([]);
      const settled = await runWatcher(
        watcherConfig(manifestPath, stateDir, {
          deliveryMode: 'DELIVER',
          backendEndpoint: 'https://backend.example.test',
        }),
        runDeps(new FakeAdapter(() => [k1]), stateDir, {
          post: settledPost,
          tokenProvider: settledProvider,
        }),
      );
      expect(settled.report.delivery!.candidateCount).toBe(0);
      expect(settledTokenCalls.count).toBe(0);
      expect(settledCalls).toHaveLength(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('pending baseline event is retried while the current observation is SOURCE_ERROR', async () => {
    const { dir, manifestPath, stateDir } = setup('baseline-source-error');
    try {
      writeManifest(manifestPath);
      const k1 = AMEND_A();
      const pendingEvent = AMEND_B();

      await runWatcher(
        watcherConfig(manifestPath, stateDir),
        runDeps(new FakeAdapter(() => [k1]), stateDir),
      );
      const { post: failingPost } = scriptedPost([jsonResponse('unavailable', 503)]);
      await runWatcher(
        watcherConfig(manifestPath, stateDir, {
          deliveryMode: 'DELIVER',
          backendEndpoint: 'https://backend.example.test',
          httpRetries: 0,
        }),
        runDeps(new FakeAdapter(() => [k1, pendingEvent]), stateDir, {
          post: failingPost,
          tokenProvider: fakeTokenProvider().provider,
        }),
      );
      expect(
        createFileDeliveryStateStore(stateDir).load().pending[pendingEvent.eventKey],
      ).toBeDefined();
      const sourceBefore = fs.readFileSync(path.join(stateDir, 'state.json'), 'utf8');

      // The current CELLAR observation fails, but the pending event is still
      // retried from the durable baseline and delivered.
      const { provider, calls: tokenCalls } = fakeTokenProvider();
      const { post, calls } = scriptedPost([
        w2Response([{ key: pendingEvent.eventKey, status: 'ACCEPTED' }]),
      ]);
      const retryRun = await runWatcher(
        watcherConfig(manifestPath, stateDir, {
          deliveryMode: 'DELIVER',
          backendEndpoint: 'https://backend.example.test',
        }),
        runDeps(new FakeAdapter(() => new Error('source down')), stateDir, {
          post,
          tokenProvider: provider,
        }),
      );
      expect(tokenCalls.count).toBe(1);
      expect(retryRun.report.sourceErrorCount).toBe(1);
      expect(calls).toHaveLength(1);
      const envelope = JSON.parse(calls[0].body);
      expect(envelope.observations.map((o: { idempotencyKey: string }) => o.idempotencyKey)).toEqual(
        [pendingEvent.eventKey],
      );
      const afterRetry = createFileDeliveryStateStore(stateDir).load();
      expect(afterRetry.delivered[pendingEvent.eventKey]).toBeDefined();
      expect(afterRetry.pending[pendingEvent.eventKey]).toBeUndefined();
      // A failed source observation never advances the baseline.
      expect(fs.readFileSync(path.join(stateDir, 'state.json'), 'utf8')).toBe(sourceBefore);

      // Once delivered, the baseline never offers the event again.
      const { provider: settledProvider, calls: settledTokenCalls } = fakeTokenProvider();
      const { post: settledPost, calls: settledCalls } = scriptedPost([]);
      const settled = await runWatcher(
        watcherConfig(manifestPath, stateDir, {
          deliveryMode: 'DELIVER',
          backendEndpoint: 'https://backend.example.test',
        }),
        runDeps(new FakeAdapter(() => new Error('source down')), stateDir, {
          post: settledPost,
          tokenProvider: settledProvider,
        }),
      );
      expect(settled.report.delivery!.candidateCount).toBe(0);
      expect(settledTokenCalls.count).toBe(0);
      expect(settledCalls).toHaveLength(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('delivery configuration', () => {
  const DELIVERY_ENV = [
    'LEGAL_WATCHER_DELIVERY_MODE',
    'LEGAL_WATCHER_BACKEND_ENDPOINT',
    'LEGAL_WATCHER_AZURE_TENANT_ID',
    'LEGAL_WATCHER_AZURE_CLIENT_ID',
    'LEGAL_WATCHER_AZURE_CLIENT_SECRET',
    'LEGAL_WATCHER_AZURE_SCOPE',
    'LEGAL_WATCHER_AZURE_AUTHORITY_HOST',
    'LEGAL_WATCHER_DELIVERY_BATCH_SIZE',
  ];

  function withCleanEnv(fn: () => void): void {
    const saved = new Map<string, string | undefined>();
    for (const key of DELIVERY_ENV) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }
    try {
      fn();
    } finally {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  test('default mode is DRY_RUN and --deliver is parsed explicitly', () => {
    withCleanEnv(() => {
      expect(parseArgs(['--manifest', 'm.json']).deliver).toBe(false);
      expect(parseArgs(['--manifest', 'm.json', '--deliver']).deliver).toBe(true);
      const config = resolveConfig(parseArgs(['--manifest', 'm.json']));
      expect(config.deliveryMode).toBe('DRY_RUN');
      expect(config.backendEndpoint).toBeNull();
      expect(config.tokenConfig).toBeNull();
    });
  });

  test('DELIVER without endpoint or app-only token configuration fails closed', () => {
    withCleanEnv(() => {
      expect(() => resolveConfig(parseArgs(['--manifest', 'm.json', '--deliver']))).toThrow(
        ConfigError,
      );
    });
  });

  test('invalid delivery mode fails closed', () => {
    withCleanEnv(() => {
      process.env.LEGAL_WATCHER_DELIVERY_MODE = 'SOMETIMES';
      expect(() => resolveConfig(parseArgs(['--manifest', 'm.json']))).toThrow(ConfigError);
    });
  });

  test('DELIVER with full app-only configuration resolves and normalizes the endpoint', () => {
    withCleanEnv(() => {
      process.env.LEGAL_WATCHER_BACKEND_ENDPOINT = 'https://backend.example.test/';
      process.env.LEGAL_WATCHER_AZURE_TENANT_ID = 'tenant-id';
      process.env.LEGAL_WATCHER_AZURE_CLIENT_ID = 'client-id';
      process.env.LEGAL_WATCHER_AZURE_CLIENT_SECRET = 'client-secret';
      process.env.LEGAL_WATCHER_AZURE_SCOPE = 'api://backend/.default';
      const config = resolveConfig(parseArgs(['--manifest', 'm.json', '--deliver']));
      expect(config.deliveryMode).toBe('DELIVER');
      expect(config.backendEndpoint).toBe('https://backend.example.test');
      expect(config.deliveryBatchSize).toBe(50);
      expect(config.tokenConfig).toEqual({
        tenantId: 'tenant-id',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        scope: 'api://backend/.default',
      });
    });
  });

  test('batch size limit matches the W2 ingestion contract: 100 accepted, 101 rejected', () => {
    withCleanEnv(() => {
      process.env.LEGAL_WATCHER_DELIVERY_BATCH_SIZE = '100';
      expect(resolveConfig(parseArgs(['--manifest', 'm.json'])).deliveryBatchSize).toBe(100);
      process.env.LEGAL_WATCHER_DELIVERY_BATCH_SIZE = '101';
      expect(() => resolveConfig(parseArgs(['--manifest', 'm.json']))).toThrow(ConfigError);
      process.env.LEGAL_WATCHER_DELIVERY_BATCH_SIZE = '0';
      expect(() => resolveConfig(parseArgs(['--manifest', 'm.json']))).toThrow(ConfigError);
    });
  });
});
