import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  createIntakeDraft,
  getOwnIntake,
  listOwnIntakes,
  respondToMoreInformation,
  submitIntake,
  updateIntakeDraft,
  withdrawIntake,
} from '../src/modules/client-workspace/intakeService';
import {
  approveIntakeRequesterAccess,
  convertIntakeToNewCase,
  declineIntake,
  getIntakeTriageDetail,
  linkIntakeToExistingCase,
  listIntakeQueue,
  publishIntakeSnapshot,
  requestMoreInformation,
  startIntakeTriage,
} from '../src/modules/client-workspace/intakeTriageService';
import { addIntakeAttachment } from '../src/modules/client-workspace/intakeAttachmentService';

const databaseUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('CP1 intake and triage backend (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  const otherClientId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const individualWorkspaceId = crypto.randomUUID();
  const relayWorkspaceId = crypto.randomUUID();
  const otherWorkspaceId = crypto.randomUUID();
  const hrGroupId = crypto.randomUUID();
  const financeGroupId = crypto.randomUUID();
  const otherGroupId = crypto.randomUUID();
  const alexandraId = crypto.randomUUID();
  const belaId = crypto.randomUUID();
  const alexandraMembershipId = crypto.randomUUID();
  const belaMembershipId = crypto.randomUUID();
  const admin = { userId: adminId, role: 'ADMIN' };

  async function draft(subject = 'HR munkajogi kérdés') {
    return createIntakeDraft(alexandraId, workspaceId, { organizationGroupId: hrGroupId, subject, description: 'Ügyfél által megadott biztonságos leírás.', urgency: 'HIGH', requestedDeadline: '2026-09-15' }, db as any);
  }

  async function submitted(subject?: string) {
    const created: any = await draft(subject);
    return submitIntake(alexandraId, workspaceId, created.reference, undefined, db as any) as any;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.CLIENT_PORTAL_ACTIONS_ENABLED = 'true';
    process.env.CLIENT_PORTAL_ORGANIZATIONAL_INTAKE_ENABLED = 'true';
    process.env.CLIENT_PORTAL_DATA_REQUESTS_ENABLED = 'true';
    process.env.CLIENT_PORTAL_DOCUMENT_UPLOADS_ENABLED = 'true';
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.create({ data: { id: adminId, email: `cp1-admin-${suffix}@test.invalid`, name: 'CP1 Admin', role: 'ADMIN', status: 'ACTIVE' } as never });
    await db.client.createMany({ data: [{ id: clientId, name: `CP1 Client ${suffix}` }, { id: otherClientId, name: `CP1 Other ${suffix}` }] });
    await db.clientPortalWorkspace.createMany({ data: [
      { id: workspaceId, clientId, name: 'Organization', mode: 'ORGANIZATION', publicReference: `org-${suffix}`, createdById: adminId },
      { id: individualWorkspaceId, clientId, name: 'Individual', mode: 'INDIVIDUAL', publicReference: `ind-${suffix}`, createdById: adminId },
      { id: relayWorkspaceId, clientId, name: 'Relay', mode: 'CASE_RELAY', publicReference: `relay-${suffix}`, createdById: adminId },
      { id: otherWorkspaceId, clientId: otherClientId, name: 'Other', mode: 'ORGANIZATION', publicReference: `other-${suffix}`, createdById: adminId },
    ] as never });
    await db.clientOrganizationGroup.createMany({ data: [
      { id: hrGroupId, clientId, workspaceId, name: `HR ${suffix}`, createdById: adminId },
      { id: financeGroupId, clientId, workspaceId, name: `Finance ${suffix}`, createdById: adminId },
      { id: otherGroupId, clientId: otherClientId, workspaceId: otherWorkspaceId, name: `Other ${suffix}`, createdById: adminId },
    ] });
    await db.clientPortalIdentity.createMany({ data: [
      { id: alexandraId, provider: 'ENTRA_EXTERNAL_ID', issuer: `iss-${suffix}`, subject: 'alexandra', normalizedEmail: `alexandra-${suffix}@test.invalid`, emailVerifiedAt: new Date(), displayName: 'Alexandra', accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' },
      { id: belaId, provider: 'ENTRA_EXTERNAL_ID', issuer: `iss-${suffix}`, subject: 'bela', normalizedEmail: `bela-${suffix}@test.invalid`, emailVerifiedAt: new Date(), displayName: 'Béla', accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' },
    ] });
    await db.clientPortalWorkspaceMembership.createMany({ data: [
      { id: alexandraMembershipId, clientPortalIdentityId: alexandraId, workspaceId, status: 'ACTIVE', approvedAt: new Date(), approvedById: adminId },
      { id: belaMembershipId, clientPortalIdentityId: belaId, workspaceId, status: 'ACTIVE', approvedAt: new Date(), approvedById: adminId },
    ] });
    await db.clientOrganizationMembership.createMany({ data: [
      { clientPortalIdentityId: alexandraId, clientId, groupId: hrGroupId, status: 'ACTIVE', approvedFromRequestId: crypto.randomUUID(), approvedById: adminId, approvedAt: new Date() },
      { clientPortalIdentityId: belaId, clientId, groupId: financeGroupId, status: 'ACTIVE', approvedFromRequestId: crypto.randomUUID(), approvedById: adminId, approvedAt: new Date() },
    ] });
  });

  afterAll(async () => { await db.$disconnect(); });

  it('customer draft, update, submit, pagination and allowlisted detail create no Case/grant/publication', async () => {
    const before = { cases: await db.case.count(), grants: await db.clientPortalGrant.count(), publications: await db.clientMatterPublication.count() };
    const created: any = await draft();
    const browserPayloadDraft: any = await createIntakeDraft(alexandraId, workspaceId, { organizationGroupId: hrGroupId, subject: 'Browser payload draft', descriptionSafe: 'A deployed UI descriptionSafe payloadja.', urgency: 'NORMAL' }, db as any);
    expect(browserPayloadDraft.description).toBe('A deployed UI descriptionSafe payloadja.');
    const browserPayloadUpdated: any = await updateIntakeDraft(alexandraId, workspaceId, browserPayloadDraft.reference, { descriptionSafe: 'Frissített descriptionSafe payload.', expectedRevision: 0 }, db as any);
    expect(browserPayloadUpdated.description).toBe('Frissített descriptionSafe payload.');
    const updated: any = await updateIntakeDraft(alexandraId, workspaceId, created.reference, { subject: 'Frissített HR kérdés', expectedRevision: 0 }, db as any);
    expect(updated.subject).toBe('Frissített HR kérdés');
    const sent: any = await submitIntake(alexandraId, workspaceId, created.reference, undefined, db as any);
    expect(sent.status.code).toBe('submitted');
    const list = await listOwnIntakes(alexandraId, workspaceId, { limit: 1, offset: 0 }, db as any);
    expect(list.total).toBeGreaterThanOrEqual(1);
    const detail: any = await getOwnIntake(alexandraId, workspaceId, created.reference, db as any);
    const serialized = JSON.stringify(detail);
    for (const forbidden of ['workspaceId', 'clientId', 'requesterMembershipId', 'linkedCaseId', 'internalTriageNote', 'triagedByInternalUserId', 'permissions', 'storageProvider', 'quarantineStorageReference']) expect(serialized).not.toContain(forbidden);
    expect(await db.case.count()).toBe(before.cases);
    expect(await db.clientPortalGrant.count()).toBe(before.grants);
    expect(await db.clientMatterPublication.count()).toBe(before.publications);
  });

  it('ownership, unit, workspace mode and server-field boundaries deny access', async () => {
    const created: any = await draft('Elhatárolási teszt');
    await expect(getOwnIntake(belaId, workspaceId, created.reference, db as any)).rejects.toMatchObject({ code: 'INTAKE_NOT_FOUND' });
    await expect(createIntakeDraft(alexandraId, workspaceId, { organizationGroupId: financeGroupId, subject: 'x', description: 'y' }, db as any)).rejects.toMatchObject({ code: 'CLIENT_UNIT_NOT_REFERENCEABLE' });
    await expect(createIntakeDraft(alexandraId, workspaceId, { organizationGroupId: otherGroupId, subject: 'x', description: 'y' }, db as any)).rejects.toMatchObject({ code: 'CLIENT_UNIT_NOT_REFERENCEABLE' });
    await expect(createIntakeDraft(alexandraId, individualWorkspaceId, { organizationGroupId: hrGroupId, subject: 'x', description: 'y' }, db as any)).rejects.toMatchObject({ code: 'CLIENT_WORKSPACE_NOT_ORGANIZATION' });
    await expect(createIntakeDraft(alexandraId, relayWorkspaceId, { organizationGroupId: hrGroupId, subject: 'x', description: 'y' }, db as any)).rejects.toMatchObject({ code: 'CLIENT_WORKSPACE_NOT_ORGANIZATION' });
    for (const field of ['workspaceId', 'clientId', 'requesterMembershipId', 'linkedCaseId', 'participantRole', 'permissions', 'status', 'internalTriageNote']) {
      await expect(createIntakeDraft(alexandraId, workspaceId, { organizationGroupId: hrGroupId, subject: 'x', description: 'y', [field]: 'forbidden' }, db as any)).rejects.toMatchObject({ code: 'INTAKE_FIELD_NOT_ALLOWED' });
    }
  });

  it('withdraw and revoked/suspended membership boundaries are enforced', async () => {
    const created: any = await draft('Visszavonható');
    const withdrawn: any = await withdrawIntake(alexandraId, workspaceId, created.reference, undefined, db as any);
    expect(withdrawn.status.code).toBe('withdrawn');
    await db.clientPortalWorkspaceMembership.update({ where: { id: alexandraMembershipId }, data: { status: 'SUSPENDED' } });
    await expect(listOwnIntakes(alexandraId, workspaceId, {}, db as any)).rejects.toMatchObject({ code: 'CLIENT_WORKSPACE_MEMBERSHIP_REQUIRED' });
    await db.clientPortalWorkspaceMembership.update({ where: { id: alexandraMembershipId }, data: { status: 'ACTIVE' } });
  });

  it('unconfigured quarantine/scanner never yields CLEAN or a Case Document', async () => {
    const created: any = await draft('Biztonságos csatolmány');
    const beforeDocuments = await db.document.count();
    const result = await addIntakeAttachment(alexandraId, workspaceId, created.reference, { originalFileName: 'proof.pdf', declaredMimeType: 'application/pdf', base64: Buffer.from('%PDF-1').toString('base64') }, db as any);
    expect(result.state).toBe('processing-unavailable');
    const attachment = await db.clientPortalIntakeAttachment.findUnique({ where: { id: result.reference } });
    expect(attachment?.status).not.toBe('CLEAN');
    expect(await db.document.count()).toBe(beforeDocuments);
    const dto = JSON.stringify(await getOwnIntake(alexandraId, workspaceId, created.reference, db as any));
    expect(dto).not.toContain('QUARANTINE_NOT_CONFIGURED');
    expect(dto).not.toContain('SCAN_FAILED');
  });

  it('workforce queue, triage, more-information and reused submission return to triage', async () => {
    const sent: any = await submitted('További adatot igényel');
    const queue = await listIntakeQueue(admin, { workspaceId, status: 'SUBMITTED', limit: 5 }, db as any);
    expect(queue.items.some((item) => item.id === sent.reference)).toBe(true);
    await startIntakeTriage(admin, sent.reference, undefined, db as any);
    const requested: any = await requestMoreInformation(admin, sent.reference, { title: 'További információ', instructions: 'Kérjük, írja le a releváns körülményt.', fields: [{ type: 'LONG_TEXT', label: 'Körülmény', required: true, maxLength: 1000 }] }, db as any);
    const detail: any = await getOwnIntake(alexandraId, workspaceId, sent.reference, db as any);
    expect(detail.status.code).toBe('more-information-required');
    await respondToMoreInformation(alexandraId, workspaceId, sent.reference, { requestId: requested.request.id, answers: [{ fieldId: requested.request.fields[0].id, value: 'Biztonságos ügyfélválasz.' }] }, db as any);
    expect((await db.clientPortalIntakeRequest.findUnique({ where: { id: sent.reference } }))?.status).toBe('TRIAGE_IN_PROGRESS');
    expect(await db.clientSubmission.count({ where: { clientRequestId: requested.request.id, caseId: null } })).toBe(1);
  });

  it('workforce decline is terminal and customer-safe', async () => {
    const sent: any = await submitted('Elutasítandó');
    const declined = await declineIntake(admin, sent.reference, { customerResponse: 'Ezt a kérelmet jelenleg nem tudjuk vállalni.' }, db as any);
    expect(declined.status).toBe('DECLINED');
    await expect(startIntakeTriage(admin, sent.reference, undefined, db as any)).rejects.toMatchObject({ code: 'INVALID_INTAKE_TRANSITION' });
  });

  it('linking alone exposes neither Case access nor publication; explicit grant and publication are separate', async () => {
    const existingCase = await db.case.create({ data: { caseNumber: `CP1-LINK-${suffix}`, title: 'Internal existing', caseType: 'OTHER', clientId, createdById: adminId, assignedLawyerId: adminId } as never });
    const sent: any = await submitted('Meglévő ügyhöz');
    const linked: any = await linkIntakeToExistingCase(admin, sent.reference, { caseId: existingCase.id, createRequesterAccess: false, publishInitialSnapshot: false }, db as any);
    expect(linked.status).toBe('LINKED_TO_EXISTING_CASE');
    expect(await db.clientPortalGrant.count({ where: { caseId: existingCase.id, clientPortalIdentityId: alexandraId } })).toBe(0);
    expect(await db.clientMatterPublication.count({ where: { caseId: existingCase.id, workspaceId } })).toBe(0);
    const access: any = await approveIntakeRequesterAccess(admin, sent.reference, ['MATTER_READ', 'UPDATE_READ'], db as any);
    expect(access.grant.participantRole).toBe('REQUESTER');
    expect(access.grant.permissions.sort()).toEqual(['MATTER_READ', 'UPDATE_READ']);
    const published: any = await publishIntakeSnapshot(admin, sent.reference, { publicTitle: 'Publikus ügy', publicStatus: 'Folyamatban', currentPosition: 'Most itt tartunk.', waitingOn: 'Az iroda következő lépésére.', nextStep: 'Első nyilvános lépés.', publicTargetDate: '2026-10-01', safeUpdate: { title: 'Megnyitva' } }, db as any);
    expect(published.publication.status).toBe('PUBLISHED');
    const customer: any = await getOwnIntake(alexandraId, workspaceId, sent.reference, db as any);
    expect(customer.linkedPublicCaseReference).toBe(existingCase.caseNumber);
    expect(customer.linkedMatterPublicationId).toBe(published.publication.id);
    await db.case.update({ where: { id: existingCase.id }, data: { title: 'Changed internal title' } });
    const revision = await db.clientMatterPublicationRevision.findUnique({ where: { id: published.publication.currentRevisionId } });
    expect(revision?.clientSafeTitle).toBe('Publikus ügy');
  });

  it('combined new-Case conversion is atomic, idempotent and creates one explicit requester audience', async () => {
    const sent: any = await submitted('Új ügy konverzió');
    const input = { newCase: { title: `CP1 converted ${suffix}`, matterType: 'OTHER', assignedLawyerId: adminId }, createRequesterAccess: true, participantRole: 'REQUESTER', permissions: ['MATTER_READ', 'UPDATE_READ'], publishInitialSnapshot: true, publication: { publicTitle: 'Új publikus ügy', publicStatus: 'Indulás', currentPosition: 'A kérelem befogadva.', waitingOn: 'Belső feldolgozás.', nextStep: 'Kapcsolatfelvétel.' } };
    const first: any = await convertIntakeToNewCase(admin, sent.reference, input, db as any);
    const second: any = await convertIntakeToNewCase(admin, sent.reference, input, db as any);
    expect(second.idempotent).toBe(true);
    expect(second.case.id).toBe(first.case.id);
    expect(second.grant.id).toBe(first.grant.id);
    expect(second.publication.id).toBe(first.publication.id);
    expect(await db.case.count({ where: { id: first.case.id } })).toBe(1);
    expect(await db.clientNotificationDelivery.count({ where: { intakeRequestId: sent.reference } })).toBe(1);
    const history = await getIntakeTriageDetail(admin, sent.reference, db as any);
    expect(history.history.some((event) => event.action === 'INTAKE_CONVERTED')).toBe(true);
  });

  it('concurrent equivalent conversion converges on one Case', async () => {
    const sent: any = await submitted('Concurrent conversion');
    const input = { newCase: { title: `CP1 concurrent ${suffix}`, matterType: 'OTHER', assignedLawyerId: adminId }, createRequesterAccess: false, publishInitialSnapshot: false };
    const results = await Promise.all([convertIntakeToNewCase(admin, sent.reference, input, db as any), convertIntakeToNewCase(admin, sent.reference, input, db as any)]);
    expect(results[0].case.id).toBe(results[1].case.id);
    const row = await db.clientPortalIntakeRequest.findUnique({ where: { id: sent.reference } });
    expect(await db.case.count({ where: { id: row!.linkedCaseId! } })).toBe(1);
  });

  it('incompatible retry is 409 and publication failure rolls back Case/grant/intake linkage', async () => {
    const sent: any = await submitted('Rollback conversion');
    const title = `CP1 rollback ${suffix}`;
    await expect(convertIntakeToNewCase(admin, sent.reference, { newCase: { title, matterType: 'OTHER', assignedLawyerId: adminId }, createRequesterAccess: true, participantRole: 'REQUESTER', permissions: ['MATTER_READ'], publishInitialSnapshot: true, publication: { publicStatus: 'Missing title' } }, db as any)).rejects.toMatchObject({ code: 'FIELD_REQUIRED' });
    expect(await db.case.count({ where: { title } })).toBe(0);
    expect((await db.clientPortalIntakeRequest.findUnique({ where: { id: sent.reference } }))?.linkedCaseId).toBeNull();
    const successful: any = await convertIntakeToNewCase(admin, sent.reference, { newCase: { title, matterType: 'OTHER', assignedLawyerId: adminId }, createRequesterAccess: false, publishInitialSnapshot: false }, db as any);
    await expect(convertIntakeToNewCase(admin, sent.reference, { newCase: { title: `${title}-different`, matterType: 'OTHER' }, createRequesterAccess: false, publishInitialSnapshot: false }, db as any)).rejects.toMatchObject({ status: 409, code: 'INTAKE_ALREADY_CONVERTED_DIFFERENTLY' });
    expect((await db.clientPortalIntakeRequest.findUnique({ where: { id: sent.reference } }))?.linkedCaseId).toBe(successful.case.id);
  });

  it('cross-Client and archived Case link are rejected without mutation', async () => {
    const otherCase = await db.case.create({ data: { caseNumber: `CP1-OTHER-${suffix}`, title: 'Other client', caseType: 'OTHER', clientId: otherClientId, createdById: adminId } as never });
    const archivedCase = await db.case.create({ data: { caseNumber: `CP1-ARCH-${suffix}`, title: 'Archived', caseType: 'OTHER', status: 'ARCHIVED', clientId, createdById: adminId } as never });
    const one: any = await submitted('Cross client');
    await expect(linkIntakeToExistingCase(admin, one.reference, { caseId: otherCase.id, createRequesterAccess: false, publishInitialSnapshot: false }, db as any)).rejects.toMatchObject({ code: 'CASE_CLIENT_MISMATCH' });
    const two: any = await submitted('Archived');
    await expect(linkIntakeToExistingCase(admin, two.reference, { caseId: archivedCase.id, createRequesterAccess: false, publishInitialSnapshot: false }, db as any)).rejects.toMatchObject({ code: 'CASE_NOT_ELIGIBLE' });
  });

  it('initial publication stores safeMilestones in milestonesSnapshot, not publishedDeadlinesSnapshot (regression: column mismatch fix)', async () => {
    // Regression guard: createAndPublishInitialMatterPublicationInTransaction previously
    // stored safeMilestones in publishedDeadlinesSnapshot (wrong column), leaving
    // milestonesSnapshot NULL.  The customer-facing read path reads milestonesSnapshot,
    // so any milestones provided at intake conversion time were silently discarded.
    const sent: any = await submitted('Milestone column regression');
    const milestones = [
      { reference: 'M1', title: 'Első mérföldkő', description: 'Leírás', state: 'NOT_STARTED', displayOrder: 1, weight: null, completedAt: null },
    ];
    const result: any = await convertIntakeToNewCase(
      admin, sent.reference,
      {
        newCase: { title: `CP1 milestone-col-${suffix}`, matterType: 'OTHER', assignedLawyerId: adminId },
        createRequesterAccess: true, participantRole: 'REQUESTER', permissions: ['MATTER_READ'],
        publishInitialSnapshot: true,
        publication: { publicTitle: 'Milestone test pub', publicStatus: 'Indulás', safeMilestones: milestones },
      },
      db as any,
    );
    const revisionRow = await db.$queryRaw<any[]>`
      SELECT "milestonesSnapshot", "publishedDeadlinesSnapshot"
      FROM client_matter_publication_revisions
      WHERE "publicationId" = ${result.publication.id}::text
      ORDER BY "revisionNumber" ASC LIMIT 1
    `;
    expect(revisionRow).toHaveLength(1);
    const rev = revisionRow[0];
    // Milestones must be in milestonesSnapshot
    const stored = Array.isArray(rev.milestonesSnapshot) ? rev.milestonesSnapshot : JSON.parse(rev.milestonesSnapshot ?? '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].reference).toBe('M1');
    // publishedDeadlinesSnapshot must be empty (milestones are NOT deadlines)
    const deadlines = Array.isArray(rev.publishedDeadlinesSnapshot) ? rev.publishedDeadlinesSnapshot : JSON.parse(rev.publishedDeadlinesSnapshot ?? '[]');
    expect(deadlines).toHaveLength(0);
  });
});
