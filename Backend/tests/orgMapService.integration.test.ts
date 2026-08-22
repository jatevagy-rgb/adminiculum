/**
 * ORG MAP (Szervezet) — real PostgreSQL cross-client isolation + INDIVIDUAL gate
 * regression.
 *
 * Uses a disposable shared integration database (guarded by the standard
 * `databaseUrl ? describe : describe.skip` convention). Deliberately creates a
 * malformed Client A org person whose manager/deputy/group/portal-membership
 * references point into Client B, then runs the real organization-map projection
 * for Client A and asserts NONE of Client B's data leaks.
 *
 * HARD INVARIANT — ORGANIZATION GRAPH != AUTHORIZATION GRAPH.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { getOrganizationMap } from '../src/modules/company-workspace/orgMapService';

const databaseUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL || process.env.CLIENT_IDENTITY_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('Org map (Szervezet) PostgreSQL cross-client isolation', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();
  const workspaceA = crypto.randomUUID();
  const workspaceB = crypto.randomUUID();
  const groupA = crypto.randomUUID();
  const groupB = crypto.randomUUID();
  const personA = crypto.randomUUID();
  const personB = crypto.randomUUID();
  const membershipA = crypto.randomUUID();
  const membershipB = crypto.randomUUID();
  const identityB = crypto.randomUUID();
  const caseB = crypto.randomUUID();

  const admin = { userId: adminId, role: 'ADMIN' };

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.create({ data: { id: adminId, email: `orgmap-admin-${suffix}@test.invalid`, name: 'Org Map Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] } as never });
    await db.client.createMany({ data: [
      { id: clientA, name: `OrgMap Client A ${suffix}` },
      { id: clientB, name: `OrgMap Client B ${suffix}` },
    ] });
    // Workspaces: A belongs to clientA, B belongs to clientB.
    await db.clientPortalWorkspace.createMany({ data: [
      { id: workspaceA, clientId: clientA, name: 'A szervezeti', mode: 'ORGANIZATION', publicReference: `org-a-${suffix}`, createdById: adminId },
      { id: workspaceB, clientId: clientB, name: 'B szervezeti', mode: 'ORGANIZATION', publicReference: `org-b-${suffix}`, createdById: adminId },
    ] } as never);
    // Groups: groupA -> clientA, groupB -> clientB.
    await db.clientOrganizationGroup.createMany({ data: [
      { id: groupA, clientId: clientA, name: 'A Vezetőség', createdById: adminId },
      { id: groupB, clientId: clientB, name: 'B Vezetőség', createdById: adminId },
    ] } as never);
    // A portal identity in client B's workspace.
    await db.clientPortalIdentity.create({ data: { id: identityB, provider: 'ENTRA_EXTERNAL_ID', issuer: 'iss', subject: `sub-b-${suffix}`, normalizedEmail: `b-${suffix}@test.invalid`, emailVerifiedAt: new Date(), displayName: 'B Személy', accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' } } as never);
    // Memberships: membershipA -> workspaceA (clientA), membershipB -> workspaceB (clientB).
    await db.clientPortalWorkspaceMembership.createMany({ data: [
      { id: membershipA, clientPortalIdentityId: identityB, workspaceId: workspaceA, status: 'ACTIVE', approvedAt: new Date(), approvedById: adminId },
      { id: membershipB, clientPortalIdentityId: identityB, workspaceId: workspaceB, status: 'ACTIVE', approvedAt: new Date(), approvedById: adminId },
    ] } as never);
    // Person B (client B) is referenced by Person A's manager/deputy FK. Must be
    // created before Person A so the real FK is satisfiable.
    await db.organizationPerson.create({
      data: { id: personB, clientId: clientB, name: `B Személy ${suffix}`, jobTitle: 'B vezető', employmentStatus: 'ACTIVE' } as never,
    });
    // Person A (client A) is MALFORMED: its manager/deputy/group/membership all
    // reference Client B rows to prove no cross-client leak.
    await db.organizationPerson.create({
      data: {
        id: personA,
        clientId: clientA,
        organizationGroupId: groupB,          // points into client B
        managerPersonId: personB,             // points into client B (person B)
        deputyPersonId: personB,
        portalMembershipId: membershipB,      // points into client B workspace
        name: `A Személy ${suffix}`,
        jobTitle: 'A vezető',
        employmentStatus: 'ACTIVE',
      } as never,
    });
    // A case + grant in client B that the malformed membership/identity would otherwise expose.
    await db.case.create({ data: { id: caseB, caseNumber: `ORG-B-${suffix}`, title: 'B ügy', caseType: 'CONTRACT_REVIEW', clientId: clientB, createdById: adminId } as never });
    await db.clientPortalGrant.create({ data: { clientPortalIdentityId: identityB, workspaceId: workspaceB, clientId: clientB, caseId: caseB, status: 'ACTIVE', participantRole: 'PARTICIPANT', isRequester: false, permissions: ['MATTER_READ'] as never, invitedById: adminId, activatedAt: new Date() } as never });
    // A Client B ORGANIZATION summary scope tied to the (client B) membership.
    await db.clientPortalSummaryScope.create({ data: { workspaceMembershipId: membershipB, workspaceId: workspaceB, scopeType: 'ORGANIZATION', approvedById: adminId } } as never);
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it('cross-client manager/deputy/group names are unresolved and no Client B state leaks', async () => {
    const dto = await getOrganizationMap(admin, clientA);

    // Client A is organizational (has its own ACTIVE ORGANIZATION workspace A).
    expect(dto.isOrganizational).toBe(true);

    // Person A is present, but its manager/deputy/group names must be NULL because
    // the referenced rows belong to Client B (not in Client A's scoped maps).
    const a = dto.persons.find((p: any) => p.id === personA);
    expect(a).toBeTruthy();
    expect(a.managerName).toBeNull();
    expect(a.deputyName).toBeNull();
    expect(a.organizationGroupName).toBeNull();

    // Client B's group must never appear in Client A's group list.
    expect(dto.groups.some((g: any) => g.id === groupB)).toBe(false);
    expect(dto.groups.some((g: any) => g.name === 'B Vezetőség')).toBe(false);

    // Client B's person must never appear in Client A's person list.
    expect(dto.persons.some((p: any) => p.id === personB)).toBe(false);

    // The malformed portalMembershipId -> client B workspace must be ignored:
    // portalStatus NONE, no Client B summary visibility, no Client B case count.
    expect(a.portalStatus).toBe('NONE');
    expect(a.accessSummary.companySummaryVisible).toBe(false);
    expect(a.accessSummary.organizationSummaries).toBe(0);
    expect(a.accessSummary.casesShared).toBe(0);
  });

  it('Client B summary/grant data never leaks into Client A aggregation', async () => {
    const dto = await getOrganizationMap(admin, clientA);
    const a = dto.persons.find((p: any) => p.id === personA);
    // Even though identityB has an ACTIVE grant + ORGANIZATION summary scope in
    // Client B, Client A's projection must show none of it.
    expect(a.accessSummary.casesShared).toBe(0);
    expect(a.accessSummary.organizationSummaries).toBe(0);
    expect(a.accessSummary.unitSummaries).toBe(0);
  });
});

d('Org map (Szervezet) PostgreSQL INDIVIDUAL gate', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const clientIndiv = crypto.randomUUID();
  const workspaceIndiv = crypto.randomUUID();
  const groupIndiv = crypto.randomUUID();
  const personIndiv = crypto.randomUUID();
  const admin = { userId: adminId, role: 'ADMIN' };

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.create({ data: { id: adminId, email: `orgmap-indiv-admin-${suffix}@test.invalid`, name: 'Org Map Indiv Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] } as never });
    await db.client.create({ data: { id: clientIndiv, name: `OrgMap Individual ${suffix}` } });
    await db.clientPortalWorkspace.create({ data: { id: workspaceIndiv, clientId: clientIndiv, name: 'Személyes', mode: 'INDIVIDUAL', publicReference: `ind-${suffix}`, createdById: adminId } } as never);
    // Organization rows exist in the DB for this INDIVIDUAL client.
    await db.clientOrganizationGroup.create({ data: { id: groupIndiv, clientId: clientIndiv, name: 'Nem kellene', createdById: adminId } } as never);
    await db.organizationPerson.create({ data: { id: personIndiv, clientId: clientIndiv, name: `Individual Person ${suffix}`, employmentStatus: 'ACTIVE' } as never });
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it('backend fail-closed: INDIVIDUAL client returns no org rows even if they exist', async () => {
    const dto = await getOrganizationMap(admin, clientIndiv);
    expect(dto.isOrganizational).toBe(false);
    expect(dto.groups).toEqual([]);
    expect(dto.persons).toEqual([]);
    expect(dto.organizationWorkspaceId).toBeNull();
  });
});

// Workspace-context resolution: organizationWorkspaceId is the safe EXPLICIT
// context for future A2/PR21 integration. Strictly ORGANIZATION mode only,
// ACTIVE, and only when EXACTLY ONE eligible workspace exists; null otherwise.

// Workspace-context resolution: organizationWorkspaceId is the safe EXPLICIT
// context for future A2/PR21 integration. Strictly ORGANIZATION mode only,
// ACTIVE, and only when EXACTLY ONE eligible workspace exists; null otherwise.
d('Org map (Szervezet) PostgreSQL organizationWorkspaceId resolution', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const admin = { userId: adminId, role: 'ADMIN' };

  async function newClient(prisma: PrismaClient, name: string): Promise<string> {
    const id = crypto.randomUUID();
    await prisma.client.create({ data: { id, name: `${name} ${suffix}` } });
    return id;
  }
  async function ws(prisma: PrismaClient, clientId: string, mode: string, status = 'ACTIVE'): Promise<string> {
    const id = crypto.randomUUID();
    await prisma.clientPortalWorkspace.create({ data: { id, clientId, name: `${mode} ${suffix}`, mode: mode as never, status: status as never, publicReference: `${mode.toLowerCase()}-${id.slice(0, 6)}-${suffix}`, createdById: adminId } } as never);
    return id;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.create({ data: { id: adminId, email: `orgmap-ws-admin-${suffix}@test.invalid`, name: 'Org Map WS Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] } } as never);
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it('exactly one ACTIVE ORGANIZATION workspace -> exact ID', async () => {
    const c = await newClient(db, 'Single Org');
    const org = await ws(db, c, 'ORGANIZATION');
    const dto = await getOrganizationMap(admin, c);
    expect(dto.organizationWorkspaceId).toBe(org);
  });

  it('zero ORGANIZATION workspaces -> null and not organizational', async () => {
    const c = await newClient(db, 'No Org');
    await ws(db, c, 'INDIVIDUAL');
    const dto = await getOrganizationMap(admin, c);
    expect(dto.organizationWorkspaceId).toBeNull();
    expect(dto.isOrganizational).toBe(false);
  });

  it('two ACTIVE ORGANIZATION workspaces -> null (ambiguity explicit)', async () => {
    const c = await newClient(db, 'Two Org');
    await ws(db, c, 'ORGANIZATION');
    await ws(db, c, 'ORGANIZATION');
    const dto = await getOrganizationMap(admin, c);
    expect(dto.organizationWorkspaceId).toBeNull();
  });

  it('one ORGANIZATION + one CASE_RELAY -> ORGANIZATION id (CASE_RELAY excluded)', async () => {
    const c = await newClient(db, 'Org + Relay');
    const org = await ws(db, c, 'ORGANIZATION');
    await ws(db, c, 'CASE_RELAY');
    const dto = await getOrganizationMap(admin, c);
    expect(dto.organizationWorkspaceId).toBe(org);
  });

  it('CASE_RELAY only -> null (but still organizational for the map)', async () => {
    const c = await newClient(db, 'Relay Only');
    await ws(db, c, 'CASE_RELAY');
    const dto = await getOrganizationMap(admin, c);
    expect(dto.organizationWorkspaceId).toBeNull();
    expect(dto.isOrganizational).toBe(true); // existing semantics unchanged
  });

  it('ORGANIZATION + INDIVIDUAL -> ORGANIZATION id', async () => {
    const c = await newClient(db, 'Org + Indiv');
    const org = await ws(db, c, 'ORGANIZATION');
    await ws(db, c, 'INDIVIDUAL');
    const dto = await getOrganizationMap(admin, c);
    expect(dto.organizationWorkspaceId).toBe(org);
  });

  it('inactive ORGANIZATION + one active ORGANIZATION -> active exact ID only', async () => {
    const c = await newClient(db, 'Mixed Active');
    await ws(db, c, 'ORGANIZATION', 'ARCHIVED');
    const active = await ws(db, c, 'ORGANIZATION');
    const dto = await getOrganizationMap(admin, c);
    expect(dto.organizationWorkspaceId).toBe(active);
  });

  it('cross-client workspace never enters resolution', async () => {
    // Client A has its own ORG; Client B has an ORG too. A's id must be the
    // ORG belonging to A only, never B's.
    const a = await newClient(db, 'A');
    const aOrg = await ws(db, a, 'ORGANIZATION');
    const b = await newClient(db, 'B');
    await ws(db, b, 'ORGANIZATION');
    const dtoA = await getOrganizationMap(admin, a);
    expect(dtoA.organizationWorkspaceId).toBe(aOrg);
  });
});
