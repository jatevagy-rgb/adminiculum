/**
 * BE_PORTAL_001 — portal request/submission notification outbox acceptance.
 *
 * Real-PostgreSQL verification of the three required intents and the outbox
 * contract:
 *  1. explicit request publish  -> one customer delivery intent
 *  2. customer submission done  -> one internal reviewer intent
 *  3. correction/request-changes-> one customer delivery intent
 * plus: idempotent retry, unavailable provider never SENT, fake provider SENT
 * once, transactional rollback leaves no orphan intent, restart picks pending
 * rows, cross-client isolation, and concurrent duplicates collapse to one.
 */
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import * as requests from '../src/modules/client-interaction/requestService';
import * as submissions from '../src/modules/client-interaction/submissionService';
import * as notifications from '../src/modules/client-interaction/notificationService';
import { resolveActiveCustomerGrant } from '../src/modules/client-interaction/base';
import { setMailSender, getMailSender } from '../src/modules/client-interaction/mailAdapter';

const databaseUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL || process.env.CLIENT_IDENTITY_TEST_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

describe('notification mailAdapter SMTP wiring (no database)', () => {
  afterEach(() => setMailSender(null));

  it('stays unconfigured (never SENT) without the SMTP credential set', () => {
    const sender = getMailSender({} as NodeJS.ProcessEnv);
    expect(sender.provider).toBe('NONE');
  });

  it('fails closed on a partial SMTP credential set', () => {
    const sender = getMailSender({ MAILBOX_TRANSACTIONAL_SMTP_HOST: 'smtp.example.com' } as NodeJS.ProcessEnv);
    expect(sender.provider).toBe('NONE');
  });

  it('wires the existing system SMTP provider when fully configured', () => {
    const sender = getMailSender({
      MAILBOX_TRANSACTIONAL_SMTP_HOST: 'smtp.example.com',
      MAILBOX_TRANSACTIONAL_SMTP_USER: 'noreply',
      MAILBOX_TRANSACTIONAL_SMTP_PASSWORD: 'secret',
      MAILBOX_TRANSACTIONAL_SMTP_FROM: 'noreply@example.com',
    } as NodeJS.ProcessEnv);
    expect(sender.provider).toBe('SMTP');
  });
});

