/**
 * CP1 leadership summary — content-free aggregate visibility. A summary scope
 * NEVER creates a case grant and never permits case detail, messages, documents,
 * requester identities, raw case titles or internal time descriptions. Responses
 * contain only counts and safe stage/unit labels, computed with aggregate
 * queries — never by loading full case DTOs and stripping fields afterwards.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { InteractionError } from '../client-interaction/base';
import { requireOrganizationWorkspace } from './organizationalAccessPolicy';

type Prisma = typeof defaultPrisma;

const APPROACHING_DEADLINE_DAYS = 14;

async function activeMembershipId(clientPortalIdentityId: string, workspaceId: string, prisma: Prisma): Promise<string> {
  const membership = await prisma.clientPortalWorkspaceMembership.findFirst({
    where: { clientPortalIdentityId, workspaceId, status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    select: { id: true },
  });
  if (!membership) throw new InteractionError(403, 'CLIENT_WORKSPACE_MEMBERSHIP_REQUIRED', 'Active workspace membership is required.');
  return membership.id;
}

/** Whether the identity holds a UNIT summary scope for a specific group. */
export async function canViewUnitSummary(clientPortalIdentityId: string, workspaceId: string, groupId: string, prisma: Prisma = defaultPrisma): Promise<boolean> {
  const membershipId = await activeMembershipId(clientPortalIdentityId, workspaceId, prisma);
  const scope = await prisma.clientPortalSummaryScope.findFirst({
    where: { workspaceMembershipId: membershipId, workspaceId, organizationGroupId: groupId, scopeType: 'UNIT', status: 'ACTIVE' },
    select: { id: true },
  });
  return Boolean(scope);
}

/** Whether the identity holds an ORGANIZATION summary scope for the workspace. */
export async function canViewOrganizationSummary(clientPortalIdentityId: string, workspaceId: string, prisma: Prisma = defaultPrisma): Promise<boolean> {
  const membershipId = await activeMembershipId(clientPortalIdentityId, workspaceId, prisma);
  const scope = await prisma.clientPortalSummaryScope.findFirst({
    where: { workspaceMembershipId: membershipId, workspaceId, scopeType: 'ORGANIZATION', status: 'ACTIVE' },
    select: { id: true },
  });
  return Boolean(scope);
}

/**
 * A summary scope NEVER grants case content. Content is only ever reachable via a
 * real participant grant. This returns true only when the identity holds an
 * active participant grant for the case in the workspace — proving the boundary.
 */
