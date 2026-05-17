import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const result = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename IN ('contract_review_records', 'block_review_notes')
  `;
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error('ERROR:', e.message);
} finally {
  await prisma.$disconnect();
}