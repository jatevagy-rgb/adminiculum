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
    expect(step).not.toContain('retry ');
    expect(step).not.toContain('deployments/latest');
    expect(workflow).toContain('Backend health gate (/health 200)');
  });

  it('supports a fail-closed recovery path without backend redeployment', () => {
    expect(workflow).toContain('recovery:');
    expect(workflow).toContain('if: ${{ !inputs.deploy_backend && inputs.run_migration }}');
    expect(workflow).toContain('Recovery backend /health -> $HEALTH_CODE');
    expect(workflow).toContain('[ "$HEALTH_CODE" = "200" ]');
    expect(workflow).toContain('Recovery backend SHA mismatch: expected');
    expect(workflow).toContain('Recovery backend build time is missing.');
    expect(workflow).toContain('needs: [resolve, backend, recovery]');
    expect(workflow).toContain("needs.backend.result == 'skipped'");
    expect(workflow).toContain("needs.recovery.result == 'success'");
    expect(workflow).toContain('inputs.deploy_backend != true');
  });

  it('keeps recovery input out of shell source and validates it before use', () => {
    expect(workflow).toContain('RECOVERY_PRODUCT_SHA_INPUT: ${{ inputs.recovery_product_sha }}');
    expect(workflow).toContain('RECOVERY_SHA="${RECOVERY_PRODUCT_SHA_INPUT}"');
    expect(workflow).not.toContain('RECOVERY_SHA="${{ inputs.recovery_product_sha }}"');
    expect(workflow).toContain('=~ ^[0-9a-f]{40}$');
    expect(workflow).toContain('git cat-file -e "${RECOVERY_SHA}^{commit}"');
    expect(workflow).toContain('git merge-base --is-ancestor "$RECOVERY_SHA" "$CONTROL_SHA"');
  });

  it('makes requested migration mandatory before frontend deployment', () => {
    expect(workflow).toContain('always()');
    expect(workflow).toContain("needs.backend.result == 'skipped'");
    expect(workflow).toContain("needs.recovery.result == 'success'");
    expect(workflow).toContain('(inputs.run_migration && needs.migration.result == \'success\')');
    expect(workflow).toContain('!inputs.run_migration');
    expect(workflow).not.toContain("&& (needs.migration.result == 'success' || needs.migration.result == 'skipped') }}");
    expect(workflow).toContain("needs.migration.result == 'success'");
  });

  it('separates workflow control SHA from the recovery product SHA', () => {
    expect(workflow).toContain('recovery_product_sha:');
    expect(workflow).toContain('product_sha: ${{ steps.product.outputs.sha }}');
    expect(workflow).toContain('recovery_product_sha must be empty when deploy_backend=true.');
    expect(workflow).toContain('recovery_product_sha must be exactly 40 lowercase hexadecimal characters in recovery mode.');
    expect(workflow).toContain('git cat-file -e "${RECOVERY_SHA}^{commit}"');
    expect(workflow).toContain('git merge-base --is-ancestor "$RECOVERY_SHA" "$CONTROL_SHA"');
    expect(workflow).toContain('EXPECTED_SHA="${{ needs.resolve.outputs.product_sha }}"');
    expect(workflow).toContain('ref: ${{ needs.resolve.outputs.product_sha }}');
    expect(workflow).toContain('NEXT_PUBLIC_APP_COMMIT_SHA: ${{ needs.resolve.outputs.product_sha }}');
    expect(workflow).toContain('if [ "${{ inputs.deploy_backend }}" = "true" ]; then');
    expect(workflow).toContain('PRODUCT_SHA="$CONTROL_SHA"');
  });

  it('provides an OIDC-only P0 backend recovery path that blocks migration and frontend deployment', () => {
    expect(workflow).toContain('backend_recovery_action:');
    expect(workflow).toContain('redeploy_known_good');
    expect(workflow).toContain('Backend recovery never runs migrations.');
    expect(workflow).toContain('Backend recovery never deploys the frontend.');
    expect(workflow).toContain('name: Inspect backend recovery state');
    expect(workflow).toContain('az webapp log deployment list');
    expect(workflow).toContain('az webapp restart');
    expect(workflow).toContain('Recovery product SHA must be an ancestor of the workflow control SHA.');
    expect(workflow).toContain('ref: ${{ needs.resolve.outputs.product_sha }}');
    expect(workflow).toContain('RELEASE_SHA: ${{ needs.resolve.outputs.product_sha }}');
  });

  it('keeps deep Kudu diagnostics read-only and separate from recovery actions', () => {
    const step = stepBlock('Inspect exact Kudu deployment and runtime diagnostics (read-only)');

    expect(workflow).toContain('diagnose_deep');
    expect(step).toContain('az account get-access-token');
    expect(step).toContain('${KUDU}/deployments');
    expect(step).toContain('az webapp log download');
    expect(step).toContain('az webapp config show');
    expect(step).toContain('WORKFORCE_MALWARE_SCANNER_URL_PRESENT');
    expect(step).toContain('SCANNER_READY_HTTP_STATUS');
    expect(step).toContain('SCANNER_SCAN_HTTP_STATUS');
    expect(step).toContain('No bearer secret is extracted from App Service or Key Vault.');
    expect(step).toContain('az appservice plan show');
    expect(step).toContain('az monitor metrics list');
    expect(step).toContain('for ARTIFACT_PATH in package.json dist/index.js node_modules release-identity.json');
    expect(step).not.toContain('for PATH in');
    expect(step).not.toContain('az webapp deploy');
    expect(step).not.toContain('az webapp restart');
    expect(step).not.toContain('az webapp config appsettings set');
    expect(step).not.toContain('prisma migrate');
    expect(step).not.toContain('prisma db push');
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
    expect(step).toContain('WebJob trigger returned HTTP 200 without Location; using stable history delta.');
    expect(step).toContain('Unexpected WebJob run Location; refusing to poll it.');
    expect(step).toContain('curl -sS -m 25 -H "Authorization: Bearer ${TOKEN}" "$LOCATION"');
    expect(step).toContain('if [ "$ST" = "Success" ]; then echo "Migration WebJob run $NEW_RUN succeeded."; exit 0; fi');
    expect(step).toContain('if [ "$ST" = "Failed" ] || [ "$ST" = "Error" ] || [ "$ST" = "Aborted" ]; then');
    expect(step).toContain('Timed out waiting for WebJob run $NEW_RUN.');
  });

  it('uses stable history delta only as the HTTP 200 no-Location fallback', () => {
    const step = stepBlock('Trigger + verify THIS migration WebJob run');

    expect(step).toContain('HISTORY_API="${API}/history"');
    expect(step).toContain('BASELINE_ONE="$(mktemp)"');
    expect(step).toContain('BASELINE_TWO="$(mktemp)"');
    expect(step).toContain('An active migration execution already exists.');
    expect(step).toContain("'in_progress', 'in-progress'");
    expect(step).toContain('Migration history baseline changed before trigger.');
    expect(step).toContain('TRIGGER_START_UTC="$(date -u +%s%3N)"');
    expect(step).toContain('if [ "$HTTP_CODE" != "200" ] || [ "$CURL_STATUS" -ne 0 ]; then');
    expect(step).toContain('!baselineIds.has(id)');
    expect(step).toContain('started >= boundary');
    expect(step).toContain('if (candidates.length > 1) process.exit(3);');
    expect(step).toContain('Multiple qualifying new migration runs; refusing ambiguity.');
    expect(step).toContain('No unique post-trigger migration run yet.');
    expect(step).toContain('Timed out identifying a unique new migration run.');
    expect(step).toContain('LOCATION="${API}/history/${NEW_RUN}"');
    expect(step).not.toContain('history[0]');
    expect(step).not.toContain('latest_run');
    expect(step).not.toMatch(/curl[^\n]+\$HISTORY_API[^\n]+latest/);
  });

  it('preserves production target and deployment job ordering', () => {
    expect(workflow).toContain('BACKEND_APP: adminiculumbackend-b1-01');
    expect(workflow).not.toContain('vikoli-app');
    expect(workflow).toContain('concurrency:\n  group: adminiculum-appservice-production-deploy\n  cancel-in-progress: false');
    expect(workflow).toContain('needs: [resolve, backend, recovery]');
    expect(workflow).toContain("needs.backend.result == 'success'");
    expect(workflow).toContain("needs.recovery.result == 'success'");
    expect(workflow).toContain('needs: [resolve, backend, migration]');
    expect(workflow).toContain("&& (needs.backend.result == 'success' || needs.backend.result == 'skipped')");
    expect(workflow).toContain('(inputs.run_migration && needs.migration.result == \'success\')');
    expect(workflow).toContain('!inputs.run_migration');
    expect(workflow.indexOf('Deploy backend via Azure CLI and wait for terminal result')).toBeLessThan(workflow.indexOf('Backend health gate (/health 200)'));
    expect(workflow.indexOf('Trigger + verify THIS migration WebJob run')).toBeLessThan(workflow.indexOf('Backend health gate after migration (/health 200)'));
  });

  it('resolves one immutable SHA and propagates release identity to both artifacts', () => {
    expect(workflow).toContain('sha: ${{ steps.rev.outputs.sha }}');
    expect(workflow).toContain('build_time: ${{ steps.rev.outputs.build_time }}');
    expect(workflow).toContain('SHA=$(git rev-parse HEAD)');
    expect(workflow).toContain('BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")');
    expect(workflow).toContain('ref: ${{ needs.resolve.outputs.product_sha }}');
    expect(workflow).toContain('Backend/release-identity.json');
    expect(workflow).toContain('RELEASE_SHA: ${{ needs.resolve.outputs.product_sha }}');
    expect(workflow).toContain('PRODUCT_SHA="$CONTROL_SHA"');
    expect(workflow).toContain('NEXT_PUBLIC_APP_BUILD_TIME: ${{ needs.resolve.outputs.build_time }}');
    expect(workflow).toContain('Verify backend release identity');
    expect(workflow).toContain('Verify frontend release identity');
    expect(workflow.match(/git rev-parse/g)).toHaveLength(1);
    expect(workflow).not.toContain('git rev-parse release/editor-ops-workflow-1');
    expect(workflow).not.toContain('APP_COMMIT_SHA: ${{ secrets.');
    expect(workflow).not.toContain('APP_BUILD_TIME: ${{ secrets.');
  });
});
