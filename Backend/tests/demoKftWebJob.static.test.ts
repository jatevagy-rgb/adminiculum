import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const jobRoot = path.join(root, 'App_Data', 'jobs', 'triggered', 'adminiculum-demo-kft-reset');

function read(rel: string): string {
  return fs.readFileSync(path.join(jobRoot, rel), 'utf8');
}

describe('Demo Kft. hosted activation WebJob (static guards)', () => {
  const runner = read('runner.cjs');

  it('exists as a triggered, schedule-free WebJob', () => {
    expect(fs.existsSync(path.join(jobRoot, 'run.js'))).toBe(true);
    expect(fs.existsSync(path.join(jobRoot, 'runner.cjs'))).toBe(true);
    expect(fs.existsSync(path.join(jobRoot, 'settings.job'))).toBe(false); // triggered, not scheduled
  });

  it('requires every explicit demo guard (no generic-reset path)', () => {
    expect(runner).toContain("ADMINICULUM_RUNTIME_ENVIRONMENT !== 'demo'");
    expect(runner).toContain("ADMINICULUM_DEMO_CONTENT_ENABLED !== 'true'");
    expect(runner).toContain("ADMINICULUM_DEMO_RESET_ALLOWED !== 'true'");
    expect(runner).toContain('WEBSITE_SITE_NAME !== expectedSite');
  });

  it('hard-refuses a production customer-data environment marker', () => {
    expect(runner).toContain('not a designated DEMO App Service environment');
    // A production build as a designated demo host is allowed ONLY via the
    // explicit demo site allowlist; a generic production path is refused.
    expect(runner).toContain('adminiculumdemo-b1-01');
  });

  it('never performs a generic destructive DB reset or truncate', () => {
    expect(runner).not.toContain('migrate reset --force');
    expect(runner).not.toContain('TRUNCATE');
    expect(runner).not.toContain('DROP TABLE');
    expect(runner).not.toContain('DELETE FROM');
  });

  it('runs only the DEMO_KFT-namespaced fixture reset', () => {
    expect(runner).toContain('demo-kft-reset.mjs');
    const reset = fs.readFileSync(path.join(root, 'scripts', 'demo-kft-reset.mjs'), 'utf8');
    expect(reset).toContain("FIXTURE_NAMESPACE = 'DEMO_KFT_'");
    expect(reset).toContain("ADMINICULUM_DEMO_CONTENT_ENABLED !== 'true'");
  });

  it('exposes no public HTTP reset endpoint', () => {
    expect(runner).not.toMatch(/app\.(get|post|put|delete|all)\(|http\.createServer|\.listen\(/);
    expect(runner).not.toContain('express');
  });

  it('prints only safe summary tokens to logs', () => {
    for (const token of ['DEMO_KFT_RESET', 'DEMO_CLIENT', 'PORTAL_MODE', 'PORTAL_PERSONA', 'CASES', 'TIME_TOTAL_MINUTES', 'BASELINE_EMPLOYEE_COUNT']) {
      expect(runner).toContain(token);
    }
    expect(runner).toContain('sanitize'); // secret redaction
  });

  it('links the hosted identity only via the real identity/membership model', () => {
    expect(runner).toContain('DEMO_KFT_PORTAL_IDENTITY_EMAIL');
    expect(runner).toContain('client_portal_workspace_memberships');
    expect(runner).toContain("role='APPROVER'");
    expect(runner).not.toMatch(/jobTitle|displayName.*infer/i); // never by job title/display name
  });

  it('contains no committed secret literal', () => {
    expect(runner).not.toContain('postgres://');
    expect(runner).not.toContain('password123');
    expect(runner).not.toContain('Uborka444');
  });
});
