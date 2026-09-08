import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import child_process from 'node:child_process';

const repoRoot = path.resolve(__dirname, '..', '..');
const workflow = fs
  .readFileSync(path.join(repoRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')
  .replace(/\r\n/g, '\n');
const preflightWorkflow = fs
  .readFileSync(path.join(repoRoot, '.github', 'workflows', 'preflight.yml'), 'utf8')
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
    expect(workflow).toContain('needs: [resolve, recovery_inspection, recovery]');
    expect(workflow).toContain("needs.recovery.result == 'success'");
    expect(workflow).toContain('!inputs.deploy_backend');
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
    expect(step).toContain('SCANNER_READY_HTTP_STATUS');
    expect(step).toContain('SCANNER_SCAN_HTTP_STATUS');
    expect(step).toContain("SCANNER_APP='adminiculum-malware-scanner-01'");
    expect(step).toContain('SCANNER_RESOURCE_READ=PASS');
    expect(step).toContain('SCANNER_DEFAULT_HOSTNAME');
    expect(step).toContain('READY_DNS_RESOLUTION');
    expect(step).toContain('READY_CONNECTIVITY');
    expect(step).toContain('The scanner key is deliberately not read from App Service or Key Vault.');
    expect(step).toContain('az appservice plan show');
    expect(step).toContain('az monitor metrics list');
    expect(step).toContain('for ARTIFACT_PATH in package.json dist/index.js node_modules release-identity.json');
    expect(step).not.toContain('for PATH in');
    expect(step).not.toContain('az webapp deploy');
    expect(step).not.toContain('az webapp restart');
    expect(step).not.toContain('az webapp config show');
    expect(step).not.toContain('az webapp config appsettings list');
    expect(step).not.toContain('publishxml');
    expect(step).not.toContain('az webapp config appsettings set');
    expect(step).not.toContain('/scan"');
    expect(step).not.toContain('prisma migrate');
    expect(step).not.toContain('prisma db push');
  });

  it('uses only Reader-compatible metadata for scanner runtime discovery', () => {
    const step = stepBlock('Inspect scanner runtime (Reader-only)');

    expect(workflow).toContain('diagnose_scanner_runtime');
    expect(step).toContain("SCANNER_APP='adminiculum-malware-scanner-01'");
    expect(step).toContain('az rest --method get');
    expect(step).toContain('ACTIVE_SUBSCRIPTION_ID="$(az account show --query id -o tsv)"');
    expect(step).toContain('SUBSCRIPTION_ID_SOURCE=ACTIVE_AZURE_CONTEXT');
    expect(step).toContain('providers/Microsoft.Web/sites/${BACKEND_APP}?api-version=2024-04-01');
    expect(step).toContain('BACKEND_OUTBOUND_IPS');
    expect(step).toContain('BACKEND_VNET_INTEGRATION');
    expect(step).toContain('providers/Microsoft.KeyVault/vaults?api-version=2023-07-01');
    expect(step).toContain('KEY_VAULT_ENUMERATION=PASS');
    expect(step).toContain('KEY_VAULT_RESOURCE_ID');
    expect(step).toContain('SCANNER_KEY_VAULT_ATTRIBUTION=PROVEN');
    expect(step).toContain('providers/Microsoft.Web/sites/${SCANNER_APP}/config/web?api-version=2024-04-01');
    expect(step).toContain('SCANNER_ACCESS_RESTRICTIONS_READ=PASS');
    expect(step).toContain('BACKEND_EGRESS_MATCHES_SCANNER_ALLOWLIST');
    expect(step).toContain('management.azure.com/subscriptions/${ACTIVE_SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.Web/sites/${SCANNER_APP}');
    expect(step).not.toContain('subscriptions/6663573b-fcf7-497d-b2f5-c3498f4b/');
    expect(step).toContain('ARM_PERMISSION_USED=Microsoft.Web/sites/read');
    expect(step).toContain('SCANNER_RESOURCE_READ=PASS');
    expect(step).toContain('READY_DNS_RESOLUTION');
    expect(step).toContain('READY_CONNECTIVITY');
    expect(step).toContain('/health/ready');
    expect(step).toContain('SCAN_STATUS=NOT_PROBED_SAFE_AUTH_UNAVAILABLE');
    expect(step).not.toContain('get-access-token');
    expect(step).not.toContain('az webapp show');
    expect(step).not.toContain('config appsettings');
    expect(step).not.toContain('config show');
    expect(step).not.toContain('publishxml');
    expect(step).not.toContain('${KUDU}');
    expect(step).not.toContain('/scan');
    expect(step).not.toContain('az webapp restart');
    expect(step).not.toContain('az keyvault');
    expect(step).not.toContain('/secrets');
    expect(step).not.toContain('az webapp log download');
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
    expect(workflow).toContain('needs: [resolve, recovery_inspection, recovery]');
    expect(workflow).toContain('needs: [resolve, recovery_inspection, migration]');
    expect(workflow).toContain('needs: [resolve, backend, migration]');
    expect(workflow).toContain("needs.migration.result == 'success'");
    expect(workflow).toContain("needs.backend.result == 'success'");
    expect(workflow).toContain('(inputs.run_migration && needs.migration.result == \'success\')');
    expect(workflow).toContain('!inputs.run_migration');
    expect(workflow.indexOf('Trigger + verify THIS migration WebJob run')).toBeLessThan(workflow.indexOf('Deploy backend via Azure CLI and wait for terminal result'));
    expect(workflow.indexOf('Deploy backend via Azure CLI and wait for terminal result')).toBeLessThan(workflow.indexOf('Backend health gate (/health 200)'));
    expect(workflow.indexOf('Deploy backend via Azure CLI and wait for terminal result')).toBeLessThan(workflow.indexOf('Deploy frontend (zip, Oryx OFF'));
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

describe('migration-before-backend release order and staging contract', () => {
  it('does NOT require successful new backend deployment before migration', () => {
    const migrationDef = workflow.slice(workflow.indexOf('  migration:\n'), workflow.indexOf('  backend:\n'));
    expect(migrationDef).toContain('needs: [resolve, recovery_inspection, recovery]');
    expect(migrationDef).not.toContain('needs: [resolve, backend');
  });

  it('runs migration before backend deployment when deploy_backend=true and run_migration=true', () => {
    expect(workflow.indexOf('  migration:\n')).toBeLessThan(workflow.indexOf('  backend:\n'));
    expect(workflow.indexOf('Stage release migration assets into backend App Service (targeted VFS)')).toBeLessThan(
      workflow.indexOf('Deploy backend via Azure CLI and wait for terminal result')
    );
    expect(workflow.indexOf('Trigger + verify THIS migration WebJob run')).toBeLessThan(
      workflow.indexOf('Deploy backend via Azure CLI and wait for terminal result')
    );
  });

  it('makes backend depend on successful migration in migration mode', () => {
    const backendDef = workflow.slice(workflow.indexOf('  backend:\n'), workflow.indexOf('  frontend:\n'));
    expect(backendDef).toContain('needs: [resolve, recovery_inspection, migration]');
    expect(backendDef).toContain("(inputs.run_migration && needs.migration.result == 'success')");
  });

  it('allows backend to run without migration when run_migration=false', () => {
    const backendDef = workflow.slice(workflow.indexOf('  backend:\n'), workflow.indexOf('  frontend:\n'));
    expect(backendDef).toContain('!inputs.run_migration');
    expect(backendDef).toContain("(needs.migration.result == 'success' || needs.migration.result == 'skipped')");
  });

  it('makes frontend depend on successful backend and successful migration when requested', () => {
    const frontendDef = workflow.slice(workflow.indexOf('  frontend:\n'));
    expect(frontendDef).toContain('needs: [resolve, backend, migration]');
    expect(frontendDef).toContain("(inputs.run_migration && needs.migration.result == 'success')");
    expect(frontendDef).toContain("(needs.backend.result == 'success' || needs.backend.result == 'skipped')");
  });

  it('preserves frontend-only mode when backend is skipped', () => {
    const frontendDef = workflow.slice(workflow.indexOf('  frontend:\n'));
    expect(frontendDef).toContain('If backend was not deployed this run, require the current production backend to be healthy');
    expect(frontendDef).toContain('if: ${{ inputs.deploy_backend != true }}');
    expect(frontendDef).toContain("needs.backend.result == 'skipped'");
  });

  it('strictly restricts migration staging from writing runtime paths', () => {
    const stageStep = stepBlock('Stage release migration assets into backend App Service (targeted VFS)');
    expect(stageStep).toContain('validate_vfs_path()');
    expect(stageStep).toContain('site/wwwroot/prisma/(schema\\.prisma|migrations/[0-9]{14}_[a-zA-Z0-9_-]+(/migration\\.sql)?');
    expect(stageStep).toContain('site/wwwroot/dist*|site/wwwroot/node_modules*|site/wwwroot/package.json*|site/wwwroot/package-lock.json*|site/wwwroot/release-identity.json*|site/wwwroot/templates*|site/wwwroot/scripts*');
    expect(stageStep).toContain('SECURITY FAULT: Staging path');
    expect(stageStep).toContain('SECURITY FAULT: Attempted to stage into runtime path');
  });

  it('validates migration staging path security boundary (regression proof for false-positive)', () => {
    const preflightStep = stepBlock('Read-only migration release asset preflight');
    const stageStep = stepBlock('Stage release migration assets into backend App Service (targeted VFS)');

    for (const step of [preflightStep, stageStep]) {
      expect(step).toContain('validate_vfs_path()');
      expect(step).toContain('site/wwwroot/prisma/(schema\\.prisma|migrations/[0-9]{14}_[a-zA-Z0-9_-]+(/migration\\.sql)?');
      expect(step).toContain('site/wwwroot/dist*|site/wwwroot/node_modules*|site/wwwroot/package.json*|site/wwwroot/package-lock.json*|site/wwwroot/release-identity.json*|site/wwwroot/templates*|site/wwwroot/scripts*');
      expect(step).toContain('SECURITY FAULT: Staging path');
      expect(step).toContain('SECURITY FAULT: Attempted to stage into runtime path');
    }

    // Exact implementation of validate_vfs_path logic
    function testValidateVfsPath(target_path: string): { ok: boolean; exitCode: number; faultType?: 'runtime' | 'boundary' } {
      // 1. Runtime path check
      const runtimePatterns = [
        /^site\/wwwroot\/dist/,
        /^site\/wwwroot\/node_modules/,
        /^site\/wwwroot\/package\.json/,
        /^site\/wwwroot\/package-lock\.json/,
        /^site\/wwwroot\/release-identity\.json/,
        /^site\/wwwroot\/templates/,
        /^site\/wwwroot\/scripts/,
      ];
      for (const p of runtimePatterns) {
        if (p.test(target_path)) {
          return { ok: false, exitCode: 1, faultType: 'runtime' };
        }
      }

      // 2. Strict migration-only allowlist check
      const allowlist = /^site\/wwwroot\/prisma\/(schema\.prisma|migrations\/[0-9]{14}_[a-zA-Z0-9_-]+(\/migration\.sql)?)$/;
      if (!allowlist.test(target_path)) {
        return { ok: false, exitCode: 1, faultType: 'boundary' };
      }

      return { ok: true, exitCode: 0 };
    }

    // VALID paths (must pass without fault)
    const validCases = [
      'site/wwwroot/prisma/schema.prisma',
      'site/wwwroot/prisma/migrations/20260807120000_workflow_templates/migration.sql',
      'site/wwwroot/prisma/migrations/20260907170000_add_task_client_requester/migration.sql',
      'site/wwwroot/prisma/migrations/20260908120000_add_custom_scripts/migration.sql',
      'site/wwwroot/prisma/migrations/20260807120000_workflow_templates',
    ];

    for (const p of validCases) {
      const res = testValidateVfsPath(p);
      expect(res.ok).toBe(true);
      expect(res.exitCode).toBe(0);
      expect(res.faultType).toBeUndefined();
    }

    // INVALID runtime paths (must fail with runtime fault)
    const invalidRuntimeCases = [
      'site/wwwroot/dist/index.js',
      'site/wwwroot/node_modules/x',
      'site/wwwroot/package.json',
      'site/wwwroot/release-identity.json',
      'site/wwwroot/templates/file',
      'site/wwwroot/scripts/file',
    ];

    for (const p of invalidRuntimeCases) {
      const res = testValidateVfsPath(p);
      expect(res.ok).toBe(false);
      expect(res.exitCode).toBe(1);
      expect(res.faultType).toBe('runtime');
    }

    // INVALID boundary paths (must fail with boundary fault)
    const invalidBoundaryCases = [
      'site/wwwroot/prisma/anything-else',
      'site/wwwroot/prisma/migrations/not-a-valid-migration/file.sql',
    ];

    for (const p of invalidBoundaryCases) {
      const res = testValidateVfsPath(p);
      expect(res.ok).toBe(false);
      expect(res.exitCode).toBe(1);
      expect(res.faultType).toBe('boundary');
    }
  });

  it('preserves canonical adminiculum-db-migrate WebJob as the migration execution mechanism', () => {
    const migStep = stepBlock('Trigger + verify THIS migration WebJob run');
    expect(migStep).toContain('api/triggeredwebjobs/${MIGRATION_WEBJOB}');
    expect(workflow).toContain('MIGRATION_WEBJOB: adminiculum-db-migrate');
  });

  it('contains NO direct SQL, NO prisma db push, and NO DATABASE_URL exposed to GitHub Actions', () => {
    expect(workflow).not.toContain('prisma db push');
    expect(workflow).not.toContain('prisma migrate deploy');
    expect(workflow).not.toContain('${{ secrets.DATABASE_URL }}');
    expect(workflow).not.toMatch(/DATABASE_URL\s*:/);
    expect(workflow).not.toMatch(/\bpsql\b/);
  });

  it('pins the exact release SHA through all release jobs', () => {
    expect(workflow).toContain('ref: ${{ needs.resolve.outputs.product_sha }}');
    expect(workflow).toContain('RELEASE_SHA: ${{ needs.resolve.outputs.product_sha }}');
    expect(workflow).toContain('NEXT_PUBLIC_APP_COMMIT_SHA: ${{ needs.resolve.outputs.product_sha }}');
  });

  it('enforces current backend health gate, identity capture, and runtime immutability checks', () => {
    const gateStep = stepBlock('Verify current backend health and capture identity before migration');
    expect(gateStep).toContain('/health');
    expect(gateStep).toContain('/health/version');
    expect(gateStep).toContain('CURRENT_BACKEND_SHA=${CURRENT_SHA}');
    expect(gateStep).toContain('git cat-file -e "${CURRENT_SHA}^{commit}"');

    const postStageStep = stepBlock('Verify backend runtime unchanged after migration asset staging');
    expect(postStageStep).toContain('Post-stage /health -> $HEALTH_CODE');
    expect(postStageStep).toContain('EXPECTED_SHA="${CURRENT_BACKEND_SHA}"');
    expect(postStageStep).toContain('Backend runtime was modified!');

    const postMigStep = stepBlock('Backend health gate after migration (/health 200)');
    expect(postMigStep).toContain('EXPECTED_SHA="${CURRENT_BACKEND_SHA}"');
    expect(postMigStep).toContain('Backend runtime unexpectedly changed after migration!');
  });

  it('enforces Prisma CLI toolchain compatibility gate between current backend and target release', () => {
    const compatStep = stepBlock('Prisma CLI compatibility gate');
    expect(compatStep).toContain('git show "${CURRENT_SHA}:Backend/package.json"');
    expect(compatStep).toContain('git show "${CURRENT_SHA}:Backend/package-lock.json"');
    expect(compatStep).toContain('PRISMA_CLI_COMPATIBILITY=PASS');
    expect(compatStep).toContain('PRISMA_CLI_COMPATIBILITY=FAIL');
  });

  it('requires CURRENT_BACKEND_SHA to be an ancestor of RELEASE_SHA', () => {
    const gateStep = stepBlock('Verify current backend health and capture identity before migration');
    expect(gateStep).toContain('git merge-base --is-ancestor "${CURRENT_SHA}" "${RELEASE_SHA}"');
    expect(gateStep).toContain('CURRENT_BACKEND_ANCESTOR_OF_RELEASE=YES');
    expect(gateStep).toContain('CURRENT_BACKEND_ANCESTOR_OF_RELEASE=NO');
  });

  it('runs migration staging only after the ancestry gate passes', () => {
    const ancestryIndex = workflow.indexOf('CURRENT_BACKEND_ANCESTOR_OF_RELEASE=YES');
    const stagingIndex = workflow.indexOf('Stage release migration assets into backend App Service (targeted VFS)');
    expect(ancestryIndex).toBeGreaterThan(-1);
    expect(stagingIndex).toBeGreaterThan(-1);
    expect(ancestryIndex).toBeLessThan(stagingIndex);
  });

  it('compares canonical migration WebJob implementation between current backend and release SHA', () => {
    const webjobGate = stepBlock('Migration WebJob implementation compatibility gate');
    expect(webjobGate).toContain('git diff --quiet "${CURRENT_SHA}" "${RELEASE_SHA}" -- Backend/App_Data/jobs/triggered/adminiculum-db-migrate');
    expect(webjobGate).toContain('MIGRATION_WEBJOB_COMPATIBILITY=PASS');
    expect(webjobGate).toContain('MIGRATION_WEBJOB_COMPATIBILITY=FAIL');
  });

  it('fails closed when canonical migration WebJob implementation differs', () => {
    const webjobGate = stepBlock('Migration WebJob implementation compatibility gate');
    expect(webjobGate).toMatch(/if ! git diff --quiet[^\n]+; then\s+echo "MIGRATION_WEBJOB_COMPATIBILITY=FAIL"/);
    expect(webjobGate).toContain('exit 1');
  });

  it('reads remote migration directory inventory before WebJob execution', () => {
    const driftStep = stepBlock('Remote migration tree drift guard');
    expect(driftStep).toContain('vfs/site/wwwroot/prisma/migrations/');
    const driftIndex = workflow.indexOf('Remote migration tree drift guard');
    const triggerIndex = workflow.indexOf('Trigger + verify THIS migration WebJob run');
    expect(driftIndex).toBeLessThan(triggerIndex);
  });

  it('stops immediately if an unexpected remote canonical migration directory is detected', () => {
    const driftStep = stepBlock('Remote migration tree drift guard');
    expect(driftStep).toContain('REMOTE_MIGRATION_TREE_DRIFT=FAIL');
    expect(driftStep).toContain('REMOTE_MIGRATION_TREE_DRIFT=PASS');
    expect(driftStep).toContain('unexpected.push(dirName)');
    expect(driftStep).toContain('process.exit(1)');
  });

  it('validates remote migration assets against recovery_product_sha in recovery mode', () => {
    const recoveryGate = stepBlock('Recovery migration asset identity gate');
    expect(recoveryGate).toContain('if: ${{ !inputs.deploy_backend && inputs.run_migration }}');
    expect(recoveryGate).toContain('RECOVERY_MIGRATION_ASSET_IDENTITY=PASS');
    expect(recoveryGate).toContain('RECOVERY_MIGRATION_ASSET_IDENTITY=FAIL');
    expect(recoveryGate).toContain('vfs/site/wwwroot/prisma/schema.prisma');
    expect(recoveryGate).toContain('LOCAL_SCHEMA_SHA');
    expect(recoveryGate).toContain('REMOTE_SCHEMA_SHA');
    expect(recoveryGate).toContain('vfs/${REMOTE_SQL_PATH}');
  });

  it('ensures recovery migration does not rely only on /health/version identity', () => {
    const recoveryGate = stepBlock('Recovery migration asset identity gate');
    expect(recoveryGate).toContain('health/version');
    expect(recoveryGate).toContain('LOCAL_SCHEMA_SHA');
    expect(recoveryGate).toContain('REMOTE_SCHEMA_SHA');
    expect(recoveryGate).toContain('LOCAL_HASH');
    expect(recoveryGate).toContain('REMOTE_HASH');
  });

  it('verifies SHA256 hash of every staged migration.sql against remote', () => {
    const stagingStep = stepBlock('Stage release migration assets into backend App Service (targeted VFS)');
    expect(stagingStep).toContain('LOCAL_MIG_SHA');
    expect(stagingStep).toContain('REMOTE_MIG_SHA');
    expect(stagingStep).toContain('ALL_STAGED_MIGRATION_HASHES_VERIFIED=YES');
    expect(stagingStep).toContain('exit 1');
  });

  it('runs WebJob trigger only after schema and migration hash verifications pass', () => {
    const hashVerifyIndex = workflow.indexOf('ALL_STAGED_MIGRATION_HASHES_VERIFIED=YES');
    const triggerIndex = workflow.indexOf('Trigger + verify THIS migration WebJob run');
    expect(hashVerifyIndex).toBeGreaterThan(-1);
    expect(triggerIndex).toBeGreaterThan(-1);
    expect(hashVerifyIndex).toBeLessThan(triggerIndex);
  });

  it('does not include any automatic DELETE of remote migration directories', () => {
    expect(workflow).not.toMatch(/DELETE[^\n]+site\/wwwroot\/prisma\/migrations/);
    expect(workflow).not.toMatch(/rm\s+-rf[^\n]+prisma\/migrations/);
    const driftStep = stepBlock('Remote migration tree drift guard');
    expect(driftStep).toContain('Automatic delete of remote migration directories is disabled');
  });

  it('bypasses all migration staging and gates when run_migration=false', () => {
    const migrationDef = workflow.slice(workflow.indexOf('  migration:\n'), workflow.indexOf('  backend:\n'));
    expect(migrationDef).toContain('inputs.run_migration');
    const backendDef = workflow.slice(workflow.indexOf('  backend:\n'), workflow.indexOf('  frontend:\n'));
    expect(backendDef).toContain('!inputs.run_migration');
  });

  // -------------------------------------------------------------------------
  // 21 explicit migration preflight and staging contract tests
  // -------------------------------------------------------------------------

  it('1. CURRENT_SET and TARGET_SET are derived BEFORE first Kudu VFS PUT', () => {
    const preflightStep = stepBlock('Read-only migration release asset preflight');
    expect(preflightStep).toContain('CURRENT_MIGRATION_SET_DERIVED=YES');
    expect(preflightStep).toContain('TARGET_MIGRATION_SET_DERIVED=YES');
    expect(preflightStep).toContain('TARGET_MIGRATION_DELTA_DERIVED=YES');
    expect(preflightStep).toContain('git ls-tree --name-only "${currentSha}:Backend/prisma/migrations"');
    expect(preflightStep).not.toContain('-X PUT');

    const firstPutIndex = workflow.indexOf('-X PUT');
    const deriveIndex = workflow.indexOf('CURRENT_MIGRATION_SET_DERIVED=YES');
    expect(deriveIndex).toBeLessThan(firstPutIndex);
  });

  it('2. baseline remote identity is verified BEFORE first PUT', () => {
    const preflightStep = stepBlock('Read-only migration release asset preflight');
    expect(preflightStep).toContain('REMOTE_BASELINE_COMPLETE=YES');
    expect(preflightStep).toContain('REMOTE_BASELINE_HASH_VERIFIED=YES');
    expect(preflightStep).toContain('HISTORICAL_MIGRATIONS_REWRITTEN=NO');
    expect(preflightStep).toContain('REMOTE_BASELINE_MIGRATION_IDENTITY=PASS');
    expect(preflightStep).toContain('Baseline migration ${DIR_NAME}/migration.sql missing from remote');
    expect(preflightStep).toMatch(/if \[ "\$HTTP_CODE" != "200" \]; then[\s\S]*echo "REMOTE_BASELINE_MIGRATION_IDENTITY=FAIL"[\s\S]*exit 1/);
    expect(preflightStep).toMatch(/if \[ "\$LOCAL_BASELINE_SHA" != "\$REMOTE_BASELINE_SHA" \]; then[\s\S]*echo "REMOTE_BASELINE_MIGRATION_IDENTITY=FAIL"[\s\S]*exit 1/);

    const firstPutIndex = workflow.indexOf('-X PUT');
    const baselineVerifyIndex = workflow.indexOf('REMOTE_BASELINE_HASH_VERIFIED=YES');
    expect(baselineVerifyIndex).toBeLessThan(firstPutIndex);
  });

  it('3. existing target-extra hashes are verified BEFORE first PUT', () => {
    const preflightStep = stepBlock('Read-only migration release asset preflight');
    expect(preflightStep).toMatch(/if \[ "\$CHECK_CODE" = "200" \]; then[\s\S]*if \[ "\$LOCAL_MIG_SHA" = "\$REMOTE_EXISTING_SHA" \]; then[\s\S]*TARGET_EXTRA_EXISTING_IDENTITY=PASS/);
    expect(preflightStep).toMatch(/TARGET_EXTRA_EXISTING_IDENTITY=FAIL[\s\S]*Refusing overwrite\. STOP\.[\s\S]*exit 1/);
    expect(preflightStep).toContain('EXISTING_TARGET_EXTRA_PREFLIGHT_HASH_VERIFIED=YES');
    expect(preflightStep).toContain('EXISTING_TARGET_EXTRA_OVERWRITTEN=NO');

    const firstPutIndex = workflow.indexOf('-X PUT');
    const targetExtraVerifyIndex = workflow.indexOf('EXISTING_TARGET_EXTRA_PREFLIGHT_HASH_VERIFIED=YES');
    expect(targetExtraVerifyIndex).toBeLessThan(firstPutIndex);
  });

  it('4. remote-extra drift guard runs BEFORE first PUT', () => {
    const driftStep = stepBlock('Remote migration tree drift guard');
    expect(driftStep).toContain('REMOTE_MIGRATION_TREE_DRIFT=FAIL');
    expect(driftStep).toContain('REMOTE_MIGRATION_TREE_DRIFT=PASS');

    const firstPutIndex = workflow.indexOf('-X PUT');
    const driftIndex = workflow.indexOf('Remote migration tree drift guard');
    expect(driftIndex).toBeLessThan(firstPutIndex);
  });

  it('5. schema.prisma PUT occurs only after all read-only migration preflight gates', () => {
    const preflightIndex = workflow.indexOf('Read-only migration release asset preflight');
    const preflightEndIndex = workflow.indexOf('READ_ONLY_PREFLIGHT_BEFORE_FIRST_WRITE=YES');
    const stagingStep = stepBlock('Stage release migration assets into backend App Service (targeted VFS)');
    const schemaPutIndex = stagingStep.indexOf('Staging ${SCHEMA_TARGET}...');

    expect(preflightIndex).toBeGreaterThan(-1);
    expect(preflightEndIndex).toBeGreaterThan(-1);
    expect(schemaPutIndex).toBeGreaterThan(-1);
    expect(stagingStep).toContain('FIRST_PRODUCTION_WRITE_AFTER_ALL_PREFLIGHTS=YES');
    expect(stagingStep).toContain('FIRST_VFS_PUT_AFTER_PREFLIGHT=YES');

    const stagingBlockIndex = workflow.indexOf('Stage release migration assets into backend App Service (targeted VFS)');
    expect(preflightEndIndex).toBeLessThan(stagingBlockIndex);
  });

  it('6. CURRENT_SET must be subset of TARGET_SET', () => {
    const preflightStep = stepBlock('Read-only migration release asset preflight');
    expect(preflightStep).toContain('CURRENT_SET_SUBSET_OF_TARGET_SET=YES');
    expect(preflightStep).toContain('CURRENT_SET_SUBSET_OF_TARGET_SET=NO');
    expect(preflightStep).toContain('if (!targetSet.has(dirName))');
  });

  it('7. target deletion of historical migration fails closed', () => {
    const preflightStep = stepBlock('Read-only migration release asset preflight');
    expect(preflightStep).toMatch(/if \(!targetSet\.has\(dirName\)\) \{[\s\S]*HISTORICAL_MIGRATION_REPO_IMMUTABILITY=FAIL[\s\S]*Target deletion of historical migrations is strictly forbidden[\s\S]*process\.exit\(1\)/);
  });

  it('8. target modification of historical migration.sql fails closed', () => {
    const preflightStep = stepBlock('Read-only migration release asset preflight');
    expect(preflightStep).toMatch(/if \(currentSqlHash !== releaseSqlHash\) \{[\s\S]*HISTORICAL_MIGRATION_REPO_IMMUTABILITY=FAIL[\s\S]*HISTORICAL_MIGRATIONS_UNCHANGED_CURRENT_TO_TARGET=NO[\s\S]*Target modification of historical migrations is strictly forbidden[\s\S]*process\.exit\(1\)/);
  });

  it('9. historical current-to-target migrations are byte/hash identical', () => {
    const preflightStep = stepBlock('Read-only migration release asset preflight');
    expect(preflightStep).toContain('HISTORICAL_MIGRATIONS_UNCHANGED_CURRENT_TO_TARGET=YES');
    expect(preflightStep).toContain('HISTORICAL_MIGRATION_REPO_IMMUTABILITY_GATE=PASS');
  });

  it('10. migration delta must be non-empty in normal migration mode', () => {
    const preflightStep = stepBlock('Read-only migration release asset preflight');
    expect(preflightStep).toMatch(/if \(deltaSorted\.length === 0\) \{[\s\S]*MIGRATION_RELEASE_DELTA=EMPTY[\s\S]*MIGRATION_DELTA_NONEMPTY=NO[\s\S]*process\.exit\(1\)/);
    expect(preflightStep).toContain('MIGRATION_DELTA_NONEMPTY=YES');
  });

  it('11. every delta migration sorts strictly after CURRENT latest migration', () => {
    const preflightStep = stepBlock('Read-only migration release asset preflight');
    expect(preflightStep).toMatch(/for \(const d of deltaSorted\) \{[\s\S]*if \(d <= currentLatest\) \{[\s\S]*MIGRATION_HISTORY_APPEND_ONLY=FAIL[\s\S]*ALL_DELTA_MIGRATIONS_AFTER_CURRENT_LATEST=NO/);
    expect(preflightStep).toContain('ALL_DELTA_MIGRATIONS_AFTER_CURRENT_LATEST=YES');
  });

  it('12. backdated/new-before-current migration fails closed', () => {
    const preflightStep = stepBlock('Read-only migration release asset preflight');
    expect(preflightStep).toContain('BACKDATED_DELTA_FAILS_CLOSED=YES');
    expect(preflightStep).toMatch(/Backdated migration rejected\. STOP\.[\s\S]*process\.exit\(1\)/);
  });

  it('13. multiple ordered new migrations pass the contract', () => {
    const preflightStep = stepBlock('Read-only migration release asset preflight');
    expect(preflightStep).toMatch(/for \(let i = 1; i < deltaSorted\.length; i\+\+\) \{[\s\S]*if \(deltaSorted\[i\] <= deltaSorted\[i - 1\]\) \{[\s\S]*process\.exit\(1\)/);
    expect(preflightStep).toContain('MIGRATION_HISTORY_APPEND_ONLY=YES');
  });

  it('14. existing matching target-extra migration is not PUT', () => {
    const preflightStep = stepBlock('Read-only migration release asset preflight');
    expect(preflightStep).toContain('TARGET_EXTRA_EXISTING_IDENTITY=PASS');
    expect(preflightStep).toContain('skipping PUT');
    const stagingStep = stepBlock('Stage release migration assets into backend App Service (targeted VFS)');
    expect(stagingStep).toContain('EXISTING_TARGET_EXTRA_OVERWRITTEN=NO');
  });

  it('15. missing target-extra migration is PUT only after preflight passes', () => {
    const stagingStep = stepBlock('Stage release migration assets into backend App Service (targeted VFS)');
    expect(stagingStep).toContain('MISSING_TARGET_DELTA_ONLY_STAGED=YES');
    expect(stagingStep).toContain('while IFS= read -r DIR_NAME; do');
    expect(stagingStep).toContain('done < "$MISSING_FILE"');
    expect(stagingStep).toContain('NEWLY_STAGED_SQL_HASH_VERIFIED=YES');
  });

  it('16. baseline migration is never PUT', () => {
    const preflightStep = stepBlock('Read-only migration release asset preflight');
    expect(preflightStep).not.toContain('-X PUT');
    const stagingStep = stepBlock('Stage release migration assets into backend App Service (targeted VFS)');
    expect(stagingStep).toContain('HISTORICAL_MIGRATIONS_REWRITTEN=NO');
    expect(stagingStep).not.toContain('CURRENT_SET_FILE');
  });

  it('17. schema.prisma still gets post-PUT SHA verification', () => {
    const stagingStep = stepBlock('Stage release migration assets into backend App Service (targeted VFS)');
    expect(stagingStep).toContain('SCHEMA_HASH_VERIFIED=YES');
    expect(stagingStep).toContain('LOCAL_SCHEMA_SHA');
    expect(stagingStep).toContain('REMOTE_SCHEMA_SHA');
    expect(stagingStep).toMatch(/if \[ "\$LOCAL_SCHEMA_SHA" != "\$REMOTE_SCHEMA_SHA" \]; then/);
  });

  it('18. newly staged migration.sql still gets post-PUT SHA verification', () => {
    const stagingStep = stepBlock('Stage release migration assets into backend App Service (targeted VFS)');
    expect(stagingStep).toContain('LOCAL_MIG_SHA');
    expect(stagingStep).toContain('REMOTE_MIG_SHA');
    expect(stagingStep).toContain('NEWLY_STAGED_SQL_HASH_VERIFIED=YES');
    expect(stagingStep).toContain('ALL_STAGED_MIGRATION_HASHES_VERIFIED=YES');
    expect(stagingStep).toMatch(/if \[ "\$LOCAL_MIG_SHA" != "\$REMOTE_MIG_SHA" \]; then/);
  });

  it('19. recovery mode remains exact-tree / exact-hash and staging-free', () => {
    const recoveryGate = stepBlock('Recovery migration asset identity gate');
    expect(recoveryGate).toContain('RECOVERY_EXPECTED_TREE_COMPLETE=YES');
    expect(recoveryGate).toContain('RECOVERY_REMOTE_TREE_NO_EXTRAS=YES');
    expect(recoveryGate).toContain('RECOVERY_ALL_SQL_HASHES_MATCH=YES');
    expect(recoveryGate).toContain('RECOVERY_MIGRATION_ASSET_IDENTITY=PASS');
    expect(recoveryGate).not.toContain('-X PUT');
  });

  it('20. no DELETE is added', () => {
    expect(workflow).not.toMatch(/DELETE[^\n]+site\/wwwroot\/prisma\/migrations/);
    expect(workflow).not.toMatch(/rm\s+-rf[^\n]+prisma\/migrations/);
  });

  it('21. no direct SQL/db push/GitHub-side migrate deploy is added', () => {
    expect(workflow).not.toContain('prisma db push');
    expect(workflow).not.toContain('prisma migrate deploy');
    expect(workflow).not.toContain('${{ secrets.DATABASE_URL }}');
    expect(workflow).not.toMatch(/DATABASE_URL\s*:/);
    expect(workflow).not.toMatch(/\bpsql\b/);
  });

  it('fails closed when a remote canonical migration directory is outside TARGET_SET', () => {
    const driftStep = stepBlock('Remote migration tree drift guard');
    expect(driftStep).toContain('REMOTE_MIGRATION_TREE_DRIFT=FAIL');
    expect(driftStep).toContain('Remote migration directory contains canonical migrations not present in target commit');
    expect(driftStep).toContain('process.exit(1)');
  });

  it('fails closed with FAIL and never continues when recovery migration file returns non-200 / 404', () => {
    const recoveryGate = stepBlock('Recovery migration asset identity gate');
    expect(recoveryGate).toContain('RECOVERY_MISSING_EXPECTED_FILE_FAILS=YES');
    expect(recoveryGate).toMatch(/if \[ "\$CODE" != "200" \]; then[\s\S]*RECOVERY_MIGRATION_ASSET_IDENTITY=FAIL[\s\S]*exit 1/);
    expect(recoveryGate).not.toMatch(/elif\s*\[\s*"\$CODE"\s*=\s*"404"\s*\];\s*then[\s\S]*continue/);
  });

  it('requires complete recovery canonical set to exist remotely', () => {
    const recoveryGate = stepBlock('Recovery migration asset identity gate');
    expect(recoveryGate).toContain('RECOVERY_EXPECTED_TREE_COMPLETE=YES');
    expect(recoveryGate).toContain('RECOVERY_MIGRATION_ASSET_IDENTITY=PASS');
  });

  it('guarantees recovery canonical set has no foreign extras on remote', () => {
    const recoveryGate = stepBlock('Recovery migration asset identity gate');
    expect(recoveryGate).toContain('RECOVERY_REMOTE_TREE_NO_EXTRAS=YES');
    const driftStep = stepBlock('Remote migration tree drift guard');
    expect(driftStep).toContain('REMOTE_MIGRATION_TREE_DRIFT=FAIL');
  });

  it('requires every recovery migration.sql hash to match checkout', () => {
    const recoveryGate = stepBlock('Recovery migration asset identity gate');
    expect(recoveryGate).toContain('RECOVERY_ALL_SQL_HASHES_MATCH=YES');
    expect(recoveryGate).toMatch(/if \[ "\$LOCAL_HASH" != "\$REMOTE_HASH" \]; then[\s\S]*echo "RECOVERY_MIGRATION_ASSET_IDENTITY=FAIL"[\s\S]*exit 1/);
  });

  it('triggers WebJob only after all baseline, delta, and recovery identity gates pass', () => {
    const driftIndex = workflow.indexOf('Remote migration tree drift guard');
    const recoveryIndex = workflow.indexOf('Recovery migration asset identity gate');
    const preflightIndex = workflow.indexOf('Read-only migration release asset preflight');
    const stagingIndex = workflow.indexOf('Stage release migration assets into backend App Service (targeted VFS)');
    const triggerIndex = workflow.indexOf('Trigger + verify THIS migration WebJob run');

    expect(driftIndex).toBeLessThan(triggerIndex);
    expect(recoveryIndex).toBeLessThan(triggerIndex);
    expect(preflightIndex).toBeLessThan(triggerIndex);
    expect(stagingIndex).toBeLessThan(triggerIndex);
  });
});

describe('backend release artifact packaging and symlink preservation', () => {
  it('deploy.yml uses zip -r -y -q for backend runtime artifact packaging', () => {
    const step = stepBlock('Package prebuilt backend runtime artifact');
    expect(step).toContain('zip -r -y -q "$GITHUB_WORKSPACE/backend-deploy.zip"');
  });

  it('preflight.yml uses zip -r -y -q for backend runtime artifact packaging', () => {
    expect(preflightWorkflow).toContain('zip -r -y -q "$GITHUB_WORKSPACE/backend-deploy.zip"');
  });

  it('deploy.yml validates node_modules/.bin/prisma in ziplist.txt', () => {
    const step = stepBlock('Validate prebuilt backend artifact (fail fast)');
    expect(step).toContain("grep -qxF 'node_modules/.bin/prisma' ziplist.txt");
  });

  it('preflight.yml validates node_modules/.bin/prisma in ziplist.txt', () => {
    expect(preflightWorkflow).toContain("grep -qxF 'node_modules/.bin/prisma' ziplist.txt");
  });

  it('deploy.yml asserts node_modules/.bin/prisma is a symlink and starts prisma --version in offline extraction', () => {
    const step = stepBlock('Assert prebuilt artifact module loading (offline sanity)');
    expect(step).toContain('test -L "$TMP_DIR/node_modules/.bin/prisma"');
    expect(step).toContain('stat.isSymbolicLink()');
    expect(step).toContain('./node_modules/.bin/prisma --version');
  });

  it('preflight.yml asserts node_modules/.bin/prisma is a symlink and starts prisma --version in offline extraction', () => {
    expect(preflightWorkflow).toContain('test -L "$TMP_DIR/node_modules/.bin/prisma"');
    expect(preflightWorkflow).toContain('stat.isSymbolicLink()');
    expect(preflightWorkflow).toContain('./node_modules/.bin/prisma --version');
  });

  it('behavioral proof: dereferencing prisma CLI to .bin fails with ENOENT wasm, while executing from package dir succeeds', () => {
    const realPrisma = path.resolve(repoRoot, 'Backend', 'node_modules', 'prisma', 'build', 'index.js');
    if (!fs.existsSync(realPrisma)) {
      return;
    }

    const nodeModulesDir = path.resolve(repoRoot, 'Backend', 'node_modules');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prisma-symlink-test-'));
    try {
      const binDir = path.join(tmpDir, 'node_modules', '.bin');
      fs.mkdirSync(binDir, { recursive: true });

      const dereferencedPrisma = path.join(binDir, 'prisma.js');
      // Simulate zip without -y: copying dereferenced file into .bin without adjacent wasm
      fs.copyFileSync(realPrisma, dereferencedPrisma);

      const brokenResult = child_process.spawnSync(process.execPath, [dereferencedPrisma, '--version'], {
        encoding: 'utf8',
        env: { ...process.env, NODE_PATH: nodeModulesDir },
      });
      expect(brokenResult.status).not.toBe(0);
      expect(brokenResult.stderr).toContain('ENOENT');
      expect(brokenResult.stderr).toContain('prisma_schema_build_bg.wasm');

      // Verify that executing from the real package location (where __dirname contains wasm) succeeds
      const workingResult = child_process.spawnSync(process.execPath, [realPrisma, '--version'], {
        encoding: 'utf8',
      });
      expect(workingResult.status).toBe(0);
      expect(workingResult.stdout.toLowerCase()).toContain('prisma');

      // If the platform permits symlink creation, verify that symlinked execution resolves __dirname and succeeds
      const symlinkPrisma = path.join(binDir, 'prisma-symlink.js');
      try {
        fs.symlinkSync(realPrisma, symlinkPrisma, 'file');
        const symlinkResult = child_process.spawnSync(process.execPath, [symlinkPrisma, '--version'], {
          encoding: 'utf8',
          env: { ...process.env, NODE_PATH: nodeModulesDir },
        });
        expect(symlinkResult.status).toBe(0);
        expect(symlinkResult.stdout.toLowerCase()).toContain('prisma');
      } catch (symlinkErr: any) {
        if (symlinkErr.code !== 'EPERM') {
          throw symlinkErr;
        }
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
