import { Prisma, PrismaClient } from '@prisma/client';
import { InteractionError } from '../client-interaction/base';
import {
  assertFactSubjectScope,
  serializeFactValue,
  validateTypedFactValue,
} from '../compliance-foundation/service';
import { createRequirementApplicabilityInTx } from './requirementApplicabilityService';
import {
  FindingMaterializationIdentityConflictError,
  materializeRequirementApplicabilityFindingInTx,
} from './findingMaterializationService';
import { EffectiveRequirementRuleError, resolveEffectiveRequirementRuleVersion } from './effectiveRequirementRuleResolver';

type TransactionClient = Prisma.TransactionClient;

export interface TypedFactMutationContext {
  tx: TransactionClient;
  clientId: string;
  factDefinitionId: string;
  factKey: string;
  scopeType: string;
  factSubjectId: string | null;
  changeKind: 'CREATE';
  actorUserId: string;
}

export interface TypedFactMutationInput {
  clientId: string;
  factDefinitionId: string;
  actorUserId: string;
  input: Record<string, unknown>;
  verificationStatus?: 'UNVERIFIED' | 'CLIENT_PROVIDED' | 'DOCUMENT_VERIFIED' | 'LAW_FIRM_VERIFIED';
}

const SCOPE_TYPES = new Set([
  'COMPANY', 'WORKPLACE_SITE', 'EMPLOYEE', 'EVENT', 'SALES_CHANNEL',
  'PRODUCT_SERVICE', 'CONTRACT', 'TAX_PERIOD', 'TRANSACTION', 'REPORTING_EVENT',
]);

function asDate(value: unknown, field: string, required = false): Date | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new InteractionError(400, 'FACT_TEMPORAL_VALUE_REQUIRED', `${field} is required for this temporal policy.`);
    return null;
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new InteractionError(400, 'FACT_TEMPORAL_VALUE_INVALID', `${field} must be a valid date.`);
  return date;
}

function assertScopeType(value: unknown): string {
  const scopeType = String(value || '');
  if (!SCOPE_TYPES.has(scopeType)) throw new InteractionError(400, 'FACT_SCOPE_INVALID', 'scopeType is invalid.');
  return scopeType;
}

function intervalsOverlap(leftFrom: Date, leftTo: Date | null, rightFrom: Date, rightTo: Date | null): boolean {
  return (leftTo === null || rightFrom < leftTo) && (rightTo === null || leftFrom < rightTo);
}

