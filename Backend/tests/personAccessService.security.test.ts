/**
 * PERSON ACCESS — read-only backend projection mock unit tests.
 *
 * Security-focused: verifies the HARD INVARIANT that the org hierarchy never
 * grants access, that workspace context is never guessed, and that cross-client
 * references fail closed. Exercises the real service against a mocked Prisma
 * client.
 */
const prismaMock: any = {
  client: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  case: { findFirst: jest.fn(), findMany: jest.fn() },
  organizationPerson: { findUnique: jest.fn() },
  clientPortalWorkspace: { findUnique: jest.fn(), findMany: jest.fn() },
  clientPortalWorkspaceMembership: { findUnique: jest.fn() },
  clientPortalGrant: { findMany: jest.fn() },
  clientPortalSummaryScope: { findMany: jest.fn() },
  clientOrganizationGroup: { findMany: jest.fn() },
  clientDocumentPublication: { findMany: jest.fn() },
  document: { findMany: jest.fn() },
};

jest.mock('../src/prisma/prisma.service', () => ({ prisma: prismaMock }));

import { getPersonAccess, PersonAccessProjection } from '../src/modules/client-workspace/personAccessService';
import { InteractionError } from '../src/modules/client-interaction/base';

const ADMIN = { userId: 'user-admin', role: 'ADMIN' };

const INPUT = { clientId: 'client-1', workspaceId: 'ws1', personId: 'person-1' };

function rejectsWithCode(promise: Promise<unknown>, code: string): Promise<void> {
  return promise.then(
    () => { throw new Error(`expected rejection with code ${code}`); },
    (err) => {
      if (!(err instanceof InteractionError)) throw err;
      if (err.code !== code) throw new Error(`expected code ${code}, got ${err.code}`);
    },
  );
}

function personRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'person-1',
    clientId: 'client-1',
    name: 'Anna',
    jobTitle: 'Ügyvezető',
    organizationGroupId: 'g1',
    organizationGroup: { id: 'g1', name: 'Vezetés' },
    portalMembershipId: 'm1',
    employmentStatus: 'ACTIVE',
    ...overrides,
  };
}

function workspaceRow(overrides: Record<string, unknown> = {}) {
  return { id: 'ws1', clientId: 'client-1', name: 'A szervezeti', mode: 'ORGANIZATION', status: 'ACTIVE', ...overrides };
}

function membershipRow(overrides: Record<string, unknown> = {}) {
  return { id: 'm1', status: 'ACTIVE', expiresAt: null, workspaceId: 'ws1', clientPortalIdentityId: 'id-1', ...overrides };
}

function grantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'gr1',
    clientId: 'client-1',
    caseId: 'case-1',
    workspaceId: 'ws1',
    clientPortalIdentityId: 'id-1',
    participantRole: 'PARTICIPANT',
    permissions: ['MATTER_READ'],
    status: 'ACTIVE',
    validFrom: new Date('2020-01-01T00:00:00Z'),
    validUntil: null,
    revision: 1,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.client.findUnique.mockResolvedValue({ id: 'client-1', name: 'Acme' });
  prismaMock.user.findUnique.mockResolvedValue({ id: ADMIN.userId, role: 'ADMIN', status: 'ACTIVE', isActive: true });
  prismaMock.organizationPerson.findUnique.mockResolvedValue(personRow());
  prismaMock.clientPortalWorkspace.findUnique.mockResolvedValue(workspaceRow());
  prismaMock.clientPortalWorkspaceMembership.findUnique.mockResolvedValue(membershipRow());
  prismaMock.clientPortalGrant.findMany.mockResolvedValue([]);
  prismaMock.case.findMany.mockResolvedValue([]);
  prismaMock.clientPortalSummaryScope.findMany.mockResolvedValue([]);
  prismaMock.clientOrganizationGroup.findMany.mockResolvedValue([]);
  prismaMock.clientDocumentPublication.findMany.mockResolvedValue([]);
  prismaMock.document.findMany.mockResolvedValue([]);
});

