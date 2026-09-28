/**
 * Injectable app-only access-token boundary for W2 delivery.
 *
 * Two explicit app-only modes:
 *  - CLIENT_SECRET: OAuth2 client-credentials grant against Entra ID with
 *    environment configuration (preserved unchanged; the default mode).
 *  - MANAGED_IDENTITY: the Azure runtime managed-identity token endpoint
 *    (`IDENTITY_ENDPOINT` + `IDENTITY_HEADER`, App Service / Container Apps
 *    "2019-08-01" contract) for the Adminiculum API resource.
 *
 * No Azure SDK dependency, no `az login`, no human/workforce token, no token
 * persistence, and tokens/secrets/identity headers are never logged or
 * embedded in error messages. Tokens are cached in memory only until shortly
 * before their advertised expiry.
 */
export interface AccessTokenProvider {
  getAccessToken(): Promise<string>;
}

export class TokenProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'TokenProviderError';
  }
}

export interface AppOnlyTokenConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** e.g. api://<backend-app-id>/.default */
  scope: string;
  authorityHost?: string;
}

export interface ClientCredentialsTokenProviderOptions extends AppOnlyTokenConfig {
  fetchFn?: typeof fetch;
  nowMs?: () => number;
  /** Refresh this many ms before expiry. Default 60000. */
  skewMs?: number;
}

const DEFAULT_AUTHORITY_HOST = 'https://login.microsoftonline.com';

function parseTokenResponse(text: string): { accessToken: string; expiresInSeconds: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TokenProviderError(
      'token endpoint returned a non-JSON response',
      'MALFORMED_TOKEN_RESPONSE',
    );
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TokenProviderError(
      'token endpoint returned an unexpected response shape',
      'MALFORMED_TOKEN_RESPONSE',
    );
  }
  const obj = parsed as Record<string, unknown>;
  const accessToken = obj.access_token;
  const expiresIn = obj.expires_in;
  const expiresInSeconds =
    typeof expiresIn === 'number'
      ? expiresIn
      : typeof expiresIn === 'string' && /^\d+$/.test(expiresIn)
        ? Number.parseInt(expiresIn, 10)
        : Number.NaN;
  if (typeof accessToken !== 'string' || accessToken === '') {
    throw new TokenProviderError(
      'token response is missing access_token',
      'MALFORMED_TOKEN_RESPONSE',
    );
  }
  if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new TokenProviderError(
      'token response is missing a valid expires_in',
      'MALFORMED_TOKEN_RESPONSE',
    );
  }
  return { accessToken, expiresInSeconds };
}

export function createClientCredentialsTokenProvider(
  options: ClientCredentialsTokenProviderOptions,
): AccessTokenProvider {
  const fetchFn = options.fetchFn ?? fetch;
  const nowMs = options.nowMs ?? (() => Date.now());
  const skewMs = options.skewMs ?? 60_000;
  const authorityHost = (options.authorityHost ?? DEFAULT_AUTHORITY_HOST).replace(/\/+$/, '');
  const tokenUrl = `${authorityHost}/${encodeURIComponent(options.tenantId)}/oauth2/v2.0/token`;

  let cached: { token: string; expiresAtMs: number } | null = null;

  return {
    async getAccessToken(): Promise<string> {
      if (cached !== null && nowMs() < cached.expiresAtMs) {
        return cached.token;
      }
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: options.clientId,
        client_secret: options.clientSecret,
        scope: options.scope,
      }).toString();
      let response: Response;
      try {
        response = await fetchFn(tokenUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body,
        });
      } catch {
        throw new TokenProviderError(
          'token endpoint is unreachable',
          'TOKEN_ENDPOINT_UNREACHABLE',
        );
      }
      const text = await response.text();
      if (!response.ok) {
        let errorCode = '';
        try {
          const parsed = JSON.parse(text) as Record<string, unknown>;
          if (typeof parsed.error === 'string') errorCode = parsed.error;
        } catch {
          // Error body details are intentionally not surfaced.
        }
        throw new TokenProviderError(
          `token request failed with HTTP ${response.status}${errorCode === '' ? '' : ` (${errorCode})`}`,
          'TOKEN_REQUEST_FAILED',
        );
      }
      const { accessToken, expiresInSeconds } = parseTokenResponse(text);
      cached = {
        token: accessToken,
        expiresAtMs: nowMs() + Math.max(0, expiresInSeconds * 1000 - skewMs),
      };
      return accessToken;
    },
  };
}

