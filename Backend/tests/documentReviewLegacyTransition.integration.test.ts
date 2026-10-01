/**
 * Document Review / DECIDE P1 hotfix — legacy approve/reject delegation.
 *
 * PostgreSQL integration test. Exercises the REAL documentsService
 * approveDocument / rejectDocument compatibility entry points against a real
 * database and proves the review-state decision is delegated through the
 * canonical transition engine (never a direct DocumentReview.status write),
 * and that legacy side effects only run after a successful canonical
 * transition.
 *
 * Skipped when REVIEW_TEST_DATABASE_URL is unset. Never edits Intake / Work
 * Package; scope is Backend/src/modules/documents/** only.
 */
import { PrismaClient } from '@prisma/client';
import documentsService from '../src/modules/documents/services';
import { driveService } from '../src/modules/sharepoint';

const databaseUrl = process.env.REVIEW_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const ids = {
  owner: 'e1000000-0000-4000-8000-000000000011',
  reviewer: 'e1000000-0000-4000-8000-000000000012',
  outsider: 'e1000000-0000-4000-8000-000000000013',
  client: 'e2000000-0000-4000-8000-000000000011',
  case: 'e3000000-0000-4000-8000-000000000011',
  otherCase: 'e3000000-0000-4000-8000-000000000012',
  document: 'e4000000-0000-4000-8000-000000000011',
  v1: 'e5000000-0000-4000-8000-000000000011',
  v2: 'e5000000-0000-4000-8000-000000000012',
  review: 'ef000000-0000-4000-8000-000000000011',
  round: 'ef000000-0000-4000-8000-000000000012',
};

const owner = { userId: ids.owner, role: 'LAWYER' } as const;

