/**
 * Run migration SQL directly against the staging PostgreSQL database.
 * The database connection uses the adminiculumstg-migration-identity 
 * to authenticate to Azure Key Vault for the DATABASE_URL.
 * 
 * Since we can't access Key Vault directly, we construct the connection URL
 * using the known postgres server FQDN and the secret stored in Key Vault.
 * 
 * The migration job uses:
 * - Managed Identity: adminiculumstg-migration-identity
 * - Key Vault: adminiculumstg-kv
 * - Secret: database-url (full connection string)
 * 
 * We need to construct this programmatically.
 * 
 * For local development without Key Vault access, set DATABASE_URL env var directly.
 */

import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import pg from 'pg';
const { Client } = pg;

async function runMigration() {
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    console.error('ERROR: run-staging-migration must NEVER run in production. Use the canonical migration WebJob.');
    process.exit(1);
  }
  console.log('=== Adminiculum Staging DB Migration Script ===\n');

  let databaseUrl;

  // Fallback: allow DATABASE_URL env var for local development
  if (process.env.DATABASE_URL) {
    databaseUrl = process.env.DATABASE_URL;
    console.log('Using DATABASE_URL from environment (Key Vault bypassed for local dev)');
    console.log('  URL:', databaseUrl.replace(/:[^:@]+@/, ':***@'));
  } else {
    // Key Vault settings
    const keyVaultUrl = 'https://adminiculumstg-kv.vault.azure.net/';
    const databaseUrlSecretName = 'database-url';

    console.log('Step 1: Authenticating to Azure Key Vault...');
    const credential = new DefaultAzureCredential({
      managedIdentityClientId: '3fd9748d-1727-4274-9615-115bd10676a3' // adminiculumstg-migration-identity
    });

    const secretClient = new SecretClient(keyVaultUrl, credential);
    
    console.log('Step 2: Retrieving DATABASE_URL from Key Vault...');
    try {
      const secret = await secretClient.getSecret(databaseUrlSecretName);
      databaseUrl = secret.value;
      console.log('  DATABASE_URL retrieved successfully');
      console.log('  URL:', databaseUrl.replace(/:[^:@]+@/, ':***@')); // mask password
    } catch (err) {
      console.error('ERROR: Failed to retrieve DATABASE_URL from Key Vault:', err.message);
      console.error('  This likely means the managed identity does not have Get permission on the secret.');
      console.error('  The operator needs to grant Key Vault secret Get permission to adminiculumstg-migration-identity.');
      console.error('  Alternatively, set DATABASE_URL env var directly for local development.');
      process.exit(1);
    }
  }

  console.log('\nStep 3: Connecting to PostgreSQL...');
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 10000,
  });

  try {
    await client.connect();
    console.log('  Connected to PostgreSQL successfully');
  } catch (err) {
    console.error('ERROR: Failed to connect to PostgreSQL:', err.message);
    process.exit(1);
  }

  console.log('\nStep 4: Checking if case_collaborators table exists...');
  const checkResult = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'case_collaborators'
    ) as exists;
  `);
  const tableExists = checkResult.rows[0].exists;
  console.log('  case_collaborators table exists:', tableExists);

  if (tableExists) {
    console.log('\nMigration already applied. No changes needed.');
    await client.end();
    return;
  }

  console.log('\nStep 5: Applying case_collaborators migration...');
  
  const migrationSQL = `
BEGIN;

CREATE TABLE "case_collaborators" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "caseId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'COLLABORATOR',
    "addedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT "case_collaborators_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "case_collaborators_caseId_userId_key" UNIQUE ("caseId", "userId"),
    CONSTRAINT "case_collaborators_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "case_collaborators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "case_collaborators_caseId_index" ON "case_collaborators"("caseId");
CREATE INDEX "case_collaborators_userId_index" ON "case_collaborators"("userId");

COMMIT;
  `.trim();

  try {
    await client.query(migrationSQL);
    console.log('  Migration applied successfully!');
  } catch (err) {
    console.error('ERROR: Migration failed:', err.message);
    console.error('  Error code:', err.code);
    if (err.message.includes('does not exist')) {
      console.error('  A referenced table does not exist. Full error above.');
    }
    // Try to rollback
    try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
    process.exit(1);
  }

  console.log('\nStep 6: Verifying migration...');
  const verifyResult = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'case_collaborators'
    ) as exists;
  `);
  console.log('  case_collaborators table now exists:', verifyResult.rows[0].exists);

  await client.end();
  console.log('\n=== Migration complete ===');
}

runMigration().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
