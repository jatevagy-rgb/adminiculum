import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTable() {
  try {
    const result = await prisma.$queryRaw`SELECT EXISTS (SELECT FROM pg_tables WHERE tablename = 'case_collaborators')`;
    console.log('case_collaborators exists:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkTable();