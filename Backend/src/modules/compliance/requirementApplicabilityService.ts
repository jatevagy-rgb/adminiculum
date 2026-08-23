import { Prisma, PrismaClient } from '@prisma/client';
import { canonicalDigest } from './canonicalDigest';
import {
  evaluateComplianceWithConsumedFacts,
  type ComplianceEvaluationInput,
  type ComplianceEvaluationInternalResult,
  type ComplianceEvaluationResult,
} from './complianceEvaluationService';
import type { ConsumedFactPayload } from './factSelection';

export const REQUIREMENT_APPLICABILITY_SCHEMA_VERSION = 'phase6-requirement-applicability/v1' as const;

type Db = PrismaClient | Prisma.TransactionClient;

export interface RequirementApplicabilitySnapshot {
  schemaVersion: typeof REQUIREMENT_APPLICABILITY_SCHEMA_VERSION;
  clientId: string;
  requirementVersionId: string;
  ruleVersionId: string;
  ruleDigest: string;
  scope: {
    scopeType: ComplianceEvaluationInput['scope']['scopeType'];
    factSubjectId: string | null;
    evaluationAt: string;
    referencePeriod: { start: string; end: string } | null;
  };
  factSubjectId: string | null;
  evaluationAt: string;
  referencePeriod: { start: string; end: string } | null;
  outcome: ComplianceEvaluationResult['outcome'];
  reasonCodes: string[];
  missingFactKeys: string[];
  factDefinitions: Array<{ factDefinitionId: string | null; factKey: string }>;
  selectedClientFactIds: string[];
  normalizedValues: Array<ConsumedFactPayload>;
  sourceSupportState: string;
  specialistRequirement: string;
  specialistDomainCode: string | null;
  trace: ComplianceEvaluationResult['trace'];
}

export interface BuiltRequirementApplicabilitySnapshot {
  payload: RequirementApplicabilitySnapshot;
  snapshotDigest: string;
  valueDigests: Array<{
    applicabilityId: string;
    clientFactId: string;
    factDefinitionId: string;
    factKey: string;
    normalizedValueDigest: string;
  }>;
}

export type RequirementApplicabilityDb = PrismaClient | Prisma.TransactionClient;

function iso(value: Date): string {
  return value.toISOString();
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function normalizedValues(consumedFacts: Record<string, ConsumedFactPayload>): ConsumedFactPayload[] {
  return Object.values(consumedFacts)
    .map((fact) => ({ ...fact, clientFactIds: sortedUnique(fact.clientFactIds) }))
    .sort((left, right) => left.factKey.localeCompare(right.factKey));
}

export function buildRequirementApplicabilitySnapshot(input: {
  evaluationInput: ComplianceEvaluationInput;
  evaluation: ComplianceEvaluationInternalResult;
  requirementVersion: {
    sourceSupportState: string;
    specialistRequirement: string;
    specialistDomainCode: string | null;
  };
  rule: {
    canonicalDigest: string;
    dependencies: Array<{
      factKey: string;
      resolvedFactDefinition: { id: string } | null;
    }>;
  };
}): BuiltRequirementApplicabilitySnapshot {
  const referencePeriod = input.evaluationInput.scope.referencePeriod
    ? { start: iso(input.evaluationInput.scope.referencePeriod.start), end: iso(input.evaluationInput.scope.referencePeriod.end) }
    : null;
  const factDefinitions = input.rule.dependencies
    .map((dependency) => ({ factDefinitionId: dependency.resolvedFactDefinition?.id ?? null, factKey: dependency.factKey }))
    .sort((left, right) => left.factKey.localeCompare(right.factKey));
  const values = normalizedValues(input.evaluation.consumedFacts);
  const evaluationAt = iso(input.evaluationInput.scope.evaluationAt);
  const factSubjectId = input.evaluationInput.scope.factSubjectId ?? null;
  const payload: RequirementApplicabilitySnapshot = {
    schemaVersion: REQUIREMENT_APPLICABILITY_SCHEMA_VERSION,
    clientId: input.evaluationInput.clientId,
    requirementVersionId: input.evaluationInput.requirementVersionId,
    ruleVersionId: input.evaluationInput.ruleVersionId,
    ruleDigest: input.rule.canonicalDigest,
    scope: { scopeType: input.evaluationInput.scope.scopeType, factSubjectId, evaluationAt, referencePeriod },
    factSubjectId,
    evaluationAt,
    referencePeriod,
    outcome: input.evaluation.outcome,
    reasonCodes: sortedUnique(input.evaluation.trace.reasonCodes),
    missingFactKeys: sortedUnique(input.evaluation.trace.missingFactKeys),
    factDefinitions,
    selectedClientFactIds: sortedUnique(input.evaluation.trace.selectedClientFactIds),
    normalizedValues: values,
    sourceSupportState: input.requirementVersion.sourceSupportState,
    specialistRequirement: input.requirementVersion.specialistRequirement,
    specialistDomainCode: input.requirementVersion.specialistDomainCode,
    trace: input.evaluation.trace,
  };
  const snapshotDigest = canonicalDigest(payload);
  const valueDigests = values.flatMap((value) => value.clientFactIds.map((clientFactId) => ({
    applicabilityId: '',
    clientFactId,
    factDefinitionId: value.factDefinitionId,
    factKey: value.factKey,
    normalizedValueDigest: canonicalDigest({ valueType: value.valueType, normalizedValue: value.normalizedValue }),
  })));
  return { payload, snapshotDigest, valueDigests };
}

function logicalState(payload: RequirementApplicabilitySnapshot): string {
  return canonicalDigest({
    outcome: payload.outcome,
    reasonCodes: sortedUnique(payload.reasonCodes),
    normalizedValues: payload.normalizedValues
      .map((value) => ({ ...value, clientFactIds: sortedUnique(value.clientFactIds) }))
      .sort((left, right) => left.factKey.localeCompare(right.factKey)),
    selectedClientFactIds: sortedUnique(payload.selectedClientFactIds),
  });
}

function sameLogicalState(row: { snapshotJson: unknown }, state: string): boolean {
  const snapshot = row.snapshotJson as Partial<RequirementApplicabilitySnapshot> | null;
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.reasonCodes)
    || !Array.isArray(snapshot.normalizedValues) || !Array.isArray(snapshot.selectedClientFactIds)) return false;
  return logicalState(snapshot as RequirementApplicabilitySnapshot) === state;
}

/**
 * Persist one immutable applicability snapshot inside an already-open
 * transaction. The caller owns transaction boundaries and retry behavior.
 */
export async function createRequirementApplicabilityInTx(
  input: ComplianceEvaluationInput,
  tx: Prisma.TransactionClient,
) {
  const evaluation = await evaluateComplianceWithConsumedFacts(input, tx);
  if (evaluation.trace.evaluatorResult?.errors.length) {
    throw new Error('Compliance evaluator returned validation errors; refusing to persist an applicability snapshot.');
  }
  const [requirementVersion, rule] = await Promise.all([
    tx.requirementVersion.findUnique({
      where: { id: input.requirementVersionId },
      select: { sourceSupportState: true, specialistRequirement: true, specialistDomainCode: true },
    }),
    tx.applicabilityRuleVersion.findUnique({
      where: { id: input.ruleVersionId },
      select: {
        canonicalDigest: true,
        dependencies: { select: { factKey: true, resolvedFactDefinition: { select: { id: true } } } },
      },
    }),
  ]);
  if (!requirementVersion || !rule) {
    throw new Error('Approved evaluation inputs disappeared during snapshot creation.');
  }
  const built = buildRequirementApplicabilitySnapshot({ evaluationInput: input, evaluation, requirementVersion, rule });
  const existing = await tx.requirementApplicability.findMany({
    where: {
      clientId: input.clientId,
      requirementVersionId: input.requirementVersionId,
      ruleVersionId: input.ruleVersionId,
      scopeType: input.scope.scopeType,
      factSubjectId: input.scope.factSubjectId ?? null,
    },
    select: { id: true, snapshotJson: true },
    orderBy: { createdAt: 'asc' },
  });
  const state = logicalState(built.payload);
  const duplicate = existing.find((row) => sameLogicalState(row, state));
  if (duplicate) {
    const applicability = await tx.requirementApplicability.findUniqueOrThrow({
      where: { id: duplicate.id },
      include: { facts: true },
    });
    return { applicability, evaluation, deduplicated: true };
  }
  const applicability = await tx.requirementApplicability.create({
    data: {
      clientId: input.clientId,
      requirementVersionId: input.requirementVersionId,
      ruleVersionId: input.ruleVersionId,
      ruleDigest: rule.canonicalDigest,
      outcome: evaluation.outcome,
      scopeType: input.scope.scopeType,
      factSubjectId: input.scope.factSubjectId ?? null,
      evaluationAt: input.scope.evaluationAt,
      referencePeriodStart: input.scope.referencePeriod?.start ?? null,
      referencePeriodEnd: input.scope.referencePeriod?.end ?? null,
      sourceSupportState: requirementVersion.sourceSupportState,
      specialistRequirement: requirementVersion.specialistRequirement,
      specialistDomainCode: requirementVersion.specialistDomainCode,
      schemaVersion: REQUIREMENT_APPLICABILITY_SCHEMA_VERSION,
      snapshotJson: built.payload as unknown as Prisma.InputJsonValue,
      snapshotDigest: built.snapshotDigest,
      facts: {
        create: built.valueDigests.map((fact) => ({
          clientFactId: fact.clientFactId,
          factDefinitionId: fact.factDefinitionId,
          factKey: fact.factKey,
          normalizedValueDigest: fact.normalizedValueDigest,
        })),
      },
    },
    include: { facts: true },
  });
  return { applicability, evaluation, deduplicated: false };
}

export async function createRequirementApplicability(
  input: ComplianceEvaluationInput,
  db: PrismaClient = new PrismaClient(),
) {
  return db.$transaction((tx) => createRequirementApplicabilityInTx(input, tx), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
