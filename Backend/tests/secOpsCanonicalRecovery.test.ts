/**
 * SEC-0A / OPS canonical recovery — control tests.
 *
 * Covers the security/production-hardening controls recovered onto canonical:
 *  - CORS: explicit allowlist, no arbitrary-Origin reflection (prod or dev).
 *  - Log redaction: query-string stripping + structured-context masking.
 *  - Source-level guards: removed public register, ADMIN/PARTNER user creation,
 *    settings allowlist, no fixed credential, seed/migration production deny,
 *    startup fail-closed.
 */

import fs from 'fs';
import path from 'path';
import { createCorsOptions } from '../src/config/cors';
import { sanitizeUrlForLog, redactObject, isSensitiveKey, REDACTED } from '../src/config/logRedaction';

function originDecision(options: ReturnType<typeof createCorsOptions>, origin: string | undefined): boolean {
  let allowed = false;
  const originFn = options.origin as (
    o: string | undefined,
    cb: (err: Error | null, allow?: boolean) => void,
  ) => void;
  originFn(origin, (_err, allow) => {
    allowed = Boolean(allow);
  });
  return allowed;
}

const read = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

describe('CORS hardening (control K)', () => {
  const prod = () =>
    createCorsOptions({ isProduction: true, productionAllowedOrigins: ['https://app.example.com'], frontendUrl: undefined });
  const dev = () =>
    createCorsOptions({ isProduction: false, productionAllowedOrigins: [], frontendUrl: 'http://localhost:3000' });

  it('allows a configured production origin', () => {
    expect(originDecision(prod(), 'https://app.example.com')).toBe(true);
  });

  it('denies an arbitrary production origin (no reflection)', () => {
    expect(originDecision(prod(), 'https://evil.example.com')).toBe(false);
  });

  it('denies every origin in production when the allowlist is empty (missing config)', () => {
    const empty = createCorsOptions({ isProduction: true, productionAllowedOrigins: [], frontendUrl: undefined });
    expect(originDecision(empty, 'https://app.example.com')).toBe(false);
    expect(originDecision(empty, 'http://localhost:3000')).toBe(false);
  });

  it('development allows localhost and the configured frontend, but not arbitrary origins', () => {
    expect(originDecision(dev(), 'http://localhost:5173')).toBe(true);
    expect(originDecision(dev(), 'http://localhost:3000')).toBe(true);
    expect(originDecision(dev(), 'https://evil.example.com')).toBe(false);
  });

  it('allows requests with no Origin header (same-origin/server-to-server)', () => {
    expect(originDecision(prod(), undefined)).toBe(true);
    expect(originDecision(dev(), undefined)).toBe(true);
  });

  it('source contains no blanket allow-all reflection', () => {
    const cors = read('../src/config/cors.ts');
    // The only unconditional `callback(null, true)` is the no-Origin case.
    expect(cors.split('callback(null, true)').length - 1).toBe(1);
  });
});

describe('Log redaction (controls L/M)', () => {
  it('strips query strings from logged URLs', () => {
    expect(sanitizeUrlForLog('/api/v1/users?token=secret&x=1')).toBe('/api/v1/users');
    expect(sanitizeUrlForLog('/api/v1/health')).toBe('/api/v1/health');
    expect(sanitizeUrlForLog('/p#frag')).toBe('/p');
    expect(sanitizeUrlForLog(undefined)).toBe('');
  });

  it('flags sensitive keys regardless of casing/separators', () => {
    ['Authorization', 'access_token', 'refreshToken', 'Cookie', 'client-secret', 'DATABASE_URL', 'passwordHash'].forEach(
      (key) => expect(isSensitiveKey(key)).toBe(true),
    );
    ['userId', 'email', 'role', 'theme'].forEach((key) => expect(isSensitiveKey(key)).toBe(false));
  });

  it('deep-redacts sensitive fields without mutating the input', () => {
    const input = {
      email: 'a@b.com',
      authorization: 'Bearer abc',
      nested: { refreshToken: 'r', ok: 1 },
    };
    const out = redactObject(input) as any;
    expect(out.email).toBe('a@b.com');
    expect(out.authorization).toBe(REDACTED);
    expect(out.nested.refreshToken).toBe(REDACTED);
    expect(out.nested.ok).toBe(1);
    // original untouched
    expect(input.authorization).toBe('Bearer abc');
  });

  it('index.ts wires the query-stripping url token before morgan', () => {
    const index = read('../src/index.ts');
    expect(index).toContain("morgan.token('url'");
    expect(index).toContain('sanitizeUrlForLog');
  });
});

