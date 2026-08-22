/**
 * ORGANIZATIONAL WORKSPACE READ-ONLY MAP (internal workforce projection).
 *
 * A narrow workforce-only read projection for the law-firm "Szervezet" surface.
 * It returns the canonical organization data (ClientOrganizationGroup tree +
 * OrganizationPerson with manager/deputy/group/responsibilities) plus a
 * PRINCIPAL-DERIVED portal status and access summary.
 *
 * HARD INVARIANT — ORGANIZATION GRAPH != AUTHORIZATION GRAPH:
 *   - manager / deputy / group / reporting line / responsibility / portal
 *     membership NEVER imply access.
 *   - portal status is derived from the linked workspace membership state.
 *   - the access summary is derived ONLY from actual authorization principals:
 *       ClientPortalGrant (ACTIVE)        -> case access count
 *       ClientPortalSummaryScope (ACTIVE) -> aggregate visibility (unit/org)
 *     It is NEVER inferred from the org graph.
 *
 * Workforce-only: uses `assertClientReadAccess` (the canonical Phase 1-3 access
 * posture). No customer route, no write path, no new ACL, no schema change.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { InteractionError, InternalActor, assertClientReadAccess, assertClientSafe } from '../client-interaction/base';

type Prisma = typeof defaultPrisma;

const ACTIVE_GRANT_STATUS = 'ACTIVE';
const ACTIVE_SCOPE_STATUS = 'ACTIVE';

function iso(v: Date | null | undefined): string | null {
  return v ? v.toISOString() : null;
}

function mapPortalStatus(membershipStatus: string | null | undefined): 'ACTIVE' | 'SUSPENDED' | 'NONE' {
  if (!membershipStatus) return 'NONE';
  if (membershipStatus === 'ACTIVE') return 'ACTIVE';
  if (membershipStatus === 'SUSPENDED') return 'SUSPENDED';
  return 'NONE';
}

/**
 * Build the internal organizational map for a client.
 *
 * Returns groups, persons (org graph), each person's portal status, and a
 * principal-derived access summary. Access counts come ONLY from real
 * ClientPortalGrant / ClientPortalSummaryScope rows; never from manager, deputy,
 * group, responsibility, or portal membership linkage alone.
 */
