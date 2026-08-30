/**
 * Seed test users for Azure database
 */
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

if ([process.env.NODE_ENV, process.env.ADMINICULUM_RUNTIME_ENVIRONMENT]
  .some((value) => String(value || '').toLowerCase() === 'production')) {
  throw new Error('seed_azure_users must never run in production.');
}

async function seedUsers() {
  const password = process.env.DB_PASSWORD;
  if (!process.env.DATABASE_URL && !password) {
    throw new Error('DATABASE_URL or DB_PASSWORD is required.');
  }
  const client = new Client({
    ...(process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.DB_HOST || 'localhost',
          port: Number(process.env.DB_PORT || 5432),
          database: process.env.DATABASE_NAME || 'postgres',
          user: process.env.DB_USER || 'postgres',
          password,
        }),
    ssl: { rejectUnauthorized: false }
  });

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
      await client.query(`
        INSERT INTO users (id, email, "passwordHash", name, role, status, "isActive", "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), $1, $2, $3, $4, 'ACTIVE', true, $5, $5)
        ON CONFLICT (email) DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", name = EXCLUDED.name, role = EXCLUDED.role
      `, [user.email, await bcrypt.hash(randomUUID(), 10), user.name, user.role, now]);
      console.log(`Created/Updated: ${user.email}`);
    }

    const result = await client.query('SELECT email, name, role FROM users');
    console.log('\nUsers in database:');
    result.rows.forEach(u => console.log(`  - ${u.email} (${u.role})`));

    console.log('\n✅ Seed completed!');
    console.log('\nSeeded users (no shared password; use the configured identity provider):');
    users.forEach(u => console.log(`  - ${u.email}`));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

seedUsers();
