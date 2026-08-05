import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { InteractionError, safeText } from '../client-interaction/base';
import { createPublishedIntakeInformationRequestInTransaction } from '../client-interaction/requestService';
import {
  approveIntakeAndExposeCase,
  approveRequesterAccess,
  IntakeActor,
  IntakeConversionInput,
  publishIntakeInitialSnapshot,
} from './intakeConversionService';
import { requireIntakeCapability } from './intakePolicy';

type Db = typeof defaultPrisma;
const TRIAGE_ROLES = new Set(['ADMIN', 'PARTNER']);
const TRIAGE_ELIGIBLE = new Set(['SUBMITTED', 'TRIAGE_IN_PROGRESS']);

function requireTriage(actor: IntakeActor): void {
  if (!actor.userId || !TRIAGE_ROLES.has(String(actor.role || ''))) throw new InteractionError(403, 'INTAKE_TRIAGE_FORBIDDEN', 'Authorized intake triage role required.');
  requireIntakeCapability();
}

function requireExpected(row: { revision: number }, expected: unknown): void {
  if (expected != null && Number(expected) !== Number(row.revision)) throw new InteractionError(409, 'REVISION_CONFLICT', 'The intake changed. Reload and retry.');
}

async function audit(tx: any, row: any, actor: IntakeActor, action: string, fromStatus: string, toStatus: string) {
  await tx.clientPortalWorkspaceEvent.create({ data: { workspaceId: row.workspaceId, membershipId: row.requesterMembershipId, actorId: actor.userId, action, fromStatus, toStatus, metadataSafe: { intakeId: row.id } } });
}

function transitions(status: string): string[] {
  const matrix: Record<string, string[]> = {
    SUBMITTED: ['start-triage', 'request-more-information', 'decline', 'link-existing-case', 'convert-new-case'],
    TRIAGE_IN_PROGRESS: ['request-more-information', 'decline', 'link-existing-case', 'convert-new-case'],
    MORE_INFORMATION_REQUIRED: [],
    LINKED_TO_EXISTING_CASE: ['approve-requester-access', 'publish-initial-snapshot', 'close'],
    CONVERTED_TO_CASE: ['approve-requester-access', 'publish-initial-snapshot', 'close'],
    CLOSED: [], DECLINED: [], WITHDRAWN: [], DRAFT: [],
  };
  return matrix[status] || [];
}

async function intakeDetailRow(intakeId: string, prisma: Db) {
  const row = await prisma.clientPortalIntakeRequest.findUnique({
    where: { id: intakeId },
    include: { attachments: true, informationRequests: { include: { fields: true, submissions: { include: { fields: true } } }, orderBy: { createdAt: 'desc' } } },
  });
  if (!row) throw new InteractionError(404, 'INTAKE_NOT_FOUND', 'Intake not found.');
  const [membership, workspace, group, linkedCase, events] = await Promise.all([
    prisma.clientPortalWorkspaceMembership.findUnique({ where: { id: row.requesterMembershipId }, select: { id: true, clientPortalIdentityId: true, status: true, role: true } }),
    prisma.clientPortalWorkspace.findUnique({ where: { id: row.workspaceId }, select: { id: true, name: true, clientId: true, mode: true, status: true } }),
    row.organizationGroupId ? prisma.clientOrganizationGroup.findUnique({ where: { id: row.organizationGroupId }, select: { id: true, name: true, clientId: true, workspaceId: true, status: true } }) : null,
    row.linkedCaseId ? prisma.case.findUnique({ where: { id: row.linkedCaseId }, select: { id: true, caseNumber: true, title: true, clientId: true, status: true } }) : null,
    prisma.clientPortalWorkspaceEvent.findMany({ where: { workspaceId: row.workspaceId, metadataSafe: { path: ['intakeId'], equals: row.id } }, orderBy: { createdAt: 'asc' }, select: { id: true, action: true, actorId: true, fromStatus: true, toStatus: true, metadataSafe: true, createdAt: true } }),
  ]);
  const identity = membership ? await prisma.clientPortalIdentity.findUnique({ where: { id: membership.clientPortalIdentityId }, select: { id: true, displayName: true, normalizedEmail: true, accountType: true, status: true } }) : null;
  return {
    id: row.id,
    workspace,
    organizationGroup: group,
    requester: identity,
    requesterMembership: membership,
    submittedPayload: row.submittedSnapshot,
    subject: row.subject,
    descriptionSafe: row.descriptionSafe,
    urgency: row.urgency,
    requestedDeadline: row.requestedDeadline,
    status: row.status,
    revision: row.revision,
    submittedAt: row.submittedAt,
    triagedAt: row.triagedAt,
    triagedByInternalUserId: row.triagedByInternalUserId,
    customerResponseSafe: row.customerResponseSafe,
    linkedCase,
    attachments: row.attachments.map((item) => ({ id: item.id, fileName: item.originalFileNameSafe, declaredMimeType: item.declaredMimeType, detectedMimeType: item.detectedMimeType, sizeBytes: item.sizeBytes, checksum: item.checksum, status: item.status, uploadedAt: item.uploadedAt, scannedAt: item.scannedAt })),
    informationRequests: row.informationRequests,
    history: events,
    availableTransitions: transitions(String(row.status)),
  };
}

