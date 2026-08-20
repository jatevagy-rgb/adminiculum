/**
 * Shared foundation for client-interaction domain services.
 *
 * Reuses the publication subsystem's safety posture: internal-role gating,
 * optimistic concurrency, forbidden-field (client-safe) scanning, internal
 * case-access, and — for customer routes — resolution of an ACTIVE case grant
 * bound to the authenticated ClientPortalIdentity.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';

export type Prisma = typeof defaultPrisma;
export type InternalActor = { userId: string; role?: string | null };

export const INTERNAL_ROLES = new Set(['ADMIN', 'PARTNER', 'LAWYER', 'COLLAB_LAWYER']);

export class InteractionError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'InteractionError';
    this.status = status;
    this.code = code;
  }
}

// Client-safe protection: these must never reach a customer-facing DTO or be
// written into a client-safe field. Mirrors the client-publication patterns.
const FORBIDDEN_PATTERNS = [
  /workInstruction/i, /internal.*rationale/i, /reviewer/i, /internalOwner/i, /internalPriority/i,
  /taskNotes|taskStatus/i, /annotation(Content|Text|Note)?/i, /CLIENT_CANDIDATE/i,
  /comparison(Segment|Text|Rationale|Excerpt)?/i, /review(Point|Decision|Rationale)/i,
  /communicationBody|mailbox/i, /storage(Key|Reference)|sharePoint|spItemId|spWebUrl|quarantineStorageReference|previewDerivativeReference/i,
  /audit(Row|Event)|activityFeed/i, /ai(Prompt|Response)|token|secret/i, /scanProvider|scanCodeSafe|detectedMimeType/i,
];

export function forbidden(value: unknown): boolean {
  return FORBIDDEN_PATTERNS.some((p) => p.test(JSON.stringify(value ?? null)));
}

/** Assert a mapped customer-facing DTO carries no forbidden internal fields. */
export function assertClientSafe(dto: unknown): void {
  if (forbidden(dto)) throw new InteractionError(500, 'PORTAL_DTO_FORBIDDEN_FIELD', 'Client DTO contains forbidden internal data.');
}

/** Validate + bound a client-safe text field; rejects internal-only content. */
export function safeText(value: unknown, field: string, limit: number, required = false): string | null {
  const output = value == null ? '' : String(value).trim();
  if (!output) {
    if (required) throw new InteractionError(400, 'FIELD_REQUIRED', `${field} is required.`);
    return null;
  }
  if (output.length > limit) throw new InteractionError(400, 'TEXT_TOO_LONG', `${field} is too long.`);
  if (forbidden(output)) throw new InteractionError(400, 'FORBIDDEN_CLIENT_FIELD', `${field} contains internal-only data.`);
  return output;
}

export function requireInternal(actor: InternalActor): void {
  if (!actor?.userId || !INTERNAL_ROLES.has(String(actor.role || ''))) {
    throw new InteractionError(403, 'INTERACTION_NOT_AUTHORIZED', 'Actor is not authorized for client-portal administration.');
  }
}

/** Optimistic concurrency: caller's expected revision must match the row. */
export function requireExpected(row: { revision: number }, expected: unknown): void {
  if (expected != null && Number(expected) !== Number(row.revision)) {
    throw new InteractionError(409, 'REVISION_CONFLICT', 'The record was modified by someone else. Reload and retry.');
  }
}

