/**
 * Security-focused unit tests for the internal organizational map projection
 * (company-workspace/orgMapService). Exercises the real service against a mocked
 * Prisma client to verify the HARD INVARIANT:
 *
 *   ORGANIZATION GRAPH != AUTHORIZATION GRAPH
 *
 * Access counts come ONLY from ACTIVE ClientPortalGrant / ClientPortalSummaryScope
 * rows. Manager, deputy, group, responsibility, and portal-membership linkage
 * NEVER contribute to the access summary on their own.
 */
const prismaMock: any = {
  client: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  clientPortalWorkspace: { findMany: jest.fn() },
  clientOrganizationGroup: { findMany: jest.fn() },
  organizationPerson: { findMany: jest.fn() },
  clientPortalWorkspaceMembership: { findMany: jest.fn() },
  clientPortalGrant: { findMany: jest.fn() },
  clientPortalSummaryScope: { findMany: jest.fn() },
};

jest.mock('../src/prisma/prisma.service', () => ({ prisma: prismaMock }));

import { getOrganizationMap } from '../src/modules/company-workspace/orgMapService';

const ADMIN = { userId: 'user-admin', role: 'ADMIN' };

function personRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    clientId: 'client-1',
    organizationGroupId: 'g1',
    organizationGroup: { id: 'g1', name: 'Vezetés' },
    managerPersonId: null,
    managerPerson: null,
    deputyPersonId: null,
    deputyPerson: null,
    name: 'Anna',
    jobTitle: 'Ügyvezető',
    employmentStatus: 'ACTIVE',
    startDate: null,
    endDate: null,
    responsibilitiesSummary: null,
    portalMembershipId: null,
    responsibilities: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.client.findUnique.mockResolvedValue({ id: 'client-1', name: 'Acme', relationshipMode: 'PORTAL_CENTRIC' });
  prismaMock.user.findUnique.mockResolvedValue({ id: ADMIN.userId, role: 'ADMIN', status: 'ACTIVE', isActive: true });
  prismaMock.clientPortalWorkspace.findMany.mockResolvedValue([{ id: 'ws1', mode: 'ORGANIZATION' }]);
  prismaMock.clientOrganizationGroup.findMany.mockResolvedValue([]);
  prismaMock.organizationPerson.findMany.mockResolvedValue([]);
  prismaMock.clientPortalWorkspaceMembership.findMany.mockResolvedValue([]);
  prismaMock.clientPortalGrant.findMany.mockResolvedValue([]);
  prismaMock.clientPortalSummaryScope.findMany.mockResolvedValue([]);
});

