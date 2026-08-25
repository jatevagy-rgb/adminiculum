import { spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import { Client } from 'pg';

const databaseUrl = process.env.MIGRATION_REPLAY_DATABASE_URL;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const baselineName = '20260726000000_current_schema_baseline';
const cp0MigrationName = '20260803190000_client_portal_workspace_foundation';
const wp1MigrationName = '20260824200000_work_package_schema_foundation';

if (!databaseUrl) {
  console.error('VERIFY FAILED: MIGRATION_REPLAY_DATABASE_URL is required.');
  process.exit(2);
}

if (!/adminiculum(_|-)?(replay|baseline|empty|ci)/i.test(databaseUrl)) {
  console.error('VERIFY REFUSED: database URL must target an explicitly disposable replay/baseline/empty/ci database.');
  process.exit(3);
}

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status}`);
  }
}

function createClient() {
  return new Client({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1') ? undefined : { rejectUnauthorized: false },
  });
}

let client = createClient();

async function one(sql, params = []) {
  return (await client.query(sql, params)).rows[0];
}

async function resetDisposableSchema() {
  await client.query('DROP SCHEMA IF EXISTS public CASCADE');
  await client.query('CREATE SCHEMA public');
}

async function ensurePrismaMigrationsTable() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
    )`);
}

async function seedCp0CompatibilityFixture() {
  await client.query(`INSERT INTO users (id, email, name, role, "createdAt", "updatedAt") VALUES
    ('cp0-admin', 'cp0-admin@example.invalid', 'CP0 Admin', 'ADMIN', now(), now()),
    ('cp0-legacy-client', 'cp0-legacy@example.invalid', 'CP0 Legacy Client', 'CLIENT', now(), now())`);
  await client.query(`INSERT INTO clients (id, name, "createdAt", "updatedAt") VALUES ('cp0-client', 'CP0 Client', now(), now())`);
  await client.query(`INSERT INTO cases (id, "caseNumber", title, "caseType", "clientId", "assignedLawyerId", "createdById", "createdAt", "updatedAt", status, "matterType") VALUES
    ('cp0-case-authorized', 'CP0-AUTH', 'Authorized legacy case', 'CONTRACT_REVIEW', 'cp0-client', 'cp0-admin', 'cp0-admin', now(), now(), 'DRAFT', 'CONTRACT'),
    ('cp0-case-orphan', 'CP0-ORPHAN', 'Orphan grant case', 'CONTRACT_REVIEW', 'cp0-client', 'cp0-admin', 'cp0-admin', now(), now(), 'DRAFT', 'CONTRACT'),
    ('cp0-case-legacy', 'CP0-LEGACY', 'Legacy user case', 'CONTRACT_REVIEW', 'cp0-client', 'cp0-admin', 'cp0-admin', now(), now(), 'DRAFT', 'CONTRACT')`);
  await client.query(`INSERT INTO client_portal_identities (id, provider, issuer, subject, "normalizedEmail", "emailVerifiedAt", "displayName", "accountType", status, "createdAt", "updatedAt") VALUES
    ('cp0-identity-authorized', 'ENTRA_EXTERNAL_ID', 'https://cp0.example.invalid/', 'authorized', 'authorized@example.invalid', now(), 'Authorized Identity', 'INDIVIDUAL', 'ACTIVE', now(), now()),
    ('cp0-identity-orphan', 'ENTRA_EXTERNAL_ID', 'https://cp0.example.invalid/', 'orphan', 'orphan@example.invalid', now(), 'Orphan Identity', 'INDIVIDUAL', 'ACTIVE', now(), now()),
    ('cp0-identity-no-grant', 'ENTRA_EXTERNAL_ID', 'https://cp0.example.invalid/', 'no-grant', 'no-grant@example.invalid', now(), 'No Grant Identity', 'INDIVIDUAL', 'ACTIVE', now(), now())`);
  await client.query(`INSERT INTO client_organization_membership_requests (id, "clientPortalIdentityId", "requestedClientId", status, "createdAt", "updatedAt") VALUES
    ('cp0-request-authorized', 'cp0-identity-authorized', 'cp0-client', 'APPROVED', now(), now()),
    ('cp0-request-no-grant', 'cp0-identity-no-grant', 'cp0-client', 'APPROVED', now(), now())`);
  await client.query(`INSERT INTO client_organization_memberships (id, "clientPortalIdentityId", "clientId", status, "approvedFromRequestId", "approvedById", "approvedAt", "createdAt", "updatedAt") VALUES
    ('cp0-membership-authorized', 'cp0-identity-authorized', 'cp0-client', 'ACTIVE', 'cp0-request-authorized', 'cp0-admin', now(), now(), now()),
    ('cp0-membership-no-grant', 'cp0-identity-no-grant', 'cp0-client', 'ACTIVE', 'cp0-request-no-grant', 'cp0-admin', now(), now(), now())`);
  await client.query(`INSERT INTO client_portal_grants (id, "clientPortalIdentityId", "clientUserId", "clientId", "caseId", role, status, permissions, "validFrom", "invitedById", "activatedAt", "createdAt", "updatedAt") VALUES
    ('cp0-grant-authorized', 'cp0-identity-authorized', NULL, 'cp0-client', 'cp0-case-authorized', 'VIEWER', 'ACTIVE', ARRAY['MATTER_READ']::"ClientPortalPermission"[], now(), 'cp0-admin', now(), now(), now()),
    ('cp0-grant-orphan', 'cp0-identity-orphan', NULL, 'cp0-client', 'cp0-case-orphan', 'VIEWER', 'ACTIVE', ARRAY['MATTER_READ']::"ClientPortalPermission"[], now(), 'cp0-admin', now(), now(), now()),
    ('cp0-grant-legacy', NULL, 'cp0-legacy-client', 'cp0-client', 'cp0-case-legacy', 'VIEWER', 'ACTIVE', ARRAY['MATTER_READ']::"ClientPortalPermission"[], now(), 'cp0-admin', now(), now(), now())`);
  console.log('CP0 compatibility fixture seeded before workspace migration.');
}

