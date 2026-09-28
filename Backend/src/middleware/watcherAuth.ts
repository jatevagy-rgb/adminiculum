/**
 * W2 — DEDICATED watcher machine authentication.
 *
 * This middleware authorizes ONLY the external legal-source watcher calling the
 * machine ingestion endpoint as an Entra APPLICATION (client credentials).
 *
 * It deliberately does NOT reuse the human `authenticate` middleware: that path
 * performs a DB User lookup, human role mapping and a local-JWT fallback. None of
 * those may authorize this endpoint. The low-level cryptographic Entra
 * validation path is the same proven one (JWKS signature, tenant issuer,
 * audience, RS256 expiry) — this file only re-expresses it narrowly.
 *
 * Fail-closed contract:
 *  - missing bearer token                               → 401
 *  - invalid signature / issuer / audience / expiry     → 401
 *  - valid Entra APP token without `LegalSource.Ingest` → 403
 *  - delegated user / workforce / client-portal token   → 403 (not app-only)
 *  - app token from an unexpected client id             → 403 (when pinned)
 *  - missing required server configuration              → 503, never authorizes
 *
 * No DB access, no local JWT, no user resolution happen anywhere in this file.
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

export const WATCHER_INGEST_ROLE = 'LegalSource.Ingest';

export interface WatcherAuthConfig {
  tenantId: string;
  /** Accepted audience forms of the backend API (bare client id and api:// id). */
  audiences: string[];
  requiredRole: string;
  /** Pinned watcher application/client id; required in production. */
  watcherClientId: string | null;
}

export type WatcherConfigResolution =
  | { ok: true; config: WatcherAuthConfig }
  | { ok: false; missing: string[] };

/** Accept both the api://<clientId> and bare <clientId> audience forms (Entra v1/v2). */
export function acceptedAudiences(configuredAudience: string): string[] {
  const value = String(configuredAudience || '').trim();
  if (!value) return [];
  const set = new Set<string>([value]);
  if (value.startsWith('api://')) set.add(value.slice('api://'.length));
  else set.add(`api://${value}`);
  return [...set];
}

/**
 * Resolve the machine-auth configuration from the environment. Production
 * REQUIRES the watcher client id pin; development/test may omit it (no pin).
 */
export function resolveWatcherAuthConfig(env: NodeJS.ProcessEnv = process.env): WatcherConfigResolution {
  const tenantId = String(env.AZURE_AD_TENANT_ID || '').trim();
  const audiences = String(env.AZURE_AD_AUDIENCE || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .flatMap((audience) => acceptedAudiences(audience));
  const watcherClientId = String(env.LEGAL_WATCHER_CLIENT_ID || '').trim() || null;
  const isProduction = String(env.NODE_ENV || 'development') === 'production';

  const missing: string[] = [];
  if (!tenantId) missing.push('AZURE_AD_TENANT_ID');
  if (!audiences.length) missing.push('AZURE_AD_AUDIENCE');
  if (isProduction && !watcherClientId) missing.push('LEGAL_WATCHER_CLIENT_ID');
  if (missing.length) return { ok: false, missing };

  return {
    ok: true,
    config: { tenantId, audiences: [...new Set(audiences)], requiredRole: WATCHER_INGEST_ROLE, watcherClientId },
  };
}

const jwksByTenant = new Map<string, ReturnType<typeof jwksClient>>();

function signingKeyForTenant(tenantId: string) {
  let client = jwksByTenant.get(tenantId);
  if (!client) {
    client = jwksClient({
      jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
      cache: true,
      rateLimit: true,
    });
    jwksByTenant.set(tenantId, client);
  }
  return client;
}

/**
 * Default verifier: the proven low-level Entra path (signature via tenant JWKS,
 * tenant issuer, accepted audiences, RS256, expiry). It performs NO user lookup
 * and NO fallback authentication of any kind.
 */
export async function verifyWatcherToken(
  token: string,
  config: WatcherAuthConfig,
): Promise<Record<string, unknown>> {
  const client = signingKeyForTenant(config.tenantId);
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    jwt.verify(
      token,
      (header, callback) => {
        if (!header.kid) {
          callback(new Error('Token key id is missing.'));
          return;
        }
        client.getSigningKey(header.kid, (error, key) => {
          if (error) {
            callback(error);
            return;
          }
          callback(null, key?.getPublicKey());
        });
      },
      {
        audience: config.audiences as [string, ...string[]],
        issuer: [
          `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
          `https://sts.windows.net/${config.tenantId}/`,
        ],
        algorithms: ['RS256'],
      },
      (error, decoded) => {
        if (error) {
          reject(error);
          return;
        }
        resolve((decoded as Record<string, unknown>) || {});
      },
    );
  });
}