describeWithDatabase('Legacy approve/reject delegate to canonical DocumentReview transition (PostgreSQL)', () => {
  let db: PrismaClient;
  let sharepointCheckins: number;
  let sharepointCheckinsSpy: any;

  beforeAll(async () => {
    const parsed = new URL(databaseUrl as string);
    expect(['127.0.0.1', 'localhost', '::1']).toContain(parsed.hostname);
    expect(parsed.pathname.replace(/^\//, '')).toBe('adminiculum_replay_ci');
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    await db.user.createMany({ data: [
      { id: ids.owner, email: 'legacy-review-owner@example.invalid', name: 'Legacy Review Owner', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: ids.reviewer, email: 'legacy-reviewer@example.invalid', name: 'Legacy Reviewer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: ids.outsider, email: 'legacy-outsider@example.invalid', name: 'Legacy Outsider', role: 'LEGAL_ASSISTANT', status: 'ACTIVE', isActive: true, skills: [] },
    ] });
    await db.client.create({ data: { id: ids.client, name: 'Legacy Review Client' } });
    await db.case.createMany({ data: [
      { id: ids.case, caseNumber: 'LREV-001', title: 'Legacy review case', caseType: 'CONTRACT_REVIEW', clientId: ids.client, createdById: ids.owner, assignedLawyerId: ids.owner },
      { id: ids.otherCase, caseNumber: 'LREV-002', title: 'Other legacy review case', caseType: 'CONTRACT_REVIEW', clientId: ids.client, createdById: ids.owner, assignedLawyerId: ids.owner },
    ] });
    await db.caseCollaborator.create({ data: { caseId: ids.case, userId: ids.reviewer } });
    await db.document.create({ data: { id: ids.document, name: 'Legacy review doc', fileName: 'legacy.txt', category: 'CONTRACT', documentType: 'CONTRACT', mimeType: 'text/plain', caseId: ids.case, clientId: ids.client, currentVersion: 2, currentVersionInt: 2, version: '2', spItemId: 'legacy-sp-1', folder: 'REVIEW' } });
    await db.documentVersion.createMany({ data: [
      { id: ids.v1, documentId: ids.document, version: 1, name: 'legacy-v1.txt', originalFileName: 'legacy-v1.txt', mimeType: 'text/plain', size: 10, storageReference: 'legacy-v1-key', spItemId: 'legacy-v1', isCurrent: false, uploadedById: ids.owner, versionType: 'ORIGINAL' },
      { id: ids.v2, documentId: ids.document, version: 2, name: 'legacy-v2.txt', originalFileName: 'legacy-v2.txt', mimeType: 'text/plain', size: 10, storageReference: 'legacy-v2-key', spItemId: 'legacy-v2', isCurrent: true, uploadedById: ids.owner, previousVersionId: ids.v1 },
    ] });
    // Create the active review + a single IN_REVIEW round on v2.
    await db.documentReview.create({ data: { id: ids.review, documentId: ids.document, documentVersionId: ids.v2, status: 'IN_REVIEW', ownerId: ids.owner, createdById: ids.owner, assignedReviewerId: ids.reviewer } });
    await db.documentReviewRound.create({ data: { id: ids.round, reviewId: ids.review, roundNumber: 1, reviewVersionId: ids.v2, status: 'IN_REVIEW', submittedAt: new Date(), createdById: ids.owner } });
    await db.documentReview.update({ where: { id: ids.review }, data: { currentRoundId: ids.round } });

    sharepointCheckins = 0;
    sharepointCheckinsSpy = jest.spyOn(driveService as any, 'checkinDocument').mockImplementation(async () => { sharepointCheckins += 1; return true as any; });
  });

  afterAll(async () => {
    sharepointCheckinsSpy?.mockRestore();
    await db?.$disconnect();
  });

  async function reviewRow() {
    return db.documentReview.findUniqueOrThrow({ where: { id: ids.review } });
  }

  it('1. valid approve delegates to canonical transition and persists APPROVED + legacy side effects', async () => {
    const ok = await documentsService.approveDocument(ids.document, ids.owner, 'Looks good', 'LAWYER', db);
    expect(ok).toBe(true);
    const review = await reviewRow();
    expect(review.status).toBe('APPROVED');
    expect(review.approvedVersionId).toBe(ids.v2);
    expect(review.completedAt).not.toBeNull();
    // Legacy side effects ran only because canonical success:
    expect(sharepointCheckins).toBe(1);
    const doc = await db.document.findUniqueOrThrow({ where: { id: ids.document } });
    expect(doc.folder).toBe('APPROVED');
    const caseRow = await db.case.findUniqueOrThrow({ where: { id: ids.case } });
    expect(caseRow.status).toBe('APPROVED');
    // A canonical review decision + timeline audit were recorded.
    expect(await db.reviewDecision.count({ where: { reviewId: ids.review, action: 'APPROVED' } })).toBe(1);
    // The legacy timeline side effect persisted with a VALID canonical eventType,
    // keeping the detailed legacy label only in the free-form compatibility field.
    const timeline = await db.timelineEvent.findFirst({ where: { caseId: ids.case, eventType: 'DOCUMENT_APPROVED' } });
    expect(timeline).not.toBeNull();
    expect(timeline?.type).toBe('CONTRACT_APPROVED');
  });

  it('2. repeated approve on already-APPROVED invalid state is blocked with no side effects', async () => {
    const before = sharepointCheckins;
    await expect(documentsService.approveDocument(ids.document, ids.owner, 'again', 'LAWYER', db)).rejects.toThrow('transition is not allowed');
    expect(sharepointCheckins).toBe(before);
    const review = await reviewRow();
    expect(review.status).toBe('APPROVED');
  });

  it('3. reject on already-APPROVED invalid state is blocked (incompatible reject-after-approved)', async () => {
    const before = sharepointCheckins;
    await expect(documentsService.rejectDocument(ids.document, ids.owner, 'please change', 'LAWYER', db)).rejects.toThrow('transition is not allowed');
    expect(sharepointCheckins).toBe(before);
    const review = await reviewRow();
    expect(review.status).toBe('APPROVED');
  });

  it('4. version precondition: approval is version-locked to the atomic version under review', async () => {
    // The review was created on v2; the legacy entry point does not accept a
    // caller-supplied versionId, so it can only approve the version the review
    // is actually reviewing. It must not silently transfer to a newer version.
    const review = await reviewRow();
    expect(review.approvedVersionId).toBe(ids.v2);
  });

  it('5. legacy side effects do not publish to the client (INTERNAL_ONLY preserved)', async () => {
    const v = await db.documentVersion.findUniqueOrThrow({ where: { id: ids.v2 } });
    expect(v.publicationStatus).toBe('INTERNAL_ONLY');
    const review = await reviewRow();
    expect(review.status).toBe('APPROVED');
    // Approving must not create any client publication row.
    expect(await db.clientDocumentPublication.count({ where: { documentId: ids.document } })).toBe(0);
  });

  it('6. valid reject delegates to canonical REQUEST_CHANGES and persists a valid canonical timeline eventType', async () => {
    // A fresh IN_REVIEW document/review on the other case, so this exercises the
    // reject path independently of the approved fixture above.
    const rj = {
      doc: 'e4000000-0000-4000-8000-000000000021',
      v1: 'e5000000-0000-4000-8000-000000000021',
      v2: 'e5000000-0000-4000-8000-000000000022',
      review: 'ef000000-0000-4000-8000-000000000021',
      round: 'ef000000-0000-4000-8000-000000000022',
    };
    await db.document.create({ data: { id: rj.doc, name: 'Reject doc', fileName: 'reject.txt', category: 'CONTRACT', documentType: 'CONTRACT', mimeType: 'text/plain', caseId: ids.otherCase, clientId: ids.client, currentVersion: 2, currentVersionInt: 2, version: '2', spItemId: 'reject-sp-1', folder: 'REVIEW' } });
    await db.documentVersion.createMany({ data: [
      { id: rj.v1, documentId: rj.doc, version: 1, name: 'reject-v1.txt', originalFileName: 'reject-v1.txt', mimeType: 'text/plain', size: 10, storageReference: 'reject-v1-key', spItemId: 'reject-v1', isCurrent: false, uploadedById: ids.owner, versionType: 'ORIGINAL' },
      { id: rj.v2, documentId: rj.doc, version: 2, name: 'reject-v2.txt', originalFileName: 'reject-v2.txt', mimeType: 'text/plain', size: 10, storageReference: 'reject-v2-key', spItemId: 'reject-v2', isCurrent: true, uploadedById: ids.owner, previousVersionId: rj.v1 },
    ] });
    await db.documentReview.create({ data: { id: rj.review, documentId: rj.doc, documentVersionId: rj.v2, status: 'IN_REVIEW', ownerId: ids.owner, createdById: ids.owner, assignedReviewerId: ids.reviewer } });
    await db.documentReviewRound.create({ data: { id: rj.round, reviewId: rj.review, roundNumber: 1, reviewVersionId: rj.v2, status: 'IN_REVIEW', submittedAt: new Date(), createdById: ids.owner } });
    await db.documentReview.update({ where: { id: rj.review }, data: { currentRoundId: rj.round } });

    const ok = await documentsService.rejectDocument(rj.doc, ids.owner, 'Needs changes', 'LAWYER', db);
    expect(ok).toBe(true);
    const review = await db.documentReview.findUniqueOrThrow({ where: { id: rj.review } });
    expect(review.status).toBe('CHANGES_REQUESTED'); // canonical transition, not a direct status write
    expect(await db.reviewDecision.count({ where: { reviewId: rj.review, action: 'CHANGES_REQUESTED' } })).toBe(1);
    const doc = await db.document.findUniqueOrThrow({ where: { id: rj.doc } });
    expect(doc.folder).toBe('DRAFTS'); // legacy side effect after canonical success
    const timeline = await db.timelineEvent.findFirst({ where: { caseId: ids.otherCase, eventType: 'DOCUMENT_REJECTED' } });
    expect(timeline).not.toBeNull();
    expect(timeline?.type).toBe('CONTRACT_REJECTED');
    // Reject must not publish to the client.
    expect(await db.clientDocumentPublication.count({ where: { documentId: rj.doc } })).toBe(0);
  });

  it('7. rolls back the whole legacy approval atomically when a side effect fails', async () => {
    const rx = {
      case: 'e3000000-0000-4000-8000-000000000031',
      doc: 'e4000000-0000-4000-8000-000000000031',
      v1: 'e5000000-0000-4000-8000-000000000031',
      v2: 'e5000000-0000-4000-8000-000000000032',
      review: 'ef000000-0000-4000-8000-000000000031',
      round: 'ef000000-0000-4000-8000-000000000032',
    };
    await db.case.create({ data: { id: rx.case, caseNumber: 'LREV-003', title: 'Rollback legacy review case', caseType: 'CONTRACT_REVIEW', clientId: ids.client, createdById: ids.owner, assignedLawyerId: ids.owner, status: 'IN_REVIEW' } });
    await db.document.create({ data: { id: rx.doc, name: 'Rollback doc', fileName: 'rollback.txt', category: 'CONTRACT', documentType: 'CONTRACT', mimeType: 'text/plain', caseId: rx.case, clientId: ids.client, currentVersion: 2, currentVersionInt: 2, version: '2', spItemId: 'rollback-sp-1', folder: 'REVIEW' } });
    await db.documentVersion.createMany({ data: [
      { id: rx.v1, documentId: rx.doc, version: 1, name: 'rollback-v1.txt', originalFileName: 'rollback-v1.txt', mimeType: 'text/plain', size: 10, storageReference: 'rollback-v1-key', spItemId: 'rollback-v1', isCurrent: false, uploadedById: ids.owner, versionType: 'ORIGINAL' },
      { id: rx.v2, documentId: rx.doc, version: 2, name: 'rollback-v2.txt', originalFileName: 'rollback-v2.txt', mimeType: 'text/plain', size: 10, storageReference: 'rollback-v2-key', spItemId: 'rollback-v2', isCurrent: true, uploadedById: ids.owner, previousVersionId: rx.v1 },
    ] });
    await db.documentReview.create({ data: { id: rx.review, documentId: rx.doc, documentVersionId: rx.v2, status: 'IN_REVIEW', ownerId: ids.owner, createdById: ids.owner, assignedReviewerId: ids.reviewer } });
    await db.documentReviewRound.create({ data: { id: rx.round, reviewId: rx.review, roundNumber: 1, reviewVersionId: rx.v2, status: 'IN_REVIEW', submittedAt: new Date(), createdById: ids.owner } });
    await db.documentReview.update({ where: { id: rx.review }, data: { currentRoundId: rx.round } });

    const before = sharepointCheckins;
    sharepointCheckinsSpy.mockImplementationOnce(async () => { throw new Error('forced checkin failure'); });
    await expect(documentsService.approveDocument(rx.doc, ids.owner, 'will roll back', 'LAWYER', db)).resolves.toBe(false);

    // The canonical decision and every legacy side effect were written inside
    // ONE transaction: nothing may survive the forced failure.
    const review = await db.documentReview.findUniqueOrThrow({ where: { id: rx.review } });
    expect(review.status).toBe('IN_REVIEW');
    expect(review.approvedVersionId).toBeNull();
    expect(review.completedAt).toBeNull();
    expect(await db.reviewDecision.count({ where: { reviewId: rx.review } })).toBe(0);
    const doc = await db.document.findUniqueOrThrow({ where: { id: rx.doc } });
    expect(doc.folder).toBe('REVIEW');
    const caseRow = await db.case.findUniqueOrThrow({ where: { id: rx.case } });
    expect(caseRow.status).toBe('IN_REVIEW');
    expect(await db.timelineEvent.count({ where: { caseId: rx.case, eventType: 'DOCUMENT_APPROVED' } })).toBe(0);
    expect(sharepointCheckins).toBe(before);
  });

  it('8. serializes concurrent legacy approvals into exactly one committed decision', async () => {
    const cx = {
      case: 'e3000000-0000-4000-8000-000000000041',
      doc: 'e4000000-0000-4000-8000-000000000041',
      v1: 'e5000000-0000-4000-8000-000000000041',
      v2: 'e5000000-0000-4000-8000-000000000042',
      review: 'ef000000-0000-4000-8000-000000000041',
      round: 'ef000000-0000-4000-8000-000000000042',
    };
    await db.case.create({ data: { id: cx.case, caseNumber: 'LREV-004', title: 'Concurrent legacy review case', caseType: 'CONTRACT_REVIEW', clientId: ids.client, createdById: ids.owner, assignedLawyerId: ids.owner, status: 'IN_REVIEW' } });
    await db.document.create({ data: { id: cx.doc, name: 'Concurrent doc', fileName: 'concurrent.txt', category: 'CONTRACT', documentType: 'CONTRACT', mimeType: 'text/plain', caseId: cx.case, clientId: ids.client, currentVersion: 2, currentVersionInt: 2, version: '2', spItemId: 'concurrent-sp-1', folder: 'REVIEW' } });
    await db.documentVersion.createMany({ data: [
      { id: cx.v1, documentId: cx.doc, version: 1, name: 'concurrent-v1.txt', originalFileName: 'concurrent-v1.txt', mimeType: 'text/plain', size: 10, storageReference: 'concurrent-v1-key', spItemId: 'concurrent-v1', isCurrent: false, uploadedById: ids.owner, versionType: 'ORIGINAL' },
      { id: cx.v2, documentId: cx.doc, version: 2, name: 'concurrent-v2.txt', originalFileName: 'concurrent-v2.txt', mimeType: 'text/plain', size: 10, storageReference: 'concurrent-v2-key', spItemId: 'concurrent-v2', isCurrent: true, uploadedById: ids.owner, previousVersionId: cx.v1 },
    ] });
    await db.documentReview.create({ data: { id: cx.review, documentId: cx.doc, documentVersionId: cx.v2, status: 'IN_REVIEW', ownerId: ids.owner, createdById: ids.owner, assignedReviewerId: ids.reviewer } });
    await db.documentReviewRound.create({ data: { id: cx.round, reviewId: cx.review, roundNumber: 1, reviewVersionId: cx.v2, status: 'IN_REVIEW', submittedAt: new Date(), createdById: ids.owner } });
    await db.documentReview.update({ where: { id: cx.review }, data: { currentRoundId: cx.round } });

    const before = sharepointCheckins;
    const secondDb = new PrismaClient({ datasources: { db: { url: databaseUrl as string } } });
    try {
      await secondDb.$connect();
      const results = await Promise.allSettled([
        documentsService.approveDocument(cx.doc, ids.owner, 'first decision', 'LAWYER', db),
        documentsService.approveDocument(cx.doc, ids.owner, 'second decision', 'LAWYER', secondDb),
      ]);
      const winners = results.filter((result) => result.status === 'fulfilled' && result.value === true);
      const losers = results.filter((result) => result.status === 'rejected');
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);
      expect((losers[0] as PromiseRejectedResult).reason?.message).toContain('transition is not allowed');

      const review = await db.documentReview.findUniqueOrThrow({ where: { id: cx.review } });
      expect(review.status).toBe('APPROVED');
      expect(await db.reviewDecision.count({ where: { reviewId: cx.review, action: 'APPROVED' } })).toBe(1);
      const doc = await db.document.findUniqueOrThrow({ where: { id: cx.doc } });
      expect(doc.folder).toBe('APPROVED');
      expect(await db.timelineEvent.count({ where: { caseId: cx.case, eventType: 'DOCUMENT_APPROVED' } })).toBe(1);
      expect(sharepointCheckins).toBe(before + 1);
    } finally {
      await secondDb.$disconnect();
    }
  }, 30_000);
});
