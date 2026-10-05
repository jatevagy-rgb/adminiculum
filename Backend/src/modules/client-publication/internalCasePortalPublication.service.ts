import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { createOrReactivateParticipantForPublicationInTransaction } from '../client-workspace/organizationAdminService';
import { createAndPublishMatterPublicationForGrantInTransaction } from './publicationService';

type Actor = { userId: string; role?: string | null };
type Row = Record<string, unknown>;

const PUBLISH_ROLES = new Set(['ADMIN', 'PARTNER', 'LAWYER', 'COLLAB_LAWYER']);

export class InternalCasePortalPublicationError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export type PortalPublicationReadiness = 'READY_NEW' | 'READY_EXISTING_ACCESS' | 'BLOCKED_CONFLICT';

/**
 * Safe publication readiness derived server-side from the most recent grant for
 * the same identity/client/case. Mirrors the publication transaction's
 * fail-closed rules without exposing internal IDs or permission lists.
 *
 * READY_NEW            — no prior grant, or a non-active prior grant in the same
 *                        workspace that publication reactivates.
 * READY_EXISTING_ACCESS — an ACTIVE grant in the same workspace already includes
 *                        MATTER_READ; publication reuses it unchanged.
 * BLOCKED_CONFLICT      — an ACTIVE grant in another workspace, or an ACTIVE
 *                        same-workspace grant without MATTER_READ, or a
 *                        non-active prior grant in another workspace.
 */
export function derivePortalPublicationReadiness(
  latest: { workspaceId: string | null; status: unknown; permissions: unknown } | null | undefined,
  workspaceId: string,
): PortalPublicationReadiness {
  if (!latest) return 'READY_NEW';
  const permissions = Array.isArray(latest.permissions) ? latest.permissions.map(String) : [];
  if (String(latest.status) === 'ACTIVE') {
    return latest.workspaceId === workspaceId && permissions.includes('MATTER_READ') ? 'READY_EXISTING_ACCESS' : 'BLOCKED_CONFLICT';
  }
  return latest.workspaceId && latest.workspaceId !== workspaceId ? 'BLOCKED_CONFLICT' : 'READY_NEW';
}

function requirePublisher(actor: Actor): void {
  if (!actor.userId || !PUBLISH_ROLES.has(String(actor.role || ''))) {
    throw new InternalCasePortalPublicationError(403, 'CASE_PORTAL_PUBLISH_FORBIDDEN', 'Case portal publication requires an authorized workforce publisher.');
  }
}

function safeText(value: unknown, field: string, max: number, required = false): string | null {
  const output = typeof value === 'string' ? value.trim() : '';
  if (!output) {
    if (required) throw new InternalCasePortalPublicationError(400, 'PUBLICATION_INPUT_REQUIRED', `${field} is required.`);
    return null;
  }
  if (output.length > max || /[\u0000-\u001f\u007f]/.test(output)) {
    throw new InternalCasePortalPublicationError(400, 'PUBLICATION_INPUT_INVALID', `${field} is invalid.`);
  }
  return output;
}