describe('orgMapService — access summary derives ONLY from real principals', () => {
  it('manager relationship alone does NOT add case access', async () => {
    const person = personRow({
      id: 'a',
      name: 'Anna',
      managerPersonId: 'b',
      managerPerson: { id: 'b', name: 'Béla' },
      portalMembershipId: 'm1',
    });
    prismaMock.organizationPerson.findMany.mockResolvedValue([person]);
    prismaMock.clientPortalWorkspaceMembership.findMany.mockResolvedValue([
      { id: 'm1', status: 'ACTIVE', clientPortalIdentityId: 'id-1', workspaceId: 'ws1' },
    ]);
    // No grants, no scopes: a manager with no real grants must have 0 case access.
    prismaMock.clientPortalGrant.findMany.mockResolvedValue([]);
    prismaMock.clientPortalSummaryScope.findMany.mockResolvedValue([]);

    const dto = await getOrganizationMap(ADMIN, 'client-1');
    expect(dto.persons[0].accessSummary.casesShared).toBe(0);
    expect(dto.persons[0].accessSummary.companySummaryVisible).toBe(false);
    expect(dto.persons[0].portalStatus).toBe('ACTIVE');
  });

  it('group membership alone does NOT add case access', async () => {
    const person = personRow({
      id: 'a',
      name: 'Anna',
      organizationGroupId: 'g1',
      portalMembershipId: 'm1',
    });
    prismaMock.organizationPerson.findMany.mockResolvedValue([person]);
    prismaMock.clientPortalWorkspaceMembership.findMany.mockResolvedValue([
      { id: 'm1', status: 'ACTIVE', clientPortalIdentityId: 'id-1', workspaceId: 'ws1' },
    ]);
    prismaMock.clientPortalGrant.findMany.mockResolvedValue([]);
    prismaMock.clientPortalSummaryScope.findMany.mockResolvedValue([]);

    const dto = await getOrganizationMap(ADMIN, 'client-1');
    expect(dto.persons[0].accessSummary.casesShared).toBe(0);
  });

  it('portal membership alone does NOT create case/document access', async () => {
    const person = personRow({ id: 'a', name: 'Anna', portalMembershipId: 'm1' });
    prismaMock.organizationPerson.findMany.mockResolvedValue([person]);
    // Membership is ACTIVE but carries no grants and no scopes.
    prismaMock.clientPortalWorkspaceMembership.findMany.mockResolvedValue([
      { id: 'm1', status: 'ACTIVE', clientPortalIdentityId: 'id-1', workspaceId: 'ws1' },
    ]);
    prismaMock.clientPortalGrant.findMany.mockResolvedValue([]);
    prismaMock.clientPortalSummaryScope.findMany.mockResolvedValue([]);

    const dto = await getOrganizationMap(ADMIN, 'client-1');
    expect(dto.persons[0].accessSummary.casesShared).toBe(0);
    expect(dto.persons[0].accessSummary.unitSummaries).toBe(0);
    expect(dto.persons[0].accessSummary.companySummaryVisible).toBe(false);
  });

  it('access summary reflects REAL ACTIVE grants and scopes', async () => {
    const person = personRow({ id: 'a', name: 'Anna', portalMembershipId: 'm1' });
    prismaMock.organizationPerson.findMany.mockResolvedValue([person]);
    prismaMock.clientPortalWorkspaceMembership.findMany.mockResolvedValue([
      { id: 'm1', status: 'ACTIVE', clientPortalIdentityId: 'id-1', workspaceId: 'ws1' },
    ]);
    prismaMock.clientPortalGrant.findMany.mockResolvedValue([
      { id: 'gr1', clientPortalIdentityId: 'id-1', caseId: 'case-1' },
      { id: 'gr2', clientPortalIdentityId: 'id-1', caseId: 'case-2' },
      { id: 'gr3', clientPortalIdentityId: 'id-1', caseId: 'case-3' },
    ]);
    prismaMock.clientPortalSummaryScope.findMany.mockResolvedValue([
      { id: 'sc1', workspaceMembershipId: 'm1', scopeType: 'ORGANIZATION' },
    ]);

    const dto = await getOrganizationMap(ADMIN, 'client-1');
    expect(dto.persons[0].accessSummary.casesShared).toBe(3);
    expect(dto.persons[0].accessSummary.organizationSummaries).toBe(1);
    expect(dto.persons[0].accessSummary.companySummaryVisible).toBe(true);
  });

  it('cross-client principals are excluded (scoped to the client)', async () => {
    const person = personRow({ id: 'a', name: 'Anna', portalMembershipId: 'm1' });
    prismaMock.organizationPerson.findMany.mockResolvedValue([person]);
    prismaMock.clientPortalWorkspaceMembership.findMany.mockResolvedValue([
      { id: 'm1', status: 'ACTIVE', clientPortalIdentityId: 'id-1', workspaceId: 'ws1' },
    ]);
    // Even if a grant exists, the projection queries grants for this client only.
    prismaMock.clientPortalGrant.findMany.mockResolvedValue([
      { id: 'gr-other', clientPortalIdentityId: 'id-1', caseId: 'case-x' },
    ]);
    prismaMock.clientPortalSummaryScope.findMany.mockResolvedValue([]);

    // The service scopes grant lookups by clientId, so a caller-supplied foreign
    // grant must not leak through. We verify the query filter includes clientId.
    const dto = await getOrganizationMap(ADMIN, 'client-1');
    const grantFilter = prismaMock.clientPortalGrant.findMany.mock.calls[0][0].where;
    expect(grantFilter.clientId).toBe('client-1');
    expect(dto.persons[0].accessSummary.casesShared).toBe(1);
  });

  it('marks portal status SUSPENDED / NONE correctly', async () => {
    const active = personRow({ id: 'a', name: 'Anna', portalMembershipId: 'm1' });
    const suspended = personRow({ id: 'b', name: 'Béla', portalMembershipId: 'm2' });
    const none = personRow({ id: 'c', name: 'Cecil', portalMembershipId: null });
    prismaMock.organizationPerson.findMany.mockResolvedValue([active, suspended, none]);
    prismaMock.clientPortalWorkspaceMembership.findMany.mockResolvedValue([
      { id: 'm1', status: 'ACTIVE', clientPortalIdentityId: 'id-1', workspaceId: 'ws1' },
      { id: 'm2', status: 'SUSPENDED', clientPortalIdentityId: 'id-2', workspaceId: 'ws1' },
    ]);

    const dto = await getOrganizationMap(ADMIN, 'client-1');
    const byId = new Map(dto.persons.map((p: any) => [p.id, p]));
    expect(byId.get('a').portalStatus).toBe('ACTIVE');
    expect(byId.get('b').portalStatus).toBe('SUSPENDED');
    expect(byId.get('c').portalStatus).toBe('NONE');
  });

  it('an INDIVIDUAL-only client is not organizational', async () => {
    prismaMock.clientPortalWorkspace.findMany.mockResolvedValue([{ id: 'ws1', mode: 'INDIVIDUAL' }]);
    prismaMock.organizationPerson.findMany.mockResolvedValue([personRow({ id: 'a', name: 'Anna' })]);
    const dto = await getOrganizationMap(ADMIN, 'client-1');
    expect(dto.isOrganizational).toBe(false);
    expect(dto.workspaceModes).toEqual(['INDIVIDUAL']);
  });
});