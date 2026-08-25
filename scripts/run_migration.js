/**
 * Run migration to add contract tables
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
  throw new Error('run_migration must NEVER run in production. Use the canonical migration WebJob instead.');
}

async function runMigration() {
  // Prefer DATABASE_URL when supplied; otherwise require the component variables
  // that are actually consumed. Never accept configuration that is then ignored.
  let client;
  if (process.env.DATABASE_URL) {
    client = new Client({ connectionString: process.env.DATABASE_URL });
  } else {
    if (!process.env.DB_PASSWORD) {
      throw new Error('DB_PASSWORD is required when DATABASE_URL is not provided; refusing to run.');
    }
    client = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DATABASE_NAME || 'adminiculum',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
    });
  }

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
