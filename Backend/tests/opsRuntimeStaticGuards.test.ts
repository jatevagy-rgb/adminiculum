import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(root, rel));
}

function* walk(base: string): Generator<string> {
  if (!fs.existsSync(base)) return;
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    const full = path.join(base, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|js|mjs)$/.test(entry.name)) yield full;
  }
}

describe('OPS runtime / env / secret static guards', () => {
  it('exposes healthy DB and storage probes', () => {
    const index = read('src/index.ts');
    expect(index).toContain("'/health/db'");
    expect(index).toContain("'/health/storage'");
    expect(index).toContain('SELECT 1');
    expect(index).toContain('not_configured'); // safe SharePoint state
  });

  it('fails closed on critical production config omission', () => {
    const index = read('src/index.ts');
    expect(index).toMatch(/isProduction[\s\S]{0,400}DATABASE_URL/);
    expect(index).toMatch(/JWT_SECRET\. Aborting/);
    expect(index).toMatch(/CORS allowlist[\s\S]{0,80}Aborting/);
  });

  it('uses a structured request logger that never logs sensitive data', () => {
    const index = read('src/index.ts');
    expect(index).toContain('function requestLogger');
    expect(index).toContain("originalUrl.split('?')"); // query string stripped
    expect(index).toContain('timestamp');
    expect(index).toContain('durationMs');
    // Never log Authorization/Cookie/body/document text.
    expect(index).not.toMatch(/log[^\n]*(authorization|req\.body|cookie)/i);
    // No raw morgan combined (which logs full URL incl. query params).
    expect(index).not.toContain('morgan');
  });

  it('hard-denies production seeds and destructive migration reset', () => {
    const seeds = [
      'prisma/seed_users.js',
      'prisma/seed_azure_users.js',
      'prisma/seed-users-only.js',
      'scripts/seed-core-team-users.mjs',
      'scripts/seed-core-clients-house-style.mjs',
      'scripts/apply-staging-migration.mjs',
      'scripts/run-staging-migration.mjs',
    ];
    for (const seed of seeds) {
      if (!exists(seed)) continue;
      expect(read(seed)).toContain('NODE_ENV');
    }
    const apply = read('scripts/apply-staging-migration.mjs');
    expect(apply).toContain('ALLOW_DESTRUCTIVE_RESET');
    expect(apply).toContain('migrate reset --force');
    const runner = read('App_Data/jobs/triggered/adminiculum-db-migrate/runner.cjs');
    expect(runner).not.toContain('db push');
  });

  it('contains no active credential literal in Backend source/prisma/scripts or root scripts', () => {
    const roots = [
      path.join(root, 'src'),
      path.join(root, 'prisma'),
      path.join(root, 'scripts'),
      path.join(root, '..', 'scripts'),
    ];
    for (const base of roots) {
      for (const file of walk(base)) {
        const content = fs.readFileSync(file, 'utf8');
        expect(content).not.toContain('adminiculum.postgres.database.azure.com');
        expect(content).not.toContain('password123');
        expect(content).not.toContain('Uborka444');
      }
    }
  });
});