export type WatcherTokenVerifier = (token: string, config: WatcherAuthConfig) => Promise<Record<string, unknown>>;

export interface WatcherPrincipal {
  clientId: string | null;
  roles: string[];
  subject: string | null;
}

declare global {
  namespace Express {
    interface Request {
      watcherPrincipal?: WatcherPrincipal;
    }
  }
}

function stringClaim(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * An Entra APP (client-credentials) token. v2 tokens declare `idtyp: "app"`;
 * v1 app tokens carry `appid`, app `roles` and none of the delegated-user
 * claims, so they are accepted by the fallback rule only in that exact shape.
 */
export function isAppOnlyToken(payload: Record<string, unknown>): boolean {
  if (stringClaim(payload, 'idtyp') === 'app') return true;
  if (stringClaim(payload, 'idtyp') === 'user') return false;
  const hasDelegatedMarker = ['scp', 'upn', 'unique_name', 'preferred_username', 'email'].some(
    (key) => stringClaim(payload, key) !== '',
  );
  if (hasDelegatedMarker) return false;
  return stringClaim(payload, 'appid') !== '' || stringClaim(payload, 'azp') !== '';
}

export function tokenRoles(payload: Record<string, unknown>): string[] {
  if (!Array.isArray(payload.roles)) return [];
  return payload.roles.map((role) => String(role).trim()).filter(Boolean);
}

export function tokenClientId(payload: Record<string, unknown>): string | null {
  return stringClaim(payload, 'azp') || stringClaim(payload, 'appid') || null;
}

export interface WatcherMachineAuthDeps {
  env?: NodeJS.ProcessEnv;
  verify?: WatcherTokenVerifier;
}

function deny(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ status, code, message });
}

/**
 * Build the watcher machine-auth middleware. The default instance reads the
 * process environment and uses the real Entra verifier; tests may inject a fixed
 * environment and a stub verifier.
 */
export function createWatcherMachineAuth(deps: WatcherMachineAuthDeps = {}) {
  const resolution = resolveWatcherAuthConfig(deps.env ?? process.env);
  const verify = deps.verify ?? verifyWatcherToken;

  return async function watcherMachineAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (resolution.ok === false) {
      deny(res, 503, 'MACHINE_AUTH_NOT_CONFIGURED', 'Machine authentication is not configured.');
      return;
    }
    const config = resolution.config;

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      deny(res, 401, 'MACHINE_AUTH_REQUIRED', 'Machine bearer token is required.');
      return;
    }
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      deny(res, 401, 'MACHINE_AUTH_REQUIRED', 'Machine bearer token is required.');
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = await verify(token, config);
    } catch {
      deny(res, 401, 'MACHINE_TOKEN_INVALID', 'Machine token is invalid.');
      return;
    }

    if (!isAppOnlyToken(payload)) {
      deny(res, 403, 'MACHINE_APP_TOKEN_REQUIRED', 'An application (app-only) token is required.');
      return;
    }

    if (!tokenRoles(payload).includes(config.requiredRole)) {
      deny(res, 403, 'MACHINE_ROLE_REQUIRED', 'The token is missing the required application role.');
      return;
    }

    const clientId = tokenClientId(payload);
    if (config.watcherClientId && clientId !== config.watcherClientId) {
      deny(res, 403, 'MACHINE_PRINCIPAL_NOT_ALLOWED', 'This application principal is not allowed to ingest observations.');
      return;
    }

    req.watcherPrincipal = {
      clientId,
      roles: tokenRoles(payload),
      subject: stringClaim(payload, 'sub') || stringClaim(payload, 'oid') || null,
    };
    next();
  };
}

export const watcherMachineAuth = createWatcherMachineAuth();
export default watcherMachineAuth;
