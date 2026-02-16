/**
 * Run migration to add contract tables
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function runMigration() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DATABASE_NAME || 'adminiculum',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'Uborka444',
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
