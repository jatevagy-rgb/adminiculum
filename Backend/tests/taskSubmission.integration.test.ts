import { PrismaClient } from '@prisma/client';
import { TaskSubmissionService, TaskSubmissionServiceError } from '../src/modules/tasks/taskSubmission.service';

const databaseUrl = process.env.TASK_SUBMISSION_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const ids = {
  worker: '10000000-0000-4000-8000-000000000001',
  reviewer: '10000000-0000-4000-8000-000000000002',
  unrelated: '10000000-0000-4000-8000-000000000003',
  client: '20000000-0000-4000-8000-000000000001',
  crossClient: '20000000-0000-4000-8000-000000000002',
  matter: '30000000-0000-4000-8000-000000000001',
  crossMatter: '30000000-0000-4000-8000-000000000002',
  case: '40000000-0000-4000-8000-000000000001',
  crossCase: '40000000-0000-4000-8000-000000000002',
  task: '50000000-0000-4000-8000-000000000001',
  zeroTask: '50000000-0000-4000-8000-000000000002',
  rollbackTask: '50000000-0000-4000-8000-000000000003',
  revisionTask: '50000000-0000-4000-8000-000000000004',
  document: '60000000-0000-4000-8000-000000000001',
  supportDocument: '60000000-0000-4000-8000-000000000002',
  crossDocument: '60000000-0000-4000-8000-000000000003',
  time: '70000000-0000-4000-8000-000000000001',
  crossTime: '70000000-0000-4000-8000-000000000002',
  legacyHandoff: '80000000-0000-4000-8000-000000000001',
  returnedSubmission: '90000000-0000-4000-8000-000000000001',
};

