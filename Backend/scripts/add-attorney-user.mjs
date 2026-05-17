import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'attorney@adminiculum.law';
  const password = 'Password123!';
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
  console.log(`Password: ${password}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());