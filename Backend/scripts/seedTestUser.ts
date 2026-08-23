import { PrismaClient } from '@prisma/client';
import { createWorkforceQaFixture } from '../tests/helpers/workforceQaFixture';

if (process.env.NODE_ENV === 'production') {
  throw new Error('The workforce QA fixture is unavailable in production.');
}

const databaseUrl = process.env.WORKFORCE_QA_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('WORKFORCE_QA_DATABASE_URL is required for the workforce QA fixture.');
}
const password = process.env.WORKFORCE_QA_PASSWORD;
if (!password) {
  throw new Error('WORKFORCE_QA_PASSWORD is required for the workforce QA fixture.');
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

createWorkforceQaFixture(prisma, { password })
  .then((ids) => {
    console.log(`Created workforce QA fixture for ${ids.client}.`);
  })
  .finally(() => prisma.$disconnect());
