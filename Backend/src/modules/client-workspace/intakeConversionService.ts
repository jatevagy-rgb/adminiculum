import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { createCaseFromPortalIntakeInTransaction } from '../cases/intakeCreate.service';
import { enqueueNotification } from '../client-interaction/notificationService';
import { createAndPublishInitialMatterPublicationInTransaction } from '../client-publication/publicationService';
import { createOrReactivateParticipantInTransaction } from './organizationAdminService';
import { requireIntakeCapability } from './intakePolicy';

type Db = typeof defaultPrisma;
export type IntakeActor = { userId: string; role?: string | null };

const MUTATION_ROLES = new Set(['ADMIN', 'PARTNER']);
const ELIGIBLE = new Set(['SUBMITTED', 'TRIAGE_IN_PROGRESS']);

export class IntakeConversionError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'IntakeConversionError';
  }
}

function requireActor(actor: IntakeActor): void {
  if (!actor.userId || !MUTATION_ROLES.has(String(actor.role || ''))) throw new IntakeConversionError(403, 'INTAKE_TRIAGE_FORBIDDEN', 'Authorized intake triage role required.');
  requireIntakeCapability();
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as object).sort().map((key) => `${JSON.stringify(key)}:${stable((value as any)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function fingerprint(value: unknown): string {
  return crypto.createHash('sha256').update(stable(value)).digest('hex');
}

function optionalDate(value: unknown, field: string): Date | null {
  if (value == null || value === '') return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new IntakeConversionError(400, 'INVALID_DATE', `${field} is invalid.`);
  return date;
}

async function loadArtifacts(tx: any, intake: any) {
  const [caseRow, grant, publication] = await Promise.all([
    intake.linkedCaseId ? tx.case.findUnique({ where: { id: intake.linkedCaseId }, select: { id: true, caseNumber: true, clientId: true, status: true } }) : null,
    intake.linkedCaseId ? tx.clientPortalGrant.findFirst({ where: { caseId: intake.linkedCaseId, workspaceId: intake.workspaceId, clientPortalIdentityId: intake.requesterIdentityId }, orderBy: { updatedAt: 'desc' }, select: { id: true, status: true, participantRole: true, permissions: true, revision: true } }) : null,
    intake.linkedCaseId ? tx.clientMatterPublication.findFirst({ where: { caseId: intake.linkedCaseId, workspaceId: intake.workspaceId, status: 'PUBLISHED' }, select: { id: true, status: true, currentRevisionId: true, revision: true } }) : null,
  ]);
  return { case: caseRow, grant, publication };
}

async function lockedIntake(tx: any, intakeId: string) {
  const rows = await tx.$queryRawUnsafe('SELECT * FROM client_portal_intake_requests WHERE id=$1 FOR UPDATE', intakeId) as any[];
  const intake = rows[0];
  if (!intake) throw new IntakeConversionError(404, 'INTAKE_NOT_FOUND', 'Intake not found.');
  const membership = await tx.clientPortalWorkspaceMembership.findUnique({ where: { id: intake.requesterMembershipId }, select: { id: true, clientPortalIdentityId: true, workspaceId: true, status: true, expiresAt: true } });
  const workspace = await tx.clientPortalWorkspace.findUnique({ where: { id: intake.workspaceId }, select: { id: true, clientId: true, mode: true, status: true } });
  if (!membership || membership.status !== 'ACTIVE' || membership.workspaceId !== intake.workspaceId || (membership.expiresAt && membership.expiresAt <= new Date())) throw new IntakeConversionError(409, 'REQUESTER_MEMBERSHIP_NOT_ACTIVE', 'Requester membership is not active.');
  if (!workspace || workspace.status !== 'ACTIVE' || workspace.mode !== 'ORGANIZATION') throw new IntakeConversionError(409, 'WORKSPACE_NOT_ACTIVE', 'An active organizational workspace is required.');
  return { ...intake, requesterIdentityId: membership.clientPortalIdentityId, clientId: workspace.clientId };
}

async function audit(tx: any, intake: any, actor: IntakeActor, action: string, fromStatus?: string | null, toStatus?: string | null, metadataSafe: Record<string, unknown> = {}) {
  await tx.clientPortalWorkspaceEvent.create({ data: { workspaceId: intake.workspaceId, membershipId: intake.requesterMembershipId, actorId: actor.userId, action, fromStatus: fromStatus || null, toStatus: toStatus || null, metadataSafe: { intakeId: intake.id, ...metadataSafe } } });
}

export interface IntakeConversionInput {
  intakeId: string;
  expectedRevision?: number;
  existingCaseId?: string;
  organizationGroupId?: string;
  newCase?: { title: string; description?: string | null; matterType?: string | null; assignedLawyerId?: string | null; deadline?: string | Date | null };
  createRequesterAccess: boolean;
  participantRole?: string;
  permissions?: string[];
  publishInitialSnapshot: boolean;
  publication?: Record<string, unknown>;
}

async function executeConversion(actor: IntakeActor, input: IntakeConversionInput, prisma: Db) {
  return prisma.$transaction(async (tx) => {
    const intake = await lockedIntake(tx, input.intakeId);
    const normalized = {
      existingCaseId: input.existingCaseId || null,
      organizationGroupId: input.organizationGroupId || null,
      newCase: input.newCase || null,
      createRequesterAccess: input.createRequesterAccess === true,
      participantRole: input.participantRole || null,
      permissions: [...new Set(input.permissions || [])].sort(),
      publishInitialSnapshot: input.publishInitialSnapshot === true,
      publication: input.publication || null,
    };
    const operationFingerprint = fingerprint(normalized);
    if (intake.conversionFingerprint) {
      if (intake.conversionFingerprint !== operationFingerprint) {
        await audit(tx, intake, actor, 'INTAKE_CONVERSION_CONFLICT', intake.status, intake.status);
        throw new IntakeConversionError(409, 'INTAKE_ALREADY_CONVERTED_DIFFERENTLY', 'Intake was already linked or converted with different options.');
      }
      return { intakeId: intake.id, status: intake.status, idempotent: true, ...(await loadArtifacts(tx, intake)) };
    }
    if (!ELIGIBLE.has(String(intake.status))) throw new IntakeConversionError(409, 'INTAKE_NOT_CONVERTIBLE', 'Intake is not in an eligible triage state.');
    if (input.expectedRevision != null && Number(input.expectedRevision) !== Number(intake.revision)) throw new IntakeConversionError(409, 'REVISION_CONFLICT', 'The intake changed. Reload and retry.');
    if (Boolean(input.existingCaseId) === Boolean(input.newCase)) throw new IntakeConversionError(400, 'INTAKE_CASE_TARGET_REQUIRED', 'Choose exactly one existing or new Case target.');
    if (input.organizationGroupId && input.organizationGroupId !== intake.organizationGroupId) throw new IntakeConversionError(400, 'INTAKE_GROUP_MISMATCH', 'Conversion organization group must match the submitted intake.');
    if (input.publishInitialSnapshot && !input.createRequesterAccess) throw new IntakeConversionError(400, 'PUBLICATION_REQUIRES_ACCESS', 'Initial publication requires explicit requester access.');

    let caseRow: any;
    let nextStatus: 'LINKED_TO_EXISTING_CASE' | 'CONVERTED_TO_CASE';
    if (input.existingCaseId) {
      caseRow = await tx.case.findUnique({ where: { id: input.existingCaseId }, select: { id: true, caseNumber: true, clientId: true, status: true } });
      if (!caseRow) throw new IntakeConversionError(404, 'CASE_NOT_FOUND', 'Case not found.');
      if (caseRow.clientId !== intake.clientId) throw new IntakeConversionError(400, 'CASE_CLIENT_MISMATCH', 'Case is outside the intake Client.');
      if (['ARCHIVED', 'CANCELLED'].includes(String(caseRow.status))) throw new IntakeConversionError(409, 'CASE_NOT_ELIGIBLE', 'Case is not eligible for intake linking.');
      const incompatibleUnit = await tx.clientPortalIntakeRequest.findFirst({ where: { linkedCaseId: caseRow.id, workspaceId: intake.workspaceId, organizationGroupId: { not: intake.organizationGroupId }, status: { in: ['LINKED_TO_EXISTING_CASE', 'CONVERTED_TO_CASE', 'CLOSED'] } }, select: { id: true } });
      if (incompatibleUnit) throw new IntakeConversionError(409, 'CASE_ORGANIZATION_GROUP_MISMATCH', 'Case is already linked to another organizational unit in this workspace.');
      nextStatus = 'LINKED_TO_EXISTING_CASE';
    } else {
      caseRow = await createCaseFromPortalIntakeInTransaction(actor.userId, {
        clientId: intake.clientId,
        title: String(input.newCase!.title || ''),
        description: input.newCase!.description,
        matterType: input.newCase!.matterType,
        assignedLawyerId: input.newCase!.assignedLawyerId,
        deadline: optionalDate(input.newCase!.deadline, 'deadline'),
      }, tx);
      nextStatus = 'CONVERTED_TO_CASE';
    }

    let grant: any = null;
    if (input.createRequesterAccess) {
      if (String(input.participantRole || '') !== 'REQUESTER') throw new IntakeConversionError(400, 'REQUESTER_ROLE_REQUIRED', 'Approved requester access must use REQUESTER role.');
      if (!Array.isArray(input.permissions) || input.permissions.length === 0) throw new IntakeConversionError(400, 'PARTICIPANT_PERMISSIONS_REQUIRED', 'Requester permissions must be explicit.');
      const result = await createOrReactivateParticipantInTransaction(actor, {
        workspaceId: intake.workspaceId,
        caseId: caseRow.id,
        clientPortalIdentityId: intake.requesterIdentityId,
        participantRole: 'REQUESTER',
        permissions: input.permissions,
      }, tx);
      grant = result.row;
      await audit(tx, intake, actor, 'INTAKE_REQUESTER_ACCESS_APPROVED', intake.status, intake.status, { caseId: caseRow.id, grantId: grant.id });
    }

    let publication: any = null;
    if (input.publishInitialSnapshot) {
      publication = await createAndPublishInitialMatterPublicationInTransaction(actor as any, { ...(input.publication || {}), workspaceId: intake.workspaceId, caseId: caseRow.id, grantId: grant.id }, tx);
      await audit(tx, intake, actor, 'INTAKE_INITIAL_PUBLICATION_CREATED', intake.status, intake.status, { caseId: caseRow.id, publicationId: publication.id });
    }

    const updated = await tx.clientPortalIntakeRequest.update({ where: { id: intake.id }, data: {
      linkedCaseId: caseRow.id,
      status: nextStatus,
      linkedAt: new Date(),
      convertedAt: nextStatus === 'CONVERTED_TO_CASE' ? new Date() : null,
      triagedByInternalUserId: actor.userId,
      triagedAt: intake.triagedAt || new Date(),
      conversionFingerprint: operationFingerprint,
      revision: { increment: 1 },
    } });
    await audit(tx, intake, actor, nextStatus === 'CONVERTED_TO_CASE' ? 'INTAKE_CONVERTED' : 'INTAKE_LINKED', intake.status, nextStatus, { caseId: caseRow.id });
    const identity = await tx.clientPortalIdentity.findUnique({ where: { id: intake.requesterIdentityId }, select: { normalizedEmail: true, displayName: true } });
    if (identity) await enqueueNotification({
      eventType: nextStatus,
      clientId: intake.clientId,
      caseId: caseRow.id,
      intakeRequestId: intake.id,
      recipientEmail: identity.normalizedEmail,
      recipientName: identity.displayName,
      subjectSafe: 'Ügyfélportál-kérelem feldolgozva',
      createdById: actor.userId,
      idempotencyKey: `intake-conversion:${intake.id}:${caseRow.id}`,
    }, tx);
    return { intakeId: updated.id, status: updated.status, idempotent: false, case: caseRow, grant, publication };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function approveIntakeAndExposeCase(actor: IntakeActor, input: IntakeConversionInput, prisma: Db = defaultPrisma) {
  requireActor(actor);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await executeConversion(actor, input, prisma); }
    catch (error: any) {
      if (error?.code === 'INTAKE_ALREADY_CONVERTED_DIFFERENTLY') {
        const intake = await prisma.clientPortalIntakeRequest.findUnique({ where: { id: input.intakeId }, select: { id: true, workspaceId: true, requesterMembershipId: true, status: true } });
        if (intake) await prisma.clientPortalWorkspaceEvent.create({ data: { workspaceId: intake.workspaceId, membershipId: intake.requesterMembershipId, actorId: actor.userId, action: 'INTAKE_CONVERSION_CONFLICT', fromStatus: intake.status, toStatus: intake.status, metadataSafe: { intakeId: intake.id } } });
      }
      if (error?.code !== 'P2034' || attempt === 2) throw error;
    }
  }
  throw new IntakeConversionError(409, 'INTAKE_CONVERSION_CONFLICT', 'Concurrent conversion conflict. Reload and retry.');
}

export async function approveRequesterAccess(actor: IntakeActor, intakeId: string, permissions: string[], prisma: Db = defaultPrisma) {
  requireActor(actor);
  return prisma.$transaction(async (tx) => {
    const intake = await lockedIntake(tx, intakeId);
    if (!intake.linkedCaseId || !['LINKED_TO_EXISTING_CASE', 'CONVERTED_TO_CASE', 'CLOSED'].includes(String(intake.status))) throw new IntakeConversionError(409, 'INTAKE_CASE_NOT_LINKED', 'Intake is not linked to a Case.');
    const result = await createOrReactivateParticipantInTransaction(actor, { workspaceId: intake.workspaceId, caseId: intake.linkedCaseId, clientPortalIdentityId: intake.requesterIdentityId, participantRole: 'REQUESTER', permissions }, tx);
    await audit(tx, intake, actor, 'INTAKE_REQUESTER_ACCESS_APPROVED', intake.status, intake.status, { caseId: intake.linkedCaseId, grantId: result.row.id });
    return { intakeId, caseId: intake.linkedCaseId, grant: result.row, idempotent: result.idempotent };
  });
}

export async function publishIntakeInitialSnapshot(actor: IntakeActor, intakeId: string, publicationInput: Record<string, unknown>, prisma: Db = defaultPrisma) {
  requireActor(actor);
  return prisma.$transaction(async (tx) => {
    const intake = await lockedIntake(tx, intakeId);
    if (!intake.linkedCaseId) throw new IntakeConversionError(409, 'INTAKE_CASE_NOT_LINKED', 'Intake is not linked to a Case.');
    const grant = await tx.clientPortalGrant.findFirst({ where: { workspaceId: intake.workspaceId, caseId: intake.linkedCaseId, clientPortalIdentityId: intake.requesterIdentityId, participantRole: 'REQUESTER', status: 'ACTIVE' }, select: { id: true } });
    if (!grant) throw new IntakeConversionError(409, 'ACTIVE_REQUESTER_GRANT_REQUIRED', 'An active requester grant is required before publication.');
    const publication = await createAndPublishInitialMatterPublicationInTransaction(actor as any, { ...publicationInput, workspaceId: intake.workspaceId, caseId: intake.linkedCaseId, grantId: grant.id }, tx);
    await audit(tx, intake, actor, 'INTAKE_INITIAL_PUBLICATION_CREATED', intake.status, intake.status, { caseId: intake.linkedCaseId, publicationId: publication.id });
    return { intakeId, caseId: intake.linkedCaseId, publication };
  });
}
