import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { createTypedFactInTx, reevaluateTypedFactInTx } from '../compliance/typedFactMutationService';
import { getCompanyProfileQuestion, getCompanyProfileQuestionForDefinition, COMPANY_PROFILE_QUESTIONS, type CompanyProfileQuestion } from './companyProfileQuestionRegistry';
import { addPortalResponsibility } from '../client-organization/service';

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

const WRITE_ROLES = new Set(['REPRESENTATIVE', 'APPROVER']);
const ANSWER_STATUSES = new Set(['ANSWERED', 'UNKNOWN']);
const MAX_PROFILE_STRING_LENGTH = 500;

function error(status: number, code: string, message: string): never {
  throw Object.assign(new Error(message), { status, code });
}

async function workspaceContext(identityId: string, workspaceId: string, db: Db | Tx, write: boolean) {
  const now = new Date();
  const membership = await db.clientPortalWorkspaceMembership.findFirst({
    where: { clientPortalIdentityId: identityId, workspaceId, status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    select: { id: true, role: true },
  });
  if (!membership) error(403, 'CLIENT_WORKSPACE_FORBIDDEN', 'The selected workspace is not available.');
  if (write && !WRITE_ROLES.has(String(membership.role))) error(403, 'CLIENT_PROFILE_WRITE_FORBIDDEN', 'Company profile answers require representative or approver authority.');
  const workspace = await db.clientPortalWorkspace.findFirst({
    where: { id: workspaceId, status: 'ACTIVE', mode: 'ORGANIZATION' },
    select: { id: true, clientId: true, createdById: true },
  });
  if (!workspace) error(403, 'CLIENT_WORKSPACE_FORBIDDEN', 'The selected organization workspace is not available.');
  return { ...workspace, membershipRole: String(membership.role) };
}

function typedValue(fact: { numberValue: Prisma.Decimal | null; stringValue: string | null; booleanValue: boolean | null; dateValue: Date | null; datetimeValue: Date | null; enumValue: string | null }) {
  if (fact.numberValue !== null) return Number(fact.numberValue);
  if (fact.stringValue !== null) return fact.stringValue;
  if (fact.booleanValue !== null) return fact.booleanValue;
  if (fact.dateValue !== null) return fact.dateValue.toISOString().slice(0, 10);
  if (fact.datetimeValue !== null) return fact.datetimeValue.toISOString();
  return fact.enumValue;
}

function answerInput(question: CompanyProfileQuestion, body: Record<string, unknown>, definition: { allowedEnumValues: unknown }): Record<string, unknown> {
  switch (question.valueType) {
    case 'NUMBER': return { numberValue: body.numberValue };
    case 'BOOLEAN': return { booleanValue: body.booleanValue };
    case 'STRING': {
      if (typeof body.stringValue !== 'string') error(400, 'CLIENT_PROFILE_ANSWER_INVALID', 'stringValue must be a string.');
      const value = body.stringValue.trim();
      if (!value || value.length > MAX_PROFILE_STRING_LENGTH) error(400, 'CLIENT_PROFILE_ANSWER_INVALID', `stringValue must contain 1-${MAX_PROFILE_STRING_LENGTH} characters after trimming.`);
      return { stringValue: value };
    }
    case 'ENUM': {
      if (typeof body.enumValue !== 'string') error(400, 'CLIENT_PROFILE_ANSWER_INVALID', 'enumValue must be a string.');
      const configuredOptions = question.enumOptions?.length ? [...question.enumOptions] : allowedEnumValues(definition.allowedEnumValues);
      if (!configuredOptions.length) error(400, 'CLIENT_PROFILE_ANSWER_INVALID', 'enumValue is unavailable because no approved options are configured.');
      if (!configuredOptions.includes(body.enumValue)) error(400, 'CLIENT_PROFILE_ANSWER_INVALID', 'enumValue is not an allowed option.');
      return { enumValue: body.enumValue };
    }
    case 'DATE': {
      if (typeof body.dateValue !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.dateValue)) error(400, 'CLIENT_PROFILE_ANSWER_INVALID', 'dateValue must be a valid YYYY-MM-DD date.');
      const [year, month, day] = body.dateValue.split('-').map(Number);
      const candidate = new Date(Date.UTC(year, month - 1, day));
      if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) error(400, 'CLIENT_PROFILE_ANSWER_INVALID', 'dateValue must be a valid YYYY-MM-DD date.');
      return { dateValue: body.dateValue };
    }
    default: return {};
  }
}

