/**
 * W2 — watcher machine auth (no database, no network).
 *
 * Proves the dedicated machine-auth boundary:
 *  - only a valid Entra APP token for the backend API audience, carrying the
 *    LegalSource.Ingest application role and (when pinned) the configured
 *    watcher client id, is accepted;
 *  - delegated workforce tokens, client-portal tokens, local JWTs, and tokens
 *    with the wrong audience/issuer/expiry/signature are all denied;
 *  - missing server configuration fails closed and never authorizes;
 *  - no DB lookup, human role mapping or local-JWT fallback exists in the path.
 */
import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import jwt from 'jsonwebtoken';
import {
  createWatcherMachineAuth,
  isAppOnlyToken,
  resolveWatcherAuthConfig,
  WATCHER_INGEST_ROLE,
} from '../src/middleware/watcherAuth';

const ENV = {
  NODE_ENV: 'test',
  AZURE_AD_TENANT_ID: 'tenant-1',
  AZURE_AD_AUDIENCE: 'api://backend-api',
  LEGAL_WATCHER_CLIENT_ID: 'watcher-app',
} as NodeJS.ProcessEnv;

interface RunResult {
  status: number;
  body?: { code?: string; status?: number };
  next: boolean;
  principal?: { clientId: string | null; roles: string[] };
}

function run(middleware: any, headers: Record<string, string>): Promise<RunResult> {
  return new Promise<RunResult>((resolve) => {
    const req: any = { headers };
    const res: any = {
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: any) {
        resolve({ status: this.statusCode, body: payload, next: false, principal: req.watcherPrincipal });
        return this;
      },
    };
    middleware(req, res, () => resolve({ status: 200, next: true, principal: req.watcherPrincipal }));
  });
}

function appToken(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    idtyp: 'app',
    azp: 'watcher-app',
    appid: 'watcher-app',
    roles: [WATCHER_INGEST_ROLE],
    sub: 'watcher-object-id',
    ...overrides,
  };
}

function authWith(payload: Record<string, unknown>, env: NodeJS.ProcessEnv = ENV) {
  const verify = jest.fn(async () => payload);
  return { middleware: createWatcherMachineAuth({ env, verify: verify as any }), verify };
}

const BEARER = { authorization: 'Bearer test-token' };

describe('watcher machine auth — configuration', () => {
  it('fails closed when required server configuration is missing', async () => {
    const verify = jest.fn(async () => appToken());
    const middleware = createWatcherMachineAuth({ env: { NODE_ENV: 'test' } as NodeJS.ProcessEnv, verify: verify as any });
    const result = await run(middleware, BEARER);
    expect(result).toMatchObject({ status: 503, next: false, body: { code: 'MACHINE_AUTH_NOT_CONFIGURED' } });
    expect(verify).not.toHaveBeenCalled();
  });

  it('requires the watcher client id pin in production', async () => {
    const resolution = resolveWatcherAuthConfig({
      NODE_ENV: 'production',
      AZURE_AD_TENANT_ID: 'tenant-1',
      AZURE_AD_AUDIENCE: 'api://backend-api',
    } as NodeJS.ProcessEnv);
    expect(resolution).toMatchObject({ ok: false, missing: ['LEGAL_WATCHER_CLIENT_ID'] });
    const middleware = createWatcherMachineAuth({
      env: { NODE_ENV: 'production', AZURE_AD_TENANT_ID: 'tenant-1', AZURE_AD_AUDIENCE: 'api://backend-api' } as NodeJS.ProcessEnv,
      verify: (async () => appToken()) as any,
    });
    const result = await run(middleware, BEARER);
    expect(result.status).toBe(503);
  });

  it('accepts both audience forms of the configured backend API', () => {
    const resolution = resolveWatcherAuthConfig(ENV);
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.config.audiences).toEqual(expect.arrayContaining(['api://backend-api', 'backend-api']));
    expect(resolution.config.requiredRole).toBe('LegalSource.Ingest');
    expect(resolution.config.watcherClientId).toBe('watcher-app');
  });
});

describe('watcher machine auth — token rejection', () => {
  it('denies an anonymous request', async () => {
    const { middleware, verify } = authWith(appToken());
    const result = await run(middleware, {});
    expect(result).toMatchObject({ status: 401, next: false, body: { code: 'MACHINE_AUTH_REQUIRED' } });
    expect(verify).not.toHaveBeenCalled();
  });

  it('denies a malformed/invalid token (signature, audience, issuer, expiry all fail closed)', async () => {
    for (const reason of ['invalid signature', 'jwt audience invalid', 'jwt issuer invalid', 'jwt expired']) {
      const middleware = createWatcherMachineAuth({
        env: ENV,
        verify: (async () => { throw new Error(reason); }) as any,
      });
      const result = await run(middleware, BEARER);
      expect(result).toMatchObject({ status: 401, next: false, body: { code: 'MACHINE_TOKEN_INVALID' } });
    }
  });

  it('denies a valid app token missing the LegalSource.Ingest role', async () => {
    const { middleware } = authWith(appToken({ roles: ['Some.Other.Role'] }));
    const result = await run(middleware, BEARER);
    expect(result).toMatchObject({ status: 403, next: false, body: { code: 'MACHINE_ROLE_REQUIRED' } });
  });

  it('denies a delegated workforce token even when it carries the app role', async () => {
    const { middleware } = authWith(appToken({
      idtyp: 'user',
      scp: 'access_as_user',
      upn: 'lawyer@firm.test',
      roles: [WATCHER_INGEST_ROLE],
    }));
    const result = await run(middleware, BEARER);
    expect(result).toMatchObject({ status: 403, next: false, body: { code: 'MACHINE_APP_TOKEN_REQUIRED' } });
  });

  it('denies a v1 delegated token (scp marker, no idtyp)', async () => {
    const payload = appToken({ scp: 'access_as_user', upn: 'lawyer@firm.test' });
    delete (payload as Record<string, unknown>).idtyp;
    const { middleware } = authWith(payload);
    const result = await run(middleware, BEARER);
    expect(result.status).toBe(403);
  });

  it('denies a client-portal token', async () => {
    const { middleware } = authWith({
      idtyp: 'user',
      scp: 'access_as_client',
      azp: 'portal-app',
      sub: 'customer-1',
    });
    const result = await run(middleware, BEARER);
    expect(result).toMatchObject({ status: 403, next: false, body: { code: 'MACHINE_APP_TOKEN_REQUIRED' } });
  });

  it('denies a correct-role app token from the wrong watcher client id', async () => {
    const { middleware } = authWith(appToken({ azp: 'other-app', appid: 'other-app' }));
    const result = await run(middleware, BEARER);
    expect(result).toMatchObject({ status: 403, next: false, body: { code: 'MACHINE_PRINCIPAL_NOT_ALLOWED' } });
  });
});

