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

const REQUESTED_MODES = new Set(['INDIVIDUAL', 'ORGANIZATION', 'CASE_RELAY']);
const WORKSPACE_MEMBERSHIP_ROLES = new Set(['MEMBER', 'REPRESENTATIVE', 'APPROVER']);

function normalizeRequestedMode(value: unknown): 'INDIVIDUAL' | 'ORGANIZATION' | 'CASE_RELAY' | null {
  const mode = String(value || '').trim().toUpperCase();
  return REQUESTED_MODES.has(mode) ? (mode as 'INDIVIDUAL' | 'ORGANIZATION' | 'CASE_RELAY') : null;
}

function normalizeMembershipRole(value: unknown): 'MEMBER' | 'REPRESENTATIVE' | 'APPROVER' {
  const role = String(value || 'MEMBER').trim().toUpperCase();
  return WORKSPACE_MEMBERSHIP_ROLES.has(role) ? (role as 'MEMBER' | 'REPRESENTATIVE' | 'APPROVER') : 'MEMBER';
}

/** Customer-safe projection of a membership request. Never exposes the internal
 *  decision note, requested/approved client or workspace ids, or Prisma
 *  relations — only what the requesting customer may see about their own request. */
export function toCustomerMembershipRequest(request: {
  id: string; status: string; requestedMode: string | null; requestedOrganizationName: string | null;
  requestedGroupName: string | null; claimedJobTitle: string | null; submittedAt: Date | null;
  reviewedAt: Date | null; clientSafeDecisionMessage: string | null; rejectionReasonSafe: string | null; revision: number;
}) {
  const status = String(request.status);
  return {
    id: request.id,
    status,
    requestedMode: request.requestedMode ? String(request.requestedMode) : null,
    claimedOrganizationName: request.requestedOrganizationName || null,
    claimedUnitName: request.requestedGroupName || null,
    claimedJobTitle: request.claimedJobTitle || null,
    submittedAt: request.submittedAt,
    reviewedAt: request.reviewedAt,
    decisionMessage: request.clientSafeDecisionMessage || (status === 'REJECTED' ? request.rejectionReasonSafe : null) || null,
    revision: request.revision,
  };
}

const CUSTOMER_REQUEST_SELECT = {
  id: true, status: true, requestedMode: true, requestedOrganizationName: true,
  requestedGroupName: true, claimedJobTitle: true, submittedAt: true, reviewedAt: true,
  clientSafeDecisionMessage: true, rejectionReasonSafe: true, revision: true,
} as const;

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
  if (!session.emailVerified) throw new ClientIdentityError(403, 'CLIENT_EMAIL_NOT_VERIFIED', 'Verify e-mail before requesting portal access.');
  if (session.status === 'SUSPENDED' || session.status === 'REVOKED') throw new ClientIdentityError(403, `CLIENT_IDENTITY_${session.status}`, 'Client identity is not active.');

  // Idempotency: one identity may hold only one request still under review.
  // A repeated submit (double-click, second tab) returns the existing pending
  // request instead of creating a duplicate.
  const alreadyPending = await prisma.clientOrganizationMembershipRequest.findFirst({
    where: { clientPortalIdentityId: session.clientPortalIdentityId, status: 'PENDING_REVIEW' },
    orderBy: { createdAt: 'desc' },
  });
  if (alreadyPending) {
    return { id: alreadyPending.id, status: alreadyPending.status, duplicate: true, message: 'Hozzáférési kérelme már elbírálásra vár.' };
  }

  const requestedMode = normalizeRequestedMode(input.requestedMode);
  // Claimed (customer-asserted) organization context. The customer may NEVER
  // supply an authoritative client/workspace id — those are assigned by the
  // reviewing admin. Only the claimed names/labels are accepted here.
  const requestedOrganizationName = safeString(input.claimedOrganizationName ?? input.requestedOrganizationName, 180);
  const requestedGroupName = safeString(input.claimedUnitName ?? input.requestedGroupName, 120);
  const claimedJobTitle = safeString(input.claimedJobTitle, 160);
  const phoneSafe = safeString(input.phone, 60);
  const noteSafe = safeString(input.note ?? input.roleDescriptionSafe, 600);
  // Claimed corporate contact e-mail is informational only; the authoritative
  // verified e-mail is always taken from the server-side session snapshot.
  const corporateEmail = normalizeEmail(input.corporateEmail);

  if ((requestedMode === 'ORGANIZATION' || requestedMode === 'CASE_RELAY') && !requestedOrganizationName) {
    throw new ClientIdentityError(400, 'ORGANIZATION_CONTEXT_REQUIRED', 'Organization name is required for this access mode.');
  }

  try {
    const request = await prisma.clientOrganizationMembershipRequest.create({
      data: {
        clientPortalIdentityId: session.clientPortalIdentityId,
        requestedMode: requestedMode || undefined,
        requestedOrganizationName,
        requestedGroupName,
        corporateEmail,
        roleDescriptionSafe: noteSafe,
        verifiedEmailSnapshot: session.normalizedEmail,
        displayNameSnapshot: session.displayName,
        phoneSafe,
        claimedJobTitle,
        noteSafe,
        status: 'PENDING_REVIEW',
        submittedAt: new Date(),
      },
    });
    // Do not downgrade an already-ACTIVE identity; only move a freshly
    // registered identity into the pending-review state.
    if (session.status === 'REGISTERED') {
      await prisma.clientPortalIdentity.update({ where: { id: session.clientPortalIdentityId }, data: { status: 'MEMBERSHIP_PENDING', revision: { increment: 1 } } });
    }
    return { id: request.id, status: request.status, duplicate: false, message: 'Hozzáférési kérelmét megkaptuk. Az ügyvédi iroda ellenőrzi és hagyja jóvá.' };
  } catch (error) {
    // Concurrent double-submit races the partial unique index; collapse onto
    // the winning pending request rather than surfacing a raw conflict.
    if ((error as { code?: string })?.code === 'P2002') {
      const winner = await prisma.clientOrganizationMembershipRequest.findFirst({
        where: { clientPortalIdentityId: session.clientPortalIdentityId, status: 'PENDING_REVIEW' },
        orderBy: { createdAt: 'desc' },
      });
      if (winner) return { id: winner.id, status: winner.status, duplicate: true, message: 'Hozzáférési kérelme már elbírálásra vár.' };
    }
    throw error;
  }
}

