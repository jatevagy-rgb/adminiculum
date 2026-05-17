import pg from 'pg';
const { Client } = pg;

// IMPORTANT: Set DATABASE_URL env var before running.
// Example: DATABASE_URL='postgresql://user:pass@host:5432/db?sslmode=require' node test-pg-connection.mjs
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL env var is required.');
  console.error("Example: DATABASE_URL='postgresql://user:pass@host:5432/db?sslmode=require' node test-pg-connection.mjs");
  process.exit(1);
}

async function main() {
  console.log('Connecting to adminiculum database...');
  console.log('Database:', DATABASE_URL.replace(/:[^:@]+@/, ':***@'));
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected successfully!');

    // Check tables in public schema
    const tableResult = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    console.log('\nTables in adminiculum.public:');
    tableResult.rows.forEach(row => console.log(' -', row.tablename));

    // Check if case_collaborators table exists
    const collabExists = tableResult.rows.some(row => row.tablename === 'case_collaborators');
    console.log('\ncase_collaborators table exists:', collabExists);

    // Check _prisma_migrations table
    const migrExists = tableResult.rows.some(row => row.tablename === '_prisma_migrations');
    console.log('_prisma_migrations table exists:', migrExists);

    if (migrExists) {
      const migrResult = await client.query("SELECT migration_name, finished_at, applied_successfully FROM _prisma_migrations ORDER BY finished_at");
      console.log('\nApplied migrations:');
      migrResult.rows.forEach(row => console.log(' -', row.migration_name, '- applied:', row.applied_successfully, '- finished:', row.finished_at));
    }

    await client.end();
    console.log('\nDone!');
  } catch (err) {
    console.error('Error:', err.message);
    if (err.code) console.error('Error code:', err.code);
    process.exit(1);
  }
}

main();