function allowedEnumValues(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function snapshotMissingFactKeys(snapshotJson: unknown): string[] {
  if (!snapshotJson || typeof snapshotJson !== 'object') return [];
  const value = (snapshotJson as { missingFactKeys?: unknown }).missingFactKeys;
  return Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string') : [];
}

function latestCurrentSnapshots<T extends { requirementVersionId: string; ruleVersionId: string; scopeType: string; factSubjectId: string | null }>(snapshots: T[]): T[] {
  const current = new Map<string, T>();
  for (const snapshot of snapshots) {
    const logicalScope = [snapshot.requirementVersionId, snapshot.ruleVersionId, snapshot.scopeType, snapshot.factSubjectId ?? ''].join('|');
    if (!current.has(logicalScope)) current.set(logicalScope, snapshot);
  }
  return [...current.values()];
}

export async function getCompanyProfileDiscovery(identityId: string, workspaceId: string, db: Db = defaultPrisma) {
  const workspace = await workspaceContext(identityId, workspaceId, db, false);
  const now = new Date();
  const definitions = await db.factDefinition.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { key: { in: COMPANY_PROFILE_QUESTIONS.map((q) => q.factDefinitionKey) } },
        { questionKey: { in: COMPANY_PROFILE_QUESTIONS.map((q) => q.questionKey) } },
      ],
    },
  });
  const snapshots = await db.requirementApplicability.findMany({
    where: {
      clientId: workspace.clientId,
      scopeType: 'COMPANY',
      requirementVersion: { status: 'APPROVED', effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
      ruleVersion: { status: 'APPROVED', supersededById: null },
    },
    orderBy: [{ evaluationAt: 'desc' }, { createdAt: 'desc' }],
    select: { requirementVersionId: true, ruleVersionId: true, scopeType: true, factSubjectId: true, outcome: true, snapshotJson: true },
  });
  const currentSnapshots = latestCurrentSnapshots(snapshots);
  const missingFactKeys = new Set(currentSnapshots
    .filter((snapshot) => String(snapshot.outcome) === 'INSUFFICIENT_FACTS')
    .flatMap((snapshot) => snapshotMissingFactKeys(snapshot.snapshotJson)));
  const missingDependencies = missingFactKeys.size
    ? await db.applicabilityRuleFactDependency.findMany({
      where: { applicabilityRuleVersionId: { in: [...new Set(currentSnapshots.map((snapshot) => snapshot.ruleVersionId))] }, factKey: { in: [...missingFactKeys] } },
      select: { factKey: true, resolvedFactDefinition: { select: { id: true, key: true, questionKey: true, valueType: true, status: true, allowedScopeTypes: true, allowedEnumValues: true } } },
    })
    : [];
  const definitionsById = new Map<string, typeof definitions[number]>();
  for (const definition of definitions) {
    const question = getCompanyProfileQuestionForDefinition(definition);
    if (question?.baseline) definitionsById.set(definition.id, definition);
  }
  for (const dependency of missingDependencies) {
    const definition = dependency.resolvedFactDefinition;
    if (definition && definition.status === 'ACTIVE' && definition.allowedScopeTypes.includes('COMPANY')) {
      definitionsById.set(definition.id, definition as typeof definitions[number]);
    }
  }
  const questionByDefinitionId = new Map<string, CompanyProfileQuestion>();
  for (const definition of definitionsById.values()) {
    const question = getCompanyProfileQuestionForDefinition(definition);
    if (question && definition.allowedScopeTypes.includes(question.scopeType)) questionByDefinitionId.set(definition.id, question);
  }
  const answerableDefinitions = [...questionByDefinitionId.keys()];
  const definitionsByKey = new Map(definitions.map((definition) => [definition.key, definition]));
  const states = await db.clientFactAnswerState.findMany({
    where: { clientId: workspace.clientId, scopeType: 'COMPANY', factSubjectId: null, factDefinitionId: { in: answerableDefinitions } },
    include: { currentFact: { select: { numberValue: true, stringValue: true, booleanValue: true, dateValue: true, datetimeValue: true, enumValue: true } } },
  });
  const stateByDefinition = new Map(states.map((state) => [state.factDefinitionId, state]));
  const fallbackFacts = await db.clientFact.findMany({
    where: { clientId: workspace.clientId, factDefinitionId: { in: answerableDefinitions }, scopeType: 'COMPANY', factSubjectId: null, supersededAt: null, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
    select: { id: true, factDefinitionId: true, numberValue: true, stringValue: true, booleanValue: true, dateValue: true, datetimeValue: true, enumValue: true, observedAt: true, effectiveAt: true },
  });
  const fallbackByDefinition = new Map<string, typeof fallbackFacts>();
  for (const fact of fallbackFacts) fallbackByDefinition.set(fact.factDefinitionId, [...(fallbackByDefinition.get(fact.factDefinitionId) ?? []), fact]);
  return {
    client: { name: (await db.client.findUnique({ where: { id: workspace.clientId }, select: { name: true } }))?.name || null },
    questions: [...questionByDefinitionId.entries()].flatMap(([definitionId, question]) => {
      const definition = definitionsById.get(definitionId) || definitionsByKey.get(question.factDefinitionKey);
      if (!definition) return [];
      const state = stateByDefinition.get(definition.id);
      const fallback = !state ? fallbackByDefinition.get(definition.id) : undefined;
      const fallbackFact = fallback?.length === 1 && (
        definition.temporalPolicy === 'VALIDITY_INTERVAL'
        || (definition.temporalPolicy === 'OBSERVATION' && fallback[0].observedAt !== null && fallback[0].observedAt <= now)
        || (definition.temporalPolicy === 'EFFECTIVE_INSTANT' && fallback[0].effectiveAt !== null && fallback[0].effectiveAt <= now)
      ) ? fallback[0] : undefined;
      const options = question.enumOptions?.length ? [...question.enumOptions] : allowedEnumValues(definition.allowedEnumValues);
      return [{ questionKey: question.questionKey, label: question.label, helpText: question.helpText || null, section: question.section, valueType: question.valueType, options, order: question.order, status: state?.status || (fallbackFact ? 'ANSWERED' : 'UNANSWERED'), value: state?.currentFact ? typedValue(state.currentFact) : (fallbackFact ? typedValue(fallbackFact) : null) }];
    }).sort((left, right) => left.section.localeCompare(right.section) || left.order - right.order || left.label.localeCompare(right.label) || left.questionKey.localeCompare(right.questionKey)),
  };
}

async function answerInTx(identityId: string, workspaceId: string, questionKey: string, body: Record<string, unknown>, tx: Tx) {
  const workspace = await workspaceContext(identityId, workspaceId, tx, true);
  const question = getCompanyProfileQuestion(questionKey);
  const status = String(body.status || '').toUpperCase();
  if (!ANSWER_STATUSES.has(status)) error(400, 'CLIENT_PROFILE_ANSWER_STATUS_INVALID', 'Answer status must be ANSWERED or UNKNOWN.');
  const definition = await tx.factDefinition.findUnique({ where: { key: question.factDefinitionKey } })
    || await tx.factDefinition.findFirst({ where: { questionKey: question.questionKey, status: 'ACTIVE' } });
  if (!definition || definition.status !== 'ACTIVE') error(409, 'CLIENT_PROFILE_QUESTION_UNAVAILABLE', 'The configured company profile question is unavailable.');
  if (definition.valueType !== question.valueType || !definition.allowedScopeTypes.includes(question.scopeType)) error(500, 'CLIENT_PROFILE_QUESTION_MISCONFIGURED', 'The configured company profile question is invalid.');

  const state = await tx.clientFactAnswerState.findFirst({ where: { clientId: workspace.clientId, factDefinitionId: definition.id, scopeType: question.scopeType, factSubjectId: null }, include: { currentFact: { select: { id: true, numberValue: true, stringValue: true, booleanValue: true, dateValue: true, datetimeValue: true, enumValue: true } } } });
  if (status === 'ANSWERED') {
    const input = answerInput(question, body, definition);
    if (question.valueType === 'NUMBER' && (typeof input.numberValue !== 'number' || !Number.isFinite(input.numberValue) || Number(input.numberValue) < 0)) error(400, 'CLIENT_PROFILE_ANSWER_INVALID', 'numberValue must be a non-negative finite number.');
    if (question.valueType === 'BOOLEAN' && typeof input.booleanValue !== 'boolean') error(400, 'CLIENT_PROFILE_ANSWER_INVALID', 'booleanValue must be boolean.');
    const existingValue = state?.currentFact ? typedValue(state.currentFact) : null;
    const requestedValue = Object.values(input)[0] ?? null;
    if (state?.status === 'ANSWERED' && existingValue === requestedValue) return state;
    // A pre-existing typed fact has no AnswerState by design.  Supersede any
    // active company fact for this explicit definition before the new truth is
    // created so DISALLOW overlap policy cannot turn first discovery into a
    // false conflict.
    await tx.clientFact.updateMany({ where: { clientId: workspace.clientId, factDefinitionId: definition.id, scopeType: 'COMPANY', factSubjectId: null, supersededAt: null }, data: { supersededAt: new Date() } });
    const evaluationAt = new Date();
    // AssessmentFinding currently requires an internal creator. The existing
    // workspace creator is an explicit on-behalf operational actor; the
    // sourceReference remains the authoritative portal identity.
    const created = await createTypedFactInTx({ clientId: workspace.clientId, factDefinitionId: definition.id, actorUserId: workspace.createdById, verificationStatus: 'CLIENT_PROVIDED', input: { scopeType: 'COMPANY', ...input, validFrom: evaluationAt.toISOString(), observedAt: evaluationAt.toISOString(), evaluationAt: evaluationAt.toISOString(), sourceReference: `CLIENT_PORTAL_IDENTITY:${identityId}` } }, tx);
    return state
      ? tx.clientFactAnswerState.update({ where: { id: state.id }, data: { status: 'ANSWERED', currentFactId: created.fact.id } })
      : tx.clientFactAnswerState.create({ data: { clientId: workspace.clientId, factDefinitionId: definition.id, scopeType: 'COMPANY', status: 'ANSWERED', currentFactId: created.fact.id } });
  }
  await tx.clientFact.updateMany({ where: { clientId: workspace.clientId, factDefinitionId: definition.id, scopeType: 'COMPANY', factSubjectId: null, supersededAt: null }, data: { supersededAt: new Date() } });
  await reevaluateTypedFactInTx({ clientId: workspace.clientId, factDefinitionId: definition.id, actorUserId: workspace.createdById, scopeType: 'COMPANY', factSubjectId: null, evaluationAt: new Date() }, tx);
  return state
    ? tx.clientFactAnswerState.update({ where: { id: state.id }, data: { status: 'UNKNOWN', currentFactId: null } })
    : tx.clientFactAnswerState.create({ data: { clientId: workspace.clientId, factDefinitionId: definition.id, scopeType: 'COMPANY', status: 'UNKNOWN' } });
}

export async function answerCompanyProfileQuestion(identityId: string, workspaceId: string, questionKey: string, body: Record<string, unknown>, db: Db = defaultPrisma) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const state = await db.$transaction((tx) => answerInTx(identityId, workspaceId, questionKey, body, tx), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return { questionKey, status: state.status, answered: state.status === 'ANSWERED' };
    } catch (caught) {
      if (caught instanceof Prisma.PrismaClientKnownRequestError && caught.code === 'P2034' && attempt < 2) continue;
      if (caught instanceof Prisma.PrismaClientKnownRequestError && caught.code === 'P2002') error(409, 'CLIENT_PROFILE_CONCURRENT_UPDATE', 'The company profile changed concurrently; retry the answer.');
      throw caught;
    }
  }
  throw new Error('Company profile answer transaction exhausted its retry budget.');
}

export async function assignCompanyProfileResponsibility(identityId: string, workspaceId: string, body: Record<string, unknown>, db: Db = defaultPrisma) {
  const workspace = await workspaceContext(identityId, workspaceId, db, true);
  if (workspace.membershipRole !== 'APPROVER') error(403, 'ORGANIZATION_RESPONSIBILITY_FORBIDDEN', 'Only an approved organization approver may assign responsibility.');
  const personId = String(body.organizationPersonId || '');
  if (!personId) error(400, 'PERSON_REQUIRED', 'organizationPersonId is required.');
  return addPortalResponsibility(workspace.clientId, personId, body, db);
}
