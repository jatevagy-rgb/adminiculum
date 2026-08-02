import crypto from 'crypto';
import { prisma } from '../../prisma/prisma.service';
import { ClientPortalSession } from '../../middleware/clientPortalAuth';

export class ClientIdentityError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

type Actor = { userId: string; role: string };
const INTERNAL_REVIEW_ROLES = new Set(['ADMIN', 'PARTNER']);
const GRANT_ROLES = new Set(['ADMIN', 'PARTNER', 'LAWYER']);

function safeString(value: unknown, max = 200): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ');
  return normalized ? normalized.slice(0, max) : null;
}

function normalizeEmail(value: unknown): string | null {
  const email = safeString(value, 254)?.toLowerCase() || null;
  return email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

function requireReviewer(actor: Actor): void {
  if (!actor.userId || !INTERNAL_REVIEW_ROLES.has(actor.role)) throw new ClientIdentityError(403, 'CLIENT_MEMBERSHIP_REVIEW_FORBIDDEN', 'Membership review requires an internal administrator.');
}

function requireGrantActor(actor: Actor): void {
  if (!actor.userId || !GRANT_ROLES.has(actor.role)) throw new ClientIdentityError(403, 'CLIENT_GRANT_FORBIDDEN', 'Case access grants require an authorized internal actor.');
}

function invitationHash(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export async function getClientProfile(session: ClientPortalSession) {
  const identity = await prisma.clientPortalIdentity.findUnique({ where: { id: session.clientPortalIdentityId } });
  if (!identity) throw new ClientIdentityError(404, 'CLIENT_IDENTITY_NOT_FOUND', 'Client identity was not found.');
  const memberships = await prisma.clientOrganizationMembership.findMany({
    where: { clientPortalIdentityId: identity.id },
    select: { id: true, clientId: true, groupId: true, status: true, approvedAt: true, revision: true },
    orderBy: { createdAt: 'desc' },
  });
  return {
    id: identity.id,
    displayName: identity.displayName,
    normalizedEmail: identity.normalizedEmail,
    emailVerifiedAt: identity.emailVerifiedAt,
    accountType: identity.accountType,
    status: identity.status,
    memberships,
  };
}

export async function submitMembershipRequest(session: ClientPortalSession, input: Record<string, unknown>) {
  if (!session.emailVerified) throw new ClientIdentityError(403, 'CLIENT_EMAIL_NOT_VERIFIED', 'Verify e-mail before requesting organization membership.');
  if (session.status === 'SUSPENDED' || session.status === 'REVOKED') throw new ClientIdentityError(403, `CLIENT_IDENTITY_${session.status}`, 'Client identity is not active.');
  const requestedOrganizationName = safeString(input.requestedOrganizationName, 180);
  const requestedClientId = safeString(input.requestedClientId, 80);
  const requestedGroupId = safeString(input.requestedGroupId, 80);
  const requestedGroupName = safeString(input.requestedGroupName, 120);
  const corporateEmail = normalizeEmail(input.corporateEmail) || session.normalizedEmail;
  if (!requestedOrganizationName && !requestedClientId) throw new ClientIdentityError(400, 'ORGANIZATION_CONTEXT_REQUIRED', 'Organization context is required.');

  if (requestedGroupId && requestedClientId) {
    const group = await prisma.clientOrganizationGroup.findFirst({ where: { id: requestedGroupId, clientId: requestedClientId, status: 'ACTIVE' } });
    if (!group) throw new ClientIdentityError(400, 'CROSS_CLIENT_GROUP_REJECTED', 'Requested group is not available for that organization.');
  }

  const request = await prisma.clientOrganizationMembershipRequest.create({
    data: {
      clientPortalIdentityId: session.clientPortalIdentityId,
      requestedClientId,
      requestedOrganizationName,
      requestedGroupId,
      requestedGroupName,
      corporateEmail,
      roleDescriptionSafe: safeString(input.roleDescriptionSafe, 200),
      invitationId: safeString(input.invitationId, 80),
      status: 'PENDING_REVIEW',
      submittedAt: new Date(),
    },
  });
  await prisma.clientPortalIdentity.update({ where: { id: session.clientPortalIdentityId }, data: { status: 'MEMBERSHIP_PENDING', revision: { increment: 1 } } });
  return { id: request.id, status: request.status, message: 'Regisztrációját megkaptuk. A szervezeti hozzáférést az iroda ellenőrzi.' };
}

export async function getCurrentMembershipRequests(session: ClientPortalSession) {
  const items = await prisma.clientOrganizationMembershipRequest.findMany({
    where: { clientPortalIdentityId: session.clientPortalIdentityId },
    select: { id: true, requestedOrganizationName: true, requestedGroupName: true, status: true, submittedAt: true, reviewedAt: true, rejectionReasonSafe: true, revision: true },
    orderBy: { createdAt: 'desc' },
  });
  return { items };
}

export async function cancelMembershipRequest(session: ClientPortalSession, requestId: string, revision: number) {
  const existing = await prisma.clientOrganizationMembershipRequest.findFirst({ where: { id: requestId, clientPortalIdentityId: session.clientPortalIdentityId } });
  if (!existing) throw new ClientIdentityError(404, 'REQUEST_NOT_FOUND', 'Membership request is not available.');
  if (existing.status !== 'PENDING_REVIEW' && existing.status !== 'DRAFT') throw new ClientIdentityError(409, 'REQUEST_NOT_CANCELLABLE', 'Membership request cannot be cancelled.');
  if (existing.revision !== revision) throw new ClientIdentityError(409, 'REVISION_CONFLICT', 'Membership request changed.');
  return prisma.clientOrganizationMembershipRequest.update({ where: { id: requestId }, data: { status: 'CANCELLED', revision: { increment: 1 } } });
}

export async function validateInvitation(rawToken: string, session?: ClientPortalSession) {
  const token = safeString(rawToken, 500);
  if (!token) return { valid: false, status: 'UNAVAILABLE' };
  const invitation = await prisma.clientPortalInvitation.findUnique({ where: { tokenHash: invitationHash(token) } });
  if (!invitation || invitation.status !== 'ACTIVE' || invitation.expiresAt.getTime() <= Date.now()) return { valid: false, status: 'UNAVAILABLE' };
  if (session && invitation.intendedEmail && invitation.intendedEmail.toLowerCase() !== session.normalizedEmail) return { valid: false, status: 'UNAVAILABLE' };
  return { valid: true, invitationId: invitation.id, intendedEmailMatchRequired: Boolean(invitation.intendedEmail), expiresAt: invitation.expiresAt };
}

export async function listMembershipQueue(actor: Actor) {
  requireReviewer(actor);
  const items = await prisma.clientOrganizationMembershipRequest.findMany({
    where: { status: { in: ['PENDING_REVIEW', 'REJECTED'] } },
    select: { id: true, clientPortalIdentityId: true, requestedClientId: true, requestedOrganizationName: true, requestedGroupId: true, requestedGroupName: true, corporateEmail: true, status: true, submittedAt: true, reviewedAt: true, rejectionReasonSafe: true, revision: true },
    orderBy: [{ status: 'asc' }, { submittedAt: 'asc' }],
  });
  return { items };
}

export async function createOrganizationGroup(actor: Actor, input: Record<string, unknown>) {
  requireReviewer(actor);
  const clientId = safeString(input.clientId, 80);
  const name = safeString(input.name, 120);
  if (!clientId || !name) throw new ClientIdentityError(400, 'GROUP_INPUT_REQUIRED', 'Client and group name are required.');
  return prisma.clientOrganizationGroup.create({ data: { clientId, name, descriptionSafe: safeString(input.descriptionSafe, 300), createdById: actor.userId } });
}

export async function approveMembershipRequest(actor: Actor, requestId: string, input: Record<string, unknown>) {
  requireReviewer(actor);
  const revision = Number(input.revision);
  const clientId = safeString(input.clientId, 80);
  const groupId = safeString(input.groupId, 80);
  if (!clientId || !Number.isInteger(revision)) throw new ClientIdentityError(400, 'APPROVAL_INPUT_REQUIRED', 'Client and revision are required.');
  const request = await prisma.clientOrganizationMembershipRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new ClientIdentityError(404, 'REQUEST_NOT_FOUND', 'Membership request is not available.');
  if (request.status !== 'PENDING_REVIEW') throw new ClientIdentityError(409, 'REQUEST_NOT_PENDING', 'Membership request is not pending review.');
  if (request.revision !== revision) throw new ClientIdentityError(409, 'REVISION_CONFLICT', 'Membership request changed.');
  if (groupId) {
    const group = await prisma.clientOrganizationGroup.findFirst({ where: { id: groupId, clientId, status: 'ACTIVE' } });
    if (!group) throw new ClientIdentityError(400, 'CROSS_CLIENT_GROUP_REJECTED', 'Requested group is not available for that organization.');
  }
  return prisma.$transaction(async (tx) => {
    const membership = await tx.clientOrganizationMembership.create({ data: { clientPortalIdentityId: request.clientPortalIdentityId, clientId, groupId, approvedFromRequestId: request.id, approvedById: actor.userId, approvedAt: new Date() } });
    await tx.clientOrganizationMembershipRequest.update({ where: { id: request.id }, data: { requestedClientId: clientId, requestedGroupId: groupId, status: 'APPROVED', reviewedById: actor.userId, reviewedAt: new Date(), revision: { increment: 1 } } });
    await tx.clientPortalIdentity.update({ where: { id: request.clientPortalIdentityId }, data: { status: 'ACTIVE', revision: { increment: 1 } } });
    return { membership, grantRequired: true, nextAction: 'Hozzáférés adása ügyhöz' };
  });
}

export async function rejectMembershipRequest(actor: Actor, requestId: string, input: Record<string, unknown>) {
  requireReviewer(actor);
  const revision = Number(input.revision);
  const request = await prisma.clientOrganizationMembershipRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new ClientIdentityError(404, 'REQUEST_NOT_FOUND', 'Membership request is not available.');
  if (request.status !== 'PENDING_REVIEW') throw new ClientIdentityError(409, 'REQUEST_NOT_PENDING', 'Membership request is not pending review.');
  if (request.revision !== revision) throw new ClientIdentityError(409, 'REVISION_CONFLICT', 'Membership request changed.');
  return prisma.clientOrganizationMembershipRequest.update({ where: { id: requestId }, data: { status: 'REJECTED', reviewedById: actor.userId, reviewedAt: new Date(), rejectionReasonSafe: safeString(input.rejectionReasonSafe, 300), revision: { increment: 1 } } });
}

export async function transitionMembership(actor: Actor, membershipId: string, action: 'suspend' | 'revoke') {
  requireReviewer(actor);
  const existing = await prisma.clientOrganizationMembership.findUnique({ where: { id: membershipId } });
  if (!existing) throw new ClientIdentityError(404, 'MEMBERSHIP_NOT_FOUND', 'Membership is not available.');
  if (action === 'suspend') return prisma.clientOrganizationMembership.update({ where: { id: membershipId }, data: { status: 'SUSPENDED', suspendedAt: new Date(), suspendedById: actor.userId, revision: { increment: 1 } } });
  return prisma.clientOrganizationMembership.update({ where: { id: membershipId }, data: { status: 'REVOKED', revokedAt: new Date(), revokedById: actor.userId, revision: { increment: 1 } } });
}

const ALLOWED_GRANT_PERMISSIONS = new Set([
  'MATTER_READ', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD', 'ACTION_REQUEST_READ', 'UPDATE_READ',
]);

/**
 * Identity-based case grant for an External ID customer. Binds the grant to the
 * ClientPortalIdentity (never a legacy clientUserId), requires an ACTIVE
 * membership + ACTIVE identity, and a real case. Supports an optional validity
 * window.
 */
export async function createGrantForApprovedMembership(actor: Actor, input: Record<string, unknown>) {
  requireGrantActor(actor);
  const membershipId = safeString(input.membershipId, 80);
  const caseId = safeString(input.caseId, 80);
  const permissions = Array.isArray(input.permissions)
    ? input.permissions.map(String).filter((p) => ALLOWED_GRANT_PERMISSIONS.has(p))
    : [];
  if (!membershipId || !caseId || !permissions.length) throw new ClientIdentityError(400, 'GRANT_INPUT_REQUIRED', 'Membership, case and permissions are required.');

  let validUntil: Date | null = null;
  if (input.validUntil != null && String(input.validUntil).trim()) {
    const parsed = new Date(String(input.validUntil));
    if (Number.isNaN(parsed.getTime())) throw new ClientIdentityError(400, 'GRANT_VALIDITY_INVALID', 'Grant validity date is invalid.');
    if (parsed.getTime() <= Date.now()) throw new ClientIdentityError(400, 'GRANT_VALIDITY_PAST', 'Grant validity must be in the future.');
    validUntil = parsed;
  }

  const membership = await prisma.clientOrganizationMembership.findFirst({ where: { id: membershipId, status: 'ACTIVE' } });
  if (!membership) throw new ClientIdentityError(403, 'ACTIVE_MEMBERSHIP_REQUIRED', 'Active membership is required before creating a case grant.');
  const identity = await prisma.clientPortalIdentity.findUnique({ where: { id: membership.clientPortalIdentityId } });
  if (!identity || identity.status !== 'ACTIVE') throw new ClientIdentityError(403, 'ACTIVE_IDENTITY_REQUIRED', 'Active client identity is required before creating a case grant.');
  const caseRow = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, clientId: true } });
  if (!caseRow) throw new ClientIdentityError(404, 'CASE_NOT_FOUND', 'Case was not found.');
  if (caseRow.clientId !== membership.clientId) throw new ClientIdentityError(409, 'CASE_CLIENT_MISMATCH', 'The case does not belong to the membership client.');

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.clientPortalGrant.findFirst({
        where: { clientPortalIdentityId: identity.id, clientId: membership.clientId, caseId },
        orderBy: { updatedAt: 'desc' },
      });
      const requestedPermissions = [...new Set(permissions)].sort();
      const existingPermissions = existing ? [...new Set(existing.permissions.map(String))].sort() : [];
      const samePermissions = existingPermissions.length === requestedPermissions.length
        && existingPermissions.every((permission, index) => permission === requestedPermissions[index]);
      const sameValidity = (existing?.validUntil?.getTime() || null) === (validUntil?.getTime() || null);

      if (existing?.status === 'ACTIVE') {
        if (!samePermissions || !sameValidity) throw new ClientIdentityError(409, 'GRANT_ALREADY_ACTIVE', 'An equivalent active case grant already exists.');
        return existing;
      }

      if (existing) {
        const reactivated = await tx.clientPortalGrant.update({
          where: { id: existing.id },
          data: {
            status: 'ACTIVE',
            permissions: permissions as any,
            validUntil,
            activatedAt: new Date(),
            revision: { increment: 1 },
          },
        });
        await tx.clientPublicationEvent.create({
          data: {
            action: 'GRANT_ACTIVATED' as any,
            actorId: actor.userId,
            caseId,
            clientId: membership.clientId,
            grantId: existing.id,
            fromStatus: existing.status,
            toStatus: 'ACTIVE',
            metadataSafe: { source: 'identity-grant-create-reactivation' },
          },
        });
        return reactivated;
      }

      const created = await tx.clientPortalGrant.create({
        data: {
          clientUserId: null,
          clientPortalIdentityId: identity.id,
          clientId: membership.clientId,
          caseId,
          role: 'VIEWER',
          status: 'ACTIVE',
          permissions: permissions as any,
          invitedById: actor.userId,
          activatedAt: new Date(),
          validUntil,
        },
      });
      await tx.clientPublicationEvent.create({
        data: {
          action: 'GRANT_ACTIVATED' as any,
          actorId: actor.userId,
          caseId,
          clientId: membership.clientId,
          grantId: created.id,
          toStatus: 'ACTIVE',
          metadataSafe: { source: 'identity-grant-create' },
        },
      });
      return created;
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error instanceof ClientIdentityError) throw error;
    if ((error as { code?: string })?.code === 'P2002') throw new ClientIdentityError(409, 'GRANT_CONCURRENT_CONFLICT', 'The case grant changed concurrently.');
    throw error;
  }
}

