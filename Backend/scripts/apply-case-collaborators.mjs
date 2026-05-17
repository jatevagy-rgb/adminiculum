import pg from 'pg';
const { Client } = pg;

// IMPORTANT: Set DATABASE_URL env var before running.
// Example: DATABASE_URL='postgresql://user:pass@host:5432/db?sslmode=require' node apply-case-collaborators.mjs
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL env var is required.');
  console.error("Example: DATABASE_URL='postgresql://user:pass@host:5432/db?sslmode=require' node apply-case-collaborators.mjs");
  process.exit(1);
}

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();
    console.log('Connected to Azure PostgreSQL');
    console.log('Database:', DATABASE_URL.replace(/:[^:@]+@/, ':***@'));

    // Create case_collaborators table using TEXT types matching cases.id and users.id
    await client.query(`
      CREATE TABLE IF NOT EXISTS case_collaborators (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        "caseId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'COLLABORATOR',
        "addedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT case_collaborators_pkey PRIMARY KEY (id),
        CONSTRAINT case_collaborators_caseId_userId_key UNIQUE ("caseId", "userId"),
        CONSTRAINT case_collaborators_caseId_fkey FOREIGN KEY ("caseId") REFERENCES cases(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT case_collaborators_userId_fkey FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    console.log('Table case_collaborators created successfully');

    // Create indexes
    await client.query(`CREATE INDEX IF NOT EXISTS case_collaborators_caseId_index ON case_collaborators("caseId")`);
    await client.query(`CREATE INDEX IF NOT EXISTS case_collaborators_userId_index ON case_collaborators("userId")`);
    console.log('Indexes created successfully');

    // Verify the table exists
    const result = await client.query(`SELECT tablename FROM pg_tables WHERE tablename = 'case_collaborators'`);
    if (result.rows.length > 0) {
      console.log('VERIFIED: case_collaborators table exists in DB');
    } else {
      console.error('ERROR: case_collaborators table not found after creation');
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

main();