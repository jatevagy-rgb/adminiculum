/**
 * One-shot production migration runner for 20260724140000_document_work_context.
 * Same pattern as the annotation runner: verify preconditions, apply exactly one
 * migration in a transaction, record a truthful _prisma_migrations row, verify
 * postconditions. Dry-run by default; pass --execute to write.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import { Client } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const migrationName = '20260724140000_document_work_context';
const expectedHead = '20260724120000_case_intake_redesign';
const migrationPath = path.join(backendRoot, 'prisma', 'migrations', migrationName, 'migration.sql');

const execute = process.argv.includes('--execute');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const migrationSql = fs.readFileSync(migrationPath, 'utf8');
const checksum = crypto.createHash('sha256').update(migrationSql).digest('hex');

const client = new Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('localhost') ? undefined : { rejectUnauthorized: false },
});
const one = async (sql, params = []) => (await client.query(sql, params)).rows[0] || null;
const assert = (c, m) => { if (!c) throw new Error(`PRECONDITION FAILED: ${m}`); };

async function main() {
  await client.connect();
  const id = await one('SELECT current_database() AS db');
  console.log(`database        : ${id.db}`);
  console.log(`migration       : ${migrationName}`);
  console.log(`migration sha256: ${checksum}`);
  console.log(`mode            : ${execute ? 'EXECUTE' : 'DRY RUN'}`);

  const head = await one(`
    SELECT migration_name FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY finished_at DESC LIMIT 1`);
  console.log(`head before     : ${head?.migration_name}`);
  assert(head?.migration_name === expectedHead, `expected head ${expectedHead}`);

  const failed = await client.query(
    'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL');
  assert(failed.rowCount === 0, 'active failed migration rows present');

  const already = await one('SELECT migration_name FROM _prisma_migrations WHERE migration_name = $1', [migrationName]);
  assert(!already, 'migration row already exists');

  const before = await one(`SELECT (SELECT count(*)::int FROM documents) c, (SELECT count(*)::int FROM document_versions) m`);
  console.log(`rows before     : documents=${before.c} versions=${before.m}`);
  console.log('preconditions   : OK');

  if (!execute) {
    console.log('\nDRY RUN complete — nothing written.');
    return;
  }

  const startedAt = new Date();
  const rowId = crypto.randomUUID();
  console.log(`\nstart           : ${startedAt.toISOString()}`);
  await client.query('BEGIN');
  try {
    await client.query(migrationSql);
    await client.query(`
      INSERT INTO _prisma_migrations
        (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES ($1, $2, now(), $3, NULL, NULL, $4, 1)`,
      [rowId, checksum, migrationName, startedAt]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('MIGRATION FAILED — rolled back, no partial schema written.');
    throw e;
  }
  console.log(`finish          : ${new Date().toISOString()}`);

  const checks = [];
  const add = (n, ok, d = '') => { checks.push({ n, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' :: ' + d : ''}`); };

  const cols = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='documents' AND column_name IN ('title','documentRole','workStatus','workInstruction','responsibleId','reviewerId','dueDate','workPriority','nextStep','sourceCommunicationId')");
  add('document work columns added', cols.rowCount === 10, `${cols.rowCount}/10`);

  const enumVals = await client.query(
    "SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typname='DocumentWorkStatus'");
  add('DocumentWorkStatus enum created', enumVals.rowCount === 9, `${enumVals.rowCount}/9`);

  const linkTable = await one("SELECT to_regclass('public.document_task_links') AS t");
  add('document_task_links exists', linkTable.t !== null);

  const uniq = await one("SELECT indexname FROM pg_indexes WHERE indexname='document_task_links_documentId_taskId_key'");
  add('duplicate link is impossible (unique index)', !!uniq);

  // The per-version concerns must be untouched by this migration.
  const vr = await one("SELECT column_name FROM information_schema.columns WHERE table_name='document_versions' AND column_name='reviewStatus'");
  const vp = await one("SELECT column_name FROM information_schema.columns WHERE table_name='document_versions' AND column_name='publicationStatus'");
  add('version review state untouched', !!vr);
  add('version publication state untouched', !!vp);

  const headAfter = await one(`
    SELECT migration_name FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY finished_at DESC LIMIT 1`);
  add('migration head advanced', headAfter?.migration_name === migrationName, headAfter?.migration_name);

  const fails = checks.filter((c) => !c.ok);
  console.log(`\n=== POSTCONDITIONS: ${checks.length - fails.length}/${checks.length} passed ===`);
  if (fails.length) { process.exitCode = 1; return; }
  console.log('MIGRATION APPLIED SUCCESSFULLY');
  console.log(`_prisma_migrations row id: ${rowId}`);
}

main()
  .catch((e) => { console.error(String(e.message)); process.exitCode = 1; })
  .finally(async () => { try { await client.end(); } catch { /* ignore */ } });
