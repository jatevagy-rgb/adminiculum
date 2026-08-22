/**
 * PERSON ACCESS — read-only backend projection PostgreSQL integration.
 *
 * Real-DB authorization-boundary regression. Verifies the projection resolves
 * case grants / summary scopes / document publications ONLY from canonical
 * principals scoped to one explicit client+workspace, and that the org
 * hierarchy never grants access.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { getPersonAccess } from '../src/modules/client-workspace/personAccessService';

const databaseUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL || process.env.CLIENT_IDENTITY_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('Person access (read-only projection) PostgreSQL', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const clientA = crypto.randomUUID();
  const workspaceA = crypto.randomUUID();
  const groupA = crypto.randomUUID();
  const personA = crypto.randomUUID();
  const membershipA = crypto.randomUUID();
  const identityA = crypto.randomUUID();
  const caseA = crypto.randomUUID();
  const caseB = crypto.randomUUID();
  const docA = crypto.randomUUID();
  const docB = crypto.randomUUID();
  const docVersionA = crypto.randomUUID();
  const docVersionB = crypto.randomUUID();
  const pubA = crypto.randomUUID();
  const pubSelected = crypto.randomUUID();

  const admin = { userId: adminId, role: 'ADMIN' };

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.create({ data: { id: adminId, email: `pa-admin-${suffix}@test.invalid`, name: 'Person Access Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] } as never });
    await db.client.create({ data: { id: clientA, name: `PersonAccess Client ${suffix}` } });
    await db.clientPortalWorkspace.create({ data: { id: workspaceA, clientId: clientA, name: 'Szervezeti', mode: 'ORGANIZATION', publicReference: `pa-ws-${suffix}`, createdById: adminId } } as never);
    await db.clientOrganizationGroup.create({ data: { id: groupA, clientId: clientA, name: 'Vezetés', createdById: adminId } } as never);
    await db.clientPortalIdentity.create({ data: { id: identityA, provider: 'ENTRA_EXTERNAL_ID', issuer: 'iss', subject: `pa-sub-${suffix}`, normalizedEmail: `pa-${suffix}@test.invalid`, emailVerifiedAt: new Date(), displayName: 'Anna', accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' } } as never);
    await db.clientPortalWorkspaceMembership.create({ data: { id: membershipA, clientPortalIdentityId: identityA, workspaceId: workspaceA, status: 'ACTIVE', approvedAt: new Date(), approvedById: adminId } } as never);
    await db.organizationPerson.create({ data: { id: personA, clientId: clientA, organizationGroupId: groupA, portalMembershipId: membershipA, name: `Anna ${suffix}`, jobTitle: 'Ügyvezető', employmentStatus: 'ACTIVE' } } as never);
    // Two cases: one shared (grant), one not.
    await db.case.createMany({ data: [
      { id: caseA, caseNumber: `PA-A-${suffix}`, title: 'Megosztott ügy', caseType: 'CONTRACT_REVIEW', clientId: clientA, createdById: adminId },
      { id: caseB, caseNumber: `PA-B-${suffix}`, title: 'Nem megosztott ügy', caseType: 'CONTRACT_REVIEW', clientId: clientA, createdById: adminId },
    ] } as never);
    await db.clientPortalGrant.create({ data: { clientPortalIdentityId: identityA, workspaceId: workspaceA, clientId: clientA, caseId: caseA, status: 'ACTIVE', participantRole: 'PARTICIPANT', isRequester: false, permissions: ['MATTER_READ', 'DOCUMENT_READ'] as never, invitedById: adminId, activatedAt: new Date() } } as never);
    // A summary scope (ORGANIZATION aggregate) for the membership.
    await db.clientPortalSummaryScope.create({ data: { workspaceMembershipId: membershipA, workspaceId: workspaceA, scopeType: 'ORGANIZATION', approvedById: adminId } } as never);
    // Documents: one WORKSPACE publication on caseA, one SELECTED_PARTICIPANTS on caseA (recipient), one on caseB (no grant).
    await db.document.createMany({ data: [
      { id: docA, name: 'Szerződés tervezet', category: 'CONTRACT', caseId: caseA, clientId: clientA },
      { id: docB, name: 'Szerződés (kiválasztott)', category: 'CONTRACT', caseId: caseA, clientId: clientA },
    ] } as never);
    await db.documentVersion.createMany({ data: [
      { id: docVersionA, version: 1, name: 'Szerződés tervezet v1', documentId: docA, isCurrent: true, uploadedById: adminId },
      { id: docVersionB, version: 1, name: 'Szerződés (kiválasztott) v1', documentId: docB, isCurrent: true, uploadedById: adminId },
    ] } as never);
    await db.clientDocumentPublication.createMany({ data: [
      {
        id: pubA, caseId: caseA, clientId: clientA, workspaceId: workspaceA, visibility: 'WORKSPACE', documentId: docA, documentVersionId: docVersionA, status: 'PUBLISHED',
        clientFacingTitle: 'Szerződés tervezet', preparedById: adminId, publishedById: adminId, publishedAt: new Date(), audienceSnapshot: {}, sourceFingerprint: `fp-${suffix}-a`,
      },
      {
        id: pubSelected, caseId: caseA, clientId: clientA, workspaceId: workspaceA, visibility: 'SELECTED_PARTICIPANTS', documentId: docB, documentVersionId: docVersionB, status: 'PUBLISHED',
        clientFacingTitle: 'Szerződés (kiválasztott)', preparedById: adminId, publishedById: adminId, publishedAt: new Date(), audienceSnapshot: {}, sourceFingerprint: `fp-${suffix}-sel`,
      },
    ] } as never);
    await db.clientDocumentPublicationRecipient.create({ data: { documentPublicationId: pubSelected, workspaceMembershipId: membershipA } } as never);
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it('resolves grants, summary scope and documents for an active membership', async () => {
    const dto = await getPersonAccess(admin, { clientId: clientA, workspaceId: workspaceA, personId: personA });
    expect(dto.person.portalStatus).toBe('ACTIVE');
    expect(dto.person.organizationGroupName).toBe('Vezetés');
    expect(dto.membership?.id).toBe(membershipA);
    // Only caseA is shared.
    expect(dto.caseAccess.map((c: any) => c.caseId)).toEqual([caseA]);
    expect(dto.caseAccess[0].effective).toBe(true);
    // Summary scope present (aggregate only).
    expect(dto.summaryScopes).toHaveLength(1);
    expect(dto.summaryScopes[0].scopeType).toBe('ORGANIZATION');
    // Documents: WORKSPACE + SELECTED_PARTICIPANTS (recipient) both visible.
    const pubIds = dto.documentAccess.map((doc: any) => doc.publicationId);
    expect(pubIds).toContain(pubA);
    expect(pubIds).toContain(pubSelected);
    expect(dto.documentAccess.find((doc: any) => doc.publicationId === pubSelected)?.accessibleVia).toBe('SELECTED_PARTICIPANT');
    expect(dto.documentAccess.find((doc: any) => doc.publicationId === pubA)?.accessibleVia).toBe('WORKSPACE');
  });

  it('caseB (no grant) never appears as access', async () => {
    const dto = await getPersonAccess(admin, { clientId: clientA, workspaceId: workspaceA, personId: personA });
    expect(dto.caseAccess.some((c: any) => c.caseId === caseB)).toBe(false);
  });

  it('a person with manager/group but no membership yields NONE and no access', async () => {
    // Create a second person linked to the group but with no portal membership.
    const personNoMember = crypto.randomUUID();
    await db.organizationPerson.create({ data: { id: personNoMember, clientId: clientA, organizationGroupId: groupA, name: `Vezetői képviselő ${suffix}`, jobTitle: 'Igazgató', employmentStatus: 'ACTIVE' } } as never);
    const dto = await getPersonAccess(admin, { clientId: clientA, workspaceId: workspaceA, personId: personNoMember });
    expect(dto.person.portalStatus).toBe('NONE');
    expect(dto.membership).toBeNull();
    expect(dto.caseAccess).toEqual([]);
    expect(dto.summaryScopes).toEqual([]);
    expect(dto.documentAccess).toEqual([]);
  });
});