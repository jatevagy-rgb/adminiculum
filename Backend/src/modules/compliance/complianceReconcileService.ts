import { Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { InternalActor, assertClientReadAccess } from '../client-interaction/base';
import {
  EffectiveRequirementRuleError,
  resolveEffectiveRequirementRuleVersion,
} from './effectiveRequirementRuleResolver';
import { createRequirementApplicabilityInTx } from './requirementApplicabilityService';
import {
  FindingMaterializationIdentityConflictError,
  materializeRequirementApplicabilityFindingInTx,
} from './findingMaterializationService';

type Db = typeof defaultPrisma;
type TransactionClient = Prisma.TransactionClient;

/**
 * Explicit, idempotent Compliance reconciliation (initial/backfill path).
 *
 * reevaluateTypedFactInTx covers the mutation-driven case: a typed-fact write
 * discovers and refreshes the approved rules that depend on it. This service
 * covers the complementary gap — an enrolled client whose facts already exist
 * but which was never evaluated (or needs re-checking) because no fact was
 * mutated through the typed-fact path.
 *
 * It starts from the CURRENT effective approved rule set: every requirement
 * resolves through resolveEffectiveRequirementRuleVersion, and each resolved
 * rule is evaluated through the existing createRequirementApplicabilityInTx +
 * materializeRequirementApplicabilityFindingInTx primitives. It never creates,
 * updates, or supersedes ClientFact rows, contains no evaluation logic of its
 * own, and never fabricates findings: snapshot dedup (sameLogicalState) and
 * finding ordering rules keep repeated reconciliations no-ops when the
 * authoritative state is unchanged.
 *
 * Subject-scoped rules are evaluated per existing non-archived FactSubject of
 * that scope; when the client has no subject for a subject-scoped rule there
 * is no truthful subject to evaluate, so that rule is skipped rather than
 * manufacturing a subject-less verdict.
 */

// Same skip list as reevaluateTypedFactInTx: resolvable "no current rule"
// states skip the requirement; ambiguous corpus states surface as errors.
const RESOLVABLE_SKIPS = new Set([
  'NO_EFFECTIVE_REQUIREMENT_VERSION',
  'NO_CURRENT_APPROVED_RULE_VERSION',
  'RULE_SCOPE_UNRESOLVED',
]);

export interface ComplianceReconcileResult {
  enrolled: boolean;
  evaluated: number;
  snapshotsCreated: number;
  snapshotsDeduplicated: number;
  findingsCreated: number;
}

function isRetryable(error: unknown): boolean {
  if (error instanceof FindingMaterializationIdentityConflictError) return true;
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

async function reconcileClientComplianceInTx(
  clientId: string,
  actorUserId: string,
  tx: TransactionClient,
): Promise<ComplianceReconcileResult> {
  const profile = await tx.clientOperatingProfile.findUnique({
    where: { clientId },
    select: { complianceEnrollmentStatus: true },
  });
  const enrolled = profile?.complianceEnrollmentStatus === 'ENROLLED';
  if (!enrolled) {
    return { enrolled, evaluated: 0, snapshotsCreated: 0, snapshotsDeduplicated: 0, findingsCreated: 0 };
  }

  const now = new Date();
  const requirements = await tx.requirement.findMany({
    where: {
      versions: {
        some: {
          status: 'APPROVED',
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
      },
    },
    select: { id: true },
  });

  let evaluated = 0;
  let snapshotsCreated = 0;
  let snapshotsDeduplicated = 0;
  let findingsCreated = 0;

  for (const requirement of requirements) {
    let rule;
    try {
      rule = await resolveEffectiveRequirementRuleVersion(requirement.id, now, tx);
    } catch (caught) {
      if (caught instanceof EffectiveRequirementRuleError && RESOLVABLE_SKIPS.has(caught.code)) continue;
      throw caught;
    }
    const scopeType = rule.evaluationScopeType;
    if (!scopeType) continue;
    const subjectIds: Array<string | null> =
      scopeType === 'COMPANY'
        ? [null]
        : (await tx.factSubject.findMany({
            where: { clientId, scopeType, archivedAt: null },
            select: { id: true },
          })).map((subject) => subject.id);
    if (!subjectIds.length) continue;

    for (const factSubjectId of subjectIds) {
      const snapshot = await createRequirementApplicabilityInTx(
        {
          requirementVersionId: rule.requirementVersionId,
          ruleVersionId: rule.ruleVersionId,
          clientId,
          scope: {
            scopeType,
            factSubjectId: factSubjectId ?? undefined,
            evaluationAt: now,
          },
        },
        tx,
      );
      const materialized = await materializeRequirementApplicabilityFindingInTx(
        { applicabilityId: snapshot.applicability.id, createdByUserId: actorUserId },
        tx,
      );
      evaluated += 1;
      if (snapshot.deduplicated) snapshotsDeduplicated += 1;
      else snapshotsCreated += 1;
      if (materialized.created) findingsCreated += 1;
    }
  }

  return { enrolled, evaluated, snapshotsCreated, snapshotsDeduplicated, findingsCreated };
}

export async function reconcileClientCompliance(
  actor: InternalActor,
  clientId: string,
  prisma: Db = defaultPrisma,
): Promise<ComplianceReconcileResult> {
  await assertClientReadAccess(actor, clientId, prisma);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        (tx) => reconcileClientComplianceInTx(clientId, actor.userId, tx),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!isRetryable(error) || attempt === 2) throw error;
    }
  }
  throw new Error('Compliance reconciliation transaction exhausted its retry budget.');
}