export async function listIntakeQueue(actor: IntakeActor, filter: Record<string, unknown>, prisma: Db = defaultPrisma) {
  requireTriage(actor);
  const limit = Math.min(Math.max(Number(filter.limit) || 20, 1), 100);
  const offset = Math.max(Number(filter.offset) || 0, 0);
  const where: any = {};
  if (filter.workspaceId) where.workspaceId = String(filter.workspaceId);
  if (filter.organizationGroupId) where.organizationGroupId = String(filter.organizationGroupId);
  if (filter.status) where.status = String(filter.status);
  if (filter.urgency) where.urgency = String(filter.urgency);
  if (filter.assigned === 'unassigned') where.triagedByInternalUserId = null;
  if (filter.assigned === 'assigned') where.triagedByInternalUserId = { not: null };
  if (filter.submittedFrom || filter.submittedTo) where.submittedAt = {
    ...(filter.submittedFrom ? { gte: new Date(String(filter.submittedFrom)) } : {}),
    ...(filter.submittedTo ? { lte: new Date(String(filter.submittedTo)) } : {}),
  };
  if (filter.clientId) {
    const workspaces = await prisma.clientPortalWorkspace.findMany({ where: { clientId: String(filter.clientId) }, select: { id: true } });
    where.workspaceId = { in: workspaces.map((item) => item.id) };
  }
  if (filter.requesterIdentityId) {
    const memberships = await prisma.clientPortalWorkspaceMembership.findMany({ where: { clientPortalIdentityId: String(filter.requesterIdentityId) }, select: { id: true } });
    where.requesterMembershipId = { in: memberships.map((item) => item.id) };
  } else if (filter.requester) {
    const requester = String(filter.requester).trim();
    const identities = await prisma.clientPortalIdentity.findMany({ where: { OR: [{ displayName: { contains: requester, mode: 'insensitive' } }, { normalizedEmail: { contains: requester, mode: 'insensitive' } }] }, select: { id: true } });
    const memberships = await prisma.clientPortalWorkspaceMembership.findMany({ where: { clientPortalIdentityId: { in: identities.map((item) => item.id) }, ...(filter.workspaceId ? { workspaceId: String(filter.workspaceId) } : {}) }, select: { id: true } });
    where.requesterMembershipId = { in: memberships.map((item) => item.id) };
  }
  const [items, total] = await Promise.all([
    prisma.clientPortalIntakeRequest.findMany({ where, orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }], skip: offset, take: limit, select: { id: true, workspaceId: true, requesterMembershipId: true, organizationGroupId: true, subject: true, urgency: true, requestedDeadline: true, status: true, submittedAt: true, triagedByInternalUserId: true, revision: true, updatedAt: true } }),
    prisma.clientPortalIntakeRequest.count({ where }),
  ]);
  return { items, total, limit, offset };
}

export async function getIntakeTriageDetail(actor: IntakeActor, intakeId: string, prisma: Db = defaultPrisma) {
  requireTriage(actor);
  return intakeDetailRow(intakeId, prisma);
}

export async function listIntakeHistory(actor: IntakeActor, intakeId: string, prisma: Db = defaultPrisma) {
  requireTriage(actor);
  return { items: (await intakeDetailRow(intakeId, prisma)).history };
}

export async function startIntakeTriage(actor: IntakeActor, intakeId: string, expectedRevision: unknown, prisma: Db = defaultPrisma) {
  requireTriage(actor);
  return prisma.$transaction(async (tx) => {
    const row = await tx.clientPortalIntakeRequest.findUnique({ where: { id: intakeId } });
    if (!row) throw new InteractionError(404, 'INTAKE_NOT_FOUND', 'Intake not found.');
    if (row.status === 'TRIAGE_IN_PROGRESS') return row;
    if (row.status !== 'SUBMITTED') throw new InteractionError(409, 'INVALID_INTAKE_TRANSITION', 'Only a submitted intake can enter triage.');
    requireExpected(row, expectedRevision);
    const updated = await tx.clientPortalIntakeRequest.update({ where: { id: intakeId }, data: { status: 'TRIAGE_IN_PROGRESS', triagedAt: new Date(), triagedByInternalUserId: actor.userId, revision: { increment: 1 } } });
    await audit(tx, row, actor, 'INTAKE_TRIAGE_STARTED', 'SUBMITTED', 'TRIAGE_IN_PROGRESS');
    return updated;
  });
}

