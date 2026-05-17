import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testGetCases() {
  try {
    console.log('=== TEST 1: getCases with NO filter ===');
    const [cases1, total1] = await Promise.all([
      prisma.case.findMany({
        orderBy: { updatedAt: 'desc' },
        skip: 0,
        take: 10,
        include: {
          assignedLawyer: {
            select: { id: true, name: true, email: true, role: true }
          }
        }
      }),
      prisma.case.count()
    ]);
    console.log('SUCCESS:', cases1.length, 'cases, total =', total1);

    console.log('\n=== TEST 2: getCases with assignedLawyerId filter ===');
    // Find first case that has an assigned lawyer
    const firstCase = cases1.find(c => c.assignedLawyerId);
    if (firstCase?.assignedLawyerId) {
      const lawyerId = firstCase.assignedLawyerId;
      console.log('Using lawyerId:', lawyerId);
      
      const [cases2, total2] = await Promise.all([
        prisma.case.findMany({
          orderBy: { updatedAt: 'desc' },
          skip: 0,
          take: 10,
          include: {
            assignedLawyer: {
              select: { id: true, name: true, email: true, role: true }
            }
          },
          where: { assignedLawyerId: lawyerId }
        }),
        prisma.case.count({ where: { assignedLawyerId: lawyerId } })
      ]);
      console.log('SUCCESS:', cases2.length, 'cases, total =', total2);
    } else {
      console.log('No case with assignedLawyerId found, testing with random UUID');
      const [cases2, total2] = await Promise.all([
        prisma.case.findMany({
          orderBy: { updatedAt: 'desc' },
          skip: 0,
          take: 10,
          include: {
            assignedLawyer: {
              select: { id: true, name: true, email: true, role: true }
            }
          },
          where: { assignedLawyerId: '00000000-0000-0000-0000-000000000000' }
        }),
        prisma.case.count({ where: { assignedLawyerId: '00000000-0000-0000-0000-000000000000' } })
      ]);
      console.log('SUCCESS:', cases2.length, 'cases, total =', total2);
    }

    console.log('\n=== TEST 3: getCases with limit=200 ===');
    const [cases3, total3] = await Promise.all([
      prisma.case.findMany({
        orderBy: { updatedAt: 'desc' },
        skip: 0,
        take: 200,
        include: {
          assignedLawyer: {
            select: { id: true, name: true, email: true, role: true }
          }
        }
      }),
      prisma.case.count()
    ]);
    console.log('SUCCESS:', cases3.length, 'cases, total =', total3);

    console.log('\n=== TEST 4: caseCollaborator direct query ===');
    const collabCount = await prisma.caseCollaborator.count();
    console.log('Total collaborators in DB:', collabCount);
    
    const firstCollab = await prisma.caseCollaborator.findFirst();
    if (firstCollab) {
      console.log('First collaborator:', JSON.stringify(firstCollab));
    }

  } catch (e) {
    console.error('ERROR:', e.message);
    console.error('Code:', e.code);
    console.error('Meta:', JSON.stringify(e.meta));
  } finally {
    await prisma.$disconnect();
  }
}

testGetCases();