export async function listCasePortalPublicationTargets(actor: Actor, caseId: string, db: PrismaClient = defaultPrisma) {
  requirePublisher(actor);
  const caseRow = await db.case.findUnique({ where: { id: caseId }, select: { id: true, clientId: true } });
  if (!caseRow) throw new InternalCasePortalPublicationError(404, 'CASE_NOT_FOUND', 'Case not found.');
  const workspaces = await db.clientPortalWorkspace.findMany({
    where: {
      clientId: caseRow.clientId,
      mode: 'ORGANIZATION',
      status: 'ACTIVE',
    },
    select: { id: true, name: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  if (!workspaces.length) return { items: [] };
  const memberships = await db.clientPortalWorkspaceMembership.findMany({
    where: {
      workspaceId: { in: workspaces.map((workspace) => workspace.id) },
      status: 'ACTIVE',
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true, workspaceId: true, clientPortalIdentityId: true, role: true },
    orderBy: { id: 'asc' },
  });
  const identities = await db.clientPortalIdentity.findMany({
    where: { id: { in: memberships.map((membership) => membership.clientPortalIdentityId) }, status: 'ACTIVE', emailVerifiedAt: { not: null } },
    select: { id: true, displayName: true },
    orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
  });
  const grants = await db.clientPortalGrant.findMany({
    where: { clientId: caseRow.clientId, caseId, clientPortalIdentityId: { in: identities.map((identity) => identity.id) } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, clientPortalIdentityId: true, workspaceId: true, status: true, permissions: true },
  });
  const latestGrantByIdentity = new Map<string, (typeof grants)[number]>();
  for (const grant of grants) {
    if (!latestGrantByIdentity.has(grant.clientPortalIdentityId)) latestGrantByIdentity.set(grant.clientPortalIdentityId, grant);
  }
  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  const identityById = new Map(identities.map((identity) => [identity.id, identity]));
  return {
    items: memberships
      .map((membership) => ({ membership, workspace: workspaceById.get(membership.workspaceId), identity: identityById.get(membership.clientPortalIdentityId) }))
      .filter((row): row is { membership: typeof memberships[number]; workspace: NonNullable<typeof workspaces[number]>; identity: NonNullable<typeof identities[number]> } => Boolean(row.workspace && row.identity))
      .sort((left, right) => left.workspace.name.localeCompare(right.workspace.name) || left.identity.displayName.localeCompare(right.identity.displayName) || left.membership.id.localeCompare(right.membership.id))
      .map(({ membership, workspace, identity }) => ({
        workspaceId: workspace.id,
        workspaceMembershipId: membership.id,
        workspaceName: workspace.name,
        memberName: identity.displayName,
        memberRole: String(membership.role),
        publicationReadiness: derivePortalPublicationReadiness(latestGrantByIdentity.get(membership.clientPortalIdentityId), workspace.id),
      })),
  };
}

/**
 * The membership id is only a selector. The service derives the identity and
 * grant server-side, so a browser cannot substitute a Client, Case, or identity.
 */
export async function publishInternalCaseToPortal(
  actor: Actor,
  caseId: string,
  input: Row,
  db: PrismaClient = defaultPrisma,
) {
  requirePublisher(actor);
  const workspaceId = safeText(input.workspaceId, 'workspaceId', 200, true)!;
  const workspaceMembershipId = safeText(input.workspaceMembershipId, 'workspaceMembershipId', 200, true)!;
  const publicationInput = {
    publicTitle: safeText(input.clientSafeTitle, 'clientSafeTitle', 240, true),
    publicStatus: safeText(input.clientSafeStatus, 'clientSafeStatus', 240, true),
    currentPosition: safeText(input.clientSafeCurrentPosition, 'clientSafeCurrentPosition', 1000),
    waitingOn: safeText(input.clientSafeWaitingOn, 'clientSafeWaitingOn', 1000),
    nextStep: safeText(input.clientSafeNextStep, 'clientSafeNextStep', 1000),
    responsibleLawyerDisplay: safeText(input.responsibleLawyerDisplay, 'responsibleLawyerDisplay', 160),
    publicTargetDate: input.publicTargetDate ?? null,
  };

  return db.$transaction(async (tx) => {
      const membership = await tx.clientPortalWorkspaceMembership.findUnique({
        where: { id: workspaceMembershipId },
        select: { id: true, workspaceId: true, clientPortalIdentityId: true, status: true, expiresAt: true },
      });
      if (!membership || membership.workspaceId !== workspaceId || membership.status !== 'ACTIVE' || (membership.expiresAt && membership.expiresAt <= new Date())) {
        throw new InternalCasePortalPublicationError(409, 'WORKSPACE_MEMBERSHIP_NOT_ACTIVE', 'Select an active member of the chosen portal workspace.');
      }

      const participant = await createOrReactivateParticipantForPublicationInTransaction(actor, {
        workspaceId,
        caseId,
        clientPortalIdentityId: membership.clientPortalIdentityId,
        participantRole: 'PARTICIPANT',
        permissions: ['MATTER_READ'],
      }, tx);
      const publication = await createAndPublishMatterPublicationForGrantInTransaction(actor, {
        ...publicationInput,
        caseId,
        workspaceId,
        grantId: participant.row.id,
        publicationSource: 'internal-case',
      }, tx);
      return { publication, grant: { status: 'ACTIVE', idempotent: participant.idempotent } };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
