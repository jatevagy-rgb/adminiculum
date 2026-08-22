import { Prisma, PrismaClient } from '@prisma/client';
import { canonicalDigest } from './canonicalDigest';
import { evaluateRule, type EvaluatorResult } from './evaluator';
import { selectFacts, type EvaluationScope, type FactDefinitionForSelection, type ClientFactForSelection, type FactSubjectForSelection } from './factSelection';

type Db = PrismaClient | Prisma.TransactionClient;

export interface ComplianceEvaluationInput {
  requirementVersionId: string;
  ruleVersionId: string;
  clientId: string;
  scope: EvaluationScope;
}

export class ComplianceEvaluationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ComplianceEvaluationError';
  }
}

export interface ComplianceEvaluationTrace {
  requirementVersionId: string;
  ruleVersionId: string;
  ruleDigest: string;
  factDefinitionKeys: string[];
  selectedClientFactIds: string[];
  missingFactKeys: string[];
  evaluatorResult: EvaluatorResult | null;
  outcome: string;
  reasonCodes: string[];
}

export interface ComplianceEvaluationResult {
  outcome: 'APPLIES' | 'DOES_NOT_APPLY' | 'INSUFFICIENT_FACTS' | 'LEGAL_REVIEW_REQUIRED' | 'TECHNICAL_REVIEW_REQUIRED' | 'SOURCE_SUPPORT_INSUFFICIENT';
  trace: ComplianceEvaluationTrace;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function traceBase(input: ComplianceEvaluationInput, digest: string, keys: string[]): ComplianceEvaluationTrace {
  return {
    requirementVersionId: input.requirementVersionId,
    ruleVersionId: input.ruleVersionId,
    ruleDigest: digest,
    factDefinitionKeys: uniqueSorted(keys),
    selectedClientFactIds: [],
    missingFactKeys: [],
    evaluatorResult: null,
    outcome: 'INSUFFICIENT_FACTS',
    reasonCodes: [],
  };
}

function finish(trace: ComplianceEvaluationTrace, outcome: ComplianceEvaluationResult['outcome'], reasons: string[]): ComplianceEvaluationResult {
  return { outcome, trace: { ...trace, outcome, reasonCodes: uniqueSorted(reasons) } };
}

export async function evaluateCompliance(input: ComplianceEvaluationInput, db: Db = new PrismaClient()): Promise<ComplianceEvaluationResult> {
  const requirementVersion = await db.requirementVersion.findUnique({ where: { id: input.requirementVersionId }, select: { id: true, status: true, sourceSupportState: true, specialistRequirement: true } });
  if (!requirementVersion) throw new ComplianceEvaluationError('REQUIREMENT_VERSION_NOT_FOUND', 'RequirementVersion was not found.');
  if (requirementVersion.status !== 'APPROVED') throw new ComplianceEvaluationError('REQUIREMENT_VERSION_NOT_APPROVED', 'RequirementVersion must be approved.');

  const rule = await db.applicabilityRuleVersion.findUnique({
    where: { id: input.ruleVersionId },
    include: { dependencies: { include: { resolvedFactDefinition: true } } },
  });
  if (!rule) throw new ComplianceEvaluationError('RULE_VERSION_NOT_FOUND', 'ApplicabilityRuleVersion was not found.');
  if (rule.status !== 'APPROVED') throw new ComplianceEvaluationError('RULE_VERSION_NOT_APPROVED', 'ApplicabilityRuleVersion must be approved.');
  if (rule.requirementVersionId !== requirementVersion.id) throw new ComplianceEvaluationError('RULE_REQUIREMENT_MISMATCH', 'Rule does not belong to the exact RequirementVersion.');

  const definitions = rule.dependencies.map((dependency) => dependency.resolvedFactDefinition as FactDefinitionForSelection | null);
  const keys = rule.dependencies.map((dependency) => dependency.factKey);
  const trace = traceBase(input, rule.canonicalDigest || canonicalDigest(rule.astJson), keys);
  if (requirementVersion.sourceSupportState !== 'SUFFICIENT') return finish(trace, 'SOURCE_SUPPORT_INSUFFICIENT', ['SOURCE_SUPPORT_INSUFFICIENT']);
  if (requirementVersion.specialistRequirement === 'LEGAL_ONLY') return finish(trace, 'LEGAL_REVIEW_REQUIRED', ['LEGAL_REVIEW_REQUIRED']);
  if (requirementVersion.specialistRequirement === 'TECHNICAL_CLASSIFICATION_REQUIRED') return finish(trace, 'TECHNICAL_REVIEW_REQUIRED', ['TECHNICAL_REVIEW_REQUIRED']);

  const subject = input.scope.factSubjectId
    ? await db.factSubject.findUnique({ where: { id: input.scope.factSubjectId }, select: { id: true, clientId: true, scopeType: true, startsAt: true, endsAt: true, archivedAt: true } }) as FactSubjectForSelection | null
    : null;

  const dependencies = await Promise.all(rule.dependencies.map(async (dependency, index) => {
    const definition = definitions[index];
    const facts = definition
      ? await db.clientFact.findMany({
        where: { clientId: input.clientId, factDefinitionId: definition.id, scopeType: input.scope.scopeType, factSubjectId: input.scope.factSubjectId ?? null, supersededAt: null },
        select: { id: true, factDefinitionId: true, scopeType: true, factSubjectId: true, validFrom: true, validTo: true, booleanValue: true, numberValue: true, stringValue: true, dateValue: true, observedAt: true, effectiveAt: true, referencePeriodStart: true, referencePeriodEnd: true, supersededAt: true },
      }) as ClientFactForSelection[]
      : [];
    return { factKey: dependency.factKey, definition, facts };
  }));
  const selection = selectFacts({ clientId: input.clientId, scope: input.scope, dependencies, subject });
  if (selection.reasonCodes.length > 0 || selection.missingFactKeys.length > 0) {
    return finish({ ...trace, selectedClientFactIds: selection.selectedClientFactIds, missingFactKeys: selection.missingFactKeys }, 'INSUFFICIENT_FACTS', [...selection.reasonCodes, ...selection.warningCodes]);
  }
  const evaluatorResult = evaluateRule(rule.astJson, selection.factMap);
  return finish({ ...trace, selectedClientFactIds: selection.selectedClientFactIds, missingFactKeys: evaluatorResult.missingFactKeys, evaluatorResult }, evaluatorResult.result, selection.warningCodes);
}
