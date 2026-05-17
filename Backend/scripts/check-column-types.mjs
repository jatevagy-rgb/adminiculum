import pg from 'pg';
const { Client } = pg;

// IMPORTANT: Set DATABASE_URL env var before running.
// Example: DATABASE_URL='postgresql://user:pass@host:5432/db?sslmode=require' node check-column-types.mjs
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL env var is required.');
  console.error("Example: DATABASE_URL='postgresql://user:pass@host:5432/db?sslmode=require' node check-column-types.mjs");
  process.exit(1);
}

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();
    console.log('Database:', DATABASE_URL.replace(/:[^:@]+@/, ':***@'));

    // Check cases.id column type
    const casesResult = await client.query(`
      SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'cases' AND column_name IN ('id')
    `);
    console.log('cases.id:', JSON.stringify(casesResult.rows, null, 2));

    // Check users.id column type
    const usersResult = await client.query(`
      SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name IN ('id')
    `);
    console.log('users.id:', JSON.stringify(usersResult.rows, null, 2));

    // Also list all tables
    const tables = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
    console.log('All tables:', tables.rows.map(r => r.tablename));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

main();