describe('Auth/register removal (control A)', () => {
  it('has no /register route in the workforce auth router', () => {
    const routes = read('../src/modules/auth/routes.ts');
    expect(routes).not.toContain("'/register'");
    expect(routes).toContain('export default router;');
  });
  it('has no register() service method but keeps login()', () => {
    const services = read('../src/modules/auth/services.ts');
    expect(services).not.toContain('async register(');
    expect(services).toContain('async login(');
    expect(services).toContain('bcrypt.compare(');
  });
});

describe('User creation hardening (controls B/C)', () => {
  it('requires ADMIN/PARTNER to create a workforce user', () => {
    const routes = read('../src/modules/users/routes.ts');
    expect(routes).toContain("router.post('/', authenticate, requireRole('ADMIN', 'PARTNER'),");
  });
  it('uses a random non-login credential, never a fixed password', () => {
    const services = read('../src/modules/users/services.ts');
    expect(services).not.toContain('password123');
    expect(services).toContain('randomUUID');
    expect(services).toContain('bcrypt.hash(randomUUID(), 10)');
  });
});

describe('Settings hardening (controls D/E/F)', () => {
  it('authenticates reads, admin-gates writes, and allowlists keys', () => {
    const routes = read('../src/modules/settings/routes.ts');
    expect(routes).toContain("import { authenticate, requireRole }");
    expect(routes).toContain("router.get('/', authenticate,");
    expect(routes).toContain("router.get('/:key', authenticate,");
    expect(routes).toContain("router.patch('/ui', authenticate, requireRole('ADMIN', 'PARTNER'),");
    expect(routes).toContain("router.put('/:key', authenticate, requireRole('ADMIN', 'PARTNER'),");
    expect(routes).toContain('READABLE_SETTING_KEYS');
    expect(routes).toContain('WRITABLE_SETTING_KEYS');
    expect(routes).toContain('SETTINGS_KEY_NOT_ALLOWED');
    // Never dump the whole SystemSetting table through the API.
    expect(routes).not.toContain('getAllSettings()');
  });
});

describe('Seed production deny + no fixed credentials (control G)', () => {
  const seeds = ['../prisma/seed_users.js', '../prisma/seed-users-only.js', '../prisma/seed_azure_users.js'];
  it('every credential-bearing seed refuses production and drops shared/hardcoded secrets', () => {
    for (const rel of seeds) {
      const src = read(rel);
      expect(src.toLowerCase()).toContain('production');
      expect(src).toContain('randomUUID');
      expect(src).not.toContain('password123');
      expect(src).not.toContain('Uborka444');
    }
  });
});

describe('Migration/reset production deny (control H)', () => {
  it('ad-hoc migration/reset scripts refuse production and drop hardcoded credentials', () => {
    const runMigration = fs.readFileSync(path.join(__dirname, '../../scripts/run_migration.js'), 'utf8');
    expect(runMigration).toContain("=== 'production'");
    expect(runMigration).not.toContain('Uborka444');

    const applyStaging = read('../scripts/apply-staging-migration.mjs');
    expect(applyStaging).toContain("=== 'production'");
  });
});

describe('Startup fail-closed (control N)', () => {
  it('production refuses to start without DATABASE_URL/JWT_SECRET', () => {
    const index = read('../src/index.ts');
    expect(index).toContain('FAIL-CLOSED');
    expect(index).toContain('process.exit(1)');
    expect(index).toContain('JWT_SECRET');
    expect(index).toContain('DATABASE_URL');
  });
});