/** Accept a portal invitation addressed to the authenticated verified identity.
 *  Grants only the workspace membership recorded on the invitation — no case
 *  access, no elevated role. */
export async function acceptPortalInvitation(session: ClientPortalSession, input: Record<string, unknown>) {
  if (!session.emailVerified) throw new ClientIdentityError(403, 'CLIENT_EMAIL_NOT_VERIFIED', 'Verify e-mail before accepting an invitation.');
  if (session.status === 'SUSPENDED' || session.status === 'REVOKED') throw new ClientIdentityError(403, `CLIENT_IDENTITY_${session.status}`, 'Client identity is not active.');
  const invitationId = safeString(input.invitationId, 80);
  if (!invitationId) throw new ClientIdentityError(400, 'INVITATION_ID_REQUIRED', 'Invitation identifier is required.');
  const invitation = await prisma.clientPortalInvitation.findFirst({ where: { id: invitationId, status: 'ACTIVE', expiresAt: { gt: new Date() } } });
  if (!invitation) throw new ClientIdentityError(409, 'INVITATION_UNAVAILABLE', 'Invitation is not available.');
  if (invitation.intendedEmail && invitation.intendedEmail.toLowerCase() !== session.normalizedEmail) throw new ClientIdentityError(403, 'INVITATION_EMAIL_MISMATCH', 'Invitation does not match the authenticated e-mail.');
  if (!invitation.workspaceId) throw new ClientIdentityError(409, 'INVITATION_WORKSPACE_MISSING', 'Invitation is not bound to a workspace.');
  const workspace = await prisma.clientPortalWorkspace.findFirst({ where: { id: invitation.workspaceId, status: 'ACTIVE' } });
  if (!workspace) throw new ClientIdentityError(409, 'WORKSPACE_NOT_ACTIVE', 'The invited workspace is not active.');
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const membership = await tx.clientPortalWorkspaceMembership.upsert({
      where: { clientPortalIdentityId_workspaceId: { clientPortalIdentityId: session.clientPortalIdentityId, workspaceId: invitation.workspaceId! } },
      create: { clientPortalIdentityId: session.clientPortalIdentityId, workspaceId: invitation.workspaceId!, status: 'ACTIVE', role: 'MEMBER', invitedAt: invitation.createdAt, invitedById: invitation.createdById, approvedAt: now, approvedById: invitation.createdById },
      update: { status: 'ACTIVE', approvedAt: now, approvedById: invitation.createdById, revokedAt: null, revokedById: null, suspendedAt: null, suspendedById: null, revision: { increment: 1 } },
    });
    await tx.clientPortalInvitation.update({ where: { id: invitation.id }, data: { status: 'USED', usedByIdentityId: session.clientPortalIdentityId, usedAt: now } });
    await tx.clientPortalIdentity.update({ where: { id: session.clientPortalIdentityId }, data: { status: 'ACTIVE', revision: { increment: 1 } } });
    await tx.clientPortalWorkspaceEvent.create({ data: { workspaceId: invitation.workspaceId!, membershipId: membership.id, actorId: session.clientPortalIdentityId, action: 'MEMBERSHIP_APPROVED', toStatus: 'ACTIVE', metadataSafe: { source: 'invitation-acceptance' } } });
    return { workspaceReference: workspace.publicReference, membershipId: membership.id };
  });
}

