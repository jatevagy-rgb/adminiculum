/**
 * Simple User Seed Script for Azure Deployment
 * Only creates users - no other dependencies
 *
 * SEC-0A: no fixed/shared password. Refuses to run in production. Each seeded
 * workforce user receives a random, unknown passwordHash; real authentication
 * is Azure AD (email-resolved DB role).
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
  throw new Error('seed-users-only must NEVER run in production. Aborting.');
}

const prisma = new PrismaClient();

const USERS = [
  {
    email: 'admin@adminiculum.com',
    name: 'Admin User',
    role: 'ADMIN',
    department: 'IT',
    title: 'System Administrator',
  },
  {
    email: 'lawyer@adminiculum.com',
    name: 'Dr. Magyar Ügyvéd',
    role: 'LAWYER',
    department: 'Litigation',
    title: 'Senior Attorney',
  },
  {
    email: 'partner@adminiculum.com',
    name: 'Dr. Kovács Partner',
    role: 'PARTNER',
    department: 'Corporate',
    title: 'Managing Partner',
  },
  {
    email: 'assistant@adminiculum.com',
    name: 'Kiss Anna',
    role: 'LEGAL_ASSISTANT',
    department: 'Administration',
    title: 'Legal Assistant',
  },
  {
    email: 'trainee@adminiculum.com',
    name: 'Nagy Péter',
    role: 'TRAINEE',
    department: 'Corporate',
    title: 'Junior Associate',
  },
];

async function main() {
  console.log('🌱 Seeding users...\n');

  for (const user of USERS) {
    // Non-login credential: random, unknown hash. No shared/predictable password.
    const hashedPassword = await bcrypt.hash(randomUUID(), 10);

    try {
      const created = await prisma.user.upsert({
        where: { email: user.email },
        update: {
          name: user.name,
          role: user.role,
          department: user.department,
          passwordHash: hashedPassword,
          isActive: true,
        },
        create: {
          email: user.email,
          name: user.name,
          role: user.role,
          department: user.department,
          passwordHash: hashedPassword,
          isActive: true,
        },
      });
      console.log(`✓ Created/Updated: ${created.email} (${created.role})`);
    } catch (error) {
      console.error(`✗ Failed to create ${user.email}:`, error.message);
    }
  }

  console.log('\n✅ User seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
