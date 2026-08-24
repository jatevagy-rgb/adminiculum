import { Prisma, PrismaClient, ComplianceProposalKind, ComplianceProposalStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { InteractionError, InternalActor, assertClientReadAccess, assertInternalCaseAccess, requireInternal, safeText } from '../client-interaction/base';
import { ACTION_INTENT_BY_KIND, COMPLIANCE_ACTION_INTENT_KEYS, COMPLIANCE_PROPOSAL_KINDS, isCompatibleActionIntent } from './complianceProposalRegistry';

type Db = PrismaClient | Prisma.TransactionClient;
type Actor = InternalActor;

const MUTATION_ROLES = new Set(['ADMIN', 'PARTNER', 'LAWYER', 'COLLAB_LAWYER']);

const proposalInclude = {
  assignee: { select: { id: true, name: true, email: true, role: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  confirmedBy: { select: { id: true, name: true, email: true } },
  finding: { select: { id: true, title: true, status: true, scopeType: true, factSubjectId: true, requirementApplicabilityId: true } },
  case: { select: { id: true, caseNumber: true, title: true, clientId: true } },
  task: { select: { id: true, title: true, status: true, caseId: true } },
} satisfies Prisma.ComplianceProposalInclude;

function requireMutationActor(actor: Actor): void {
  requireInternal(actor);
  if (!actor?.userId || !MUTATION_ROLES.has(String(actor.role || ''))) {
    throw new InteractionError(403, 'PROPOSAL_AUTHORIZATION_FORBIDDEN', 'Only authorized workforce users may change compliance proposals.');
  }
}

function normalizeKind(value: unknown): ComplianceProposalKind {
  const kind = String(value || '').trim().toUpperCase() as ComplianceProposalKind;
  if (!COMPLIANCE_PROPOSAL_KINDS.includes(kind)) throw new InteractionError(400, 'PROPOSAL_KIND_INVALID', 'Invalid compliance proposal kind.');
  return kind;
}

function normalizeIntent(value: unknown): string {
  const intent = String(value || '').trim();
  if (!COMPLIANCE_ACTION_INTENT_KEYS.includes(intent as never)) throw new InteractionError(400, 'PROPOSAL_ACTION_INTENT_INVALID', 'Invalid compliance action intent.');
  return intent;
}

function parseDeadline(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new InteractionError(400, 'PROPOSAL_DEADLINE_INVALID', 'Deadline must be a valid date.');
  return parsed;
}

function mapProposalError(error: unknown): never {
  if (error instanceof InteractionError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new InteractionError(409, 'PROPOSAL_ALREADY_ACTIVE', 'An active proposal with this identity already exists.');
  }
  throw error;
}

function isSerializationFailure(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2034' || String((error.meta as { code?: unknown } | undefined)?.code || '') === '40001';
  }
  const candidate = error as { code?: unknown; message?: unknown } | null;
  return String(candidate?.code || '') === '40001' || String(candidate?.message || '').includes('could not serialize access');
}

function dto(row: any): any {
  return {
    id: row.id,
    clientId: row.clientId,
    findingId: row.findingId,
    proposalKind: row.proposalKind,
    actionIntentKey: row.actionIntentKey,
    case: row.case ? { id: row.case.id, caseNumber: row.case.caseNumber, title: row.case.title } : null,
    title: row.title,
    description: row.description,
    suggestedAction: row.suggestedAction,
    assignee: row.assignee,
    deadline: row.deadline?.toISOString?.() ?? null,
    status: row.status,
    findingStatusAtProposal: row.findingStatusAtProposal,
    taskId: row.taskId,
    task: row.task,
    createdBy: row.createdBy,
    confirmedBy: row.confirmedBy,
    confirmedAt: row.confirmedAt?.toISOString?.() ?? null,
    confirmedCaseId: row.confirmedCaseId,
    createdAt: row.createdAt?.toISOString?.() ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
  };
}

async function loadProposal(id: string, db: Db): Promise<any> {
  const row = await db.complianceProposal.findUnique({ where: { id }, include: proposalInclude });
  if (!row) throw new InteractionError(404, 'PROPOSAL_NOT_FOUND', 'Compliance proposal not found.');
  return row;
}

async function assertAssignee(id: string | null | undefined, db: Db): Promise<void> {
  if (!id) return;
  const user = await db.user.findUnique({ where: { id }, select: { id: true, role: true, status: true, isActive: true } });
  if (!user || user.isActive === false || String(user.status) !== 'ACTIVE' || !MUTATION_ROLES.has(String(user.role))) {
    throw new InteractionError(400, 'PROPOSAL_ASSIGNEE_INVALID', 'Proposal assignee must be an active workforce user.');
  }
}

async function assertCaseForClient(actor: Actor, caseId: string, clientId: string, db: Db): Promise<void> {
  const authorizedCase = await assertInternalCaseAccess(actor, caseId, db as PrismaClient);
  if (authorizedCase.clientId !== clientId) throw new InteractionError(409, 'PROPOSAL_CASE_CLIENT_MISMATCH', 'Case belongs to another client.');
}

export async function listProposals(actor: Actor, filters: { clientId?: string; status?: string; caseId?: string } = {}, db: PrismaClient = defaultPrisma): Promise<any[]> {
  requireInternal(actor);
  if (!filters.clientId && !filters.caseId) throw new InteractionError(400, 'PROPOSAL_SCOPE_REQUIRED', 'clientId or caseId is required.');
  if (filters.caseId) {
    const caseAccess = await assertInternalCaseAccess(actor, filters.caseId, db);
    if (filters.clientId && filters.clientId !== caseAccess.clientId) throw new InteractionError(403, 'CLIENT_ACCESS_FORBIDDEN', 'Actor cannot access this client.');
  }
  if (filters.clientId) await assertClientReadAccess(actor, filters.clientId, db);
  const rows = await db.complianceProposal.findMany({
    where: {
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
      ...(filters.caseId ? { caseId: filters.caseId } : {}),
      ...(filters.status ? { status: String(filters.status).toUpperCase() as ComplianceProposalStatus } : {}),
    },
    include: proposalInclude,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(dto);
}

export async function createProposal(actor: Actor, input: Record<string, unknown>, db: PrismaClient = defaultPrisma): Promise<any> {
  requireMutationActor(actor);
  const findingId = String(input.findingId || '');
  if (!findingId) throw new InteractionError(400, 'FIELD_REQUIRED', 'findingId is required.');
  const finding = await db.assessmentFinding.findUnique({
    where: { id: findingId },
    select: { id: true, clientId: true, requirementId: true, requirementApplicabilityId: true, status: true },
  });
  if (!finding) throw new InteractionError(404, 'PROPOSAL_FINDING_NOT_FOUND', 'Finding not found.');
  await assertClientReadAccess(actor, finding.clientId, db);
  if (input.clientId !== undefined && String(input.clientId) !== finding.clientId) throw new InteractionError(409, 'PROPOSAL_CLIENT_MISMATCH', 'Finding belongs to another client.');
  if (!finding.requirementId || !finding.requirementApplicabilityId) throw new InteractionError(409, 'PROPOSAL_FINDING_NOT_COMPLIANCE', 'Manual findings cannot become compliance proposals.');
  const kind = normalizeKind(input.proposalKind);
  const actionIntentKey = ACTION_INTENT_BY_KIND[kind];
  if (input.actionIntentKey !== undefined && (!isCompatibleActionIntent(kind, normalizeIntent(input.actionIntentKey)))) {
    throw new InteractionError(400, 'PROPOSAL_ACTION_INTENT_INVALID', 'Action intent does not match proposal kind.');
  }
  const caseId = input.caseId ? String(input.caseId) : null;
  if (caseId) await assertCaseForClient(actor, caseId, finding.clientId, db);
  await assertAssignee(input.assigneeId ? String(input.assigneeId) : null, db);
  const title = safeText(input.title, 'title', 300, true)!;
  const description = safeText(input.description, 'description', 5000);
  const suggestedAction = safeText(input.suggestedAction, 'suggestedAction', 5000);
  const deadline = parseDeadline(input.deadline);
  try {
    const row = await db.complianceProposal.create({
      data: {
        clientId: finding.clientId,
        findingId: finding.id,
        proposalKind: kind,
        actionIntentKey,
        caseId,
        title,
        description,
        suggestedAction,
        assigneeId: input.assigneeId ? String(input.assigneeId) : null,
        deadline: deadline ?? null,
        applicabilityIdAtProposal: finding.requirementApplicabilityId,
        findingStatusAtProposal: finding.status,
        createdByUserId: actor.userId,
      },
      include: proposalInclude,
    });
    return dto(row);
  } catch (error) {
    return mapProposalError(error);
  }
}

export async function updateProposal(actor: Actor, proposalId: string, input: Record<string, unknown>, db: PrismaClient = defaultPrisma): Promise<any> {
  requireMutationActor(actor);
  const existing = await loadProposal(proposalId, db);
  await assertClientReadAccess(actor, existing.clientId, db);
  if (existing.status !== 'PROPOSED') throw new InteractionError(409, 'PROPOSAL_TERMINAL', 'Terminal proposals are immutable.');
  const immutableFields = ['clientId', 'findingId', 'proposalKind', 'actionIntentKey', 'caseId', 'status', 'taskId', 'createdByUserId', 'confirmedById', 'confirmedAt', 'confirmedCaseId', 'applicabilityIdAtProposal', 'findingStatusAtProposal'];
  if (immutableFields.some((field) => Object.prototype.hasOwnProperty.call(input, field))) {
    throw new InteractionError(400, 'PROPOSAL_IMMUTABLE', 'Proposal identity and lifecycle fields cannot be changed.');
  }
  const data: Prisma.ComplianceProposalUpdateInput = {};
  if (input.title !== undefined) data.title = safeText(input.title, 'title', 300, true)!;
  if (input.description !== undefined) data.description = safeText(input.description, 'description', 5000);
  if (input.suggestedAction !== undefined) data.suggestedAction = safeText(input.suggestedAction, 'suggestedAction', 5000);
  if (input.assigneeId !== undefined) {
    const assigneeId = input.assigneeId ? String(input.assigneeId) : null;
    await assertAssignee(assigneeId, db);
    data.assignee = assigneeId ? { connect: { id: assigneeId } } : { disconnect: true };
  }
  if (input.deadline !== undefined) data.deadline = parseDeadline(input.deadline) ?? null;
  try {
    return dto(await db.complianceProposal.update({ where: { id: proposalId }, data, include: proposalInclude }));
  } catch (error) {
    return mapProposalError(error);
  }
}

export async function bindProposalToCase(actor: Actor, proposalId: string, caseId: string, db: PrismaClient = defaultPrisma): Promise<any> {
  requireMutationActor(actor);
  const proposal = await loadProposal(proposalId, db);
  await assertClientReadAccess(actor, proposal.clientId, db);
  if (proposal.status !== 'PROPOSED') throw new InteractionError(409, 'PROPOSAL_TERMINAL', 'Terminal proposals cannot be rebound.');
  await assertCaseForClient(actor, caseId, proposal.clientId, db);
  const active = await db.complianceProposal.findFirst({ where: { findingId: proposal.findingId, proposalKind: proposal.proposalKind, actionIntentKey: proposal.actionIntentKey, caseId, status: 'PROPOSED', NOT: { id: proposalId } }, select: { id: true } });
  if (active) throw new InteractionError(409, 'PROPOSAL_CASE_ALREADY_ACTIVE', 'An active proposal already uses this Case.');
  try {
    return dto(await db.complianceProposal.update({ where: { id: proposalId }, data: { caseId }, include: proposalInclude }));
  } catch (error) {
    return mapProposalError(error);
  }
}

async function confirmTransaction(actor: Actor, proposalId: string, tx: Prisma.TransactionClient): Promise<{ kind: 'CONFIRMED'; task: any } | { kind: 'STALE' }> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "compliance_proposals" WHERE "id" = ${proposalId} FOR UPDATE`;
  if (!locked.length) throw new InteractionError(404, 'PROPOSAL_NOT_FOUND', 'Compliance proposal not found.');
  const proposal = await loadProposal(proposalId, tx);
  await assertClientReadAccess(actor, proposal.clientId, tx as PrismaClient);
  if (proposal.status === 'CONFIRMED' && proposal.taskId) {
    if (!proposal.caseId) throw new InteractionError(409, 'PROPOSAL_TERMINAL', 'Confirmed proposal has no Case.');
    await assertCaseForClient(actor, proposal.caseId, proposal.clientId, tx as PrismaClient);
    return { kind: 'CONFIRMED', task: proposal.task };
  }
  if (proposal.status === 'CONFIRMED') throw new InteractionError(409, 'PROPOSAL_INTEGRITY_ERROR', 'Confirmed proposal is missing its Task link.');
  if (proposal.status === 'REJECTED' || proposal.status === 'STALE') throw new InteractionError(409, 'PROPOSAL_TERMINAL', 'Terminal proposals cannot be confirmed.');
  if (proposal.status !== 'PROPOSED') throw new InteractionError(409, 'PROPOSAL_NOT_PROPOSED', 'Proposal is not available for confirmation.');
  const finding = await tx.assessmentFinding.findUnique({ where: { id: proposal.findingId }, select: { requirementApplicabilityId: true, status: true } });
  if (!finding || finding.requirementApplicabilityId !== proposal.applicabilityIdAtProposal || finding.status !== proposal.findingStatusAtProposal) {
    await tx.complianceProposal.update({ where: { id: proposalId }, data: { status: 'STALE' } });
    return { kind: 'STALE' };
  }
  if (!proposal.caseId) throw new InteractionError(409, 'PROPOSAL_NO_CASE', 'A Case must be linked before confirmation.');
  await assertCaseForClient(actor, proposal.caseId, proposal.clientId, tx as PrismaClient);
  await assertAssignee(proposal.assigneeId, tx);
  const task = await tx.task.create({
    data: {
      caseId: proposal.caseId,
      title: proposal.title,
      description: proposal.description || proposal.suggestedAction,
      taskType: 'OTHER',
      type: 'COMPLIANCE_PROPOSAL',
      status: 'TODO',
      priority: 'MEDIUM',
      assignedToId: proposal.assigneeId,
      assignedById: actor.userId,
      requiredSkills: [],
      dueDate: proposal.deadline,
    },
    select: { id: true, title: true, status: true, caseId: true, type: true, dueDate: true, assignedToId: true },
  });
  await tx.complianceProposal.update({ where: { id: proposalId }, data: { status: 'CONFIRMED', taskId: task.id, confirmedById: actor.userId, confirmedAt: new Date(), confirmedCaseId: proposal.caseId } });
  return { kind: 'CONFIRMED', task };
}

export async function withProposalConfirmationRetry<T>(db: PrismaClient, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await db.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isSerializationFailure(error) && attempt < 3) continue;
      throw error;
    }
  }
  throw new InteractionError(409, 'PROPOSAL_CONFIRMATION_RETRY_EXHAUSTED', 'Proposal confirmation could not be serialized.');
}

export async function confirmProposal(actor: Actor, proposalId: string, db: PrismaClient = defaultPrisma): Promise<any> {
  requireMutationActor(actor);
  const result = await withProposalConfirmationRetry(db, (tx) => confirmTransaction(actor, proposalId, tx));
  if (result.kind === 'STALE') throw new InteractionError(409, 'PROPOSAL_STALE', 'Finding evidence changed; create a new proposal.');
  return result.task;
}

export async function rejectProposal(actor: Actor, proposalId: string, db: PrismaClient = defaultPrisma): Promise<any> {
  requireMutationActor(actor);
  const proposal = await loadProposal(proposalId, db);
  await assertClientReadAccess(actor, proposal.clientId, db);
  if (proposal.status !== 'PROPOSED') throw new InteractionError(409, 'PROPOSAL_TERMINAL', 'Only proposed rows may be rejected.');
  return dto(await db.complianceProposal.update({ where: { id: proposalId }, data: { status: 'REJECTED' }, include: proposalInclude }));
}
