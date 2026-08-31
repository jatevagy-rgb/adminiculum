/**
 * Run migration to add contract tables
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if ([process.env.NODE_ENV, process.env.ADMINICULUM_RUNTIME_ENVIRONMENT]
  .some((value) => String(value || '').toLowerCase() === 'production')) {
  throw new Error('run_migration must never run in production.');
}

async function runMigration() {
  const password = process.env.DB_PASSWORD;
  if (!process.env.DATABASE_URL && !password) {
    throw new Error('DATABASE_URL or DB_PASSWORD is required.');
  }
  const client = new Client({
    ...(process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.DB_HOST || 'localhost',
          port: process.env.DB_PORT || 5432,
          database: process.env.DATABASE_NAME || 'adminiculum',
          user: process.env.DB_USER || 'postgres',
          password,
        }),
  });

  try {
    await client.connect();
    console.log('Connected to database');

    const sqlPath = path.join(__dirname, '..', 'prisma', 'migrations', '20260211153100_baseline', 'add_contract_tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    await client.query(sql);
    console.log('Migration completed successfully!');

  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