export async function requestMoreInformation(actor: IntakeActor, intakeId: string, input: Record<string, unknown>, prisma: Db = defaultPrisma) {
  requireTriage(actor);
  return prisma.$transaction(async (tx) => {
    const row = await tx.clientPortalIntakeRequest.findUnique({ where: { id: intakeId } });
    if (!row) throw new InteractionError(404, 'INTAKE_NOT_FOUND', 'Intake not found.');
    if (!TRIAGE_ELIGIBLE.has(String(row.status))) throw new InteractionError(409, 'INVALID_INTAKE_TRANSITION', 'More information cannot be requested in the current state.');
    requireExpected(row, input.expectedRevision);
    const workspace = await tx.clientPortalWorkspace.findUnique({ where: { id: row.workspaceId }, select: { clientId: true } });
    if (!workspace) throw new InteractionError(409, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
    const request = await createPublishedIntakeInformationRequestInTransaction(actor, { intakeRequestId: row.id, workspaceId: row.workspaceId, requesterMembershipId: row.requesterMembershipId, clientId: workspace.clientId, title: input.title, instructions: input.instructions, dueAt: input.dueAt, fields: input.fields }, tx);
    const response = safeText(input.instructions, 'instructions', 4000, true)!;
    const updated = await tx.clientPortalIntakeRequest.update({ where: { id: intakeId }, data: { status: 'MORE_INFORMATION_REQUIRED', customerResponseSafe: response, triagedAt: row.triagedAt || new Date(), triagedByInternalUserId: actor.userId, revision: { increment: 1 } } });
    await audit(tx, row, actor, 'INTAKE_MORE_INFORMATION_REQUESTED', String(row.status), 'MORE_INFORMATION_REQUIRED');
    return { intake: updated, request };
  });
}

export async function declineIntake(actor: IntakeActor, intakeId: string, input: Record<string, unknown>, prisma: Db = defaultPrisma) {
  requireTriage(actor);
  return prisma.$transaction(async (tx) => {
    const row = await tx.clientPortalIntakeRequest.findUnique({ where: { id: intakeId } });
    if (!row) throw new InteractionError(404, 'INTAKE_NOT_FOUND', 'Intake not found.');
    if (!TRIAGE_ELIGIBLE.has(String(row.status))) throw new InteractionError(409, 'INVALID_INTAKE_TRANSITION', 'Intake cannot be declined in the current state.');
    requireExpected(row, input.expectedRevision);
    const updated = await tx.clientPortalIntakeRequest.update({ where: { id: intakeId }, data: { status: 'DECLINED', customerResponseSafe: safeText(input.customerResponse, 'customerResponse', 2000, true), internalTriageNote: input.internalNote ? String(input.internalNote).slice(0, 4000) : null, triagedAt: row.triagedAt || new Date(), triagedByInternalUserId: actor.userId, closedAt: new Date(), revision: { increment: 1 } } });
    await audit(tx, row, actor, 'INTAKE_DECLINED', String(row.status), 'DECLINED');
    return updated;
  });
}

export async function closeIntake(actor: IntakeActor, intakeId: string, expectedRevision: unknown, prisma: Db = defaultPrisma) {
  requireTriage(actor);
  return prisma.$transaction(async (tx) => {
    const row = await tx.clientPortalIntakeRequest.findUnique({ where: { id: intakeId } });
    if (!row) throw new InteractionError(404, 'INTAKE_NOT_FOUND', 'Intake not found.');
    if (!['LINKED_TO_EXISTING_CASE', 'CONVERTED_TO_CASE'].includes(String(row.status))) throw new InteractionError(409, 'INVALID_INTAKE_TRANSITION', 'Only linked or converted intake can be closed.');
    requireExpected(row, expectedRevision);
    const updated = await tx.clientPortalIntakeRequest.update({ where: { id: intakeId }, data: { status: 'CLOSED', closedAt: new Date(), revision: { increment: 1 } } });
    await audit(tx, row, actor, 'INTAKE_CLOSED', String(row.status), 'CLOSED');
    return updated;
  });
}

export const linkIntakeToExistingCase = (actor: IntakeActor, intakeId: string, input: Record<string, any>, prisma: Db = defaultPrisma) => approveIntakeAndExposeCase(actor, { ...input, intakeId, existingCaseId: String(input.caseId || ''), newCase: undefined } as IntakeConversionInput, prisma);
export const convertIntakeToNewCase = (actor: IntakeActor, intakeId: string, input: Record<string, any>, prisma: Db = defaultPrisma) => approveIntakeAndExposeCase(actor, { ...input, intakeId, existingCaseId: undefined, newCase: input.newCase } as IntakeConversionInput, prisma);
export const performApprovedConversion = (actor: IntakeActor, intakeId: string, input: Record<string, any>, prisma: Db = defaultPrisma) => approveIntakeAndExposeCase(actor, { ...input, intakeId } as IntakeConversionInput, prisma);
export const approveIntakeRequesterAccess = approveRequesterAccess;
export const publishIntakeSnapshot = publishIntakeInitialSnapshot;