async function applyPostBaselineMigrations() {
  const migrationsRoot = path.join(backendRoot, 'prisma', 'migrations');
  const migrationNames = fs.readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name > baselineName)
    .sort();

  if (migrationNames.length === 0) {
    console.log('post-baseline migrations: none');
    return;
  }

  await ensurePrismaMigrationsTable();
  for (const migrationName of migrationNames) {
    if (migrationName === cp0MigrationName) await seedCp0CompatibilityFixture();
    if (migrationName === '20260824150000_phase7d1_temporal_scope_enrollment') await seedPhase7D1EnrollmentFixture();
    if (migrationName === wp1MigrationName) await seedWp1LegacyFixture();
    const migrationPath = path.join(migrationsRoot, migrationName, 'migration.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const checksum = crypto.createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');

    console.log(`applying migration: ${migrationName}`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(
        `INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
         VALUES ($1, $2, now(), $3, now(), 1)`,
        [crypto.randomUUID(), checksum, migrationName]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
}

async function seedWp1LegacyFixture() {
  await client.query(`INSERT INTO cases (id, "caseNumber", title, "caseType", "clientId", "createdById", "createdAt", "updatedAt")
    VALUES ('wp1-legacy-case', 'WP1-LEGACY', 'WP-1 legacy case', 'OTHER', 'cp0-client', 'cp0-admin', now(), now())`);
  await client.query(`INSERT INTO tasks (id, title, "taskType", "caseId", "requiredSkills", "createdAt", "updatedAt")
    VALUES ('wp1-legacy-task', 'WP-1 legacy task', 'OTHER', 'wp1-legacy-case', ARRAY[]::text[], now(), now())`);
  console.log('WP-1 legacy Case/Task fixture seeded before schema migration.');
}

async function verifyWp1LegacyPreservation() {
  const legacyCase = await one(`SELECT "caseType"::text AS "caseType", "caseTypeDefinitionId" FROM cases WHERE id = 'wp1-legacy-case'`);
  if (!legacyCase || legacyCase.caseType !== 'OTHER' || legacyCase.caseTypeDefinitionId !== null) throw new Error('WP-1 rewrote the legacy Case type or provenance column.');
  const legacyTask = await one(`SELECT "workPackageItemId" FROM tasks WHERE id = 'wp1-legacy-task'`);
  if (!legacyTask || legacyTask.workPackageItemId !== null) throw new Error('WP-1 rewrote the legacy Task provenance column.');
  console.log('WP-1 legacy Case/Task preservation OK: caseType retained, new provenance columns NULL.');
}

async function seedPhase7D1EnrollmentFixture() {
  await client.query(`INSERT INTO clients (id, name, "createdAt", "updatedAt") VALUES
    ('phase7d1-existing-profile', 'Phase 7D1 Existing Profile', now(), now()),
    ('phase7d1-bare-client', 'Phase 7D1 Bare Client', now(), now())`);
  await client.query(`INSERT INTO client_operating_profiles (id, "clientId", "createdAt", "updatedAt")
    VALUES ('phase7d1-existing-profile-row', 'phase7d1-existing-profile', now(), now())`);
  console.log('Phase 7D1 fixture seeded before enrollment migration.');
}

async function verifyPhase7D1EnrollmentSemantics() {
  const existing = await one(`SELECT "complianceEnrollmentStatus"::text AS status FROM client_operating_profiles WHERE "clientId"='phase7d1-existing-profile'`);
  if (!existing || existing.status !== 'ENROLLED') throw new Error('Phase 7D1 existing profile was not backfilled to ENROLLED.');
  const bare = await one(`SELECT count(*)::int AS count FROM client_operating_profiles WHERE "clientId"='phase7d1-bare-client'`);
  if (bare.count !== 0) throw new Error('Phase 7D1 created a profile for a bare client.');
  const created = await one(`INSERT INTO client_operating_profiles (id, "clientId", "createdAt", "updatedAt")
    VALUES ('phase7d1-new-profile-row', 'phase7d1-bare-client', now(), now())
    RETURNING "complianceEnrollmentStatus"::text AS status`);
  if (created.status !== 'NOT_ENROLLED') throw new Error('Phase 7D1 new profile did not default to NOT_ENROLLED.');
  console.log('Phase 7D1 enrollment semantics OK: existing=ENROLLED, bare remains bare, new=NOT_ENROLLED.');
}

async function verifySchemaShape() {
  const requiredTables = [
    'users',
    'clients',
    'cases',
    'case_collaborators',
    'tasks',
    'communications',
    'documents',
    'document_versions',
    'document_annotations',
    'case_intake_deadlines',
    'document_task_links',
    'document_comparisons',
    'document_change_segments',
    'client_portal_workspaces',
    'client_portal_workspace_memberships',
    'client_portal_workspace_events',
    'case_type_definitions',
    'work_package_templates',
    'work_package_template_items',
    'case_work_packages',
    'case_work_package_items',
  ];
  for (const table of requiredTables) {
    const row = await one('SELECT to_regclass($1) AS oid', [`public.${table}`]);
    if (!row.oid) throw new Error(`required table missing: ${table}`);
  }

  for (const enumName of ['WorkPackageModuleType', 'WorkPackageTemplateStatus', 'CaseWorkPackageItemStatus']) {
    const row = await one('SELECT 1 FROM pg_type WHERE typname = $1 AND typtype = \'e\'', [enumName]);
    if (!row) throw new Error(`required enum missing: ${enumName}`);
  }

  const failedRows = await one(`SELECT to_regclass('public._prisma_migrations') AS oid`);
  if (failedRows.oid) {
    const active = await one('SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL');
    if (active.count !== 0) throw new Error(`active failed migrations present: ${active.count}`);
  }
}

async function verifyCp0CompatibilityBackfill() {
  const workspace = await one(`SELECT id, "clientId", status::text FROM client_portal_workspaces WHERE "clientId"='cp0-client'`);
  if (!workspace || workspace.status !== 'ACTIVE') throw new Error('CP0 compatibility workspace was not created for the previously authorized identity.');
  const workspaceMemberships = await client.query(`SELECT "clientPortalIdentityId", status::text FROM client_portal_workspace_memberships WHERE "workspaceId"=$1 ORDER BY "clientPortalIdentityId"`, [workspace.id]);
  if (workspaceMemberships.rowCount !== 1 || workspaceMemberships.rows[0].clientPortalIdentityId !== 'cp0-identity-authorized' || workspaceMemberships.rows[0].status !== 'ACTIVE') {
    throw new Error('CP0 backfill broadened workspace membership beyond the exact active membership + active grant intersection.');
  }
  const grants = await client.query(`SELECT id, "workspaceId" FROM client_portal_grants WHERE id LIKE 'cp0-grant-%' ORDER BY id`);
  if (grants.rowCount !== 3) throw new Error('CP0 backfill changed the legacy grant inventory.');
  const byId = new Map(grants.rows.map((row) => [row.id, row.workspaceId]));
  if (byId.get('cp0-grant-authorized') !== workspace.id || byId.get('cp0-grant-orphan') !== null || byId.get('cp0-grant-legacy') !== null) {
    throw new Error('CP0 backfill expanded or reassigned an ineligible legacy grant.');
  }
  console.log('CP0 backfill OK: exact prior access preserved; orphan and legacy-user grants received no workspace access.');
}

async function verifyRepresentativeWrites() {
  const userId = 'replay-user-1';
  const clientId = 'replay-client-1';
  const caseId = 'replay-case-1';
  const documentId = 'replay-document-1';
  const versionId = 'replay-version-1';
  const taskId = 'replay-task-1';
  const communicationId = 'replay-communication-1';

  await client.query(`INSERT INTO users (id, email, name, role, "createdAt", "updatedAt") VALUES ($1, 'replay@example.invalid', 'Replay User', 'LAWYER', now(), now())`, [userId]);
  await client.query(`INSERT INTO clients (id, name, "createdAt", "updatedAt") VALUES ($1, 'Replay Client', now(), now())`, [clientId]);
  await client.query(`INSERT INTO cases (id, "caseNumber", title, "caseType", "clientId", "assignedLawyerId", "createdById", "createdAt", "updatedAt", status, "matterType") VALUES ($1, 'REPLAY-1', 'Replay Case', 'CONTRACT_REVIEW', $2, $3, $3, now(), now(), 'DRAFT', 'CONTRACT')`, [caseId, clientId, userId]);
  await client.query(`INSERT INTO case_collaborators ("caseId", "userId", role) VALUES ($1, $2, 'LAWYER')`, [caseId, userId]);
  await client.query(`INSERT INTO tasks (id, title, "taskType", status, priority, "caseId", "assignedToId", "assignedById", "requiredSkills", "createdAt", "updatedAt") VALUES ($1, 'Replay Task', 'OTHER', 'TODO', 'MEDIUM', $2, $3, $3, ARRAY[]::text[], now(), now())`, [taskId, caseId, userId]);
  await client.query(`INSERT INTO communications (id, type, subject, "caseId", "clientId", "createdById", "createdAt", "updatedAt") VALUES ($1, 'NOTE', 'Replay Communication', $2, $3, $4, now(), now())`, [communicationId, caseId, clientId, userId]);
  await client.query(`INSERT INTO documents (id, name, "mimeType", category, "clientId", "caseId", "fileName", "documentType", version, folder, "isLatest", "createdAt", "updatedAt") VALUES ($1, 'Replay Document', 'text/plain', 'CONTRACT', $2, $3, 'replay.txt', 'CLIENT_INPUT', '1', 'CLIENT_INPUT', true, now(), now())`, [documentId, clientId, caseId]);
  await client.query(`INSERT INTO document_versions (id, "documentId", version, name, "uploadedById", "createdAt", "originalFileName", "mimeType", size, "currentVersion", "uploadSource", "versionType") VALUES ($1, $2, 1, 'v1', $3, now(), 'replay.txt', 'text/plain', 7, true, 'LAWYER_UPLOAD', 'ORIGINAL')`, [versionId, documentId, userId]);
  await client.query(`INSERT INTO document_annotations (id, "documentId", "documentVersionId", "annotationType", "anchorType", status, visibility, "selectedText", "createdById", "createdAt", "updatedAt") VALUES ('replay-annotation-1', $1, $2, 'INTERNAL_NOTE', 'TEXT_RANGE', 'OPEN', 'INTERNAL', 'Replay', $3, now(), now())`, [documentId, versionId, userId]);
  await client.query(`INSERT INTO case_intake_deadlines (id, "caseId", title, "deadlineType", "dueAt", "createdById", "createdAt", "updatedAt") VALUES ('replay-deadline-1', $1, 'Replay Deadline', 'INTERNAL', now(), $2, now(), now())`, [caseId, userId]);
  await client.query(`INSERT INTO document_task_links (id, "documentId", "taskId", "createdById", "createdAt") VALUES ('replay-doc-task-1', $1, $2, $3, now())`, [documentId, taskId, userId]);

  let fkProtected = false;
  try {
    await client.query(`INSERT INTO document_versions (id, "documentId", version, "uploadedById", "createdAt", "updatedAt", "originalFileName", "isCurrent", "uploadSource", "versionType") VALUES ('bad-version', 'missing-document', 1, $1, now(), now(), 'bad.txt', false, 'LAWYER_UPLOAD', 'ORIGINAL')`, [userId]);
  } catch {
    fkProtected = true;
  }
  if (!fkProtected) throw new Error('foreign-key protection check failed');
}

async function main() {
  await client.connect();
  const id = await one('SELECT current_database() AS database, version() AS version');
  console.log(`database        : ${id.database}`);
  console.log(`postgres        : ${String(id.version).split(',')[0]}`);
  await resetDisposableSchema();
  await client.end();

  run('node', ['scripts/db-bootstrap-empty.mjs'], { DATABASE_URL: databaseUrl });
  run('npx', ['prisma', 'validate'], { DATABASE_URL: databaseUrl });
  run('npx', ['prisma', 'generate'], { DATABASE_URL: databaseUrl });

  client = createClient();
  await client.connect();
  await applyPostBaselineMigrations();
  await verifyPhase7D1EnrollmentSemantics();
  await verifyWp1LegacyPreservation();
  await verifySchemaShape();
  await verifyCp0CompatibilityBackfill();
  await verifyRepresentativeWrites();
  await client.end();

  console.log('VERIFY OK: canonical empty bootstrap reconstructed current schema and representative writes passed.');
}

main().catch(async (error) => {
  console.error('VERIFY FAILED:', error.message);
  try { await client.end(); } catch { /* ignore */ }
  process.exitCode = 1;
});
