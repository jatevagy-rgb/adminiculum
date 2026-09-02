import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..', '..');
const workflow = fs
  .readFileSync(path.join(repoRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')
  .replace(/\r\n/g, '\n');

function stepBlock(name: string): string {
  const marker = `      - name: ${name}`;
  const start = workflow.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = workflow.slice(start + marker.length);
  const next = rest.match(/\n      - name: /);
  return workflow.slice(start, next ? start + marker.length + next.index : undefined);
}

describe('production deploy workflow portability guards', () => {
  it('uses supported synchronous Azure CLI backend deployment', () => {
    const step = stepBlock('Deploy backend via Azure CLI and wait for terminal result');

    expect(step).toContain('uses: azure/cli@v2');
    expect(step).toContain('az webapp deploy');
    expect(step).toContain('--name "${BACKEND_APP}"');
    expect(step).toContain('--src-path backend-deploy.zip');
    expect(step).toContain('--type zip');
    expect(step).toContain('--async false');
    expect(step).toContain('--timeout 1200000');
    expect(step).toContain('does not return until the deployment command has a terminal result');
    expect(step).toContain('no deployment-history');
  });

  it('does not use ambiguous Kudu publish or deployment history inference', () => {
    expect(workflow).not.toContain('/api/publish?type=zip&isAsync=true');
    expect(workflow).not.toContain('/api/deployments/latest');
  });

  it('fails closed when synchronous deployment returns a failure', () => {
    const step = stepBlock('Deploy backend via Azure CLI and wait for terminal result');

    expect(step).toContain('set -euo pipefail');
    expect(step).toContain('A CLI timeout or non-zero result fails this step');
    expect(step).not.toContain('retry');
    expect(step).not.toContain('deployments/latest');
    expect(workflow).toContain('Backend health gate (/health 200)');
  });

  it('runs migration WebJob polling on the host runner with exact run identity', () => {
    const step = stepBlock('Trigger + verify THIS migration WebJob run');

    expect(step).toContain('shell: bash');
    expect(step).not.toContain('uses: azure/cli@v2');
    expect(step).not.toMatch(/\bawk\b/);
    expect(step).toContain('command -v az >/dev/null');
    expect(step).toContain('command -v curl >/dev/null');
    expect(step).toContain('command -v node >/dev/null');
    expect(step).toContain('const expectedHost = `${process.env.BACKEND_APP}.scm.azurewebsites.net`;');
    expect(step).toContain('const expectedPrefix = `/api/triggeredwebjobs/${process.env.MIGRATION_WEBJOB}/history/`;');
    expect(step).toContain("!id || id.includes('/')");
    expect(step).toContain('WebJob trigger did not return a run Location; refusing to infer identity from history.');
    expect(step).toContain('Unexpected WebJob run Location; refusing to poll it.');
    expect(step).toContain('curl -sS -m 25 -H "Authorization: Bearer ${TOKEN}" "$LOCATION"');
    expect(step).toContain('if [ "$ST" = "Success" ]; then echo "Migration WebJob run $NEW_RUN succeeded."; exit 0; fi');
    expect(step).toContain('if [ "$ST" = "Failed" ] || [ "$ST" = "Error" ] || [ "$ST" = "Aborted" ]; then');
    expect(step).toContain('Timed out waiting for WebJob run $NEW_RUN.');
  });

  it('preserves production target and deployment job ordering', () => {
    expect(workflow).toContain('BACKEND_APP: adminiculumbackend-b1-01');
    expect(workflow).not.toContain('vikoli-app');
    expect(workflow).toContain('concurrency:\n  group: adminiculum-appservice-production-deploy\n  cancel-in-progress: false');
    expect(workflow).toContain('needs: [resolve, backend]\n    if: ${{ inputs.run_migration && needs.backend.result == \'success\' }}');
    expect(workflow).toContain('needs: [resolve, backend, migration]');
    expect(workflow).toContain("&& (needs.backend.result == 'success' || needs.backend.result == 'skipped')");
    expect(workflow).toContain("&& (needs.migration.result == 'success' || needs.migration.result == 'skipped')");
    expect(workflow.indexOf('Deploy backend via Azure CLI and wait for terminal result')).toBeLessThan(workflow.indexOf('Backend health gate (/health 200)'));
    expect(workflow.indexOf('Trigger + verify THIS migration WebJob run')).toBeLessThan(workflow.indexOf('Backend health gate after migration (/health 200)'));
  });

  it('resolves one immutable SHA and propagates release identity to both artifacts', () => {
    expect(workflow).toContain('sha: ${{ steps.rev.outputs.sha }}');
    expect(workflow).toContain('build_time: ${{ steps.rev.outputs.build_time }}');
    expect(workflow).toContain('SHA=$(git rev-parse HEAD)');
    expect(workflow).toContain('BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")');
    expect(workflow).toContain('ref: ${{ needs.resolve.outputs.sha }}');
    expect(workflow).toContain('Backend/release-identity.json');
    expect(workflow).toContain('NEXT_PUBLIC_APP_COMMIT_SHA: ${{ needs.resolve.outputs.sha }}');
    expect(workflow).toContain('NEXT_PUBLIC_APP_BUILD_TIME: ${{ needs.resolve.outputs.build_time }}');
    expect(workflow).toContain('Verify backend release identity');
    expect(workflow).toContain('Verify frontend release identity');
    expect(workflow.match(/git rev-parse/g)).toHaveLength(1);
    expect(workflow).not.toContain('git rev-parse release/editor-ops-workflow-1');
    expect(workflow).not.toContain('APP_COMMIT_SHA: ${{ secrets.');
    expect(workflow).not.toContain('APP_BUILD_TIME: ${{ secrets.');
  });
});
