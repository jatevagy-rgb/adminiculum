import { PrismaClient } from '@prisma/client';
import { getClientPublishedContent } from '../src/modules/client-publication/publicationService';
import { createWorkspace, inviteWorkspaceMember, listAdminWorkspaces, transitionWorkspaceMembership } from '../src/modules/client-workspace/workspaceService';

// Internal Portal Center read model (PostgreSQL).
//
// Proves the client-scoped published-content projection reuses the canonical
// internal client/case authorization and stays truthful:
//   A   ADMIN can read all publications for the client
//   B   PARTNER can read all publications for the client
//   C   LAWYER with created/assigned Case sees only authorized case publications
//   D   COLLAB_LAWYER with a CaseCollaborator relation sees authorized publications
//   E   ACTIVE LAWYER with no Case access to the target client => 403, no payload
//   F   actor with Case access in a different client => still 403 for the target
//   G   cross-client publications are excluded
//   H   draft/revoked exclusion remains
//   +   active member count / cross-client memberships / read-only exact-version
const databaseUrl = process.env.PUBLICATION_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const ids = {
  admin: 'a1000000-0000-4000-8000-000000000001',
  partner: 'a1000000-0000-4000-8000-000000000002',
  lawyerAssigned: 'a1000000-0000-4000-8000-000000000003',
  collabLawyer: 'a1000000-0000-4000-8000-000000000004',
  outsiderLawyer: 'a1000000-0000-4000-8000-000000000005',
  otherClientLawyer: 'a1000000-0000-4000-8000-000000000006',
  client: 'a2000000-0000-4000-8000-000000000001',
  otherClient: 'a2000000-0000-4000-8000-000000000002',
  case: 'a3000000-0000-4000-8000-000000000001',
  otherCase: 'a3000000-0000-4000-8000-000000000002',
  caseUnassigned: 'a3000000-0000-4000-8000-000000000003',
  document: 'a4000000-0000-4000-8000-000000000001',
  version: 'a5000000-0000-4000-8000-000000000001',
  otherDocument: 'a4000000-0000-4000-8000-000000000002',
  otherVersion: 'a5000000-0000-4000-8000-000000000002',
  identityActive: 'a6000000-0000-4000-8000-000000000001',
  identitySuspended: 'a6000000-0000-4000-8000-000000000002',
  identityOther: 'a6000000-0000-4000-8000-000000000003',
  matterPublished: 'a7000000-0000-4000-8000-000000000001',
  matterDraft: 'a7000000-0000-4000-8000-000000000002',
  matterRevision: 'a7100000-0000-4000-8000-000000000001',
  documentPublished: 'a7200000-0000-4000-8000-000000000001',
  documentRevoked: 'a7200000-0000-4000-8000-000000000002',
  actionPublished: 'a7300000-0000-4000-8000-000000000001',
  actionDraft: 'a7300000-0000-4000-8000-000000000002',
  updatePublished: 'a7400000-0000-4000-8000-000000000001',
  otherMatterPublished: 'a7500000-0000-4000-8000-000000000001',
  unassignedMatterPublished: 'a7500000-0000-4000-8000-000000000002',
};

const adminActor = { userId: ids.admin, role: 'ADMIN' };
const partnerActor = { userId: ids.partner, role: 'PARTNER' };
const lawyerActor = { userId: ids.lawyerAssigned, role: 'LAWYER' };
const collabActor = { userId: ids.collabLawyer, role: 'COLLAB_LAWYER' };
const outsiderActor = { userId: ids.outsiderLawyer, role: 'LAWYER' };
const otherClientLawyerActor = { userId: ids.otherClientLawyer, role: 'LAWYER' };

