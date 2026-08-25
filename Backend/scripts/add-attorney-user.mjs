import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// SEC-0A: this script creates a workforce user. It must never run in production
// and must not generate/print a fixed password.
if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
  throw new Error('add-attorney-user must NEVER run in production. Aborting.');
}

async function main() {
  const email = process.env.ATTORNEY_EMAIL || 'attorney@adminiculum.law';
  const name = process.env.ATTORNEY_NAME || 'Test Attorney';
  const role = 'LAWYER';

  // Non-login credential: a random, unknown hash. Workforce users authenticate
  // via Azure AD (email-resolved role), never a fixed local password.
  const hashedPassword = await bcrypt.hash(randomUUID(), 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash: hashedPassword,
      name,
      role,
    },
    create: {
      email,
      passwordHash: hashedPassword,
      name,
      role,
    },
  });

  console.log(`Created/Updated user: ${user.email} (${user.role}) — login via Azure AD (no local password).`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
