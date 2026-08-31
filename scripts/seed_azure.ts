import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

if ([process.env.NODE_ENV, process.env.ADMINICULUM_RUNTIME_ENVIRONMENT]
  .some((value) => String(value || '').toLowerCase() === 'production')) {
  throw new Error('Azure seed must never run in production.');
}

async function main() {
  // Delete existing test user
  await prisma.user.deleteMany({
    where: { email: 'test@test.com' }
  });

  const user = await prisma.user.create({
    data: {
      email: 'test@test.com',
      name: 'Test User',
      passwordHash: await bcrypt.hash(crypto.randomUUID(), 10),
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
