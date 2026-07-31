import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import * as requests from '../src/modules/client-interaction/requestService';
import * as questions from '../src/modules/client-interaction/questionService';
import * as submissions from '../src/modules/client-interaction/submissionService';
import * as notifications from '../src/modules/client-interaction/notificationService';
import { resolveActiveCustomerGrant } from '../src/modules/client-interaction/base';
import { setScanner } from '../src/modules/client-interaction/scannerAdapter';
import { setMailSender } from '../src/modules/client-interaction/mailAdapter';
import { setQuarantineStore } from '../src/modules/client-interaction/quarantineAdapter';

const databaseUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL || process.env.CLIENT_IDENTITY_TEST_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

// A deterministic in-memory quarantine + CLEAN scanner + capturing mail sender,
// used ONLY in tests (never in production) to prove the CLEAN acceptance and
// single-delivery idempotency paths.
const store = new Map<string, Buffer>();
const sent: Array<{ to: string; idempotencyKey: string }> = [];

function pdf() { return Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x0a]); }

d('client portal interaction foundation (PostgreSQL)', () => {
  let db: PrismaClient;
  const ids = {
    admin: crypto.randomUUID(), client: crypto.randomUUID(), otherCase: crypto.randomUUID(),
    case: crypto.randomUUID(), identity: crypto.randomUUID(), grant: crypto.randomUUID(),
    unassignedLawyer: crypto.randomUUID(),
  };
  const internalActor = { userId: ids.admin, role: 'ADMIN' };
  const unassignedLawyerActor = { userId: ids.unassignedLawyer, role: 'LAWYER' };

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    process.env.CLIENT_PORTAL_ACTIONS_ENABLED = 'true';
    for (const g of ['QUESTIONS', 'DOCUMENT_REQUESTS', 'DATA_REQUESTS', 'DOCUMENT_UPLOADS', 'EMAIL_NOTIFICATIONS']) process.env[`CLIENT_PORTAL_${g}_ENABLED`] = 'true';

    setQuarantineStore({ provider: 'TEST', async put({ checksum, buffer }) { store.set(checksum, buffer); return { reference: `test:${checksum}`, provider: 'TEST' }; }, async get(ref) { return store.get(ref.replace('test:', '')) || Buffer.alloc(0); } });
    setScanner({ provider: 'TEST', async scan() { return { outcome: 'CLEAN', provider: 'TEST', codeSafe: 'OK' }; } });
    setMailSender({ provider: 'TEST', async send(m) { sent.push({ to: m.to, idempotencyKey: m.idempotencyKey }); return { providerMessageId: `msg-${sent.length}`, provider: 'TEST' }; } });

    await db.user.create({ data: { id: ids.admin, email: `a-${ids.admin}@t.io`, name: 'Admin', role: 'ADMIN', status: 'ACTIVE' } as any });
    await db.user.create({ data: { id: ids.unassignedLawyer, email: `l-${ids.unassignedLawyer}@t.io`, name: 'Unassigned Lawyer', role: 'LAWYER', status: 'ACTIVE' } as any });
    await db.client.create({ data: { id: ids.client, name: 'Interaction Client' } });
    await db.case.create({ data: { id: ids.case, caseNumber: `IX-${ids.case.slice(0, 6)}`, title: 'Interaction case', caseType: 'CONTRACT_REVIEW', clientId: ids.client, createdById: ids.admin, assignedLawyerId: ids.admin } as any });
    await db.case.create({ data: { id: ids.otherCase, caseNumber: `IY-${ids.otherCase.slice(0, 6)}`, title: 'Other case', caseType: 'CONTRACT_REVIEW', clientId: ids.client, createdById: ids.admin, assignedLawyerId: ids.admin } as any });
    await db.clientPortalIdentity.create({ data: { id: ids.identity, provider: 'ENTRA_EXTERNAL_ID', issuer: 'iss', subject: `sub-${ids.identity}`, normalizedEmail: `c-${ids.identity}@t.io`, emailVerifiedAt: new Date(), displayName: 'Customer', accountType: 'INDIVIDUAL', status: 'ACTIVE' } });
    await db.clientPortalGrant.create({ data: { id: ids.grant, clientPortalIdentityId: ids.identity, clientId: ids.client, caseId: ids.case, status: 'ACTIVE', permissions: ['MATTER_READ', 'DOCUMENT_READ'], invitedById: ids.admin, activatedAt: new Date() } as any });
  });

  afterAll(async () => { setScanner(null); setMailSender(null); setQuarantineStore(null); await db.$disconnect(); });

  const ctx = () => resolveActiveCustomerGrant(ids.identity, ids.case, db);

  it('draft request is hidden from the customer until published', async () => {
    const draft = await requests.createRequestDraft(internalActor, { caseId: ids.case, type: 'DATA_FORM', clientSafeTitle: 'Adatok', fields: [{ label: 'Név', type: 'SHORT_TEXT', required: true }] }, db);
    let visible = await requests.listCustomerRequests(await ctx(), db);
    expect(visible.items.find((r: any) => r.id === draft.id)).toBeUndefined();
    await requests.publishRequest(internalActor, draft.id, draft.revision, db);
    visible = await requests.listCustomerRequests(await ctx(), db);
    expect(visible.items.find((r: any) => r.id === draft.id)).toBeTruthy();
  });

  it('customer cannot see a request on a non-granted case (cross-case denial)', async () => {
    await expect(resolveActiveCustomerGrant(ids.identity, ids.otherCase, db)).rejects.toMatchObject({ code: 'CLIENT_PORTAL_NO_ACTIVE_GRANT' });
  });

  it('internal answer draft is hidden until explicitly sent, then delivered once', async () => {
    const thread = await questions.createCustomerQuestion(await ctx(), { subject: 'Kérdés', bodySafe: 'Test?' }, db);
    const draft = await questions.draftAnswer(internalActor, thread.id, { bodySafe: 'Válasz' }, db);
    let seen = await questions.getCustomerThread(await ctx(), thread.id, db);
    expect(seen.messages.some((m: any) => m.authorType === 'INTERNAL')).toBe(false);
    const before = sent.length;
    await questions.sendAnswer(internalActor, thread.id, draft.id, { sendNotification: true }, db);
    seen = await questions.getCustomerThread(await ctx(), thread.id, db);
    expect(seen.messages.some((m: any) => m.authorType === 'INTERNAL')).toBe(true);
    // exactly one notification enqueued; process it once and it delivers once
    const del = await db.clientNotificationDelivery.findFirst({ where: { idempotencyKey: `question-answer:${draft.id}` } });
    await notifications.processDelivery(del!.id, db);
    await notifications.processDelivery(del!.id, db); // idempotent: already SENT
    expect(sent.length).toBe(before + 1);
  });

  it('CLEAN file can be accepted into the matter as an immutable DocumentVersion', async () => {
    const req = await requests.createRequestDraft(internalActor, { caseId: ids.case, type: 'DOCUMENT_UPLOAD', clientSafeTitle: 'Igazolvány' }, db);
    await requests.publishRequest(internalActor, req.id, req.revision, db);
    const sub = await submissions.createDraftSubmission(await ctx(), req.id, db);
    const added = await submissions.addFile(await ctx(), sub.id, { originalFileName: 'id.pdf', declaredMimeType: 'application/pdf', base64: pdf().toString('base64') }, db);
    expect(added.state).toBe('RECEIVED');
    await submissions.submitSubmission(await ctx(), sub.id, {}, db);
    const accepted = await submissions.acceptFileIntoMatter(internalActor, sub.id, added.id, { documentName: 'Ügyfél igazolvány' }, db);
    expect(accepted.documentVersionId).toBeTruthy();
    const version = await db.documentVersion.findUnique({ where: { id: accepted.documentVersionId } });
    expect(version).toBeTruthy();
    const reloaded = await db.clientSubmission.findUnique({ where: { id: sub.id } });
    expect(reloaded!.status).toBe('ACCEPTED_INTO_MATTER');
    expect(reloaded!.acceptedDocumentVersionId).toBe(accepted.documentVersionId);
  });

  it('accept is blocked server-side when the file is not CLEAN (no scanner)', async () => {
    setScanner({ provider: 'NONE', async scan() { return { outcome: 'SCAN_FAILED', provider: 'NONE', codeSafe: 'SCANNER_NOT_CONFIGURED' }; } });
    const req = await requests.createRequestDraft(internalActor, { caseId: ids.case, type: 'DOCUMENT_UPLOAD', clientSafeTitle: 'Igazolvány2' }, db);
    await requests.publishRequest(internalActor, req.id, req.revision, db);
    const sub = await submissions.createDraftSubmission(await ctx(), req.id, db);
    const added = await submissions.addFile(await ctx(), sub.id, { originalFileName: 'id.pdf', declaredMimeType: 'application/pdf', base64: pdf().toString('base64') }, db);
    expect(added.state).toBe('PROCESSING');
    await expect(submissions.acceptFileIntoMatter(internalActor, sub.id, added.id, {}, db)).rejects.toMatchObject({ code: 'FILE_NOT_CLEAN' });
    setScanner({ provider: 'TEST', async scan() { return { outcome: 'CLEAN', provider: 'TEST', codeSafe: 'OK' }; } });
  });

  it('notification enqueue is idempotent (no duplicate logical delivery)', async () => {
    const key = `test-idem-${crypto.randomUUID()}`;
    const a = await notifications.enqueueNotification({ eventType: 'X', clientId: ids.client, caseId: ids.case, recipientEmail: 'r@t.io', subjectSafe: 's', createdById: ids.admin, idempotencyKey: key }, db);
    const b = await notifications.enqueueNotification({ eventType: 'X', clientId: ids.client, caseId: ids.case, recipientEmail: 'r@t.io', subjectSafe: 's', createdById: ids.admin, idempotencyKey: key }, db);
    expect(a.id).toBe(b.id);
    expect(b.deduped).toBe(true);
  });

  it('non-admin internal queues are scoped to accessible cases only', async () => {
    const request = await requests.createRequestDraft(internalActor, { caseId: ids.case, type: 'DATA_FORM', clientSafeTitle: 'Scoped data' }, db);
    await notifications.enqueueNotification({ eventType: 'SCOPED', clientId: ids.client, caseId: ids.case, recipientEmail: 'r@t.io', subjectSafe: 's', createdById: ids.admin, idempotencyKey: `scoped-${request.id}` }, db);

    await expect(requests.listRequestsInternal(unassignedLawyerActor, { caseId: ids.case }, db)).rejects.toMatchObject({ code: 'CASE_ACCESS_FORBIDDEN' });
    expect((await requests.listRequestsInternal(unassignedLawyerActor, {}, db)).total).toBe(0);
    expect((await questions.listThreadsInternal(unassignedLawyerActor, {}, db)).total).toBe(0);
    expect((await submissions.listSubmissionsInternal(unassignedLawyerActor, {}, db)).total).toBe(0);
    expect((await notifications.listNotificationDeliveries(unassignedLawyerActor, {}, db)).total).toBe(0);
  });
});
