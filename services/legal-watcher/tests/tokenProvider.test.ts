/**
 * App-only token provider tests:
 *  - CLIENT_SECRET behavior preserved (exact request shape, in-memory cache,
 *    stable fail-closed error codes)
 *  - MANAGED_IDENTITY: IDENTITY_ENDPOINT + X-IDENTITY-HEADER, Adminiculum API
 *    resource only (never Graph/ARM), in-memory cache, bounded timeout,
 *    fail-closed malformed/non-200 responses, no silent fallback
 *  - the identity header and access token never enter errors, logs, report or
 *    state
 *  - W2 delivery behavior is unchanged when a managed identity provides the
 *    bearer token
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { EurlexAdapter } from '../src/adapters/eurlex';
import { createFileStateStore } from '../src/capture';
import type { WatcherConfig } from '../src/config';
import { createFileDeliveryStateStore, type DeliveryPostFn } from '../src/delivery';
import type { HttpStreamResponse } from '../src/http';
import { runWatcher, type WatcherDeps } from '../src/index';
import { createJsonLogger, type Logger } from '../src/logging';
import {
  createClientCredentialsTokenProvider,
  createManagedIdentityTokenProvider,
  createTokenProviderFromConfig,
  deriveManagedIdentityResourceFromScope,
  isValidManagedIdentityResource,
  TokenProviderError,
  type AccessTokenProvider,
} from '../src/tokenProvider';
import { W2_ENDPOINT_PATH, W2_SCHEMA_VERSION, type ObservationEvent } from '../src/types';
import { jsonResponse, makeEvent } from './helpers';

const NOW_MS = 1_790_000_000_000;
const EXPIRES_ON = String(Math.floor(NOW_MS / 1000) + 3600);

const CC_CONFIG = {
  tenantId: 'tenant-x',
  clientId: 'client-x',
  clientSecret: 'secret-x',
  scope: 'api://adminiculum-backend/.default',
};

const MI_RESOURCE = 'api://adminiculum-backend';
const MI_ENDPOINT = 'http://127.0.0.1:41898/msi/token';
const MI_HEADER = 'runtime-identity-header-secret';
const MI_TOKEN = 'mi-access-token-xyz';

function miTokenBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    access_token: MI_TOKEN,
    expires_on: EXPIRES_ON,
    token_type: 'Bearer',
    resource: MI_RESOURCE,
    ...overrides,
  });
}

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

type FetchStep =
  | { status?: number; body?: string }
  | Error
  | ((call: FetchCall) => { status?: number; body?: string } | Error);

function scriptedFetch(script: FetchStep[]): { fetchFn: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  let index = 0;
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    if (init?.headers !== undefined) {
      for (const [key, value] of Object.entries(init.headers as Record<string, string>)) {
        headers[key] = value;
      }
    }
    const call: FetchCall = {
      url:
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url,
      method: init?.method ?? 'GET',
      headers,
      body: typeof init?.body === 'string' ? init.body : '',
    };
    calls.push(call);
    const step = script[Math.min(index, script.length - 1)];
    index++;
    if (step === undefined) throw new Error('unexpected fetch call');
    const result = typeof step === 'function' ? step(call) : step;
    if (result instanceof Error) throw result;
    return new Response(result.body ?? '', { status: result.status ?? 200 });
  }) as typeof fetch;
  return { fetchFn, calls };
}

function miProvider(
  script: FetchStep[],
  overrides: Partial<Parameters<typeof createManagedIdentityTokenProvider>[0]> = {},
): { provider: AccessTokenProvider; calls: FetchCall[] } {
  const { fetchFn, calls } = scriptedFetch(script);
  const provider = createManagedIdentityTokenProvider({
    resource: MI_RESOURCE,
    identityEndpoint: MI_ENDPOINT,
    identityHeader: MI_HEADER,
    fetchFn,
    nowMs: () => NOW_MS,
    ...overrides,
  });
  return { provider, calls };
}

describe('client credentials provider (preserved)', () => {
  test('requests the Entra token endpoint with the exact grant and caches in memory', async () => {
    const { fetchFn, calls } = scriptedFetch([
      { status: 200, body: JSON.stringify({ access_token: 'cc-token', expires_in: 3600 }) },
    ]);
    const provider = createClientCredentialsTokenProvider({
      ...CC_CONFIG,
      fetchFn,
      nowMs: () => NOW_MS,
    });
    await expect(provider.getAccessToken()).resolves.toBe('cc-token');
    await expect(provider.getAccessToken()).resolves.toBe('cc-token');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://login.microsoftonline.com/tenant-x/oauth2/v2.0/token');
    expect(calls[0].method).toBe('POST');
    const form = new URLSearchParams(calls[0].body);
    expect(form.get('grant_type')).toBe('client_credentials');
    expect(form.get('client_id')).toBe('client-x');
    expect(form.get('client_secret')).toBe('secret-x');
    expect(form.get('scope')).toBe('api://adminiculum-backend/.default');
  });

  test('non-200 fails closed with the stable TOKEN_REQUEST_FAILED code', async () => {
    const { fetchFn } = scriptedFetch([{ status: 400, body: '{"error":"invalid_client"}' }]);
    const cc = createClientCredentialsTokenProvider({ ...CC_CONFIG, fetchFn, nowMs: () => NOW_MS });
    const error = await cc.getAccessToken().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(TokenProviderError);
    expect((error as TokenProviderError).code).toBe('TOKEN_REQUEST_FAILED');
  });

  test('unreachable Entra endpoint fails closed with TOKEN_ENDPOINT_UNREACHABLE', async () => {
    const { fetchFn } = scriptedFetch([new Error('connect ECONNREFUSED')]);
    const cc = createClientCredentialsTokenProvider({ ...CC_CONFIG, fetchFn, nowMs: () => NOW_MS });
    await expect(cc.getAccessToken()).rejects.toMatchObject({
      name: 'TokenProviderError',
      code: 'TOKEN_ENDPOINT_UNREACHABLE',
    });
  });
});

describe('managed identity provider', () => {
  test('requests IDENTITY_ENDPOINT for the Adminiculum API resource with the identity header', async () => {
    const { provider, calls } = miProvider([{ status: 200, body: miTokenBody() }]);
    await expect(provider.getAccessToken()).resolves.toBe(MI_TOKEN);
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(`${url.origin}${url.pathname}`).toBe(MI_ENDPOINT);
    expect(url.searchParams.get('api-version')).toBe('2019-08-01');
    expect(url.searchParams.get('resource')).toBe(MI_RESOURCE);
    expect(url.searchParams.get('client_id')).toBeNull();
    expect(calls[0].method).toBe('GET');
    expect(calls[0].headers['X-IDENTITY-HEADER']).toBe(MI_HEADER);
    expect(calls[0].headers.authorization).toBeUndefined();
    expect(calls[0].body).toBe('');
    // Never Graph, ARM or any other accidental resource.
    expect(calls[0].url).not.toContain('graph.microsoft.com');
    expect(calls[0].url).not.toContain('management.azure.com');
    expect(calls[0].url).not.toContain('client_secret');
  });

  test('caches the managed identity token in memory and refreshes only after expiry', async () => {
    let now = NOW_MS;
    const { fetchFn, calls } = scriptedFetch([{ status: 200, body: miTokenBody() }]);
    const provider = createManagedIdentityTokenProvider({
      resource: MI_RESOURCE,
      identityEndpoint: MI_ENDPOINT,
      identityHeader: MI_HEADER,
      fetchFn,
      nowMs: () => now,
    });
    await expect(provider.getAccessToken()).resolves.toBe(MI_TOKEN);
    await expect(provider.getAccessToken()).resolves.toBe(MI_TOKEN);
    expect(calls).toHaveLength(1);
    now = NOW_MS + 3_600_000 + 1;
    await expect(provider.getAccessToken()).resolves.toBe(MI_TOKEN);
    expect(calls).toHaveLength(2);
  });

  test('accepts expires_in when the runtime returns it instead of expires_on', async () => {
    const { provider, calls } = miProvider([
      { status: 200, body: miTokenBody({ expires_on: undefined, expires_in: '3599' }) },
    ]);
    await expect(provider.getAccessToken()).resolves.toBe(MI_TOKEN);
    expect(calls).toHaveLength(1);
  });

  test('malformed managed identity responses fail closed with MALFORMED_TOKEN_RESPONSE', async () => {
    const bodies = [
      'not json',
      '[1,2,3]',
      JSON.stringify({ expires_on: EXPIRES_ON }),
      JSON.stringify({ access_token: MI_TOKEN }),
      JSON.stringify({ access_token: '', expires_on: EXPIRES_ON }),
      JSON.stringify({ access_token: MI_TOKEN, expires_on: 'not-a-number' }),
    ];
    for (const body of bodies) {
      const { provider } = miProvider([{ status: 200, body }]);
      const error = await provider.getAccessToken().catch((err: unknown) => err);
      expect(error).toBeInstanceOf(TokenProviderError);
      expect((error as TokenProviderError).code).toBe('MALFORMED_TOKEN_RESPONSE');
    }
  });

  test('HTTP 4xx/5xx fail closed and are never cached', async () => {
    for (const status of [400, 401, 403, 500, 503]) {
      const { provider, calls } = miProvider([{ status, body: `failure ${MI_TOKEN}` }]);
      const first = await provider.getAccessToken().catch((err: unknown) => err);
      expect(first).toBeInstanceOf(TokenProviderError);
      expect((first as TokenProviderError).code).toBe('TOKEN_REQUEST_FAILED');
      await provider.getAccessToken().catch(() => undefined);
      expect(calls).toHaveLength(2);
    }
  });

  test('unreachable managed identity endpoint fails closed', async () => {
    const { provider } = miProvider([new Error('connect ECONNREFUSED')]);
    await expect(provider.getAccessToken()).rejects.toMatchObject({
      name: 'TokenProviderError',
      code: 'TOKEN_ENDPOINT_UNREACHABLE',
    });
  });

  test('managed identity HTTP is bounded by a timeout', async () => {
    const hangingFetch = (async (_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      })) as typeof fetch;
    const provider = createManagedIdentityTokenProvider({
      resource: MI_RESOURCE,
      identityEndpoint: MI_ENDPOINT,
      identityHeader: MI_HEADER,
      fetchFn: hangingFetch,
      nowMs: () => NOW_MS,
      timeoutMs: 25,
    });
    await expect(provider.getAccessToken()).rejects.toMatchObject({
      name: 'TokenProviderError',
      code: 'TOKEN_ENDPOINT_UNREACHABLE',
    });
  });

  test('invalid resources fail closed at construction', () => {
    const invalidResources = [
      'https://graph.microsoft.com',
      'https://management.azure.com/',
      'https://adminiculum.example/.default',
      'api://adminiculum-backend/',
      'api://adminiculum-backend/.default',
      'api://',
      'api://bad resource',
    ];
    for (const resource of invalidResources) {
      expect(() =>
        createManagedIdentityTokenProvider({
          resource,
          identityEndpoint: MI_ENDPOINT,
          identityHeader: MI_HEADER,
        }),
      ).toThrow(TokenProviderError);
      try {
        createManagedIdentityTokenProvider({
          resource,
          identityEndpoint: MI_ENDPOINT,
          identityHeader: MI_HEADER,
        });
      } catch (err) {
        expect((err as TokenProviderError).code).toBe('INVALID_RESOURCE');
      }
    }
  });

  test('missing or invalid runtime endpoint/header fails closed at construction', () => {
    const cases = [
      { identityEndpoint: '', identityHeader: MI_HEADER },
      { identityEndpoint: MI_ENDPOINT, identityHeader: '' },
      { identityEndpoint: 'not a url', identityHeader: MI_HEADER },
      { identityEndpoint: 'ftp://127.0.0.1/token', identityHeader: MI_HEADER },
    ];
    for (const options of cases) {
      try {
        createManagedIdentityTokenProvider({ resource: MI_RESOURCE, ...options });
        throw new Error('expected construction to fail');
      } catch (err) {
        expect(err).toBeInstanceOf(TokenProviderError);
        expect((err as TokenProviderError).code).toBe('MANAGED_IDENTITY_NOT_CONFIGURED');
      }
    }
  });

  test('identity header and token never appear in failure messages', async () => {
    const { provider } = miProvider([{ status: 401, body: `leaked ${MI_TOKEN} ${MI_HEADER}` }]);
    const error = await provider.getAccessToken().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(TokenProviderError);
    const message = (error as Error).message;
    expect(message).not.toContain(MI_HEADER);
    expect(message).not.toContain(MI_TOKEN);
  });

  test('createTokenProviderFromConfig routes MANAGED_IDENTITY to the runtime endpoint, never to Entra', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(miTokenBody(), { status: 200 }));
    try {
      const provider = createTokenProviderFromConfig({
        mode: 'MANAGED_IDENTITY',
        resource: MI_RESOURCE,
        identityEndpoint: MI_ENDPOINT,
        identityHeader: MI_HEADER,
      });
      await expect(provider.getAccessToken()).resolves.toBe(MI_TOKEN);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const calledUrl = String(fetchSpy.mock.calls[0][0]);
      expect(calledUrl.startsWith(MI_ENDPOINT)).toBe(true);
      expect(calledUrl).not.toContain('login.microsoftonline.com');
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('managed identity resource derivation', () => {
  test('only api:// resources are valid', () => {
    expect(isValidManagedIdentityResource('api://adminiculum-backend')).toBe(true);
    expect(isValidManagedIdentityResource('api://11111111-2222-3333-4444-555555555555')).toBe(true);
    expect(isValidManagedIdentityResource('https://graph.microsoft.com')).toBe(false);
    expect(isValidManagedIdentityResource('https://management.azure.com')).toBe(false);
    expect(isValidManagedIdentityResource('api://adminiculum-backend/')).toBe(false);
    expect(isValidManagedIdentityResource('api://adminiculum-backend/.default')).toBe(false);
    expect(isValidManagedIdentityResource('api://')).toBe(false);
    expect(isValidManagedIdentityResource('api://a//b')).toBe(false);
    expect(isValidManagedIdentityResource(' api://a')).toBe(false);
    expect(isValidManagedIdentityResource('api://a?x=1')).toBe(false);
  });

  test('only a terminal /.default scope is stripped; anything else fails closed', () => {
    expect(deriveManagedIdentityResourceFromScope('api://adminiculum-backend/.default')).toBe(
      'api://adminiculum-backend',
    );
    expect(deriveManagedIdentityResourceFromScope('api://11111111-2222-3333-4444-5555/.default')).toBe(
      'api://11111111-2222-3333-4444-5555',
    );
    expect(deriveManagedIdentityResourceFromScope('https://graph.microsoft.com/.default')).toBeNull();
    expect(deriveManagedIdentityResourceFromScope('api://adminiculum-backend')).toBeNull();
    expect(deriveManagedIdentityResourceFromScope('api://adminiculum-backend/user_impersonation')).toBeNull();
    expect(deriveManagedIdentityResourceFromScope('api://adminiculum-backend/.default/.default')).toBeNull();
    expect(deriveManagedIdentityResourceFromScope('')).toBeNull();
  });
});

describe('integration: W2 delivery with managed identity', () => {
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

  class FakeAdapter implements EurlexAdapter {
    constructor(private readonly behavior: () => ObservationEvent[] | Error) {}
    async observe(_celex: string): Promise<ObservationEvent[]> {
      const result = this.behavior();
      if (result instanceof Error) throw result;
      return result;
    }
  }

  interface PostCall {
    url: string;
    body: string;
    headers: Record<string, string>;
  }

  function scriptedPost(responses: HttpStreamResponse[]): {
    post: DeliveryPostFn;
    calls: PostCall[];
  } {
    const calls: PostCall[] = [];
    let index = 0;
    const post: DeliveryPostFn = async (url, body, headers, _signal) => {
      calls.push({ url, body, headers });
      const step = responses[Math.min(index, responses.length - 1)];
      index++;
      if (step === undefined) throw new Error('unexpected POST');
      return step;
    };
    return { post, calls };
  }

  function runDeps(
    adapter: EurlexAdapter,
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

  function writeManifest(manifestPath: string): void {
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        schemaVersion: 1,
        generatedAt: '2026-09-27T00:00:00Z',
        sources: [
          {
            identifierFamily: 'CELEX',
            sourceIdentifier: '32016R0679',
            locators: [],
            referenceCount: 1,
          },
        ],
      }),
      'utf8',
    );
  }

  function w2Response(key: string, status: 'ACCEPTED' | 'DUPLICATE'): HttpStreamResponse {
    return jsonResponse(
      JSON.stringify({
        schemaVersion: W2_SCHEMA_VERSION,
        results: [{ idempotencyKey: key, status, reason: null, warnings: [] }],
      }),
    );
  }

  test('DRY_RUN (baseline) invokes no token provider even when one is injected', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-mi-dry-'));
    const manifestPath = path.join(dir, 'manifest.json');
    const stateDir = path.join(dir, 'state');
    try {
      writeManifest(manifestPath);
      let called = 0;
      const provider: AccessTokenProvider = {
        async getAccessToken(): Promise<string> {
          called++;
          throw new Error('DRY_RUN must not request a token');
        },
      };
      const outcome = await runWatcher(
        watcherConfig(manifestPath, stateDir),
        runDeps(new FakeAdapter(() => [makeEvent('32016R0679', 'AMENDMENT_PUBLISHED', '31995L0046')]), stateDir, {
          tokenProvider: provider,
        }),
      );
      expect(outcome.report.dryRun).toBe(true);
      expect(called).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('managed identity bearer token delivers the unchanged W2 envelope and never leaks', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-mi-deliver-'));
    const manifestPath = path.join(dir, 'manifest.json');
    const stateDir = path.join(dir, 'state');
    try {
      writeManifest(manifestPath);
      const k1 = makeEvent('32016R0679', 'AMENDMENT_PUBLISHED', '31995L0046');
      const k2 = makeEvent('32016R0679', 'AMENDMENT_PUBLISHED', '32003R1882');

      const baseline = await runWatcher(
        watcherConfig(manifestPath, stateDir),
        runDeps(new FakeAdapter(() => [k1]), stateDir),
      );
      expect(baseline.report.firstSeenBaselineCount).toBe(1);

      const { fetchFn, calls: miCalls } = scriptedFetch([{ status: 200, body: miTokenBody() }]);
      const provider = createManagedIdentityTokenProvider({
        resource: MI_RESOURCE,
        identityEndpoint: MI_ENDPOINT,
        identityHeader: MI_HEADER,
        fetchFn,
        nowMs: () => NOW_MS,
      });
      const { post, calls: posts } = scriptedPost([w2Response(k2.eventKey, 'ACCEPTED')]);
      const logSink: string[] = [];
      const outcome = await runWatcher(
        watcherConfig(manifestPath, stateDir, {
          deliveryMode: 'DELIVER',
          backendEndpoint: 'https://backend.example.test',
          deliveryBatchSize: 10,
        }),
        runDeps(new FakeAdapter(() => [k1, k2]), stateDir, {
          post,
          tokenProvider: provider,
          logSink,
        }),
      );

      expect(miCalls).toHaveLength(1);
      expect(miCalls[0].headers['X-IDENTITY-HEADER']).toBe(MI_HEADER);
      expect(posts).toHaveLength(1);
      expect(posts[0].url).toBe(`https://backend.example.test${W2_ENDPOINT_PATH}`);
      expect(posts[0].headers.authorization).toBe(`Bearer ${MI_TOKEN}`);
      expect(posts[0].headers['X-IDENTITY-HEADER']).toBeUndefined();
      const envelope = JSON.parse(posts[0].body);
      expect(envelope.schemaVersion).toBe(W2_SCHEMA_VERSION);
      expect(
        envelope.observations.map((observation: { idempotencyKey: string }) => observation.idempotencyKey),
      ).toEqual([k2.eventKey]);
      expect(outcome.report.dryRun).toBe(false);
      expect(outcome.report.delivery!.acceptedCount).toBe(1);
      expect(outcome.report.adminiculumBackendWrites).toBe(1);

      const artifacts = [
        JSON.stringify(outcome.report),
        fs.readFileSync(path.join(stateDir, 'state.json'), 'utf8'),
        fs.readFileSync(path.join(stateDir, 'delivery.json'), 'utf8'),
        ...logSink,
      ];
      for (const artifact of artifacts) {
        expect(artifact).not.toContain(MI_TOKEN);
        expect(artifact).not.toContain(MI_HEADER);
      }
      const deliveryState = createFileDeliveryStateStore(stateDir).load();
      expect(deliveryState.delivered[k2.eventKey]).toEqual({
        deliveredAt: '2026-09-27T12:00:00.000Z',
        backendStatus: 'ACCEPTED',
      });
      const sourceState = createFileStateStore(stateDir).load();
      expect(sourceState.entries['32016R0679'].events[k2.eventKey]).toBeDefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