describe('watcher machine auth — accepted principal', () => {
  it('accepts an app-only token with the right role, audience and pinned principal', async () => {
    const { middleware, verify } = authWith(appToken());
    const result = await run(middleware, BEARER);
    expect(result.next).toBe(true);
    expect(result.principal).toMatchObject({ clientId: 'watcher-app', roles: [WATCHER_INGEST_ROLE] });
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('accepts a v1 app token shape (appid + roles, no delegated claims)', async () => {
    const payload = appToken({ roles: [WATCHER_INGEST_ROLE] });
    delete (payload as Record<string, unknown>).idtyp;
    const { middleware } = authWith(payload);
    const result = await run(middleware, BEARER);
    expect(result.next).toBe(true);
    expect(result.principal?.clientId).toBe('watcher-app');
  });

  it('classifies app-only vs delegated tokens deterministically', () => {
    expect(isAppOnlyToken({ idtyp: 'app', azp: 'a' })).toBe(true);
    expect(isAppOnlyToken({ idtyp: 'user', appid: 'a' })).toBe(false);
    expect(isAppOnlyToken({ appid: 'a', roles: ['x'] })).toBe(true);
    expect(isAppOnlyToken({ azp: 'a', scp: 'access_as_user' })).toBe(false);
    expect(isAppOnlyToken({ azp: 'a', upn: 'x@y.test' })).toBe(false);
    expect(isAppOnlyToken({ azp: 'a', preferred_username: 'x@y.test' })).toBe(false);
    expect(isAppOnlyToken({})).toBe(false);
  });
});

describe('watcher machine auth — default verifier safety (no network)', () => {
  it('rejects a malformed token before any key fetch', async () => {
    const middleware = createWatcherMachineAuth({ env: ENV });
    const result = await run(middleware, { authorization: 'Bearer not-a-jwt' });
    expect(result).toMatchObject({ status: 401, next: false, body: { code: 'MACHINE_TOKEN_INVALID' } });
  });

  it('never authorizes a local-JWT-style token (no local fallback exists)', async () => {
    // A token signed by the repository's local JWT secret carries no Entra kid,
    // so the machine verifier rejects it without any fallback authentication.
    const localToken = jwt.sign({ userId: 'user-1', role: 'ADMIN' }, 'local-secret');
    const middleware = createWatcherMachineAuth({ env: ENV });
    const result = await run(middleware, { authorization: `Bearer ${localToken}` });
    expect(result).toMatchObject({ status: 401, next: false, body: { code: 'MACHINE_TOKEN_INVALID' } });
  });
});

describe('watcher machine auth — static boundary', () => {
  const source = readFileSync(join(__dirname, '..', 'src', 'middleware', 'watcherAuth.ts'), 'utf8');
  const routeSource = readFileSync(join(__dirname, '..', 'src', 'modules', 'compliance', 'legalSourceObservationRoutes.ts'), 'utf8');

  it('performs no DB lookup, human role mapping or local-JWT fallback', () => {
    for (const forbidden of ['prisma', 'jwtConfig', 'requireInternal', 'local-jwt', 'resolveDbUser', 'user.findFirst']) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('guards the machine endpoint with the watcher middleware only', () => {
    expect(routeSource).toContain('watcherMachineAuth');
    expect(routeSource).not.toContain("middleware/auth'");
    expect(routeSource).not.toContain('requireInternal(');
  });

  it('mounts the machine router BEFORE the human-auth CDI router on the shared prefix', () => {
    // The CDI router applies the human `authenticate` middleware to every path;
    // the machine endpoint must be handled first or it would never be reached.
    const indexSource = readFileSync(join(__dirname, '..', 'src', 'index.ts'), 'utf8');
    const machineMount = indexSource.indexOf("app.use('/api/v1/compliance-intelligence', legalSourceObservationRoutes)");
    const cdiMount = indexSource.indexOf("app.use('/api/v1/compliance-intelligence', complianceDocIntelligenceRoutes)");
    expect(machineMount).toBeGreaterThan(-1);
    expect(cdiMount).toBeGreaterThan(-1);
    expect(machineMount).toBeLessThan(cdiMount);
  });
});
