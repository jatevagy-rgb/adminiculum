import crypto from 'crypto';
import { ClientPortalSession } from '../../middleware/clientPortalAuth';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';

type Prisma = typeof defaultPrisma;
type InternalActor = { userId: string; role?: string | null };

const INTERNAL_ROLES = new Set(['ADMIN', 'PARTNER']);
const WORKSPACE_MODES = new Set(['INDIVIDUAL', 'ORGANIZATION', 'CASE_RELAY']);
const COMMUNICATION_MODES = new Set(['PORTAL_PRIMARY', 'EMAIL_LINKED', 'EXTERNAL_ONLY']);
const CONNECTED_STATES = new Set(['NOT_CONFIGURED', 'CONFIGURATION_REQUIRED', 'READY', 'DISABLED']);
const MEMBERSHIP_ROLES = new Set(['MEMBER', 'REPRESENTATIVE', 'APPROVER']);

export class ClientWorkspaceError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'ClientWorkspaceError';
  }
}

export type PortalWorkspaceCapabilities = {
  home: boolean;
  matters: boolean;
  tasks: boolean;
  documents: boolean;
  messages: boolean;
};

export type ResolvedPortalWorkspace = {
  id: string;
  publicReference: string;
  clientId: string;
  mode: string;
  membershipId: string;
  membershipRole: string;
  capabilities: PortalWorkspaceCapabilities;
};

function requireInternal(actor: InternalActor): void {
  if (!actor.userId || !INTERNAL_ROLES.has(String(actor.role || ''))) {
    throw new ClientWorkspaceError(403, 'WORKSPACE_ADMIN_FORBIDDEN', 'Workspace administration requires an authorized internal actor.');
  }
}

function safeText(value: unknown, field: string, max: number): string {
  const output = String(value || '').trim();
  if (!output) throw new ClientWorkspaceError(400, 'WORKSPACE_INPUT_REQUIRED', `${field} is required.`);
  if (output.length > max) throw new ClientWorkspaceError(400, 'WORKSPACE_INPUT_TOO_LONG', `${field} is too long.`);
  return output;
}

function enumValue(value: unknown, values: Set<string>, field: string): string {
  const output = String(value || '').trim().toUpperCase();
  if (!values.has(output)) throw new ClientWorkspaceError(400, 'WORKSPACE_INPUT_INVALID', `${field} is invalid.`);
  return output;
}

function capabilitiesFor(mode: string, permissions: string[]): PortalWorkspaceCapabilities {
  const set = new Set(permissions);
  const matters = set.has('MATTER_READ');
  return {
    home: true,
    matters,
    tasks: mode !== 'CASE_RELAY' && set.has('ACTION_REQUEST_READ'),
    documents: mode !== 'CASE_RELAY' && set.has('DOCUMENT_READ'),
    messages: mode !== 'CASE_RELAY' && (set.has('ACTION_REQUEST_READ') || set.has('ACTION_REQUEST_COMPLETE')),
  };
}

