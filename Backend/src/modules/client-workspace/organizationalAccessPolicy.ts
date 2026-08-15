/**
 * CP1 organizational customer access policy — the single, centralized typed
 * authorization surface for organizational portal case access.
 *
 * The frontend is NEVER the authorization boundary. Every organizational route
 * asks this policy. Access requires BOTH an active workspace membership AND an
 * active workspace-scoped case grant; workspace membership or organization-unit
 * membership alone never grants a case. Participant role and permissions are
 * server-derived from the grant; client-supplied role/permission is ignored.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import {
  CustomerContext,
  InteractionError,
  resolveActiveCustomerGrant,
} from '../client-interaction/base';

type Prisma = typeof defaultPrisma;

export type ParticipantRole = 'REQUESTER' | 'CLIENT_OWNER' | 'PARTICIPANT' | 'OBSERVER';
export type RelationshipToCase = 'OWN' | 'SHARED';

/** Typed, server-enforced permission decisions for one participant on one case. */
export interface CasePermissionDecision {
  canListCase: boolean;
  canViewSummary: boolean;
  canViewClientTimeline: boolean;
  canViewDocuments: boolean;
  canDownloadDocument: boolean;
  canUploadDocuments: boolean;
  canViewMessages: boolean;
  canSendMessages: boolean;
  canViewHours: boolean;
  canViewBillingStatement: boolean;
}

export interface ParticipantAccess extends CasePermissionDecision {
  context: CustomerContext;
  participantRole: ParticipantRole;
  relationshipToCase: RelationshipToCase;
}

/** Legacy/absent participant role is treated as the least-privileged PARTICIPANT. */
export function normalizeParticipantRole(role: string | null | undefined): ParticipantRole {
  const value = String(role || '').toUpperCase();
  if (value === 'REQUESTER' || value === 'CLIENT_OWNER' || value === 'OBSERVER' || value === 'PARTICIPANT') {
    return value as ParticipantRole;
  }
  return 'PARTICIPANT';
}

/**
 * Server-derived own/shared classification. OWN only for the responsible parties
 * (requester or client-side owner); everyone else is SHARED. Never inferred from
 * email, case creator, client membership, org group or any client-supplied value.
 */
export function classifyRelationship(role: ParticipantRole, isRequester: boolean): RelationshipToCase {
  if (isRequester || role === 'REQUESTER' || role === 'CLIENT_OWNER') return 'OWN';
  return 'SHARED';
}

/**
 * Pure permission decision from the (server-loaded) participant role + granted
 * permission set. Permissions are the authority; role is descriptive. No decision
 * is ever inferred from workspace mode, tab, membership or client input.
 */
export function decidePermissions(role: ParticipantRole, permissions: string[]): CasePermissionDecision {
  const held = new Set(permissions.map((permission) => String(permission).toUpperCase()));
  const can = (permission: string) => held.has(permission);
  return {
    canListCase: can('MATTER_READ'),
    canViewSummary: can('MATTER_READ'),
    canViewClientTimeline: can('CLIENT_TIMELINE_READ'),
    canViewDocuments: can('DOCUMENT_READ'),
    canDownloadDocument: can('DOCUMENT_DOWNLOAD'),
    // Observers never upload or send, regardless of an over-broad permission set.
    canUploadDocuments: role !== 'OBSERVER' && can('DOCUMENT_UPLOAD'),
    canViewMessages: can('MESSAGE_READ'),
    canSendMessages: role !== 'OBSERVER' && can('MESSAGE_SEND'),
    canViewHours: can('HOURS_READ'),
    canViewBillingStatement: can('BILLING_STATEMENT_READ'),
  };
}

/** Assert the selected workspace is an ACTIVE organization-style customer workspace. */
export async function requireOrganizationWorkspace(workspaceId: string, prisma: Prisma = defaultPrisma): Promise<{ id: string; clientId: string }> {
  if (!workspaceId) throw new InteractionError(409, 'CLIENT_WORKSPACE_SELECTION_REQUIRED', 'Select an authorized workspace.');
  const workspace = await prisma.clientPortalWorkspace.findFirst({
    where: { id: workspaceId, status: 'ACTIVE' },
    select: { id: true, clientId: true, mode: true },
  });
  if (!workspace) throw new InteractionError(403, 'CLIENT_WORKSPACE_MEMBERSHIP_REQUIRED', 'Active workspace membership is required.');
  if (!['ORGANIZATION', 'CASE_RELAY'].includes(String(workspace.mode))) {
    throw new InteractionError(403, 'CLIENT_WORKSPACE_NOT_ORGANIZATION', 'This surface is only available for organizational workspaces.');
  }
  return { id: workspace.id, clientId: workspace.clientId };
}

/**
 * Resolve the full participant access for (identity, workspace, case). Delegates
 * the membership + workspace + grant + client-match checks to the canonical
 * resolver, then layers the typed participant role, relationship and decisions.
 */
export async function resolveParticipantAccess(
  clientPortalIdentityId: string,
  caseId: string,
  workspaceId: string,
  prisma: Prisma = defaultPrisma,
): Promise<ParticipantAccess> {
  const context = await resolveActiveCustomerGrant(clientPortalIdentityId, caseId, workspaceId, prisma);
  const participantRole = normalizeParticipantRole(context.participantRole);
  const relationshipToCase = classifyRelationship(participantRole, context.isRequester);
  const decision = decidePermissions(participantRole, context.permissions);
  return { context, participantRole, relationshipToCase, ...decision };
}

/** Enforce a specific decision, raising a 403 when the participant lacks it. */
export function requirePermission(access: ParticipantAccess, key: keyof CasePermissionDecision, code: string): void {
  if (!access[key]) throw new InteractionError(403, code, 'This action is not permitted for your case access.');
}
