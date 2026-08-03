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
    expect(runner).toContain('clientPortalIdentityId');
    expect(runner).not.toContain('db push');
    expect(runner).not.toContain('migrate resolve');
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
