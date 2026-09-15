import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import * as requests from '../src/modules/client-interaction/requestService';
import * as questions from '../src/modules/client-interaction/questionService';
import * as submissions from '../src/modules/client-interaction/submissionService';
import * as notifications from '../src/modules/client-interaction/notificationService';
import { resolveActiveCustomerGrant } from '../src/modules/client-interaction/base';
import { setScanner } from '../src/modules/upload-security/scannerAdapter';
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
    case: crypto.randomUUID(), identity: crypto.randomUUID(), grant: crypto.randomUUID(), workspace: crypto.randomUUID(), workspaceMembership: crypto.randomUUID(),
    unassignedLawyer: crypto.randomUUID(),
  };
  const internalActor = { userId: ids.admin, role: 'ADMIN' };
  const unassignedLawyerActor = { userId: ids.unassignedLawyer, role: 'LAWYER' };

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    process.env.CLIENT_PORTAL_ACTIONS_ENABLED = 'true';
    for (const g of ['QUESTIONS', 'DOCUMENT_REQUESTS', 'DATA_REQUESTS', 'DOCUMENT_UPLOADS', 'EMAIL_NOTIFICATIONS']) process.env[`CLIENT_PORTAL_${g}_ENABLED`] = 'true';

    setQuarantineStore({ provider: 'TEST', async put({ checksum, buffer }) { store.set(checksum, buffer); return { reference: `test:${checksum}`, provider: 'TEST' }; }, async get(ref) { return store.get(ref.replace('test:', '')) || Buffer.alloc(0); }, async remove(ref) { store.delete(ref.replace('test:', '')); } });
    setScanner({ provider: 'TEST', async scan() { return { outcome: 'CLEAN', provider: 'TEST', codeSafe: 'OK' }; } });
    setMailSender({ provider: 'TEST', async send(m) { sent.push({ to: m.to, idempotencyKey: m.idempotencyKey }); return { providerMessageId: `msg-${sent.length}`, provider: 'TEST' }; } });

    await db.user.create({ data: { id: ids.admin, email: `a-${ids.admin}@t.io`, name: 'Admin', role: 'ADMIN', status: 'ACTIVE' } as any });
    await db.user.create({ data: { id: ids.unassignedLawyer, email: `l-${ids.unassignedLawyer}@t.io`, name: 'Unassigned Lawyer', role: 'LAWYER', status: 'ACTIVE' } as any });
    await db.client.create({ data: { id: ids.client, name: 'Interaction Client' } });
    await db.case.create({ data: { id: ids.case, caseNumber: `IX-${ids.case.slice(0, 6)}`, title: 'Interaction case', caseType: 'CONTRACT_REVIEW', clientId: ids.client, createdById: ids.admin, assignedLawyerId: ids.admin } as any });
    await db.case.create({ data: { id: ids.otherCase, caseNumber: `IY-${ids.otherCase.slice(0, 6)}`, title: 'Other case', caseType: 'CONTRACT_REVIEW', clientId: ids.client, createdById: ids.admin, assignedLawyerId: ids.admin } as any });
    await db.clientPortalIdentity.create({ data: { id: ids.identity, provider: 'ENTRA_EXTERNAL_ID', issuer: 'iss', subject: `sub-${ids.identity}`, normalizedEmail: `c-${ids.identity}@t.io`, emailVerifiedAt: new Date(), displayName: 'Customer', accountType: 'INDIVIDUAL', status: 'ACTIVE' } });
    await db.clientPortalWorkspace.create({ data: { id: ids.workspace, clientId: ids.client, name: 'Interaction workspace', mode: 'INDIVIDUAL', publicReference: `interaction-${ids.workspace}`, createdById: ids.admin } });
    await db.clientPortalWorkspaceMembership.create({ data: { id: ids.workspaceMembership, clientPortalIdentityId: ids.identity, workspaceId: ids.workspace, status: 'ACTIVE', approvedAt: new Date(), approvedById: ids.admin } });
    await db.clientPortalGrant.create({ data: { id: ids.grant, clientPortalIdentityId: ids.identity, workspaceId: ids.workspace, clientId: ids.client, caseId: ids.case, status: 'ACTIVE', permissions: ['MATTER_READ', 'DOCUMENT_READ', 'MESSAGE_READ', 'MESSAGE_SEND'], invitedById: ids.admin, activatedAt: new Date() } as any });
  });

  afterAll(async () => { setScanner(null); setMailSender(null); setQuarantineStore(null); await db.$disconnect(); });

  const ctx = () => resolveActiveCustomerGrant(ids.identity, ids.case, ids.workspace, db);

  it('draft request is hidden from the customer until published', async () => {
    const draft = await requests.createRequestDraft(internalActor, { caseId: ids.case, type: 'DATA_FORM', clientSafeTitle: 'Adatok', fields: [{ label: 'Név', type: 'SHORT_TEXT', required: true }] }, db);
    let visible = await requests.listCustomerRequests(await ctx(), db);
    expect(visible.items.find((r: any) => r.id === draft.id)).toBeUndefined();
    await requests.publishRequest(internalActor, draft.id, draft.revision, db);
    visible = await requests.listCustomerRequests(await ctx(), db);
    expect(visible.items.find((r: any) => r.id === draft.id)).toBeTruthy();
  });

  it('customer cannot see a request on a non-granted case (cross-case denial)', async () => {
    await expect(resolveActiveCustomerGrant(ids.identity, ids.otherCase, ids.workspace, db)).rejects.toMatchObject({ code: 'CLIENT_PORTAL_NO_ACTIVE_GRANT' });
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

  // --- "Jelzem, hogy nem áll rendelkezésre" — request-domain declaration ------
  const publishDocumentRequest = async (title: string, caseId = ids.case) => {
    const draft = await requests.createRequestDraft(internalActor, { caseId, type: 'DOCUMENT_UPLOAD', clientSafeTitle: title }, db);
    await requests.publishRequest(internalActor, draft.id, draft.revision, db);
    return draft;
  };

  it('declaration creates a canonical submission with reason + timestamp, without fake files/answers', async () => {
    const req = await publishDocumentRequest('Nem elérhető irat');
    const before = await db.clientSubmission.count({ where: { clientRequestId: req.id } });
    const threadsBefore = await db.clientQuestionThread.count({ where: { caseId: ids.case } });

    const declared = await submissions.declareUnavailable(await ctx(), req.id, { reasonSafe: 'A másik cégnél van.' }, db);

    expect(declared.status).toBe('SUBMITTED');
    expect(declared.unavailableDeclaredAt).toBeTruthy();
    expect(declared.unavailableReason).toBe('A másik cégnél van.');
    expect(declared.submittedAt).toBeTruthy();
    expect(declared.files).toHaveLength(0);
    expect(declared.fields).toHaveLength(0);
    expect(JSON.stringify(declared)).not.toMatch(/scanCodeSafe|storageProvider|reviewedById|quarantineStorageReference|customerUnavailableReasonSafe/);

    const rows = await db.clientSubmission.findMany({ where: { clientRequestId: req.id } });
    expect(rows).toHaveLength(before + 1);
    expect(rows[0].customerUnavailableDeclaredAt).toBeTruthy();
    expect(rows[0].customerUnavailableReasonSafe).toBe('A másik cégnél van.');
    expect(rows[0].submittedAt).toBeTruthy();

    // The declaration never completes the request and needs no message thread.
    const requestRow = await db.clientRequest.findUnique({ where: { id: req.id } });
    expect(requestRow!.status).toBe('PUBLISHED');
    expect(requestRow!.completedAt).toBeNull();
    expect(await db.clientQuestionThread.count({ where: { caseId: ids.case } })).toBe(threadsBefore);
  });

  it('declaration is idempotent and never silently overwrites the recorded reason', async () => {
    const req = await publishDocumentRequest('Idempotens jelzés');
    const first = await submissions.declareUnavailable(await ctx(), req.id, { reasonSafe: 'Első indok.' }, db);
    const second = await submissions.declareUnavailable(await ctx(), req.id, { reasonSafe: 'Második indok.' }, db);

    expect(second.id).toBe(first.id);
    expect(await db.clientSubmission.count({ where: { clientRequestId: req.id } })).toBe(1);
    const stored = await db.clientSubmission.findUnique({ where: { id: first.id } });
    expect(stored!.customerUnavailableReasonSafe).toBe('Első indok.');
  });

  it('declaration is visible in the existing internal submission review model', async () => {
    const req = await publishDocumentRequest('Belső láthatóság');
    const declared = await submissions.declareUnavailable(await ctx(), req.id, { reasonSafe: 'Belső ellenőrzéshez.' }, db);

    const list: any = await submissions.listSubmissionsInternal(internalActor, { requestId: req.id }, db);
    const row = list.items.find((item: any) => item.id === declared.id);
    expect(row).toBeTruthy();
    expect(row.customerUnavailableDeclaredAt).toBeTruthy();
    expect(row.customerUnavailableReasonSafe).toBe('Belső ellenőrzéshez.');

    const single: any = await submissions.getSubmissionInternal(internalActor, declared.id, db);
    expect(single.customerUnavailableDeclaredAt).toBeTruthy();
    expect(single.customerUnavailableReasonSafe).toBe('Belső ellenőrzéshez.');
  });

  it('correction may follow the declaration and a later normal submission clears it', async () => {
    const req = await publishDocumentRequest('Javítás a jelzés után');
    const declared = await submissions.declareUnavailable(await ctx(), req.id, { reasonSafe: 'Először nem volt elérhető.' }, db);
    const declaredRow = await db.clientSubmission.findUnique({ where: { id: declared.id } });

    await submissions.requestCorrection(internalActor, declared.id, { reasonSafe: 'Kérjük, ha mégis elérhető, töltse fel.', expectedRevision: declaredRow!.revision }, db);
    const reopened = await submissions.createDraftSubmission(await ctx(), req.id, db);
    expect(reopened.id).toBe(declared.id);

    const added = await submissions.addFile(await ctx(), reopened.id, { originalFileName: 'utolag.pdf', declaredMimeType: 'application/pdf', base64: pdf().toString('base64') }, db);
    expect(added.state).toBe('RECEIVED');
    const normal = await submissions.submitSubmission(await ctx(), reopened.id, { customerNote: 'Végül elérhető.' }, db);
    expect(normal.status).toBe('SUBMITTED');

    const cleared = await db.clientSubmission.findUnique({ where: { id: declared.id } });
    expect(cleared!.customerUnavailableDeclaredAt).toBeNull();
    expect(cleared!.customerUnavailableReasonSafe).toBeNull();
    expect(cleared!.submittedAt).toBeTruthy();
  });

  it('declaration cannot overwrite a normally submitted submission', async () => {
    const req = await publishDocumentRequest('Normál beküldés védelme');
    const sub = await submissions.createDraftSubmission(await ctx(), req.id, db);
    await submissions.addFile(await ctx(), sub.id, { originalFileName: 'n.pdf', declaredMimeType: 'application/pdf', base64: pdf().toString('base64') }, db);
    await submissions.submitSubmission(await ctx(), sub.id, {}, db);

    await expect(submissions.declareUnavailable(await ctx(), req.id, { reasonSafe: 'nem' }, db)).rejects.toMatchObject({ code: 'SUBMISSION_ALREADY_SUBMITTED' });
    const untouched = await db.clientSubmission.findUnique({ where: { id: sub.id } });
    expect(untouched!.customerUnavailableDeclaredAt).toBeNull();
    expect(untouched!.status).toBe('SUBMITTED');
  });

  it('declaration is denied on a terminal request and for foreign or unknown requests', async () => {
    const terminal = await publishDocumentRequest('Lezárt bekérés');
    const terminalRow = await db.clientRequest.findUnique({ where: { id: terminal.id } });
    await requests.completeRequest(internalActor, terminal.id, terminalRow!.revision, db);
    await expect(submissions.declareUnavailable(await ctx(), terminal.id, {}, db)).rejects.toMatchObject({ code: 'REQUEST_NOT_OPEN' });

    await expect(submissions.declareUnavailable(await ctx(), crypto.randomUUID(), {}, db)).rejects.toMatchObject({ code: 'REQUEST_NOT_FOUND' });

    const foreignCase = await publishDocumentRequest('Más ügy bekérése', ids.otherCase);
    await expect(submissions.declareUnavailable(await ctx(), foreignCase.id, {}, db)).rejects.toMatchObject({ code: 'REQUEST_NOT_FOUND' });
  });

  it('request detail and declaration work for ORGANIZATION and CASE_RELAY grants, and stay denied without a grant', async () => {
    const req = await publishDocumentRequest('Szervezeti bekérés');

    const makeWorkspace = async (mode: 'ORGANIZATION' | 'CASE_RELAY') => {
      const identityId = crypto.randomUUID();
      const workspaceId = crypto.randomUUID();
      await db.clientPortalIdentity.create({ data: { id: identityId, provider: 'ENTRA_EXTERNAL_ID', issuer: 'iss', subject: `sub-${identityId}`, normalizedEmail: `org-${identityId}@t.io`, emailVerifiedAt: new Date(), displayName: 'Org user', accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' } });
      await db.clientPortalWorkspace.create({ data: { id: workspaceId, clientId: ids.client, name: `WS ${mode}`, mode, publicReference: `ws-${workspaceId}`, createdById: ids.admin } });
      await db.clientPortalWorkspaceMembership.create({ data: { id: crypto.randomUUID(), clientPortalIdentityId: identityId, workspaceId, status: 'ACTIVE', approvedAt: new Date(), approvedById: ids.admin } });
      return { identityId, workspaceId };
    };
    const addGrant = async (identityId: string, workspaceId: string, caseId: string) =>
      db.clientPortalGrant.create({ data: { id: crypto.randomUUID(), clientPortalIdentityId: identityId, workspaceId, clientId: ids.client, caseId, status: 'ACTIVE', permissions: ['MATTER_READ', 'DOCUMENT_READ', 'MESSAGE_READ', 'MESSAGE_SEND'], invitedById: ids.admin, activatedAt: new Date() } as any });

    for (const mode of ['ORGANIZATION', 'CASE_RELAY'] as const) {
      const authorized = await makeWorkspace(mode);
      await addGrant(authorized.identityId, authorized.workspaceId, ids.case);
      const orgCtx = await resolveActiveCustomerGrant(authorized.identityId, ids.case, authorized.workspaceId, db);

      const detail = await requests.getCustomerRequest(orgCtx, req.id, db);
      expect(detail.id).toBe(req.id);
      expect(detail.title).toBe('Szervezeti bekérés');

      const declared = await submissions.declareUnavailable(orgCtx, req.id, { reasonSafe: `Nem elérhető (${mode}).` }, db);
      expect(declared.status).toBe('SUBMITTED');
      expect(declared.unavailableDeclaredAt).toBeTruthy();

      // same workspace mode, no grant -> denied
      const unauthorized = await makeWorkspace(mode);
      await expect(resolveActiveCustomerGrant(unauthorized.identityId, ids.case, unauthorized.workspaceId, db)).rejects.toMatchObject({ code: 'CLIENT_PORTAL_NO_ACTIVE_GRANT' });

      // granted on this case only -> a request from another case is denied
      const foreign = await publishDocumentRequest(`Idegen ügy (${mode})`, ids.otherCase);
      await expect(requests.getCustomerRequest(orgCtx, foreign.id, db)).rejects.toMatchObject({ code: 'REQUEST_NOT_FOUND' });
    }
  });
});



