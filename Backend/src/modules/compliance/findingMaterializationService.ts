import { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient;

export interface FindingMaterializationInput {
  applicabilityId: string;
  assessmentId: string;
  createdByUserId: string;
}

export interface FindingMaterializationResult {
  finding: {
    id: string;
    clientId: string;
    requirementId: string;
    requirementApplicabilityId: string;
    applicabilityOutcome: string;
    status: string;
  } | null;
  outcome: string;
  created: boolean;
}

const ATTENTION_OUTCOMES = new Set([
  'APPLIES',
  'INSUFFICIENT_FACTS',
  'LEGAL_REVIEW_REQUIRED',
  'TECHNICAL_REVIEW_REQUIRED',
  'SOURCE_SUPPORT_INSUFFICIENT',
]);

async function resolveFinding(tx: Prisma.TransactionClient, findingId: string, status: string): Promise<void> {
  let current = status;
  while (current !== 'RESOLVED') {
    const next = current === 'OPEN' ? 'ACKNOWLEDGED' : current === 'ACKNOWLEDGED' ? 'ACTION_PLANNED' : 'RESOLVED';
    await tx.assessmentFinding.update({ where: { id: findingId }, data: { status: next } });
    current = next;
  }
}

async function reopenFinding(tx: Prisma.TransactionClient, findingId: string, status: string): Promise<void> {
  if (status === 'RESOLVED') await tx.assessmentFinding.update({ where: { id: findingId }, data: { status: 'OPEN' } });
}

export async function materializeRequirementApplicabilityFinding(
  input: FindingMaterializationInput,
  db: Db = new PrismaClient(),
): Promise<FindingMaterializationResult> {
  const execute = () => db.$transaction(async (tx) => {
    const applicability = await tx.requirementApplicability.findUnique({
      where: { id: input.applicabilityId },
      select: {
        id: true,
        clientId: true,
        outcome: true,
        requirementVersion: {
          select: { requirementId: true, title: true, normativeStatement: true },
        },
      },
    });
    if (!applicability) throw new Error('RequirementApplicability not found.');

    const assessment = await tx.assessment.findFirst({ where: { id: input.assessmentId, clientId: applicability.clientId }, select: { id: true } });
    if (!assessment) throw new Error('Assessment does not belong to the applicability client.');
    const requirementId = applicability.requirementVersion.requirementId;
    let finding = await tx.assessmentFinding.findFirst({ where: { clientId: applicability.clientId, requirementId }, orderBy: { createdAt: 'asc' } });

    if (applicability.outcome === 'DOES_NOT_APPLY') {
      if (!finding) return { finding: null, outcome: applicability.outcome, created: false };
      await resolveFinding(tx, finding.id, finding.status);
      const updated = await tx.assessmentFinding.update({
        where: { id: finding.id },
        data: { requirementApplicabilityId: applicability.id, applicabilityOutcome: applicability.outcome },
        select: { id: true, clientId: true, requirementId: true, requirementApplicabilityId: true, applicabilityOutcome: true, status: true },
      });
      return { finding: updated as FindingMaterializationResult['finding'], outcome: applicability.outcome, created: false };
    }

    if (!ATTENTION_OUTCOMES.has(applicability.outcome)) throw new Error(`Unsupported applicability outcome: ${applicability.outcome}`);
    if (finding) {
      await reopenFinding(tx, finding.id, finding.status);
      const updated = await tx.assessmentFinding.update({
        where: { id: finding.id },
        data: { requirementApplicabilityId: applicability.id, applicabilityOutcome: applicability.outcome },
        select: { id: true, clientId: true, requirementId: true, requirementApplicabilityId: true, applicabilityOutcome: true, status: true },
      });
      return { finding: updated as FindingMaterializationResult['finding'], outcome: applicability.outcome, created: false };
    }

    try {
      const created = await tx.assessmentFinding.create({
        data: {
          clientId: applicability.clientId,
          assessmentId: input.assessmentId,
          requirementId,
          requirementApplicabilityId: applicability.id,
          applicabilityOutcome: applicability.outcome,
          severity: 'MEDIUM',
          title: applicability.requirementVersion.title,
          description: applicability.requirementVersion.normativeStatement,
          recommendation: applicability.outcome === 'APPLIES' ? 'Review and address this applicable requirement.' : 'Resolve the applicability evidence before treating this requirement as determined.',
          status: 'OPEN',
          createdByUserId: input.createdByUserId,
        },
        select: { id: true, clientId: true, requirementId: true, requirementApplicabilityId: true, applicabilityOutcome: true, status: true },
      });
      return { finding: created as FindingMaterializationResult['finding'], outcome: applicability.outcome, created: true };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const retried = await tx.assessmentFinding.findFirst({ where: { clientId: applicability.clientId, requirementId } });
      if (!retried) throw error;
      const updated = await tx.assessmentFinding.update({
        where: { id: retried.id },
        data: { requirementApplicabilityId: applicability.id, applicabilityOutcome: applicability.outcome },
        select: { id: true, clientId: true, requirementId: true, requirementApplicabilityId: true, applicabilityOutcome: true, status: true },
      });
      return { finding: updated as FindingMaterializationResult['finding'], outcome: applicability.outcome, created: false };
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await execute();
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt === 2) throw error;
    }
  }

  throw new Error('Finding materialization transaction exhausted its retry budget.');
}
