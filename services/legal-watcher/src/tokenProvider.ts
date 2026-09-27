/**
 * Injectable app-only access-token boundary for W2 delivery.
 *
 * Tests use a fake provider; production wiring uses the OAuth2
 * client-credentials grant against Entra ID with environment configuration.
 * No Azure SDK dependency, no `az login`, no human/workforce token, no token
 * persistence, and tokens/secret values are never logged or embedded in
 * error messages. The token is cached in memory only until shortly before
 * its advertised expiry.
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