describeWithDatabase('TaskSubmissionService PostgreSQL lifecycle', () => {
  let db: PrismaClient;
  let service: TaskSubmissionService;
  let draftId: string;

  beforeAll(async () => {
    const parsed = new URL(databaseUrl as string);
    expect(['127.0.0.1', 'localhost', '::1']).toContain(parsed.hostname);
    expect(parsed.pathname.replace(/^\//, '')).toMatch(/^adminiculum_task_submission_backend_/);

    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    const identity = await db.$queryRaw<Array<{ database_name: string }>>`SELECT current_database() AS database_name`;
    expect(identity[0].database_name).toBe(parsed.pathname.replace(/^\//, ''));
    service = new TaskSubmissionService(db);

    await db.user.createMany({
      data: [
        { id: ids.worker, email: 'submission-worker@example.invalid', name: 'Submission Worker', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
        { id: ids.reviewer, email: 'submission-reviewer@example.invalid', name: 'Submission Reviewer', role: 'PARTNER', status: 'ACTIVE', isActive: true, skills: [] },
        { id: ids.unrelated, email: 'submission-unrelated@example.invalid', name: 'Unrelated User', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      ],
    });
    await db.client.createMany({
      data: [
        { id: ids.client, name: 'Synthetic submission client' },
        { id: ids.crossClient, name: 'Synthetic cross client' },
      ],
    });
    await db.matter.createMany({
      data: [
        { id: ids.matter, title: 'Synthetic submission matter', matterType: 'CONTRACT', clientId: ids.client },
        { id: ids.crossMatter, title: 'Synthetic cross matter', matterType: 'CONTRACT', clientId: ids.crossClient },
      ],
    });
    await db.case.createMany({
      data: [
        {
          id: ids.case,
          caseNumber: 'TS-BACKEND-001',
          title: 'Synthetic submission case',
          caseType: 'CONTRACT_REVIEW',
          clientId: ids.client,
          matterId: ids.matter,
          createdById: ids.reviewer,
          assignedLawyerId: ids.reviewer,
        },
        {
          id: ids.crossCase,
          caseNumber: 'TS-BACKEND-002',
          title: 'Synthetic cross case',
          caseType: 'CONTRACT_REVIEW',
          clientId: ids.crossClient,
          matterId: ids.crossMatter,
          createdById: ids.unrelated,
          assignedLawyerId: ids.unrelated,
        },
      ],
    });
    await db.task.createMany({
      data: [ids.task, ids.zeroTask, ids.rollbackTask, ids.revisionTask].map((id, index) => ({
        id,
        title: `Synthetic submission task ${index + 1}`,
        taskType: 'OTHER' as const,
        status: 'IN_PROGRESS' as const,
        priority: 'MEDIUM' as const,
        requiredSkills: [],
        caseId: ids.case,
        matterId: ids.matter,
        assignedToId: ids.worker,
        assignedById: ids.reviewer,
      })),
    });
    await db.document.createMany({
      data: [
        { id: ids.document, name: 'Synthetic primary output', category: 'OTHER', caseId: ids.case, clientId: ids.client },
        { id: ids.supportDocument, name: 'Synthetic support output', category: 'OTHER', caseId: ids.case, clientId: ids.client },
        { id: ids.crossDocument, name: 'Synthetic cross output', category: 'OTHER', caseId: ids.crossCase, clientId: ids.crossClient },
      ],
    });
    await db.timeEntry.createMany({
      data: [
        { id: ids.time, workType: 'DRAFTING', description: 'Synthetic task time', minutes: 45, matterId: ids.matter, userId: ids.worker },
        { id: ids.crossTime, workType: 'REVIEW', description: 'Synthetic cross time', minutes: 15, matterId: ids.crossMatter, userId: ids.worker },
      ],
    });
    await db.lawyerHandoffPackage.create({
      data: { id: ids.legacyHandoff, caseId: ids.case, status: 'DRAFT', packageType: 'STANDARD' },
    });
    await db.taskSubmission.create({
      data: {
        id: ids.returnedSubmission,
        taskId: ids.revisionTask,
        revisionNumber: 1,
        status: 'RETURNED',
        createdById: ids.worker,
        submittedById: ids.worker,
        assignedReviewerId: ids.reviewer,
        workSummary: 'Synthetic returned work',
        requestedAttention: 'DETAILED_REVIEW',
        submittedAt: new Date(),
        returnedAt: new Date(),
        idempotencyKey: 'returned-seed-key',
      },
    });
  }, 60_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('hides task and submission existence from an unrelated authenticated user', async () => {
    await expect(service.getTaskSubmissionWorkflow(ids.task, ids.unrelated)).rejects.toMatchObject({
      statusCode: 404,
      code: 'TASK_NOT_FOUND',
    });
  });

  it('creates at most one draft under concurrency and returns it idempotently', async () => {
    const results = await Promise.all([
      service.createTaskSubmissionDraft(ids.task, ids.worker, { assignedReviewerId: ids.reviewer }),
      service.createTaskSubmissionDraft(ids.task, ids.worker, { assignedReviewerId: ids.reviewer }),
    ]);
    const drafts = await db.taskSubmission.findMany({ where: { taskId: ids.task, status: 'DRAFT' } });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].revisionNumber).toBe(1);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(results.filter((result) => !result.created)).toHaveLength(1);
    draftId = drafts[0].id;
  });

  it('requires the explicit revise action after a returned revision', async () => {
    await expect(service.createTaskSubmissionDraft(ids.revisionTask, ids.worker, { assignedReviewerId: ids.reviewer })).rejects.toMatchObject({
      statusCode: 409,
      code: 'TASK_SUBMISSION_REVISE_REQUIRED',
    });
  });

  it('rejects self-review and lists only eligible task-scoped reviewers', async () => {
    const reviewers = await service.listEligibleReviewers(ids.task, ids.worker);
    expect(reviewers).toEqual(expect.arrayContaining([expect.objectContaining({ id: ids.reviewer })]));
    expect(reviewers.map((reviewer) => reviewer.id)).not.toContain(ids.worker);
    await expect(service.assignSubmissionReviewer(ids.task, draftId, ids.worker, ids.worker)).rejects.toMatchObject({
      code: 'SELF_REVIEW_NOT_ALLOWED',
    });
  });

  it('updates explicit draft fields and reports deterministic missing prerequisites', async () => {
    const initial = await service.validateSubmissionReadiness(ids.task, draftId, ids.worker);
    expect(initial.ready).toBe(false);
    expect(initial.missingPrerequisites).toEqual(expect.arrayContaining([
      'WORK_SUMMARY_REQUIRED',
      'REVIEW_ATTENTION_REQUIRED',
      'OUTPUT_REQUIRED',
      'TIME_ENTRY_OR_ZERO_CONFIRMATION_REQUIRED',
    ]));
    await service.updateTaskSubmissionDraft(ids.task, draftId, ids.worker, {
      workSummary: 'Synthetic completed legal work summary',
      remainingIssues: 'No unresolved synthetic issues',
      reviewerNote: 'Synthetic submitter note',
      requestedAttention: 'DETAILED_REVIEW',
      externalActionRequired: false,
    });
  });

  it('links only same-case document metadata and keeps duplicate linking idempotent', async () => {
    const first = await service.attachSubmissionDocument(ids.task, draftId, ids.worker, { documentId: ids.document, role: 'PRIMARY_OUTPUT' });
    const duplicate = await service.attachSubmissionDocument(ids.task, draftId, ids.worker, { documentId: ids.document, role: 'PRIMARY_OUTPUT' });
    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    await expect(service.attachSubmissionDocument(ids.task, draftId, ids.worker, { documentId: ids.crossDocument, role: 'PRIMARY_OUTPUT' })).rejects.toMatchObject({
      statusCode: 404,
      code: 'DOCUMENT_NOT_FOUND',
    });
    await service.attachSubmissionDocument(ids.task, draftId, ids.worker, { documentId: ids.supportDocument, role: 'SUPPORTING_DOCUMENT' });
    await service.detachSubmissionDocument(ids.task, draftId, ids.supportDocument, ids.worker);
    expect(await db.taskSubmissionDocument.count({ where: { submissionId: draftId } })).toBe(1);
  });

  it('links only owned same-matter time and normalizes task attribution', async () => {
    const first = await service.attachSubmissionTimeEntry(ids.task, draftId, ids.worker, { timeEntryId: ids.time });
    const duplicate = await service.attachSubmissionTimeEntry(ids.task, draftId, ids.worker, { timeEntryId: ids.time });
    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect((await db.timeEntry.findUnique({ where: { id: ids.time } }))?.taskId).toBe(ids.task);
    await expect(service.attachSubmissionTimeEntry(ids.task, draftId, ids.worker, { timeEntryId: ids.crossTime })).rejects.toMatchObject({
      statusCode: 404,
      code: 'TIME_ENTRY_NOT_FOUND',
    });
  });

  it('submits atomically and replays the same idempotency key without duplicates', async () => {
    const ready = await service.validateSubmissionReadiness(ids.task, draftId, ids.worker);
    expect(ready).toEqual({ ready: true, missingPrerequisites: [], blockingErrors: [], warnings: [] });

    await expect(service.submitTaskSubmission(ids.task, draftId, ids.reviewer, 'submission-reviewer-key')).rejects.toMatchObject({
      statusCode: 403,
      code: 'TASK_SUBMISSION_SUBMIT_FORBIDDEN',
    });
    const first = await service.submitTaskSubmission(ids.task, draftId, ids.worker, 'submission-main-key');
    await expect(service.submitTaskSubmission(ids.task, draftId, ids.unrelated, 'submission-main-key')).rejects.toMatchObject({
      statusCode: 404,
      code: 'TASK_NOT_FOUND',
    });
    const replay = await service.submitTaskSubmission(ids.task, draftId, ids.worker, 'submission-main-key');
    expect(first.idempotentReplay).toBe(false);
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.submission.id).toBe(first.submission.id);

    expect(await db.taskSubmission.count({ where: { taskId: ids.task } })).toBe(1);
    expect(await db.timelineEvent.count({ where: { taskId: ids.task, type: 'TASK_SUBMISSION_SUBMITTED' } })).toBe(1);
    expect(await db.notification.count({ where: { userId: ids.reviewer, link: `/tasks?taskId=${ids.task}` } })).toBe(1);
    expect((await db.task.findUnique({ where: { id: ids.task } }))?.status).toBe('IN_REVIEW');

    const queue = await service.getSubmissionReviewQueue(ids.reviewer);
    expect(queue.filter((item) => item.submissionId === draftId)).toHaveLength(1);
  });

  it('keeps submitted document/time relations and draft fields immutable', async () => {
    await expect(service.updateTaskSubmissionDraft(ids.task, draftId, ids.worker, { workSummary: 'Changed' })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.detachSubmissionDocument(ids.task, draftId, ids.document, ids.worker)).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.detachSubmissionTimeEntry(ids.task, draftId, ids.time, ids.worker)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects reusing an idempotency key for a different submission', async () => {
    const zeroDraft = await service.createTaskSubmissionDraft(ids.zeroTask, ids.worker, { assignedReviewerId: ids.reviewer });
    const zeroDraftId = zeroDraft.workflow.activeDraft!.id;
    await expect(service.submitTaskSubmission(ids.zeroTask, zeroDraftId, ids.worker, 'submission-main-key')).rejects.toMatchObject({
      statusCode: 409,
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
  });

  it('supports an explicit persisted zero-time path', async () => {
    const workflow = await service.getTaskSubmissionWorkflow(ids.zeroTask, ids.worker);
    const zeroDraftId = workflow.activeDraft!.id;
    await service.updateTaskSubmissionDraft(ids.zeroTask, zeroDraftId, ids.worker, {
      workSummary: 'Synthetic zero-time delivery',
      requestedAttention: 'QUICK_SCAN',
      zeroTimeConfirmed: true,
    });
    await service.attachSubmissionDocument(ids.zeroTask, zeroDraftId, ids.worker, { documentId: ids.document, role: 'PRIMARY_OUTPUT' });
    const ready = await service.validateSubmissionReadiness(ids.zeroTask, zeroDraftId, ids.worker);
    expect(ready.ready).toBe(true);
    expect(ready.warnings).toEqual(['ZERO_TIME_CONFIRMED']);
    const submitted = await service.submitTaskSubmission(ids.zeroTask, zeroDraftId, ids.worker, 'submission-zero-key');
    expect(submitted.submission.zeroTimeConfirmed).toBe(true);
    const stored = await db.taskSubmission.findUnique({ where: { id: zeroDraftId } });
    expect(stored?.zeroTimeConfirmedById).toBe(ids.worker);
    expect(stored?.zeroTimeConfirmedAt).not.toBeNull();
  });

  it('rolls back task, submission, audit and notification after a forced in-transaction failure', async () => {
    const rollbackService = new TaskSubmissionService(db, {
      beforeSubmitCommit: () => { throw new Error('forced transaction rollback'); },
    });
    const draft = await rollbackService.createTaskSubmissionDraft(ids.rollbackTask, ids.worker, { assignedReviewerId: ids.reviewer });
    const rollbackDraftId = draft.workflow.activeDraft!.id;
    await rollbackService.updateTaskSubmissionDraft(ids.rollbackTask, rollbackDraftId, ids.worker, {
      workSummary: 'Synthetic rollback delivery',
      requestedAttention: 'APPROVAL',
      zeroTimeConfirmed: true,
    });
    await rollbackService.attachSubmissionDocument(ids.rollbackTask, rollbackDraftId, ids.worker, { documentId: ids.document, role: 'PRIMARY_OUTPUT' });

    await expect(rollbackService.submitTaskSubmission(ids.rollbackTask, rollbackDraftId, ids.worker, 'submission-rollback-key')).rejects.toThrow('forced transaction rollback');
    expect((await db.taskSubmission.findUnique({ where: { id: rollbackDraftId } }))?.status).toBe('DRAFT');
    expect((await db.task.findUnique({ where: { id: ids.rollbackTask } }))?.status).toBe('IN_PROGRESS');
    expect(await db.timelineEvent.count({ where: { taskId: ids.rollbackTask, type: 'TASK_SUBMISSION_SUBMITTED' } })).toBe(0);
    expect(await db.notification.count({ where: { link: `/tasks?taskId=${ids.rollbackTask}` } })).toBe(0);
  });

  it('returns no forbidden document/provider/storage fields and leaves legacy handoff untouched', async () => {
    const workflow = await service.getTaskSubmissionWorkflow(ids.task, ids.worker);
    const serialized = JSON.stringify(workflow).toLowerCase();
    for (const forbidden of ['workspacetext', 'storagepath', 'spitemid', 'spweburl', 'emailbody', 'providerpayload']) {
      expect(serialized).not.toContain(forbidden);
    }
    const audit = await db.timelineEvent.findFirst({ where: { taskId: ids.task, type: 'TASK_SUBMISSION_SUBMITTED' } });
    const auditSerialized = JSON.stringify(audit?.metadata || {}).toLowerCase();
    expect(auditSerialized).not.toContain('synthetic completed legal work summary');
    expect(auditSerialized).not.toContain('synthetic submitter note');
    expect(await db.lawyerHandoffPackage.count({ where: { id: ids.legacyHandoff, status: 'DRAFT' } })).toBe(1);
  });
});
