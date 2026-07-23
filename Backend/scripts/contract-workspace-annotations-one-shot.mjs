/**
 * One-shot production migration runner for
 * 20260723152000_contract_workspace_annotations.
 *
 * Follows the pattern established by the version-foundation rollout: verify
 * preconditions, apply exactly one migration inside a transaction, and record a
 * truthful _prisma_migrations row. Dry-run by default; pass --execute to write.
 *
 * Deliberately narrow: it never applies unrelated pending migrations and never
 * uses `prisma db push`. Logs contain no credentials.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import { Client } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');

const migrationName = '20260723152000_contract_workspace_annotations';
const expectedHead = '20260723143000_contract_workspace_version_foundation';
const migrationPath = path.join(backendRoot, 'prisma', 'migrations', migrationName, 'migration.sql');

const execute = process.argv.includes('--execute');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const migrationSql = fs.readFileSync(migrationPath, 'utf8');
const checksum = crypto.createHash('sha256').update(migrationSql).digest('hex');

const client = new Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1')
    ? undefined
    : { rejectUnauthorized: false },
});

const one = async (sql, params = []) => (await client.query(sql, params)).rows[0] || null;
const assert = (cond, msg) => { if (!cond) throw new Error(`PRECONDITION FAILED: ${msg}`); };

async function main() {
  await client.connect();

  const identity = await one(`SELECT current_database() AS db, current_schema() AS schema`);
  console.log(`database        : ${identity.db}`);
  console.log(`migration       : ${migrationName}`);
  console.log(`migration sha256: ${checksum}`);
  console.log(`mode            : ${execute ? 'EXECUTE' : 'DRY RUN'}`);

  // ---- preconditions -------------------------------------------------------
  const head = await one(`
    SELECT migration_name FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY finished_at DESC LIMIT 1
  `);
  console.log(`head before     : ${head?.migration_name}`);
  assert(head?.migration_name === expectedHead, `expected head ${expectedHead}, found ${head?.migration_name}`);

  const activeFailed = await client.query(`
    SELECT migration_name FROM _prisma_migrations
    WHERE finished_at IS NULL AND rolled_back_at IS NULL
  `);
  assert(activeFailed.rowCount === 0, `active failed migration rows present: ${activeFailed.rows.map(r => r.migration_name).join(', ')}`);

  const already = await one(`SELECT migration_name FROM _prisma_migrations WHERE migration_name = $1`, [migrationName]);
  assert(!already, 'annotation migration row already exists');

  const existing = await one(`SELECT to_regclass('public.document_annotations') AS t`);
  assert(existing.t === null, 'document_annotations already exists');

  const before = await one(`SELECT (SELECT count(*)::int FROM documents) d, (SELECT count(*)::int FROM document_versions) v`);
  console.log(`rows before     : documents=${before.d} versions=${before.v}`);
  console.log('preconditions   : OK');

  if (!execute) {
    console.log('\nDRY RUN complete — no changes written. Re-run with --execute to apply.');
    return;
  }

  // ---- apply ---------------------------------------------------------------
  const startedAt = new Date();
  const migrationId = crypto.randomUUID();
  console.log(`\nstart           : ${startedAt.toISOString()}`);

  await client.query('BEGIN');
  try {
    await client.query(migrationSql);
    await client.query(`
      INSERT INTO _prisma_migrations
        (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES ($1, $2, now(), $3, NULL, NULL, $4, 1)
    `, [migrationId, checksum, migrationName, startedAt]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('MIGRATION FAILED — transaction rolled back, no partial schema written.');
    throw error;
  }
  const finishedAt = new Date();
  console.log(`finish          : ${finishedAt.toISOString()}`);

  // ---- postconditions ------------------------------------------------------
  const checks = [];
  const add = (name, ok, detail = '') => { checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`); };

  const headAfter = await one(`
    SELECT migration_name FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY finished_at DESC LIMIT 1
  `);
  add('migration head advanced', headAfter?.migration_name === migrationName, headAfter?.migration_name);

  const failedAfter = await one(`SELECT count(*)::int n FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL`);
  add('no active failed migration rows', failedAfter.n === 0);

  for (const t of ['document_annotations', 'document_annotation_comments', 'document_annotation_events']) {
    const r = await one(`SELECT to_regclass($1) AS t`, [`public.${t}`]);
    add(`${t} exists`, r.t !== null);
  }

  const enums = await client.query(`SELECT DISTINCT t.typname FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typname LIKE 'DocumentAnnotation%'`);
  add('annotation enums exist', enums.rowCount === 5, `${enums.rowCount}/5`);

  const fk = await client.query(`SELECT pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid='document_annotations'::regclass AND contype='f'`);
  add('composite document/version FK exists', fk.rows.some(r => /\("documentId", "documentVersionId"\)/.test(r.def)));

  const ck = await client.query(`SELECT conname FROM pg_constraint WHERE conrelid='document_annotations'::regclass AND contype='c'`);
  const names = ck.rows.map(r => r.conname);
  for (const c of ['text_offsets', 'rect_bounds', 'point_bounds', 'page_index']) {
    add(`CHECK ${c} exists`, names.some(n => n.includes(c)));
  }

  const idx = await client.query(`SELECT indexname FROM pg_indexes WHERE tablename LIKE 'document_annotation%'`);
  add('indexes created', idx.rowCount >= 8, `${idx.rowCount} indexes`);

  const after = await one(`SELECT (SELECT count(*)::int FROM documents) d, (SELECT count(*)::int FROM document_versions) v`);
  add('document rows unchanged', after.d === before.d, `${before.d} -> ${after.d}`);
  add('document version rows unchanged', after.v === before.v, `${before.v} -> ${after.v}`);

  const annCount = await one(`SELECT count(*)::int n FROM document_annotations`);
  add('no annotation rows fabricated', annCount.n === 0, `${annCount.n} rows`);

  const failures = checks.filter(c => !c.ok);
  console.log(`\n=== POSTCONDITIONS: ${checks.length - failures.length}/${checks.length} passed ===`);
  if (failures.length) {
    console.error('FAILED:', failures.map(f => f.name).join('; '));
    process.exitCode = 1;
    return;
  }
  console.log('PRODUCTION MIGRATION APPLIED SUCCESSFULLY');
  console.log(`_prisma_migrations row id: ${migrationId}`);
}

main()
  .catch((error) => { console.error(String(error.message)); process.exitCode = 1; })
  .finally(async () => { try { await client.end(); } catch { /* ignore */ } });