function isRetryable(error: unknown): boolean {
  if (error instanceof FindingMaterializationIdentityConflictError) return true;
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

function temporalValues(definition: { temporalPolicy: string }, input: Record<string, unknown>): {
  validFrom: Date;
  validTo: Date | null;
  observedAt: Date | null;
  effectiveAt: Date | null;
  referencePeriodStart: Date | null;
  referencePeriodEnd: Date | null;
  evaluationAt: Date;
} {
  const validFrom = asDate(input.validFrom, 'validFrom') ?? new Date();
  const validTo = asDate(input.validTo, 'validTo');
  if (validTo && validTo < validFrom) throw new InteractionError(400, 'FACT_VALIDITY_INVALID', 'validTo must be on or after validFrom.');
  const observedAt = asDate(input.observedAt, 'observedAt', definition.temporalPolicy === 'OBSERVATION');
  const effectiveAt = asDate(input.effectiveAt, 'effectiveAt', definition.temporalPolicy === 'EFFECTIVE_INSTANT');
  const referencePeriodStart = asDate(input.referencePeriodStart, 'referencePeriodStart', definition.temporalPolicy === 'REFERENCE_PERIOD');
  const referencePeriodEnd = asDate(input.referencePeriodEnd, 'referencePeriodEnd', definition.temporalPolicy === 'REFERENCE_PERIOD');
  if (referencePeriodStart && referencePeriodEnd && referencePeriodStart > referencePeriodEnd) {
    throw new InteractionError(400, 'FACT_REFERENCE_PERIOD_INVALID', 'referencePeriodStart must not be after referencePeriodEnd.');
  }
  return {
    validFrom,
    validTo,
    observedAt,
    effectiveAt,
    referencePeriodStart,
    referencePeriodEnd,
    evaluationAt: asDate(input.evaluationAt, 'evaluationAt') ?? new Date(),
  };
}

async function assertSourceDocumentInClient(tx: TransactionClient, clientId: string, sourceDocumentVersionId: string | null): Promise<void> {
  if (!sourceDocumentVersionId) return;
  const found = await tx.documentVersion.findFirst({
    where: { id: sourceDocumentVersionId, document: { clientId } },
    select: { id: true },
  });
  if (!found) throw new InteractionError(400, 'EVIDENCE_CROSS_CLIENT', 'Referenced document version does not belong to this client.');
}

async function isClientEnrolledForCompliance(tx: TransactionClient, clientId: string): Promise<boolean> {
  const profile = await tx.clientOperatingProfile.findUnique({
    where: { clientId },
    select: { complianceEnrollmentStatus: true },
  });
  return profile?.complianceEnrollmentStatus === 'ENROLLED';
}

export async function createTypedFactInTx(input: TypedFactMutationInput, tx: TransactionClient) {
  const definition = await tx.factDefinition.findUnique({ where: { id: input.factDefinitionId } });
  if (!definition) throw new InteractionError(404, 'FACT_DEFINITION_NOT_FOUND', 'FactDefinition was not found.');
  if (definition.status === 'RETIRED') throw new InteractionError(409, 'FACT_DEFINITION_RETIRED', 'Retired FactDefinitions cannot receive new facts.');

  const scopeType = assertScopeType(input.input.scopeType);
  const factSubjectId = input.input.factSubjectId ? String(input.input.factSubjectId) : null;
  const subject = factSubjectId
    ? await tx.factSubject.findUnique({ where: { id: factSubjectId }, select: { id: true, clientId: true, scopeType: true } })
    : null;
  assertFactSubjectScope(definition, subject, input.clientId, scopeType);
  const typed = validateTypedFactValue(definition, input.input);
  const value = serializeFactValue(definition, typed);
  const temporal = temporalValues(definition, input.input);
  const sourceDocumentVersionId = input.input.sourceDocumentVersionId ? String(input.input.sourceDocumentVersionId) : null;
  await assertSourceDocumentInClient(tx, input.clientId, sourceDocumentVersionId);

  if (definition.overlapPolicy === 'DISALLOW') {
    const active = await tx.clientFact.findMany({
      where: { clientId: input.clientId, factDefinitionId: definition.id, scopeType: scopeType as any, factSubjectId, supersededAt: null },
      select: { validFrom: true, validTo: true },
    });
    if (active.some((row) => intervalsOverlap(temporal.validFrom, temporal.validTo, row.validFrom, row.validTo))) {
      throw new InteractionError(409, 'FACT_OVERLAP_CONFLICT', 'An active fact already overlaps this FactDefinition and scope.');
    }
  }

  const fact = await tx.clientFact.create({
    data: {
      clientId: input.clientId,
      type: definition.key,
      value,
      factDefinitionId: definition.id,
      factSubjectId,
      scopeType: scopeType as any,
      booleanValue: (typed.booleanValue as boolean | undefined) ?? null,
      numberValue: typed.numberValue !== undefined ? new Prisma.Decimal(String(typed.numberValue)) : null,
      stringValue: (typed.stringValue as string | undefined) ?? null,
      dateValue: (typed.dateValue as Date | string | undefined) ?? null,
      datetimeValue: (typed.datetimeValue as Date | string | undefined) ?? null,
      moneyAmount: typed.moneyAmount !== undefined ? new Prisma.Decimal(String(typed.moneyAmount)) : null,
      moneyCurrency: (typed.moneyCurrency as string | undefined) ?? null,
      enumValue: (typed.enumValue as string | undefined) ?? null,
      jsonValue: typed.jsonValue as Prisma.InputJsonValue | undefined,
      validFrom: temporal.validFrom,
      validTo: temporal.validTo,
      observedAt: temporal.observedAt,
      effectiveAt: temporal.effectiveAt,
      referencePeriodStart: temporal.referencePeriodStart,
      referencePeriodEnd: temporal.referencePeriodEnd,
      determinationMethod: definition.determinationMethod,
      sourceReference: input.input.sourceReference ? String(input.input.sourceReference) : null,
      sourceDocumentVersionId,
      verificationStatus: input.verificationStatus ?? 'UNVERIFIED',
    },
    include: { factDefinition: { select: { valueType: true } } },
  });

  if (!(await isClientEnrolledForCompliance(tx, input.clientId))) {
    return { fact, evaluations: [] };
  }

  const dependencies = await tx.applicabilityRuleFactDependency.findMany({
    where: {
      resolvedFactDefinitionId: definition.id,
      applicabilityRuleVersion: {
        status: 'APPROVED',
        supersededById: null,
        requirementVersion: { status: 'APPROVED', requirementId: { not: '' } },
      },
    },
    select: {
      applicabilityRuleVersion: { select: { requirementVersion: { select: { requirementId: true } } } },
    },
  });
  const requirementIds = [...new Set(dependencies.map((row) => row.applicabilityRuleVersion.requirementVersion.requirementId))];
  const context: TypedFactMutationContext = {
    tx,
    clientId: input.clientId,
    factDefinitionId: definition.id,
    factKey: definition.key,
    scopeType,
    factSubjectId,
    changeKind: 'CREATE',
    actorUserId: input.actorUserId,
  };
  const evaluations = [] as Array<{ ruleVersionId: string; applicabilityId: string; findingId: string | null; outcome: string }>;
  for (const requirementId of requirementIds) {
    let rule;
    try {
      rule = await resolveEffectiveRequirementRuleVersion(requirementId, temporal.evaluationAt, tx);
    } catch (error) {
      if (error instanceof EffectiveRequirementRuleError && ['NO_EFFECTIVE_REQUIREMENT_VERSION', 'NO_CURRENT_APPROVED_RULE_VERSION', 'RULE_SCOPE_UNRESOLVED'].includes(error.code)) continue;
      throw error;
    }
    if (rule.evaluationScopeType !== scopeType) continue;
    const dependsOnMutatedFact = await tx.applicabilityRuleFactDependency.findFirst({
      where: { applicabilityRuleVersionId: rule.ruleVersionId, resolvedFactDefinitionId: definition.id },
      select: { id: true },
    });
    if (!dependsOnMutatedFact) continue;
    const snapshot = await createRequirementApplicabilityInTx({
      requirementVersionId: rule.requirementVersionId,
      ruleVersionId: rule.ruleVersionId,
      clientId: context.clientId,
      scope: {
        scopeType: scopeType as any,
        factSubjectId: factSubjectId ?? undefined,
        evaluationAt: temporal.evaluationAt,
        ...(temporal.referencePeriodStart && temporal.referencePeriodEnd
          ? { referencePeriod: { start: temporal.referencePeriodStart, end: temporal.referencePeriodEnd } }
          : {}),
      },
    }, tx);
    const materialized = await materializeRequirementApplicabilityFindingInTx({
      applicabilityId: snapshot.applicability.id,
      createdByUserId: input.actorUserId,
    }, tx);
    evaluations.push({
      ruleVersionId: rule.ruleVersionId,
      applicabilityId: snapshot.applicability.id,
      findingId: materialized.finding?.id ?? null,
      outcome: materialized.outcome,
    });
  }
  return { fact, evaluations };
}

/** Creates a typed fact and synchronously refreshes every dependent approved rule. */
export async function createTypedFactAndEvaluate(
  input: TypedFactMutationInput,
  db: PrismaClient,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction((tx) => createTypedFactInTx(input, tx), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isRetryable(error) || attempt === 2) throw error;
    }
  }
  throw new Error('Typed fact mutation transaction exhausted its retry budget.');
}