/** Internal case access — ADMIN/PARTNER, creator, assigned lawyer or collaborator. */
export async function assertInternalCaseAccess(actor: InternalActor, caseId: string, prisma: Prisma = defaultPrisma): Promise<{ id: string; clientId: string }> {
  const user = await prisma.user.findUnique({ where: { id: actor.userId }, select: { id: true, role: true, status: true, isActive: true } });
  if (!user || user.isActive === false || String(user.status) !== 'ACTIVE') throw new InteractionError(403, 'CASE_ACCESS_FORBIDDEN', 'Actor cannot access this case.');
  const caseRow = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, clientId: true, createdById: true, assignedLawyerId: true } });
  if (!caseRow) throw new InteractionError(404, 'CASE_NOT_FOUND', 'Case not found.');
  if (['ADMIN', 'PARTNER'].includes(String(user.role))) return { id: caseRow.id, clientId: caseRow.clientId };
  if (caseRow.createdById === actor.userId || caseRow.assignedLawyerId === actor.userId) return { id: caseRow.id, clientId: caseRow.clientId };
  const collab = await prisma.caseCollaborator.findFirst({ where: { caseId, userId: actor.userId }, select: { id: true } });
  if (collab) return { id: caseRow.id, clientId: caseRow.clientId };
  throw new InteractionError(403, 'CASE_ACCESS_FORBIDDEN', 'Actor cannot access this case.');
}

/**
 * Case queue scope for internal list endpoints. ADMIN/PARTNER may see all rows;
 * lawyers and collaborating lawyers are limited to cases they created, are
 * assigned to, or collaborate on. Returns `null` for global access.
 */
export async function internalCaseScope(actor: InternalActor, prisma: Prisma = defaultPrisma): Promise<string[] | null> {
  const user = await prisma.user.findUnique({ where: { id: actor.userId }, select: { id: true, role: true, status: true, isActive: true } });
  if (!user || user.isActive === false || String(user.status) !== 'ACTIVE') throw new InteractionError(403, 'CASE_ACCESS_FORBIDDEN', 'Actor cannot access client-portal queues.');
  if (['ADMIN', 'PARTNER'].includes(String(user.role))) return null;
  const [owned, collaborated] = await Promise.all([
    prisma.case.findMany({
      where: { OR: [{ createdById: actor.userId }, { assignedLawyerId: actor.userId }] },
      select: { id: true },
    }),
    prisma.caseCollaborator.findMany({ where: { userId: actor.userId }, select: { caseId: true } }),
  ]);
  return Array.from(new Set([...owned.map((c: { id: string }) => c.id), ...collaborated.map((c: { caseId: string }) => c.caseId)]));
}

/**
 * Canonical Client read-access gate for the internal company modules (Phase 1-4).
 * ADMIN/PARTNER may read any client; every other active workforce role is limited
 * to clients they have Case access in (created / assigned / collaborating).
 *
 * This is the single source of truth reused by the client-company, client-contracts,
 * client-organization and company-workspace services so the policy cannot drift.
 * It is NOT a new ACL and it never implies Case/Document/HR_CONFIDENTIAL access.
 *
 * Fail-closed on scope resolution: `internalCaseScope` returns `null` ONLY for
 * ADMIN/PARTNER (already returned above); for any other role it returns the
 * concrete (possibly empty) case-id list. A `null` reaching here would be
 * unexpected for a non-manager and must NEVER be treated as "all clients" — we
 * coerce it to an empty scope so access is denied, not silently granted.
 */
export async function assertClientReadAccess(
  actor: InternalActor,
  clientId: string,
  prisma: Prisma = defaultPrisma,
): Promise<{ id: string; name: string }> {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
  if (!client) throw new InteractionError(404, 'CLIENT_NOT_FOUND', 'Client not found.');
  const user = await prisma.user.findUnique({ where: { id: actor.userId }, select: { id: true, role: true, status: true, isActive: true } });
  if (!user || user.isActive === false || String(user.status) !== 'ACTIVE') {
    throw new InteractionError(403, 'CLIENT_ACCESS_FORBIDDEN', 'Actor cannot access this client.');
  }
  if (['ADMIN', 'PARTNER'].includes(String(user.role))) return client;
  const scope = await internalCaseScope(actor, prisma);
  const scopedCaseIds = scope ?? [];
  const has = await prisma.case.findFirst({ where: { id: { in: scopedCaseIds }, clientId }, select: { id: true } });
  if (!has) throw new InteractionError(403, 'CLIENT_ACCESS_FORBIDDEN', 'Actor has no case access in this client.');
  return client;
}