export interface ManagedIdentityTokenConfig {
  readonly mode: 'MANAGED_IDENTITY';
  /** Entra ID resource of the Adminiculum API, e.g. api://<backend-app-id>. */
  resource: string;
  /** Runtime-injected managed identity endpoint (IDENTITY_ENDPOINT). */
  identityEndpoint: string;
  /** Runtime-injected identity header value (IDENTITY_HEADER). Never logged or persisted. */
  identityHeader: string;
}

export type WatcherTokenConfig = AppOnlyTokenConfig | ManagedIdentityTokenConfig;

export function isManagedIdentityTokenConfig(
  config: WatcherTokenConfig,
): config is ManagedIdentityTokenConfig {
  return (config as Partial<ManagedIdentityTokenConfig>).mode === 'MANAGED_IDENTITY';
}

/**
 * Selects the explicitly configured app-only auth mode. There is no silent
 * fallback: a MANAGED_IDENTITY configuration is never downgraded to
 * CLIENT_SECRET, and vice versa.
 */
export function createTokenProviderFromConfig(config: WatcherTokenConfig): AccessTokenProvider {
  return isManagedIdentityTokenConfig(config)
    ? createManagedIdentityTokenProvider(config)
    : createClientCredentialsTokenProvider(config);
}

const MANAGED_IDENTITY_SCOPE_SUFFIX = '/.default';

/**
 * Managed-identity resources are restricted to the Adminiculum API app ID URI
 * form (`api://<backend-app-id>`), which structurally rejects Graph, ARM and
 * every other `https://` resource. Fails closed on anything else.
 */
export function isValidManagedIdentityResource(resource: string): boolean {
  if (resource === '' || resource !== resource.trim()) return false;
  if (!resource.startsWith('api://')) return false;
  if (/[?#\s]/.test(resource)) return false;
  const remainder = resource.slice('api://'.length);
  if (remainder === '' || remainder.endsWith('/')) return false;
  if (remainder.toLowerCase().includes('.default')) return false;
  return remainder
    .split('/')
    .every((segment) => /^[A-Za-z0-9._~-]+$/.test(segment));
}

/**
 * Derives the token resource from a client-credentials scope. Only a
 * terminal `/.default` is accepted and exactly that suffix is stripped;
 * anything else fails closed (returns null).
 */
export function deriveManagedIdentityResourceFromScope(scope: string): string | null {
  const trimmed = scope.trim();
  if (!trimmed.endsWith(MANAGED_IDENTITY_SCOPE_SUFFIX)) return null;
  const resource = trimmed.slice(0, -MANAGED_IDENTITY_SCOPE_SUFFIX.length);
  return isValidManagedIdentityResource(resource) ? resource : null;
}

export interface ManagedIdentityTokenProviderOptions {
  resource: string;
  identityEndpoint: string;
  identityHeader: string;
  fetchFn?: typeof fetch;
  nowMs?: () => number;
  /** Refresh this many ms before expiry. Default 60000. */
  skewMs?: number;
  /** Bounded MI HTTP timeout. Default 5000 ms. */
  timeoutMs?: number;
}

const DEFAULT_MANAGED_IDENTITY_TIMEOUT_MS = 5_000;

function parsePositiveSeconds(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim())
        ? Number.parseFloat(value)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.NaN;
}

function parseManagedIdentityTokenResponse(
  text: string,
  nowMs: number,
): { accessToken: string; expiresAtMs: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TokenProviderError(
      'managed identity endpoint returned a non-JSON response',
      'MALFORMED_TOKEN_RESPONSE',
    );
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TokenProviderError(
      'managed identity endpoint returned an unexpected response shape',
      'MALFORMED_TOKEN_RESPONSE',
    );
  }
  const obj = parsed as Record<string, unknown>;
  const accessToken = obj.access_token;
  if (typeof accessToken !== 'string' || accessToken === '') {
    throw new TokenProviderError(
      'managed identity response is missing access_token',
      'MALFORMED_TOKEN_RESPONSE',
    );
  }
  // The 2019-08-01 runtime contract returns expires_on (epoch seconds);
  // expires_in is accepted when present so the provider stays compatible.
  const expiresInSeconds = parsePositiveSeconds(obj.expires_in);
  if (Number.isFinite(expiresInSeconds)) {
    return { accessToken, expiresAtMs: nowMs + expiresInSeconds * 1000 };
  }
  const expiresOnSeconds = parsePositiveSeconds(obj.expires_on);
  if (Number.isFinite(expiresOnSeconds)) {
    return { accessToken, expiresAtMs: expiresOnSeconds * 1000 };
  }
  throw new TokenProviderError(
    'managed identity response is missing a valid expiry',
    'MALFORMED_TOKEN_RESPONSE',
  );
}

