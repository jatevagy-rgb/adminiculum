import type { Prisma } from '@prisma/client';

export class EffectiveRequirementRuleError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'EffectiveRequirementRuleError';
  }
}

type Db = Prisma.TransactionClient;

/** Resolves the one approved requirement version and its current approved rule at an instant. */
export async function resolveEffectiveRequirementRuleVersion(
  requirementId: string,
  evaluationAt: Date,
  tx: Db,
) {
  const versions = await tx.requirementVersion.findMany({
    where: {
      requirementId,
      status: 'APPROVED',
      effectiveFrom: { lte: evaluationAt },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: evaluationAt } }],
    },
    select: { id: true },
    take: 2,
  });
  if (versions.length === 0) {
    throw new EffectiveRequirementRuleError('NO_EFFECTIVE_REQUIREMENT_VERSION', 'No approved RequirementVersion is effective at evaluationAt.');
  }
  if (versions.length > 1) {
    throw new EffectiveRequirementRuleError('AMBIGUOUS_EFFECTIVE_REQUIREMENT_VERSION', 'More than one approved RequirementVersion is effective at evaluationAt.');
  }
  const rules = await tx.applicabilityRuleVersion.findMany({
    where: { requirementVersionId: versions[0].id, status: 'APPROVED', supersededById: null },
    select: { id: true, requirementVersionId: true, evaluationScopeType: true },
    take: 2,
  });
  if (rules.length === 0) {
    throw new EffectiveRequirementRuleError('NO_CURRENT_APPROVED_RULE_VERSION', 'No current approved ApplicabilityRuleVersion is available.');
  }
  if (rules.length > 1) {
    throw new EffectiveRequirementRuleError('AMBIGUOUS_CURRENT_APPROVED_RULE_VERSION', 'More than one current approved ApplicabilityRuleVersion is available.');
  }
  if (!rules[0].evaluationScopeType) {
    throw new EffectiveRequirementRuleError('RULE_SCOPE_UNRESOLVED', 'Approved rule has no safely resolved evaluation scope.');
  }
  return { requirementVersionId: versions[0].id, ruleVersionId: rules[0].id, evaluationScopeType: rules[0].evaluationScopeType };
}
