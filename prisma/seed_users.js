/**
 * Seed test users for authentication
 * Creates users if they don't exist, updates if they do
 */

const { Client } = require('pg');
const bcrypt = require('bcryptjs');

async function seedUsers() {
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

    const hashedPassword = await bcrypt.hash('password123', 10);
    const now = new Date().toISOString();

    // Use only valid roles from UserRole enum
    const users = [
      {
        email: 'admin@adminiculum.com',
        name: 'Admin User',
        role: 'ADMIN',
        password: hashedPassword
      },
      {
        email: 'lawyer@adminiculum.com',
        name: 'Dr. Magyar Ügyvéd',
        role: 'LAWYER',
        password: hashedPassword
      },
      {
        email: 'partner@adminiculum.com',
        name: 'Partner Ügyvéd',
        role: 'PARTNER',
        password: hashedPassword
      },
      {
        email: 'trainee@adminiculum.com',
        name: 'Ügyvédjelölt',
        role: 'TRAINEE',
        password: hashedPassword
      },
      {
        email: 'assistant@adminiculum.com',
        name: 'Jogi Asszisztens',
        role: 'LEGAL_ASSISTANT',
        password: hashedPassword
      }
    ];

    for (const user of users) {
      try {
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
        `, [user.email, user.password, user.name, user.role, now]);
        
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
    console.log('\n📝 Test credentials (password: password123):');
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
