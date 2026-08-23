import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

export const WORKFORCE_QA_IDS = {
  user: 'qa-user',
  deniedUser: 'qa-denied-user',
  client: 'qa-client',
  case: 'qa-case',
  task: 'qa-task',
  assessment: 'qa-assessment',
  findings: {
    company: 'qa-finding-company',
    employee: 'qa-finding-employee',
    contract: 'qa-finding-contract',
    workplace: 'qa-finding-workplace',
  },
} as const;

export type WorkforceQaFixture = typeof WORKFORCE_QA_IDS;

export async function createWorkforceQaFixture(
  prisma: PrismaClient,
  options: { password?: string } = {},
): Promise<WorkforceQaFixture> {
  const now = new Date();
  const passwordHash = options.password
    ? await bcrypt.hash(options.password, 4)
    : undefined;

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

  await prisma.user.createMany({
    data: [
      {
        id: WORKFORCE_QA_IDS.user,
        email: 'qa-user@adminiculum.test',
        name: 'QA Workforce',
        role: 'LAWYER',
        status: 'ACTIVE',
        isActive: true,
        ...(passwordHash ? { passwordHash } : {}),
        skills: [],
      },
      {
        id: WORKFORCE_QA_IDS.deniedUser,
        email: 'qa-denied-user@adminiculum.test',
        name: 'QA Denied Workforce',
        role: 'LAWYER',
        status: 'ACTIVE',
        isActive: true,
        ...(passwordHash ? { passwordHash } : {}),
        skills: [],
      },
    ],
  });

  await prisma.client.create({
    data: {
      id: WORKFORCE_QA_IDS.client,
      name: 'QA Client',
      email: 'qa-client@adminiculum.test',
    },
  });

  await prisma.case.create({
    data: {
      id: WORKFORCE_QA_IDS.case,
      caseNumber: 'QA-CASE-001',
      title: 'QA Case',
      description: 'Deterministic workforce browser QA case.',
      caseType: 'CONTRACT_REVIEW',
      status: 'IN_REVIEW',
      priority: 'MEDIUM',
      clientId: WORKFORCE_QA_IDS.client,
      clientName: 'QA Client',
      createdById: WORKFORCE_QA_IDS.user,
      assignedLawyerId: WORKFORCE_QA_IDS.user,
      receivedAt: now,
    },
  });

  await prisma.task.create({
    data: {
      id: WORKFORCE_QA_IDS.task,
      title: 'QA task',
      description: 'Deterministic task for workforce browser QA.',
      taskType: 'RESEARCH',
      type: 'QA',
      status: 'TODO',
      priority: 'MEDIUM',
      caseId: WORKFORCE_QA_IDS.case,
      assignedToId: WORKFORCE_QA_IDS.user,
      assignedById: WORKFORCE_QA_IDS.user,
      requiredSkills: [],
    },
  });

  await prisma.assessment.create({
    data: {
      id: WORKFORCE_QA_IDS.assessment,
      clientId: WORKFORCE_QA_IDS.client,
      type: 'QA_INTERNAL',
      title: 'QA internal assessment',
      status: 'COMPLETED',
      createdByUserId: WORKFORCE_QA_IDS.user,
      completedAt: now,
    },
  });

  const findings = [
    ['company', 'COMPANY'],
    ['employee', 'EMPLOYEE'],
    ['contract', 'CONTRACT'],
    ['workplace', 'WORKPLACE_SITE'],
  ] as const;

  await prisma.assessmentFinding.createMany({
    data: findings.map(([key, scopeType]) => ({
      id: WORKFORCE_QA_IDS.findings[key],
      clientId: WORKFORCE_QA_IDS.client,
      assessmentId: WORKFORCE_QA_IDS.assessment,
      title: 'QA internal assessment finding',
      description: 'Synthetic, unsourced QA data only.',
      recommendation: 'Review synthetic QA data.',
      status: 'OPEN',
      severity: 'MEDIUM',
      scopeType,
      applicabilityOutcome: 'INSUFFICIENT_FACTS',
      createdByUserId: WORKFORCE_QA_IDS.user,
    })),
  });

  return WORKFORCE_QA_IDS;
}