describeWithDatabase('Portal Center published-content projection (PostgreSQL)', () => {
  let db: PrismaClient;
  let workspaceId = '';
  let activeMembershipId = '';
  let suspendedMembershipId = '';
  let otherWorkspaceId = '';
  let otherMembershipId = '';

  beforeAll(async () => {
    const parsed = new URL(databaseUrl as string);
    expect(['127.0.0.1', 'localhost', '::1']).toContain(parsed.hostname);
    expect(parsed.pathname.replace(/^\//, '')).toBe('adminiculum_replay_ci');
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    await db.user.createMany({ data: [
      { id: ids.admin, email: 'portal-center-admin@example.invalid', name: 'Portal Center Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] },
      { id: ids.partner, email: 'portal-center-partner@example.invalid', name: 'Portal Center Partner', role: 'PARTNER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: ids.lawyerAssigned, email: 'portal-center-lawyer@example.invalid', name: 'Assigned Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: ids.collabLawyer, email: 'portal-center-collab@example.invalid', name: 'Collaborating Lawyer', role: 'COLLAB_LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: ids.outsiderLawyer, email: 'portal-center-outsider@example.invalid', name: 'Outsider Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: ids.otherClientLawyer, email: 'portal-center-other-lawyer@example.invalid', name: 'Other Client Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
    ] });
    await db.client.createMany({ data: [{ id: ids.client, name: 'Portal Center Client' }, { id: ids.otherClient, name: 'Other Portal Client' }] });
    await db.case.createMany({ data: [
      { id: ids.case, caseNumber: 'PCC-001', title: 'Portal center case', caseType: 'CONTRACT_REVIEW', clientId: ids.client, createdById: ids.lawyerAssigned, assignedLawyerId: ids.lawyerAssigned },
      { id: ids.caseUnassigned, caseNumber: 'PCC-003', title: 'Unrelated case in same client', caseType: 'CONTRACT_REVIEW', clientId: ids.client, createdById: ids.admin, assignedLawyerId: ids.admin },
      { id: ids.otherCase, caseNumber: 'PCC-002', title: 'Other portal center case', caseType: 'CONTRACT_REVIEW', clientId: ids.otherClient, createdById: ids.otherClientLawyer, assignedLawyerId: ids.otherClientLawyer },
    ] });
    await db.caseCollaborator.create({ data: { caseId: ids.case, userId: ids.collabLawyer, role: 'COLLABORATOR' } });
    await db.document.createMany({ data: [
      { id: ids.document, name: 'Portal center published document', fileName: 'portal-center.txt', category: 'CONTRACT', documentType: 'CONTRACT', mimeType: 'text/plain', caseId: ids.case, clientId: ids.client, currentVersion: 1, currentVersionInt: 1, version: '1' },
      { id: ids.otherDocument, name: 'Other portal document', fileName: 'other-portal.txt', category: 'CONTRACT', documentType: 'CONTRACT', mimeType: 'text/plain', caseId: ids.otherCase, clientId: ids.otherClient, currentVersion: 1, currentVersionInt: 1, version: '1' },
    ] });
    await db.documentVersion.createMany({ data: [
      { id: ids.version, documentId: ids.document, version: 1, name: 'portal-v1.txt', originalFileName: 'portal-v1.txt', mimeType: 'text/plain', size: 10, storageReference: 'portal-storage', spItemId: 'portal-sp', isCurrent: true, uploadedById: ids.admin },
      { id: ids.otherVersion, documentId: ids.otherDocument, version: 1, name: 'other-portal-v1.txt', originalFileName: 'other-portal-v1.txt', mimeType: 'text/plain', size: 11, storageReference: 'other-portal-storage', spItemId: 'other-portal-sp', isCurrent: true, uploadedById: ids.admin },
    ] });
    await db.clientPortalIdentity.createMany({ data: [
      { id: ids.identityActive, provider: 'ENTRA_EXTERNAL_ID', issuer: 'issuer', subject: 'active', normalizedEmail: 'portal-active@example.invalid', displayName: 'Active Portal User', accountType: 'INDIVIDUAL', status: 'ACTIVE' },
      { id: ids.identitySuspended, provider: 'ENTRA_EXTERNAL_ID', issuer: 'issuer', subject: 'suspended', normalizedEmail: 'portal-suspended@example.invalid', displayName: 'Suspended Portal User', accountType: 'INDIVIDUAL', status: 'ACTIVE' },
      { id: ids.identityOther, provider: 'ENTRA_EXTERNAL_ID', issuer: 'issuer', subject: 'other', normalizedEmail: 'portal-other@example.invalid', displayName: 'Other Client Portal User', accountType: 'INDIVIDUAL', status: 'ACTIVE' },
    ] });

    const workspace = await createWorkspace(adminActor, { clientId: ids.client, name: 'Portal Center Workspace', mode: 'ORGANIZATION', communicationMode: 'PORTAL_PRIMARY', connectedSystemState: 'NOT_CONFIGURED' }, db);
    workspaceId = workspace.id;
    const otherWorkspace = await createWorkspace(adminActor, { clientId: ids.otherClient, name: 'Other Workspace', mode: 'INDIVIDUAL', communicationMode: 'PORTAL_PRIMARY', connectedSystemState: 'NOT_CONFIGURED' }, db);
    otherWorkspaceId = otherWorkspace.id;

    const activeInvite = await inviteWorkspaceMember(adminActor, workspaceId, { email: 'portal-active@example.invalid', role: 'MEMBER' }, db);
    activeMembershipId = String(activeInvite.membershipId);
    const suspendedInvite = await inviteWorkspaceMember(adminActor, workspaceId, { email: 'portal-suspended@example.invalid', role: 'MEMBER' }, db);
    suspendedMembershipId = String(suspendedInvite.membershipId);
    const otherInvite = await inviteWorkspaceMember(adminActor, otherWorkspaceId, { email: 'portal-other@example.invalid', role: 'MEMBER' }, db);
    otherMembershipId = String(otherInvite.membershipId);

    const activeRow = await db.clientPortalWorkspaceMembership.findUniqueOrThrow({ where: { id: activeMembershipId } });
    await transitionWorkspaceMembership(adminActor, activeMembershipId, 'approve', activeRow.revision, db);
    const suspendedRow = await db.clientPortalWorkspaceMembership.findUniqueOrThrow({ where: { id: suspendedMembershipId } });
    await transitionWorkspaceMembership(adminActor, suspendedMembershipId, 'approve', suspendedRow.revision, db);
    const suspendedApproved = await db.clientPortalWorkspaceMembership.findUniqueOrThrow({ where: { id: suspendedMembershipId } });
    await transitionWorkspaceMembership(adminActor, suspendedMembershipId, 'suspend', suspendedApproved.revision, db);
    const otherRow = await db.clientPortalWorkspaceMembership.findUniqueOrThrow({ where: { id: otherMembershipId } });
    await transitionWorkspaceMembership(adminActor, otherRow.id, 'approve', otherRow.revision, db);

    const json = (value: unknown) => JSON.stringify(value);
    await db.$executeRawUnsafe(
      'INSERT INTO client_matter_publications (id,"caseId","clientId","workspaceId",status,"currentRevisionId","preparedById") VALUES ($1,$2,$3,$4,$5::"ClientPublicationStatus",$6,$7)',
      ids.matterPublished, ids.case, ids.client, workspaceId, 'PUBLISHED', ids.matterRevision, ids.admin,
    );
    await db.$executeRawUnsafe(
      'INSERT INTO client_matter_publication_revisions (id,"publicationId","revisionNumber","clientSafeTitle","clientSafeStatus","publishedDeadlinesSnapshot","safeUpdatesSnapshot","actionRequestsSnapshot","sourceFingerprint","audienceSnapshot","createdById") VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10::jsonb,$11)',
      ids.matterRevision, ids.matterPublished, 1, 'Portal center case progress', 'Under review', json([]), json([]), json([]), 'fingerprint-1', json({}), ids.admin,
    );
    await db.$executeRawUnsafe(
      'INSERT INTO client_matter_publications (id,"caseId","clientId","workspaceId",status,"preparedById") VALUES ($1,$2,$3,$4,$5::"ClientPublicationStatus",$6)',
      ids.matterDraft, ids.case, ids.client, workspaceId, 'DRAFT', ids.admin,
    );
    await db.$executeRawUnsafe(
      'INSERT INTO client_document_publications (id,"caseId","clientId","workspaceId","documentId","documentVersionId",status,"clientFacingTitle","preparedById","audienceSnapshot","sourceFingerprint") VALUES ($1,$2,$3,$4,$5,$6,$7::"ClientPublicationStatus",$8,$9,$10::jsonb,$11)',
      ids.documentPublished, ids.case, ids.client, workspaceId, ids.document, ids.version, 'PUBLISHED', 'Published portal document', ids.admin, json({}), 'doc-fingerprint',
    );
    await db.$executeRawUnsafe(
      'INSERT INTO client_document_publications (id,"caseId","clientId","workspaceId","documentId","documentVersionId",status,"clientFacingTitle","preparedById","audienceSnapshot","sourceFingerprint") VALUES ($1,$2,$3,$4,$5,$6,$7::"ClientPublicationStatus",$8,$9,$10::jsonb,$11)',
      ids.documentRevoked, ids.case, ids.client, workspaceId, ids.document, ids.version, 'REVOKED', 'Revoked portal document', ids.admin, json({}), 'doc-fingerprint',
    );
    await db.$executeRawUnsafe(
      'INSERT INTO client_action_requests (id,"caseId","clientId",type,"clientSafeTitle",status,"preparedById","audienceSnapshot") VALUES ($1,$2,$3,$4::"ClientActionRequestType",$5,$6::"ClientActionRequestStatus",$7,$8::jsonb)',
      ids.actionPublished, ids.case, ids.client, 'QUESTION', 'Published customer question', 'PUBLISHED', ids.admin, json({}),
    );
    await db.$executeRawUnsafe(
      'INSERT INTO client_action_requests (id,"caseId","clientId",type,"clientSafeTitle",status,"preparedById","audienceSnapshot") VALUES ($1,$2,$3,$4::"ClientActionRequestType",$5,$6::"ClientActionRequestStatus",$7,$8::jsonb)',
      ids.actionDraft, ids.case, ids.client, 'QUESTION', 'Draft customer question', 'DRAFT', ids.admin, json({}),
    );
    await db.$executeRawUnsafe(
      'INSERT INTO client_safe_updates (id,"caseId","clientId",title,body,category,status,"preparedById","audienceSnapshot") VALUES ($1,$2,$3,$4,$5,$6::"ClientSafeUpdateCategory",$7::"ClientSafeUpdateStatus",$8,$9::jsonb)',
      ids.updatePublished, ids.case, ids.client, 'Published safe update', 'Client-safe body', 'GENERAL', 'PUBLISHED', ids.admin, json({}),
    );
    // Same client, but a different case the lawyer/collaborator must NOT see.
    await db.$executeRawUnsafe(
      'INSERT INTO client_matter_publications (id,"caseId","clientId",status,"preparedById") VALUES ($1,$2,$3,$4::"ClientPublicationStatus",$5)',
      ids.unassignedMatterPublished, ids.caseUnassigned, ids.client, 'PUBLISHED', ids.admin,
    );
    // A different client entirely.
    await db.$executeRawUnsafe(
      'INSERT INTO client_matter_publications (id,"caseId","clientId",status,"preparedById") VALUES ($1,$2,$3,$4::"ClientPublicationStatus",$5)',
      ids.otherMatterPublished, ids.otherCase, ids.otherClient, 'PUBLISHED', ids.admin,
    );
  });

  afterAll(async () => { await db?.$disconnect(); });

  it('A. ADMIN can read all publications for the client', async () => {
    const result = await getClientPublishedContent(adminActor, ids.client, db);
    expect(result.counts).toEqual({ matters: 2, documents: 1, actionRequests: 1, updates: 1, total: 5 });
    expect(result.clientName).toBe('Portal Center Client');
  });

  it('B. PARTNER can read all publications for the client', async () => {
    const result = await getClientPublishedContent(partnerActor, ids.client, db);
    expect(result.counts.total).toBe(5);
    expect(result.items.map((item: any) => item.id)).toContain(ids.unassignedMatterPublished);
  });

  it('C. LAWYER with the created/assigned Case sees only authorized case publications', async () => {
    const result = await getClientPublishedContent(lawyerActor, ids.client, db);
    expect(result.counts.total).toBe(4);
    expect(result.items.every((item: any) => item.caseId === ids.case)).toBe(true);
    expect(result.items.map((item: any) => item.id)).not.toContain(ids.unassignedMatterPublished);
  });

  it('D. COLLAB_LAWYER with a CaseCollaborator relation sees authorized publications', async () => {
    const result = await getClientPublishedContent(collabActor, ids.client, db);
    expect(result.counts.total).toBe(4);
    expect(result.items.every((item: any) => item.caseId === ids.case)).toBe(true);
  });

  it('E. ACTIVE LAWYER with no Case access in the client gets 403 and no client payload', async () => {
    let caught: any = null;
    try { await getClientPublishedContent(outsiderActor, ids.client, db); } catch (error) { caught = error; }
    expect(caught).toBeTruthy();
    expect(caught.code).toBe('CLIENT_ACCESS_FORBIDDEN');
    expect(caught.status).toBe(403);
    expect(caught.clientName).toBeUndefined();
    expect(caught.counts).toBeUndefined();
    expect(caught.items).toBeUndefined();
  });

  it('F. actor with Case access in a different client still gets 403 for the target client', async () => {
    await expect(getClientPublishedContent(otherClientLawyerActor, ids.client, db)).rejects.toMatchObject({ code: 'CLIENT_ACCESS_FORBIDDEN', status: 403 });
    // and can still read their own client
    const own = await getClientPublishedContent(otherClientLawyerActor, ids.otherClient, db);
    expect(own.counts.total).toBe(1);
  });

  it('G. cross-client publications are excluded', async () => {
    const result = await getClientPublishedContent(adminActor, ids.client, db);
    expect(result.items.map((item: any) => item.id)).not.toContain(ids.otherMatterPublished);
    expect(result.items.every((item: any) => [ids.case, ids.caseUnassigned].includes(item.caseId))).toBe(true);
    const other = await getClientPublishedContent(adminActor, ids.otherClient, db);
    expect(other.counts.total).toBe(1);
    expect(other.items[0].id).toBe(ids.otherMatterPublished);
  });

  it('H. draft, revoked and unpublished rows remain excluded for every privileged actor', async () => {
    for (const actor of [adminActor, partnerActor, lawyerActor, collabActor]) {
      const result = await getClientPublishedContent(actor, ids.client, db);
      const seen = result.items.map((item: any) => item.id);
      expect(seen).not.toContain(ids.matterDraft);
      expect(seen).not.toContain(ids.documentRevoked);
      expect(seen).not.toContain(ids.actionDraft);
      expect(seen).toContain(ids.documentPublished);
    }
  });

  it('active member count counts only ACTIVE workspace memberships, excluding suspended', async () => {
    const { items } = await listAdminWorkspaces(adminActor, ids.client, db);
    const workspace = items.find((item) => item.id === workspaceId);
    expect(workspace).toBeTruthy();
    expect(workspace!.activeMembershipCount).toBe(1);
    const statuses = workspace!.memberships.map((membership) => membership.status).sort();
    expect(statuses).toEqual(['ACTIVE', 'SUSPENDED']);
    expect(workspace!.memberships.every((membership) => 'invitedByName' in membership)).toBe(true);
  });

  it('cross-client memberships never appear in the client-scoped read model', async () => {
    const { items } = await listAdminWorkspaces(adminActor, ids.client, db);
    expect(items.every((item) => item.clientId === ids.client)).toBe(true);
    const membershipIds = items.flatMap((item) => item.memberships.map((membership) => membership.id));
    expect(membershipIds).not.toContain(otherMembershipId);
    expect(items.some((item) => item.id === otherWorkspaceId)).toBe(false);
  });

  it('exact-version document publication semantics are unchanged by the projection', async () => {
    const before = await db.clientDocumentPublication.findUniqueOrThrow({ where: { id: ids.documentPublished } });
    await getClientPublishedContent(adminActor, ids.client, db);
    const after = await db.clientDocumentPublication.findUniqueOrThrow({ where: { id: ids.documentPublished } });
    expect(after.documentVersionId).toBe(before.documentVersionId);
    expect(after.documentVersionId).toBe(ids.version);
    expect(after.status).toBe('PUBLISHED');
    expect(after.revision).toBe(before.revision);
  });

  it('rejects a non-internal actor and a client that does not exist', async () => {
    await expect(getClientPublishedContent({ userId: ids.identityActive, role: 'CLIENT' }, ids.client, db)).rejects.toMatchObject({ code: 'PUBLICATION_NOT_AUTHORIZED' });
    await expect(getClientPublishedContent(adminActor, 'a2000000-0000-4000-8000-0000000000ff', db)).rejects.toMatchObject({ code: 'CLIENT_NOT_FOUND' });
  });
});
