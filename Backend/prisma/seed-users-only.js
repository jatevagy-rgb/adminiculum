/**
 * Simple User Seed Script (LOCAL/TEST ONLY)
 * Only creates users - no other dependencies
 *
 * SEC-0A: no hardcoded password. Workforce users authenticate via Azure AD
 * (email-resolved role), so a random, unknown non-login hash is used.
 * Production execution is refused.
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const prisma = new PrismaClient();

if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
  throw new Error('seed-users-only must NEVER run in production. Aborting.');
}

const USERS = [
  { name: 'Admin User', email: 'admin@adminiculum.com', role: 'ADMIN', department: 'Admin' },
  { name: 'Dr. Magyar Ügyvéd', email: 'lawyer@adminiculum.com', role: 'LAWYER', department: 'Legal' },
  { name: 'Partner Ügyvéd', email: 'partner@adminiculum.com', role: 'PARTNER', department: 'Legal' },
  { name: 'Jogi Asszisztens', email: 'assistant@adminiculum.com', role: 'LEGAL_ASSISTANT', department: 'Legal' },
  { name: 'Ügyvédjelölt', email: 'trainee@adminiculum.com', role: 'TRAINEE', department: 'Legal' }
];

async function main() {
  // Non-login credential: a random, unknown hash. No shared/predictable password.
  const hashedPassword = await bcrypt.hash(randomUUID(), 10);

  for (const user of USERS) {
    try {
      await prisma.user.upsert({
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
          status: 'ACTIVE',
        },
      });
      console.log(`upserted user: ${user.email}`);
    } catch (err) {
      console.error(`Error with user ${user.email}:`, err.message);
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
