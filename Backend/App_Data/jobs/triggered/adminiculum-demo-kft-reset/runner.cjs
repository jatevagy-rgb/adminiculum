/**
 * ADMINICULUM — DEMO KFT. HOSTED ACTIVATION (triggered WebJob)
 *
 * Manual operator action ONLY. NEVER auto-run on deploy.
 *
 * Guards (ALL must be true or the job hard-refuses):
 *  - ADMINICULUM_RUNTIME_ENVIRONMENT === 'demo'      (explicit demo-runtime marker)
 *  - ADMINICULUM_DEMO_CONTENT_ENABLED === 'true'     (demo content allowed)
 *  - ADMINICULUM_DEMO_RESET_ALLOWED === 'true'       (explicit reset opt-in)
 *  - App Service WEBSITE_SITE_NAME matches an explicit DEMO-designated site
 *    allowlist — NOT a production customer-data site.
 *
 * It runs the DEMO_KFT-namespaced fixture reset (which itself refuses production
 * and never touches non-DEMO rows), then verifies the Demo Kft. ORGANIZATION
 * tenant and the portal identity resolution, and links a configured hosted
 * identity to the Demo Kft. workspace via the real identity/model (never by
 * display-name/job-title inference).
 *
 * Output is LIMITED to the safe summary tokens below (no IDs/secrets/PII beyond
 * synthetic display names). No HTTP endpoint. No DATABASE_URL paste-in. No
 * committed secrets.
 */

const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Client } = require('pg');

const jobDirectory = __dirname;
const appRoot = process.env.DEMO_KFT_WEBJOB_ROOT || path.resolve(jobDirectory, '../../../..');
const expectedSite = process.env.DEMO_KFT_WEBJOB_EXPECTED_SITE || 'adminiculumdemo-b1-01';
const lockDirectory = process.env.WEBJOBS_DATA_PATH || process.env.HOME || os.tmpdir();
const lockPath = process.env.DEMO_KFT_WEBJOB_LOCK_PATH || path.join(lockDirectory, 'adminiculum-demo-kft-reset.lock');

const FIXTURE_KEY = 'DEMO_KFT_2026';
const NAMESPACE = 'DEMO_KFT_';

function stableId(name) {
  return crypto.createHash('sha256').update(`${FIXTURE_KEY}:${name}`).digest('hex').slice(0, 32);
}

