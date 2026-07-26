import { spawnSync } from 'child_process';
import process from 'process';
import { Client } from 'pg';

const databaseUrl = process.env.MIGRATION_REPLAY_DATABASE_URL;

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
  ];
  for (const table of requiredTables) {
    const row = await one('SELECT to_regclass($1) AS oid', [`public.${table}`]);
    if (!row.oid) throw new Error(`required table missing: ${table}`);
  }

  const failedRows = await one(`SELECT to_regclass('public._prisma_migrations') AS oid`);
  if (failedRows.oid) {
    const active = await one('SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL');
    if (active.count !== 0) throw new Error(`active failed migrations present: ${active.count}`);
  }
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
  await verifySchemaShape();
  await verifyRepresentativeWrites();
  await client.end();

  console.log('VERIFY OK: canonical empty bootstrap reconstructed current schema and representative writes passed.');
}

main().catch(async (error) => {
  console.error('VERIFY FAILED:', error.message);
  try { await client.end(); } catch { /* ignore */ }
  process.exitCode = 1;
});
