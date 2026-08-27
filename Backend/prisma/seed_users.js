/**
 * Seed test users for authentication
 * Creates users if they don't exist, updates if they do
 *
 * SEC-0A: no hardcoded credentials and no fixed/shared password. Refuses to run
 * in production. Seeded workforce users receive a random, unknown passwordHash;
 * real authentication is Azure AD (email-resolved DB role), and local dev login
 * is handled by the on-the-fly LOCAL_DEV_LOGIN provisioning path, not by a
 * predictable seed password.
 */

const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
  throw new Error('seed_users must NEVER run in production. Aborting.');
}

async function seedUsers() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DATABASE_NAME || 'adminiculum',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  });

  try {
    await client.connect();
    console.log('Connected to database');

    const now = new Date().toISOString();

    // Use only valid roles from UserRole enum
    const users = [
      {
        email: 'admin@adminiculum.com',
        name: 'Admin User',
        role: 'ADMIN'
      },
      {
        email: 'lawyer@adminiculum.com',
        name: 'Dr. Magyar Ügyvéd',
        role: 'LAWYER'
      },
      {
        email: 'partner@adminiculum.com',
        name: 'Partner Ügyvéd',
        role: 'PARTNER'
      },
      {
        email: 'trainee@adminiculum.com',
        name: 'Ügyvédjelölt',
        role: 'TRAINEE'
      },
      {
        email: 'assistant@adminiculum.com',
        name: 'Jogi Asszisztens',
        role: 'LEGAL_ASSISTANT'
      }
    ];

    for (const user of users) {
      try {
        // Non-login credential: a random, unknown hash per user. No shared or
        // predictable password is ever written.
        const passwordHash = await bcrypt.hash(randomUUID(), 10);
        await client.query(`
          INSERT INTO users ("id", "email", "passwordHash", "name", "role", "status", "isActive", "createdAt", "updatedAt")
          VALUES (gen_random_uuid(), $1, $2, $3, $4, 'ACTIVE', true, $5, $5)
          ON CONFLICT ("email") DO UPDATE SET
            "passwordHash" = EXCLUDED."passwordHash",
            "name" = EXCLUDED."name",
            "role" = EXCLUDED."role",
            "status" = EXCLUDED."status",
            "isActive" = EXCLUDED."isActive",
            "updatedAt" = EXCLUDED."updatedAt"
        `, [user.email, passwordHash, user.name, user.role, now]);
        
        console.log(`✓ Created/Updated user: ${user.email}`);
      } catch (err) {
        console.error(`✗ Error with user ${user.email}:`, err.message);
      }
    }

    // Verify users were created
    const result = await client.query('SELECT email, name, role, status FROM users');
    console.log('\n📋 Users in database:');
    result.rows.forEach(u => {
      console.log(`   - ${u.email} (${u.role}) - ${u.status}`);
    });

    console.log('\n✅ Test users seeded successfully!');
    console.log('\n📝 Seeded users (login via Azure AD or LOCAL_DEV_LOGIN; no shared password):');
    users.forEach(u => {
      console.log(`   - ${u.email} (${u.role})`);
    });

  } catch (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seedUsers();
