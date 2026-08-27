/**
 * Seed test users for a database
 *
 * SEC-0A: no hardcoded host/credentials and no fixed/shared password. The
 * connection comes from env (DATABASE_URL, or DB_* components); the script
 * refuses to run in production and refuses to run without an explicit password.
 * Seeded workforce users get a random, unknown passwordHash (Azure AD is the
 * real authentication path).
 */
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
  throw new Error('seed_azure_users must NEVER run in production. Aborting.');
}

function buildClient() {
  if (process.env.DATABASE_URL) {
    return new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  }
  const password = process.env.DB_PASSWORD;
  if (!password) {
    throw new Error('DB_PASSWORD (or DATABASE_URL) is required; refusing to run with a hardcoded credential.');
  }
  return new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DATABASE_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password,
    ssl: { rejectUnauthorized: false },
  });
}

async function seedUsers() {
  const client = buildClient();

  try {
    await client.connect();
    console.log('Connected to database');

    const now = new Date().toISOString();

    const users = [
      {
        email: 'admin@adminiculum.com',
        name: 'Admin User',
        role: 'ADMIN'
      },
      {
        email: 'hubay.gyula@balintfy.hu',
        name: 'Dr. Hubay Gyula',
        role: 'ADMIN'
      },
      {
        email: 'lawyer@adminiculum.com',
        name: 'Dr. Magyar Ügyvéd',
        role: 'LAWYER'
      }
    ];

    for (const user of users) {
      // Non-login credential: random, unknown hash per user.
      const hashedPassword = await bcrypt.hash(randomUUID(), 10);
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

    console.log('\n✅ Seed completed!');
    console.log('\nSeeded users (login via Azure AD; no shared password):');
    users.forEach(u => console.log(`  - ${u.email}`));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

seedUsers();
