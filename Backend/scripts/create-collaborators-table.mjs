import pg from 'pg';
const { Client } = pg;

// IMPORTANT: Set DATABASE_URL env var before running.
// Example: DATABASE_URL='postgresql://user:pass@host:5432/db?sslmode=require' node create-collaborators-table.mjs
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL env var is required.');
  console.error("Example: DATABASE_URL='postgresql://user:pass@host:5432/db?sslmode=require' node create-collaborators-table.mjs");
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
    console.log('Connected!');

    // First, let's see what tables exist
    const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    console.log('\nCurrent tables:');
    tables.rows.forEach(row => console.log(' -', row.tablename));

    // Check if case_collaborators exists
    const hasCollab = tables.rows.some(r => r.tablename === 'case_collaborators');
    if (hasCollab) {
      console.log('\ncase_collaborators table ALREADY EXISTS. Nothing to do.');
    } else {
      console.log('\ncase_collaborators table does NOT exist. Creating...');
      
      // Read the migration SQL to get the CREATE TABLE statement
      const fs = await import('fs');
      const migrationPath = './prisma/migrations/20260408140000_add_case_collaborators/migration.sql';
      const migrationSql = fs.readFileSync(migrationPath, 'utf8');
      
      console.log('\nExecuting migration SQL:');
      console.log(migrationSql);
      console.log('---');
      
      await client.query(migrationSql);
      console.log('\ncase_collaborators table created successfully!');
      
      // Verify
      const newTables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
      console.log('\nTables after migration:');
      newTables.rows.forEach(row => console.log(' -', row.tablename));
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
