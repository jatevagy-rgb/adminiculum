import { PrismaClient } from '@prisma/client';
import { getWorkspaceOverview } from '../src/modules/company-workspace/service';
import {
  createWorkforceQaFixture,
  WORKFORCE_QA_IDS,
} from './helpers/workforceQaFixture';

const databaseUrl = process.env.WORKFORCE_QA_DATABASE_URL;
const describeIfConfigured = databaseUrl ? describe : describe.skip;

describeIfConfigured('workforce QA fixture foundation (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await createWorkforceQaFixture(prisma);
  });

  afterAll(async () => {
    await prisma.assessmentFinding.deleteMany({
      where: { id: { in: Object.values(WORKFORCE_QA_IDS.findings) } },
    });
    await prisma.task.deleteMany({ where: { id: WORKFORCE_QA_IDS.task } });
    await prisma.assessment.deleteMany({ where: { id: WORKFORCE_QA_IDS.assessment } });
    await prisma.case.deleteMany({ where: { id: WORKFORCE_QA_IDS.case } });
    await prisma.client.deleteMany({ where: { id: WORKFORCE_QA_IDS.client } });
    await prisma.user.deleteMany({
      where: { id: { in: [WORKFORCE_QA_IDS.user, WORKFORCE_QA_IDS.deniedUser] } },
    });
    await prisma.$disconnect();
  });

  it('authorized workforce user can load the client projection', async () => {
    const overview = await getWorkspaceOverview(
      { userId: WORKFORCE_QA_IDS.user, role: 'LAWYER' },
      WORKFORCE_QA_IDS.client,
      prisma,
    );
    expect(overview.client).toEqual({
      id: WORKFORCE_QA_IDS.client,
      name: 'QA Client',
    });
    expect(overview.assessments).toHaveLength(1);
  });

  it('workforce user without a case relationship is denied', async () => {
    await expect(getWorkspaceOverview(
      { userId: WORKFORCE_QA_IDS.deniedUser, role: 'LAWYER' },
      WORKFORCE_QA_IDS.client,
      prisma,
    )).rejects.toMatchObject({ code: 'CLIENT_ACCESS_FORBIDDEN' });
  });
});
