/**
 * CP1 workforce administration backend contracts for the organizational access
 * core: link organization units to workspaces, administer case participants
 * (role + explicit permissions), and administer leadership summary scopes.
 *
 * Every mutation validates Client/workspace/case consistency, is transactional
 * where multiple rows change, writes a content-light audit event, and never
 * automatically publishes a Case or documents or grants broader access than
 * requested. Workforce authorization is ADMIN/PARTNER only.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';

type Prisma = typeof defaultPrisma;
type InternalActor = { userId: string; role?: string | null };

const ADMIN_ROLES = new Set(['ADMIN', 'PARTNER']);
const PARTICIPANT_ROLES = new Set(['REQUESTER', 'CLIENT_OWNER', 'PARTICIPANT', 'OBSERVER']);
const ALLOWED_PERMISSIONS = new Set([
  'MATTER_READ', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD', 'ACTION_REQUEST_READ', 'ACTION_REQUEST_COMPLETE', 'UPDATE_READ',
  'MESSAGE_READ', 'MESSAGE_SEND', 'DOCUMENT_UPLOAD', 'CLIENT_TIMELINE_READ', 'HOURS_READ', 'BILLING_STATEMENT_READ',
]);

export class OrganizationAdminError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'OrganizationAdminError';
  }
}

function requireAdmin(actor: InternalActor): void {
  if (!actor?.userId || !ADMIN_ROLES.has(String(actor.role || ''))) {
    throw new OrganizationAdminError(403, 'ORG_ADMIN_FORBIDDEN', 'Organizational administration requires an authorized internal actor.');
  }
}

async function requireOrgWorkspace(workspaceId: string, prisma: Prisma): Promise<{ id: string; clientId: string }> {
  const workspace = await prisma.clientPortalWorkspace.findUnique({ where: { id: workspaceId }, select: { id: true, clientId: true, mode: true, status: true } });
  if (!workspace) throw new OrganizationAdminError(404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
  if (String(workspace.mode) !== 'ORGANIZATION') throw new OrganizationAdminError(400, 'WORKSPACE_NOT_ORGANIZATION', 'Only ORGANIZATION workspaces support organizational units and participants.');
  if (String(workspace.status) === 'ARCHIVED') throw new OrganizationAdminError(409, 'WORKSPACE_ARCHIVED', 'Workspace is archived.');
  return { id: workspace.id, clientId: workspace.clientId };
}

function enumValue(value: unknown, allowed: Set<string>, code: string): string {
  const output = String(value || '').trim().toUpperCase();
  if (!allowed.has(output)) throw new OrganizationAdminError(400, code, 'Invalid value.');
  return output;
}

function sanitizePermissions(input: unknown): string[] {
  const list = Array.isArray(input) ? input : [];
  const cleaned = [...new Set(list.map((value) => String(value).trim().toUpperCase()))];
  for (const permission of cleaned) {
    if (!ALLOWED_PERMISSIONS.has(permission)) throw new OrganizationAdminError(400, 'INVALID_PERMISSION', `Unknown permission ${permission}.`);
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Organizational units <-> workspace linkage
// ---------------------------------------------------------------------------

export async function linkUnitToWorkspace(actor: InternalActor, groupId: string, workspaceId: string, prisma: Prisma = defaultPrisma) {
  requireAdmin(actor);
  const workspace = await requireOrgWorkspace(workspaceId, prisma);
  const group = await prisma.clientOrganizationGroup.findUnique({ where: { id: groupId }, select: { id: true, clientId: true, workspaceId: true } });
  if (!group) throw new OrganizationAdminError(404, 'GROUP_NOT_FOUND', 'Organization unit not found.');
  if (group.clientId !== workspace.clientId) throw new OrganizationAdminError(400, 'GROUP_CLIENT_MISMATCH', 'Unit and workspace belong to different Clients.');
  if (group.workspaceId && group.workspaceId !== workspaceId) throw new OrganizationAdminError(409, 'GROUP_ALREADY_LINKED', 'Unit is already linked to another workspace.');
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.clientOrganizationGroup.update({ where: { id: groupId }, data: { workspaceId, revision: { increment: 1 } } });
    await tx.clientPortalWorkspaceEvent.create({ data: { workspaceId, actorId: actor.userId, action: 'UNIT_LINKED', metadataSafe: { groupId } } });
    return row;
  });
  return { id: updated.id, workspaceId: updated.workspaceId };
}

export async function unlinkUnitFromWorkspace(actor: InternalActor, groupId: string, prisma: Prisma = defaultPrisma) {
  requireAdmin(actor);
  const group = await prisma.clientOrganizationGroup.findUnique({ where: { id: groupId }, select: { id: true, workspaceId: true } });
  if (!group) throw new OrganizationAdminError(404, 'GROUP_NOT_FOUND', 'Organization unit not found.');
  if (!group.workspaceId) return { id: group.id, workspaceId: null };
  const workspaceId = group.workspaceId;
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.clientOrganizationGroup.update({ where: { id: groupId }, data: { workspaceId: null, revision: { increment: 1 } } });
    await tx.clientPortalWorkspaceEvent.create({ data: { workspaceId, actorId: actor.userId, action: 'UNIT_UNLINKED', metadataSafe: { groupId } } });
    return row;
  });
  return { id: updated.id, workspaceId: updated.workspaceId };
}

export async function listWorkspaceUnits(actor: InternalActor, workspaceId: string, prisma: Prisma = defaultPrisma) {
  requireAdmin(actor);
  await requireOrgWorkspace(workspaceId, prisma);
  const groups = await prisma.clientOrganizationGroup.findMany({ where: { workspaceId }, orderBy: { name: 'asc' }, select: { id: true, name: true, status: true, descriptionSafe: true } });
  return { items: groups };
}

// ---------------------------------------------------------------------------
// Case participants (grants)
// ---------------------------------------------------------------------------

export async function createParticipant(actor: InternalActor, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireAdmin(actor);
  const workspaceId = String(input.workspaceId || '');
  const caseId = String(input.caseId || '');
  const workspace = await requireOrgWorkspace(workspaceId, prisma);
  const participantRole = enumValue(input.participantRole, PARTICIPANT_ROLES, 'INVALID_PARTICIPANT_ROLE');
  const permissions = sanitizePermissions(input.permissions);
  const caseRow = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, clientId: true } });
  if (!caseRow) throw new OrganizationAdminError(404, 'CASE_NOT_FOUND', 'Case not found.');
  if (caseRow.clientId !== workspace.clientId) throw new OrganizationAdminError(400, 'CASE_CLIENT_MISMATCH', 'Case is outside the workspace Client.');
  const identity = input.clientPortalIdentityId
    ? await prisma.clientPortalIdentity.findUnique({ where: { id: String(input.clientPortalIdentityId) }, select: { id: true } })
    : await prisma.clientPortalIdentity.findUnique({ where: { normalizedEmail: String(input.email || '').trim().toLowerCase() }, select: { id: true } });
  if (!identity) throw new OrganizationAdminError(404, 'IDENTITY_NOT_FOUND', 'Portal identity not found.');
  const membership = await prisma.clientPortalWorkspaceMembership.findFirst({ where: { clientPortalIdentityId: identity.id, workspaceId, status: 'ACTIVE' }, select: { id: true } });
  if (!membership) throw new OrganizationAdminError(409, 'IDENTITY_NOT_WORKSPACE_MEMBER', 'Identity must be an active workspace member first.');
  const grant = await prisma.$transaction(async (tx) => {
    const created = await tx.clientPortalGrant.create({ data: {
      clientPortalIdentityId: identity.id,
      workspaceId,
      clientId: workspace.clientId,
      caseId,
      participantRole: participantRole as never,
      isRequester: participantRole === 'REQUESTER',
      permissions: permissions as never,
      status: 'ACTIVE',
      invitedById: actor.userId,
      activatedAt: new Date(),
    } });
    await tx.clientPublicationEvent.create({ data: { action: 'GRANT_ACTIVATED', actorId: actor.userId, caseId, clientId: workspace.clientId, grantId: created.id, toStatus: 'ACTIVE', metadataSafe: { participantRole } } });
    return created;
  });
  return { id: grant.id, participantRole, permissions, status: 'ACTIVE' };
}

export async function updateParticipant(actor: InternalActor, grantId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireAdmin(actor);
  const grant = await prisma.clientPortalGrant.findUnique({ where: { id: grantId }, select: { id: true, revision: true, caseId: true, clientId: true } });
  if (!grant) throw new OrganizationAdminError(404, 'GRANT_NOT_FOUND', 'Participant grant not found.');
  if (input.revision != null && Number(input.revision) !== grant.revision) throw new OrganizationAdminError(409, 'GRANT_REVISION_CONFLICT', 'Participant changed. Reload and retry.');
  const participantRole = input.participantRole == null ? undefined : enumValue(input.participantRole, PARTICIPANT_ROLES, 'INVALID_PARTICIPANT_ROLE');
  const permissions = input.permissions == null ? undefined : sanitizePermissions(input.permissions);
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.clientPortalGrant.update({ where: { id: grantId }, data: {
      ...(participantRole ? { participantRole: participantRole as never, isRequester: participantRole === 'REQUESTER' } : {}),
      ...(permissions ? { permissions: permissions as never } : {}),
      revision: { increment: 1 },
    } });
    await tx.clientPublicationEvent.create({ data: { action: 'DRAFT_UPDATED', actorId: actor.userId, caseId: grant.caseId, clientId: grant.clientId, grantId, metadataSafe: { participantRole: participantRole ?? null } } });
    return row;
  });
  return { id: updated.id, revision: updated.revision };
}

export async function revokeParticipant(actor: InternalActor, grantId: string, prisma: Prisma = defaultPrisma) {
  requireAdmin(actor);
  const grant = await prisma.clientPortalGrant.findUnique({ where: { id: grantId }, select: { id: true, caseId: true, clientId: true } });
  if (!grant) throw new OrganizationAdminError(404, 'GRANT_NOT_FOUND', 'Participant grant not found.');
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.clientPortalGrant.update({ where: { id: grantId }, data: { status: 'REVOKED', revokedAt: new Date(), revokedById: actor.userId, revision: { increment: 1 } } });
    await tx.clientPublicationEvent.create({ data: { action: 'GRANT_REVOKED', actorId: actor.userId, caseId: grant.caseId, clientId: grant.clientId, grantId, toStatus: 'REVOKED' } });
    return row;
  });
  return { id: updated.id, status: 'REVOKED' };
}

export async function listParticipants(actor: InternalActor, workspaceId: string, caseId: string, prisma: Prisma = defaultPrisma) {
  requireAdmin(actor);
  await requireOrgWorkspace(workspaceId, prisma);
  const grants = await prisma.clientPortalGrant.findMany({
    where: { workspaceId, caseId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, clientPortalIdentityId: true, participantRole: true, isRequester: true, permissions: true, status: true, revision: true },
  });
  return { items: grants };
}

// ---------------------------------------------------------------------------
// Leadership summary scopes
// ---------------------------------------------------------------------------

export async function createSummaryScope(actor: InternalActor, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireAdmin(actor);
  const workspaceId = String(input.workspaceId || '');
  const workspace = await requireOrgWorkspace(workspaceId, prisma);
  const scopeType = enumValue(input.scopeType, new Set(['UNIT', 'ORGANIZATION']), 'INVALID_SCOPE_TYPE');
  const identity = input.clientPortalIdentityId
    ? await prisma.clientPortalIdentity.findUnique({ where: { id: String(input.clientPortalIdentityId) }, select: { id: true } })
    : await prisma.clientPortalIdentity.findUnique({ where: { normalizedEmail: String(input.email || '').trim().toLowerCase() }, select: { id: true } });
  if (!identity) throw new OrganizationAdminError(404, 'IDENTITY_NOT_FOUND', 'Portal identity not found.');
  const membership = await prisma.clientPortalWorkspaceMembership.findFirst({ where: { clientPortalIdentityId: identity.id, workspaceId, status: 'ACTIVE' }, select: { id: true } });
  if (!membership) throw new OrganizationAdminError(409, 'IDENTITY_NOT_WORKSPACE_MEMBER', 'Identity must be an active workspace member first.');
  let organizationGroupId: string | null = null;
  if (scopeType === 'UNIT') {
    organizationGroupId = String(input.organizationGroupId || '');
    const group = await prisma.clientOrganizationGroup.findFirst({ where: { id: organizationGroupId, workspaceId, clientId: workspace.clientId, status: 'ACTIVE' }, select: { id: true } });
    if (!group) throw new OrganizationAdminError(400, 'UNIT_SCOPE_REQUIRES_GROUP', 'A valid workspace organization unit is required for a UNIT scope.');
  }
  const scope = await prisma.$transaction(async (tx) => {
    const created = await tx.clientPortalSummaryScope.create({ data: {
      workspaceMembershipId: membership.id,
      workspaceId,
      organizationGroupId,
      scopeType: scopeType as never,
      status: 'ACTIVE',
      approvedById: actor.userId,
    } });
    await tx.clientPortalWorkspaceEvent.create({ data: { workspaceId, membershipId: membership.id, actorId: actor.userId, action: `SUMMARY_SCOPE_${scopeType}_GRANTED`, metadataSafe: { organizationGroupId } } });
    return created;
  });
  return { id: scope.id, scopeType, organizationGroupId, status: 'ACTIVE' };
}

export async function transitionSummaryScope(actor: InternalActor, scopeId: string, action: 'suspend' | 'revoke', prisma: Prisma = defaultPrisma) {
  requireAdmin(actor);
  const scope = await prisma.clientPortalSummaryScope.findUnique({ where: { id: scopeId }, select: { id: true, workspaceId: true, workspaceMembershipId: true } });
  if (!scope) throw new OrganizationAdminError(404, 'SUMMARY_SCOPE_NOT_FOUND', 'Summary scope not found.');
  const status = action === 'suspend' ? 'SUSPENDED' : 'REVOKED';
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.clientPortalSummaryScope.update({ where: { id: scopeId }, data: {
      status: status as never,
      suspendedAt: status === 'SUSPENDED' ? now : null,
      suspendedById: status === 'SUSPENDED' ? actor.userId : null,
      revokedAt: status === 'REVOKED' ? now : null,
      revokedById: status === 'REVOKED' ? actor.userId : null,
      revision: { increment: 1 },
    } });
    await tx.clientPortalWorkspaceEvent.create({ data: { workspaceId: scope.workspaceId, membershipId: scope.workspaceMembershipId, actorId: actor.userId, action: `SUMMARY_SCOPE_${status}` } });
    return row;
  });
  return { id: updated.id, status };
}

export async function listSummaryScopes(actor: InternalActor, workspaceId: string, prisma: Prisma = defaultPrisma) {
  requireAdmin(actor);
  await requireOrgWorkspace(workspaceId, prisma);
  const scopes = await prisma.clientPortalSummaryScope.findMany({ where: { workspaceId }, orderBy: { updatedAt: 'desc' }, select: { id: true, workspaceMembershipId: true, scopeType: true, organizationGroupId: true, status: true, revision: true } });
  return { items: scopes };
}