async function activeWorkspaceRows(identityId: string, db: Prisma = defaultPrisma) {
  const now = new Date();
  const memberships = await db.clientPortalWorkspaceMembership.findMany({
    where: {
      clientPortalIdentityId: identityId,
      status: 'ACTIVE',
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!memberships.length) return [];
  const workspaces = await db.clientPortalWorkspace.findMany({
    where: { id: { in: memberships.map((membership) => membership.workspaceId) }, status: 'ACTIVE' },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  const clients = await db.client.findMany({
    where: { id: { in: [...new Set(workspaces.map((workspace) => workspace.clientId))] } },
    select: { id: true, name: true },
  });
  const grants = await db.clientPortalGrant.findMany({
    where: {
      clientPortalIdentityId: identityId,
      workspaceId: { in: workspaces.map((workspace) => workspace.id) },
      status: 'ACTIVE',
      validFrom: { lte: now },
      OR: [{ validUntil: null }, { validUntil: { gt: now } }],
    },
    select: { workspaceId: true, permissions: true },
  });
  const membershipByWorkspace = new Map(memberships.map((membership) => [membership.workspaceId, membership]));
  const clientById = new Map(clients.map((client) => [client.id, client.name]));
  return workspaces.map((workspace) => {
    const membership = membershipByWorkspace.get(workspace.id)!;
    const permissions = [...new Set(grants.filter((grant) => grant.workspaceId === workspace.id).flatMap((grant) => grant.permissions.map(String)))];
    return {
      id: workspace.id,
      publicReference: workspace.publicReference,
      clientId: workspace.clientId,
      name: workspace.name,
      clientDisplayName: clientById.get(workspace.clientId) || 'Ügyfél',
      mode: String(workspace.mode),
      status: String(workspace.status),
      communicationMode: String(workspace.communicationMode),
      connectedSystemState: String(workspace.connectedSystemState),
      membershipId: membership.id,
      membershipRole: String(membership.role),
      capabilities: capabilitiesFor(String(workspace.mode), permissions),
    };
  });
}

export async function listAuthorizedPortalWorkspaces(session: ClientPortalSession, db: Prisma = defaultPrisma) {
  if (session.status !== 'ACTIVE' || !session.emailVerified) {
    throw new ClientWorkspaceError(403, 'CLIENT_IDENTITY_NOT_ACTIVE', 'Client identity is not active.');
  }
  return activeWorkspaceRows(session.clientPortalIdentityId, db);
}

export async function getPortalIdentityContext(session: ClientPortalSession, requestedReference?: string | null, db: Prisma = defaultPrisma) {
  const workspaces = await listAuthorizedPortalWorkspaces(session, db);
  const requested = String(requestedReference || '').trim();
  const selected = requested
    ? workspaces.find((workspace) => workspace.publicReference === requested)
    : workspaces.length === 1 ? workspaces[0] : undefined;
  if (requested && !selected) throw new ClientWorkspaceError(403, 'CLIENT_WORKSPACE_FORBIDDEN', 'The requested workspace is not available.');
  return {
    identity: { displayName: session.displayName, email: session.normalizedEmail, accountType: session.accountType },
    state: workspaces.length === 0 ? 'NO_ACCESS' : selected ? 'READY' : 'SELECTION_REQUIRED',
    workspaces: workspaces.map(({ id: _id, clientId: _clientId, membershipId: _membershipId, ...workspace }) => workspace),
    selectedWorkspace: selected ? (({ id: _id, clientId: _clientId, membershipId: _membershipId, ...workspace }) => workspace)(selected) : null,
  };
}

export async function resolvePortalWorkspace(session: ClientPortalSession, requestedReference: unknown, db: Prisma = defaultPrisma): Promise<ResolvedPortalWorkspace> {
  const workspaces = await listAuthorizedPortalWorkspaces(session, db);
  const requested = String(requestedReference || '').trim();
  if (!workspaces.length) throw new ClientWorkspaceError(403, 'CLIENT_WORKSPACE_MEMBERSHIP_REQUIRED', 'Active workspace membership is required.');
  if (!requested && workspaces.length > 1) throw new ClientWorkspaceError(409, 'CLIENT_WORKSPACE_SELECTION_REQUIRED', 'Select an authorized workspace.');
  const selected = requested ? workspaces.find((workspace) => workspace.publicReference === requested) : workspaces[0];
  if (!selected) throw new ClientWorkspaceError(403, 'CLIENT_WORKSPACE_FORBIDDEN', 'The requested workspace is not available.');
  return selected;
}

export async function listAdminWorkspaces(actor: InternalActor, clientId?: string, db: Prisma = defaultPrisma) {
  requireInternal(actor);
  const workspaces = await db.clientPortalWorkspace.findMany({
    where: clientId ? { clientId } : undefined,
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
  });
  const workspaceIds = workspaces.map((workspace) => workspace.id);
  const [memberships, invitations, clients, events] = await Promise.all([
    db.clientPortalWorkspaceMembership.findMany({ where: { workspaceId: { in: workspaceIds } } }),
    db.clientPortalInvitation.findMany({ where: { workspaceId: { in: workspaceIds }, status: 'ACTIVE' } }),
    db.client.findMany({ where: { id: { in: [...new Set(workspaces.map((workspace) => workspace.clientId))] } }, select: { id: true, name: true } }),
    db.clientPortalWorkspaceEvent.findMany({ where: { workspaceId: { in: workspaceIds } }, orderBy: { createdAt: 'desc' }, take: 200 }),
  ]);
  const clientNames = new Map(clients.map((client) => [client.id, client.name]));
  return { items: workspaces.map((workspace) => ({
    ...workspace,
    clientName: clientNames.get(workspace.clientId) || null,
    activeMembershipCount: memberships.filter((membership) => membership.workspaceId === workspace.id && membership.status === 'ACTIVE').length,
    pendingInvitationCount: invitations.filter((invitation) => invitation.workspaceId === workspace.id).length,
    pendingApprovalCount: memberships.filter((membership) => membership.workspaceId === workspace.id && membership.status === 'PENDING_APPROVAL').length,
    memberships: memberships.filter((membership) => membership.workspaceId === workspace.id),
    events: events.filter((event) => event.workspaceId === workspace.id),
  })) };
}

export async function createWorkspace(actor: InternalActor, input: Record<string, unknown>, db: Prisma = defaultPrisma) {
  requireInternal(actor);
  const clientId = safeText(input.clientId, 'clientId', 80);
  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) throw new ClientWorkspaceError(404, 'WORKSPACE_CLIENT_NOT_FOUND', 'Client not found.');
  const mode = enumValue(input.mode, WORKSPACE_MODES, 'mode') as 'INDIVIDUAL' | 'ORGANIZATION' | 'CASE_RELAY';
  const communicationMode = enumValue(input.communicationMode || 'PORTAL_PRIMARY', COMMUNICATION_MODES, 'communicationMode') as 'PORTAL_PRIMARY' | 'EMAIL_LINKED' | 'EXTERNAL_ONLY';
  const connectedSystemState = enumValue(input.connectedSystemState || (mode === 'CASE_RELAY' ? 'CONFIGURATION_REQUIRED' : 'NOT_CONFIGURED'), CONNECTED_STATES, 'connectedSystemState') as 'NOT_CONFIGURED' | 'CONFIGURATION_REQUIRED' | 'READY' | 'DISABLED';
  const workspace = await db.clientPortalWorkspace.create({ data: {
    clientId,
    name: safeText(input.name, 'name', 180),
    mode,
    communicationMode,
    connectedSystemState,
    publicReference: crypto.randomBytes(18).toString('base64url'),
    createdById: actor.userId,
  } });
  await db.clientPortalWorkspaceEvent.create({ data: { workspaceId: workspace.id, actorId: actor.userId, action: 'WORKSPACE_CREATED', toStatus: workspace.status } });
  return workspace;
}

export async function transitionWorkspace(actor: InternalActor, workspaceId: string, action: 'activate' | 'suspend' | 'archive', revision: unknown, db: Prisma = defaultPrisma) {
  requireInternal(actor);
  const existing = await db.clientPortalWorkspace.findUnique({ where: { id: workspaceId } });
  if (!existing) throw new ClientWorkspaceError(404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
  if (Number(revision) !== existing.revision) throw new ClientWorkspaceError(409, 'WORKSPACE_REVISION_CONFLICT', 'Workspace changed. Reload and retry.');
  const status = action === 'activate' ? 'ACTIVE' : action === 'suspend' ? 'SUSPENDED' : 'ARCHIVED';
  const updated = await db.$transaction(async (tx) => {
    const row = await tx.clientPortalWorkspace.update({ where: { id: workspaceId }, data: { status, archivedAt: status === 'ARCHIVED' ? new Date() : null, revision: { increment: 1 } } });
    await tx.clientPortalWorkspaceEvent.create({ data: { workspaceId, actorId: actor.userId, action: `WORKSPACE_${status}`, fromStatus: existing.status, toStatus: status } });
    return row;
  });
  return updated;
}

export async function updateWorkspace(actor: InternalActor, workspaceId: string, input: Record<string, unknown>, db: Prisma = defaultPrisma) {
  requireInternal(actor);
  const existing = await db.clientPortalWorkspace.findUnique({ where: { id: workspaceId } });
  if (!existing) throw new ClientWorkspaceError(404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
  if (Number(input.revision) !== existing.revision) throw new ClientWorkspaceError(409, 'WORKSPACE_REVISION_CONFLICT', 'Workspace changed. Reload and retry.');
  const name = input.name == null ? existing.name : safeText(input.name, 'name', 180);
  const communicationMode = input.communicationMode == null ? existing.communicationMode : enumValue(input.communicationMode, COMMUNICATION_MODES, 'communicationMode') as typeof existing.communicationMode;
  const connectedSystemState = input.connectedSystemState == null ? existing.connectedSystemState : enumValue(input.connectedSystemState, CONNECTED_STATES, 'connectedSystemState') as typeof existing.connectedSystemState;
  return db.$transaction(async (tx) => {
    const workspace = await tx.clientPortalWorkspace.update({ where: { id: workspaceId }, data: { name, communicationMode, connectedSystemState, revision: { increment: 1 } } });
    await tx.clientPortalWorkspaceEvent.create({ data: { workspaceId, actorId: actor.userId, action: 'WORKSPACE_SETTINGS_UPDATED', fromStatus: existing.status, toStatus: existing.status, metadataSafe: { communicationMode, connectedSystemState } } });
    return workspace;
  });
}

export async function inviteWorkspaceMember(actor: InternalActor, workspaceId: string, input: Record<string, unknown>, db: Prisma = defaultPrisma) {
  requireInternal(actor);
  const workspace = await db.clientPortalWorkspace.findUnique({ where: { id: workspaceId } });
  if (!workspace || workspace.status === 'ARCHIVED') throw new ClientWorkspaceError(404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
  const normalizedEmail = safeText(input.email, 'email', 320).toLowerCase();
  const role = enumValue(input.role || 'MEMBER', MEMBERSHIP_ROLES, 'role') as 'MEMBER' | 'REPRESENTATIVE' | 'APPROVER';
  const identity = await db.clientPortalIdentity.findUnique({ where: { normalizedEmail } });
  if (identity) {
    const membership = await db.clientPortalWorkspaceMembership.upsert({
      where: { clientPortalIdentityId_workspaceId: { clientPortalIdentityId: identity.id, workspaceId } },
      create: { clientPortalIdentityId: identity.id, workspaceId, status: 'PENDING_APPROVAL', role, invitedAt: new Date(), invitedById: actor.userId },
      update: { status: 'PENDING_APPROVAL', role, invitedAt: new Date(), invitedById: actor.userId, approvedAt: null, approvedById: null, revokedAt: null, revokedById: null, suspendedAt: null, suspendedById: null, revision: { increment: 1 } },
    });
    await db.clientPortalWorkspaceEvent.create({ data: { workspaceId, membershipId: membership.id, actorId: actor.userId, action: 'MEMBERSHIP_INVITED', toStatus: 'PENDING_APPROVAL' } });
    return { state: 'PENDING_APPROVAL', membershipId: membership.id };
  }
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const invitation = await db.clientPortalInvitation.create({ data: {
    clientId: workspace.clientId,
    workspaceId,
    intendedEmail: normalizedEmail,
    tokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdById: actor.userId,
  } });
  await db.clientPortalWorkspaceEvent.create({ data: { workspaceId, actorId: actor.userId, action: 'INVITATION_CREATED', metadataSafe: { invitationId: invitation.id } } });
  return { state: 'INVITED', invitationId: invitation.id, invitationToken: rawToken, expiresAt: invitation.expiresAt };
}

export async function transitionWorkspaceMembership(actor: InternalActor, membershipId: string, action: 'approve' | 'suspend' | 'revoke', revision: unknown, db: Prisma = defaultPrisma) {
  requireInternal(actor);
  const existing = await db.clientPortalWorkspaceMembership.findUnique({ where: { id: membershipId } });
  if (!existing) throw new ClientWorkspaceError(404, 'WORKSPACE_MEMBERSHIP_NOT_FOUND', 'Workspace membership not found.');
  if (Number(revision) !== existing.revision) throw new ClientWorkspaceError(409, 'WORKSPACE_REVISION_CONFLICT', 'Membership changed. Reload and retry.');
  const status = action === 'approve' ? 'ACTIVE' : action === 'suspend' ? 'SUSPENDED' : 'REVOKED';
  const now = new Date();
  return db.$transaction(async (tx) => {
    const membership = await tx.clientPortalWorkspaceMembership.update({ where: { id: membershipId }, data: {
      status,
      approvedAt: status === 'ACTIVE' ? now : existing.approvedAt,
      approvedById: status === 'ACTIVE' ? actor.userId : existing.approvedById,
      suspendedAt: status === 'SUSPENDED' ? now : null,
      suspendedById: status === 'SUSPENDED' ? actor.userId : null,
      revokedAt: status === 'REVOKED' ? now : null,
      revokedById: status === 'REVOKED' ? actor.userId : null,
      revision: { increment: 1 },
    } });
    await tx.clientPortalWorkspaceEvent.create({ data: { workspaceId: existing.workspaceId, membershipId, actorId: actor.userId, action: `MEMBERSHIP_${status}`, fromStatus: existing.status, toStatus: status } });
    return membership;
  });
}
