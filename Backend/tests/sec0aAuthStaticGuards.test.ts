import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(root, rel));
}

describe('SEC-0A static guards: auth / privilege / settings / secrets', () => {
  // 1. /auth/register must be removed from the workforce auth router.
  it('removes the unauthenticated workforce register route', () => {
    const routes = read('src/modules/auth/routes.ts');
    expect(routes).not.toContain("'/register'");
    expect(routes).not.toContain('/register');
    expect(routes).toContain('export default router;');
  });

  it('removes the register service method', () => {
    const services = read('src/modules/auth/services.ts');
    expect(services).not.toContain('async register(');
  });

  it('keeps the Azure/workforce login path intact', () => {
    const services = read('src/modules/auth/services.ts');
    expect(services).toContain('async login(');
    expect(services).toContain('bcrypt.compare(');
  });

  // 2. POST /users must require ADMIN/PARTNER.
  it('requires ADMIN/PARTNER to create workforce users', () => {
    const routes = read('src/modules/users/routes.ts');
    expect(routes).toContain("router.post('/', authenticate, requireRole('ADMIN', 'PARTNER'),");
  });

  it('uses a random non-login credential, never a fixed password', () => {
    const services = read('src/modules/users/services.ts');
    expect(services).not.toContain('password123');
    expect(services).toContain('randomUUID');
    expect(services).toContain("bcrypt.hash(randomUUID(), 10)");
  });

  // 3. Settings must be guarded.
  it('authenticates settings reads and admin-gates settings writes', () => {
    const routes = read('src/modules/settings/routes.ts');
    expect(routes).toContain("import { authenticate, requireRole }");
    expect(routes).toContain("router.get('/', authenticate,");
    expect(routes).toContain("router.get('/:key', authenticate,");
    expect(routes).toContain("router.patch('/ui', authenticate,");
    expect(routes).toContain("router.put('/:key', authenticate, requireRole('ADMIN', 'PARTNER'),");
    expect(routes).toContain('READABLE_SETTING_KEYS');
    expect(routes).toContain('WRITABLE_SETTING_KEYS');
    expect(routes).toContain('SETTINGS_KEY_NOT_ALLOWED');
  });

  it('keeps /settings/ui a public-safe presentational DTO', () => {
    const routes = read('src/modules/settings/routes.ts');
    const uiGet = routes.split("router.get('/ui'")[1] || '';
    expect(uiGet).toContain('theme');
    // Public read must not dump the whole SystemSetting table.
    expect(routes).not.toContain("getAllSettings()");
  });

  // 4. Production hard-deny on seed + dangerous scripts.
  it('refuses production on every credential-bearing seed', () => {
    const files = [
      'prisma/seed_users.js',
      'prisma/seed_azure_users.js',
      'prisma/seed-users-only.js',
      'scripts/seed-core-team-users.mjs',
      'scripts/seed-core-clients-house-style.mjs',
    ];
    for (const f of files) {
      if (!exists(f)) continue;
      expect(read(f)).toContain("NODE_ENV");
    }
  });

  it('refuses production and requires explicit opt-in for destructive migration', () => {
    const apply = read('scripts/apply-staging-migration.mjs');
    expect(apply).toContain('NODE_ENV');
    expect(apply).toContain('ALLOW_DESTRUCTIVE_RESET');
    const runStaging = read('scripts/run-staging-migration.mjs');
    expect(runStaging).toContain("NODE_ENV");
  });

  // 5. No live credential literals remain in active source.
  it('removes committed live credential literals from seeds/scripts', () => {
    const files = [
      'prisma/seed_users.js',
      'prisma/seed_azure_users.js',
      'prisma/seed-users-only.js',
      'scripts/apply-staging-migration.mjs',
      path.join('..', 'scripts', 'run_migration.js'),
      path.join('..', 'scripts', 'seed_azure.ts'),
    ];
    for (const f of files) {
      if (!exists(f)) continue;
      const content = read(f);
      expect(content).not.toContain('adminiculum.postgres.database.azure.com');
      expect(content).not.toContain('password123');
      expect(content).not.toContain('Uborka444');
    }
  });

  // 6. No fixed-password leakage in the whole Backend source tree.
  it('contains no fixed-password literal anywhere in Backend source/prisma/scripts', () => {
    const targets = ['src', 'prisma', 'scripts'];
    for (const dir of targets) {
      const base = path.join(root, dir);
      if (!fs.existsSync(base)) continue;
      const walk = (d: string): string[] =>
        fs.existsSync(d)
          ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
              e.isDirectory() ? walk(path.join(d, e.name)) : [
                ...(e.name.endsWith('.ts') || e.name.endsWith('.js') || e.name.endsWith('.mjs')
                  ? [path.join(d, e.name)]
                  : []),
              ])
          : [];
      for (const file of walk(base)) {
        const content = fs.readFileSync(file, 'utf8');
        expect(content).not.toContain("bcrypt.hash('password123'");
        expect(content).not.toContain("'password123', 10");
      }
    }
  });
});
