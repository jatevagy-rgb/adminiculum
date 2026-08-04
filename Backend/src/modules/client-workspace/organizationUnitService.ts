/**
 * CP1 organizational-unit resolution. The canonical portal organizational unit
 * is ClientOrganizationGroup, linked to exactly one ORGANIZATION workspace.
 * Department and ClientWorkgroup are NEVER used for portal authorization, and
 * matching names/emails never grant access.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { InteractionError } from '../client-interaction/base';
import { requireOrganizationWorkspace } from './organizationalAccessPolicy';

type Prisma = typeof defaultPrisma;

export interface OrganizationUnit {
  id: string;
  name: string;
  descriptionSafe: string | null;
}

/** Active organization units linked to the given ORGANIZATION workspace. */
export async function resolveWorkspaceUnits(workspaceId: string, prisma: Prisma = defaultPrisma): Promise<OrganizationUnit[]> {
  const workspace = await requireOrganizationWorkspace(workspaceId, prisma);
  const groups = await prisma.clientOrganizationGroup.findMany({
    where: { workspaceId: workspace.id, clientId: workspace.clientId, status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, descriptionSafe: true },
  });
  return groups.map((group) => ({ id: group.id, name: group.name, descriptionSafe: group.descriptionSafe }));
}

/**
 * Active organization-unit memberships the authenticated identity holds within
 * the selected workspace. Only ACTIVE memberships whose group is linked to this
 * workspace (same Client) are returned; cross-workspace/cross-Client groups are
 * excluded. A member may belong to multiple units.
 */
export async function resolveMemberUnits(clientPortalIdentityId: string, workspaceId: string, prisma: Prisma = defaultPrisma): Promise<OrganizationUnit[]> {
  const workspace = await requireOrganizationWorkspace(workspaceId, prisma);
  const memberships = await prisma.clientOrganizationMembership.findMany({
    where: { clientPortalIdentityId, clientId: workspace.clientId, status: 'ACTIVE', groupId: { not: null } },
    select: { groupId: true },
  });
  const groupIds = memberships.map((membership) => membership.groupId).filter((id): id is string => Boolean(id));
  if (!groupIds.length) return [];
  const groups = await prisma.clientOrganizationGroup.findMany({
    where: { id: { in: groupIds }, workspaceId: workspace.id, clientId: workspace.clientId, status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, descriptionSafe: true },
  });
  return groups.map((group) => ({ id: group.id, name: group.name, descriptionSafe: group.descriptionSafe }));
}

/**
 * Validate that a referenced unit is one the identity may reference in a filter:
 * it must be an active unit of the workspace AND the identity must be an active
 * member of it. Returns the unit or throws 403.
 */
export async function requireReferenceableUnit(clientPortalIdentityId: string, workspaceId: string, groupId: string, prisma: Prisma = defaultPrisma): Promise<OrganizationUnit> {
  const units = await resolveMemberUnits(clientPortalIdentityId, workspaceId, prisma);
  const unit = units.find((candidate) => candidate.id === groupId);
  if (!unit) throw new InteractionError(403, 'CLIENT_UNIT_NOT_REFERENCEABLE', 'The requested organizational unit is not available.');
  return unit;
}

/** Safe display name for a unit id (or null). Never leaks cross-workspace units. */
export async function safeUnitName(workspaceId: string, groupId: string | null, prisma: Prisma = defaultPrisma): Promise<string | null> {
  if (!groupId) return null;
  const group = await prisma.clientOrganizationGroup.findFirst({
    where: { id: groupId, workspaceId, status: 'ACTIVE' },
    select: { name: true },
  });
  return group?.name ?? null;
}