/**
 * Active memberships awaiting/holding case grants, joined with their identity
 * and organization so the internal grant UI can target the exact identity.
 */
export async function listActiveMemberships(actor: Actor) {
  requireReviewer(actor);
  const memberships = await prisma.clientOrganizationMembership.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { approvedAt: 'desc' },
    select: { id: true, clientPortalIdentityId: true, clientId: true, groupId: true, status: true, approvedAt: true, revision: true },
  });
  const identityIds = [...new Set(memberships.map((m) => m.clientPortalIdentityId))];
  const clientIds = [...new Set(memberships.map((m) => m.clientId))];
  const [identities, clients, grants] = await Promise.all([
    prisma.clientPortalIdentity.findMany({ where: { id: { in: identityIds } }, select: { id: true, normalizedEmail: true, displayName: true, status: true } }),
    prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } }),
    prisma.clientPortalGrant.findMany({ where: { clientPortalIdentityId: { in: identityIds }, status: 'ACTIVE' }, select: { id: true, clientPortalIdentityId: true, caseId: true, status: true, permissions: true, validUntil: true } }),
  ]);
  const idMap = new Map(identities.map((i) => [i.id, i]));
  const clientMap = new Map(clients.map((c) => [c.id, c]));
  return {
    items: memberships.map((m) => ({
      ...m,
      identityEmail: idMap.get(m.clientPortalIdentityId)?.normalizedEmail || null,
      identityDisplayName: idMap.get(m.clientPortalIdentityId)?.displayName || null,
      identityStatus: idMap.get(m.clientPortalIdentityId)?.status || null,
      clientName: clientMap.get(m.clientId)?.name || null,
      activeGrants: grants.filter((g) => g.clientPortalIdentityId === m.clientPortalIdentityId).map((g) => ({ id: g.id, caseId: g.caseId, permissions: g.permissions, validUntil: g.validUntil })),
    })),
  };
}