d('BE_PORTAL_001 request/submission notification outbox (PostgreSQL)', () => {
  let db: PrismaClient;
  const ids = {
    admin: crypto.randomUUID(), reviewer: crypto.randomUUID(),
    client: crypto.randomUUID(), otherClient: crypto.randomUUID(),
    case: crypto.randomUUID(), otherCase: crypto.randomUUID(),
    identity: crypto.randomUUID(), otherIdentity: crypto.randomUUID(),
    grant: crypto.randomUUID(), otherGrant: crypto.randomUUID(),
    workspace: crypto.randomUUID(), workspaceMembership: crypto.randomUUID(),
    otherWorkspace: crypto.randomUUID(), otherWorkspaceMembership: crypto.randomUUID(),
  };
  const internalActor = { userId: ids.admin, role: 'ADMIN' };
  const sent: Array<{ to: string; idempotencyKey: string }> = [];

  const failSender = () => setMailSender(null);
  const captureSender = () => setMailSender({ provider: 'TEST', async send(m: any) { sent.push({ to: m.to, idempotencyKey: m.idempotencyKey }); return { providerMessageId: `msg-${sent.length}`, provider: 'TEST' }; } });

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    process.env.CLIENT_PORTAL_ACTIONS_ENABLED = 'true';
    for (const g of ['DOCUMENT_REQUESTS', 'DATA_REQUESTS', 'DOCUMENT_UPLOADS', 'EMAIL_NOTIFICATIONS']) process.env[`CLIENT_PORTAL_${g}_ENABLED`] = 'true';

    await db.user.create({ data: { id: ids.admin, email: `a-${ids.admin}@t.io`, name: 'Admin', role: 'ADMIN', status: 'ACTIVE' } as any });
    await db.user.create({ data: { id: ids.reviewer, email: `r-${ids.reviewer}@t.io`, name: 'Reviewer', role: 'LAWYER', status: 'ACTIVE' } as any });
    await db.client.create({ data: { id: ids.client, name: 'Outbox Client' } });
    await db.client.create({ data: { id: ids.otherClient, name: 'Other Outbox Client' } });
    await db.case.create({ data: { id: ids.case, caseNumber: `OB-${ids.case.slice(0, 6)}`, title: 'Outbox case', caseType: 'CONTRACT_REVIEW', clientId: ids.client, createdById: ids.admin, assignedLawyerId: ids.reviewer } as any });
    await db.case.create({ data: { id: ids.otherCase, caseNumber: `OC-${ids.otherCase.slice(0, 6)}`, title: 'Other outbox case', caseType: 'CONTRACT_REVIEW', clientId: ids.otherClient, createdById: ids.admin, assignedLawyerId: ids.reviewer } as any });
    await db.clientPortalIdentity.create({ data: { id: ids.identity, provider: 'ENTRA_EXTERNAL_ID', issuer: 'iss', subject: `sub-${ids.identity}`, normalizedEmail: `c-${ids.identity}@t.io`, emailVerifiedAt: new Date(), displayName: 'Customer', accountType: 'INDIVIDUAL', status: 'ACTIVE' } });
    await db.clientPortalIdentity.create({ data: { id: ids.otherIdentity, provider: 'ENTRA_EXTERNAL_ID', issuer: 'iss', subject: `sub-${ids.otherIdentity}`, normalizedEmail: `o-${ids.otherIdentity}@t.io`, emailVerifiedAt: new Date(), displayName: 'Other Customer', accountType: 'INDIVIDUAL', status: 'ACTIVE' } });
    await db.clientPortalWorkspace.create({ data: { id: ids.workspace, clientId: ids.client, name: 'Outbox workspace', mode: 'INDIVIDUAL', publicReference: `outbox-${ids.workspace}`, createdById: ids.admin } });
    await db.clientPortalWorkspaceMembership.create({ data: { id: ids.workspaceMembership, clientPortalIdentityId: ids.identity, workspaceId: ids.workspace, status: 'ACTIVE', approvedAt: new Date(), approvedById: ids.admin } });
    await db.clientPortalWorkspace.create({ data: { id: ids.otherWorkspace, clientId: ids.otherClient, name: 'Other outbox workspace', mode: 'INDIVIDUAL', publicReference: `outbox-${ids.otherWorkspace}`, createdById: ids.admin } });
    await db.clientPortalWorkspaceMembership.create({ data: { id: ids.otherWorkspaceMembership, clientPortalIdentityId: ids.otherIdentity, workspaceId: ids.otherWorkspace, status: 'ACTIVE', approvedAt: new Date(), approvedById: ids.admin } });
    await db.clientPortalGrant.create({ data: { id: ids.grant, clientPortalIdentityId: ids.identity, workspaceId: ids.workspace, clientId: ids.client, caseId: ids.case, status: 'ACTIVE', permissions: ['MATTER_READ', 'DOCUMENT_READ', 'MESSAGE_READ', 'MESSAGE_SEND'], invitedById: ids.admin, activatedAt: new Date() } as any });
    await db.clientPortalGrant.create({ data: { id: ids.otherGrant, clientPortalIdentityId: ids.otherIdentity, workspaceId: ids.otherWorkspace, clientId: ids.otherClient, caseId: ids.otherCase, status: 'ACTIVE', permissions: ['MATTER_READ', 'DOCUMENT_READ', 'MESSAGE_READ', 'MESSAGE_SEND'], invitedById: ids.admin, activatedAt: new Date() } as any });
  });

  afterAll(async () => { setMailSender(null); await db.$disconnect(); });

  const ctx = () => resolveActiveCustomerGrant(ids.identity, ids.case, ids.workspace, db);

  const publishDataRequest = async (title: string) => {
    const draft = await requests.createRequestDraft(internalActor, { caseId: ids.case, type: 'DATA_FORM', clientSafeTitle: title, assignedInternalUserId: ids.reviewer, fields: [{ label: 'Név', type: 'SHORT_TEXT', required: true }] }, db);
    await requests.publishRequest(internalActor, draft.id, draft.revision, db);
    return draft;
  };

  // --- 1. Explicit publish -> one customer delivery intent -------------------
  it('publish once -> exactly one customer delivery intent', async () => {
    const draft = await requests.createRequestDraft(internalActor, { caseId: ids.case, type: 'DATA_FORM', clientSafeTitle: 'Publish intent' }, db);
    await requests.publishRequest(internalActor, draft.id, draft.revision, db);
    const rows = await db.clientNotificationDelivery.findMany({ where: { idempotencyKey: `request-published:${draft.id}` } });
    expect(rows).toHaveLength(1);
    expect(rows[0].eventType).toBe('REQUEST_PUBLISHED');
    expect(rows[0].clientId).toBe(ids.client);
    expect((rows[0].recipientSnapshot as any).email).toBe(`c-${ids.identity}@t.io`);
    expect(rows[0].status).toBe('PENDING');
  });

  it('cross-client isolation: a publish only intends the granted client identities', async () => {
    const draft = await requests.createRequestDraft(internalActor, { caseId: ids.case, type: 'DATA_FORM', clientSafeTitle: 'Isolation publish' }, db);
    await requests.publishRequest(internalActor, draft.id, draft.revision, db);
    const rows = await db.clientNotificationDelivery.findMany({ where: { idempotencyKey: `request-published:${draft.id}` } });
    const emails = rows.map((row) => (row.recipientSnapshot as any).email);
    expect(emails).toContain(`c-${ids.identity}@t.io`);
    expect(emails).not.toContain(`o-${ids.otherIdentity}@t.io`);
    expect(rows.every((row) => row.clientId === ids.client)).toBe(true);
  });

  it('concurrent duplicate publish collapses to one state transition and one intent', async () => {
    const draft = await requests.createRequestDraft(internalActor, { caseId: ids.case, type: 'DATA_FORM', clientSafeTitle: 'Race publish' }, db);
    const results = await Promise.allSettled([
      requests.publishRequest(internalActor, draft.id, draft.revision, db),
      requests.publishRequest(internalActor, draft.id, draft.revision, db),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);
    expect(await db.clientNotificationDelivery.count({ where: { idempotencyKey: `request-published:${draft.id}` } })).toBe(1);
    expect((await db.clientRequest.findUnique({ where: { id: draft.id } }))!.status).toBe('PUBLISHED');
  });

  // --- 2. Customer submission completed -> one internal intent ----------------
  it('customer submit -> exactly one internal reviewer intent', async () => {
    const req = await publishDataRequest('Submit intent');
    const sub = await submissions.createDraftSubmission(await ctx(), req.id, db);
    await submissions.addStructuredAnswers(await ctx(), sub.id, [{ label: 'Név', value: 'Teszt Elek' }], db);
    await submissions.submitSubmission(await ctx(), sub.id, {}, db);

    const notificationsForReviewer = await db.notification.findMany({ where: { userId: ids.reviewer, type: 'REVIEW_REQUESTED' } });
    const mine = notificationsForReviewer.filter((n) => n.link?.includes(`submission=${sub.id}`));
    expect(mine).toHaveLength(1);
    expect(mine[0].message).toContain('Submit intent');
    expect(mine[0].message).not.toContain('Teszt Elek');
    // no raw internal notes or review rationale leak into the message/link
    expect(JSON.stringify(mine[0])).not.toMatch(/internalTriageNote|correctionReasonSafe|reviewedById/);
  });

  it('concurrent duplicate submit -> one internal intent', async () => {
    const req = await publishDataRequest('Race submit');
    const sub = await submissions.createDraftSubmission(await ctx(), req.id, db);
    await submissions.addStructuredAnswers(await ctx(), sub.id, [{ label: 'Név', value: 'Párhuzamos' }], db);
    const results = await Promise.allSettled([
      submissions.submitSubmission(await ctx(), sub.id, {}, db),
      submissions.submitSubmission(await ctx(), sub.id, {}, db),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected' && String((r as any).reason?.code) === 'SUBMISSION_NOT_SUBMITTABLE')).toHaveLength(1);
    const mine = await db.notification.findMany({ where: { userId: ids.reviewer, type: 'REVIEW_REQUESTED', link: { contains: `submission=${sub.id}` } } });
    expect(mine).toHaveLength(1);
  });

  it('a stale assigned reviewer can never fail the submission (intent skipped truthfully)', async () => {
    // Canonical schema: assignedInternalUserId has FK ON DELETE SET NULL, so the
    // schema-valid stale reviewer is a user deleted after assignment.
    const staleReviewerId = crypto.randomUUID();
    await db.user.create({ data: { id: staleReviewerId, email: `s-${staleReviewerId}@t.io`, name: 'Stale Reviewer', role: 'LAWYER', status: 'ACTIVE' } as any });
    const req = await requests.createRequestDraft(internalActor, { caseId: ids.case, type: 'DATA_FORM', clientSafeTitle: 'Stale assignee', assignedInternalUserId: staleReviewerId, fields: [{ label: 'Név', type: 'SHORT_TEXT', required: true }] }, db);
    await db.user.delete({ where: { id: staleReviewerId } });
    await requests.publishRequest(internalActor, req.id, req.revision, db);
    const sub = await submissions.createDraftSubmission(await ctx(), req.id, db);
    await submissions.addStructuredAnswers(await ctx(), sub.id, [{ label: 'Név', value: 'Kiadó' }], db);
    const submitted = await submissions.submitSubmission(await ctx(), sub.id, {}, db);
    expect(submitted.status).toBe('SUBMITTED');
    // Fallback to the case responsible lawyer (assignedLawyerId = reviewer).
    const mine = await db.notification.findMany({ where: { userId: ids.reviewer, type: 'REVIEW_REQUESTED', link: { contains: `submission=${sub.id}` } } });
    expect(mine).toHaveLength(1);
  });

  it('unavailable declaration -> one internal intent, idempotent on repeat', async () => {
    const req = await publishDataRequest('Declaration intent');
    const declared = await submissions.declareUnavailable(await ctx(), req.id, { reasonSafe: 'Nem áll rendelkezésre.' }, db);
    await submissions.declareUnavailable(await ctx(), req.id, { reasonSafe: 'Újra.' }, db);
    const exact = await db.notification.findMany({ where: { userId: ids.reviewer, type: 'REVIEW_REQUESTED', link: `/cases/${ids.case}?submission=${declared.id}&revision=1` } });
    expect(exact).toHaveLength(1);
  });

  // --- 3. Correction -> one customer delivery intent -------------------------
  it('correction -> exactly one customer delivery intent, idempotent by domain revision', async () => {
    const req = await publishDataRequest('Correction intent');
    const sub = await submissions.createDraftSubmission(await ctx(), req.id, db);
    await submissions.addStructuredAnswers(await ctx(), sub.id, [{ label: 'Név', value: 'Első kör' }], db);
    await submissions.submitSubmission(await ctx(), sub.id, {}, db);
    const submittedRow = await db.clientSubmission.findUnique({ where: { id: sub.id } });

    await submissions.requestCorrection(internalActor, sub.id, { reasonSafe: 'Javítást kérünk.', expectedRevision: submittedRow!.revision }, db);
    const rows = await db.clientNotificationDelivery.findMany({ where: { idempotencyKey: { startsWith: `request-correction:${sub.id}:` } } });
    expect(rows).toHaveLength(1);
    expect(rows[0].eventType).toBe('CORRECTION_REQUESTED');
    expect((rows[0].recipientSnapshot as any).email).toBe(`c-${ids.identity}@t.io`);
    expect(rows[0].idempotencyKey).toBe(`request-correction:${sub.id}:2`);
  });

  it('concurrent duplicate correction -> one customer intent', async () => {
    const req = await publishDataRequest('Race correction');
    const sub = await submissions.createDraftSubmission(await ctx(), req.id, db);
    await submissions.addStructuredAnswers(await ctx(), sub.id, [{ label: 'Név', value: 'Kör' }], db);
    await submissions.submitSubmission(await ctx(), sub.id, {}, db);
    const submittedRow = await db.clientSubmission.findUnique({ where: { id: sub.id } });

    const results = await Promise.allSettled([
      submissions.requestCorrection(internalActor, sub.id, { reasonSafe: 'Egy.', expectedRevision: submittedRow!.revision }, db),
      submissions.requestCorrection(internalActor, sub.id, { reasonSafe: 'Kettő.', expectedRevision: submittedRow!.revision }, db),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.clientNotificationDelivery.count({ where: { idempotencyKey: { startsWith: `request-correction:${sub.id}:` } } })).toBe(1);
  });

  // --- Outbox delivery contract ----------------------------------------------
  it('unavailable provider -> retryable, never SENT', async () => {
    failSender();
    const key = `no-provider-${crypto.randomUUID()}`;
    const delivery = await notifications.enqueueNotification({ eventType: 'REQUEST_PUBLISHED', clientId: ids.client, caseId: ids.case, recipientEmail: 'r@t.io', subjectSafe: 's', createdById: ids.admin, idempotencyKey: key }, db);
    const result = await notifications.processDelivery(delivery.id, db);
    expect(result.status).toBe('FAILED_RETRYABLE');
    expect(result.codeSafe).toBe('MAIL_PROVIDER_NOT_CONFIGURED');
    const row = await db.clientNotificationDelivery.findUnique({ where: { id: delivery.id } });
    expect(row!.status).not.toBe('SENT');
    expect(row!.nextAttemptAt).toBeTruthy();
  });

  it('fake provider success -> SENT exactly once; repeated process is idempotent', async () => {
    captureSender();
    const before = sent.length;
    const key = `sent-once-${crypto.randomUUID()}`;
    const delivery = await notifications.enqueueNotification({ eventType: 'REQUEST_PUBLISHED', clientId: ids.client, caseId: ids.case, recipientEmail: 'r@t.io', subjectSafe: 's', createdById: ids.admin, idempotencyKey: key }, db);
    await notifications.processDelivery(delivery.id, db);
    await notifications.processDelivery(delivery.id, db);
    expect(sent.length).toBe(before + 1);
    expect((await db.clientNotificationDelivery.findUnique({ where: { id: delivery.id } }))!.status).toBe('SENT');
  });

  it('transaction rollback leaves no orphan intent', async () => {
    const key = `rollback-${crypto.randomUUID()}`;
    await expect(db.$transaction(async (tx) => {
      await notifications.enqueueNotification({ eventType: 'REQUEST_PUBLISHED', clientId: ids.client, caseId: ids.case, recipientEmail: 'r@t.io', subjectSafe: 's', createdById: ids.admin, idempotencyKey: key }, tx as any);
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(await db.clientNotificationDelivery.count({ where: { idempotencyKey: key } })).toBe(0);
  });

  it('restart picks pending rows: due deliveries are claimed and sent exactly once', async () => {
    captureSender();
    // Retire every other open intent so the sweep is scoped to this test's row.
    await db.clientNotificationDelivery.updateMany({ where: { status: { in: ['PENDING', 'FAILED_RETRYABLE', 'SENDING'] } }, data: { status: 'CANCELLED', nextAttemptAt: null } });
    const before = sent.length;
    const key = `restart-${crypto.randomUUID()}`;
    const delivery = await notifications.enqueueNotification({ eventType: 'REQUEST_PUBLISHED', clientId: ids.client, caseId: ids.case, recipientEmail: 'r@t.io', subjectSafe: 's', createdById: ids.admin, idempotencyKey: key }, db);
    await db.clientNotificationDelivery.update({ where: { id: delivery.id }, data: { nextAttemptAt: new Date(Date.now() - 60_000) } });
    const run = await notifications.runDueDeliveriesOnce(10, db);
    expect(run.processed).toBe(1);
    expect(run.sent).toBe(1);
    expect(sent.length).toBe(before + 1);
    // A second sweep finds nothing due and never re-sends.
    const again = await notifications.runDueDeliveriesOnce(10, db);
    expect(again.processed).toBe(0);
    expect(sent.length).toBe(before + 1);
  });

  it('concurrent claims of the same due row collapse to one claim', async () => {
    captureSender();
    await db.clientNotificationDelivery.updateMany({ where: { status: { in: ['PENDING', 'FAILED_RETRYABLE', 'SENDING'] } }, data: { status: 'CANCELLED', nextAttemptAt: null } });
    const key = `claim-race-${crypto.randomUUID()}`;
    const delivery = await notifications.enqueueNotification({ eventType: 'REQUEST_PUBLISHED', clientId: ids.client, caseId: ids.case, recipientEmail: 'r@t.io', subjectSafe: 's', createdById: ids.admin, idempotencyKey: key }, db);
    await db.clientNotificationDelivery.update({ where: { id: delivery.id }, data: { nextAttemptAt: new Date(Date.now() - 60_000) } });
    const claims = await Promise.all([notifications.claimDueDelivery(db), notifications.claimDueDelivery(db)]);
    const claimedIds = claims.filter(Boolean).map((c) => c!.id);
    expect(claimedIds.filter((id) => id === delivery.id)).toHaveLength(1);
    // clean up the claimed row so it cannot disturb later tests
    await db.clientNotificationDelivery.update({ where: { id: delivery.id }, data: { status: 'SENT', nextAttemptAt: null } });
  });

  it('failed delivery is retryable via the worker path with provider restored later', async () => {
    failSender();
    const key = `later-provider-${crypto.randomUUID()}`;
    const delivery = await notifications.enqueueNotification({ eventType: 'REQUEST_PUBLISHED', clientId: ids.client, caseId: ids.case, recipientEmail: 'r@t.io', subjectSafe: 's', createdById: ids.admin, idempotencyKey: key }, db);
    await notifications.processDelivery(delivery.id, db);
    let row = await db.clientNotificationDelivery.findUnique({ where: { id: delivery.id } });
    expect(row!.status).toBe('FAILED_RETRYABLE');

    // Provider becomes available later; due retry delivers the held intent.
    captureSender();
    await db.clientNotificationDelivery.updateMany({ where: { status: { in: ['PENDING', 'FAILED_RETRYABLE', 'SENDING'] }, id: { not: delivery.id } }, data: { status: 'CANCELLED', nextAttemptAt: null } });
    const before = sent.length;
    await db.clientNotificationDelivery.update({ where: { id: delivery.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    await notifications.runDueDeliveriesOnce(10, db);
    row = await db.clientNotificationDelivery.findUnique({ where: { id: delivery.id } });
    expect(row!.status).toBe('SENT');
    expect(sent.length).toBe(before + 1);
  });
});
