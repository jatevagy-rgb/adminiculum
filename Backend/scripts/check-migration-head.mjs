/**
 * Deployment guard (PART G).
 *
 * Compares the newest migration in the repository against the migration head
 * actually applied in production, and refuses deployment when the code would
 * expect columns the database does not have yet.
 *
 * This exists because a backend was once deployed carrying a Prisma client that
 * expected unapplied columns, which broke GET /cases in production.
 *
 * Usage: DATABASE_URL=... node scripts/check-migration-head.mjs
 */
import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import { Client } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '..', 'prisma', 'migrations');

const local = fs.readdirSync(migrationsDir)
  .filter((d) => fs.existsSync(path.join(migrationsDir, d, 'migration.sql')))
  .sort();
const newestLocal = local[local.length - 1];

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('GUARD FAILED: DATABASE_URL is required.');
  process.exit(2);
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('localhost') ? undefined : { rejectUnauthorized: false },
});

try {
  await client.connect();
  const head = await client.query(`
    SELECT migration_name FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY finished_at DESC LIMIT 1`);
  const failed = await client.query(
    'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL');

  const productionHead = head.rows[0]?.migration_name || '(none)';
  console.log(`newest local migration : ${newestLocal}`);
  console.log(`production head        : ${productionHead}`);
  console.log(`active failed rows     : ${failed.rowCount}`);

  if (failed.rowCount > 0) {
    console.error('GUARD FAILED: production has an active failed migration. Resolve it before deploying.');
    process.exit(1);
  }
  if (newestLocal !== productionHead) {
    console.error('GUARD FAILED: the newest repository migration is not applied in production.');
    console.error('Apply it with the corresponding one-shot runner BEFORE deploying backend code.');
    process.exit(1);
  }
  console.log('GUARD OK: production schema matches the repository. Safe to deploy backend.');
} catch (error) {
  console.error('GUARD FAILED:', error.message);
  process.exit(1);
} finally {
  try { await client.end(); } catch { /* ignore */ }
}
