import { PrismaClient, UserRole, UserStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Delete existing test user
  await prisma.user.deleteMany({
    where: { email: 'test@test.com' }
  });

  const user = await prisma.user.create({
    data: {
      email: 'test@test.com',
      name: 'Test User',
      passwordHash: '$2a$10$QWFjjAgQHQqpybDkcXdwQeeuGh.3XhqtgPjHT/HP2okL0zezyUh9y',
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
