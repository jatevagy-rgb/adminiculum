import crypto from 'crypto';
import { ClientPortalSession } from '../../middleware/clientPortalAuth';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { isCapabilityEnabled } from '../client-interaction/gates';
import { enqueueNotification, processDelivery } from '../client-interaction/notificationService';

type Prisma = typeof defaultPrisma;
type InternalActor = { userId: string; role?: string | null };

const INTERNAL_ROLES = new Set(['ADMIN', 'PARTNER']);
const WORKSPACE_MODES = new Set(['INDIVIDUAL', 'ORGANIZATION', 'CASE_RELAY']);
const COMMUNICATION_MODES = new Set(['PORTAL_PRIMARY', 'EMAIL_LINKED', 'EXTERNAL_ONLY']);
const CONNECTED_STATES = new Set(['NOT_CONFIGURED', 'CONFIGURATION_REQUIRED', 'READY', 'DISABLED']);
const MEMBERSHIP_ROLES = new Set(['MEMBER', 'REPRESENTATIVE', 'APPROVER']);
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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
  intakes: boolean;
  leadership: boolean;
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

function optionalSafeText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ');
  return normalized ? normalized.slice(0, max) : null;
}

function parseInvitationExpiry(value: unknown): Date {
  if (value == null || value === '') return new Date(Date.now() + 7 * ONE_DAY_MS);
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
    throw new ClientWorkspaceError(400, 'INVITATION_EXPIRY_INVALID', 'Invitation expiry must be a future date.');
  }
  return parsed;
}

function capabilitiesFor(mode: string, permissions: string[], leadership: boolean): PortalWorkspaceCapabilities {
  const set = new Set(portalContentReadEnabled() ? permissions : []);
  const matters = set.has('MATTER_READ');
  return {
    home: true,
    matters,
    tasks: mode !== 'CASE_RELAY' && set.has('ACTION_REQUEST_READ'),
    documents: mode !== 'CASE_RELAY' && set.has('DOCUMENT_READ'),
    messages: mode !== 'CASE_RELAY' && (set.has('ACTION_REQUEST_READ') || set.has('ACTION_REQUEST_COMPLETE')),
    intakes: mode === 'ORGANIZATION' && isCapabilityEnabled('ORGANIZATIONAL_INTAKE'),
    leadership,
  };
}

function portalContentReadEnabled(): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env.CLIENT_PORTAL_READ_ENABLED || '').toLowerCase());
}

async function inactiveAccessState(identityId: string, db: Prisma = defaultPrisma) {
  const memberships = await db.clientPortalWorkspaceMembership.findMany({
    where: { clientPortalIdentityId: identityId },
    orderBy: { updatedAt: 'desc' },
  });
  if (!memberships.length) return 'NO_ACCESS' as const;
  if (memberships.some((membership) => ['INVITED', 'PENDING_APPROVAL'].includes(String(membership.status)))) {
    return 'PENDING_APPROVAL' as const;
  }
  const workspaceIds = memberships.map((membership) => membership.workspaceId);
  const workspaces = await db.clientPortalWorkspace.findMany({ where: { id: { in: workspaceIds } }, select: { id: true, status: true } });
  const workspaceStatus = new Map(workspaces.map((workspace) => [workspace.id, String(workspace.status)]));
  if (memberships.some((membership) => membership.status === 'SUSPENDED' || workspaceStatus.get(membership.workspaceId) === 'SUSPENDED')) {
    return 'ACCESS_SUSPENDED' as const;
  }
  return 'NO_ACCESS' as const;
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
  const summaryScopes = await db.clientPortalSummaryScope.findMany({
    where: {
      workspaceMembershipId: { in: memberships.map((membership) => membership.id) },
      workspaceId: { in: workspaces.map((workspace) => workspace.id) },
      status: 'ACTIVE',
    },
    select: { workspaceId: true },
  });
  const leadershipByWorkspace = new Set(summaryScopes.map((scope) => scope.workspaceId));
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
      capabilities: capabilitiesFor(String(workspace.mode), permissions, leadershipByWorkspace.has(workspace.id)),
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
  const emptyState = workspaces.length === 0 ? await inactiveAccessState(session.clientPortalIdentityId, db) : null;
  const requested = String(requestedReference || '').trim();
  const selected = requested
    ? workspaces.find((workspace) => workspace.publicReference === requested)
    : workspaces.length === 1 ? workspaces[0] : undefined;
  if (requested && !selected) throw new ClientWorkspaceError(403, 'CLIENT_WORKSPACE_FORBIDDEN', 'The requested workspace is not available.');
  return {
    identity: { displayName: session.displayName, email: session.normalizedEmail, accountType: session.accountType },
    state: emptyState || (selected ? 'READY' : 'SELECTION_REQUIRED'),
    workspaces: workspaces.map(({ id: _id, clientId: _clientId, membershipId: _membershipId, ...workspace }) => workspace),
    selectedWorkspace: selected ? (({ id: _id, clientId: _clientId, membershipId: _membershipId, ...workspace }) => workspace)(selected) : null,
  };
}

