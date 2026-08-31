import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

if ([process.env.NODE_ENV, process.env.ADMINICULUM_RUNTIME_ENVIRONMENT]
  .some((value) => String(value || '').toLowerCase() === 'production')) {
  throw new Error('add-attorney-user must never run in production.');
}

async function main() {
  const email = 'attorney@adminiculum.law';
  const password = process.env.LOCAL_DEV_LOGIN_PASSWORD;
  if (!password) throw new Error('LOCAL_DEV_LOGIN_PASSWORD is required.');
  const name = 'Test Attorney';
  const role = 'LAWYER';

  const hashedPassword = await bcrypt.hash(password, 10);

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

  console.log(`Created/Updated user: ${user.email} (${user.role})`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());