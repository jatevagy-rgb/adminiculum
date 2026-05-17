import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testGetCases() {
  try {
    console.log('Testing getCases()...');
    const page = 1;
    const limit = 10;
    const where = {};

    const [cases, total] = await Promise.all([
      prisma.case.findMany({
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          assignedLawyer: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          }
        },
        where
      }),
      prisma.case.count(where || undefined)
    ]);

    console.log('SUCCESS: cases found =', cases.length, 'total =', total);
    console.log('First case:', cases[0]?.id, cases[0]?.caseNumber);
  } catch (e) {
    console.error('ERROR in getCases():', e.message);
    console.error('Code:', e.code);
    console.error('Meta:', JSON.stringify(e.meta));
  } finally {
    await prisma.$disconnect();
  }
}

testGetCases();