// --- Post-login onboarding resolver -----------------------------------------
//
// Distinguishes the states a membership-less (or not-yet-active) identity can be
// in so the portal never dead-ends: active workspace(s), a pending workspace
// invitation, a pending/rejected membership request, or nothing yet (needs the
// onboarding form). Works for a REGISTERED-or-ACTIVE identity — it must, because
// an onboarding user is typically REGISTERED, not ACTIVE, and only becomes ACTIVE
// once an admin approves a membership.

export type OnboardingRequestView = {
  id: string;
  status: string;
  requestedMode: string | null;
  claimedOrganizationName: string | null;
  claimedUnitName: string | null;
  claimedJobTitle: string | null;
  submittedAt: Date | null;
  decisionMessage: string | null;
  revision: number;
};

export type OnboardingInvitationView = {
  invitationId: string;
  organizationName: string | null;
  workspaceName: string | null;
  mode: string | null;
  expiresAt: Date;
};

type OnboardingRequestRow = {
  id: string;
  status: string;
  requestedMode: string | null;
  requestedOrganizationName: string | null;
  requestedGroupName: string | null;
  claimedJobTitle: string | null;
  submittedAt: Date | null;
  clientSafeDecisionMessage: string | null;
  rejectionReasonSafe: string | null;
  revision: number;
};

/** Customer-safe projection of a membership request — never exposes internal
 *  note, requested/approved client or workspace ids, or Prisma relations. */
function toOnboardingRequestView(request: OnboardingRequestRow): OnboardingRequestView {
  const status = String(request.status);
  return {
    id: request.id,
    status,
    requestedMode: request.requestedMode ? String(request.requestedMode) : null,
    claimedOrganizationName: request.requestedOrganizationName || null,
    claimedUnitName: request.requestedGroupName || null,
    claimedJobTitle: request.claimedJobTitle || null,
    submittedAt: request.submittedAt,
    decisionMessage: request.clientSafeDecisionMessage || (status === 'REJECTED' ? request.rejectionReasonSafe : null) || null,
    revision: request.revision,
  };
}

type OnboardingState =
  | 'ACCESS_SUSPENDED' | 'PENDING_APPROVAL' | 'INVITATION_PENDING'
  | 'REQUEST_PENDING' | 'REQUEST_REJECTED' | 'ONBOARDING_REQUIRED';

type OnboardingPayload = {
  latestRequest: OnboardingRequestView | null;
  invitation: OnboardingInvitationView | null;
  allowedNextAction: string;
};

