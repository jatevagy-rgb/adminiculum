/**
 * Seed test users for Azure database
 */
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

async function seedUsers() {
  const client = new Client({
    host: 'adminiculum.postgres.database.azure.com',
    port: 5432,
    database: 'postgres',
    user: 'HubayGyula',
    password: 'Uborka444',
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database');

    const hashedPassword = await bcrypt.hash('password123', 10);
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
      `, [user.email, hashedPassword, user.name, user.role, now]);
      console.log(`Created/Updated: ${user.email}`);
    }

    const result = await client.query('SELECT email, name, role FROM users');
    console.log('\nUsers in database:');
    result.rows.forEach(u => console.log(`  - ${u.email} (${u.role})`));

    console.log('\n✅ Seed completed!');
    console.log('\nTest credentials (password: password123):');
    users.forEach(u => console.log(`  - ${u.email}`));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

seedUsers();
