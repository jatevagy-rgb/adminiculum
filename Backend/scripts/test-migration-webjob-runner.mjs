import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const adminUrl = process.env.WEBJOB_TEST_ADMIN_DATABASE_URL || process.env.DATABASE_URL;
if (!adminUrl) throw new Error('WEBJOB_TEST_ADMIN_DATABASE_URL or DATABASE_URL is required');
const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runnerPath = path.join(backendRoot, 'App_Data', 'jobs', 'triggered', 'adminiculum-db-migrate', 'runner.cjs');
const prismaBin = path.join(backendRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');
const migrationName = '20260802200000_client_identity_grant_trigger_fix';
const databaseName = `adminiculum_webjob_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
const databaseUrl = `${adminUrl.replace(/\/[^/]*$/, '')}/${databaseName}`;

function reportFailure(error) {
  const message = String(error?.stack || error?.message || error).replace(/postgres(?:ql)?s?:\/\/[^\s'"`]+/gi, '[redacted-database-url]').replace(/\r?\n/g, ' ').slice(0, 2000);
  console.log(`::error title=Migration WebJob test::${message}`);
}

process.on('uncaughtException', (error) => { reportFailure(error); process.exitCode = 1; });
process.on('unhandledRejection', (error) => { reportFailure(error); process.exitCode = 1; });

function run(command, args, env) {
  const result = spawnSync(command, args, { env: { ...process.env, ...env }, encoding: 'utf8' });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (output.includes('postgresql://')) throw new Error('test command leaked a database URL');
  if (result.status !== 0) throw new Error(`${command} failed with exit ${result.status}: ${output.slice(-2000)}`);
  return result;
}

function runRunner(env) {
  const result = spawnSync(process.execPath, [runnerPath], { env: { ...process.env, ...env }, encoding: 'utf8' });
  if (result.stdout.includes('postgresql://') || result.stderr.includes('postgresql://')) throw new Error('runner leaked a database URL');
  return result;
}

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'adminiculum-webjob-'));
const admin = new Client({ connectionString: adminUrl });
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  await admin.end();

  const migrationDir = path.join(tempRoot, 'prisma', 'migrations', migrationName);
  await fs.mkdir(migrationDir, { recursive: true });
  await fs.writeFile(path.join(tempRoot, 'prisma', 'schema.prisma'), 'datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}\n');
  await fs.copyFile(path.join(backendRoot, 'prisma', 'migrations', migrationName, 'migration.sql'), path.join(migrationDir, 'migration.sql'));

  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  await db.query(`
    CREATE TABLE "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE "client_portal_grants" ("id" TEXT PRIMARY KEY);
  `);
  await db.end();

  const common = {
    DATABASE_URL: databaseUrl,
    WEBSITE_SITE_NAME: 'adminiculum_webjob_ci',
    MIGRATION_WEBJOB_EXPECTED_SITE: 'adminiculum_webjob_ci',
    MIGRATION_WEBJOB_ROOT: tempRoot,
    MIGRATION_WEBJOB_SCHEMA_PATH: path.join(tempRoot, 'prisma', 'schema.prisma'),
    MIGRATION_WEBJOB_PRISMA_BIN: prismaBin,
  };
  const first = runRunner(common);
  if (first.status !== 0 || !first.stdout.includes('"state":"APPLIED"')) throw new Error(`first runner execution failed: ${first.stdout}${first.stderr}`);
  const second = runRunner(common);
  if (second.status !== 0 || !second.stdout.includes('"state":"ALREADY_APPLIED"')) throw new Error(`second runner execution failed: ${second.stdout}${second.stderr}`);
  const failed = runRunner({ ...common, MIGRATION_WEBJOB_EXPECTED_TRIGGER_MARKER: 'not-present-in-function' });
  if (failed.status === 0 || !failed.stdout.includes('"state":"FAILED"')) throw new Error('intentional verification failure did not fail');

  const after = new Client({ connectionString: databaseUrl });
  await after.connect();
  const grantCount = await after.query('SELECT count(*)::int AS count FROM client_portal_grants');
  await after.end();
  if (grantCount.rows[0].count !== 0) throw new Error('migration created a grant row');
  console.log(JSON.stringify({ migration: migrationName, first: 'APPLIED', second: 'ALREADY_APPLIED', intentionalVerificationFailure: 'NONZERO', grantCount: 0, secretLeakage: 'PASS' }));
} finally {
  const cleanup = new Client({ connectionString: adminUrl });
  await cleanup.connect().catch(() => {});
  await cleanup.query(`DROP DATABASE IF EXISTS "${databaseName}"`).catch(() => {});
  await cleanup.end().catch(() => {});
  await fs.rm(tempRoot, { recursive: true, force: true });
}