async function resolveOnboardingState(session: ClientPortalSession, db: Prisma = defaultPrisma): Promise<{ state: OnboardingState; payload: OnboardingPayload }> {
  const identityId = session.clientPortalIdentityId;
  const now = new Date();
  const empty = (allowedNextAction: string): OnboardingPayload => ({ latestRequest: null, invitation: null, allowedNextAction });

  const memberships = await db.clientPortalWorkspaceMembership.findMany({ where: { clientPortalIdentityId: identityId }, orderBy: { updatedAt: 'desc' } });
  if (memberships.length) {
    const workspaces = await db.clientPortalWorkspace.findMany({ where: { id: { in: memberships.map((membership) => membership.workspaceId) } }, select: { id: true, status: true } });
    const workspaceStatus = new Map(workspaces.map((workspace) => [workspace.id, String(workspace.status)]));
    if (memberships.some((membership) => membership.status === 'SUSPENDED' || workspaceStatus.get(membership.workspaceId) === 'SUSPENDED')) {
      return { state: 'ACCESS_SUSPENDED', payload: empty('CONTACT_OFFICE') };
    }
    if (memberships.some((membership) => ['INVITED', 'PENDING_APPROVAL'].includes(String(membership.status)))) {
      return { state: 'PENDING_APPROVAL', payload: empty('AWAIT_APPROVAL') };
    }
  }

  // A direct invitation addressed to this verified e-mail takes precedence over
  // the onboarding form — never force a request on an invited user.
  const invitation = await db.clientPortalInvitation.findFirst({
    where: { status: 'ACTIVE', expiresAt: { gt: now }, intendedEmail: session.normalizedEmail },
    orderBy: { createdAt: 'desc' },
  });

  const request = await db.clientOrganizationMembershipRequest.findFirst({
    where: { clientPortalIdentityId: identityId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, requestedMode: true, requestedOrganizationName: true, requestedGroupName: true, claimedJobTitle: true, submittedAt: true, clientSafeDecisionMessage: true, rejectionReasonSafe: true, revision: true },
  });
  const latestRequest = request ? toOnboardingRequestView(request) : null;

  if (invitation) {
    const [client, workspace] = await Promise.all([
      db.client.findUnique({ where: { id: invitation.clientId }, select: { name: true } }),
      invitation.workspaceId ? db.clientPortalWorkspace.findUnique({ where: { id: invitation.workspaceId }, select: { name: true, mode: true } }) : Promise.resolve(null),
    ]);
    return {
      state: 'INVITATION_PENDING',
      payload: {
        latestRequest,
        invitation: { invitationId: invitation.id, organizationName: client?.name || null, workspaceName: workspace?.name || null, mode: workspace ? String(workspace.mode) : null, expiresAt: invitation.expiresAt },
        allowedNextAction: 'ACCEPT_INVITATION',
      },
    };
  }
  if (request && String(request.status) === 'PENDING_REVIEW') {
    return { state: 'REQUEST_PENDING', payload: { latestRequest, invitation: null, allowedNextAction: 'VIEW_PENDING_REQUEST' } };
  }
  if (request && String(request.status) === 'REJECTED') {
    return { state: 'REQUEST_REJECTED', payload: { latestRequest, invitation: null, allowedNextAction: 'RESUBMIT_REQUEST' } };
  }
  return { state: 'ONBOARDING_REQUIRED', payload: { latestRequest, invitation: null, allowedNextAction: 'SUBMIT_REQUEST' } };
}

function selectionView(workspaces: Awaited<ReturnType<typeof activeWorkspaceRows>>, requestedReference?: string | null) {
  const requested = String(requestedReference || '').trim();
  const selected = requested
    ? workspaces.find((workspace) => workspace.publicReference === requested)
    : workspaces.length === 1 ? workspaces[0] : undefined;
  if (requested && !selected) throw new ClientWorkspaceError(403, 'CLIENT_WORKSPACE_FORBIDDEN', 'The requested workspace is not available.');
  const strip = ({ id: _id, clientId: _clientId, membershipId: _membershipId, ...rest }: (typeof workspaces)[number]) => rest;
  return {
    state: (selected ? 'READY' : 'SELECTION_REQUIRED') as 'READY' | 'SELECTION_REQUIRED',
    workspaces: workspaces.map(strip),
    selectedWorkspace: selected ? strip(selected) : null,
  };
}

