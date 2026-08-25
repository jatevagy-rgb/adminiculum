/**
 * Seed test users for Azure database (LOCAL/TEST ONLY).
 *
 * SEC-0A: no hardcoded credentials, no fixed password. Connection string comes
 * from DATABASE_URL (Key Vault in production). Production execution is refused.
 * Seed users do NOT get a usable login password: workforce authentication is
 * Azure AD (email-resolved DB role), so a random, unknown hash is used.
 */
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

function assertNotProduction() {
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('seed_azure_users must NEVER run in production. Aborting.');
  }
}

function assertDatabaseConfigured() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not configured; refusing to seed.');
  }
  return url;
}

async function seedUsers() {
  assertNotProduction();
  const connectionString = assertDatabaseConfigured();

  const client = new Client({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'false' ? undefined : { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Non-login credential: provisioning must go through Azure AD, never a
    // fixed/predictable local password.
    const hashedPassword = await bcrypt.hash(randomUUID(), 10);
    const now = new Date().toISOString();

    const users = [
      { email: 'admin@adminiculum.com', name: 'Admin User', role: 'ADMIN' },
      { email: 'lawyer@adminiculum.com', name: 'Dr. Magyar Ügyvéd', role: 'LAWYER' }
    ];

    for (const user of users) {
      await client.query(`
        INSERT INTO users (id, email, "passwordHash", name, role, status, "isActive", "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), $1, $2, $3, $4, 'ACTIVE', true, $5, $5)
        ON CONFLICT (email) DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", name = EXCLUDED.name, role = EXCLUDED.role
      `, [user.email, hashedPassword, user.name, user.role, now]);
      console.log(`Created/Updated: ${user.email}`);
    }

    const result = await client.query('SELECT email, name, role FROM users');
    console.log('\nUsers in database:');
    result.rows.forEach(u => console.log(`  - ${u.email} (${u.role})`));
    console.log('\nSeed completed.');
  } catch (error) {
    console.error('Error:', error.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

seedUsers();
