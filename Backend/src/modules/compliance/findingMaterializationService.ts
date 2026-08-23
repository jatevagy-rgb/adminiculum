import { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient;

export class FindingMaterializationIdentityConflictError extends Error {
  constructor() {
    super('Finding materialization lost an identity race.');
    this.name = 'FindingMaterializationIdentityConflictError';
  }
}

export interface FindingMaterializationInput {
  applicabilityId: string;
  createdByUserId: string;
}

export interface FindingMaterializationResult {
  finding: {
    id: string;
    clientId: string;
    requirementId: string;
    scopeType: string;
    factSubjectId: string | null;
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

type ApplicabilityOrder = { id: string; evaluationAt: Date; createdAt: Date };

function compareApplicabilityOrder(incoming: ApplicabilityOrder, current: ApplicabilityOrder): 'NEWER' | 'OLDER' | 'SAME' | 'AMBIGUOUS' {
  if (incoming.id === current.id) return 'SAME';
  const evaluation = incoming.evaluationAt.getTime() - current.evaluationAt.getTime();
  if (evaluation !== 0) return evaluation > 0 ? 'NEWER' : 'OLDER';
  const created = incoming.createdAt.getTime() - current.createdAt.getTime();
  if (created !== 0) return created > 0 ? 'NEWER' : 'OLDER';
  return 'AMBIGUOUS';
}

const findingSelect = {
  id: true,
  clientId: true,
  requirementId: true,
  scopeType: true,
  factSubjectId: true,
  requirementApplicabilityId: true,
  applicabilityOutcome: true,
  status: true,
} as const;

async function materializeRequirementApplicabilityFindingInTxImpl(
  input: FindingMaterializationInput,
  tx: Prisma.TransactionClient,
): Promise<FindingMaterializationResult> {
  const applicability = await tx.requirementApplicability.findUnique({
    where: { id: input.applicabilityId },
    select: {
      id: true,
      clientId: true,
      outcome: true,
      scopeType: true,
      factSubjectId: true,
      evaluationAt: true,
      createdAt: true,
      requirementVersion: { select: { requirementId: true, title: true, normativeStatement: true } },
    },
  });
  if (!applicability) throw new Error('RequirementApplicability not found.');

  const requirementId = applicability.requirementVersion.requirementId;
  let finding = await tx.assessmentFinding.findFirst({
    where: {
      clientId: applicability.clientId,
      requirementId,
      scopeType: applicability.scopeType,
      factSubjectId: applicability.factSubjectId,
    },
    orderBy: { createdAt: 'asc' },
    select: { ...findingSelect, requirementApplicability: { select: { id: true, evaluationAt: true, createdAt: true } } },
  });

  if (finding?.requirementApplicability) {
    const order = compareApplicabilityOrder(applicability, finding.requirementApplicability);
    if (order === 'SAME' || order === 'OLDER') {
      return { finding: finding as FindingMaterializationResult['finding'], outcome: finding.applicabilityOutcome ?? applicability.outcome, created: false };
    }
    if (order === 'AMBIGUOUS') throw new Error('Ambiguous applicability ordering; refusing to overwrite current finding evidence.');
  }

  if (applicability.outcome === 'DOES_NOT_APPLY') {
    if (!finding) return { finding: null, outcome: applicability.outcome, created: false };
    await resolveFinding(tx, finding.id, finding.status);
    const updated = await tx.assessmentFinding.update({ where: { id: finding.id }, data: { requirementApplicabilityId: applicability.id, applicabilityOutcome: applicability.outcome }, select: findingSelect });
    return { finding: updated as FindingMaterializationResult['finding'], outcome: applicability.outcome, created: false };
  }

  if (!ATTENTION_OUTCOMES.has(applicability.outcome)) throw new Error(`Unsupported applicability outcome: ${applicability.outcome}`);
  if (finding) {
    await reopenFinding(tx, finding.id, finding.status);
    const updated = await tx.assessmentFinding.update({ where: { id: finding.id }, data: { requirementApplicabilityId: applicability.id, applicabilityOutcome: applicability.outcome }, select: findingSelect });
    return { finding: updated as FindingMaterializationResult['finding'], outcome: applicability.outcome, created: false };
  }

  let created;
  try {
    created = await tx.assessmentFinding.create({
      data: {
        clientId: applicability.clientId,
        assessmentId: null,
        requirementId,
        scopeType: applicability.scopeType,
        factSubjectId: applicability.factSubjectId,
        requirementApplicabilityId: applicability.id,
        applicabilityOutcome: applicability.outcome,
        severity: 'MEDIUM',
        title: applicability.requirementVersion.title,
        description: applicability.requirementVersion.normativeStatement,
        recommendation: applicability.outcome === 'APPLIES' ? 'Review and address this applicable requirement.' : 'Resolve the applicability evidence before treating this requirement as determined.',
        status: 'OPEN',
        createdByUserId: input.createdByUserId,
      },
      select: findingSelect,
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      throw new FindingMaterializationIdentityConflictError();
    }
    throw error;
  }
  return { finding: created as FindingMaterializationResult['finding'], outcome: applicability.outcome, created: true };
}

export async function materializeRequirementApplicabilityFindingInTx(
  input: FindingMaterializationInput,
  tx: Prisma.TransactionClient,
): Promise<FindingMaterializationResult> {
  return materializeRequirementApplicabilityFindingInTxImpl(input, tx);
}

export async function materializeRequirementApplicabilityFinding(
  input: FindingMaterializationInput,
  db: Db = new PrismaClient(),
): Promise<FindingMaterializationResult> {
  const execute = () => db.$transaction((tx) => materializeRequirementApplicabilityFindingInTxImpl(input, tx), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await execute();
    } catch (error) {
      const isPrismaError = error instanceof Prisma.PrismaClientKnownRequestError;
      const retryable = error instanceof FindingMaterializationIdentityConflictError
        || (isPrismaError && error.code === 'P2034');
      if (!retryable || attempt === 2) throw error;
    }
  }

  throw new Error('Finding materialization transaction exhausted its retry budget.');
}
