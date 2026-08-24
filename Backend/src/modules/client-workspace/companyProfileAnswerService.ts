import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { createTypedFactInTx, reevaluateTypedFactInTx } from '../compliance/typedFactMutationService';
import { getCompanyProfileQuestion, COMPANY_PROFILE_QUESTIONS } from './companyProfileQuestionRegistry';
import { addPortalResponsibility } from '../client-organization/service';

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

const WRITE_ROLES = new Set(['REPRESENTATIVE', 'APPROVER']);
const ANSWER_STATUSES = new Set(['ANSWERED', 'UNKNOWN']);

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
  if (fact.dateValue !== null) return fact.dateValue.toISOString();
  if (fact.datetimeValue !== null) return fact.datetimeValue.toISOString();
  return fact.enumValue;
}

export async function getCompanyProfileDiscovery(identityId: string, workspaceId: string, db: Db = defaultPrisma) {
  const workspace = await workspaceContext(identityId, workspaceId, db, false);
  const definitions = await db.factDefinition.findMany({ where: { key: { in: COMPANY_PROFILE_QUESTIONS.map((q) => q.factDefinitionKey) }, status: 'ACTIVE' } });
  const definitionsByKey = new Map(definitions.map((definition) => [definition.key, definition]));
  const states = await db.clientFactAnswerState.findMany({
    where: { clientId: workspace.clientId, scopeType: 'COMPANY', factSubjectId: null, factDefinitionId: { in: definitions.map((d) => d.id) } },
    include: { currentFact: { select: { numberValue: true, stringValue: true, booleanValue: true, dateValue: true, datetimeValue: true, enumValue: true } } },
  });
  const stateByDefinition = new Map(states.map((state) => [state.factDefinitionId, state]));
  return {
    client: { name: (await db.client.findUnique({ where: { id: workspace.clientId }, select: { name: true } }))?.name || null },
    questions: COMPANY_PROFILE_QUESTIONS.flatMap((question) => {
      const definition = definitionsByKey.get(question.factDefinitionKey);
      if (!definition) return [];
      const state = stateByDefinition.get(definition.id);
      return [{ questionKey: question.questionKey, label: question.label, status: state?.status || 'UNANSWERED', value: state?.currentFact ? typedValue(state.currentFact) : null }];
    }),
  };
}

async function answerInTx(identityId: string, workspaceId: string, questionKey: string, body: Record<string, unknown>, tx: Tx) {
  const workspace = await workspaceContext(identityId, workspaceId, tx, true);
  const question = getCompanyProfileQuestion(questionKey);
  const status = String(body.status || '').toUpperCase();
  if (!ANSWER_STATUSES.has(status)) error(400, 'CLIENT_PROFILE_ANSWER_STATUS_INVALID', 'Answer status must be ANSWERED or UNKNOWN.');
  const definition = await tx.factDefinition.findUnique({ where: { key: question.factDefinitionKey } });
  if (!definition || definition.status !== 'ACTIVE') error(409, 'CLIENT_PROFILE_QUESTION_UNAVAILABLE', 'The configured company profile question is unavailable.');
  if (definition.valueType !== question.valueType || !definition.allowedScopeTypes.includes(question.scopeType)) error(500, 'CLIENT_PROFILE_QUESTION_MISCONFIGURED', 'The configured company profile question is invalid.');

  const state = await tx.clientFactAnswerState.findFirst({ where: { clientId: workspace.clientId, factDefinitionId: definition.id, scopeType: question.scopeType, factSubjectId: null }, include: { currentFact: { select: { id: true, numberValue: true } } } });
  if (status === 'ANSWERED') {
    const numberValue = body.numberValue;
    if (typeof numberValue !== 'number' || !Number.isFinite(numberValue) || numberValue < 0) error(400, 'CLIENT_PROFILE_ANSWER_INVALID', 'numberValue must be a non-negative finite number.');
    if (state?.status === 'ANSWERED' && state.currentFact && Number(state.currentFact.numberValue) === numberValue) return state;
    // A pre-existing typed fact has no AnswerState by design.  Supersede any
    // active company fact for this explicit definition before the new truth is
    // created so DISALLOW overlap policy cannot turn first discovery into a
    // false conflict.
    await tx.clientFact.updateMany({ where: { clientId: workspace.clientId, factDefinitionId: definition.id, scopeType: 'COMPANY', factSubjectId: null, supersededAt: null }, data: { supersededAt: new Date() } });
    const evaluationAt = new Date();
    // AssessmentFinding currently requires an internal creator. The existing
    // workspace creator is an explicit on-behalf operational actor; the
    // sourceReference remains the authoritative portal identity.
    const created = await createTypedFactInTx({ clientId: workspace.clientId, factDefinitionId: definition.id, actorUserId: workspace.createdById, verificationStatus: 'CLIENT_PROVIDED', input: { scopeType: 'COMPANY', numberValue, validFrom: evaluationAt.toISOString(), observedAt: evaluationAt.toISOString(), evaluationAt: evaluationAt.toISOString(), sourceReference: `CLIENT_PORTAL_IDENTITY:${identityId}` } }, tx);
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
