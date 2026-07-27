import { PrismaClient } from '@prisma/client';
import {
  addPoint,
  createReview,
  listDecisions,
  listPoints,
  transitionReview,
  updatePoint,
} from '../src/modules/documents/review/reviewService';
import { approvalAppliesToVersion } from '../src/modules/documents/review/reviewWorkflow';

const databaseUrl = process.env.REVIEW_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const ids = {
  owner: 'e1000000-0000-4000-8000-000000000001',
  reviewer: 'e1000000-0000-4000-8000-000000000002',
  outsider: 'e1000000-0000-4000-8000-000000000003',
  client: 'e2000000-0000-4000-8000-000000000001',
  otherClient: 'e2000000-0000-4000-8000-000000000002',
  case: 'e3000000-0000-4000-8000-000000000001',
  otherCase: 'e3000000-0000-4000-8000-000000000002',
  document: 'e4000000-0000-4000-8000-000000000001',
  otherDocument: 'e4000000-0000-4000-8000-000000000002',
  v1: 'e5000000-0000-4000-8000-000000000001',
  v2: 'e5000000-0000-4000-8000-000000000002',
  v3: 'e5000000-0000-4000-8000-000000000003',
  otherV1: 'e5000000-0000-4000-8000-000000000004',
  annotation: 'e6000000-0000-4000-8000-000000000001',
  otherAnnotation: 'e6000000-0000-4000-8000-000000000002',
  comparison: 'e7000000-0000-4000-8000-000000000001',
  segment: 'e8000000-0000-4000-8000-000000000001',
  otherComparison: 'e7000000-0000-4000-8000-000000000002',
  otherSegment: 'e8000000-0000-4000-8000-000000000002',
  task: 'e9000000-0000-4000-8000-000000000001',
  otherTask: 'e9000000-0000-4000-8000-000000000002',
};

const actor = { userId: ids.owner, role: 'LAWYER' };

