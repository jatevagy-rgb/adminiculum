/**
 * CLIENT CALENDAR — PostgreSQL integration coverage.
 *
 * Uses the repo's shared convention: runs only when a test database URL is
 * provisioned (CI Postgres service); skips locally otherwise.
 */
import { PrismaClient } from '@prisma/client';
import { getClientCalendar } from '../src/modules/client-calendar/service';
import { InteractionError } from '../src/modules/client-interaction/base';

const databaseUrl =
  process.env.CLIENT_INTERACTION_TEST_DATABASE_URL ||
  process.env.CLIENT_IDENTITY_TEST_DATABASE_URL ||
  process.env.MIGRATION_REPLAY_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;
let prisma: PrismaClient;

d('client calendar integration (postgres)', () => {
  const tag = `cal-${Date.now()}`;
  let adminId = '';
  let lawyerId = '';
  let outsiderId = '';
  let clientAId = '';
  let clientBId = '';
  let caseA1Id = '';
  let caseA2Id = '';
  let caseB1Id = '';

  beforeAll(async () => {
    if (!databaseUrl) return;
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    adminId = (await prisma.user.create({
      data: { email: `${tag}-admin@test.dev`, name: 'Admin', role: 'ADMIN', isActive: true, status: 'ACTIVE' },
    })).id;
    lawyerId = (await prisma.user.create({
      data: { email: `${tag}-lawyer@test.dev`, name: 'Lawyer', role: 'LAWYER', isActive: true, status: 'ACTIVE' },
    })).id;
    outsiderId = (await prisma.user.create({
      data: { email: `${tag}-outsider@test.dev`, name: 'Out', role: 'LAWYER', isActive: true, status: 'ACTIVE' },
    })).id;
    clientAId = (await prisma.client.create({ data: { name: `${tag} A` } })).id;
    clientBId = (await prisma.client.create({ data: { name: `${tag} B` } })).id;
    caseA1Id = (await prisma.case.create({
      data: {
        clientId: clientAId, createdById: lawyerId, title: 'A1', caseNumber: `${tag}-A1`,
        caseType: 'CONTRACT_REVIEW', status: 'IN_REVIEW', deadline: new Date('2027-03-05'),
      },
    })).id;
    caseA2Id = (await prisma.case.create({
      data: {
        clientId: clientAId, createdById: adminId, title: 'A2', caseNumber: `${tag}-A2`,
        caseType: 'OTHER', status: 'IN_REVIEW', deadline: new Date('2027-04-01'),
      },
    })).id;
    caseB1Id = (await prisma.case.create({
      data: {
        clientId: clientBId, createdById: adminId, title: 'B1', caseNumber: `${tag}-B1`,
        caseType: 'OTHER', status: 'IN_REVIEW', deadline: new Date('2027-05-10'),
      },
    })).id;

    const contractAId = (await prisma.contractRecord.create({
      data: {
        clientId: clientAId, title: 'A keretszerződés', contractType: 'FRAMEWORK', status: 'ACTIVE',
        signatureDate: new Date('2026-01-15'), effectiveDate: new Date('2026-02-01'),
        expiryDate: new Date('2030-06-30'), nextCriticalDate: new Date('2027-01-31'),
      },
    })).id;
    await prisma.contractEntitlement.create({
      data: {
        clientId: clientAId, contractId: contractAId, type: 'PURCHASE_RIGHT', title: 'Vételi jog',
        status: 'ACTIVE', exerciseByDate: new Date('2028-12-31'),
      },
    });
    await prisma.clientObligation.create({
      data: {
        clientId: clientAId, title: 'Jelentés', sourceType: 'CONTRACT', triggerType: 'SCHEDULED',
        status: 'OPEN', nextDueDate: new Date('2027-09-30'),
      },
    });
    await prisma.companyMilestone.create({
      data: {
        clientId: clientAId, title: 'Mérföldkő', type: 'CORPORATE', status: 'PLANNED',
        targetDate: new Date('2027-06-30'), createdByUserId: adminId,
      },
    });
    await prisma.task.create({
      data: { caseId: caseA1Id, title: 'Felülvizsgálat', taskType: 'OTHER', status: 'PENDING', dueDate: new Date('2027-02-14') },
    });
    await prisma.caseIntakeDeadline.create({
      data: {
        caseId: caseA1Id, title: 'Beadvány határideje', deadlineType: 'STATUTORY',
        dueAt: new Date('2027-03-01'), createdById: adminId,
      },
    });
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    await prisma.caseIntakeDeadline.deleteMany({ where: { caseId: { in: [caseA1Id, caseA2Id, caseB1Id] } } });
    await prisma.task.deleteMany({ where: { caseId: { in: [caseA1Id, caseA2Id, caseB1Id] } } });
    await prisma.companyMilestone.deleteMany({ where: { clientId: { in: [clientAId, clientBId] } } });
    await prisma.clientObligation.deleteMany({ where: { clientId: { in: [clientAId, clientBId] } } });
    await prisma.contractEntitlement.deleteMany({ where: { clientId: { in: [clientAId, clientBId] } } });
    await prisma.contractRecord.deleteMany({ where: { clientId: { in: [clientAId, clientBId] } } });
    await prisma.case.deleteMany({ where: { id: { in: [caseA1Id, caseA2Id, caseB1Id] } } });
    await prisma.client.deleteMany({ where: { id: { in: [clientAId, clientBId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, lawyerId, outsiderId] } } });
    await prisma.$disconnect();
  });

  it('projects every canonical source for client A only', async () => {
    const res = await getClientCalendar({ userId: adminId, role: 'ADMIN' }, clientAId, { from: '2026-01-01', to: '2030-12-31' }, prisma);
    const types = new Set(res.items.map((i) => i.sourceType));
    for (const t of ['CONTRACT', 'OBLIGATION', 'ENTITLEMENT', 'COMPANY_MILESTONE', 'CASE_DEADLINE', 'TASK', 'CASE_INTAKE_DEADLINE']) {
      expect(types.has(t as never)).toBe(true);
    }
    expect(res.items.some((i) => i.caseId === caseB1Id || i.sourceId === caseB1Id)).toBe(false);
    const contractKinds = res.items.filter((i) => i.sourceType === 'CONTRACT').map((i) => i.dateKind);
    for (const k of ['SIGNATURE', 'EFFECTIVE', 'EXPIRY', 'CRITICAL_DATE']) expect(contractKinds).toContain(k);
  });

  it('scopes case-derived sources to readable cases for a lawyer', async () => {
    const res = await getClientCalendar({ userId: lawyerId, role: 'LAWYER' }, clientAId, { from: '2026-01-01', to: '2030-12-31' }, prisma);
    const caseIds = new Set(res.items.map((i) => i.caseId).filter(Boolean));
    expect(caseIds.has(caseA1Id)).toBe(true);
    expect(caseIds.has(caseA2Id)).toBe(false);
    expect(res.items.some((i) => i.sourceType === 'CONTRACT')).toBe(true);
  });

  it('rejects a user without client access', async () => {
    await expect(
      getClientCalendar({ userId: outsiderId, role: 'LAWYER' }, clientAId, { from: '2026-01-01', to: '2030-12-31' }, prisma),
    ).rejects.toBeInstanceOf(InteractionError);
  });
});
