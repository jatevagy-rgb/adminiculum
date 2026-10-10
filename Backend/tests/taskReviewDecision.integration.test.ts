import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { TaskSubmissionService } from '../src/modules/tasks/taskSubmission.service';
import { TaskReviewDecisionService } from '../src/modules/tasks/taskReviewDecision.service';

const databaseUrl = process.env.TASK_REVIEW_DECISION_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('Exact submitted document review round context (PostgreSQL)', () => {
  let db: PrismaClient;
  let service: TaskReviewDecisionService;
  beforeAll(async () => {
    const parsed = new URL(databaseUrl!);
    expect(['127.0.0.1', 'localhost', '::1']).toContain(parsed.hostname);
    expect(parsed.pathname.slice(1)).toMatch(/^adminiculum_task_review_decision_backend_/);
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    service = new TaskReviewDecisionService(db);
  });
  afterAll(async () => { await db?.$disconnect(); });

  async function fixture() {
    const user = async (role: 'LAWYER' | 'PARTNER' | 'ADMIN' | 'CLIENT') => {
      const id = randomUUID();
      return db.user.create({ data: { id, email: `${id}@round-context.invalid`, name: role, role, status: 'ACTIVE', isActive: true, skills: [] } });
    };
    const reviewer = await user('PARTNER'), worker = await user('LAWYER'), outsider = await user('ADMIN'), external = await user('CLIENT');
    const client = await db.client.create({ data: { name: 'Synthetic round context' } });
    const caseRow = await db.case.create({ data: { caseNumber: randomUUID(), title: 'Round context', caseType: 'CONTRACT_REVIEW', clientId: client.id, createdById: reviewer.id, assignedLawyerId: reviewer.id } });
    const foreignCase = await db.case.create({ data: { caseNumber: randomUUID(), title: 'Other case', caseType: 'CONTRACT_REVIEW', clientId: client.id, createdById: outsider.id, assignedLawyerId: outsider.id } });
    const document = await db.document.create({ data: { name: 'Submitted document', category: 'OTHER', caseId: caseRow.id, clientId: client.id, currentVersion: 3 } });
    const foreignDocument = await db.document.create({ data: { name: 'Other document', category: 'OTHER', caseId: foreignCase.id, clientId: client.id } });
    const version = (documentId: string, number: number, isCurrent: boolean) => db.documentVersion.create({ data: { documentId, version: number, name: `v${number}`, originalFileName: `v${number}.docx`, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 1, isCurrent, uploadedById: worker.id } });
    const v1 = await version(document.id, 1, false), v2 = await version(document.id, 2, false), v3 = await version(document.id, 3, true), foreignVersion = await version(foreignDocument.id, 1, true);
    const task = await db.task.create({ data: { title: 'Exact round task', taskType: 'OTHER', status: 'IN_REVIEW', priority: 'MEDIUM', requiredSkills: [], caseId: caseRow.id, assignedToId: worker.id, assignedById: reviewer.id } });
    const submission = await db.taskSubmission.create({ data: { taskId: task.id, revisionNumber: 1, status: 'SUBMITTED', createdById: worker.id, submittedById: worker.id, assignedReviewerId: reviewer.id, submittedAt: new Date(), idempotencyKey: randomUUID() } });
    const link = await db.taskSubmissionDocument.create({ data: { submissionId: submission.id, documentId: document.id, documentVersionId: v1.id, role: 'PRIMARY_OUTPUT', createdById: worker.id } });
    const review = await db.documentReview.create({ data: { documentId: document.id, documentVersionId: v1.id, status: 'APPROVED', currentRoundNumber: 3, approvedVersionId: v3.id, createdById: worker.id, assignedReviewerId: reviewer.id } });
    const round = (roundNumber: number, reviewVersionId: string, status: 'CHANGES_REQUESTED' | 'APPROVED') => db.documentReviewRound.create({ data: { reviewId: review.id, roundNumber, reviewVersionId, status, createdById: reviewer.id } });
    const r1 = await round(1, v1.id, 'CHANGES_REQUESTED'), r2 = await round(2, v2.id, 'CHANGES_REQUESTED'), r3 = await round(3, v3.id, 'APPROVED');
    await db.documentReview.update({ where: { id: review.id }, data: { currentRoundId: r3.id } });
    await db.reviewPoint.createMany({ data: [
      { reviewRoundId: r1.id, status: 'OPEN' as const, severity: 'BLOCKING' as const },
      { reviewRoundId: r1.id, status: 'RESOLVED' as const, severity: 'NORMAL' as const },
      { reviewRoundId: r2.id, status: 'ANSWERED' as const, severity: 'NORMAL' as const },
      { reviewRoundId: r2.id, status: 'OPEN' as const, severity: 'BLOCKING' as const },
      { reviewRoundId: r3.id, status: 'RESOLVED' as const, severity: 'NORMAL' as const },
    ].map(point => ({ ...point, reviewId: review.id, type: 'WHOLE_DOCUMENT', title: 'Round-owned point', createdById: reviewer.id })) });
    await db.reviewDecision.createMany({ data: [
      { reviewRoundId: r1.id, versionId: v1.id, action: 'CHANGES_REQUESTED' as const, createdAt: new Date('2026-01-01T12:00:00Z') },
      { reviewRoundId: r2.id, versionId: v2.id, action: 'STARTED' as const, createdAt: new Date('2026-02-01T12:00:00Z') },
      { reviewRoundId: r3.id, versionId: v3.id, action: 'APPROVED' as const, createdAt: new Date('2026-03-01T12:00:00Z') },
    ].map(decision => ({ ...decision, reviewId: review.id, actorId: reviewer.id })) });
    const detail = () => service.getReviewDetail(task.id, submission.id, reviewer.id);
    return { reviewer, worker, outsider, external, document, foreignDocument, foreignVersion, v1, v2, v3, task, submission, link, review, r1, r2, r3, detail };
  }

  it('projects historical round status, old points and old decision despite a newer approved current round', async () => {
    const f = await fixture();
    const detail = await f.detail();
    expect(detail.outputs[0].newerVersionExists).toBe(true);
    expect(detail.permittedActions.approve).toBe(true);
    expect(detail.documentReviews[0]).toMatchObject({ documentId: f.document.id, documentVersionId: f.v1.id, unavailableReason: null });
    expect(detail.documentReviews[0].reviews).toEqual([expect.objectContaining({
      id: f.review.id, roundId: f.r1.id, roundNumber: 1, currentRoundNumber: 3, status: 'CHANGES_REQUESTED', documentVersionId: f.v1.id,
      counts: { open: 1, blocking: 1, total: 2 }, approvedVersionId: null,
      lastDecision: expect.objectContaining({ action: 'CHANGES_REQUESTED', versionId: f.v1.id }), reviewLink: null,
    })]);
    expect(detail.documentReviews[0].reviews[0].rounds.map(r => r.id)).toEqual([f.r1.id]);
    expect(await db.taskReviewDecision.count({ where: { submissionId: f.submission.id } })).toBe(0);
    expect((await db.documentReview.findUniqueOrThrow({ where: { id: f.review.id } })).approvedVersionId).toBe(f.v3.id);
  });

  it('finds an intermediate submitted version through its round even when neither initial nor current', async () => {
    const f = await fixture();
    await db.taskSubmissionDocument.update({ where: { id: f.link.id }, data: { documentVersionId: f.v2.id } });
    const entry = (await f.detail()).documentReviews[0].reviews[0];
    expect(entry).toMatchObject({ roundId: f.r2.id, roundNumber: 2, status: 'CHANGES_REQUESTED', counts: { open: 2, blocking: 1, total: 2 }, lastDecision: { action: 'STARTED', versionId: f.v2.id } });
  });

  it('keeps current-version context exact too', async () => {
    const f = await fixture();
    await db.taskSubmissionDocument.update({ where: { id: f.link.id }, data: { documentVersionId: f.v3.id } });
    const entry = (await f.detail()).documentReviews[0].reviews[0];
    expect(entry).toMatchObject({ roundId: f.r3.id, status: 'APPROVED', counts: { open: 0, blocking: 0, total: 1 }, approvedVersionId: f.v3.id, lastDecision: { action: 'APPROVED', versionId: f.v3.id } });
  });

  it('keeps multiple explicit rounds for the same version separate instead of choosing or aggregating', async () => {
    const f = await fixture();
    const repeated = await db.documentReviewRound.create({ data: { reviewId: f.review.id, roundNumber: 4, reviewVersionId: f.v1.id, status: 'DRAFT', createdById: f.reviewer.id } });
    const entries = (await f.detail()).documentReviews[0].reviews;
    expect(entries.map(r => [r.roundId, r.counts?.total])).toEqual([[f.r1.id, 2], [repeated.id, 0]]);
    expect(entries[1].lastDecision).toBeNull();
  });

  it('reports missing round provenance instead of falling back to current-round facts', async () => {
    const f = await fixture();
    await db.documentReviewRound.delete({ where: { id: f.r1.id } });
    expect((await f.detail()).documentReviews[0]).toMatchObject({ unavailableReason: 'SOURCE_ROUND_BINDING_GAP', reviews: [] });
  });

  it('does not attach an unbound decision to a round using only its version or timestamp', async () => {
    const f = await fixture();
    await db.reviewDecision.create({ data: { reviewId: f.review.id, reviewRoundId: null, action: 'APPROVED', actorId: f.reviewer.id, versionId: f.v1.id } });
    expect((await f.detail()).documentReviews[0].reviews[0]).toMatchObject({ lastDecision: null, lastDecisionUnavailableReason: 'SOURCE_ROUND_BINDING_GAP', approvedVersionId: null });
  });

  it('reports an orphaned intermediate-version decision as a binding gap, not absence of review', async () => {
    const f = await fixture();
    await db.taskSubmissionDocument.update({ where: { id: f.link.id }, data: { documentVersionId: f.v2.id } });
    await db.documentReviewRound.delete({ where: { id: f.r2.id } });
    expect((await f.detail()).documentReviews[0]).toMatchObject({ unavailableReason: 'SOURCE_ROUND_BINDING_GAP', reviews: [] });
  });

  it('accepts round-bound point decisions with no redundant version but rejects conflicting decision versions', async () => {
    const f = await fixture();
    await db.reviewDecision.create({ data: { reviewId: f.review.id, reviewRoundId: f.r1.id, action: 'POINT_UPDATED', actorId: f.reviewer.id } });
    expect((await f.detail()).documentReviews[0].reviews[0].lastDecision?.action).toBe('POINT_UPDATED');
    await db.reviewDecision.create({ data: { reviewId: f.review.id, reviewRoundId: f.r1.id, versionId: f.v3.id, action: 'APPROVED', actorId: f.reviewer.id } });
    expect((await f.detail()).documentReviews[0].reviews[0]).toMatchObject({ lastDecision: null, lastDecisionUnavailableReason: 'SOURCE_ROUND_BINDING_GAP', approvedVersionId: null });
  });

  it('rejects unauthorized actors and mismatched task/submission identity', async () => {
    const f = await fixture();
    for (const actor of [f.outsider, f.external]) await expect(service.getReviewDetail(f.task.id, f.submission.id, actor.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.getReviewDetail(randomUUID(), f.submission.id, f.reviewer.id)).rejects.toMatchObject({ statusCode: 404 });
    expect((await service.getReviewDetail(f.task.id, f.submission.id, f.worker.id)).permittedActions.approve).toBe(false);
  });

  it('does not project cross-case reviews or a round bound to another document version', async () => {
    const f = await fixture();
    const foreignReview = await db.documentReview.create({ data: { documentId: f.foreignDocument.id, documentVersionId: f.foreignVersion.id, createdById: f.outsider.id } });
    await db.documentReviewRound.create({ data: { reviewId: foreignReview.id, roundNumber: 1, reviewVersionId: f.foreignVersion.id, createdById: f.outsider.id } });
    await db.taskSubmissionDocument.update({ where: { id: f.link.id }, data: { documentId: f.foreignDocument.id, documentVersionId: f.foreignVersion.id } });
    expect((await f.detail()).documentReviews[0].reviews).toEqual([]);
    await db.taskSubmissionDocument.update({ where: { id: f.link.id }, data: { documentId: f.document.id, documentVersionId: f.foreignVersion.id } });
    await db.documentReviewRound.create({ data: { reviewId: f.review.id, roundNumber: 4, reviewVersionId: f.foreignVersion.id, createdById: f.reviewer.id } });
    expect((await f.detail()).documentReviews[0]).toMatchObject({ unavailableReason: 'SOURCE_ROUND_BINDING_GAP', reviews: [] });
  });

  it('fails closed on inconsistent point/decision review IDs instead of leaking another review', async () => {
    const f = await fixture();
    const other = await db.documentReview.create({ data: { documentId: f.foreignDocument.id, documentVersionId: f.foreignVersion.id, createdById: f.outsider.id } });
    await db.reviewPoint.create({ data: { reviewId: other.id, reviewRoundId: f.r1.id, type: 'WHOLE_DOCUMENT', title: 'Foreign point', severity: 'BLOCKING', createdById: f.outsider.id } });
    await db.reviewDecision.create({ data: { reviewId: other.id, reviewRoundId: f.r1.id, versionId: f.v1.id, action: 'APPROVED', actorId: f.outsider.id } });
    expect((await f.detail()).documentReviews[0].reviews[0]).toMatchObject({ counts: null, lastDecision: null, lastDecisionUnavailableReason: 'SOURCE_ROUND_BINDING_GAP', approvedVersionId: null });
  });
});

const ids = {
  worker: '11000000-0000-4000-8000-000000000001',
  reviewer: '11000000-0000-4000-8000-000000000002',
  wrongWorker: '11000000-0000-4000-8000-000000000003',
  unrelated: '11000000-0000-4000-8000-000000000004',
  clientActor: '11000000-0000-4000-8000-000000000005',
  client: '21000000-0000-4000-8000-000000000001',
  matter: '31000000-0000-4000-8000-000000000001',
  case: '41000000-0000-4000-8000-000000000001',
  lifecycleTask: '51000000-0000-4000-8000-000000000001',
  externalTask: '51000000-0000-4000-8000-000000000002',
  selfReviewTask: '51000000-0000-4000-8000-000000000003',
  wrongReviewerTask: '51000000-0000-4000-8000-000000000004',
  rollbackReturnTask: '51000000-0000-4000-8000-000000000005',
  rollbackApprovalTask: '51000000-0000-4000-8000-000000000006',
  document: '61000000-0000-4000-8000-000000000001',
  documentVersion: '62000000-0000-4000-8000-000000000001',
  time1: '71000000-0000-4000-8000-000000000001',
  time2: '71000000-0000-4000-8000-000000000002',
  lifecycleSubmission: '91000000-0000-4000-8000-000000000001',
  externalSubmission: '91000000-0000-4000-8000-000000000002',
  selfReviewSubmission: '91000000-0000-4000-8000-000000000003',
  wrongReviewerSubmission: '91000000-0000-4000-8000-000000000004',
  rollbackReturnSubmission: '91000000-0000-4000-8000-000000000005',
  rollbackApprovalSubmission: '91000000-0000-4000-8000-000000000006',
  unboundTask: '51000000-0000-4000-8000-000000000007',
  unboundDocument: '61000000-0000-4000-8000-000000000002',
  unboundTime: '71000000-0000-4000-8000-000000000003',
  unboundSubmission: '91000000-0000-4000-8000-000000000007',
};

describeWithDatabase('TaskReviewDecisionService PostgreSQL lifecycle', () => {
  let db: PrismaClient;
  let submissionService: TaskSubmissionService;
  let reviewService: TaskReviewDecisionService;
  let revisedSubmissionId: string;

  beforeAll(async () => {
    const parsed = new URL(databaseUrl as string);
    expect(['127.0.0.1', 'localhost', '::1']).toContain(parsed.hostname);
    expect(parsed.pathname.replace(/^\//, '')).toMatch(/^adminiculum_task_review_decision_backend_/);
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    const identity = await db.$queryRaw<Array<{ database_name: string }>>`SELECT current_database() AS database_name`;
    expect(identity[0].database_name).toBe(parsed.pathname.replace(/^\//, ''));
    submissionService = new TaskSubmissionService(db);
    reviewService = new TaskReviewDecisionService(db);

    await db.user.createMany({
      data: [
        { id: ids.worker, email: 'review-worker@example.invalid', name: 'Review Worker', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
        { id: ids.reviewer, email: 'review-supervisor@example.invalid', name: 'Review Supervisor', role: 'PARTNER', status: 'ACTIVE', isActive: true, skills: [] },
        { id: ids.wrongWorker, email: 'review-wrong-worker@example.invalid', name: 'Wrong Worker', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
        { id: ids.unrelated, email: 'review-unrelated@example.invalid', name: 'Unrelated User', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] },
        { id: ids.clientActor, email: 'review-client@example.invalid', name: 'External Client', role: 'CLIENT', status: 'ACTIVE', isActive: true, skills: [] },
      ],
    });
    await db.client.create({ data: { id: ids.client, name: 'Synthetic review client' } });
    await db.matter.create({ data: { id: ids.matter, title: 'Synthetic review matter', matterType: 'CONTRACT', clientId: ids.client } });
    await db.case.create({
      data: {
        id: ids.case,
        caseNumber: 'TRD-BACKEND-001',
        title: 'Synthetic review case',
        caseType: 'CONTRACT_REVIEW',
        clientId: ids.client,
        matterId: ids.matter,
        createdById: ids.reviewer,
        assignedLawyerId: ids.reviewer,
      },
    });
    await db.task.createMany({
      data: [
        { id: ids.lifecycleTask, assignedToId: ids.worker, assignedById: ids.reviewer },
        { id: ids.externalTask, assignedToId: ids.worker, assignedById: ids.reviewer },
        { id: ids.selfReviewTask, assignedToId: ids.worker, assignedById: ids.reviewer },
        { id: ids.wrongReviewerTask, assignedToId: ids.wrongWorker, assignedById: null },
        { id: ids.rollbackReturnTask, assignedToId: ids.worker, assignedById: ids.reviewer },
        { id: ids.rollbackApprovalTask, assignedToId: ids.worker, assignedById: ids.reviewer },
      ].map((task, index) => ({
        ...task,
        title: `Synthetic review task ${index + 1}`,
        taskType: 'OTHER' as const,
        status: 'IN_REVIEW' as const,
        priority: 'MEDIUM' as const,
        requiredSkills: [],
        caseId: ids.case,
        matterId: ids.matter,
        submittedAt: new Date(),
      })),
    });
    await db.document.create({ data: { id: ids.document, name: 'Synthetic review output', category: 'OTHER', caseId: ids.case, clientId: ids.client } });
    // Schema-valid current DocumentVersion for the intended successful path:
    // the real submission contract binds every output to an exact version at
    // attach time, so the revised resubmission needs a current version to bind.
    await db.documentVersion.create({
      data: {
        id: ids.documentVersion,
        documentId: ids.document,
        version: 1,
        name: 'Synthetic review output v1',
        originalFileName: 'synthetic-review-output.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 1,
        isCurrent: true,
        uploadedById: ids.worker,
      },
    });
    await db.timeEntry.createMany({
      data: [
        { id: ids.time1, workType: 'DRAFTING', description: 'Synthetic original work', minutes: 40, billable: true, matterId: ids.matter, taskId: ids.lifecycleTask, userId: ids.worker },
        // The revision time entry is bound to the same task and matter it
        // evidences, matching the real Leadás scope contract.
        { id: ids.time2, workType: 'REVIEW', description: 'Synthetic revision work', minutes: 20, billable: false, matterId: ids.matter, taskId: ids.lifecycleTask, userId: ids.worker },
      ],
    });

    const submittedAt = new Date('2026-07-18T08:00:00.000Z');
    await db.taskSubmission.createMany({
      data: [
        {
          id: ids.lifecycleSubmission, taskId: ids.lifecycleTask, revisionNumber: 1, status: 'SUBMITTED',
          createdById: ids.worker, submittedById: ids.worker, assignedReviewerId: ids.reviewer,
          workSummary: 'Privileged lifecycle work summary', remainingIssues: 'Privileged lifecycle issue', reviewerNote: 'Private submitter note',
          requestedAttention: 'DETAILED_REVIEW', submittedAt, idempotencyKey: 'seed-lifecycle-submit',
        },
        {
          id: ids.externalSubmission, taskId: ids.externalTask, revisionNumber: 1, status: 'SUBMITTED',
          createdById: ids.worker, submittedById: ids.worker, assignedReviewerId: ids.reviewer,
          workSummary: 'External action work', requestedAttention: 'APPROVAL', submittedAt,
          externalActionRequired: true, externalActionType: 'CLIENT_SEND', idempotencyKey: 'seed-external-submit',
          zeroTimeConfirmed: true, zeroTimeConfirmedById: ids.worker, zeroTimeConfirmedAt: submittedAt,
        },
        {
          id: ids.selfReviewSubmission, taskId: ids.selfReviewTask, revisionNumber: 1, status: 'SUBMITTED',
          createdById: ids.wrongWorker, submittedById: ids.wrongWorker, assignedReviewerId: ids.worker,
          workSummary: 'Self review work', requestedAttention: 'APPROVAL', submittedAt,
          idempotencyKey: 'seed-self-submit', zeroTimeConfirmed: true, zeroTimeConfirmedById: ids.wrongWorker, zeroTimeConfirmedAt: submittedAt,
        },
        {
          id: ids.wrongReviewerSubmission, taskId: ids.wrongReviewerTask, revisionNumber: 1, status: 'SUBMITTED',
          createdById: ids.worker, submittedById: ids.worker, assignedReviewerId: ids.reviewer,
          workSummary: 'Wrong reviewer work', requestedAttention: 'APPROVAL', submittedAt,
          idempotencyKey: 'seed-wrong-reviewer-submit', zeroTimeConfirmed: true, zeroTimeConfirmedById: ids.worker, zeroTimeConfirmedAt: submittedAt,
        },
        {
          id: ids.rollbackReturnSubmission, taskId: ids.rollbackReturnTask, revisionNumber: 1, status: 'SUBMITTED',
          createdById: ids.worker, submittedById: ids.worker, assignedReviewerId: ids.reviewer,
          workSummary: 'Rollback return work', requestedAttention: 'APPROVAL', submittedAt,
          idempotencyKey: 'seed-rollback-return-submit', zeroTimeConfirmed: true, zeroTimeConfirmedById: ids.worker, zeroTimeConfirmedAt: submittedAt,
        },
        {
          id: ids.rollbackApprovalSubmission, taskId: ids.rollbackApprovalTask, revisionNumber: 1, status: 'SUBMITTED',
          createdById: ids.worker, submittedById: ids.worker, assignedReviewerId: ids.reviewer,
          workSummary: 'Rollback approval work', requestedAttention: 'APPROVAL', submittedAt,
          idempotencyKey: 'seed-rollback-approval-submit', zeroTimeConfirmed: true, zeroTimeConfirmedById: ids.worker, zeroTimeConfirmedAt: submittedAt,
        },
      ],
    });
    await db.taskSubmissionDocument.create({
      data: { submissionId: ids.lifecycleSubmission, documentId: ids.document, role: 'PRIMARY_OUTPUT', createdById: ids.worker },
    });
    await db.taskSubmissionTimeEntry.create({ data: { submissionId: ids.lifecycleSubmission, timeEntryId: ids.time1 } });
  }, 60_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('returns a safe review detail to the assigned reviewer and submitter', async () => {
    const reviewerDetail = await reviewService.getReviewDetail(ids.lifecycleTask, ids.lifecycleSubmission, ids.reviewer);
    const submitterDetail = await reviewService.getReviewDetail(ids.lifecycleTask, ids.lifecycleSubmission, ids.worker);
    expect(reviewerDetail.permittedActions).toEqual(expect.objectContaining({ return: true, approve: true, revise: false }));
    expect(reviewerDetail.outputs[0]).toEqual(expect.objectContaining({ documentId: ids.document, role: 'PRIMARY_OUTPUT' }));
    expect(reviewerDetail.time).toEqual(expect.objectContaining({ totalMinutes: 40, billableMinutes: 40, nonBillableMinutes: 0 }));
    expect(submitterDetail.permittedActions.return).toBe(false);
    const serialized = JSON.stringify(reviewerDetail).toLowerCase();
    for (const forbidden of ['workspacetext', 'storagepath', 'spitemid', 'spweburl', 'providerpayload', 'passwordhash']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('hides submissions from unrelated privileged and client actors before replay lookup', async () => {
    await expect(reviewService.getReviewDetail(ids.lifecycleTask, ids.lifecycleSubmission, ids.unrelated)).rejects.toMatchObject({ statusCode: 404 });
    await expect(reviewService.getReviewDetail(ids.lifecycleTask, ids.lifecycleSubmission, ids.clientActor)).rejects.toMatchObject({ statusCode: 404 });
    await expect(reviewService.returnSubmission(
      ids.lifecycleTask, ids.lifecycleSubmission, ids.unrelated, 'return-main-key', 'stolen-version',
      { note: 'x', requestedCorrections: 'y', requiresFullReview: false },
    )).rejects.toMatchObject({ statusCode: 404 });
  });

  it('denies submitter decisions, wrong reviewer decisions and self-review', async () => {
    await expect(db.taskSubmission.create({
      data: {
        taskId: ids.selfReviewTask,
        revisionNumber: 2,
        status: 'SUBMITTED',
        createdById: ids.worker,
        submittedById: ids.worker,
        assignedReviewerId: ids.worker,
        workSummary: 'Forbidden direct self review',
        requestedAttention: 'APPROVAL',
        submittedAt: new Date('2026-07-18T08:30:00.000Z'),
        idempotencyKey: 'forbidden-self-submit',
        zeroTimeConfirmed: true,
        zeroTimeConfirmedById: ids.worker,
        zeroTimeConfirmedAt: new Date('2026-07-18T08:30:00.000Z'),
      },
    })).rejects.toThrow('task_submissions_not_self_reviewing_check');
    const detail = await reviewService.getReviewDetail(ids.lifecycleTask, ids.lifecycleSubmission, ids.worker);
    await expect(reviewService.approveSubmission(
      ids.lifecycleTask, ids.lifecycleSubmission, ids.worker, 'worker-approve-key', detail.reviewVersion, {},
    )).rejects.toMatchObject({ statusCode: 403, code: 'REVIEW_FORBIDDEN' });
    const wrongDetail = await reviewService.getReviewDetail(ids.wrongReviewerTask, ids.wrongReviewerSubmission, ids.wrongWorker);
    await expect(reviewService.returnSubmission(
      ids.wrongReviewerTask, ids.wrongReviewerSubmission, ids.wrongWorker, 'wrong-reviewer-key', wrongDetail.reviewVersion,
      { note: 'Not allowed', requestedCorrections: 'Not allowed', requiresFullReview: false },
    )).rejects.toMatchObject({ statusCode: 403, code: 'REVIEW_FORBIDDEN' });
    const selfDetail = await reviewService.getReviewDetail(ids.selfReviewTask, ids.selfReviewSubmission, ids.worker);
    await expect(reviewService.approveSubmission(
      ids.selfReviewTask, ids.selfReviewSubmission, ids.worker, 'self-review-key', selfDetail.reviewVersion, {},
    )).rejects.toMatchObject({ statusCode: 409, code: 'SELF_REVIEW_NOT_ALLOWED' });
  });

  it('requires current review detail, return note and correction instructions', async () => {
    const detail = await reviewService.getReviewDetail(ids.lifecycleTask, ids.lifecycleSubmission, ids.reviewer);
    await expect(reviewService.returnSubmission(
      ids.lifecycleTask, ids.lifecycleSubmission, ids.reviewer, 'missing-note-key', detail.reviewVersion,
      { note: '', requestedCorrections: 'Correction', requiresFullReview: true },
    )).rejects.toMatchObject({ code: 'RETURN_NOTE_REQUIRED' });
    await expect(reviewService.returnSubmission(
      ids.lifecycleTask, ids.lifecycleSubmission, ids.reviewer, 'missing-corrections-key', detail.reviewVersion,
      { note: 'Review', requestedCorrections: '', requiresFullReview: true },
    )).rejects.toMatchObject({ code: 'REQUESTED_CORRECTIONS_REQUIRED' });
    await expect(reviewService.returnSubmission(
      ids.lifecycleTask, ids.lifecycleSubmission, ids.reviewer, 'missing-version-key', '',
      { note: 'Review', requestedCorrections: 'Correction', requiresFullReview: true },
    )).rejects.toMatchObject({ statusCode: 428, code: 'REVIEW_DETAIL_REQUIRED' });
    await expect(reviewService.returnSubmission(
      ids.lifecycleTask, ids.lifecycleSubmission, ids.reviewer, 'oversized-note-key', detail.reviewVersion,
      { note: 'x'.repeat(4001), requestedCorrections: 'Correction', requiresFullReview: true },
    )).rejects.toMatchObject({ statusCode: 400, code: 'REVIEW_FIELD_TOO_LONG' });
  });

  it('returns atomically and replays the identical decision without duplicates', async () => {
    const detail = await reviewService.getReviewDetail(ids.lifecycleTask, ids.lifecycleSubmission, ids.reviewer);
    const input = {
      note: 'Privileged reviewer note must stay out of audit.',
      requestedCorrections: 'Privileged requested correction must stay out of notifications.',
      requiresFullReview: true,
      correctionDeadline: '2026-07-25T12:00:00.000Z',
    };
    const results = await Promise.all([
      reviewService.returnSubmission(ids.lifecycleTask, ids.lifecycleSubmission, ids.reviewer, 'return-main-key', detail.reviewVersion, input),
      reviewService.returnSubmission(ids.lifecycleTask, ids.lifecycleSubmission, ids.reviewer, 'return-main-key', detail.reviewVersion, input),
    ]);
    expect(results.map((result) => result.idempotentReplay).sort()).toEqual([false, true]);
    expect(results[0].review.submission.status).toBe('RETURNED');
    expect((await db.task.findUnique({ where: { id: ids.lifecycleTask } }))?.status).toBe('IN_PROGRESS');
    expect(await db.taskReviewDecision.count({ where: { submissionId: ids.lifecycleSubmission } })).toBe(1);
    expect(await db.timelineEvent.count({ where: { taskId: ids.lifecycleTask, type: 'TASK_SUBMISSION_RETURNED' } })).toBe(1);
    expect(await db.notification.count({ where: { userId: ids.worker, title: 'Feladatleadás javításra visszaadva' } })).toBe(1);
  });

  it('rejects key reuse with different payload or operation', async () => {
    const detail = await reviewService.getReviewDetail(ids.lifecycleTask, ids.lifecycleSubmission, ids.reviewer);
    await expect(reviewService.returnSubmission(
      ids.lifecycleTask, ids.lifecycleSubmission, ids.reviewer, 'return-main-key', detail.reviewVersion,
      { note: 'Different', requestedCorrections: 'Different', requiresFullReview: false },
    )).rejects.toMatchObject({ statusCode: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
    await expect(reviewService.reviseSubmission(
      ids.lifecycleTask, ids.lifecycleSubmission, ids.worker, 'return-main-key',
    )).rejects.toMatchObject({ statusCode: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
    await expect(reviewService.approveSubmission(
      ids.lifecycleTask, ids.lifecycleSubmission, ids.reviewer, 'approve-returned-key', detail.reviewVersion, {},
    )).rejects.toMatchObject({ statusCode: 409, code: 'REVIEW_ALREADY_DECIDED' });
  });

  it('keeps the returned revision and its linked history immutable', async () => {
    await expect(submissionService.updateTaskSubmissionDraft(ids.lifecycleTask, ids.lifecycleSubmission, ids.worker, { workSummary: 'overwrite' })).rejects.toMatchObject({ statusCode: 409 });
    await expect(submissionService.detachSubmissionDocument(ids.lifecycleTask, ids.lifecycleSubmission, ids.document, ids.worker)).rejects.toMatchObject({ statusCode: 409 });
    await expect(submissionService.detachSubmissionTimeEntry(ids.lifecycleTask, ids.lifecycleSubmission, ids.time1, ids.worker)).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.taskSubmissionDocument.count({ where: { submissionId: ids.lifecycleSubmission } })).toBe(1);
    expect(await db.taskSubmissionTimeEntry.count({ where: { submissionId: ids.lifecycleSubmission } })).toBe(1);
  });

  it('creates one sequential corrected draft without copying frozen output or time links', async () => {
    const first = await reviewService.reviseSubmission(ids.lifecycleTask, ids.lifecycleSubmission, ids.worker, 'revise-main-key');
    const replay = await reviewService.reviseSubmission(ids.lifecycleTask, ids.lifecycleSubmission, ids.worker, 'revise-main-key');
    revisedSubmissionId = first.draft.id;
    expect(first.idempotentReplay).toBe(false);
    expect(replay).toEqual(expect.objectContaining({ idempotentReplay: true, draft: expect.objectContaining({ id: revisedSubmissionId }) }));
    expect(first.draft).toEqual(expect.objectContaining({ revisionNumber: 2, status: 'DRAFT', supersedesSubmissionId: ids.lifecycleSubmission }));
    const draft = await db.taskSubmission.findUnique({ where: { id: revisedSubmissionId } });
    expect(draft).toEqual(expect.objectContaining({ zeroTimeConfirmed: false, submittedAt: null, returnedAt: null, approvedAt: null, idempotencyKey: null }));
    expect(await db.taskSubmissionDocument.count({ where: { submissionId: revisedSubmissionId } })).toBe(0);
    expect(await db.taskSubmissionTimeEntry.count({ where: { submissionId: revisedSubmissionId } })).toBe(0);
    expect((await db.taskSubmission.findUnique({ where: { id: ids.lifecycleSubmission } }))?.status).toBe('RETURNED');
  });

  it('requires fresh output and time evidence before revised resubmission', async () => {
    const initial = await submissionService.validateSubmissionReadiness(ids.lifecycleTask, revisedSubmissionId, ids.worker);
    expect(initial.ready).toBe(false);
    expect(initial.missingPrerequisites).toEqual(expect.arrayContaining(['OUTPUT_REQUIRED', 'TIME_ENTRY_OR_ZERO_CONFIRMATION_REQUIRED']));
    await submissionService.attachSubmissionDocument(ids.lifecycleTask, revisedSubmissionId, ids.worker, { documentId: ids.document, role: 'PRIMARY_OUTPUT' });
    await submissionService.attachSubmissionTimeEntry(ids.lifecycleTask, revisedSubmissionId, ids.worker, { timeEntryId: ids.time2 });
    expect((await submissionService.validateSubmissionReadiness(ids.lifecycleTask, revisedSubmissionId, ids.worker)).ready).toBe(true);
  });

  it('fails closed on a newly prepared submission whose output has no exact document version', async () => {
    await db.task.create({
      data: {
        id: ids.unboundTask,
        title: 'Unbound output task',
        taskType: 'OTHER',
        status: 'IN_PROGRESS',
        priority: 'MEDIUM',
        requiredSkills: [],
        caseId: ids.case,
        matterId: ids.matter,
        assignedToId: ids.worker,
        assignedById: ids.reviewer,
      },
    });
    await db.document.create({ data: { id: ids.unboundDocument, name: 'Version-less output', category: 'OTHER', caseId: ids.case, clientId: ids.client } });
    await db.timeEntry.create({
      data: { id: ids.unboundTime, workType: 'REVIEW', description: 'Unbound draft work', minutes: 10, billable: false, matterId: ids.matter, taskId: ids.unboundTask, userId: ids.worker },
    });
    await db.taskSubmission.create({
      data: {
        id: ids.unboundSubmission,
        taskId: ids.unboundTask,
        revisionNumber: 1,
        status: 'DRAFT',
        createdById: ids.worker,
        assignedReviewerId: ids.reviewer,
        workSummary: 'Unbound draft summary',
        requestedAttention: 'APPROVAL',
      },
    });

    // Attaching a document with no DocumentVersion binds a null version; the
    // new Leadás must still fail closed with EXACT_VERSION_REQUIRED instead of
    // floating an unversioned output into review.
    await submissionService.attachSubmissionDocument(ids.unboundTask, ids.unboundSubmission, ids.worker, { documentId: ids.unboundDocument, role: 'PRIMARY_OUTPUT' });
    await submissionService.attachSubmissionTimeEntry(ids.unboundTask, ids.unboundSubmission, ids.worker, { timeEntryId: ids.unboundTime });

    const link = await db.taskSubmissionDocument.findFirst({ where: { submissionId: ids.unboundSubmission } });
    expect(link?.documentVersionId).toBeNull();
    const readiness = await submissionService.validateSubmissionReadiness(ids.unboundTask, ids.unboundSubmission, ids.worker);
    expect(readiness.ready).toBe(false);
    expect(readiness.missingPrerequisites).toContain('EXACT_VERSION_REQUIRED');
    await expect(submissionService.submitTaskSubmission(ids.unboundTask, ids.unboundSubmission, ids.worker, 'unbound-submit-key'))
      .rejects.toMatchObject({ statusCode: 409, code: 'HANDOFF_NOT_READY' });
  });

  it('resubmits the corrected revision once and replaces the active queue item', async () => {
    const submitted = await submissionService.submitTaskSubmission(ids.lifecycleTask, revisedSubmissionId, ids.worker, 'resubmit-main-key');
    const replay = await submissionService.submitTaskSubmission(ids.lifecycleTask, revisedSubmissionId, ids.worker, 'resubmit-main-key');
    expect(submitted.idempotentReplay).toBe(false);
    expect(replay.idempotentReplay).toBe(true);
    const queue = await submissionService.getSubmissionReviewQueue(ids.reviewer);
    expect(queue.filter((item) => item.taskId === ids.lifecycleTask)).toHaveLength(1);
    expect(queue.find((item) => item.taskId === ids.lifecycleTask)).toEqual(expect.objectContaining({ submissionId: revisedSubmissionId, revisionNumber: 2 }));
    expect(await db.timelineEvent.count({ where: { taskId: ids.lifecycleTask, type: 'TASK_SUBMISSION_RESUBMITTED' } })).toBe(1);
  });

  it('approves the corrected revision atomically and closes the ordinary task', async () => {
    const detail = await reviewService.getReviewDetail(ids.lifecycleTask, revisedSubmissionId, ids.reviewer);
    const results = await Promise.all([
      reviewService.approveSubmission(
        ids.lifecycleTask, revisedSubmissionId, ids.reviewer, 'approve-main-key', detail.reviewVersion, { note: 'Approved privately.' },
      ),
      reviewService.approveSubmission(
        ids.lifecycleTask, revisedSubmissionId, ids.reviewer, 'approve-main-key', detail.reviewVersion, { note: 'Approved privately.' },
      ),
    ]);
    expect(results.map((result) => result.idempotentReplay).sort()).toEqual([false, true]);
    expect(results[0].review.submission.status).toBe('APPROVED');
    expect(results[0].review.nextActionCode).toBe('VIEW_COMPLETED');
    expect(await db.taskReviewDecision.count({ where: { submissionId: revisedSubmissionId } })).toBe(1);
    expect(await db.timelineEvent.count({ where: { taskId: ids.lifecycleTask, type: 'TASK_SUBMISSION_APPROVED' } })).toBe(1);
    expect(await db.timelineEvent.count({ where: { taskId: ids.lifecycleTask, type: 'TASK_COMPLETED' } })).toBe(1);
    expect(await db.notification.count({ where: { userId: ids.worker, title: 'Feladatleadás jóváhagyva' } })).toBe(1);
    expect(await db.task.findUnique({ where: { id: ids.lifecycleTask } })).toEqual(expect.objectContaining({ status: 'DONE', completedAt: expect.any(Date) }));
    expect((await submissionService.getSubmissionReviewQueue(ids.reviewer)).filter((item) => item.taskId === ids.lifecycleTask)).toHaveLength(0);
  });

  it('keeps external-action approval open and closes only after explicit completion', async () => {
    const detail = await reviewService.getReviewDetail(ids.externalTask, ids.externalSubmission, ids.reviewer);
    const approved = await reviewService.approveSubmission(
      ids.externalTask, ids.externalSubmission, ids.reviewer, 'external-approve-key', detail.reviewVersion, {},
    );
    const approvedReplay = await reviewService.approveSubmission(
      ids.externalTask, ids.externalSubmission, ids.reviewer, 'external-approve-key', detail.reviewVersion, {},
    );
    expect(approved.idempotentReplay).toBe(false);
    expect(approvedReplay.idempotentReplay).toBe(true);
    expect(approved.review.nextActionCode).toBe('RECORD_EXTERNAL_COMPLETION');
    expect(await db.task.findUnique({ where: { id: ids.externalTask } })).toEqual(expect.objectContaining({ status: 'IN_REVIEW', completedAt: null }));

    await expect(reviewService.recordExternalCompletion(
      ids.externalTask, ids.externalSubmission, ids.reviewer, 'external-mismatch-key', { actionType: 'SIGNATURE' },
    )).rejects.toMatchObject({ statusCode: 409, code: 'EXTERNAL_ACTION_TYPE_MISMATCH' });

    const completionInput = { actionType: 'CLIENT_SEND', completedAt: '2026-07-18T10:00:00.000Z' };
    const completionResults = await Promise.all([
      reviewService.recordExternalCompletion(ids.externalTask, ids.externalSubmission, ids.reviewer, 'external-complete-key', completionInput),
      reviewService.recordExternalCompletion(ids.externalTask, ids.externalSubmission, ids.reviewer, 'external-complete-key', completionInput),
    ]);
    expect(completionResults.map((result) => result.idempotentReplay).sort()).toEqual([false, true]);
    expect(completionResults[0].review.nextActionCode).toBe('VIEW_COMPLETED');
    expect(await db.task.findUnique({ where: { id: ids.externalTask } })).toEqual(expect.objectContaining({ status: 'DONE', completedAt: expect.any(Date) }));
    expect(await db.timelineEvent.count({ where: { taskId: ids.externalTask, type: 'TASK_EXTERNAL_COMPLETION_RECORDED' } })).toBe(1);
    expect(await db.timelineEvent.count({ where: { taskId: ids.externalTask, type: 'TASK_COMPLETED' } })).toBe(1);
  });

  it('rolls back return decisions, task transition, audit and notification together', async () => {
    const rollbackService = new TaskReviewDecisionService(db, { beforeReturnCommit: () => { throw new Error('forced return rollback'); } });
    const detail = await rollbackService.getReviewDetail(ids.rollbackReturnTask, ids.rollbackReturnSubmission, ids.reviewer);
    await expect(rollbackService.returnSubmission(
      ids.rollbackReturnTask, ids.rollbackReturnSubmission, ids.reviewer, 'rollback-return-key', detail.reviewVersion,
      { note: 'Private rollback note', requestedCorrections: 'Private rollback correction', requiresFullReview: false },
    )).rejects.toThrow('forced return rollback');
    expect((await db.taskSubmission.findUnique({ where: { id: ids.rollbackReturnSubmission } }))?.status).toBe('SUBMITTED');
    expect((await db.task.findUnique({ where: { id: ids.rollbackReturnTask } }))?.status).toBe('IN_REVIEW');
    expect(await db.taskReviewDecision.count({ where: { submissionId: ids.rollbackReturnSubmission } })).toBe(0);
    expect(await db.timelineEvent.count({ where: { taskId: ids.rollbackReturnTask } })).toBe(0);
    expect(await db.notification.count({ where: { link: `/tasks?taskId=${ids.rollbackReturnTask}` } })).toBe(0);
  });

  it('rolls back approval, task closure, audit and notification together', async () => {
    const rollbackService = new TaskReviewDecisionService(db, { beforeApprovalCommit: () => { throw new Error('forced approval rollback'); } });
    const detail = await rollbackService.getReviewDetail(ids.rollbackApprovalTask, ids.rollbackApprovalSubmission, ids.reviewer);
    await expect(rollbackService.approveSubmission(
      ids.rollbackApprovalTask, ids.rollbackApprovalSubmission, ids.reviewer, 'rollback-approval-key', detail.reviewVersion, {},
    )).rejects.toThrow('forced approval rollback');
    expect((await db.taskSubmission.findUnique({ where: { id: ids.rollbackApprovalSubmission } }))?.status).toBe('SUBMITTED');
    expect((await db.task.findUnique({ where: { id: ids.rollbackApprovalTask } }))?.status).toBe('IN_REVIEW');
    expect(await db.taskReviewDecision.count({ where: { submissionId: ids.rollbackApprovalSubmission } })).toBe(0);
    expect(await db.timelineEvent.count({ where: { taskId: ids.rollbackApprovalTask } })).toBe(0);
    expect(await db.notification.count({ where: { link: `/tasks?taskId=${ids.rollbackApprovalTask}` } })).toBe(0);
  });

  it('keeps audit and notifications content-minimal and survives a service restart', async () => {
    const sensitive = ['privileged reviewer note', 'privileged requested correction', 'privileged lifecycle work summary', 'private submitter note'];
    const events = await db.timelineEvent.findMany({ where: { taskId: { in: [ids.lifecycleTask, ids.externalTask] } } });
    const notifications = await db.notification.findMany({ where: { link: { in: [`/tasks?taskId=${ids.lifecycleTask}`, `/tasks?taskId=${ids.externalTask}`] } } });
    const serialized = JSON.stringify({ events, notifications }).toLowerCase();
    for (const fragment of sensitive) expect(serialized).not.toContain(fragment);

    const restarted = new TaskReviewDecisionService(db);
    const refreshed = await restarted.getReviewDetail(ids.lifecycleTask, revisedSubmissionId, ids.reviewer);
    expect(refreshed.history.map((revision) => [revision.revisionNumber, revision.status])).toEqual([[2, 'APPROVED'], [1, 'RETURNED']]);
    expect(refreshed.history[1].decision).toEqual(expect.objectContaining({ decision: 'RETURNED', requiresFullReview: true }));
  });

  it('records final synthetic counts and enforces one decision per revision', async () => {
    await expect(db.taskReviewDecision.create({
      data: { submissionId: revisedSubmissionId, reviewerId: ids.reviewer, decision: 'APPROVED' },
    })).rejects.toMatchObject({ code: 'P2002' });
    expect(await db.taskSubmission.count({ where: { taskId: ids.lifecycleTask } })).toBe(2);
    expect(await db.taskReviewDecision.count({ where: { submission: { taskId: ids.lifecycleTask } } })).toBe(2);
    expect(await db.taskSubmissionTimeEntry.count({ where: { submission: { taskId: ids.lifecycleTask } } })).toBe(2);
    expect(await db.taskSubmissionDocument.count({ where: { submission: { taskId: ids.lifecycleTask } } })).toBe(2);
    expect(await db.timelineEvent.count({ where: { taskId: ids.lifecycleTask } })).toBe(5);
    expect(await db.notification.count({ where: { link: `/tasks?taskId=${ids.lifecycleTask}` } })).toBe(3);
  });
});