/**
 * Azure runtime managed-identity provider (system-assigned by default).
 *
 * Requests `api://<backend-app-id>` from the runtime-injected
 * IDENTITY_ENDPOINT with the runtime-injected X-IDENTITY-HEADER. Intended for
 * an Azure Container Apps Job; no user-assigned client-id selector is sent or
 * required. The identity header and the access token never leave this module
 * except as the returned bearer token, are never logged, and are cached in
 * memory only. Malformed or non-200 responses fail closed with a stable
 * TokenProviderError; there is no fallback to any other auth mode.
 */
export function createManagedIdentityTokenProvider(
  options: ManagedIdentityTokenProviderOptions,
): AccessTokenProvider {
  if (!isValidManagedIdentityResource(options.resource)) {
    throw new TokenProviderError(
      'managed identity resource is not a valid api:// Adminiculum API resource',
      'INVALID_RESOURCE',
    );
  }
  const endpointRaw = options.identityEndpoint.trim();
  const identityHeader = options.identityHeader;
  if (endpointRaw === '' || identityHeader === '') {
    throw new TokenProviderError(
      'managed identity runtime endpoint is not configured (IDENTITY_ENDPOINT/IDENTITY_HEADER)',
      'MANAGED_IDENTITY_NOT_CONFIGURED',
    );
  }
  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpointRaw);
  } catch {
    throw new TokenProviderError(
      'managed identity endpoint is not a valid URL',
      'MANAGED_IDENTITY_NOT_CONFIGURED',
    );
  }
  if (endpointUrl.protocol !== 'http:' && endpointUrl.protocol !== 'https:') {
    throw new TokenProviderError(
      'managed identity endpoint must be an http(s) URL',
      'MANAGED_IDENTITY_NOT_CONFIGURED',
    );
  }

  const fetchFn = options.fetchFn ?? fetch;
  const nowMs = options.nowMs ?? (() => Date.now());
  const skewMs = options.skewMs ?? 60_000;
  const timeoutMs = options.timeoutMs ?? DEFAULT_MANAGED_IDENTITY_TIMEOUT_MS;

  let cached: { token: string; expiresAtMs: number } | null = null;

  return {
    async getAccessToken(): Promise<string> {
      if (cached !== null && nowMs() < cached.expiresAtMs) {
        return cached.token;
      }
      const tokenUrl = new URL(endpointUrl.toString());
      tokenUrl.searchParams.set('api-version', '2019-08-01');
      tokenUrl.searchParams.set('resource', options.resource);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let status = 0;
      let ok = false;
      let text = '';
      try {
        const response = await fetchFn(tokenUrl.toString(), {
          method: 'GET',
          headers: { 'X-IDENTITY-HEADER': identityHeader },
          signal: controller.signal,
        });
        status = response.status;
        ok = response.ok;
        text = await response.text();
      } catch {
        throw new TokenProviderError(
          'managed identity endpoint is unreachable',
          'TOKEN_ENDPOINT_UNREACHABLE',
        );
      } finally {
        clearTimeout(timer);
      }
      if (!ok) {
        // Response bodies are intentionally not surfaced.
        throw new TokenProviderError(
          `managed identity request failed with HTTP ${status}`,
          'TOKEN_REQUEST_FAILED',
        );
      }
      const now = nowMs();
      const { accessToken, expiresAtMs } = parseManagedIdentityTokenResponse(text, now);
      cached = { token: accessToken, expiresAtMs: Math.max(now, expiresAtMs - skewMs) };
      return accessToken;
    },
  };
}
