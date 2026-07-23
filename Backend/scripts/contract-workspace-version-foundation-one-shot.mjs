import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import { Client } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const migrationName = '20260723143000_contract_workspace_version_foundation';
const failedMigrationName = '20260331090100_add_anonymous_documents';
const migrationPath = path.join(backendRoot, 'prisma', 'migrations', migrationName, 'migration.sql');
const execute = process.argv.includes('--execute');
const expectedDatabase = process.env.EXPECT_DATABASE_NAME;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const migrationSql = fs.readFileSync(migrationPath, 'utf8');
const checksum = crypto.createHash('sha256').update(migrationSql).digest('hex');

const client = new Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1') ? undefined : { rejectUnauthorized: false },
});

const querySingle = async (sql, params = []) => {
  const result = await client.query(sql, params);
  return result.rows[0] || null;
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const getPreconditions = async () => {
  const identity = await querySingle(`
    SELECT current_database() AS database_name, current_schema() AS schema_name,
           inet_server_addr()::text AS server_addr, inet_server_port() AS server_port
  `);
  const failedRow = await querySingle(`
    SELECT migration_name, checksum, started_at, finished_at, rolled_back_at, applied_steps_count, logs
    FROM _prisma_migrations
    WHERE migration_name = $1
    ORDER BY started_at DESC
    LIMIT 1
  `, [failedMigrationName]);
  const foundationRow = await querySingle(`
    SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count
    FROM _prisma_migrations
    WHERE migration_name = $1
    ORDER BY started_at DESC
    LIMIT 1
  `, [migrationName]);
  const activeFailed = await client.query(`
    SELECT migration_name
    FROM _prisma_migrations
    WHERE finished_at IS NULL AND rolled_back_at IS NULL
    ORDER BY started_at DESC
  `);
  const anonymousTable = await querySingle(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'anonymous_documents'
    ) AS exists
  `);
  const anonymousColumns = await client.query(`
    SELECT column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'anonymous_documents'
    ORDER BY ordinal_position
  `);
  const documentVersionState = await querySingle(`
    SELECT
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='document_versions') AS has_table,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='document_versions' AND column_name='name' AND is_nullable='NO') AS has_required_legacy_name,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='document_versions' AND column_name='currentVersion') AS has_current_version,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='document_versions' AND column_name='previousVersionId') AS has_previous_version_id,
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='document_reviews') AS has_document_reviews,
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='review_snapshots') AS has_review_snapshots
  `);
  const counts = await querySingle(`
    SELECT
      (SELECT count(*)::int FROM documents) AS documents,
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM document_versions) AS document_versions,
      (SELECT count(*)::int FROM anonymous_documents) AS anonymous_documents
  `);
  return {
    identity,
    failedRow,
    foundationRow,
    activeFailed: activeFailed.rows.map((row) => row.migration_name),
    anonymousTable: anonymousTable.exists,
    anonymousColumns: anonymousColumns.rows,
    documentVersionState,
    counts,
    checksum,
  };
};

const validatePreconditions = (preconditions) => {
  if (expectedDatabase) {
    assert(preconditions.identity.database_name === expectedDatabase, `Expected database ${expectedDatabase}, got ${preconditions.identity.database_name}`);
  }
  assert(preconditions.failedRow, `${failedMigrationName} row is missing`);
  assert(preconditions.failedRow.finished_at === null, `${failedMigrationName} is already finished`);
  assert(preconditions.failedRow.rolled_back_at === null, `${failedMigrationName} is already rolled back`);
  assert(preconditions.failedRow.applied_steps_count === 0, `${failedMigrationName} applied_steps_count is not 0`);
  assert(String(preconditions.failedRow.logs || '').includes('relation "anonymous_documents" already exists'), `${failedMigrationName} logs do not match the inspected duplicate-table failure`);
  assert(preconditions.foundationRow === null, `${migrationName} already has a migration-history row`);
  assert(preconditions.activeFailed.length === 1 && preconditions.activeFailed[0] === failedMigrationName, `Unexpected active failed migrations: ${preconditions.activeFailed.join(', ')}`);
  assert(preconditions.anonymousTable === true, 'anonymous_documents table is missing; this is not the inspected superseded state');
  assert(preconditions.anonymousColumns.some((column) => column.column_name === 'sourceDocId'), 'anonymous_documents.sourceDocId is missing');
  assert(preconditions.documentVersionState.has_table === true, 'document_versions table is missing; expected legacy table or foundation-safe table');
  assert(preconditions.documentVersionState.has_current_version === false, 'document_versions.currentVersion already exists; foundation appears partially applied');
  assert(preconditions.documentVersionState.has_previous_version_id === false, 'document_versions.previousVersionId already exists; foundation appears partially applied');
  assert(preconditions.documentVersionState.has_document_reviews === false, 'document_reviews already exists; foundation appears partially applied');
  assert(preconditions.documentVersionState.has_review_snapshots === false, 'review_snapshots already exists; foundation appears partially applied');
};

const validatePostconditions = async () => {
  const foundationRow = await querySingle(`
    SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
    FROM _prisma_migrations
    WHERE migration_name = $1
    ORDER BY started_at DESC
    LIMIT 1
  `, [migrationName]);
  const failedRow = await querySingle(`
    SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
    FROM _prisma_migrations
    WHERE migration_name = $1
    ORDER BY started_at DESC
    LIMIT 1
  `, [failedMigrationName]);
  const activeFailed = await client.query(`
    SELECT migration_name
    FROM _prisma_migrations
    WHERE finished_at IS NULL AND rolled_back_at IS NULL
    ORDER BY started_at DESC
  `);
  const requiredColumns = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'document_versions'
      AND column_name IN ('originalFileName', 'mimeType', 'size', 'storageReference', 'currentVersion', 'previousVersionId', 'reviewStatus', 'publicationStatus', 'uploadSource', 'versionType')
    ORDER BY column_name
  `);
  const requiredTables = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('document_versions', 'document_reviews', 'review_snapshots')
    ORDER BY table_name
  `);
  const currentViolations = await querySingle(`
    SELECT count(*)::int AS count
    FROM (
      SELECT "documentId"
      FROM document_versions
      WHERE "currentVersion" = true
      GROUP BY "documentId"
      HAVING count(*) > 1
    ) violations
  `);
  const fabricatedReview = await querySingle(`
    SELECT
      count(*) FILTER (WHERE "reviewStatus" <> 'NOT_IN_REVIEW')::int AS review_non_default,
      count(*) FILTER (WHERE "publicationStatus" <> 'INTERNAL_ONLY')::int AS publication_non_default
    FROM document_versions
  `);
  assert(failedRow?.rolled_back_at, `${failedMigrationName} was not marked rolled back`);
  assert(foundationRow?.finished_at, `${migrationName} was not recorded as finished`);
  assert(foundationRow.checksum === checksum, `${migrationName} checksum mismatch`);
  assert(foundationRow.applied_steps_count === 1, `${migrationName} applied_steps_count is not 1`);
  assert(activeFailed.rowCount === 0, `Active failed migrations remain: ${activeFailed.rows.map((row) => row.migration_name).join(', ')}`);
  assert(requiredTables.rows.length === 3, `Missing foundation tables: ${requiredTables.rows.map((row) => row.table_name).join(', ')}`);
  assert(requiredColumns.rows.length === 10, `Missing document_versions columns: ${requiredColumns.rows.map((row) => row.column_name).join(', ')}`);
  assert(currentViolations.count === 0, 'More than one current version exists for at least one document');
  assert(fabricatedReview.review_non_default === 0, 'Backfill fabricated non-default review status');
  assert(fabricatedReview.publication_non_default === 0, 'Backfill fabricated non-default publication status');
  return {
    failedRow,
    foundationRow,
    activeFailed: activeFailed.rows.map((row) => row.migration_name),
    requiredTables: requiredTables.rows.map((row) => row.table_name),
    requiredColumns: requiredColumns.rows.map((row) => row.column_name),
    currentViolations: currentViolations.count,
    fabricatedReview,
  };
};

try {
  await client.connect();
  const preconditions = await getPreconditions();
  validatePreconditions(preconditions);

  console.log(JSON.stringify({
    mode: execute ? 'EXECUTE' : 'PREFLIGHT_ONLY',
    migrationName,
    failedMigrationName,
    checksum,
    identity: preconditions.identity,
    counts: preconditions.counts,
    activeFailed: preconditions.activeFailed,
    anonymousColumnNames: preconditions.anonymousColumns.map((column) => column.column_name),
    documentVersionState: preconditions.documentVersionState,
  }, null, 2));

  if (!execute) {
    console.log('Preflight passed. Re-run with --execute to apply the one-shot recovery.');
    process.exit(0);
  }

  await client.query('BEGIN');
  await client.query(`
    UPDATE _prisma_migrations
    SET rolled_back_at = now(),
        logs = concat(coalesce(logs, ''), E'\\n\\nRecovered by ${migrationName} one-shot: inspected as manually superseded duplicate-table failure; SQL was not rerun.')
    WHERE migration_name = $1
      AND finished_at IS NULL
      AND rolled_back_at IS NULL
      AND applied_steps_count = 0
  `, [failedMigrationName]);
  const recoveredRows = await querySingle('SELECT count(*)::int AS count FROM _prisma_migrations WHERE migration_name = $1 AND rolled_back_at IS NOT NULL', [failedMigrationName]);
  assert(recoveredRows.count >= 1, `${failedMigrationName} was not marked rolled back`);
  await client.query(migrationSql);
  await client.query(`
    INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
    VALUES ($1, $2, now(), $3, NULL, NULL, now(), 1)
  `, [crypto.randomUUID(), checksum, migrationName]);
  await client.query('COMMIT');

  const postconditions = await validatePostconditions();
  console.log(JSON.stringify({
    mode: 'EXECUTED',
    migrationName,
    failedMigrationName,
    checksum,
    postconditions,
  }, null, 2));
} catch (error) {
  try {
    await client.query('ROLLBACK');
  } catch (_) {
    // Ignore rollback failures when no transaction is active.
  }
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
