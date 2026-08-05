import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { InteractionError } from '../client-interaction/base';
import { requireCapability } from '../client-interaction/gates';

type Prisma = typeof defaultPrisma | any;

export interface IntakeCustomerContext {
  clientPortalIdentityId: string;
  workspaceId: string;
  membershipId: string;
  clientId: string;
  organizationGroupId: string;
  organizationGroupName: string;
}

export async function resolveIntakeWorkspaceContext(
  clientPortalIdentityId: string,
  workspaceId: string,
  prisma: Prisma = defaultPrisma,
): Promise<{ clientPortalIdentityId: string; workspaceId: string; membershipId: string; clientId: string }> {
  requireIntakeCapability();
  if (!clientPortalIdentityId) throw new InteractionError(401, 'CLIENT_PORTAL_AUTH_REQUIRED', 'Client portal authentication is required.');
  if (!workspaceId) throw new InteractionError(409, 'CLIENT_WORKSPACE_SELECTION_REQUIRED', 'Select an authorized workspace.');
  const identity = await prisma.clientPortalIdentity.findUnique({ where: { id: clientPortalIdentityId }, select: { id: true, status: true } });
  if (!identity || String(identity.status) !== 'ACTIVE') throw new InteractionError(403, 'CLIENT_IDENTITY_NOT_ACTIVE', 'Client identity is not active.');
  const workspace = await prisma.clientPortalWorkspace.findFirst({ where: { id: workspaceId, status: 'ACTIVE' }, select: { id: true, clientId: true, mode: true, communicationMode: true } });
  if (!workspace) throw new InteractionError(403, 'CLIENT_WORKSPACE_MEMBERSHIP_REQUIRED', 'Active workspace membership is required.');
  if (String(workspace.mode) !== 'ORGANIZATION') throw new InteractionError(403, 'CLIENT_WORKSPACE_NOT_ORGANIZATION', 'Organizational intake is not available in this workspace.');
  if (String(workspace.communicationMode) === 'EXTERNAL_ONLY') throw new InteractionError(403, 'CLIENT_INTAKE_EXTERNAL_ONLY', 'Intake is handled in the connected external system.');
  const membership = await prisma.clientPortalWorkspaceMembership.findFirst({ where: { clientPortalIdentityId, workspaceId, status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { id: true } });
  if (!membership) throw new InteractionError(403, 'CLIENT_WORKSPACE_MEMBERSHIP_REQUIRED', 'Active workspace membership is required.');
  return { clientPortalIdentityId, workspaceId, membershipId: membership.id, clientId: workspace.clientId };
}

export function requireIntakeCapability(): void {
  requireCapability('ORGANIZATIONAL_INTAKE');
}

export async function resolveIntakeCustomerContext(
  clientPortalIdentityId: string,
  workspaceId: string,
  organizationGroupId: string,
  prisma: Prisma = defaultPrisma,
): Promise<IntakeCustomerContext> {
  const context = await resolveIntakeWorkspaceContext(clientPortalIdentityId, workspaceId, prisma);

  const group = await prisma.clientOrganizationGroup.findFirst({
    where: { id: organizationGroupId, workspaceId, clientId: context.clientId, status: 'ACTIVE' },
    select: { id: true, name: true },
  });
  if (!group) throw new InteractionError(403, 'CLIENT_UNIT_NOT_REFERENCEABLE', 'The requested organizational unit is not available.');
  const unitMembership = await prisma.clientOrganizationMembership.findFirst({
    where: { clientPortalIdentityId, clientId: context.clientId, groupId: group.id, status: 'ACTIVE' },
    select: { id: true },
  });
  if (!unitMembership) throw new InteractionError(403, 'CLIENT_UNIT_NOT_REFERENCEABLE', 'The requested organizational unit is not available.');

  return {
    clientPortalIdentityId,
    workspaceId,
    membershipId: context.membershipId,
    clientId: context.clientId,
    organizationGroupId: group.id,
    organizationGroupName: group.name,
  };
}

export async function loadOwnedIntake(
  clientPortalIdentityId: string,
  workspaceId: string,
  intakeId: string,
  prisma: Prisma = defaultPrisma,
) {
  const context = await resolveIntakeWorkspaceContext(clientPortalIdentityId, workspaceId, prisma);
  const intake = await prisma.clientPortalIntakeRequest.findFirst({
    where: { id: intakeId, workspaceId, requesterMembershipId: context.membershipId },
    include: { attachments: true, informationRequests: { include: { fields: { orderBy: { displayOrder: 'asc' } } }, orderBy: { createdAt: 'desc' } } },
  });
  if (!intake) throw new InteractionError(404, 'INTAKE_NOT_FOUND', 'Intake is not available.');
  return { intake, membershipId: context.membershipId };
}