describeWithDatabase('Document review PostgreSQL workflow persistence', () => {
  let db: PrismaClient;

  beforeAll(async () => {
    const parsed = new URL(databaseUrl as string);
    expect(['127.0.0.1', 'localhost', '::1']).toContain(parsed.hostname);
    expect(parsed.pathname.replace(/^\//, '')).toBe('adminiculum_replay_ci');
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    await db.user.createMany({ data: [
      { id: ids.owner, email: 'review-owner@example.invalid', name: 'Review Owner', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: ids.reviewer, email: 'reviewer@example.invalid', name: 'Reviewer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      { id: ids.outsider, email: 'outsider@example.invalid', name: 'Outsider', role: 'LEGAL_ASSISTANT', status: 'ACTIVE', isActive: true, skills: [] },
    ] });
    await db.client.createMany({ data: [{ id: ids.client, name: 'Review Client' }, { id: ids.otherClient, name: 'Other Client' }] });
    await db.case.createMany({ data: [
      { id: ids.case, caseNumber: 'REV-001', title: 'Review case', caseType: 'CONTRACT_REVIEW', clientId: ids.client, createdById: ids.owner, assignedLawyerId: ids.owner },
      { id: ids.otherCase, caseNumber: 'REV-002', title: 'Other review case', caseType: 'CONTRACT_REVIEW', clientId: ids.otherClient, createdById: ids.owner, assignedLawyerId: ids.owner },
    ] });
    await db.caseCollaborator.create({ data: { caseId: ids.case, userId: ids.reviewer } });
    await db.document.createMany({ data: [
      { id: ids.document, name: 'Review document', fileName: 'review.txt', category: 'CONTRACT', documentType: 'CONTRACT', mimeType: 'text/plain', caseId: ids.case, clientId: ids.client, currentVersion: 3, currentVersionInt: 3, version: '3' },
      { id: ids.otherDocument, name: 'Other document', fileName: 'other.txt', category: 'CONTRACT', documentType: 'CONTRACT', mimeType: 'text/plain', caseId: ids.otherCase, clientId: ids.otherClient, currentVersion: 1, currentVersionInt: 1, version: '1' },
    ] });
    await db.documentVersion.createMany({ data: [
      { id: ids.v1, documentId: ids.document, version: 1, name: 'review-v1.txt', originalFileName: 'review-v1.txt', mimeType: 'text/plain', size: 10, storageReference: 'review-v1-key', spItemId: 'review-v1', isCurrent: false, uploadedById: ids.owner, versionType: 'ORIGINAL' },
      { id: ids.v2, documentId: ids.document, version: 2, name: 'review-v2.txt', originalFileName: 'review-v2.txt', mimeType: 'text/plain', size: 10, storageReference: 'review-v2-key', spItemId: 'review-v2', isCurrent: false, uploadedById: ids.owner, previousVersionId: ids.v1 },
      { id: ids.v3, documentId: ids.document, version: 3, name: 'review-v3.txt', originalFileName: 'review-v3.txt', mimeType: 'text/plain', size: 10, storageReference: 'review-v3-key', spItemId: 'review-v3', isCurrent: true, uploadedById: ids.owner, previousVersionId: ids.v2 },
      { id: ids.otherV1, documentId: ids.otherDocument, version: 1, name: 'other-v1.txt', originalFileName: 'other-v1.txt', mimeType: 'text/plain', size: 10, storageReference: 'other-v1-key', spItemId: 'other-v1', isCurrent: true, uploadedById: ids.owner },
    ] });
    await db.documentAnnotation.createMany({ data: [
      { id: ids.annotation, documentId: ids.document, documentVersionId: ids.v2, annotationType: 'REVIEW_COMMENT', anchorType: 'TEXT_RANGE', status: 'OPEN', visibility: 'INTERNAL', headline: 'Safe annotation', internalNote: 'bounded note', selectedText: 'short', createdById: ids.owner },
      { id: ids.otherAnnotation, documentId: ids.otherDocument, documentVersionId: ids.otherV1, annotationType: 'REVIEW_COMMENT', anchorType: 'TEXT_RANGE', status: 'OPEN', visibility: 'INTERNAL', headline: 'Cross annotation', createdById: ids.owner },
    ] });
    await db.documentComparison.createMany({ data: [
      { id: ids.comparison, documentId: ids.document, baseVersionId: ids.v1, targetVersionId: ids.v2, status: 'READY', algorithmRevision: 1, extractionRevision: 1, createdById: ids.owner, insertCount: 0, deleteCount: 0, replaceCount: 1, formatOnlyCount: 0, moveCandidateCount: 0, totalSegmentCount: 1, reviewedSegmentCount: 0 },
      { id: ids.otherComparison, documentId: ids.otherDocument, baseVersionId: ids.otherV1, targetVersionId: ids.otherV1, status: 'IDENTICAL', algorithmRevision: 1, extractionRevision: 1, createdById: ids.owner },
    ] });
    await db.documentChangeSegment.createMany({ data: [
      { id: ids.segment, comparisonId: ids.comparison, sequence: 0, changeType: 'REPLACE', baseExcerpt: 'old', targetExcerpt: 'new', confidence: 0.9, category: 'AMOUNT', categorySource: 'MANUAL' },
      { id: ids.otherSegment, comparisonId: ids.otherComparison, sequence: 0, changeType: 'INSERT', targetExcerpt: 'other', confidence: 1 },
    ] });
    await db.task.createMany({ data: [
      { id: ids.task, title: 'Review task', taskType: 'REVIEW_CONTRACT', status: 'PENDING', priority: 'MEDIUM', caseId: ids.case, assignedToId: ids.reviewer, assignedById: ids.owner, requiredSkills: [] },
      { id: ids.otherTask, title: 'Other task', taskType: 'REVIEW_CONTRACT', status: 'PENDING', priority: 'MEDIUM', caseId: ids.otherCase, assignedToId: ids.owner, assignedById: ids.owner, requiredSkills: [] },
    ] });
  });

  afterAll(async () => { await db?.$disconnect(); });

  it('creates one active review series with an immutable first round and decision', async () => {
    const review = await createReview(ids.document, actor, { reviewVersionId: ids.v2, reviewerId: ids.reviewer, idempotencyKey: 'review-create-1' }, db);
    expect(review.status).toBe('DRAFT');
    expect(review.currentRound?.reviewVersionId).toBe(ids.v2);
    expect(review.rounds).toHaveLength(1);
    expect(await db.reviewDecision.count({ where: { reviewId: review.id, action: 'CREATED' } })).toBe(1);
    const reused = await createReview(ids.document, actor, { reviewVersionId: ids.v2, reviewerId: ids.reviewer, idempotencyKey: 'review-create-1' }, db);
    expect(reused.id).toBe(review.id);
    await expect(db.documentReview.create({ data: { documentId: ids.document, documentVersionId: ids.v2, createdById: ids.owner, ownerId: ids.owner, status: 'DRAFT' } })).rejects.toThrow();
  });

  it('enforces reviewer authorization, point source links, and task scope', async () => {
    const review = await db.documentReview.findFirstOrThrow({ where: { documentId: ids.document } });
    await expect(transitionReview(review.id, 'ASSIGN', actor, { reviewerId: ids.outsider, expectedRevision: review.revision }, db)).rejects.toMatchObject({ code: 'REVIEWER_NO_ACCESS' });
    const assigned = await transitionReview(review.id, 'ASSIGN', actor, { reviewerId: ids.reviewer, expectedRevision: review.revision }, db);
    expect(assigned.status).toBe('ASSIGNED');
    await expect(transitionReview(review.id, 'START', { userId: ids.outsider, role: 'LEGAL_ASSISTANT' }, {}, db)).rejects.toMatchObject({ code: 'ACTOR_NOT_AUTHORIZED' });
    await transitionReview(review.id, 'START', { userId: ids.reviewer, role: 'LAWYER' }, { expectedRevision: assigned.revision }, db);
    const whole = await addPoint(review.id, actor, { type: 'WHOLE_DOCUMENT', title: 'Whole document review point', severity: 'NORMAL', linkedTaskId: ids.task }, db);
    expect(whole.type).toBe('WHOLE_DOCUMENT');
    await expect(addPoint(review.id, actor, { type: 'ANNOTATION', title: 'Bad annotation', annotationId: ids.otherAnnotation }, db)).rejects.toMatchObject({ code: 'ANNOTATION_NOT_IN_REVIEW_DOCUMENT' });
    const annotation = await addPoint(review.id, actor, { type: 'ANNOTATION', title: 'Annotation point', annotationId: ids.annotation }, db);
    expect(annotation.annotationId).toBe(ids.annotation);
    await expect(addPoint(review.id, actor, { type: 'COMPARISON_CHANGE', title: 'Bad segment', comparisonSegmentId: ids.otherSegment }, db)).rejects.toMatchObject({ code: 'SEGMENT_NOT_IN_REVIEW_DOCUMENT' });
    await expect(addPoint(review.id, actor, { type: 'WHOLE_DOCUMENT', title: 'Bad task', linkedTaskId: ids.otherTask }, db)).rejects.toMatchObject({ code: 'TASK_NOT_IN_REVIEW_CASE' });
    const segment = await addPoint(review.id, actor, { type: 'COMPARISON_CHANGE', title: 'Blocking comparison point', severity: 'BLOCKING', comparisonSegmentId: ids.segment }, db);
    expect(segment.comparisonSegmentId).toBe(ids.segment);
    const points = await listPoints(review.id, actor, { limit: 10 }, db);
    expect(points.total).toBe(3);
  });

  it('blocks approval, creates a newer round, carries unresolved lineage, then approves exact version only', async () => {
    let review = await db.documentReview.findFirstOrThrow({ where: { documentId: ids.document } });
    await expect(transitionReview(review.id, 'APPROVE', actor, { versionId: ids.v2, expectedRevision: review.revision }, db)).rejects.toMatchObject({ code: 'BLOCKING_POINTS_OPEN' });
    await transitionReview(review.id, 'REQUEST_CHANGES', actor, { safeRationale: 'Changes are required for blocking point.', expectedRevision: review.revision }, db);
    review = await db.documentReview.findFirstOrThrow({ where: { documentId: ids.document } });
    await expect(transitionReview(review.id, 'RESUBMIT', actor, { versionId: ids.v2, expectedRevision: review.revision }, db)).rejects.toMatchObject({ code: 'NEWER_VERSION_REQUIRED' });
    const resubmitted = await transitionReview(review.id, 'RESUBMIT', actor, { versionId: ids.v3, expectedRevision: review.revision }, db);
    expect(resubmitted.status).toBe('RESUBMITTED');
    expect(resubmitted.currentRoundNumber).toBe(2);
    expect(resubmitted.currentRound?.reviewVersionId).toBe(ids.v3);
    const rounds = await db.documentReviewRound.findMany({ where: { reviewId: review.id }, orderBy: { roundNumber: 'asc' } });
    expect(rounds.map((r) => r.reviewVersionId)).toEqual([ids.v2, ids.v3]);
    const carried = await db.reviewPoint.findFirstOrThrow({ where: { reviewId: review.id, carriedFromPointId: { not: null }, severity: 'BLOCKING' } });
    expect(carried.carriedFromPointId).toBeTruthy();
    await expect(transitionReview(review.id, 'APPROVE', actor, { versionId: ids.v2, expectedRevision: resubmitted.revision }, db)).rejects.toMatchObject({ code: 'BLOCKING_POINTS_OPEN' });
    const resolved = await updatePoint(review.id, carried.id, actor, { status: 'RESOLVED', expectedRevision: carried.revision }, db);
    expect(resolved.status).toBe('RESOLVED');
    const beforeComparison = await db.documentChangeSegment.findUniqueOrThrow({ where: { id: ids.segment } });
    const beforeAnnotation = await db.documentAnnotation.findUniqueOrThrow({ where: { id: ids.annotation } });
    const refreshed = await db.documentReview.findUniqueOrThrow({ where: { id: review.id } });
    const approved = await transitionReview(review.id, 'APPROVE', actor, { versionId: ids.v3, expectedRevision: refreshed.revision }, db);
    expect(approved.approvedVersionId).toBe(ids.v3);
    expect(approvalAppliesToVersion(approved.approvedVersionId, ids.v2)).toBe(false);
    expect((await db.documentChangeSegment.findUniqueOrThrow({ where: { id: ids.segment } })).reviewState).toBe(beforeComparison.reviewState);
    expect((await db.documentAnnotation.findUniqueOrThrow({ where: { id: ids.annotation } })).status).toBe(beforeAnnotation.status);
    const closed = await transitionReview(review.id, 'CLOSE', actor, { expectedRevision: approved.revision }, db);
    expect(closed.status).toBe('CLOSED');
    expect(await db.notification.count({ where: { userId: ids.reviewer, type: 'REVIEW_REQUESTED' } })).toBeGreaterThan(0);
    expect(await db.timelineEvent.count({ where: { documentId: ids.document, type: { startsWith: 'DOCUMENT_REVIEW_' } } })).toBeGreaterThan(0);
    const decisionCount = await db.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM review_decisions WHERE "reviewId" = ${review.id}`;
    expect(decisionCount[0].count).toBeGreaterThanOrEqual(9);
  });

  it('keeps decision history immutable and DTO-safe at the table level', async () => {
    const review = await db.documentReview.findFirstOrThrow({ where: { documentId: ids.document } });
    const decisions = await listDecisions(review.id, actor, { limit: 100 }, db);
    expect(decisions.items.map((d) => d.action)).toEqual(expect.arrayContaining(['CREATED', 'ASSIGNED', 'STARTED', 'POINT_ADDED', 'CHANGES_REQUESTED', 'RESUBMITTED', 'POINT_UPDATED', 'APPROVED', 'CLOSED']));
    expect(JSON.stringify(decisions.items)).not.toMatch(/storageReference|workspaceText|clientPortal|portalGrant|review-v\d-key/);
    expect(await db.documentVersion.findUniqueOrThrow({ where: { id: ids.v3 } })).toMatchObject({ publicationStatus: 'INTERNAL_ONLY' });
  });
});
