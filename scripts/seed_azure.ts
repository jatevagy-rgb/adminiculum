import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('seed_azure must NEVER run in production. Aborting.');
  }

  // Delete existing test user
  await prisma.user.deleteMany({
    where: { email: 'test@test.com' }
  });

  // Non-login credential: a random, unknown hash. Workforce users authenticate
  // via Azure AD (email-resolved role), never a fixed local password.
  const passwordHash = await bcrypt.hash(randomUUID(), 10);

  const user = await prisma.user.create({
    data: {
      email: 'test@test.com',
      name: 'Test User',
      passwordHash,
      role: UserRole.LAWYER,
      status: UserStatus.ACTIVE,
      department: 'Legal',
      skills: ['contract', 'litigation'],
    },
  });
  console.log('User created:', user.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