/**
 * Single post-login resolver used by the portal shell. Unlike
 * getPortalIdentityContext it never throws for a not-yet-active identity: such a
 * user is exactly who needs onboarding. Returns active-workspace routing when the
 * identity is ACTIVE with memberships, otherwise the onboarding state + a
 * customer-safe onboarding payload.
 */
export async function getOnboardingContext(session: ClientPortalSession, requestedReference?: string | null, db: Prisma = defaultPrisma) {
  const identity = { displayName: session.displayName, email: session.normalizedEmail, accountType: session.accountType };
  const workspaces = session.status === 'ACTIVE' && session.emailVerified
    ? await activeWorkspaceRows(session.clientPortalIdentityId, db)
    : [];
  if (workspaces.length > 0) {
    const view = selectionView(workspaces, requestedReference);
    return { identity, ...view, onboarding: null as OnboardingPayload | null };
  }
  const onboarding = await resolveOnboardingState(session, db);
  return { identity, state: onboarding.state as string, workspaces: [] as ReturnType<typeof selectionView>['workspaces'], selectedWorkspace: null as ReturnType<typeof selectionView>['selectedWorkspace'], onboarding: onboarding.payload as OnboardingPayload | null };
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
  const [memberships, invitations, clients, events, grants] = await Promise.all([
    db.clientPortalWorkspaceMembership.findMany({ where: { workspaceId: { in: workspaceIds } } }),
    db.clientPortalInvitation.findMany({ where: { workspaceId: { in: workspaceIds }, status: 'ACTIVE' } }),
    db.client.findMany({ where: { id: { in: [...new Set(workspaces.map((workspace) => workspace.clientId))] } }, select: { id: true, name: true } }),
    db.clientPortalWorkspaceEvent.findMany({ where: { workspaceId: { in: workspaceIds } }, orderBy: { createdAt: 'desc' }, take: 200 }),
    db.clientPortalGrant.findMany({ where: { workspaceId: { in: workspaceIds }, status: 'ACTIVE', OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }] }, orderBy: { updatedAt: 'desc' } }),
  ]);
  const clientNames = new Map(clients.map((client) => [client.id, client.name]));
  return { items: workspaces.map((workspace) => ({
    ...workspace,
    clientName: clientNames.get(workspace.clientId) || null,
    activeMembershipCount: memberships.filter((membership) => membership.workspaceId === workspace.id && membership.status === 'ACTIVE').length,
    activeCaseGrantCount: grants.filter((grant) => grant.workspaceId === workspace.id).length,
    activeCaseGrants: grants.filter((grant) => grant.workspaceId === workspace.id).map((grant) => ({ ...grant, permissions: grant.permissions.map(String) })),
    pendingInvitationCount: invitations.filter((invitation) => invitation.workspaceId === workspace.id).length,
    pendingApprovalCount: memberships.filter((membership) => membership.workspaceId === workspace.id && membership.status === 'PENDING_APPROVAL').length,
    invitations: invitations.filter((invitation) => invitation.workspaceId === workspace.id).map((invitation) => ({
      id: invitation.id,
      intendedEmail: invitation.intendedEmail,
      status: invitation.status,
      deliveryStatus: invitation.deliveryStatus,
      deliveryCodeSafe: invitation.deliveryCodeSafe,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    })),
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
  const displayName = optionalSafeText(input.displayName ?? input.name, 180);
  const messageSafe = optionalSafeText(input.messageSafe ?? input.message, 800);
  const expiresAt = parseInvitationExpiry(input.expiresAt);
  const identity = await db.clientPortalIdentity.findUnique({ where: { normalizedEmail } });
  if (identity) {
    const membership = await db.clientPortalWorkspaceMembership.upsert({
      where: { clientPortalIdentityId_workspaceId: { clientPortalIdentityId: identity.id, workspaceId } },
      create: { clientPortalIdentityId: identity.id, workspaceId, status: 'PENDING_APPROVAL', role, invitedAt: new Date(), invitedById: actor.userId },
      update: { status: 'PENDING_APPROVAL', role, invitedAt: new Date(), invitedById: actor.userId, approvedAt: null, approvedById: null, revokedAt: null, revokedById: null, suspendedAt: null, suspendedById: null, revision: { increment: 1 } },
    });
    await db.clientPortalWorkspaceEvent.create({ data: { workspaceId, membershipId: membership.id, actorId: actor.userId, action: 'MEMBERSHIP_INVITED', toStatus: 'PENDING_APPROVAL' } });
    return { state: 'PENDING_APPROVAL', membershipId: membership.id, deliveryStatus: 'NOT_REQUIRED', message: 'A meglévő azonosító tagsági jóváhagyásra vár; ügyhozzáférés nem jött létre.' };
  }
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const idempotencyKey = `workspace-invitation:${workspaceId}:${normalizedEmail}`;
  const invitation = await db.$transaction(async (tx) => {
    const existing = await tx.clientPortalInvitation.findFirst({
      where: { workspaceId, intendedEmail: normalizedEmail, status: 'ACTIVE', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return { row: existing, deduped: true };

    const row = await tx.clientPortalInvitation.create({ data: {
      clientId: workspace.clientId,
      workspaceId,
      intendedEmail: normalizedEmail,
      tokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'),
      expiresAt,
      createdById: actor.userId,
    } });
    const delivery = await enqueueNotification({
      eventType: 'CLIENT_PORTAL_INVITATION',
      clientId: workspace.clientId,
      recipientEmail: normalizedEmail,
      recipientName: displayName,
      subjectSafe: 'Adminiculum ügyfélportál meghívás',
      bodyOverrideSafe: messageSafe,
      createdById: actor.userId,
      idempotencyKey,
    }, tx);
    await tx.clientPortalInvitation.update({ where: { id: row.id }, data: { deliveryId: delivery.id, deliveryStatus: 'PENDING' } });
    await tx.clientPortalWorkspaceEvent.create({ data: { workspaceId, actorId: actor.userId, action: 'INVITATION_CREATED', metadataSafe: { invitationId: row.id, deliveryId: delivery.id, deliveryStatus: 'PENDING' } } });
    return { row: { ...row, deliveryId: delivery.id, deliveryStatus: 'PENDING' as const }, deduped: false };
  });

  let deliveryStatus = invitation.row.deliveryStatus ? String(invitation.row.deliveryStatus) : 'PENDING';
  let deliveryCodeSafe: string | undefined;
  if (invitation.row.deliveryId && !invitation.deduped) {
    const delivery = await processDelivery(invitation.row.deliveryId, db);
    deliveryStatus = delivery.status;
    deliveryCodeSafe = delivery.codeSafe;
    await db.clientPortalInvitation.update({
      where: { id: invitation.row.id },
      data: { deliveryStatus: delivery.status as any, deliveryCodeSafe: delivery.codeSafe || null, deliveryAttemptedAt: new Date() },
    });
  }
  const providerUnavailable = deliveryCodeSafe === 'MAIL_PROVIDER_NOT_CONFIGURED' || deliveryStatus === 'FAILED_RETRYABLE';
  return {
    state: 'INVITED',
    invitationId: invitation.row.id,
    expiresAt: invitation.row.expiresAt,
    deliveryStatus,
    deliveryCodeSafe: deliveryCodeSafe || invitation.row.deliveryCodeSafe || null,
    emailSent: deliveryStatus === 'SENT',
    message: providerUnavailable
      ? 'A meghívás rögzítésre került, de e-mail nem került kiküldésre, mert az értesítési szolgáltatás nincs beállítva.'
      : deliveryStatus === 'SENT'
        ? 'A meghívás rögzítésre került, és az e-mail-küldés sikeres volt.'
        : 'A meghívás rögzítésre került; a kézbesítés feldolgozás alatt áll.',
  };
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

// --- Invitation revocation + notification cancellation --------------------
// Cleanly retire a pending/failed invitation and stop its notification retries.
// Never returns the raw token; never revokes an already-created membership; an
// already-accepted (USED) invitation cannot be revoked as though still pending.

const CANCELLABLE_DELIVERY = new Set(['PENDING', 'SENDING', 'FAILED_RETRYABLE']);

async function cancelDeliveryTx(tx: any, deliveryId: string | null, _actorId: string): Promise<boolean> {
  if (!deliveryId) return false;
  const delivery = await tx.clientNotificationDelivery.findUnique({ where: { id: deliveryId }, select: { id: true, status: true } });
  if (!delivery || !CANCELLABLE_DELIVERY.has(String(delivery.status))) return false;
  await tx.clientNotificationDelivery.update({ where: { id: deliveryId }, data: { status: 'CANCELLED', nextAttemptAt: null, lastErrorCodeSafe: 'CANCELLED_BY_WORKFORCE' } });
  return true;
}

export async function revokeInvitation(actor: InternalActor, invitationId: string, db: Prisma = defaultPrisma) {
  requireInternal(actor);
  const invitation = await db.clientPortalInvitation.findUnique({ where: { id: invitationId } });
  if (!invitation) throw new ClientWorkspaceError(404, 'INVITATION_NOT_FOUND', 'Invitation not found.');
  if (invitation.status === 'USED') throw new ClientWorkspaceError(409, 'INVITATION_ALREADY_ACCEPTED', 'An accepted invitation cannot be revoked; manage the membership instead.');
  if (invitation.status === 'REVOKED') {
    // Idempotent: ensure the delivery is also cancelled, then return.
    const cancelled = await db.$transaction((tx) => cancelDeliveryTx(tx, invitation.deliveryId, actor.userId));
    return { id: invitation.id, status: 'REVOKED', notificationCancelled: cancelled, idempotent: true };
  }
  return db.$transaction(async (tx) => {
    await tx.clientPortalInvitation.update({ where: { id: invitationId }, data: { status: 'REVOKED' } });
    const notificationCancelled = await cancelDeliveryTx(tx, invitation.deliveryId, actor.userId);
    if (invitation.workspaceId) {
      await tx.clientPortalWorkspaceEvent.create({ data: { workspaceId: invitation.workspaceId, actorId: actor.userId, action: 'INVITATION_REVOKED', toStatus: 'REVOKED', metadataSafe: { invitationId, notificationCancelled } } });
    }
    return { id: invitationId, status: 'REVOKED', notificationCancelled, idempotent: false };
  });
}

export async function cancelInvitationNotificationRetry(actor: InternalActor, invitationId: string, db: Prisma = defaultPrisma) {
  requireInternal(actor);
  const invitation = await db.clientPortalInvitation.findUnique({ where: { id: invitationId }, select: { id: true, deliveryId: true, workspaceId: true } });
  if (!invitation) throw new ClientWorkspaceError(404, 'INVITATION_NOT_FOUND', 'Invitation not found.');
  if (!invitation.deliveryId) return { invitationId, cancelled: false, reason: 'NO_DELIVERY' };
  const cancelled = await db.$transaction(async (tx) => {
    const c = await cancelDeliveryTx(tx, invitation.deliveryId, actor.userId);
    if (c) await tx.clientPortalInvitation.update({ where: { id: invitationId }, data: { deliveryStatus: 'CANCELLED', deliveryCodeSafe: 'CANCELLED_BY_WORKFORCE' } });
    return c;
  });
  return { invitationId, deliveryId: invitation.deliveryId, cancelled };
}
