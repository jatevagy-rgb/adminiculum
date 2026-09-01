import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { listOrganizationalCases } from '../src/modules/client-workspace/organizationalCaseService';
import {
  InternalCasePortalPublicationError,
  listCasePortalPublicationTargets,
  publishInternalCaseToPortal,
} from '../src/modules/client-publication/internalCasePortalPublication.service';

const databaseUrl = process.env.PORTAL_PUBLICATION_TEST_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('internal Case to explicit portal publication (PostgreSQL)', () => {
  let db: PrismaClient;
  const ids = {
    admin: crypto.randomUUID(),
    lawyer: crypto.randomUUID(),
    outsider: crypto.randomUUID(),
    client: crypto.randomUUID(),
    otherClient: crypto.randomUUID(),
    workspace: crypto.randomUUID(),
    otherWorkspace: crypto.randomUUID(),
    identity: crypto.randomUUID(),
    membership: crypto.randomUUID(),
    otherIdentity: crypto.randomUUID(),
    otherMembership: crypto.randomUUID(),
    privateCase: crypto.randomUUID(),
    publishedCase: crypto.randomUUID(),
  };
  const actor = { userId: ids.admin, role: 'ADMIN' };

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.CLIENT_PORTAL_READ_ENABLED = 'true';
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.createMany({ data: [
      { id: ids.admin, email: `publication-${ids.admin}@t.io`, name: 'Portal publisher', role: 'ADMIN', status: 'ACTIVE' },
      { id: ids.lawyer, email: `publication-${ids.lawyer}@t.io`, name: 'Case lawyer', role: 'LAWYER', status: 'ACTIVE' },
      { id: ids.outsider, email: `publication-${ids.outsider}@t.io`, name: 'Unrelated lawyer', role: 'LAWYER', status: 'ACTIVE' },
    ] as never });
    await db.client.createMany({ data: [
      { id: ids.client, name: `Publication client ${ids.client}` },
      { id: ids.otherClient, name: `Other publication client ${ids.otherClient}` },
    ] });
    await db.clientPortalWorkspace.createMany({ data: [
      { id: ids.workspace, clientId: ids.client, name: 'Demo Kft portal', mode: 'ORGANIZATION', publicReference: `publication-${ids.workspace}`, createdById: ids.admin },
      { id: ids.otherWorkspace, clientId: ids.otherClient, name: 'Other portal', mode: 'ORGANIZATION', publicReference: `publication-${ids.otherWorkspace}`, createdById: ids.admin },
    ] });
    await db.clientPortalIdentity.createMany({ data: [
      { id: ids.identity, provider: 'ENTRA_EXTERNAL_ID', issuer: 'publication-test', subject: `member-${ids.identity}`, normalizedEmail: `member-${ids.identity}@t.io`, emailVerifiedAt: new Date(), displayName: 'Kovács Éva', accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' },
      { id: ids.otherIdentity, provider: 'ENTRA_EXTERNAL_ID', issuer: 'publication-test', subject: `other-${ids.otherIdentity}`, normalizedEmail: `other-${ids.otherIdentity}@t.io`, emailVerifiedAt: new Date(), displayName: 'Másik Éva', accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' },
    ] });
    await db.clientPortalWorkspaceMembership.createMany({ data: [
      { id: ids.membership, clientPortalIdentityId: ids.identity, workspaceId: ids.workspace, status: 'ACTIVE', approvedAt: new Date(), approvedById: ids.admin },
      { id: ids.otherMembership, clientPortalIdentityId: ids.otherIdentity, workspaceId: ids.otherWorkspace, status: 'ACTIVE', approvedAt: new Date(), approvedById: ids.admin },
    ] });
    await db.case.createMany({ data: [
      { id: ids.privateCase, caseNumber: `PRIVATE-${ids.privateCase.slice(0, 8)}`, title: 'Strictly internal private case', caseType: 'CONTRACT_REVIEW', clientId: ids.client, createdById: ids.admin, assignedLawyerId: ids.lawyer },
      { id: ids.publishedCase, caseNumber: `PUBLISH-${ids.publishedCase.slice(0, 8)}`, title: 'Strictly internal publication source', caseType: 'CONTRACT_REVIEW', clientId: ids.client, createdById: ids.admin, assignedLawyerId: ids.admin },
    ] } as never);
  });

  afterAll(async () => {
    await db.clientPublicationEvent.deleteMany({ where: { caseId: { in: [ids.privateCase, ids.publishedCase] } } });
    const publications = await db.clientMatterPublication.findMany({ where: { caseId: { in: [ids.privateCase, ids.publishedCase] } }, select: { id: true } });
    await db.clientMatterPublicationRevision.deleteMany({ where: { publicationId: { in: publications.map((publication) => publication.id) } } });
    await db.clientMatterPublication.deleteMany({ where: { id: { in: publications.map((publication) => publication.id) } } });
    await db.clientPortalGrant.deleteMany({ where: { caseId: { in: [ids.privateCase, ids.publishedCase] } } });
    await db.case.deleteMany({ where: { id: { in: [ids.privateCase, ids.publishedCase] } } });
    await db.clientPortalWorkspaceMembership.deleteMany({ where: { id: { in: [ids.membership, ids.otherMembership] } } });
    await db.clientPortalIdentity.deleteMany({ where: { id: { in: [ids.identity, ids.otherIdentity] } } });
    await db.clientPortalWorkspace.deleteMany({ where: { id: { in: [ids.workspace, ids.otherWorkspace] } } });
    await db.client.deleteMany({ where: { id: { in: [ids.client, ids.otherClient] } } });
    await db.user.deleteMany({ where: { id: { in: [ids.admin, ids.lawyer, ids.outsider] } } });
    await db.$disconnect();
  });

  it('keeps an internal Case private until an ADMIN explicitly targets an active organization membership', async () => {
    expect((await listOrganizationalCases(ids.identity, ids.workspace, {}, db)).total).toBe(0);
    const targets = await listCasePortalPublicationTargets(actor, ids.publishedCase, db);
    expect(targets.items).toEqual([{ workspaceId: ids.workspace, workspaceMembershipId: ids.membership, workspaceName: 'Demo Kft portal', memberName: 'Kovács Éva', memberRole: 'MEMBER' }]);

    const first = await publishInternalCaseToPortal(actor, ids.publishedCase, {
      workspaceId: ids.workspace,
      workspaceMembershipId: ids.membership,
      clientSafeTitle: 'Szerződés felülvizsgálata',
      clientSafeStatus: 'Folyamatban',
      clientSafeCurrentPosition: 'Az iroda megkezdte az áttekintést.',
      clientSafeNextStep: 'A következő egyeztetés előkészítése.',
    }, db);
    const second = await publishInternalCaseToPortal(actor, ids.publishedCase, {
      workspaceId: ids.workspace,
      workspaceMembershipId: ids.membership,
      clientSafeTitle: 'Másik cím nem írhatja felül a közzétett pillanatképet',
      clientSafeStatus: 'Folyamatban',
    }, db);
    expect(second.publication.id).toBe(first.publication.id);

    const list = await listOrganizationalCases(ids.identity, ids.workspace, {}, db);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.publicTitle).toBe('Szerződés felülvizsgálata');
    const serialized = JSON.stringify(list);
    for (const forbidden of ['Strictly internal', 'clientId', 'workspaceId', 'membershipId', 'grantId', 'sharePoint', 'storageKey']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('denies CLIENT actors and cross-client workspace substitution without creating visibility', async () => {
    await expect(publishInternalCaseToPortal({ userId: ids.admin, role: 'CLIENT' }, ids.privateCase, {
      workspaceId: ids.workspace,
      workspaceMembershipId: ids.membership,
      clientSafeTitle: 'Nem közzétehető',
      clientSafeStatus: 'Folyamatban',
    }, db)).rejects.toMatchObject({ code: 'CASE_PORTAL_PUBLISH_FORBIDDEN' } satisfies Partial<InternalCasePortalPublicationError>);
    await expect(publishInternalCaseToPortal({ userId: ids.admin, role: 'EXTERNAL_REVIEWER' }, ids.privateCase, {
      workspaceId: ids.workspace,
      workspaceMembershipId: ids.membership,
      clientSafeTitle: 'Nem közzétehető',
      clientSafeStatus: 'Folyamatban',
    }, db)).rejects.toMatchObject({ code: 'CASE_PORTAL_PUBLISH_FORBIDDEN' } satisfies Partial<InternalCasePortalPublicationError>);

    await expect(publishInternalCaseToPortal(actor, ids.privateCase, {
      workspaceId: ids.otherWorkspace,
      workspaceMembershipId: ids.otherMembership,
      clientSafeTitle: 'Kereszt ügyfél',
      clientSafeStatus: 'Folyamatban',
    }, db)).rejects.toMatchObject({ code: 'CASE_CLIENT_MISMATCH' });
    await expect(publishInternalCaseToPortal({ userId: ids.outsider, role: 'LAWYER' }, ids.privateCase, {
      workspaceId: ids.workspace,
      workspaceMembershipId: ids.membership,
      clientSafeTitle: 'Nincs ügyhozzáférés',
      clientSafeStatus: 'Folyamatban',
    }, db)).rejects.toMatchObject({ code: 'CASE_ACCESS_FORBIDDEN' });
    await expect(publishInternalCaseToPortal({ userId: ids.lawyer, role: 'LAWYER' }, ids.privateCase, {
      workspaceId: ids.workspace,
      workspaceMembershipId: ids.membership,
      clientSafeTitle: 'Ügyfelelős által publikált ügy',
      clientSafeStatus: 'Folyamatban',
    }, db)).resolves.toMatchObject({ grant: { status: 'ACTIVE' } });
    expect((await listOrganizationalCases(ids.identity, ids.workspace, {}, db)).total).toBe(1);
  });
});
