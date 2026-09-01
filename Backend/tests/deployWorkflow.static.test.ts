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
  it('runs Kudu backend deployment polling on the host runner without awk', () => {
    const step = stepBlock('Deploy via Kudu ZipDeploy and verify THIS deployment reaches SUCCESS');

    expect(step).toContain('shell: bash');
    expect(step).not.toContain('uses: azure/cli@v2');
    expect(step).not.toMatch(/\bawk\b/);
    expect(step).toContain('command -v az >/dev/null');
    expect(step).toContain('command -v curl >/dev/null');
    expect(step).toContain('command -v node >/dev/null');
    expect(step).toContain('TOKEN="$(az account get-access-token --query accessToken -o tsv)"');
  });

  it('accepts synchronous 200 success without Location and validates async identity', () => {
    const step = stepBlock('Deploy via Kudu ZipDeploy and verify THIS deployment reaches SUCCESS');

    expect(step).toContain('if [ "$HTTP_CODE" = "200" ] && [ "$CURL_STATUS" -eq 0 ]; then');
    expect(step).toContain('Kudu publish completed synchronously; proceeding to backend health gate.');
    expect(step).toContain('REQUEST_STARTED_AT="$(date +%s%3N)"');
    expect(step).toContain('"${API}/deployments" > "$PRE_CENSUS"');
    expect(step).toContain('if [ -z "$LOCATION" ]; then');
    expect(step).toContain('if { [ "$HTTP_CODE" = "202" ] || [ "$HTTP_CODE" = "504" ] || [ "$CURL_STATUS" -ne 0 ]; }; then');
    expect(step).toContain('const expectedHost = `${process.env.BACKEND_APP}.scm.azurewebsites.net`;');
    expect(step).toContain("const expectedPrefix = '/api/deployments/';");
    expect(step).toContain("url.protocol !== 'https:'");
    expect(step).toContain('url.hostname !== expectedHost');
    expect(step).toContain('!url.pathname.startsWith(expectedPrefix)');
    expect(step).toContain("!id || id.includes('/')");
    expect(step).toContain('Unexpected Kudu deployment Location; refusing to poll it.');
    expect(step).toContain('Unexpected Kudu publish HTTP response; refusing to poll it.');
    expect(step).toContain('curl -sS -m 25 -H "Authorization: Bearer ${TOKEN}" "$LOCATION"');
    expect(step).toContain('bounded deployment discovery');
    expect(step).toContain('kudu-deployment-correlation.js');
    expect(step).toContain('No uniquely correlated terminal-success deployment within discovery window; failing closed.');
    expect(workflow).not.toContain('/api/deployments/latest');
  });

  it('preserves exact backend deployment status semantics for 202/504/transport failure', () => {
    const step = stepBlock('Deploy via Kudu ZipDeploy and verify THIS deployment reaches SUCCESS');

    expect(step.indexOf('Kudu publish HTTP status=${HTTP_CODE:-<none>} curl_status=${CURL_STATUS}')).toBeLessThan(step.indexOf('LOCATION="$(HEADERS="$HEADERS"'));
    expect(step).toContain('not authoritative once a');
    expect(step).toContain('deployment Location was returned; poll this exact server-side run.');
    expect(step).toContain('if [ "$ST" = "4" ]; then echo "Deployment $NEW_ID succeeded."; exit 0; fi');
    expect(step).toContain('if [ "$ST" = "3" ]; then echo "Deployment $NEW_ID failed server-side."; exit 1; fi');
    expect(step).toContain('Timed out waiting for deployment $NEW_ID to reach a terminal state.');
    expect(step).not.toMatch(/if \[ "\$HTTP_CODE" !=/);
    expect(step).not.toMatch(/if \[ "\$CURL_STATUS" !=/);
    expect(step).toContain('HTTP 200 with a clean');
    expect(step).toContain('if ! { [ "$HTTP_CODE" = "504" ] || [ "$CURL_STATUS" -ne 0 ]; }; then');
    expect(step).toContain('Cannot prove ownership of a successful deployment; failing closed.');
    expect(step).toContain('exit 1');
    expect(step).not.toMatch(/curl[^\n]*-X POST[^\n]*publish[\s\S]*curl[^\n]*-X POST[^\n]*publish/);
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
    expect(workflow.indexOf('Deploy via Kudu ZipDeploy and verify THIS deployment reaches SUCCESS')).toBeLessThan(workflow.indexOf('Backend health gate (/health 200)'));
    expect(workflow.indexOf('Trigger + verify THIS migration WebJob run')).toBeLessThan(workflow.indexOf('Backend health gate after migration (/health 200)'));
  });
});
