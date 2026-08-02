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
});
