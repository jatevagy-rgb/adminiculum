import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { resolveActiveCustomerGrant } from '../src/modules/client-interaction/base';

// Regression (no DB): the portal /workspace aggregation must not fail wholesale
// when a matter-read grant lacks message/document permissions. Per-matter
// interaction lookups are wrapped so a 403 (permission missing / capability
// disabled) degrades to an empty section instead of denying the whole workspace.
describe('portalWorkspace degrades per-matter interaction denials (regression)', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'clientPortal.ts'), 'utf8');
  it('wraps per-matter interaction lookups so a 403 yields an empty section', () => {
    expect(source).toMatch(/const emptyOnDenied = async <T>\(load: \(\) => Promise<\{ items: T\[\] \}>\)/);
    expect(source).toMatch(/if \(\(error as \{ status\?: number \} \| null\)\?\.status === 403\) return \[\];/);
    expect(source).toMatch(/emptyOnDenied\(\(\) => listCustomerThreads\(context\)\)/);
    expect(source).toMatch(/emptyOnDenied\(\(\) => listCustomerRequests\(context\)\)/);
    expect(source).toMatch(/emptyOnDenied\(\(\) => listCustomerSubmissions\(context, undefined\)\)/);
  });
});
import {
  addThreadParticipant,
  createCustomerQuestion,
  draftAnswer,
  getCustomerThread,
  markCustomerThreadRead,
  removeThreadParticipant,
  sendAnswer,
  sendCustomerMessage,
} from '../src/modules/client-interaction/questionService';
import {
  approveDocumentPublication,
  authorizePortalDocumentDownload,
  createDocumentPublication,
  getPortalDocument,
  listPortalDocuments,
  publishDocumentPublication,
  revokeDocumentPublication,
  submitDocumentPublication,
} from '../src/modules/client-publication/publicationService';

const databaseUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL
  || process.env.PUBLICATION_TEST_DATABASE_URL
  || process.env.CLIENT_IDENTITY_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('CP1 external communication + participant-scoped document access (PostgreSQL)', () => {
  let db: PrismaClient;
  const admin = crypto.randomUUID();
  const client = crypto.randomUUID();
  const workspace = crypto.randomUUID();
  const caseId = crypto.randomUUID();
  const otherCaseId = crypto.randomUUID();
  const documentId = crypto.randomUUID();
  const version1 = crypto.randomUUID();
  const version2 = crypto.randomUUID();
  const identity: Record<string, string> = {};
  const membership: Record<string, string> = {};
  const grant: Record<string, string> = {};
  const actor = { userId: admin, role: 'ADMIN' };

  async function makeIdentity(key: string): Promise<void> {
    identity[key] = crypto.randomUUID();
    membership[key] = crypto.randomUUID();
    await db.clientPortalIdentity.create({
      data: {
        id: identity[key],
        provider: 'ENTRA_EXTERNAL_ID',
        issuer: 'cp1-test',
        subject: `sub-${identity[key]}`,
        normalizedEmail: `${key}-${identity[key]}@example.invalid`,
        emailVerifiedAt: new Date(),
        displayName: key,
        accountType: 'ORGANIZATION_MEMBER',
        status: 'ACTIVE',
      },
    });
    await db.clientPortalWorkspaceMembership.create({
      data: {
        id: membership[key],
        clientPortalIdentityId: identity[key],
        workspaceId: workspace,
        status: 'ACTIVE',
        approvedAt: new Date(),
        approvedById: admin,
      },
    });
  }

  async function makeGrant(key: string, targetCaseId = caseId, permissions: string[] = ['MATTER_READ', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD', 'MESSAGE_READ', 'MESSAGE_SEND']): Promise<void> {
    const row = await db.clientPortalGrant.create({
      data: {
        clientPortalIdentityId: identity[key],
        workspaceId: workspace,
        clientId: client,
        caseId: targetCaseId,
        status: 'ACTIVE',
        participantRole: key === 'alexandra' ? 'REQUESTER' : 'PARTICIPANT',
        isRequester: key === 'alexandra',
        permissions: permissions as never,
        invitedById: admin,
        activatedAt: new Date(),
      } as never,
    });
    grant[key] = row.id;
  }

  async function customerContext(key: string, targetCaseId = caseId) {
    return resolveActiveCustomerGrant(identity[key], targetCaseId, workspace, db as never);
  }

  async function publishSelectedDocument(recipientMembershipIds: string[]) {
    const draft = await createDocumentPublication(actor, {
      documentId,
      documentVersionId: version1,
      workspaceId: workspace,
      visibility: 'SELECTED_PARTICIPANTS',
      recipientMembershipIds,
      clientFacingTitle: 'Exact version one',
      clientFacingExplanation: 'Client-safe explanation for version one.',
    }, db);
    const submitted = await submitDocumentPublication(actor, draft.id, { expectedRevision: draft.revision }, db);
    const approved = await approveDocumentPublication(actor, draft.id, { expectedRevision: submitted.revision }, db);
    return publishDocumentPublication(actor, draft.id, { expectedRevision: approved.revision }, db);
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.CLIENT_PORTAL_READ_ENABLED = 'true';
    process.env.CLIENT_PORTAL_ACTIONS_ENABLED = 'true';
    process.env.CLIENT_PORTAL_QUESTIONS_ENABLED = 'true';
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    await db.user.create({ data: { id: admin, email: `${admin}@example.invalid`, name: 'CP1 Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] } as never });
    await db.client.create({ data: { id: client, name: 'CP1 External Communication Client' } });
    await db.clientPortalWorkspace.create({ data: { id: workspace, clientId: client, name: 'CP1 Organization Workspace', mode: 'ORGANIZATION', communicationMode: 'PORTAL_PRIMARY', publicReference: `cp1-${workspace}`, createdById: admin } as never });
    await db.case.createMany({ data: [
      { id: caseId, caseNumber: `CP1-COMM-${caseId.slice(0, 8)}`, title: 'CP1 scoped case', caseType: 'CONTRACT_REVIEW', clientId: client, createdById: admin, assignedLawyerId: admin },
      { id: otherCaseId, caseNumber: `CP1-OTHER-${otherCaseId.slice(0, 8)}`, title: 'CP1 other case', caseType: 'CONTRACT_REVIEW', clientId: client, createdById: admin, assignedLawyerId: admin },
    ] as never });
    for (const key of ['alexandra', 'bela', 'ferenc']) await makeIdentity(key);
    await makeGrant('alexandra');
    await makeGrant('bela');
    await makeGrant('ferenc', otherCaseId);
    await db.document.create({ data: { id: documentId, name: 'CP1 exact document', title: 'Internal title', fileName: 'cp1-document.txt', category: 'CONTRACT', documentType: 'CONTRACT', mimeType: 'text/plain', caseId, clientId: client, currentVersion: 2, currentVersionInt: 2, version: '2' } as never });
    await db.documentVersion.createMany({ data: [
      { id: version1, documentId, version: 1, name: 'cp1-v1.txt', originalFileName: 'cp1-v1.txt', mimeType: 'text/plain', size: 10, storageReference: 'cp1-storage-v1', spItemId: 'cp1-sp-v1', isCurrent: false, uploadedById: admin, versionType: 'ORIGINAL' },
      { id: version2, documentId, version: 2, name: 'cp1-v2.txt', originalFileName: 'cp1-v2.txt', mimeType: 'text/plain', size: 20, storageReference: 'cp1-storage-v2', spItemId: 'cp1-sp-v2', isCurrent: true, uploadedById: admin, previousVersionId: version1 },
    ] as never });
    await db.documentReview.create({ data: { documentId, documentVersionId: version1, approvedVersionId: version1, status: 'CLOSED', ownerId: admin, createdById: admin, assignedReviewerId: admin, completedAt: new Date() } as never });
  });

  afterAll(async () => { await db?.$disconnect(); });

  it('scopes external questions to exact participants, communication mode and read state', async () => {
    const alexandra = await customerContext('alexandra');
    const bela = await customerContext('bela');
    const thread = await createCustomerQuestion(alexandra, { subject: 'Participant scoped question', bodySafe: 'Synthetic client question.' }, db as never);

    await expect(getCustomerThread(bela, thread.id, db as never)).rejects.toMatchObject({ code: 'THREAD_NOT_FOUND' });
    await addThreadParticipant(actor, thread.id, { workspaceMembershipId: membership.bela, canRead: true, canWrite: false }, db as never);
    const visibleToBela = await getCustomerThread(bela, thread.id, db as never);
    expect(visibleToBela.messages).toHaveLength(1);
    await expect(sendCustomerMessage(bela, thread.id, { bodySafe: 'Béla should be read only.' }, db as never)).rejects.toMatchObject({ code: 'THREAD_WRITE_DENIED' });

    const draft = await draftAnswer(actor, thread.id, { bodySafe: 'Internal draft answer.' }, db as never);
    expect((await getCustomerThread(alexandra, thread.id, db as never)).messages).toHaveLength(1);
    await sendAnswer(actor, thread.id, draft.id, { sendNotification: false }, db as never);
    const answered = await getCustomerThread(bela, thread.id, db as never);
    expect(answered.messages).toHaveLength(2);
    expect(answered.unreadCount).toBeGreaterThan(0);
    expect(await markCustomerThreadRead(bela, thread.id, db as never)).toEqual({ unreadCount: 0 });

    await removeThreadParticipant(actor, thread.id, membership.bela, db as never);
    await expect(getCustomerThread(bela, thread.id, db as never)).rejects.toMatchObject({ code: 'THREAD_NOT_FOUND' });
    await db.clientPortalWorkspace.update({ where: { id: workspace }, data: { communicationMode: 'EXTERNAL_ONLY' } as never });
    await expect(createCustomerQuestion(alexandra, { subject: 'Blocked external mode', bodySafe: 'Should not send.' }, db as never)).rejects.toMatchObject({ code: 'CLIENT_PORTAL_MESSAGES_EXTERNAL_ONLY' });
    await db.clientPortalWorkspace.update({ where: { id: workspace }, data: { communicationMode: 'PORTAL_PRIMARY' } as never });
  });

  it('publishes exact document versions only to selected participants and revokes cleanly', async () => {
    const alexandraActor = { userId: identity.alexandra, role: 'CLIENT_PORTAL', workspaceId: workspace };
    const belaActor = { userId: identity.bela, role: 'CLIENT_PORTAL', workspaceId: workspace };
    const ferencActor = { userId: identity.ferenc, role: 'CLIENT_PORTAL', workspaceId: workspace };
    await expect(createDocumentPublication(actor, { documentId, documentVersionId: version1, workspaceId: workspace, visibility: 'SELECTED_PARTICIPANTS', recipientMembershipIds: [membership.ferenc], clientFacingTitle: 'Wrong recipient' }, db)).rejects.toMatchObject({ code: 'DOCUMENT_RECIPIENT_INVALID' });

    const published = await publishSelectedDocument([membership.alexandra]);
    expect(published.documentVersionId).toBe(version1);
    const alexandraList = await listPortalDocuments(alexandraActor, null, db);
    expect(alexandraList.items.map((item: any) => item.id)).toContain(published.id);
    await expect(getPortalDocument(belaActor, published.id, db)).rejects.toMatchObject({ code: 'PORTAL_RESOURCE_NOT_FOUND' });
    expect((await listPortalDocuments(ferencActor, null, db)).items).toHaveLength(0);

    const download = await authorizePortalDocumentDownload(alexandraActor, published.id, db);
    expect(download).toMatchObject({ publicationId: published.id, documentId, documentVersionId: version1 });
    expect(JSON.stringify(download)).not.toMatch(/storageReference|spItemId|cp1-storage|cp1-sp/);
    const row = await db.clientDocumentPublication.findUnique({ where: { id: published.id }, select: { documentVersionId: true } });
    expect(row?.documentVersionId).toBe(version1);
    expect(row?.documentVersionId).not.toBe(version2);

    const revoked = await revokeDocumentPublication(actor, published.id, { expectedRevision: published.revision, revocationReasonSafe: 'CP1 test revoke' }, db);
    expect(revoked.status).toBe('REVOKED');
    expect((await listPortalDocuments(alexandraActor, null, db)).items.map((item: any) => item.id)).not.toContain(published.id);
    await expect(authorizePortalDocumentDownload(alexandraActor, published.id, db)).rejects.toMatchObject({ code: 'PORTAL_RESOURCE_NOT_FOUND' });
  });
});