export async function getOrganizationMap(actor: InternalActor, clientId: string, prisma: Prisma = defaultPrisma) {
  await assertClientReadAccess(actor, clientId, prisma);

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, relationshipMode: true } });
  if (!client) throw new InteractionError(404, 'CLIENT_NOT_FOUND', 'Client not found.');

  // Active portal workspace modes inform the INDIVIDUAL / ORGANIZATION guard.
  // The Szervezet surface is organizational-only. A client with an ACTIVE
  // ORGANIZATION (or CASE_RELAY) workspace is treated as organizational; an
  // INDIVIDUAL-only client is not.
  const workspaces = await prisma.clientPortalWorkspace.findMany({
    where: { clientId, status: 'ACTIVE' },
    select: { id: true, mode: true },
  });
  const workspaceModes = [...new Set(workspaces.map((w) => w.mode))];
  const isOrganizational = workspaceModes.some((m) => m === 'ORGANIZATION' || m === 'CASE_RELAY');

  const [groups, persons] = await Promise.all([
    prisma.clientOrganizationGroup.findMany({ where: { clientId }, orderBy: { name: 'asc' } }),
    prisma.organizationPerson.findMany({
      where: { clientId },
      orderBy: [{ name: 'asc' }],
      include: {
        responsibilities: { orderBy: { createdAt: 'asc' } },
        organizationGroup: { select: { id: true, name: true } },
        managerPerson: { select: { id: true, name: true } },
        deputyPerson: { select: { id: true, name: true } },
      },
    }),
  ]);

  // Resolve portal memberships for persons that reference one. This is used ONLY
  // to read portal STATUS and to JOIN to real authorization principals. It never
  // creates access by itself.
  const membershipIds = persons.map((p) => p.portalMembershipId).filter((id): id is string => Boolean(id));
  const memberships = membershipIds.length
    ? await prisma.clientPortalWorkspaceMembership.findMany({ where: { id: { in: membershipIds } }, select: { id: true, status: true, clientPortalIdentityId: true, workspaceId: true } })
    : [];
  const membershipById = new Map(memberships.map((m) => [m.id, m]));

  const identityIds = [...new Set(memberships.map((m) => m.clientPortalIdentityId).filter(Boolean))];

  // Actual authorization principals, scoped to this client.
  const [grants, scopes] = await Promise.all([
    identityIds.length
      ? prisma.clientPortalGrant.findMany({
          where: { clientId, clientPortalIdentityId: { in: identityIds }, status: ACTIVE_GRANT_STATUS },
          select: { id: true, clientPortalIdentityId: true, caseId: true },
        })
      : Promise.resolve([]),
    membershipIds.length
      ? prisma.clientPortalSummaryScope.findMany({
          where: { workspaceMembershipId: { in: membershipIds }, status: ACTIVE_SCOPE_STATUS },
          select: { id: true, workspaceMembershipId: true, scopeType: true },
        })
      : Promise.resolve([]),
  ]);

  const grantCountByIdentity = new Map<string, number>();
  for (const g of grants) {
    if (g.clientPortalIdentityId) grantCountByIdentity.set(g.clientPortalIdentityId, (grantCountByIdentity.get(g.clientPortalIdentityId) || 0) + 1);
  }

  const scopeByMembership = new Map<string, { unitCount: number; orgCount: number }>();
  for (const s of scopes) {
    const entry = scopeByMembership.get(s.workspaceMembershipId) || { unitCount: 0, orgCount: 0 };
    if (s.scopeType === 'ORGANIZATION') entry.orgCount += 1;
    else entry.unitCount += 1;
    scopeByMembership.set(s.workspaceMembershipId, entry);
  }

  const personsDto = persons.map((p) => {
    const membership = p.portalMembershipId ? membershipById.get(p.portalMembershipId) : undefined;
    const identityId = membership?.clientPortalIdentityId ?? null;
    const scope = p.portalMembershipId ? scopeByMembership.get(p.portalMembershipId) : undefined;

    // Principal-derived access summary. Cases come from ACTIVE grants to the
    // person's portal identity; aggregate visibility from ACTIVE summary scopes
    // on the person's membership. Neither manager/group/deputy/responsibility
    // nor portal-membership linkage alone contributes.
    const accessSummary = {
      casesShared: identityId ? (grantCountByIdentity.get(identityId) || 0) : 0,
      unitSummaries: scope?.unitCount ?? 0,
      organizationSummaries: scope?.orgCount ?? 0,
      companySummaryVisible: Boolean(scope && scope.orgCount > 0),
    };

    return {
      id: p.id,
      name: p.name,
      jobTitle: p.jobTitle,
      employmentStatus: p.employmentStatus,
      organizationGroupId: p.organizationGroupId,
      organizationGroupName: p.organizationGroup?.name ?? null,
      managerPersonId: p.managerPersonId,
      managerName: p.managerPerson?.name ?? null,
      deputyPersonId: p.deputyPersonId,
      deputyName: p.deputyPerson?.name ?? null,
      responsibilitiesSummary: p.responsibilitiesSummary,
      portalMembershipId: p.portalMembershipId,
      portalStatus: mapPortalStatus(membership?.status),
      responsibilities: p.responsibilities.map((r) => ({ id: r.id, type: r.type, label: r.label })),
      accessSummary,
    };
  });

  const dto = {
    client: { id: client.id, name: client.name, relationshipMode: client.relationshipMode },
    workspaceModes,
    isOrganizational,
    groups: groups.map((g) => ({
      id: g.id,
      clientId: g.clientId,
      workspaceId: g.workspaceId,
      name: g.name,
      descriptionSafe: g.descriptionSafe,
      status: String(g.status),
      parentGroupId: g.parentGroupId,
    })),
    persons: personsDto,
  };

  assertClientSafe(dto);
  return dto;
}