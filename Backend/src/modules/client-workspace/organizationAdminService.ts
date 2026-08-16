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
import crypto from 'crypto';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';

type Prisma = typeof defaultPrisma;
type InternalActor = { userId: string; role?: string | null };

const ADMIN_ROLES = new Set(['ADMIN', 'PARTNER']);
const PARTICIPANT_ROLES = new Set(['REQUESTER', 'CLIENT_OWNER', 'PARTICIPANT', 'OBSERVER']);
const UNIT_ROLES = new Set(['MEMBER', 'CONTACT', 'APPROVER', 'MANAGER']);
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

async function requireSummaryWorkspace(workspaceId: string, prisma: Prisma): Promise<{ id: string; clientId: string; mode: string }> {
  const workspace = await prisma.clientPortalWorkspace.findUnique({ where: { id: workspaceId }, select: { id: true, clientId: true, mode: true, status: true } });
  if (!workspace) throw new OrganizationAdminError(404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
  const mode = String(workspace.mode);
  if (mode !== 'ORGANIZATION' && mode !== 'CASE_RELAY') throw new OrganizationAdminError(400, 'WORKSPACE_NOT_SUMMARY_CAPABLE', 'Only organization and case-relay workspaces support leadership summary scopes.');
  if (String(workspace.status) === 'ARCHIVED') throw new OrganizationAdminError(409, 'WORKSPACE_ARCHIVED', 'Workspace is archived.');
  return { id: workspace.id, clientId: workspace.clientId, mode };
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

function samePermissions(left: unknown, right: unknown): boolean {
  const a = [...new Set((Array.isArray(left) ? left : []).map(String))].sort();
  const b = [...new Set((Array.isArray(right) ? right : []).map(String))].sort();
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function createOrReactivateParticipantInTransaction(actor: InternalActor, input: Record<string, unknown>, tx: any) {
  requireAdmin(actor);
  const workspaceId = String(input.workspaceId || '');
  const caseId = String(input.caseId || '');
  const participantRole = enumValue(input.participantRole, PARTICIPANT_ROLES, 'INVALID_PARTICIPANT_ROLE');
  const permissions = sanitizePermissions(input.permissions);
  if (!permissions.length) throw new OrganizationAdminError(400, 'PARTICIPANT_PERMISSIONS_REQUIRED', 'Participant permissions must be explicit.');
  const workspace = await tx.clientPortalWorkspace.findFirst({ where: { id: workspaceId, mode: 'ORGANIZATION', status: 'ACTIVE' }, select: { id: true, clientId: true } });
  if (!workspace) throw new OrganizationAdminError(409, 'WORKSPACE_NOT_ACTIVE', 'An active ORGANIZATION workspace is required.');
  const caseRow = await tx.case.findUnique({ where: { id: caseId }, select: { id: true, clientId: true, status: true } });
  if (!caseRow) throw new OrganizationAdminError(404, 'CASE_NOT_FOUND', 'Case not found.');
  if (caseRow.clientId !== workspace.clientId) throw new OrganizationAdminError(400, 'CASE_CLIENT_MISMATCH', 'Case is outside the workspace Client.');
  if (['ARCHIVED', 'CANCELLED'].includes(String(caseRow.status))) throw new OrganizationAdminError(409, 'CASE_NOT_ELIGIBLE', 'Case is not eligible for participant access.');
  const identity = input.clientPortalIdentityId
    ? await tx.clientPortalIdentity.findFirst({ where: { id: String(input.clientPortalIdentityId), status: 'ACTIVE' }, select: { id: true } })
    : await tx.clientPortalIdentity.findFirst({ where: { normalizedEmail: String(input.email || '').trim().toLowerCase(), status: 'ACTIVE' }, select: { id: true } });
  if (!identity) throw new OrganizationAdminError(404, 'IDENTITY_NOT_FOUND', 'Active portal identity not found.');
  const membership = await tx.clientPortalWorkspaceMembership.findFirst({
    where: { clientPortalIdentityId: identity.id, workspaceId, status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    select: { id: true },
  });
  if (!membership) throw new OrganizationAdminError(409, 'IDENTITY_NOT_WORKSPACE_MEMBER', 'Identity must be an active workspace member first.');
  const existing = await tx.clientPortalGrant.findFirst({
    where: { clientPortalIdentityId: identity.id, clientId: workspace.clientId, caseId },
    orderBy: { updatedAt: 'desc' },
  });
  if (existing?.status === 'ACTIVE') {
    if (existing.workspaceId !== workspaceId || String(existing.participantRole || '') !== participantRole || !samePermissions(existing.permissions, permissions)) {
      throw new OrganizationAdminError(409, 'PARTICIPANT_GRANT_CONFLICT', 'An incompatible active participant grant already exists.');
    }
    return { row: existing, idempotent: true, reactivated: false };
  }
  if (existing) {
    if (existing.workspaceId && existing.workspaceId !== workspaceId) throw new OrganizationAdminError(409, 'PARTICIPANT_GRANT_CONFLICT', 'The previous grant belongs to another workspace.');
    const row = await tx.clientPortalGrant.update({ where: { id: existing.id }, data: {
      workspaceId,
      participantRole: participantRole as never,
      isRequester: participantRole === 'REQUESTER',
      permissions: permissions as never,
      status: 'ACTIVE',
      activatedAt: new Date(),
      suspendedAt: null,
      suspendedById: null,
      revokedAt: null,
      revokedById: null,
      revocationReasonSafe: null,
      revision: { increment: 1 },
    } });
    await tx.clientPublicationEvent.create({ data: { action: 'GRANT_ACTIVATED', actorId: actor.userId, caseId, clientId: workspace.clientId, grantId: row.id, fromStatus: String(existing.status), toStatus: 'ACTIVE', metadataSafe: { participantRole } } });
    return { row, idempotent: false, reactivated: true };
  }
  const row = await tx.clientPortalGrant.create({ data: {
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
  await tx.clientPublicationEvent.create({ data: { action: 'GRANT_ACTIVATED', actorId: actor.userId, caseId, clientId: workspace.clientId, grantId: row.id, toStatus: 'ACTIVE', metadataSafe: { participantRole } } });
  return { row, idempotent: false, reactivated: false };
}

// ---------------------------------------------------------------------------
// Organizational units <-> workspace linkage
// ---------------------------------------------------------------------------

function text(value: unknown, field: string, max = 120): string {
  const output = String(value || '').trim();
  if (!output) throw new OrganizationAdminError(400, `${field.toUpperCase()}_REQUIRED`, `${field} is required.`);
  if (output.length > max) throw new OrganizationAdminError(400, `${field.toUpperCase()}_TOO_LONG`, `${field} is too long.`);
  return output;
}

export async function createWorkspaceUnit(actor: InternalActor, workspaceId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireAdmin(actor);
  const workspace = await requireOrgWorkspace(workspaceId, prisma);
  const name = text(input.name, 'name');
  const descriptionSafe = input.descriptionSafe == null ? null : String(input.descriptionSafe).trim().slice(0, 300) || null;
  const existing = await prisma.clientOrganizationGroup.findFirst({
    where: { clientId: workspace.clientId, workspaceId, name },
    select: { id: true, name: true, status: true, descriptionSafe: true },
  });
  if (existing) return existing;
  return prisma.$transaction(async (tx) => {
    const row = await tx.clientOrganizationGroup.create({
      data: { clientId: workspace.clientId, workspaceId, name, descriptionSafe, createdById: actor.userId },
      select: { id: true, name: true, status: true, descriptionSafe: true },
    });
    await tx.clientPortalWorkspaceEvent.create({ data: { workspaceId, actorId: actor.userId, action: 'UNIT_CREATED', metadataSafe: { groupId: row.id, name } } });
    return row;
  });
}

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
// Organization-unit memberships
// ---------------------------------------------------------------------------

function toUnitMembershipDto(row: any, unitNames: Map<string, string>, identity: any) {
  return {
    id: row.id,
    clientPortalIdentityId: row.clientPortalIdentityId,
    groupId: row.groupId,
    organizationGroupName: row.groupId ? unitNames.get(row.groupId) || null : null,
    unitRole: String(row.unitRole || 'MEMBER'),
    status: String(row.status || 'ACTIVE'),
    revision: row.revision,
    identityEmail: identity?.normalizedEmail || null,
    identityDisplayName: identity?.displayName || null,
    approvedAt: row.approvedAt,
    suspendedAt: row.suspendedAt,
    revokedAt: row.revokedAt,
  };
}

async function requireWorkspaceMembership(workspaceId: string, workspaceClientId: string, workspaceMembershipId: string, prisma: Prisma) {
  const membership = await prisma.clientPortalWorkspaceMembership.findUnique({
    where: { id: workspaceMembershipId },
    select: { id: true, clientPortalIdentityId: true, workspaceId: true, status: true, expiresAt: true },
  });
  if (!membership) throw new OrganizationAdminError(404, 'WORKSPACE_MEMBERSHIP_NOT_FOUND', 'Workspace membership not found.');
  if (membership.workspaceId !== workspaceId) throw new OrganizationAdminError(400, 'WORKSPACE_MEMBERSHIP_MISMATCH', 'Member belongs to another customer surface.');
  if (String(membership.status) !== 'ACTIVE' || (membership.expiresAt && membership.expiresAt <= new Date())) {
    throw new OrganizationAdminError(409, 'WORKSPACE_MEMBERSHIP_NOT_ACTIVE', 'Only an active workspace member can be assigned to an organizational unit.');
  }
  const identity = await prisma.clientPortalIdentity.findUnique({
    where: { id: membership.clientPortalIdentityId },
    select: { id: true, normalizedEmail: true, displayName: true, status: true },
  });
  if (!identity || String(identity.status) !== 'ACTIVE') throw new OrganizationAdminError(409, 'IDENTITY_NOT_ACTIVE', 'Only an active portal identity can be assigned to an organizational unit.');
  const orgMembership = await prisma.clientOrganizationMembership.findFirst({
    where: { clientPortalIdentityId: identity.id, clientId: workspaceClientId },
    select: { id: true },
  });
  if (!orgMembership) throw new OrganizationAdminError(409, 'CLIENT_ORG_MEMBERSHIP_REQUIRED', 'The user must belong to this Client before unit assignment.');
  return { membership, identity };
}

export async function listUnitMemberships(actor: InternalActor, workspaceId: string, workspaceMembershipId: string, prisma: Prisma = defaultPrisma) {
  requireAdmin(actor);
  const workspace = await requireOrgWorkspace(workspaceId, prisma);
  const { membership, identity } = await requireWorkspaceMembership(workspaceId, workspace.clientId, workspaceMembershipId, prisma);
  const rows = await prisma.clientOrganizationMembership.findMany({
    where: { clientPortalIdentityId: membership.clientPortalIdentityId, clientId: workspace.clientId, groupId: { not: null } },
    orderBy: { updatedAt: 'desc' },
  });
  const groupIds = rows.map((row) => row.groupId).filter((value): value is string => Boolean(value));
  const groups = await prisma.clientOrganizationGroup.findMany({ where: { id: { in: groupIds }, workspaceId, clientId: workspace.clientId }, select: { id: true, name: true } });
  const unitNames = new Map(groups.map((group) => [group.id, group.name]));
  return { items: rows.filter((row) => row.groupId && unitNames.has(row.groupId)).map((row) => toUnitMembershipDto(row, unitNames, identity)) };
}

export async function assignUnitMembership(actor: InternalActor, workspaceId: string, workspaceMembershipId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireAdmin(actor);
  const workspace = await requireOrgWorkspace(workspaceId, prisma);
  const { membership, identity } = await requireWorkspaceMembership(workspaceId, workspace.clientId, workspaceMembershipId, prisma);
  const groupId = String(input.groupId || '').trim();
  const unitRole = enumValue(input.unitRole || 'MEMBER', UNIT_ROLES, 'INVALID_UNIT_ROLE');
  if (!groupId) throw new OrganizationAdminError(400, 'UNIT_REQUIRED', 'Organization unit is required.');
  const group = await prisma.clientOrganizationGroup.findFirst({ where: { id: groupId, workspaceId, clientId: workspace.clientId }, select: { id: true, name: true, status: true } });
  if (!group) throw new OrganizationAdminError(404, 'UNIT_NOT_FOUND', 'Organization unit is not available for this customer surface.');
  if (String(group.status) !== 'ACTIVE') throw new OrganizationAdminError(409, 'UNIT_ARCHIVED_OR_INACTIVE', 'Inactive organization units cannot receive members.');

  const row = await prisma.$transaction(async (tx) => {
    const existing = await tx.clientOrganizationMembership.findFirst({
      where: { clientPortalIdentityId: membership.clientPortalIdentityId, clientId: workspace.clientId, groupId },
      orderBy: { updatedAt: 'desc' },
    });
    if (existing) {
      const updated = await tx.clientOrganizationMembership.update({ where: { id: existing.id }, data: {
        unitRole: unitRole as never,
        status: 'ACTIVE',
        suspendedAt: null,
        suspendedById: null,
        revokedAt: null,
        revokedById: null,
        revision: { increment: 1 },
      } });
      await tx.clientPortalWorkspaceEvent.create({ data: { workspaceId, membershipId: membership.id, actorId: actor.userId, action: 'UNIT_MEMBERSHIP_ACTIVATED', fromStatus: String(existing.status), toStatus: 'ACTIVE', metadataSafe: { groupId, unitRole } } });
      return updated;
    }
    const created = await tx.clientOrganizationMembership.create({ data: {
      clientPortalIdentityId: membership.clientPortalIdentityId,
      clientId: workspace.clientId,
      groupId,
      unitRole: unitRole as never,
      status: 'ACTIVE',
      approvedFromRequestId: `admin-unit-${crypto.randomUUID()}`,
      approvedById: actor.userId,
      approvedAt: new Date(),
    } });
    await tx.clientPortalWorkspaceEvent.create({ data: { workspaceId, membershipId: membership.id, actorId: actor.userId, action: 'UNIT_MEMBERSHIP_CREATED', toStatus: 'ACTIVE', metadataSafe: { groupId, unitRole } } });
    return created;
  });
  return toUnitMembershipDto(row, new Map([[group.id, group.name]]), identity);
}

export async function revokeUnitMembership(actor: InternalActor, unitMembershipId: string, prisma: Prisma = defaultPrisma) {
  requireAdmin(actor);
  const existing = await prisma.clientOrganizationMembership.findUnique({ where: { id: unitMembershipId } });
  if (!existing) throw new OrganizationAdminError(404, 'UNIT_MEMBERSHIP_NOT_FOUND', 'Unit membership not found.');
  if (existing.status === 'REVOKED') return { id: existing.id, status: 'REVOKED', revision: existing.revision };
  const group = existing.groupId ? await prisma.clientOrganizationGroup.findUnique({ where: { id: existing.groupId }, select: { workspaceId: true } }) : null;
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.clientOrganizationMembership.update({ where: { id: unitMembershipId }, data: { status: 'REVOKED', revokedAt: new Date(), revokedById: actor.userId, revision: { increment: 1 } } });
    if (group?.workspaceId) {
      await tx.clientPortalWorkspaceEvent.create({ data: { workspaceId: group.workspaceId, actorId: actor.userId, action: 'UNIT_MEMBERSHIP_REVOKED', fromStatus: String(existing.status), toStatus: 'REVOKED', metadataSafe: { groupId: existing.groupId, unitMembershipId } } });
    }
    return row;
  });
  return { id: updated.id, status: 'REVOKED', revision: updated.revision };
}

// ---------------------------------------------------------------------------
// Case participants (grants)
// ---------------------------------------------------------------------------

export async function createParticipant(actor: InternalActor, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  const result = await prisma.$transaction((tx) => createOrReactivateParticipantInTransaction(actor, input, tx));
  return { id: result.row.id, participantRole: String(result.row.participantRole), permissions: result.row.permissions, status: 'ACTIVE', idempotent: result.idempotent, reactivated: result.reactivated };
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
  const workspace = await requireSummaryWorkspace(workspaceId, prisma);
  const scopeType = enumValue(input.scopeType, new Set(['UNIT', 'ORGANIZATION']), 'INVALID_SCOPE_TYPE');
  if (workspace.mode === 'CASE_RELAY' && scopeType !== 'ORGANIZATION') throw new OrganizationAdminError(400, 'CASE_RELAY_REQUIRES_ORGANIZATION_SCOPE', 'Case-relay summary scopes cover the assigned organization oversight surface.');
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
  await requireSummaryWorkspace(workspaceId, prisma);
  const scopes = await prisma.clientPortalSummaryScope.findMany({ where: { workspaceId }, orderBy: { updatedAt: 'desc' }, select: { id: true, workspaceMembershipId: true, scopeType: true, organizationGroupId: true, status: true, revision: true } });
  return { items: scopes };
}
