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
});
