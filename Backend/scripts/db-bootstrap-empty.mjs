import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import { Client } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const baselineName = '20260726000000_current_schema_baseline';
const baselinePath = path.join(backendRoot, 'prisma', 'baseline', `${baselineName}.sql`);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('BOOTSTRAP FAILED: DATABASE_URL is required.');
  process.exit(2);
}

const baselineSql = fs.readFileSync(baselinePath, 'utf8');
const baselineSha256 = crypto.createHash('sha256').update(baselineSql.replace(/\r\n/g, '\n')).digest('hex');

const client = new Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1') ? undefined : { rejectUnauthorized: false },
});

async function scalar(sql, params = []) {
  return (await client.query(sql, params)).rows[0];
}

async function assertEmptyPublicSchema() {
  const objects = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name`);
  if (objects.rowCount > 0) {
    console.error('BOOTSTRAP REFUSED: public schema is not empty.');
    console.error(`Existing table count: ${objects.rowCount}`);
    console.error(`First table: ${objects.rows[0].table_name}`);
    process.exit(3);
  }
}

async function main() {
  await client.connect();
  const identity = await scalar('SELECT version() AS version, current_database() AS database');
  console.log(`database        : ${identity.database}`);
  console.log(`postgres        : ${String(identity.version).split(',')[0]}`);
  console.log(`baseline        : ${baselineName}`);
  console.log(`baseline sha256 : ${baselineSha256}`);

  await assertEmptyPublicSchema();
  await client.query('BEGIN');
  try {
    await client.query(baselineSql);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_adminiculum_bootstrap" (
        "id" text PRIMARY KEY,
        "baselineName" text NOT NULL,
        "baselineSha256" text NOT NULL,
        "appliedAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await client.query(
      `INSERT INTO "_adminiculum_bootstrap" ("id", "baselineName", "baselineSha256")
       VALUES ('current-schema-baseline', $1, $2)`,
      [baselineName, baselineSha256]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }

  const counts = await scalar(`
    SELECT
      (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') AS tables,
      (SELECT count(*)::int FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e') AS enums`);
  console.log(`created tables  : ${counts.tables}`);
  console.log(`created enums   : ${counts.enums}`);
  console.log('BOOTSTRAP OK');
}

main()
  .catch((error) => {
    console.error('BOOTSTRAP FAILED:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await client.end(); } catch { /* ignore */ }
  });
