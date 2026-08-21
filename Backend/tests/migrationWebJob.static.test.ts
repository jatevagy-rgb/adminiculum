import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const jobRoot = path.join(root, 'App_Data', 'jobs', 'triggered', 'adminiculum-db-migrate');

describe('migration WebJob artifact', () => {
  it('contains a manually triggered, schedule-free runner', () => {
    expect(fs.existsSync(path.join(jobRoot, 'run.js'))).toBe(true);
    expect(fs.existsSync(path.join(jobRoot, 'runner.cjs'))).toBe(true);
    expect(fs.existsSync(path.join(jobRoot, 'settings.job'))).toBe(false);
    const runner = fs.readFileSync(path.join(jobRoot, 'runner.cjs'), 'utf8');
    expect(runner).toContain("migrate', 'deploy");
    expect(runner).toContain('failedMigrationCount');
    expect(runner).not.toContain('db push');
    expect(runner).not.toContain('migrate resolve');
  });

  it('targets the current migration and verifies its concrete effect', () => {
    // Regression: the runner previously stayed pinned to an already-applied
    // migration name, so alreadyApplied short-circuited migrate deploy and the
    // newer migration never ran. It must target the current migration (discovered
    // from the migrations directory, overridable via env) and verify that
    // migration's real schema effect.
    const migrationsDir = path.join(root, 'prisma', 'migrations');
    const latest = fs.readdirSync(migrationsDir).filter((d) => /^\d{14}_/.test(d)).sort().pop()!;
    const runner = fs.readFileSync(path.join(jobRoot, 'runner.cjs'), 'utf8');
    expect(runner).toContain('MIGRATION_WEBJOB_TARGET_MIGRATION');
    expect(runner).toContain("readdirSync(path.join(appRoot, 'prisma', 'migrations')");
    expect(runner).toContain('/^\\d{14}_/.test(entry.name)');
    expect(runner).toContain('.at(-1)');
    expect(runner).toContain("to_regclass('public.client_portal_intake_requests')");
    expect(runner).toContain("table_name = 'client_portal_grants' AND column_name = 'participantRole'");
    expect(runner).not.toContain(`const migrationName = '${latest}'`);
  });

  it('ships the prisma CLI in production dependencies so the WebJob can spawn it', () => {
    // Root cause of the failed executions: prisma was a devDependency, so the
    // Oryx production install (NODE_ENV=production) omitted it and the runner's
    // spawnSync(node_modules/.bin/prisma) hit ENOENT -> "prisma migrate deploy
    // failed:". The migrate CLI the runner needs at runtime must be a prod dep.
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.dependencies?.prisma).toBeDefined();
    expect(pkg.devDependencies?.prisma).toBeUndefined();
    // @prisma/client and pg (used by the runner) must also be production deps.
    expect(pkg.dependencies?.['@prisma/client']).toBeDefined();
    expect(pkg.dependencies?.pg).toBeDefined();
  });
});
