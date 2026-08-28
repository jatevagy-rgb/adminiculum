import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

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

  it('designates the REAL backend App Service as the demo runtime (env authority)', () => {
    expect(runner).toContain('not a designated DEMO App Service environment');
    // The default designated demo site for our presentation deployment is the
    // real backend App Service, overridable via DEMO_KFT_WEBJOB_EXPECTED_SITE.
    expect(runner).toContain("DEMO_KFT_WEBJOB_EXPECTED_SITE || 'adminiculumbackend-b1-01'");
  });

  it('reset script uses an explicit hosted-demo environment contract (not a blanket runtime-marker refusal)', () => {
    const reset = fs.readFileSync(path.join(root, 'scripts', 'demo-kft-reset.mjs'), 'utf8');
    // Hosted execution requires the explicit demo contract (all four guards).
    expect(reset).toContain("process.env.ADMINICULUM_RUNTIME_ENVIRONMENT !== 'demo'");
    expect(reset).toContain('ADMINICULUM_DEMO_RESET_ALLOWED !== \'true\'');
    expect(reset).toContain("DEMO_KFT_WEBJOB_EXPECTED_SITE || 'adminiculumbackend-b1-01'");
    expect(reset).toContain("WEBSITE_SITE_NAME || '') !== expectedSite");
    // Must NOT blanket-refuse merely because WEBSITE_SITE_NAME is present.
    expect(reset).not.toContain('production runtime marker detected');
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
    expect(runner).not.toMatch(/displayName.*infer|jobTitle.*infer/i); // never by job title/display name
  });

  it('contains no committed secret literal', () => {
    expect(runner).not.toContain('postgres://');
    expect(runner).not.toContain('password123');
    expect(runner).not.toContain('Uborka444');
  });

  it('selects compiled CommonJS for hosted plain Node and source TS locally', async () => {
    const runtimePath = path.join(root, 'scripts', 'demo-kft-runtime.mjs');
    const runtimeUrl = pathToFileURL(runtimePath).href;
    const resolverScript = `import { resolveRequirementRuleServiceUrl } from ${JSON.stringify(runtimeUrl)};
console.log(resolveRequirementRuleServiceUrl(true).pathname);
console.log(resolveRequirementRuleServiceUrl(false).pathname);`;
    const resolverOutput = execFileSync(process.execPath, ['--input-type=module', '--eval', resolverScript], {
      cwd: root,
      encoding: 'utf8',
    }).trim().split(/\r?\n/);
    expect(resolverOutput[0]).toMatch(/dist\/modules\/compliance\/requirementRuleService\.js$/);
    expect(resolverOutput[1]).toMatch(/src\/modules\/compliance\/requirementRuleService\.ts$/);

    const compiledPath = path.join(root, 'dist', 'modules', 'compliance', 'requirementRuleService.js');
    expect(fs.existsSync(compiledPath)).toBe(true);
    const script = `import { loadRequirementRuleService } from ${JSON.stringify(runtimeUrl)};
const service = await loadRequirementRuleService({ hosted: true });
for (const name of ['approveRequirementVersion', 'approveApplicabilityRuleVersion', 'createApplicabilityRuleVersion']) {
  if (typeof service[name] !== 'function') throw new Error(name + ' export missing');
}
console.log('HOSTED_COMPLIANCE_SERVICE_OK');`;
    const output = execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(output).toContain('HOSTED_COMPLIANCE_SERVICE_OK');

    const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const localScript = `import { loadRequirementRuleService } from ${JSON.stringify(runtimeUrl)};
(async () => {
  const service = await loadRequirementRuleService({ hosted: false });
  for (const name of ['approveRequirementVersion', 'approveApplicabilityRuleVersion', 'createApplicabilityRuleVersion']) {
    if (typeof service[name] !== 'function') throw new Error(name + ' export missing');
  }
  console.log('LOCAL_COMPLIANCE_SERVICE_OK');
})();`;
    const localOutput = execFileSync(process.execPath, [tsxCli, '--eval', localScript], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(localOutput).toContain('LOCAL_COMPLIANCE_SERVICE_OK');
  });
});
