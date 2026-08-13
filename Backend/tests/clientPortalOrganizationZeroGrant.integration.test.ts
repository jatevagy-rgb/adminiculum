import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  getPortalDocument,
  getPortalMatter,
  listPortalActionRequests,
  listPortalDocuments,
  listPortalMatters,
  listPortalSafeUpdates,
  portalHomeSnapshot,
} from '../src/modules/client-publication/publicationService';

const databaseUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL || process.env.CLIENT_IDENTITY_TEST_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('CP1 organization workspace zero-grant portal access (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  const orgWorkspaceId = crypto.randomUUID();
  const individualWorkspaceId = crypto.randomUUID();
  const orgMemberId = crypto.randomUUID();
  const orgMemberWithRevokedGrantId = crypto.randomUUID();
  const individualMemberId = crypto.randomUUID();
  const grantedCaseId = crypto.randomUUID();
  const ungrantedCaseId = crypto.randomUUID();
  const individualCaseId = crypto.randomUUID();
  let matterPublicationId = '';
  let documentPublicationId = '';
  let actionRequestId = '';
  let safeUpdateId = '';

  const orgMemberActor = { userId: orgMemberId, role: 'CLIENT_PORTAL', workspaceId: orgWorkspaceId };
  const orgMemberWithRevokedGrantActor = { userId: orgMemberWithRevokedGrantId, role: 'CLIENT_PORTAL', workspaceId: orgWorkspaceId };
  const individualMemberActor = { userId: individualMemberId, role: 'CLIENT_PORTAL', workspaceId: individualWorkspaceId };

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.CLIENT_PORTAL_READ_ENABLED = 'true';
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    await db.user.create({ data: { id: adminId, email: `admin-${suffix}@test.invalid`, name: 'Admin', role: 'ADMIN', status: 'ACTIVE' } as never });
    await db.client.create({ data: { id: clientId, name: `CP1 Zero-Grant Client ${suffix}` } });

    await db.clientPortalWorkspace.createMany({ data: [
      { id: orgWorkspaceId, clientId, name: 'Organization Zero-Grant', mode: 'ORGANIZATION', publicReference: `org-${suffix}`, createdById: adminId },
      { id: individualWorkspaceId, clientId, name: 'Individual Grant-Required', mode: 'INDIVIDUAL', publicReference: `ind-${suffix}`, createdById: adminId },
    ] as never });

    await db.clientPortalIdentity.createMany({ data: [
      { id: orgMemberId, provider: 'ENTRA_EXTERNAL_ID', issuer: `iss-${suffix}`, subject: 'org-member', normalizedEmail: `org-member-${suffix}@test.invalid`, emailVerifiedAt: new Date(), displayName: 'Org Member', accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' },
      { id: orgMemberWithRevokedGrantId, provider: 'ENTRA_EXTERNAL_ID', issuer: `iss-${suffix}`, subject: 'org-member-revoked', normalizedEmail: `org-member-revoked-${suffix}@test.invalid`, emailVerifiedAt: new Date(), displayName: 'Org Member Revoked', accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' },
      { id: individualMemberId, provider: 'ENTRA_EXTERNAL_ID', issuer: `iss-${suffix}`, subject: 'individual-member', normalizedEmail: `individual-member-${suffix}@test.invalid`, emailVerifiedAt: new Date(), displayName: 'Individual Member', accountType: 'INDIVIDUAL', status: 'ACTIVE' },
    ] });

    await db.clientPortalWorkspaceMembership.createMany({ data: [
      { id: crypto.randomUUID(), clientPortalIdentityId: orgMemberId, workspaceId: orgWorkspaceId, status: 'ACTIVE', approvedAt: new Date(), approvedById: adminId },
      { id: crypto.randomUUID(), clientPortalIdentityId: orgMemberWithRevokedGrantId, workspaceId: orgWorkspaceId, status: 'ACTIVE', approvedAt: new Date(), approvedById: adminId },
      { id: crypto.randomUUID(), clientPortalIdentityId: individualMemberId, workspaceId: individualWorkspaceId, status: 'ACTIVE', approvedAt: new Date(), approvedById: adminId },
    ] });

    await db.case.createMany({ data: [
      { id: grantedCaseId, caseNumber: `GRANTED-${suffix.slice(0, 8)}`, title: 'Granted case internal', caseType: 'CONTRACT_REVIEW', clientId, createdById: adminId, assignedLawyerId: adminId },
      { id: ungrantedCaseId, caseNumber: `UNGRANTED-${suffix.slice(0, 8)}`, title: 'Ungranted case internal', caseType: 'CONTRACT_REVIEW', clientId, createdById: adminId, assignedLawyerId: adminId },
      { id: individualCaseId, caseNumber: `IND-${suffix.slice(0, 8)}`, title: 'Individual case internal', caseType: 'CONTRACT_REVIEW', clientId, createdById: adminId, assignedLawyerId: adminId },
    ] as never });

    // Revoked historical grant for the second org member must not block workspace-level access.
    await db.clientPortalGrant.create({ data: { clientPortalIdentityId: orgMemberWithRevokedGrantId, workspaceId: orgWorkspaceId, clientId, caseId: ungrantedCaseId, status: 'REVOKED', permissions: ['MATTER_READ'] as never, invitedById: adminId } as never });

    // Active grant only for the granted case on the main org member.
    await db.clientPortalGrant.create({ data: { clientPortalIdentityId: orgMemberId, workspaceId: orgWorkspaceId, clientId, caseId: grantedCaseId, status: 'ACTIVE', permissions: ['MATTER_READ', 'DOCUMENT_READ', 'ACTION_REQUEST_READ', 'UPDATE_READ'] as never, invitedById: adminId, activatedAt: new Date() } as never });

    // Active grant for the individual workspace member (non-organization regression baseline).
    await db.clientPortalGrant.create({ data: { clientPortalIdentityId: individualMemberId, workspaceId: individualWorkspaceId, clientId, caseId: individualCaseId, status: 'ACTIVE', permissions: ['MATTER_READ'] as never, invitedById: adminId, activatedAt: new Date() } as never });

    // Published matter + revision for the granted case.
    const matterPub = await db.clientMatterPublication.create({ data: { caseId: grantedCaseId, clientId, status: 'PUBLISHED', preparedById: adminId, publishedAt: new Date(), workspaceId: orgWorkspaceId } });
    const matterRev = await db.clientMatterPublicationRevision.create({ data: { publicationId: matterPub.id, revisionNumber: 1, clientSafeTitle: 'Publikus ügy', clientSafeStatus: 'Folyamatban', clientSafeNextStep: 'Következő lépés', clientSafeCurrentPosition: 'Aktuális pozíció', publishedDeadlinesSnapshot: [], safeUpdatesSnapshot: [], actionRequestsSnapshot: [], sourceFingerprint: `fp-${suffix}`, audienceSnapshot: {}, createdById: adminId } });
    await db.clientMatterPublication.update({ where: { id: matterPub.id }, data: { currentRevisionId: matterRev.id } });
    matterPublicationId = matterPub.id;

    // Published matter for the ungranted case (same client) to prove it stays invisible.
    const ungrantedMatterPub = await db.clientMatterPublication.create({ data: { caseId: ungrantedCaseId, clientId, status: 'PUBLISHED', preparedById: adminId, publishedAt: new Date(), workspaceId: orgWorkspaceId } });
    const ungrantedMatterRev = await db.clientMatterPublicationRevision.create({ data: { publicationId: ungrantedMatterPub.id, revisionNumber: 1, clientSafeTitle: 'Rejtett ügy', clientSafeStatus: 'Folyamatban', clientSafeNextStep: 'Következő lépés', clientSafeCurrentPosition: 'Rejtett pozíció', publishedDeadlinesSnapshot: [], safeUpdatesSnapshot: [], actionRequestsSnapshot: [], sourceFingerprint: `fp-hidden-${suffix}`, audienceSnapshot: {}, createdById: adminId } });
    await db.clientMatterPublication.update({ where: { id: ungrantedMatterPub.id }, data: { currentRevisionId: ungrantedMatterRev.id } });

    // Published document under the granted matter.
    const document = await db.document.create({ data: { name: 'Test document', title: 'Internal document title', fileName: 'test.txt', category: 'CONTRACT', documentType: 'CONTRACT', mimeType: 'text/plain', caseId: grantedCaseId, clientId, currentVersion: 1, currentVersionInt: 1, version: '1' } });
    const documentVersion = await db.documentVersion.create({ data: { documentId: document.id, version: 1, name: 'test-v1.txt', originalFileName: 'test-v1.txt', mimeType: 'text/plain', size: 12, isCurrent: true, uploadedById: adminId, versionType: 'ORIGINAL' } });
    const docPub = await db.clientDocumentPublication.create({ data: { caseId: grantedCaseId, clientId, documentId: document.id, documentVersionId: documentVersion.id, clientFacingTitle: 'Publikus dokumentum', status: 'PUBLISHED', publishedAt: new Date(), preparedById: adminId, workspaceId: orgWorkspaceId, audienceSnapshot: {}, sourceFingerprint: `fp-doc-${suffix}` } });
    documentPublicationId = docPub.id;

    // Published action request and safe update under the granted case.
    const action = await db.clientActionRequest.create({ data: { caseId: grantedCaseId, clientId, type: 'INFORMATION_REQUEST', clientSafeTitle: 'Kérjük adjon meg adatot', clientSafeInstructions: 'Töltse ki az adatlapot.', status: 'PUBLISHED', audienceSnapshot: {}, preparedById: adminId } });
    actionRequestId = action.id;
    const update = await db.clientSafeUpdate.create({ data: { caseId: grantedCaseId, clientId, title: 'Frissítés', body: 'Biztonságos frissítés.', category: 'GENERAL', status: 'PUBLISHED', publishedAt: new Date(), audienceSnapshot: {}, preparedById: adminId } });
    safeUpdateId = update.id;
  });

  afterAll(async () => { await db.$disconnect(); });

  it('A: organization member with active membership and zero grants can load portal home with zero Cases', async () => {
    const home = await portalHomeSnapshot(orgMemberWithRevokedGrantActor, db);
    expect(home.access.state).toBe('ACTIVE');
    expect(home.access.grantCount).toBe(0);
    expect(home.matters).toHaveLength(0);
    expect(home.attention).toHaveLength(0);
    expect(home.updates).toHaveLength(0);

    const matters = await listPortalMatters(orgMemberWithRevokedGrantActor, db);
    expect(matters.items).toHaveLength(0);

    const documents = await listPortalDocuments(orgMemberWithRevokedGrantActor, null, db);
    expect(documents.items).toHaveLength(0);

    const actions = await listPortalActionRequests(orgMemberWithRevokedGrantActor, null, db);
    expect(actions.items).toHaveLength(0);

    const updates = await listPortalSafeUpdates(orgMemberWithRevokedGrantActor, null, db);
    expect(updates.items).toHaveLength(0);
  });

  it('B: revoked historical grant does not block organization workspace-level access', async () => {
    await expect(portalHomeSnapshot(orgMemberWithRevokedGrantActor, db)).resolves.toMatchObject({ access: { grantCount: 0 } });
  });

  it('C: organization member with explicit active grant sees only the granted Case', async () => {
    const home = await portalHomeSnapshot(orgMemberActor, db);
    expect(home.access.grantCount).toBe(1);
    expect(home.matters).toHaveLength(1);
    expect(home.matters[0].title).toBe('Publikus ügy');

    const matters = await listPortalMatters(orgMemberActor, db);
    expect(matters.items).toHaveLength(1);
    expect(matters.items[0].caseId).toBe(grantedCaseId);
  });

  it('D: another Case for the same Client without a grant remains invisible', async () => {
    const matters = await listPortalMatters(orgMemberActor, db);
    const titles = matters.items.map((matter: any) => matter.title);
    expect(titles).toContain('Publikus ügy');
    expect(titles).not.toContain('Rejtett ügy');
  });

  it('E: direct access to unauthorized Case, document, action and update is denied', async () => {
    const ungrantedMatter = await db.clientMatterPublication.findFirst({ where: { caseId: ungrantedCaseId } });
    expect(ungrantedMatter).toBeTruthy();
    await expect(getPortalMatter(orgMemberActor, ungrantedMatter!.id, db)).rejects.toMatchObject({ code: 'PORTAL_RESOURCE_NOT_FOUND' });

    // Guessing the granted document id without a grant on that Case should also fail for the zero-grant member.
    await expect(getPortalDocument(orgMemberWithRevokedGrantActor, documentPublicationId, db)).rejects.toMatchObject({ code: 'PORTAL_RESOURCE_NOT_FOUND' });
  });

  it('F: non-organization workspace still requires an active grant for portal home', async () => {
    const otherMemberNoGrant = await db.clientPortalIdentity.create({ data: { provider: 'ENTRA_EXTERNAL_ID', issuer: `iss-${suffix}`, subject: 'individual-no-grant', normalizedEmail: `individual-no-grant-${suffix}@test.invalid`, emailVerifiedAt: new Date(), displayName: 'Individual No Grant', accountType: 'INDIVIDUAL', status: 'ACTIVE' } });
    await db.clientPortalWorkspaceMembership.create({ data: { clientPortalIdentityId: otherMemberNoGrant.id, workspaceId: individualWorkspaceId, status: 'ACTIVE', approvedAt: new Date(), approvedById: adminId } });
    const actor = { userId: otherMemberNoGrant.id, role: 'CLIENT_PORTAL', workspaceId: individualWorkspaceId };
    await expect(portalHomeSnapshot(actor, db)).rejects.toMatchObject({ code: 'CLIENT_PORTAL_NO_ACTIVE_GRANT' });
  });

  it('organization member with zero grants cannot infer Case count from direct resource ids', async () => {
    await expect(getPortalMatter(orgMemberWithRevokedGrantActor, matterPublicationId, db)).rejects.toMatchObject({ code: 'PORTAL_RESOURCE_NOT_FOUND' });
    await expect(getPortalDocument(orgMemberWithRevokedGrantActor, documentPublicationId, db)).rejects.toMatchObject({ code: 'PORTAL_RESOURCE_NOT_FOUND' });
    await expect(listPortalActionRequests(orgMemberWithRevokedGrantActor, null, db)).resolves.toMatchObject({ items: [] });
    await expect(listPortalSafeUpdates(orgMemberWithRevokedGrantActor, null, db)).resolves.toMatchObject({ items: [] });
  });
});
