const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Client } = require('pg');

const migrationName = '20260803130000_client_relationship_mode';
const jobDirectory = __dirname;
const appRoot = process.env.MIGRATION_WEBJOB_ROOT || path.resolve(jobDirectory, '../../../..');
const schemaPath = process.env.MIGRATION_WEBJOB_SCHEMA_PATH || path.join(appRoot, 'prisma', 'schema.prisma');
const prismaBin = process.env.MIGRATION_WEBJOB_PRISMA_BIN || path.join(appRoot, 'node_modules', '.bin', 'prisma');
const expectedSite = process.env.MIGRATION_WEBJOB_EXPECTED_SITE || 'adminiculumbackend-b1-01';
const lockDirectory = process.env.WEBJOBS_DATA_PATH || process.env.HOME || os.tmpdir();
const lockPath = process.env.MIGRATION_WEBJOB_LOCK_PATH || path.join(lockDirectory, 'adminiculum-db-migrate.lock');

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
  if (process.env.WEBSITE_SITE_NAME !== expectedSite) throw new Error('unexpected App Service environment');
  if (!process.env.DATABASE_URL) throw new Error('production database configuration is missing');
}

function createClient() {
  return new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? undefined : { rejectUnauthorized: false },
  });
}

async function readState(client) {
  const migration = await client.query(
    `SELECT migration_name, checksum, finished_at, rolled_back_at, logs
       FROM "_prisma_migrations"
      WHERE migration_name = $1
      ORDER BY started_at DESC
      LIMIT 1`,
    [migrationName],
  );
  const failed = await client.query(
    `SELECT count(*)::int AS count
       FROM "_prisma_migrations"
      WHERE finished_at IS NULL AND rolled_back_at IS NULL`,
  );
  // Verify the concrete effect of 20260803130000_client_relationship_mode: the
  // clients.relationshipMode column (backed by the ClientRelationshipMode enum).
  const schemaCheck = await client.query(
    `SELECT EXISTS(
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'relationshipMode'
     ) AS present`,
  );
  const row = migration.rows[0] || null;
  const schemaPresent = schemaCheck.rows[0]?.present === true;
  const verified = Boolean(
    row && row.finished_at && !row.rolled_back_at && failed.rows[0].count === 0 && schemaPresent,
  );
  return {
    migration: row ? {
      name: row.migration_name,
      checksum: row.checksum,
      finished: Boolean(row.finished_at),
      rolledBack: Boolean(row.rolled_back_at),
      logsPresent: Boolean(row.logs),
    } : null,
    failedMigrationCount: failed.rows[0].count,
    schemaVerified: verified,
    verification: verified ? 'PASS' : 'FAIL',
  };
}

async function main() {
  assertEnvironment();
  let lock;
  try {
    lock = fs.openSync(lockPath, 'wx');
  } catch {
    throw new Error('another migration WebJob execution is already running');
  }

  const beforeClient = createClient();
  try {
    await beforeClient.connect();
    const before = await readState(beforeClient);
    const alreadyApplied = before.migration?.finished && !before.migration.rolledBack;
    let command = null;
    if (!alreadyApplied) {
      const result = spawnSync(prismaBin, ['migrate', 'deploy', '--schema', schemaPath], {
        cwd: appRoot,
        env: process.env,
        encoding: 'utf8',
        shell: false,
      });
      command = { exitCode: result.status, stdout: sanitize(result.stdout), stderr: sanitize(result.stderr) };
      if (result.status !== 0) throw new Error(`prisma migrate deploy failed: ${sanitize(result.stderr || result.stdout)}`);
    }
    const after = await readState(beforeClient);
    if (after.verification !== 'PASS') throw new Error(`migration verification failed: ${JSON.stringify(after)}`);
    emit({
      application: process.env.WEBSITE_SITE_NAME,
      runnerVersion: '1',
      migration: migrationName,
      state: alreadyApplied ? 'ALREADY_APPLIED' : 'APPLIED',
      command,
      verification: after,
    });
  } finally {
    await beforeClient.end().catch(() => {});
    if (lock !== undefined) {
      fs.closeSync(lock);
      fs.unlinkSync(lockPath);
    }
  }
}

main().catch((error) => {
  emit({ application: process.env.WEBSITE_SITE_NAME || 'unknown', runnerVersion: '1', migration: migrationName, state: 'FAILED', error: sanitize(error.message) });
  process.exitCode = 1;
});

module.exports = { readState, sanitize };