describe('personAccessService — read-only projection security', () => {
  it('fails closed on a person from another client (generic not-found, no existence oracle)', async () => {
    prismaMock.organizationPerson.findUnique.mockResolvedValue(personRow({ clientId: 'client-2' }));
    // Must be indistinguishable from a non-existent person (same 404 + code), so
    // a caller cannot learn that the personId exists in another client.
    await rejectsWithCode(getPersonAccess(ADMIN, INPUT), 'PERSON_NOT_FOUND');
  });

  it('fails closed on a workspace from another client', async () => {
    prismaMock.clientPortalWorkspace.findUnique.mockResolvedValue(workspaceRow({ clientId: 'client-2' }));
    await rejectsWithCode(getPersonAccess(ADMIN, INPUT), 'CROSS_CLIENT_WORKSPACE');
  });

  it('fails closed on an INDIVIDUAL workspace', async () => {
    prismaMock.clientPortalWorkspace.findUnique.mockResolvedValue(workspaceRow({ mode: 'INDIVIDUAL' }));
    await rejectsWithCode(getPersonAccess(ADMIN, INPUT), 'WORKSPACE_NOT_ORGANIZATION');
  });

  it('ignores a portal membership in another workspace (fail-closed, no guessing)', async () => {
    // Membership points to a different workspace; must be ignored.
    prismaMock.clientPortalWorkspaceMembership.findUnique.mockResolvedValue(membershipRow({ workspaceId: 'ws-other' }));
    const dto = await getPersonAccess(ADMIN, INPUT);
    expect(dto.person.portalStatus).toBe('NONE');
    expect(dto.membership).toBeNull();
    expect(dto.caseAccess).toEqual([]);
    expect(dto.summaryScopes).toEqual([]);
    expect(dto.documentAccess).toEqual([]);
  });

  it('no membership -> portalStatus NONE and no effective access', async () => {
    prismaMock.organizationPerson.findUnique.mockResolvedValue(personRow({ portalMembershipId: null }));
    const dto = await getPersonAccess(ADMIN, INPUT);
    expect(dto.person.portalStatus).toBe('NONE');
    expect(dto.membership).toBeNull();
    expect(dto.caseAccess).toEqual([]);
  });

  it('suspended membership -> portalStatus SUSPENDED and NO access lists (empty, not a badge)', async () => {
    prismaMock.clientPortalWorkspaceMembership.findUnique.mockResolvedValue(membershipRow({ status: 'SUSPENDED' }));
    // ACTIVE grant + scope exist, but membership is suspended => lists must be EMPTY.
    prismaMock.clientPortalGrant.findMany.mockResolvedValue([grantRow()]);
    prismaMock.clientPortalSummaryScope.findMany.mockResolvedValue([
      { id: 'sc1', scopeType: 'ORGANIZATION', organizationGroupId: null, status: 'ACTIVE', canViewCaseCounts: true, canViewStageCounts: true, canViewDeadlineCounts: true, canViewPublishedHours: false },
    ]);
    const dto = await getPersonAccess(ADMIN, INPUT);
    expect(dto.person.portalStatus).toBe('SUSPENDED');
    expect(dto.membership?.status).toBe('SUSPENDED');
    // CHECK 4: inactive membership -> grant/scope/document lists become empty.
    expect(dto.caseAccess).toEqual([]);
    expect(dto.summaryScopes).toEqual([]);
    expect(dto.documentAccess).toEqual([]);
  });

  it('an ACTIVE grant appears as effective case access', async () => {
    prismaMock.clientPortalGrant.findMany.mockResolvedValue([grantRow()]);
    prismaMock.case.findMany.mockResolvedValue([{ id: 'case-1', title: 'Szerződéses ügy' }]);
    const dto = await getPersonAccess(ADMIN, INPUT);
    expect(dto.caseAccess).toHaveLength(1);
    expect(dto.caseAccess[0].effective).toBe(true);
    expect(dto.caseAccess[0].caseTitle).toBe('Szerződéses ügy');
    expect(dto.caseAccess[0].permissions).toContain('MATTER_READ');
  });

  it('manager/group/responsibility WITHOUT a grant gives no case access', async () => {
    // Person has manager/group/jobTitle but no grant at all.
    prismaMock.organizationPerson.findUnique.mockResolvedValue(personRow({ jobTitle: 'Ügyvezető', organizationGroupId: 'g1' }));
    prismaMock.clientPortalGrant.findMany.mockResolvedValue([]);
    const dto = await getPersonAccess(ADMIN, INPUT);
    expect(dto.caseAccess).toEqual([]);
    expect(dto.documentAccess).toEqual([]);
  });

  it('summary scope appears as aggregate only and does NOT create case access', async () => {
    prismaMock.clientPortalSummaryScope.findMany.mockResolvedValue([
      { id: 'sc1', scopeType: 'ORGANIZATION', organizationGroupId: null, status: 'ACTIVE', canViewCaseCounts: true, canViewStageCounts: true, canViewDeadlineCounts: true, canViewPublishedHours: false },
    ]);
    prismaMock.clientPortalGrant.findMany.mockResolvedValue([]);
    const dto = await getPersonAccess(ADMIN, INPUT);
    expect(dto.summaryScopes).toHaveLength(1);
    expect(dto.summaryScopes[0].scopeType).toBe('ORGANIZATION');
    // Summary scope must NOT yield case access.
    expect(dto.caseAccess).toEqual([]);
  });

  it('does NOT combine multiple workspaces (only the requested one is used)', async () => {
    // The person has a membership in ws1 (requested) but grants reference another workspace.
    prismaMock.clientPortalGrant.findMany.mockResolvedValue([
      grantRow({ workspaceId: 'ws-other', caseId: 'case-other' }),
    ]);
    prismaMock.clientPortalSummaryScope.findMany.mockResolvedValue([
      { id: 'sc-other', scopeType: 'ORGANIZATION', organizationGroupId: null, status: 'ACTIVE', canViewCaseCounts: true, canViewStageCounts: true, canViewDeadlineCounts: true, canViewPublishedHours: false },
    ]);
    const dto = await getPersonAccess(ADMIN, INPUT);
    // The query scopes grants by requested workspaceId, so foreign-workspace grant is excluded.
    const grantWhere = prismaMock.clientPortalGrant.findMany.mock.calls[0][0].where;
    expect(grantWhere.workspaceId).toBe('ws1');
    expect(dto.caseAccess).toHaveLength(0);
  });

  it('cross-client group label cannot leak (scope groups scoped to client)', async () => {
    prismaMock.clientPortalSummaryScope.findMany.mockResolvedValue([
      { id: 'sc1', scopeType: 'UNIT', organizationGroupId: 'foreign-group', status: 'ACTIVE', canViewCaseCounts: true, canViewStageCounts: true, canViewDeadlineCounts: true, canViewPublishedHours: false },
    ]);
    // Only this client's groups are returned, so foreign-group is unresolved.
    prismaMock.clientOrganizationGroup.findMany.mockResolvedValue([{ id: 'g1', name: 'Vezetés' }]);
    const dto = await getPersonAccess(ADMIN, INPUT);
    expect(dto.summaryScopes[0].organizationGroupName).toBeNull();
    const groupWhere = prismaMock.clientOrganizationGroup.findMany.mock.calls[0][0].where;
    expect(groupWhere.clientId).toBe('client-1');
  });

  it('document projection requires an ACTIVE DOCUMENT_READ grant in the workspace', async () => {
    prismaMock.clientPortalGrant.findMany.mockResolvedValue([
      grantRow({ permissions: ['MATTER_READ'] }), // no DOCUMENT_READ
    ]);
    prismaMock.clientDocumentPublication.findMany.mockResolvedValue([
      { id: 'pub1', visibility: 'WORKSPACE', status: 'PUBLISHED', workspaceId: 'ws1', documentId: 'doc-1', recipients: [] },
    ]);
    const dto = await getPersonAccess(ADMIN, INPUT);
    expect(dto.documentAccess).toEqual([]); // no DOCUMENT_READ -> no document projection
  });

  it('document projection returns WORKSPACE publication with DOCUMENT_READ', async () => {
    prismaMock.clientPortalGrant.findMany.mockResolvedValue([
      grantRow({ permissions: ['DOCUMENT_READ', 'MATTER_READ'] }),
    ]);
    prismaMock.clientDocumentPublication.findMany.mockResolvedValue([
      { id: 'pub1', visibility: 'WORKSPACE', status: 'PUBLISHED', workspaceId: 'ws1', documentId: 'doc-1', recipients: [] },
    ]);
    prismaMock.document.findMany.mockResolvedValue([{ id: 'doc-1', name: 'Szerződés tervezet' }]);
    const dto = await getPersonAccess(ADMIN, INPUT);
    expect(dto.documentAccess).toHaveLength(1);
    expect(dto.documentAccess[0].accessibleVia).toBe('WORKSPACE');
    expect(dto.documentAccess[0].documentTitle).toBe('Szerződés tervezet');
  });

  it('SELECTED_PARTICIPANTS publication appears only when the membership is a recipient', async () => {
    prismaMock.clientPortalGrant.findMany.mockResolvedValue([grantRow({ permissions: ['DOCUMENT_READ'] })]);
    prismaMock.clientDocumentPublication.findMany.mockResolvedValue([
      { id: 'pub-selected', visibility: 'SELECTED_PARTICIPANTS', status: 'PUBLISHED', workspaceId: 'ws1', documentId: 'doc-2', recipients: [{ workspaceMembershipId: 'm1' }] },
    ]);
    prismaMock.document.findMany.mockResolvedValue([{ id: 'doc-2', name: 'Kiválasztott dok' }]);
    const dto = await getPersonAccess(ADMIN, INPUT);
    expect(dto.documentAccess).toHaveLength(1);
    expect(dto.documentAccess[0].accessibleVia).toBe('SELECTED_PARTICIPANT');
  });

  it('SELECTED_PARTICIPANTS publication is excluded when the membership is NOT a recipient', async () => {
    prismaMock.clientPortalGrant.findMany.mockResolvedValue([grantRow({ permissions: ['DOCUMENT_READ'] })]);
    prismaMock.clientDocumentPublication.findMany.mockResolvedValue([
      { id: 'pub-selected', visibility: 'SELECTED_PARTICIPANTS', status: 'PUBLISHED', workspaceId: 'ws1', documentId: 'doc-2', recipients: [{ workspaceMembershipId: 'other-membership' }] },
    ]);
    const dto = await getPersonAccess(ADMIN, INPUT);
    expect(dto.documentAccess).toEqual([]);
  });
});