export async function mayViewCaseContent(clientPortalIdentityId: string, workspaceId: string, caseId: string, prisma: Prisma = defaultPrisma): Promise<boolean> {
  const now = new Date();
  const grant = await prisma.clientPortalGrant.findFirst({
    where: { clientPortalIdentityId, workspaceId, caseId, status: 'ACTIVE', validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
    select: { id: true },
  });
  return Boolean(grant);
}

interface UnitAggregate {
  organizationUnitName: string | null;
  activeCaseCount: number;
  closedCaseCount: number;
  waitingOnCustomerCount: number;
  waitingOnOfficeCount: number;
  approachingDeadlineCount: number;
  publicStageCounts: Record<string, number>;
}

/** Case ids linked (via intake) to a set of organization groups. */
async function caseIdsForGroups(workspaceId: string, groupIds: string[], prisma: Prisma): Promise<Map<string, string[]>> {
  const byGroup = new Map<string, string[]>();
  if (!groupIds.length) return byGroup;
  const intakes = await prisma.clientPortalIntakeRequest.findMany({
    where: { workspaceId, organizationGroupId: { in: groupIds }, linkedCaseId: { not: null } },
    select: { organizationGroupId: true, linkedCaseId: true },
  });
  for (const intake of intakes) {
    if (!intake.organizationGroupId || !intake.linkedCaseId) continue;
    const list = byGroup.get(intake.organizationGroupId) || [];
    if (!list.includes(intake.linkedCaseId)) list.push(intake.linkedCaseId);
    byGroup.set(intake.organizationGroupId, list);
  }
  return byGroup;
}

/** Aggregate content-free counts for a set of case ids. */
async function aggregateForCases(unitName: string | null, caseIds: string[], prisma: Prisma): Promise<UnitAggregate> {
  const empty: UnitAggregate = { organizationUnitName: unitName, activeCaseCount: 0, closedCaseCount: 0, waitingOnCustomerCount: 0, waitingOnOfficeCount: 0, approachingDeadlineCount: 0, publicStageCounts: {} };
  if (!caseIds.length) return empty;
  const publications = await prisma.clientMatterPublication.findMany({
    where: { caseId: { in: caseIds } },
    select: { caseId: true, status: true, currentRevisionId: true },
  });
  const activeCaseIds = publications.filter((publication) => String(publication.status) === 'PUBLISHED').map((publication) => publication.caseId);
  const closedCaseIds = publications.filter((publication) => ['REVOKED', 'SUPERSEDED'].includes(String(publication.status))).map((publication) => publication.caseId);
  const revisionIds = publications.filter((publication) => String(publication.status) === 'PUBLISHED' && publication.currentRevisionId).map((publication) => publication.currentRevisionId as string);
  const revisions = revisionIds.length ? await prisma.clientMatterPublicationRevision.findMany({ where: { id: { in: revisionIds } }, select: { clientSafeStatus: true, publishedDeadlinesSnapshot: true } }) : [];
  const stageCounts: Record<string, number> = {};
  const soon = Date.now() + APPROACHING_DEADLINE_DAYS * 24 * 60 * 60 * 1000;
  let approaching = 0;
  for (const revision of revisions) {
    stageCounts[revision.clientSafeStatus] = (stageCounts[revision.clientSafeStatus] || 0) + 1;
    const deadlines = Array.isArray(revision.publishedDeadlinesSnapshot) ? revision.publishedDeadlinesSnapshot as Array<{ dueAt?: string }> : [];
    if (deadlines.some((deadline) => deadline?.dueAt && new Date(deadline.dueAt).getTime() <= soon && new Date(deadline.dueAt).getTime() >= Date.now())) approaching += 1;
  }
  const waitingCustomer = activeCaseIds.length
    ? (await prisma.clientActionRequest.groupBy({ by: ['caseId'], where: { caseId: { in: activeCaseIds }, status: 'PUBLISHED' }, _count: { _all: true } })).length
    : 0;
  return {
    organizationUnitName: unitName,
    activeCaseCount: new Set(activeCaseIds).size,
    closedCaseCount: new Set(closedCaseIds).size,
    waitingOnCustomerCount: waitingCustomer,
    waitingOnOfficeCount: Math.max(0, new Set(activeCaseIds).size - waitingCustomer),
    approachingDeadlineCount: approaching,
    publicStageCounts: stageCounts,
  };
}

/** UNIT summary for a specific organization group (requires an active UNIT scope). */
export async function unitSummary(clientPortalIdentityId: string, workspaceId: string, groupId: string, prisma: Prisma = defaultPrisma): Promise<UnitAggregate> {
  const workspace = await requireOrganizationWorkspace(workspaceId, prisma);
  if (!(await canViewUnitSummary(clientPortalIdentityId, workspaceId, groupId, prisma))) {
    throw new InteractionError(403, 'CLIENT_SUMMARY_SCOPE_FORBIDDEN', 'A unit summary scope is required.');
  }
  const group = await prisma.clientOrganizationGroup.findFirst({ where: { id: groupId, workspaceId: workspace.id, status: 'ACTIVE' }, select: { name: true } });
  const caseMap = await caseIdsForGroups(workspace.id, [groupId], prisma);
  return aggregateForCases(group?.name ?? null, caseMap.get(groupId) || [], prisma);
}

/** ORGANIZATION summary across all units (requires an active ORGANIZATION scope). */
export async function organizationSummary(clientPortalIdentityId: string, workspaceId: string, prisma: Prisma = defaultPrisma): Promise<{ units: UnitAggregate[] }> {
  const workspace = await requireOrganizationWorkspace(workspaceId, prisma);
  if (!(await canViewOrganizationSummary(clientPortalIdentityId, workspaceId, prisma))) {
    throw new InteractionError(403, 'CLIENT_SUMMARY_SCOPE_FORBIDDEN', 'An organization summary scope is required.');
  }
  const groups = await prisma.clientOrganizationGroup.findMany({ where: { workspaceId: workspace.id, status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  const caseMap = await caseIdsForGroups(workspace.id, groups.map((group) => group.id), prisma);
  const units: UnitAggregate[] = [];
  for (const group of groups) {
    units.push(await aggregateForCases(group.name, caseMap.get(group.id) || [], prisma));
  }
  return { units };
}