function sanitize(value) {
  return String(value || '')
    .replace(/postgres(?:ql)?s?:\/\/[^\s'"`]+/gi, '[redacted-database-url]')
    .replace(/(password|passwd|pwd|secret|token)=([^\s&]+)/gi, '$1=[redacted]')
    .slice(-4000);
}

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function assertEnvironment() {
  if (process.argv.length !== 2) throw new Error('unsupported arguments');
  // Distinguish a production build/runtime that is an intentionally designated
  // DEMO host (allowed) from a production customer-data environment (refused).
  if (process.env.WEBSITE_SITE_NAME !== expectedSite) {
    throw new Error('not a designated DEMO App Service environment');
  }
  if (process.env.ADMINICULUM_RUNTIME_ENVIRONMENT !== 'demo') {
    throw new Error('ADMINICULUM_RUNTIME_ENVIRONMENT must be "demo"');
  }
  if (process.env.ADMINICULUM_DEMO_CONTENT_ENABLED !== 'true') {
    throw new Error('ADMINICULUM_DEMO_CONTENT_ENABLED must be "true"');
  }
  if (process.env.ADMINICULUM_DEMO_RESET_ALLOWED !== 'true') {
    throw new Error('ADMINICULUM_DEMO_RESET_ALLOWED must be "true"');
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
}

function createClient() {
  return new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? undefined : { rejectUnauthorized: false },
  });
}

const IDS = {
  clientId: stableId('demoClient'),
  workspaceId: stableId('orgWorkspace'),
  membershipId: stableId('membership'),
  identityId: stableId('portalIdentity'),
  personPeterfiId: stableId('personPeterfi'),
  lawyerCsanadId: stableId('lawyerCsanad'),
  lawyerGyulaId: stableId('lawyerGyula'),
  matterEmploymentId: stableId('matterEmployment'),
  matterSupplierId: stableId('matterSupplier'),
  matterComplianceId: stableId('matterCompliance'),
  caseEmploymentId: stableId('caseEmployment'),
  caseSupplierId: stableId('caseSupplier'),
  caseComplianceId: stableId('caseCompliance'),
  factDefinitionKey: 'DEMO_KFT_COMPANY_EMPLOYEE_COUNT',
};

async function runReset() {
  const script = path.join(appRoot, 'scripts', 'demo-kft-reset.mjs');
  const result = spawnSync(process.execPath, [script], {
    cwd: appRoot,
    env: {
      ...process.env,
      ADMINICULUM_DEMO_CONTENT_ENABLED: 'true',
    },
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`demo reset failed: ${sanitize(result.stderr || result.stdout || 'unknown error')}`);
  }
}

async function verifyAndActivate(client) {
  const clientRow = await client.query('SELECT name, "relationshipMode" FROM clients WHERE id = $1', [IDS.clientId]);
  if (clientRow.rowCount !== 1) throw new Error('Demo Kft. client not found after reset');
  const workspaceRow = await client.query('SELECT mode, status FROM client_portal_workspaces WHERE id = $1', [IDS.workspaceId]);
  if (workspaceRow.rowCount !== 1 || workspaceRow.rows[0].mode !== 'ORGANIZATION') {
    throw new Error('Demo Kft. workspace is not ORGANIZATION');
  }

  const caseCount = await client.query('SELECT count(*)::int AS c FROM cases WHERE id = ANY($1::uuid[])', [
    [IDS.caseEmploymentId, IDS.caseSupplierId, IDS.caseComplianceId],
  ]);
  const timeTotal = await client.query('SELECT sum(minutes)::int AS m FROM time_entries WHERE "matterId" = ANY($1::uuid[])', [
    [IDS.matterEmploymentId, IDS.matterSupplierId, IDS.matterComplianceId],
  ]);
  const factRow = await client.query(
    'SELECT "numberValue" FROM client_facts WHERE "clientId" = $1 AND type = $2 ORDER BY "validFrom" DESC LIMIT 1',
    [IDS.clientId, IDS.factDefinitionKey],
  );
  const personRow = await client.query('SELECT name, "jobTitle" FROM organization_persons WHERE id = $1', [IDS.personPeterfiId]);

  // Identity activation: link a configured hosted identity to the Demo Kft.
  // ORGANIZATION workspace via the real identity/membership model. Never from
  // display-name/job-title. OPTIONAL — only if DEMO_KFT_PORTAL_IDENTITY_EMAIL is set.
  const identityEmail = process.env.DEMO_KFT_PORTAL_IDENTITY_EMAIL;
  if (identityEmail && /\S+@\S+/.test(identityEmail)) {
    const normalizedEmail = identityEmail.trim().toLowerCase();
    let identity = await client.query('SELECT id FROM client_portal_identities WHERE "normalizedEmail" = $1', [normalizedEmail]);
    if (identity.rowCount === 0) {
      identity = await client.query(
        `INSERT INTO client_portal_identities (id, "normalizedEmail", status, "emailVerified", "createdAt", "updatedAt")
         VALUES ($1, $2, 'ACTIVE', true, now(), now()) RETURNING id`,
        [crypto.randomUUID(), normalizedEmail],
      );
    }
    const identityId = identity.rows[0].id;
    await client.query(
      `INSERT INTO client_portal_workspace_memberships (id, "clientPortalIdentityId", "workspaceId", status, role, "approvedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'ACTIVE', 'APPROVER', now(), now(), now())
       ON CONFLICT (id) DO UPDATE SET status='ACTIVE', role='APPROVER', "approvedAt"=now()`,
      [IDS.membershipId, identityId, IDS.workspaceId],
    );
    for (const caseId of [IDS.caseEmploymentId, IDS.caseSupplierId, IDS.caseComplianceId]) {
      await client.query(
        `INSERT INTO client_portal_grants (id, "clientPortalIdentityId", "workspaceId", "clientId", "caseId", role, status, permissions, "validFrom", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, 'VIEWER', 'ACTIVE', ARRAY['MATTER_READ','DOCUMENT_READ','DOCUMENT_DOWNLOAD','ACTION_REQUEST_READ','UPDATE_READ'], now(), now(), now())
         ON CONFLICT (id) DO NOTHING`,
        [crypto.randomUUID(), identityId, IDS.workspaceId, IDS.clientId, caseId],
      );
    }
  }

  const outcome = {
    DEMO_KFT_RESET: 'PASS',
    DEMO_CLIENT: clientRow.rows[0].name,
    PORTAL_MODE: workspaceRow.rows[0].mode,
    PORTAL_PERSONA: personRow.rowCount ? personRow.rows[0].name : 'unknown',
    CASES: Number(caseCount.rows[0].c),
    TIME_TOTAL_MINUTES: Number(timeTotal.rows[0] ? timeTotal.rows[0].m : 0),
    BASELINE_EMPLOYEE_COUNT: factRow.rowCount ? Number(factRow.rows[0].numberValue) : null,
  };
  if (outcome.PORTAL_MODE !== 'ORGANIZATION' || outcome.CASES !== 3 || outcome.BASELINE_EMPLOYEE_COUNT !== 47) {
    throw new Error('Demo Kft. verification failed: ' + JSON.stringify(outcome));
  }
  return outcome;
}

async function main() {
  assertEnvironment();
  let lock;
  try {
    lock = fs.openSync(lockPath, 'wx');
  } catch {
    throw new Error('another demo reset WebJob execution is already running');
  }
  const client = createClient();
  try {
    await client.connect();
    await runReset();
    const outcome = await verifyAndActivate(client);
    console.log('DEMO_KFT_RESET=PASS');
    console.log(`DEMO_CLIENT=${outcome.DEMO_CLIENT}`);
    console.log(`PORTAL_MODE=${outcome.PORTAL_MODE}`);
    console.log(`PORTAL_PERSONA=${outcome.PORTAL_PERSONA}`);
    console.log(`CASES=${outcome.CASES}`);
    console.log(`TIME_TOTAL_MINUTES=${outcome.TIME_TOTAL_MINUTES}`);
    console.log(`BASELINE_EMPLOYEE_COUNT=${outcome.BASELINE_EMPLOYEE_COUNT}`);
    emit({ application: process.env.WEBSITE_SITE_NAME, runnerVersion: '1', state: 'PASS', demoKft: outcome });
  } finally {
    await client.end().catch(() => {});
    if (lock !== undefined) {
      fs.closeSync(lock);
      fs.unlinkSync(lockPath);
    }
  }
}

main().catch((error) => {
  emit({ application: process.env.WEBSITE_SITE_NAME || 'unknown', runnerVersion: '1', state: 'FAILED', error: sanitize(error.message) });
  process.exitCode = 1;
});

module.exports = { sanitize, assertEnvironment };
