import { PrismaClient } from '@prisma/client';
import { backfillCaseWorkPackageRequiredness } from '../src/modules/cases/caseWorkPackageRequirednessBackfill.service';

const dryRun = process.argv.includes('--dry-run');
const batchArgument = process.argv.find((argument) => argument.startsWith('--batch-size='));
const batchSize = batchArgument ? Number(batchArgument.split('=')[1]) : undefined;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required.');
}
if (!dryRun && process.env.WORK_PACKAGE_REQUIREDNESS_BACKFILL_CONFIRM !== 'YES') {
  throw new Error('Refusing to write without WORK_PACKAGE_REQUIREDNESS_BACKFILL_CONFIRM=YES. Use --dry-run first.');
}
if (batchSize !== undefined && (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500)) {
  throw new Error('--batch-size must be an integer from 1 to 500.');
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const summary = await backfillCaseWorkPackageRequiredness(prisma, { dryRun, batchSize });
    console.log(JSON.stringify({ dryRun, ...summary }, null, 2));
    if (summary.unresolved > 0) process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Case work package requiredness backfill failed.', error);
  process.exitCode = 1;
});