export async function applyInternalQueueCaseScope(where: Record<string, unknown>, actor: InternalActor, prisma: Prisma = defaultPrisma): Promise<Record<string, unknown>> {
  if (where.caseId) {
    await assertInternalCaseAccess(actor, String(where.caseId), prisma);
    return where;
  }
  const scope = await internalCaseScope(actor, prisma);
  if (scope) where.caseId = { in: scope };
  return where;
}

export interface CustomerContext {
  clientPortalIdentityId: string;
  caseId: string;
  clientId: string;
  grantId: string;
  workspaceId: string;
  membershipId: string;
  permissions: string[];
  // CP1 participant dimension. participantRole may be null for legacy grants that
  // predate the CP1 backfill; callers treat null as PARTICIPANT.
  participantRole: string | null;
  isRequester: boolean;
}

/**
 * Resolve the ACTIVE case grant for the authenticated customer identity. This
 * is the single authorization gate for every customer interaction route:
 * an ACTIVE, unexpired ClientPortalGrant bound to (identity, case). The client
 * and case are derived from the grant — never from customer input.
 */
export async function resolveActiveCustomerGrant(clientPortalIdentityId: string, caseId: string, workspaceId: string, prisma: Prisma = defaultPrisma): Promise<CustomerContext> {
  if (!clientPortalIdentityId) throw new InteractionError(401, 'CLIENT_PORTAL_AUTH_REQUIRED', 'Client portal authentication is required.');
  if (!workspaceId) throw new InteractionError(409, 'CLIENT_WORKSPACE_SELECTION_REQUIRED', 'Select an authorized workspace.');
  const identity = await prisma.clientPortalIdentity.findUnique({ where: { id: clientPortalIdentityId }, select: { status: true } });
  if (!identity || String(identity.status) !== 'ACTIVE') throw new InteractionError(403, 'CLIENT_IDENTITY_NOT_ACTIVE', 'Client identity is not active.');
  const membership = await prisma.clientPortalWorkspaceMembership.findFirst({
    where: {
      clientPortalIdentityId,
      workspaceId,
      status: 'ACTIVE',
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  });
  const workspace = membership
    ? await prisma.clientPortalWorkspace.findFirst({ where: { id: workspaceId, status: 'ACTIVE' }, select: { id: true, clientId: true } })
    : null;
  if (!membership || !workspace) throw new InteractionError(403, 'CLIENT_WORKSPACE_MEMBERSHIP_REQUIRED', 'Active workspace membership is required.');
  const grant = await prisma.clientPortalGrant.findFirst({
    where: {
      clientPortalIdentityId,
      caseId,
      workspaceId,
      status: 'ACTIVE',
      validFrom: { lte: new Date() },
      OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
    },
    select: { id: true, clientId: true, caseId: true, permissions: true, participantRole: true, isRequester: true },
  });
  if (!grant) throw new InteractionError(403, 'CLIENT_PORTAL_NO_ACTIVE_GRANT', 'No active case grant for this client.');
  if (grant.clientId !== workspace.clientId) throw new InteractionError(403, 'CLIENT_WORKSPACE_CLIENT_MISMATCH', 'The case grant is outside the selected workspace.');
  return {
    clientPortalIdentityId,
    caseId: grant.caseId,
    clientId: grant.clientId,
    grantId: grant.id,
    workspaceId,
    membershipId: membership.id,
    permissions: (grant.permissions as string[]) || [],
    participantRole: grant.participantRole ? String(grant.participantRole) : null,
    isRequester: Boolean(grant.isRequester),
  };
}

/** The client-safe audience snapshot stored on published requests. */
export function audienceSnapshot(ctx: { clientId: string; caseId: string; grantId: string }): Record<string, unknown> {
  return { clientId: ctx.clientId, caseId: ctx.caseId, grantId: ctx.grantId, capturedAt: new Date().toISOString() };
}
