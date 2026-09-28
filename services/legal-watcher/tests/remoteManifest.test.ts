/**
 * Remote (BACKEND) manifest acquisition tests.
 *
 * FILE mode is preserved; BACKEND manifest mode adds exactly one authenticated
 * GET of the watcher-monitoring manifest through the same validator, with no
 * local-file fallback and no behavior change to DELIVER delivery.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runWatcher, type WatcherDeps } from '../src/index';
import { createFileStateStore, type StateStore } from '../src/capture';
import {
  ConfigError,
  parseArgs,
  parseManifestMode,
  resolveConfig,
  type WatcherConfig,
} from '../src/config';
import {
  createFileDeliveryStateStore,
  type DeliveryPostFn,
  type DeliveryStateStore,
} from '../src/delivery';
import {
  loadManifestFromBackend,
  ManifestError,
  parseManifestJson,
  REMOTE_MANIFEST_ENDPOINT_PATH,
  validateManifest,
} from '../src/manifest';
import {
  nodeFetchGetWithHeaders,
  type BoundedHttpOptions,
  type HttpGetFn,
  type HttpStreamResponse,
} from '../src/http';
import type { AccessTokenProvider } from '../src/tokenProvider';
import type { EurlexAdapter } from '../src/adapters/eurlex';
import {
  STATE_SCHEMA_VERSION,
  type ObservationEvent,
  type WatcherState,
} from '../src/types';
import { jsonResponse, makeEvent } from './helpers';

const REMOTE_URL = 'https://backend.example.test';
const REMOTE_MANIFEST_URL = `${REMOTE_URL}${REMOTE_MANIFEST_ENDPOINT_PATH}`;

function httpOptions(overrides: Partial<BoundedHttpOptions> = {}): BoundedHttpOptions {
  return {
    timeoutMs: 1000,
    retries: 0,
    backoffMs: 1,
    backoffFactor: 1,
    maxBytes: 1024 * 1024,
    deadlineMs: 10000,
    ...overrides,
  };
}

function fakeToken(token = 'test-app-only-token'): {
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

function validManifestText(extraTopLevel: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    generatedAt: '2026-09-27T00:00:00Z',
    ...extraTopLevel,
    sources: [
      { identifierFamily: 'CELEX', sourceIdentifier: '32016R0679', locators: [], referenceCount: 1 },
    ],
  });
}

interface GetCall {
  url: string;
  headers: Record<string, string>;
}

function scriptedGet(
  script: Array<HttpStreamResponse | Error | ((call: GetCall) => HttpStreamResponse | Error)>,
): { get: HttpGetFn; calls: GetCall[] } {
  const calls: GetCall[] = [];
  let index = 0;
  const get: HttpGetFn = async (url, headers, _signal) => {
    const call = { url, headers };
    calls.push(call);
    const step = script[Math.min(index, script.length - 1)];
    index++;
    const result = typeof step === 'function' ? step(call) : step;
    if (result instanceof Error) throw result;
    return result;
  };
  return { get, calls };
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

function scriptedPost(
  script: Array<HttpStreamResponse | Error>,
): { post: DeliveryPostFn; calls: PostCall[] } {
  const calls: PostCall[] = [];
  let index = 0;
  const post: DeliveryPostFn = async (url, body, headers, _signal) => {
    calls.push({ url, body, headers });
    const step = script[Math.min(index, script.length - 1)];
    index++;
    if (step instanceof Error) throw step;
    return step;
  };
  return { post, calls };
}

function setup(name: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `lw-remote-manifest-${name}-`));
  return { dir, manifestPath: path.join(dir, 'manifest.json'), stateDir: path.join(dir, 'state') };
}

function writeManifestFile(manifestPath: string): void {
  fs.writeFileSync(manifestPath, validManifestText(), 'utf8');
}

const BASE_CONFIG: Omit<WatcherConfig, 'manifestPath' | 'stateDir'> = {
  reportOutPath: null,
  eurlexEndpoint: 'https://example.test/sparql',
  httpTimeoutMs: 1000,
  httpRetries: 0,
  httpBackoffMs: 1,
  httpBackoffFactor: 1,
  responseMaxBytes: 1024 * 1024,
  concurrency: 1,
};

function backendConfig(stateDir: string, extra: Partial<WatcherConfig> = {}): WatcherConfig {
  return {
    ...BASE_CONFIG,
    manifestMode: 'BACKEND',
    manifestPath: null,
    backendEndpoint: REMOTE_URL,
    stateDir,
    ...extra,
  };
}

function fileConfig(manifestPath: string, stateDir: string): WatcherConfig {
  return { ...BASE_CONFIG, manifestMode: 'FILE', manifestPath, stateDir };
}

function runDeps(
  adapter: FakeAdapter,
  stateDir: string,
  options: {
    manifestGet?: HttpGetFn;
    tokenProvider?: AccessTokenProvider;
    deliveryStore?: DeliveryStateStore;
    post?: DeliveryPostFn;
    store?: StateStore;
  } = {},
): WatcherDeps {
  let counter = 0;
  return {
    adapter,
    store: options.store ?? createFileStateStore(stateDir),
    deliveryStore: options.deliveryStore,
    tokenProvider: options.tokenProvider,
    deliveryPost: options.post,
    manifestGet: options.manifestGet,
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    now: () => new Date('2026-09-27T12:00:00.000Z'),
    uuid: () => `test-run-${++counter}`,
  };
}

const MANIFEST_ENV_KEYS = [
  'LEGAL_WATCHER_MANIFEST_MODE',
  'LEGAL_WATCHER_MANIFEST',
  'LEGAL_WATCHER_DELIVERY_MODE',
  'LEGAL_WATCHER_BACKEND_ENDPOINT',
  'LEGAL_WATCHER_AZURE_AUTH_MODE',
  'LEGAL_WATCHER_AZURE_TENANT_ID',
  'LEGAL_WATCHER_AZURE_CLIENT_ID',
  'LEGAL_WATCHER_AZURE_CLIENT_SECRET',
  'LEGAL_WATCHER_AZURE_SCOPE',
  'LEGAL_WATCHER_AZURE_RESOURCE',
  'LEGAL_WATCHER_AZURE_AUTHORITY_HOST',
  'IDENTITY_ENDPOINT',
  'IDENTITY_HEADER',
] as const;

function withCleanEnv(fn: () => void): void {
  const saved = new Map<string, string | undefined>();
  for (const key of MANIFEST_ENV_KEYS) {
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

function setClientSecretEnv(): void {
  process.env.LEGAL_WATCHER_AZURE_TENANT_ID = 'tenant-id';
  process.env.LEGAL_WATCHER_AZURE_CLIENT_ID = 'client-id';
  process.env.LEGAL_WATCHER_AZURE_CLIENT_SECRET = 'client-secret';
  process.env.LEGAL_WATCHER_AZURE_SCOPE = 'api://adminiculum-backend/.default';
}

describe('manifest mode configuration', () => {
  test('default manifest mode is FILE; explicit modes validate', () => {
    withCleanEnv(() => {
      expect(parseManifestMode('')).toBe('FILE');
      expect(parseManifestMode(' file ')).toBe('FILE');
      expect(parseManifestMode('BACKEND')).toBe('BACKEND');
      expect(parseManifestMode('backend')).toBe('BACKEND');
      expect(() => parseManifestMode('AUTO')).toThrow(ConfigError);
      const config = resolveConfig(parseArgs(['--manifest', 'm.json']));
      expect(config.manifestMode).toBe('FILE');
      expect(config.manifestPath).toBe('m.json');
    });
  });

  test('FILE mode still requires --manifest/LEGAL_WATCHER_MANIFEST', () => {
    withCleanEnv(() => {
      expect(() => parseArgs(['--manifest'])).toThrow(ConfigError);
      expect(() => resolveConfig(parseArgs([]))).toThrow(ConfigError);
      process.env.LEGAL_WATCHER_MANIFEST = 'env-manifest.json';
      const config = resolveConfig(parseArgs([]));
      expect(config.manifestMode).toBe('FILE');
      expect(config.manifestPath).toBe('env-manifest.json');
    });
  });

  test('BACKEND mode requires the backend endpoint', () => {
    withCleanEnv(() => {
      process.env.LEGAL_WATCHER_MANIFEST_MODE = 'BACKEND';
      setClientSecretEnv();
      expect(() => resolveConfig(parseArgs([]))).toThrow(ConfigError);
    });
  });

  test('BACKEND mode requires app-only auth configuration, even in DRY_RUN', () => {
    withCleanEnv(() => {
      process.env.LEGAL_WATCHER_MANIFEST_MODE = 'BACKEND';
      process.env.LEGAL_WATCHER_BACKEND_ENDPOINT = REMOTE_URL;
      expect(() => resolveConfig(parseArgs([]))).toThrow(ConfigError);
    });
  });

  test('BACKEND mode does not require a manifest path and resolves auth for DRY_RUN', () => {
    withCleanEnv(() => {
      process.env.LEGAL_WATCHER_MANIFEST_MODE = 'BACKEND';
      process.env.LEGAL_WATCHER_BACKEND_ENDPOINT = `${REMOTE_URL}/`;
      setClientSecretEnv();
      const config = resolveConfig(parseArgs([]));
      expect(config.manifestMode).toBe('BACKEND');
      expect(config.manifestPath).toBeNull();
      expect(config.backendEndpoint).toBe(REMOTE_URL);
      expect(config.deliveryMode).toBe('DRY_RUN');
      expect(config.tokenConfig).toEqual({
        tenantId: 'tenant-id',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        scope: 'api://adminiculum-backend/.default',
      });
    });
  });

  test('BACKEND mode supports the MANAGED_IDENTITY selector without a secret', () => {
    withCleanEnv(() => {
      process.env.LEGAL_WATCHER_MANIFEST_MODE = 'BACKEND';
      process.env.LEGAL_WATCHER_BACKEND_ENDPOINT = REMOTE_URL;
      process.env.LEGAL_WATCHER_AZURE_AUTH_MODE = 'MANAGED_IDENTITY';
      process.env.LEGAL_WATCHER_AZURE_SCOPE = 'api://adminiculum-backend/.default';
      process.env.IDENTITY_ENDPOINT = 'http://127.0.0.1:41898/msi/token';
      process.env.IDENTITY_HEADER = 'runtime-identity-header-value';
      const config = resolveConfig(parseArgs([]));
      expect(config.tokenConfig).toEqual({
        mode: 'MANAGED_IDENTITY',
        resource: 'api://adminiculum-backend',
        identityEndpoint: 'http://127.0.0.1:41898/msi/token',
        identityHeader: 'runtime-identity-header-value',
      });
    });
  });
});

describe('loadManifestFromBackend', () => {
  test('requests the exact endpoint with Bearer auth and Accept: application/json', async () => {
    const { provider, calls: tokenCalls } = fakeToken('token-abc');
    const { get, calls } = scriptedGet([jsonResponse(validManifestText())]);
    const manifest = await loadManifestFromBackend({
      endpoint: REMOTE_URL,
      tokenProvider: provider,
      get,
      http: httpOptions(),
    });
    expect(tokenCalls.count).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      'https://backend.example.test/api/v1/compliance-intelligence/watcher-monitoring-manifest',
    );
    expect(calls[0].headers.authorization).toBe('Bearer token-abc');
    expect(calls[0].headers.accept).toBe('application/json');
    expect(manifest.sources).toHaveLength(1);
  });

  test('remote response flows through the exact same parseManifestJson/validateManifest pipeline', async () => {
    const text = validManifestText({ clientId: 'customer-1' });
    const { provider } = fakeToken();
    const { get } = scriptedGet([jsonResponse(text)]);
    const manifest = await loadManifestFromBackend({
      endpoint: REMOTE_URL,
      tokenProvider: provider,
      get,
      http: httpOptions(),
    });
    expect(manifest).toEqual(validateManifest(parseManifestJson(text)));
    expect(manifest.droppedFields).toEqual([{ path: 'manifest.clientId', field: 'clientId' }]);
  });

  test('malformed JSON fails closed', async () => {
    const { provider } = fakeToken();
    const { get } = scriptedGet([jsonResponse('not json')]);
    await expect(
      loadManifestFromBackend({
        endpoint: REMOTE_URL,
        tokenProvider: provider,
        get,
        http: httpOptions(),
      }),
    ).rejects.toThrow(ManifestError);
  });

  test('schema mismatch fails closed', async () => {
    const { provider } = fakeToken();
    const { get } = scriptedGet([jsonResponse(JSON.stringify({ schemaVersion: 2, sources: [] }))]);
    await expect(
      loadManifestFromBackend({
        endpoint: REMOTE_URL,
        tokenProvider: provider,
        get,
        http: httpOptions(),
      }),
    ).rejects.toThrow(ManifestError);
  });

  test('oversized response fails closed through the real bounded GET boundary', async () => {
    const { provider } = fakeToken();
    const big = JSON.stringify({ schemaVersion: 1, sources: [], padding: 'x'.repeat(4096) });
    const originalFetch = global.fetch;
    const fetchMock = jest.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(big, { status: 200 }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      await expect(
        loadManifestFromBackend({
          endpoint: REMOTE_URL,
          tokenProvider: provider,
          get: nodeFetchGetWithHeaders,
          http: httpOptions({ maxBytes: 1024 }),
        }),
      ).rejects.toThrow(ManifestError);
    } finally {
      global.fetch = originalFetch;
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('401 and 403 are never retried', async () => {
    for (const status of [401, 403]) {
      const { provider } = fakeToken();
      const { get, calls } = scriptedGet([jsonResponse('denied', status)]);
      await expect(
        loadManifestFromBackend({
          endpoint: REMOTE_URL,
          tokenProvider: provider,
          get,
          http: httpOptions({ retries: 2 }),
        }),
      ).rejects.toThrow(ManifestError);
      expect(calls).toHaveLength(1);
    }
  });

  test('429 is retried and the retry budget is bounded', async () => {
    const transient = scriptedGet([jsonResponse('busy', 429), jsonResponse(validManifestText())]);
    const { provider } = fakeToken();
    const manifest = await loadManifestFromBackend({
      endpoint: REMOTE_URL,
      tokenProvider: provider,
      get: transient.get,
      http: httpOptions({ retries: 2 }),
    });
    expect(transient.calls).toHaveLength(2);
    expect(manifest.sources).toHaveLength(1);

    const exhausted = scriptedGet([jsonResponse('busy', 429)]);
    await expect(
      loadManifestFromBackend({
        endpoint: REMOTE_URL,
        tokenProvider: provider,
        get: exhausted.get,
        http: httpOptions({ retries: 2 }),
      }),
    ).rejects.toThrow(ManifestError);
    expect(exhausted.calls).toHaveLength(3);
  });

  test('503 is retried and the retry budget is bounded', async () => {
    const transient = scriptedGet([
      jsonResponse('unavailable', 503),
      jsonResponse(validManifestText()),
    ]);
    const { provider } = fakeToken();
    const manifest = await loadManifestFromBackend({
      endpoint: REMOTE_URL,
      tokenProvider: provider,
      get: transient.get,
      http: httpOptions({ retries: 2 }),
    });
    expect(transient.calls).toHaveLength(2);
    expect(manifest.sources).toHaveLength(1);

    const exhausted = scriptedGet([jsonResponse('unavailable', 503)]);
    await expect(
      loadManifestFromBackend({
        endpoint: REMOTE_URL,
        tokenProvider: provider,
        get: exhausted.get,
        http: httpOptions({ retries: 2 }),
      }),
    ).rejects.toThrow(ManifestError);
    expect(exhausted.calls).toHaveLength(3);
  });

  test('nodeFetchGetWithHeaders issues a GET with no request body', async () => {
    const originalFetch = global.fetch;
    const responseBody = '{"schemaVersion":1,"sources":[]}';
    const fetchMock = jest.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(responseBody, { status: 200 }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      const response = await nodeFetchGetWithHeaders(
        REMOTE_MANIFEST_URL,
        { authorization: 'Bearer t', accept: 'application/json' },
        new AbortController().signal,
      );
      expect(response.status).toBe(200);
      expect(await response.readText(1024)).toBe(responseBody);
    } finally {
      global.fetch = originalFetch;
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(String(call[0])).toBe(REMOTE_MANIFEST_URL);
    const init = call[1];
    expect(init?.method).toBe('GET');
    expect(init?.headers).toEqual({ authorization: 'Bearer t', accept: 'application/json' });
    expect(init?.body).toBeUndefined();
  });
});

describe('runWatcher manifest acquisition', () => {
  test('FILE + DRY_RUN performs zero token requests and preserves W1 output', async () => {
    const { dir, manifestPath, stateDir } = setup('file-dry');
    try {
      writeManifestFile(manifestPath);
      const { provider, calls: tokenCalls } = fakeToken();
      const adapter = new FakeAdapter(() => []);
      const outcome = await runWatcher(
        fileConfig(manifestPath, stateDir),
        runDeps(adapter, stateDir, { tokenProvider: provider }),
      );
      expect(outcome.report.dryRun).toBe(true);
      expect(outcome.report.delivery).toBeNull();
      expect(outcome.report.adminiculumBackendWrites).toBe(0);
      expect(tokenCalls.count).toBe(0);
      expect(adapter.calls).toEqual(['32016R0679']);
      expect(fs.readdirSync(stateDir).sort()).toEqual(['state.json']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('BACKEND + DRY_RUN performs exactly one authenticated read and zero backend writes', async () => {
    const { dir, stateDir } = setup('backend-dry');
    try {
      const { provider, calls: tokenCalls } = fakeToken();
      const { get, calls: getCalls } = scriptedGet([jsonResponse(validManifestText())]);
      const { post, calls: postCalls } = scriptedPost([jsonResponse('', 200)]);
      const adapter = new FakeAdapter(() => []);
      const outcome = await runWatcher(
        backendConfig(stateDir),
        runDeps(adapter, stateDir, { manifestGet: get, tokenProvider: provider, post }),
      );
      expect(outcome.report.dryRun).toBe(true);
      expect(outcome.report.delivery).toBeNull();
      expect(outcome.report.adminiculumBackendWrites).toBe(0);
      expect(tokenCalls.count).toBe(1);
      expect(getCalls).toHaveLength(1);
      expect(postCalls).toHaveLength(0);
      expect(adapter.calls).toEqual(['32016R0679']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('BACKEND + DELIVER reuses one token provider for the manifest GET and the delivery POST', async () => {
    const { dir, stateDir } = setup('backend-deliver');
    try {
      const baseline = makeEvent('32016R0679', 'AMENDMENT_PUBLISHED', '31995L0046');
      const fresh = makeEvent('32016R0679', 'AMENDMENT_PUBLISHED', '32003R1882');
      createFileStateStore(stateDir).save({
        schemaVersion: STATE_SCHEMA_VERSION,
        entries: {
          '32016R0679': {
            firstSeenAt: '2026-09-27T00:00:00.000Z',
            events: { [baseline.eventKey]: baseline },
            lastSuccessfulRunId: 'test-run-0',
            lastSuccessfulAt: '2026-09-27T00:00:00.000Z',
          },
        },
      });
      let tokenCount = 0;
      const provider: AccessTokenProvider = {
        async getAccessToken() {
          tokenCount += 1;
          return `token-${tokenCount}`;
        },
      };
      const { get, calls: getCalls } = scriptedGet([jsonResponse(validManifestText())]);
      const { post, calls: postCalls } = scriptedPost([
        jsonResponse(
          JSON.stringify({
            schemaVersion: 1,
            results: [
              { idempotencyKey: fresh.eventKey, status: 'ACCEPTED', reason: null, warnings: [] },
            ],
          }),
        ),
      ]);
      const outcome = await runWatcher(
        backendConfig(stateDir, { deliveryMode: 'DELIVER', deliveryBatchSize: 10 }),
        runDeps(new FakeAdapter(() => [baseline, fresh]), stateDir, {
          manifestGet: get,
          tokenProvider: provider,
          deliveryStore: createFileDeliveryStateStore(stateDir),
          post,
        }),
      );
      expect(getCalls).toHaveLength(1);
      expect(getCalls[0].headers.authorization).toBe('Bearer token-1');
      expect(postCalls).toHaveLength(1);
      expect(postCalls[0].headers.authorization).toBe('Bearer token-2');
      expect(tokenCount).toBe(2);
      expect(outcome.report.delivery!.acceptedCount).toBe(1);
      expect(outcome.report.adminiculumBackendWrites).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('manifest failure blocks CELLAR, delivery and every state write', async () => {
    const { dir, stateDir } = setup('backend-fail');
    try {
      const adapter = new FakeAdapter(() => []);
      const { get, calls: getCalls } = scriptedGet([new Error('fetch failed')]);
      const { post, calls: postCalls } = scriptedPost([]);
      const saves: WatcherState[] = [];
      const store: StateStore = {
        load: () => ({ schemaVersion: STATE_SCHEMA_VERSION, entries: {} }),
        save: (state: WatcherState) => {
          saves.push(state);
        },
      };
      await expect(
        runWatcher(
          backendConfig(stateDir, { deliveryMode: 'DELIVER', deliveryBatchSize: 10 }),
          runDeps(adapter, stateDir, {
            manifestGet: get,
            tokenProvider: fakeToken().provider,
            deliveryStore: createFileDeliveryStateStore(stateDir),
            post,
            store,
          }),
        ),
      ).rejects.toThrow(ManifestError);
      expect(getCalls).toHaveLength(1);
      expect(adapter.calls).toHaveLength(0);
      expect(postCalls).toHaveLength(0);
      expect(saves).toHaveLength(0);
      expect(fs.existsSync(path.join(stateDir, 'state.json'))).toBe(false);
      expect(fs.existsSync(path.join(stateDir, 'delivery.json'))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('BACKEND manifest failure never falls back to an existing local snapshot', async () => {
    const { dir, manifestPath, stateDir } = setup('backend-no-fallback');
    try {
      writeManifestFile(manifestPath);
      const adapter = new FakeAdapter(() => []);
      const { get } = scriptedGet([new Error('fetch failed')]);
      await expect(
        runWatcher(
          backendConfig(stateDir, { manifestPath }),
          runDeps(adapter, stateDir, { manifestGet: get, tokenProvider: fakeToken().provider }),
        ),
      ).rejects.toThrow(ManifestError);
      expect(fs.existsSync(manifestPath)).toBe(true);
      expect(adapter.calls).toHaveLength(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('BACKEND manifest mode requires an app-only token provider at runtime', async () => {
    const { dir, stateDir } = setup('backend-no-provider');
    try {
      const { get } = scriptedGet([jsonResponse(validManifestText())]);
      await expect(
        runWatcher(backendConfig(stateDir), runDeps(new FakeAdapter(() => []), stateDir, {
          manifestGet: get,
        })),
      ).rejects.toThrow(ConfigError);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
