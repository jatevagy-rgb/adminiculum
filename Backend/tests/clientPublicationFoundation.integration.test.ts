import { PrismaClient } from '@prisma/client';
import {
  approveDocumentPublication,
  approveMatterPublication,
  assertNoForbiddenPortalFields,
  createActionRequest,
  createDocumentPublication,
  createGrant,
  createMatterPublication,
  createSafeUpdate,
  getPublicationOverview,
  portalHomeSnapshot,
  publishDocumentPublication,
  publishMatterPublication,
  revokeDocumentPublication,
  revokeMatterPublication,
  submitDocumentPublication,
  submitMatterPublication,
  supersedeDocumentPublication,
  supersedeMatterPublication,
  transitionActionRequest,
  transitionGrant,
  transitionSafeUpdate,
  updateMatterPublication,
} from '../src/modules/client-publication/publicationService';

const databaseUrl = process.env.PUBLICATION_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const ids = {
  admin: 'f1000000-0000-4000-8000-000000000001',
  lawyer: 'f1000000-0000-4000-8000-000000000002',
  assistant: 'f1000000-0000-4000-8000-000000000003',
  portalUser: 'f1000000-0000-4000-8000-000000000004',
  outsiderClientUser: 'f1000000-0000-4000-8000-000000000005',
  client: 'f2000000-0000-4000-8000-000000000001',
  otherClient: 'f2000000-0000-4000-8000-000000000002',
  case: 'f3000000-0000-4000-8000-000000000001',
  otherCase: 'f3000000-0000-4000-8000-000000000002',
  document: 'f4000000-0000-4000-8000-000000000001',
  otherDocument: 'f4000000-0000-4000-8000-000000000002',
  version1: 'f5000000-0000-4000-8000-000000000001',
  version2: 'f5000000-0000-4000-8000-000000000002',
  version3: 'f5000000-0000-4000-8000-000000000003',
  otherVersion: 'f5000000-0000-4000-8000-000000000004',
  task: 'f6000000-0000-4000-8000-000000000001',
  annotation: 'f7000000-0000-4000-8000-000000000001',
  comparison: 'f8000000-0000-4000-8000-000000000001',
  segment: 'f9000000-0000-4000-8000-000000000001',
};

const actor = { userId: ids.lawyer, role: 'LAWYER' };
const assistant = { userId: ids.assistant, role: 'LEGAL_ASSISTANT' };
const portalActor = { userId: ids.portalUser, role: 'CLIENT' };

