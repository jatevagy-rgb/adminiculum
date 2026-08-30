import fs from 'fs';
import path from 'path';
import { createCorsOptions } from '../src/config/cors';
import { isSensitiveKey, redactObject, REDACTED, sanitizeUrlForLog } from '../src/config/logRedaction';

function decideOrigin(options: ReturnType<typeof createCorsOptions>, origin?: string): boolean {
  let allowed = false;
  const originFn = options.origin as (
    value: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void,
  ) => void;
  originFn(origin, (_error, decision) => {
    allowed = Boolean(decision);
  });
  return allowed;
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(__dirname, relativePath), 'utf8');
}

describe('CORS policy', () => {
  it('allows only configured production origins', () => {
    const options = createCorsOptions({
      isProduction: true,
      productionAllowedOrigins: ['https://app.example.com'],
    });
    expect(decideOrigin(options, 'https://app.example.com')).toBe(true);
    expect(decideOrigin(options, 'https://evil.example.com')).toBe(false);
    expect(decideOrigin(options, undefined)).toBe(true);
  });

  it('keeps development local and configured origins explicit', () => {
    const options = createCorsOptions({
      isProduction: false,
      productionAllowedOrigins: [],
      frontendUrl: 'https://frontend.example.com',
    });
    expect(decideOrigin(options, 'http://localhost:3000')).toBe(true);
    expect(decideOrigin(options, 'https://frontend.example.com')).toBe(true);
    expect(decideOrigin(options, 'https://evil.example.com')).toBe(false);
  });
});

describe('log privacy', () => {
  it('strips query strings and fragments', () => {
    expect(sanitizeUrlForLog('/api/users?token=secret')).toBe('/api/users');
    expect(sanitizeUrlForLog('/api/users#fragment')).toBe('/api/users');
  });

  it('redacts nested credential fields without mutating input', () => {
    const input = { email: 'user@example.com', authorization: 'Bearer secret', nested: { api_key: 'key' } };
    const output = redactObject(input) as { email: string; authorization: string; nested: { api_key: string } };
    expect(output.email).toBe(input.email);
    expect(output.authorization).toBe(REDACTED);
    expect(output.nested.api_key).toBe(REDACTED);
    expect(input.authorization).toBe('Bearer secret');
    expect(isSensitiveKey('mailboxAddress')).toBe(false);
    expect(isSensitiveKey('DATABASE_URL')).toBe(true);
  });

  it('wires path-only request logging', () => {
    const source = read('../src/index.ts');
    expect(source).toContain("morgan.token('url'");
    expect(source).toContain('sanitizeUrlForLog');
  });
});

describe('source guards', () => {
  it('removes public workforce registration and protects user creation', () => {
    expect(read('../src/modules/auth/routes.ts')).not.toContain("'/register'");
    expect(read('../src/modules/auth/services.ts')).not.toContain('async register(');
    expect(read('../src/modules/users/routes.ts')).toContain(
      "router.post('/', authenticate, requireRole('ADMIN', 'PARTNER'),",
    );
    expect(read('../src/modules/users/services.ts')).not.toContain('password123');
    expect(read('../src/modules/users/services.ts')).toContain('randomUUID');
  });

  it('protects settings reads, writes, and public DTO shape', () => {
    const source = read('../src/modules/settings/routes.ts');
    expect(source).toContain("router.get('/', authenticate,");
    expect(source).toContain("router.get('/:key', authenticate,");
    expect(source).toContain("router.patch('/ui', authenticate, requireRole('ADMIN', 'PARTNER'),");
    expect(source).toContain("router.put('/:key', authenticate, requireRole('ADMIN', 'PARTNER'),");
    expect(source).toContain('READABLE_SETTING_KEYS');
    expect(source).toContain('WRITABLE_SETTING_KEYS');
    expect(source).not.toContain('getAllSettings()');
    expect(source).toContain('dateFormat: settings.dateFormat');
  });

  it('guards credential-bearing seed and migration entrypoints', () => {
    const files = [
      '../prisma/seed.js',
      '../prisma/seed-users-only.js',
      '../prisma/seed_users.js',
      '../prisma/seed_azure_users.js',
      '../scripts/apply-staging-migration.mjs',
      '../scripts/run-staging-migration.mjs',
      '../../scripts/run_migration.js',
      '../../scripts/seed.ts',
      '../../scripts/seed_azure.ts',
      '../scripts/add-attorney-user.mjs',
    ];
    for (const file of files) {
      const source = read(file);
      expect(source.toLowerCase()).toContain('production');
      expect(source).not.toContain('password123');
      expect(source).not.toContain('Uborka444');
      expect(source).not.toContain('teszt1234');
      expect(source).not.toContain('Password123!');
    }
  });

  it('fails closed at production startup for mandatory auth/database configuration', () => {
    const source = read('../src/index.ts');
    expect(source).toContain('DATABASE_URL');
    expect(source).toContain('JWT_SECRET');
    expect(source).toContain('FAIL-CLOSED');
    expect(source).toContain('process.exit(1)');
  });
});