export async function getCurrentMembershipRequests(session: ClientPortalSession) {
  const items = await prisma.clientOrganizationMembershipRequest.findMany({
    where: { clientPortalIdentityId: session.clientPortalIdentityId },
    select: CUSTOMER_REQUEST_SELECT,
    orderBy: { createdAt: 'desc' },
  });
  return { items: items.map(toCustomerMembershipRequest) };
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

/** Internal (admin) membership-request row. This DTO is internal-only and may
 *  carry data the customer DTO never does (identity id, claimed contact,
 *  verified snapshot). It still excludes the internal decision note by default;
 *  the note is surfaced only on the single-request detail view. */
const ADMIN_REQUEST_SELECT = {
  id: true, clientPortalIdentityId: true, requestedMode: true, requestedClientId: true,
  requestedOrganizationName: true, requestedGroupId: true, requestedGroupName: true,
  corporateEmail: true, verifiedEmailSnapshot: true, displayNameSnapshot: true,
  phoneSafe: true, claimedJobTitle: true, noteSafe: true, status: true, submittedAt: true,
  reviewedAt: true, rejectionReasonSafe: true, clientSafeDecisionMessage: true,
  approvedWorkspaceId: true, approvedMembershipId: true, revision: true,
} as const;

export async function listMembershipQueue(actor: Actor) {
  requireReviewer(actor);
  const items = await prisma.clientOrganizationMembershipRequest.findMany({
    where: { status: { in: ['PENDING_REVIEW', 'REJECTED'] } },
    select: ADMIN_REQUEST_SELECT,
    orderBy: [{ status: 'asc' }, { submittedAt: 'asc' }],
  });
  return { items };
}

/** Full internal detail for one request, including the internal decision note. */
export async function getMembershipRequestDetail(actor: Actor, requestId: string) {
  requireReviewer(actor);
  const request = await prisma.clientOrganizationMembershipRequest.findUnique({
    where: { id: requestId },
    select: { ...ADMIN_REQUEST_SELECT, internalDecisionNote: true, invitationId: true, reviewedById: true, createdAt: true, updatedAt: true },
  });
  if (!request) throw new ClientIdentityError(404, 'REQUEST_NOT_FOUND', 'Membership request is not available.');
  const identity = await prisma.clientPortalIdentity.findUnique({
    where: { id: request.clientPortalIdentityId },
    select: { normalizedEmail: true, displayName: true, status: true, accountType: true },
  });
  return { request, identity };
}

export async function createOrganizationGroup(actor: Actor, input: Record<string, unknown>) {
  requireReviewer(actor);
  const clientId = safeString(input.clientId, 80);
  const name = safeString(input.name, 120);
  if (!clientId || !name) throw new ClientIdentityError(400, 'GROUP_INPUT_REQUIRED', 'Client and group name are required.');
  return prisma.clientOrganizationGroup.create({ data: { clientId, name, descriptionSafe: safeString(input.descriptionSafe, 300), createdById: actor.userId } });
}

/**
 * Approve a membership request. Transactional and content-light. On success it
 * provisions an ACTIVE ClientPortalWorkspaceMembership in the admin-assigned,
 * mode-compatible workspace — that membership is exactly what the post-login
 * resolver reads to admit the customer. Approval grants ONLY workspace
 * membership: no case grant, document, communication, summary, or billing
 * access is created here (those remain separate, explicit decisions).
 *
 * Partial-failure safety: the request only reaches APPROVED inside the same
 * transaction that creates the memberships, so there can be no APPROVED request
 * without a membership and no orphaned membership on a still-pending request.
 */
const WORKSPACE_MODES = new Set(['INDIVIDUAL', 'ORGANIZATION', 'CASE_RELAY']);
const UNIT_ROLES = new Set(['MEMBER', 'CONTACT', 'APPROVER', 'MANAGER']);
const MODE_LABELS: Record<string, string> = { INDIVIDUAL: 'Magánügyfél', ORGANIZATION: 'Szervezeti ügyfél', CASE_RELAY: 'Ügyátvezető' };

function normalizeWorkspaceMode(value: unknown, fallback?: string | null): 'INDIVIDUAL' | 'ORGANIZATION' | 'CASE_RELAY' {
  const mode = String(value || fallback || '').trim().toUpperCase();
  if (!WORKSPACE_MODES.has(mode)) throw new ClientIdentityError(400, 'WORKSPACE_MODE_INVALID', 'A valid customer-surface mode is required.');
  return mode as 'INDIVIDUAL' | 'ORGANIZATION' | 'CASE_RELAY';
}

function normalizeUnitRole(value: unknown): 'MEMBER' | 'CONTACT' | 'APPROVER' | 'MANAGER' {
  const role = String(value || 'MEMBER').trim().toUpperCase();
  return UNIT_ROLES.has(role) ? (role as 'MEMBER' | 'CONTACT' | 'APPROVER' | 'MANAGER') : 'MEMBER';
}

function workspaceReference(): string {
  return crypto.randomBytes(18).toString('base64url');
}

/**
 * Approve a membership request through a single transactional orchestration.
 *
 * The operator chooses how to assign the applicant:
 *   - EXISTING_CLIENT: link to an existing Client; the compatible active customer
 *     surface is auto-selected, or created inline (createWorkspace) when none
 *     exists — the operator is never dead-ended by a missing surface.
 *   - NEW_CLIENT: create the Client and its first customer surface in the same
 *     transaction.
 *
 * The customer's requested mode is intent, not authority: the operator's chosen
 * actual mode wins (the UI warns on divergence). Approval provisions at most one
 * Client, one customer surface and one ACTIVE portal membership, optionally one
 * organizational-unit assignment with a unit role. It creates NO case grant,
 * publication, document or message access, and exposes no existing Client case.
 * Partial failure rolls back everything (single $transaction).
 */
export async function approveMembershipRequest(actor: Actor, requestId: string, input: Record<string, unknown>) {
  requireReviewer(actor);
  const revision = Number(input.revision);
  if (!Number.isInteger(revision)) throw new ClientIdentityError(400, 'APPROVAL_INPUT_REQUIRED', 'Revision is required.');

  const portalRole = normalizeMembershipRole(input.portalMembershipRole ?? input.role);
  const clientSafeDecisionMessage = safeString(input.clientSafeDecisionMessage, 500);
  const internalDecisionNote = safeString(input.internalDecisionNote, 1000);

  const request = await prisma.clientOrganizationMembershipRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new ClientIdentityError(404, 'REQUEST_NOT_FOUND', 'Membership request is not available.');
  if (request.status !== 'PENDING_REVIEW') throw new ClientIdentityError(409, 'REQUEST_NOT_PENDING', 'Membership request is not pending review.');
  if (request.revision !== revision) throw new ClientIdentityError(409, 'REVISION_CONFLICT', 'Membership request changed.');

  const identity = await prisma.clientPortalIdentity.findUnique({ where: { id: request.clientPortalIdentityId }, select: { id: true, status: true } });
  if (!identity || identity.status === 'SUSPENDED' || identity.status === 'REVOKED') throw new ClientIdentityError(409, 'IDENTITY_NOT_ELIGIBLE', 'The requesting identity is not eligible for approval.');

  // Assignment mode: explicit, else inferred (new-client input present => NEW_CLIENT).
  const newClientInput = (input.newClientInput && typeof input.newClientInput === 'object') ? input.newClientInput as Record<string, unknown> : null;
  const existingClientId = safeString(input.existingClientId ?? input.clientId, 80);
  const assignmentMode = String(input.assignmentMode || (newClientInput ? 'NEW_CLIENT' : 'EXISTING_CLIENT')).trim().toUpperCase();
  if (assignmentMode !== 'EXISTING_CLIENT' && assignmentMode !== 'NEW_CLIENT') throw new ClientIdentityError(400, 'ASSIGNMENT_MODE_INVALID', 'Assignment mode is invalid.');

  // Actual customer-surface mode (operator authority; request mode is a default).
  const createWorkspaceInput = (input.createWorkspaceInput && typeof input.createWorkspaceInput === 'object') ? input.createWorkspaceInput as Record<string, unknown> : null;
  const actualMode = normalizeWorkspaceMode(input.actualMode ?? createWorkspaceInput?.mode, request.requestedMode);
  const existingWorkspaceId = safeString(input.existingWorkspaceId ?? input.workspaceId, 80);

  // Optional organizational-unit assignment (ORGANIZATION only).
  const organizationGroupId = safeString(input.organizationGroupId, 80);
  const newOrganizationGroupName = safeString(input.newOrganizationGroupName, 120);
  const unitRole = normalizeUnitRole(input.unitRole);

  const now = new Date();
  try {
    return await prisma.$transaction(async (tx) => {
      // 1. Resolve the Client (existing or newly created).
      let clientId: string;
      let clientName: string;
      let createdClient = false;
      if (assignmentMode === 'NEW_CLIENT') {
        const name = safeString(newClientInput?.name ?? request.requestedOrganizationName ?? request.displayNameSnapshot, 180);
        if (!name) throw new ClientIdentityError(400, 'NEW_CLIENT_NAME_REQUIRED', 'A name is required to create a new client.');
        const created = await tx.client.create({ data: {
          name,
          email: normalizeEmail(newClientInput?.email) || request.verifiedEmailSnapshot || undefined,
          phone: safeString(newClientInput?.phone, 60) || request.phoneSafe || undefined,
          companyRegistrationNumber: safeString(newClientInput?.companyRegistrationNumber, 60) || undefined,
          taxNumber: safeString(newClientInput?.taxNumber, 60) || undefined,
          contactPerson: safeString(newClientInput?.contactPerson, 180) || request.displayNameSnapshot || undefined,
          portalAccessEnabled: true,
        } });
        clientId = created.id;
        clientName = created.name;
        createdClient = true;
      } else {
        if (!existingClientId) throw new ClientIdentityError(400, 'EXISTING_CLIENT_REQUIRED', 'An existing client must be selected.');
        const existing = await tx.client.findUnique({ where: { id: existingClientId }, select: { id: true, name: true } });
        if (!existing) throw new ClientIdentityError(400, 'CLIENT_NOT_FOUND', 'Selected client was not found.');
        clientId = existing.id;
        clientName = existing.name;
      }

      // 2. Resolve the customer surface (given, auto-selected, or created inline).
      let workspaceRow: { id: string; clientId: string; status: string; mode: string } | null = null;
      let createdWorkspace = false;
      if (existingWorkspaceId && !createWorkspaceInput) {
        const w = await tx.clientPortalWorkspace.findUnique({ where: { id: existingWorkspaceId }, select: { id: true, clientId: true, status: true, mode: true } });
        if (!w || w.status !== 'ACTIVE') throw new ClientIdentityError(409, 'WORKSPACE_NOT_ACTIVE', 'The selected customer surface is not active.');
        if (w.clientId !== clientId) throw new ClientIdentityError(409, 'WORKSPACE_CLIENT_MISMATCH', 'The customer surface does not belong to the selected client.');
        if (String(w.mode) !== actualMode) throw new ClientIdentityError(409, 'WORKSPACE_MODE_MISMATCH', 'The customer surface mode is not compatible with the chosen access mode.');
        workspaceRow = { id: w.id, clientId: w.clientId, status: String(w.status), mode: String(w.mode) };
      } else if (createWorkspaceInput || assignmentMode === 'NEW_CLIENT') {
        const name = safeString(createWorkspaceInput?.name, 180) || `${clientName} – ${MODE_LABELS[actualMode]}`;
        const created = await tx.clientPortalWorkspace.create({ data: {
          clientId,
          name,
          mode: actualMode,
          communicationMode: 'PORTAL_PRIMARY',
          connectedSystemState: actualMode === 'CASE_RELAY' ? 'CONFIGURATION_REQUIRED' : 'NOT_CONFIGURED',
          publicReference: workspaceReference(),
          createdById: actor.userId,
        } });
        await tx.clientPortalWorkspaceEvent.create({ data: { workspaceId: created.id, actorId: actor.userId, action: 'WORKSPACE_CREATED', toStatus: created.status, metadataSafe: { source: 'membership-approval' } } });
        workspaceRow = { id: created.id, clientId: created.clientId, status: String(created.status), mode: String(created.mode) };
        createdWorkspace = true;
      } else {
        // EXISTING_CLIENT with no chosen/created surface: auto-select the single
        // compatible active surface, or require a decision.
        const candidates = await tx.clientPortalWorkspace.findMany({ where: { clientId, mode: actualMode, status: 'ACTIVE' }, select: { id: true, clientId: true, status: true, mode: true } });
        if (candidates.length === 1) workspaceRow = { id: candidates[0].id, clientId: candidates[0].clientId, status: String(candidates[0].status), mode: String(candidates[0].mode) };
        else if (candidates.length > 1) throw new ClientIdentityError(409, 'WORKSPACE_SELECTION_REQUIRED', 'Select which customer surface to assign.');
        else throw new ClientIdentityError(409, 'WORKSPACE_CREATION_REQUIRED', 'No compatible customer surface exists; create one to continue.');
      }
      const workspaceId = workspaceRow.id;

      // 3. Optional organizational unit (ORGANIZATION surfaces only).
      let groupId: string | null = null;
      if (actualMode === 'ORGANIZATION') {
        if (organizationGroupId) {
          const group = await tx.clientOrganizationGroup.findFirst({ where: { id: organizationGroupId, clientId, status: 'ACTIVE' }, select: { id: true, workspaceId: true } });
          if (!group) throw new ClientIdentityError(400, 'CROSS_CLIENT_GROUP_REJECTED', 'The organizational unit is not available for that client.');
          if (group.workspaceId && group.workspaceId !== workspaceId) throw new ClientIdentityError(409, 'GROUP_WORKSPACE_MISMATCH', 'The organizational unit belongs to another customer surface.');
          if (!group.workspaceId) await tx.clientOrganizationGroup.update({ where: { id: group.id }, data: { workspaceId, revision: { increment: 1 } } });
          groupId = group.id;
        } else if (newOrganizationGroupName) {
          const created = await tx.clientOrganizationGroup.create({ data: { clientId, workspaceId, name: newOrganizationGroupName, createdById: actor.userId } });
          groupId = created.id;
        }
      }

      // 4. Portal + organization membership (single transaction, no case grant).
      const membership = await tx.clientOrganizationMembership.create({ data: { clientPortalIdentityId: request.clientPortalIdentityId, clientId, groupId, unitRole: groupId ? unitRole : 'MEMBER', approvedFromRequestId: request.id, approvedById: actor.userId, approvedAt: now } });
      const workspaceMembership = await tx.clientPortalWorkspaceMembership.upsert({
        where: { clientPortalIdentityId_workspaceId: { clientPortalIdentityId: request.clientPortalIdentityId, workspaceId } },
        create: { clientPortalIdentityId: request.clientPortalIdentityId, workspaceId, status: 'ACTIVE', role: portalRole, invitedAt: now, invitedById: actor.userId, approvedAt: now, approvedById: actor.userId },
        update: { status: 'ACTIVE', role: portalRole, approvedAt: now, approvedById: actor.userId, revokedAt: null, revokedById: null, suspendedAt: null, suspendedById: null, revision: { increment: 1 } },
      });
      await tx.clientOrganizationMembershipRequest.update({
        where: { id: request.id },
        data: {
          requestedClientId: clientId,
          requestedGroupId: groupId,
          status: 'APPROVED',
          reviewedById: actor.userId,
          reviewedAt: now,
          approvedWorkspaceId: workspaceId,
          approvedMembershipId: workspaceMembership.id,
          clientSafeDecisionMessage,
          internalDecisionNote,
          revision: { increment: 1 },
        },
      });
      await tx.clientPortalIdentity.update({ where: { id: request.clientPortalIdentityId }, data: { status: 'ACTIVE', revision: { increment: 1 } } });
      if (request.invitationId) {
        const invitation = await tx.clientPortalInvitation.findFirst({ where: { id: request.invitationId, status: 'ACTIVE', workspaceId } });
        if (invitation) await tx.clientPortalInvitation.update({ where: { id: invitation.id }, data: { status: 'USED', usedByIdentityId: request.clientPortalIdentityId, usedAt: now } });
      }
      await tx.clientPortalWorkspaceEvent.create({ data: { workspaceId, membershipId: workspaceMembership.id, actorId: actor.userId, action: 'MEMBERSHIP_APPROVED', toStatus: 'ACTIVE', metadataSafe: { source: 'membership-request-approval', requestId: request.id, assignmentMode, createdClient, createdWorkspace } } });
      return { membership, workspaceMembership, clientId, workspaceId, createdClient, createdWorkspace, actualMode, grantRequired: true, nextAction: 'Hozzáférés adása ügyhöz' };
    });
  } catch (error) {
    if (error instanceof ClientIdentityError) throw error;
    if (['P2002', 'P2034'].includes((error as { code?: string })?.code || '')) throw new ClientIdentityError(409, 'MEMBERSHIP_APPROVAL_CONFLICT', 'The membership changed concurrently. Reload and retry.');
    throw error;
  }
}

export async function rejectMembershipRequest(actor: Actor, requestId: string, input: Record<string, unknown>) {
  requireReviewer(actor);
  const revision = Number(input.revision);
  const request = await prisma.clientOrganizationMembershipRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new ClientIdentityError(404, 'REQUEST_NOT_FOUND', 'Membership request is not available.');
  if (request.status !== 'PENDING_REVIEW') throw new ClientIdentityError(409, 'REQUEST_NOT_PENDING', 'Membership request is not pending review.');
  if (request.revision !== revision) throw new ClientIdentityError(409, 'REVISION_CONFLICT', 'Membership request changed.');
  // Split decision surfaces: the client-safe message is what the customer sees;
  // the internal note is never returned in a customer DTO.
  const clientSafeDecisionMessage = safeString(input.clientSafeDecisionMessage ?? input.rejectionReasonSafe, 500);
  const internalDecisionNote = safeString(input.internalDecisionNote, 1000);
  return prisma.clientOrganizationMembershipRequest.update({
    where: { id: requestId },
    data: {
      status: 'REJECTED',
      reviewedById: actor.userId,
      reviewedAt: new Date(),
      rejectionReasonSafe: clientSafeDecisionMessage,
      clientSafeDecisionMessage,
      internalDecisionNote,
      revision: { increment: 1 },
    },
  });
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
  const workspaceMembershipId = safeString(input.workspaceMembershipId, 80);
  const caseId = safeString(input.caseId, 80);
  const permissions = Array.isArray(input.permissions)
    ? input.permissions.map(String).filter((p) => ALLOWED_GRANT_PERMISSIONS.has(p))
    : [];
  if ((!membershipId && !workspaceMembershipId) || !caseId || !permissions.length) throw new ClientIdentityError(400, 'GRANT_INPUT_REQUIRED', 'Workspace membership, case and permissions are required.');

  let validUntil: Date | null = null;
  if (input.validUntil != null && String(input.validUntil).trim()) {
    const parsed = new Date(String(input.validUntil));
    if (Number.isNaN(parsed.getTime())) throw new ClientIdentityError(400, 'GRANT_VALIDITY_INVALID', 'Grant validity date is invalid.');
    if (parsed.getTime() <= Date.now()) throw new ClientIdentityError(400, 'GRANT_VALIDITY_PAST', 'Grant validity must be in the future.');
    validUntil = parsed;
  }

  const legacyMembership = membershipId
    ? await prisma.clientOrganizationMembership.findFirst({ where: { id: membershipId, status: 'ACTIVE' } })
    : null;
  const compatibleWorkspaceIds = legacyMembership
    ? (await prisma.clientPortalWorkspace.findMany({ where: { clientId: legacyMembership.clientId, status: 'ACTIVE' }, select: { id: true } })).map((workspace) => workspace.id)
    : [];
  if (legacyMembership && compatibleWorkspaceIds.length > 1 && !workspaceMembershipId) {
    throw new ClientIdentityError(409, 'WORKSPACE_MEMBERSHIP_SELECTION_REQUIRED', 'Select the exact workspace membership for the case grant.');
  }
  const resolvedWorkspaceMembership = workspaceMembershipId
    ? await prisma.clientPortalWorkspaceMembership.findFirst({ where: { id: workspaceMembershipId, status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } })
    : legacyMembership
      ? await prisma.clientPortalWorkspaceMembership.findFirst({
        where: { clientPortalIdentityId: legacyMembership.clientPortalIdentityId, workspaceId: { in: compatibleWorkspaceIds }, status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        orderBy: { createdAt: 'asc' },
      })
      : null;
  if (!resolvedWorkspaceMembership) throw new ClientIdentityError(403, 'ACTIVE_WORKSPACE_MEMBERSHIP_REQUIRED', 'Active workspace membership is required before creating a case grant.');
  const workspace = await prisma.clientPortalWorkspace.findFirst({ where: { id: resolvedWorkspaceMembership.workspaceId, status: 'ACTIVE' } });
  if (!workspace) throw new ClientIdentityError(403, 'ACTIVE_WORKSPACE_REQUIRED', 'Active workspace is required before creating a case grant.');
  if (legacyMembership && (legacyMembership.clientPortalIdentityId !== resolvedWorkspaceMembership.clientPortalIdentityId || legacyMembership.clientId !== workspace.clientId)) {
    throw new ClientIdentityError(409, 'WORKSPACE_MEMBERSHIP_MISMATCH', 'The workspace membership does not match the approved membership.');
  }
  const identity = await prisma.clientPortalIdentity.findUnique({ where: { id: resolvedWorkspaceMembership.clientPortalIdentityId } });
  if (!identity || identity.status !== 'ACTIVE') throw new ClientIdentityError(403, 'ACTIVE_IDENTITY_REQUIRED', 'Active client identity is required before creating a case grant.');
  const caseRow = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, clientId: true } });
  if (!caseRow) throw new ClientIdentityError(404, 'CASE_NOT_FOUND', 'Case was not found.');
  if (caseRow.clientId !== workspace.clientId) throw new ClientIdentityError(409, 'CASE_CLIENT_MISMATCH', 'The case does not belong to the workspace client.');

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.clientPortalGrant.findFirst({
        where: { clientPortalIdentityId: identity.id, workspaceId: workspace.id, caseId },
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
            workspaceId: workspace.id,
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
            clientId: workspace.clientId,
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
          workspaceId: workspace.id,
          clientId: workspace.clientId,
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
          clientId: workspace.clientId,
          grantId: created.id,
          toStatus: 'ACTIVE',
          metadataSafe: { source: 'identity-grant-create' },
        },
      });
      return created;
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error instanceof ClientIdentityError) throw error;
    if (['P2002', 'P2034'].includes((error as { code?: string })?.code || '')) throw new ClientIdentityError(409, 'GRANT_CONCURRENT_CONFLICT', 'The case grant changed concurrently.');
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
    prisma.clientPortalGrant.findMany({
      where: { clientPortalIdentityId: { in: identityIds } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, clientPortalIdentityId: true, caseId: true, status: true, permissions: true, validUntil: true, createdAt: true, updatedAt: true, revokedAt: true, revision: true },
    }),
  ]);
  const grantIds = grants.map((grant) => grant.id);
  const events = grantIds.length
    ? await prisma.clientPublicationEvent.findMany({
      where: { grantId: { in: grantIds } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, grantId: true, action: true, fromStatus: true, toStatus: true, createdAt: true },
    })
    : [];
  const idMap = new Map(identities.map((i) => [i.id, i]));
  const clientMap = new Map(clients.map((c) => [c.id, c]));
  return {
    items: memberships.map((m) => ({
      ...m,
      identityEmail: idMap.get(m.clientPortalIdentityId)?.normalizedEmail || null,
      identityDisplayName: idMap.get(m.clientPortalIdentityId)?.displayName || null,
      identityStatus: idMap.get(m.clientPortalIdentityId)?.status || null,
      clientName: clientMap.get(m.clientId)?.name || null,
      activeGrants: grants.filter((g) => g.clientPortalIdentityId === m.clientPortalIdentityId).map((g) => ({
        ...g,
        lifecycleEvents: events.filter((event) => event.grantId === g.id),
      })),
    })),
  };
}