describeWithDatabase('Client publication foundation PostgreSQL boundary', () => {
  let db: PrismaClient;
  let activeGrantId = '';
  let matterPublicationId = '';
  let documentPublicationId = '';

  beforeAll(async () => {
    const parsed = new URL(databaseUrl as string);
    expect(['127.0.0.1', 'localhost', '::1']).toContain(parsed.hostname);
    expect(parsed.pathname.replace(/^\//, '')).toBe('adminiculum_replay_ci');
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    await db.user.createMany({ data: [
      { id: ids.admin, email: 'publication-admin@example.invalid', name: 'Publication Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] },
      { id: ids.lawyer, email: 'publication-lawyer@example.invalid', name: 'Publication Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: ids.assistant, email: 'publication-assistant@example.invalid', name: 'Publication Assistant', role: 'LEGAL_ASSISTANT', status: 'ACTIVE', isActive: true, skills: [] },
      { id: ids.portalUser, email: 'client-portal-user@example.invalid', name: 'Client Portal User', role: 'CLIENT', status: 'ACTIVE', isActive: true, skills: [] },
      { id: ids.outsiderClientUser, email: 'outsider-client-user@example.invalid', name: 'Other Client User', role: 'CLIENT', status: 'ACTIVE', isActive: true, skills: [] },
    ] });
    await db.client.createMany({ data: [{ id: ids.client, name: 'Publication Client' }, { id: ids.otherClient, name: 'Other Client' }] });
    await db.case.createMany({ data: [
      { id: ids.case, caseNumber: 'PUB-001', title: 'Publication case', caseType: 'CONTRACT_REVIEW', clientId: ids.client, createdById: ids.lawyer, assignedLawyerId: ids.lawyer },
      { id: ids.otherCase, caseNumber: 'PUB-002', title: 'Other publication case', caseType: 'CONTRACT_REVIEW', clientId: ids.otherClient, createdById: ids.admin, assignedLawyerId: ids.admin },
    ] });
    await db.document.createMany({ data: [
      { id: ids.document, name: 'Publication document', title: 'Internal draft title', fileName: 'publication.txt', category: 'CONTRACT', documentType: 'CONTRACT', mimeType: 'text/plain', caseId: ids.case, clientId: ids.client, currentVersion: 3, currentVersionInt: 3, version: '3', workInstruction: 'Internal workInstruction must never leak' },
      { id: ids.otherDocument, name: 'Other publication document', fileName: 'other-publication.txt', category: 'CONTRACT', documentType: 'CONTRACT', mimeType: 'text/plain', caseId: ids.otherCase, clientId: ids.otherClient, currentVersion: 1, currentVersionInt: 1, version: '1' },
    ] });
    await db.documentVersion.createMany({ data: [
      { id: ids.version1, documentId: ids.document, version: 1, name: 'publication-v1.txt', originalFileName: 'publication-v1.txt', mimeType: 'text/plain', size: 12, storageReference: 'publication-v1-storage', spItemId: 'publication-v1-sp', isCurrent: false, uploadedById: ids.lawyer, versionType: 'ORIGINAL' },
      { id: ids.version2, documentId: ids.document, version: 2, name: 'publication-v2.txt', originalFileName: 'publication-v2.txt', mimeType: 'text/plain', size: 14, storageReference: 'publication-v2-storage', spItemId: 'publication-v2-sp', isCurrent: false, uploadedById: ids.lawyer, previousVersionId: ids.version1 },
      { id: ids.version3, documentId: ids.document, version: 3, name: 'publication-v3.txt', originalFileName: 'publication-v3.txt', mimeType: 'text/plain', size: 16, storageReference: 'publication-v3-storage', spItemId: 'publication-v3-sp', isCurrent: true, uploadedById: ids.lawyer, previousVersionId: ids.version2 },
      { id: ids.otherVersion, documentId: ids.otherDocument, version: 1, name: 'other-publication-v1.txt', originalFileName: 'other-publication-v1.txt', mimeType: 'text/plain', size: 20, storageReference: 'other-storage', spItemId: 'other-sp', isCurrent: true, uploadedById: ids.admin },
    ] });
    await db.task.create({ data: { id: ids.task, title: 'Internal task notes absent', description: 'Raw internal task note', taskType: 'REVIEW_CONTRACT', status: 'PENDING', priority: 'MEDIUM', caseId: ids.case, assignedToId: ids.lawyer, assignedById: ids.admin, requiredSkills: [] } });
    await db.documentAnnotation.create({ data: { id: ids.annotation, documentId: ids.document, documentVersionId: ids.version2, annotationType: 'REVIEW_COMMENT', anchorType: 'TEXT_RANGE', status: 'OPEN', visibility: 'CLIENT_CANDIDATE', headline: 'Candidate annotation', internalNote: 'Annotation content must not publish itself', createdById: ids.lawyer } });
    await db.documentComparison.create({ data: { id: ids.comparison, documentId: ids.document, baseVersionId: ids.version1, targetVersionId: ids.version2, status: 'READY', algorithmRevision: 4, extractionRevision: 1, createdById: ids.lawyer, totalSegmentCount: 1 } });
    await db.documentChangeSegment.create({ data: { id: ids.segment, comparisonId: ids.comparison, sequence: 0, changeType: 'REPLACE', baseExcerpt: 'old internal comparison text', targetExcerpt: 'new internal comparison text', confidence: 0.9, reviewState: 'ACCEPTED', internalRationale: 'Internal comparison rationale' } });
    const review = await db.documentReview.create({ data: { documentId: ids.document, documentVersionId: ids.version2, approvedVersionId: ids.version2, status: 'CLOSED', ownerId: ids.lawyer, createdById: ids.lawyer, assignedReviewerId: ids.admin, completedAt: new Date() } });
    const round = await db.documentReviewRound.create({ data: { reviewId: review.id, roundNumber: 1, reviewVersionId: ids.version2, status: 'CLOSED', createdById: ids.lawyer, completedAt: new Date() } });
    await db.documentReview.update({ where: { id: review.id }, data: { currentRoundId: round.id } });
    await db.reviewPoint.create({ data: { reviewId: review.id, reviewRoundId: round.id, type: 'WHOLE_DOCUMENT', status: 'RESOLVED', severity: 'BLOCKING', title: 'Resolved blocker must not leak', createdById: ids.lawyer } });
  });

  afterAll(async () => { await db?.$disconnect(); });

  it('keeps everything internal until an explicit grant and publication record exist', async () => {
    const overview = await getPublicationOverview(actor, ids.case, ids.document, db);
    expect(overview.warnings.map((warning: any) => warning.code)).toContain('NO_ACTIVE_AUDIENCE_GRANT');
    expect(overview.matterPublications).toHaveLength(0);
    expect(overview.documentPublications).toHaveLength(0);
    await expect(portalHomeSnapshot(portalActor, db)).rejects.toMatchObject({ code: 'CLIENT_PORTAL_READ_DISABLED' });
    expect(await db.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM client_matter_publications`).toEqual([{ count: 0 }]);
  });

  it('creates, activates, suspends, revokes, expires and de-duplicates grants', async () => {
    await expect(createGrant(actor, { caseId: ids.case, clientId: ids.otherClient, clientUserId: ids.portalUser }, db)).rejects.toMatchObject({ code: 'CASE_CLIENT_MISMATCH' });
    const grant = await createGrant(actor, { caseId: ids.case, clientId: ids.client, clientUserId: ids.portalUser, permissions: ['MATTER_READ', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD', 'ACTION_REQUEST_READ', 'UPDATE_READ'] }, db);
    expect(grant.status).toBe('INVITED');
    const active = await transitionGrant(actor, grant.id, 'activate', { expectedRevision: grant.revision }, db);
    activeGrantId = active.id;
    expect(active.status).toBe('ACTIVE');
    const duplicate = await createGrant(actor, { caseId: ids.case, clientId: ids.client, clientUserId: ids.portalUser }, db);
    await expect(transitionGrant(actor, duplicate.id, 'activate', { expectedRevision: duplicate.revision }, db)).rejects.toThrow();
    const suspended = await transitionGrant(actor, active.id, 'suspend', { expectedRevision: active.revision }, db);
    expect(suspended.status).toBe('SUSPENDED');
    const revoked = await transitionGrant(actor, active.id, 'revoke', { expectedRevision: suspended.revision, revocationReasonSafe: 'Smoke revoke' }, db);
    expect(revoked.status).toBe('REVOKED');
    const fresh = await createGrant(actor, { caseId: ids.case, clientId: ids.client, clientUserId: ids.outsiderClientUser, validUntil: new Date(Date.now() + 86400000).toISOString() }, db);
    activeGrantId = (await transitionGrant(actor, fresh.id, 'activate', { expectedRevision: fresh.revision }, db)).id;
    const expiring = await createGrant(actor, { caseId: ids.case, clientId: ids.client, clientUserId: ids.portalUser, validFrom: new Date(Date.now() - 172800000).toISOString(), validUntil: new Date(Date.now() - 86400000).toISOString() }, db);
    const expired = await transitionGrant(actor, expiring.id, 'expire', { expectedRevision: expiring.revision }, db);
    expect(expired.status).toBe('EXPIRED');
    await expect(transitionGrant(actor, activeGrantId, 'suspend', { expectedRevision: 0 }, db)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  });

  it('publishes immutable matter snapshots and preserves history on supersede and revoke', async () => {
    const draft = await createMatterPublication(actor, { caseId: ids.case, clientSafeTitle: 'Client safe matter', clientSafeStatus: 'We are reviewing the file.', clientSafeNextStep: 'We will send a final version.', responsibleLawyerDisplay: 'Publication Lawyer', publishedDeadlinesSnapshot: [{ title: 'Safe deadline', dueAt: '2026-08-01' }] }, db);
    matterPublicationId = draft.id;
    const revised = await updateMatterPublication(actor, draft.id, { expectedRevision: draft.revision, clientSafeTitle: 'Client safe matter revision', clientSafeStatus: 'Review completed.', clientSafeNextStep: 'Approval follows.' }, db);
    expect(revised.snapshot.revisionNumber).toBe(2);
    const submitted = await submitMatterPublication(actor, draft.id, { expectedRevision: revised.revision }, db);
    const approved = await approveMatterPublication(actor, draft.id, { expectedRevision: submitted.revision }, db);
    const published = await publishMatterPublication(actor, draft.id, { expectedRevision: approved.revision }, db);
    expect(published.status).toBe('PUBLISHED');
    await expect(db.$executeRawUnsafe('UPDATE client_matter_publication_revisions SET "clientSafeTitle"=$1 WHERE id=$2', 'mutated', published.currentRevisionId)).rejects.toThrow();
    const eventCountBeforeRepeat = await db.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM client_publication_events WHERE "matterPublicationId"=${draft.id} AND action='PUBLISHED'::"ClientPublicationEventAction"`;
    const samePublish = await publishMatterPublication(actor, draft.id, { expectedRevision: published.revision }, db);
    expect(samePublish.status).toBe('PUBLISHED');
    const eventCountAfterRepeat = await db.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM client_publication_events WHERE "matterPublicationId"=${draft.id} AND action='PUBLISHED'::"ClientPublicationEventAction"`;
    expect(eventCountAfterRepeat[0].count).toBe(eventCountBeforeRepeat[0].count);
    const superseded = await supersedeMatterPublication(actor, draft.id, { expectedRevision: published.revision }, db);
    expect(superseded.status).toBe('SUPERSEDED');
    const revokable = await createMatterPublication(actor, { caseId: ids.case, clientSafeTitle: 'Current matter', clientSafeStatus: 'Published safely' }, db);
    const revokableSubmitted = await submitMatterPublication(actor, revokable.id, { expectedRevision: revokable.revision }, db);
    const revokableApproved = await approveMatterPublication(actor, revokable.id, { expectedRevision: revokableSubmitted.revision }, db);
    const revokablePublished = await publishMatterPublication(actor, revokable.id, { expectedRevision: revokableApproved.revision }, db);
    const revoked = await revokeMatterPublication(actor, revokable.id, { expectedRevision: revokablePublished.revision }, db);
    expect(revoked.status).toBe('REVOKED');
    const history = await db.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM client_publication_events WHERE "caseId"=${ids.case}`;
    expect(history[0].count).toBeGreaterThanOrEqual(8);
  });

  it('publishes exactly one document version and never follows newer uploads automatically', async () => {
    await expect(createDocumentPublication(actor, { documentId: ids.document, documentVersionId: ids.otherVersion, clientFacingTitle: 'Bad source' }, db)).rejects.toMatchObject({ code: 'DOCUMENT_VERSION_NOT_FOUND' });
    const draft = await createDocumentPublication(actor, { documentId: ids.document, documentVersionId: ids.version2, clientFacingTitle: 'Approved exact version', clientFacingExplanation: 'Client-safe explanation.' }, db);
    documentPublicationId = draft.id;
    const submitted = await submitDocumentPublication(actor, draft.id, { expectedRevision: draft.revision }, db);
    const approved = await approveDocumentPublication(actor, draft.id, { expectedRevision: submitted.revision }, db);
    const published = await publishDocumentPublication(actor, draft.id, { expectedRevision: approved.revision }, db);
    expect(published.documentVersionId).toBe(ids.version2);
    expect(published.status).toBe('PUBLISHED');
    await db.documentVersion.create({ data: { id: 'f5000000-0000-4000-8000-000000000099', documentId: ids.document, version: 4, name: 'publication-v4.txt', originalFileName: 'publication-v4.txt', mimeType: 'text/plain', size: 30, storageReference: 'publication-v4-storage', spItemId: 'publication-v4-sp', isCurrent: true, uploadedById: ids.lawyer, previousVersionId: ids.version3 } });
    expect((await db.$queryRaw<Array<{ documentVersionId: string }>>`SELECT "documentVersionId" FROM client_document_publications WHERE id=${draft.id}`)[0].documentVersionId).toBe(ids.version2);
    const superseded = await supersedeDocumentPublication(actor, draft.id, { expectedRevision: published.revision }, db);
    expect(superseded.status).toBe('SUPERSEDED');
    const revokable = await createDocumentPublication(actor, { documentId: ids.document, documentVersionId: ids.version2, clientFacingTitle: 'Revokable exact version', clientFacingExplanation: 'Safe explanation.' }, db);
    const revSubmitted = await submitDocumentPublication(actor, revokable.id, { expectedRevision: revokable.revision }, db);
    const revApproved = await approveDocumentPublication(actor, revokable.id, { expectedRevision: revSubmitted.revision }, db);
    const revPublished = await publishDocumentPublication(actor, revokable.id, { expectedRevision: revApproved.revision }, db);
    const revoked = await revokeDocumentPublication(actor, revokable.id, { expectedRevision: revPublished.revision, revocationReasonSafe: 'Safe revoke reason' }, db);
    expect(revoked.status).toBe('REVOKED');
  });

  it('creates action requests and safe updates without exposing linked internal material', async () => {
    const action = await createActionRequest(actor, { caseId: ids.case, type: 'INFORMATION_REQUEST', clientSafeTitle: 'Please confirm company data', clientSafeInstructions: 'Confirm the public registry number.', linkedInternalTaskId: ids.task }, db);
    const approvedAction = await transitionActionRequest(actor, action.id, 'approve', { expectedRevision: action.revision }, db);
    expect(approvedAction.status).toBe('APPROVED');
    const publishedAction = await transitionActionRequest(actor, action.id, 'publish', { expectedRevision: approvedAction.revision }, db);
    expect(publishedAction.status).toBe('PUBLISHED');
    const repeatPublishedAction = await transitionActionRequest(actor, action.id, 'publish', { expectedRevision: publishedAction.revision }, db);
    expect(repeatPublishedAction.status).toBe('PUBLISHED');
    const cancelled = await transitionActionRequest(actor, publishedAction.id, 'cancel', { expectedRevision: publishedAction.revision }, db);
    expect(cancelled.status).toBe('CANCELLED');
    const update = await createSafeUpdate(actor, { caseId: ids.case, title: 'Safe update', body: 'The reviewed document is ready for client publication.', category: 'DOCUMENT' }, db);
    const approved = await transitionSafeUpdate(actor, update.id, 'approve', { expectedRevision: update.revision }, db);
    const published = await transitionSafeUpdate(actor, update.id, 'publish', { expectedRevision: approved.revision }, db);
    expect(published.status).toBe('PUBLISHED');
    const revoked = await transitionSafeUpdate(actor, update.id, 'revoke', { expectedRevision: published.revision }, db);
    expect(revoked.status).toBe('REVOKED');
  });

  it('proves safe mappers, authorization, disabled gates and no inferred publication', async () => {
    await expect(getPublicationOverview(assistant, ids.case, ids.document, db)).rejects.toMatchObject({ code: 'PUBLICATION_NOT_AUTHORIZED' });
    await expect(createMatterPublication(actor, { caseId: ids.case, clientSafeTitle: 'reviewer field leak', clientSafeStatus: 'safe' }, db)).rejects.toMatchObject({ code: 'FORBIDDEN_CLIENT_FIELD' });
    const overview = await getPublicationOverview(actor, ids.case, ids.document, db);
    assertNoForbiddenPortalFields(overview);
    expect(JSON.stringify(overview)).not.toMatch(/workInstruction|storageReference|spItemId|review_points|review decisions|Annotation content|old internal comparison text|Raw internal task note|AI/);
    expect(overview.gates.portalReadEnabled).toBe(false);
    expect(overview.gates.portalActionsEnabled).toBe(false);
    await expect(portalHomeSnapshot(portalActor, db)).rejects.toMatchObject({ code: 'CLIENT_PORTAL_READ_DISABLED' });
    const automatic = await db.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count
      FROM client_document_publications
      WHERE "documentId"=${ids.document}
        AND "documentVersionId"=${ids.version3}`;
    expect(automatic[0].count).toBe(0);
    const integrity = await db.$queryRaw<Array<{ orphanRevisions: number; documentVersionPublication: string; annotationVisibility: string; segmentReviewState: string }>>`
      SELECT
        (SELECT count(*)::int FROM client_matter_publication_revisions r LEFT JOIN client_matter_publications p ON p.id=r."publicationId" WHERE p.id IS NULL) AS "orphanRevisions",
        (SELECT "publicationStatus"::text FROM document_versions WHERE id=${ids.version2}) AS "documentVersionPublication",
        (SELECT visibility::text FROM document_annotations WHERE id=${ids.annotation}) AS "annotationVisibility",
        (SELECT "reviewState"::text FROM document_change_segments WHERE id=${ids.segment}) AS "segmentReviewState"`;
    expect(integrity[0]).toMatchObject({ orphanRevisions: 0, documentVersionPublication: 'INTERNAL_ONLY', annotationVisibility: 'CLIENT_CANDIDATE', segmentReviewState: 'ACCEPTED' });
    const events = await db.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM client_publication_events WHERE "caseId"=${ids.case}`;
    expect(events[0].count).toBeGreaterThanOrEqual(12);
    expect(await db.notification.count({ where: { type: 'SYSTEM', link: `/cases/${ids.case}/documents?mode=publication` } })).toBeGreaterThan(0);
    expect(activeGrantId).toBeTruthy();
    expect(matterPublicationId).toBeTruthy();
    expect(documentPublicationId).toBeTruthy();
  });
});
