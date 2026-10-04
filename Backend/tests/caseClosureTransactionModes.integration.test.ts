import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../src/prisma/prisma.service';
import { closeCase, reopenCase } from '../src/modules/cases/lifecycleService';
import { lockCaseForMutation, withCaseWorkGuard } from '../src/modules/cases/caseMutationGuard';
import { createTask } from '../src/modules/tasks/services';
import { createReview, transitionReview } from '../src/modules/documents/review/reviewService';
import { TaskSubmissionService } from '../src/modules/tasks/taskSubmission.service';
import { closureTrace } from './helpers/caseClosureTrace';

const url = process.env.CASE_CLOSURE_REPAIR_TEST_DATABASE_URL;
const modes = ['ReadUncommitted', 'ReadCommitted', 'RepeatableRead', 'Serializable'] as const;
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};
const outcome = <T>(promise: Promise<T>) => promise.then(value => ({ value, error: null }), error => ({ value: null, error }));

(url ? describe : describe.skip)('closure mixed caller transactions on dedicated PostgreSQL', () => {
  let db: PrismaClient;
  let observer: PrismaClient;
  const userId = randomUUID();
  const reviewerId = randomUUID();
  const actor = { userId, role: 'LAWYER' };
  let caseIds: string[] = [];

  beforeAll(async () => {
    const parsed = new URL(url!);
    expect(['127.0.0.1', 'localhost', '::1']).toContain(parsed.hostname);
    expect(parsed.pathname.slice(1)).toMatch(/^adminiculum_case_closure_repair_/);
    expect(process.env.DATABASE_URL).toBe(url);
    db = new PrismaClient({ datasources: { db: { url } } });
    observer = new PrismaClient({ datasources: { db: { url } } });
    await db.user.createMany({ data: [userId, reviewerId].map((id) => ({
      id, email: `${id}@example.invalid`, name: 'Closure matrix actor',
      role: id === userId ? 'LAWYER' as const : 'PARTNER' as const,
      status: 'ACTIVE' as const, isActive: true, skills: [],
    })) });
    closureTrace('server', { rows: await db.$queryRaw`SELECT version(), current_database()` });
  });
  beforeEach(() => { caseIds = []; });
  afterEach(async () => {
    jest.restoreAllMocks();
    for (const caseId of caseIds) {
      closureTrace('persisted-matrix', {
        row: await observer.case.findUnique({ where: { id: caseId }, select: { id: true, status: true, updatedAt: true } }),
        tasks: await observer.task.findMany({ where: { caseId }, select: { id: true, status: true } }),
        reviews: await observer.documentReview.findMany({ where: { document: { caseId } }, select: { id: true, status: true } }),
        submissions: await observer.taskSubmission.findMany({ where: { task: { caseId } }, select: { id: true, status: true } }),
        events: await observer.timelineEvent.findMany({ where: { caseId, eventType: 'CASE_STATUS_CHANGED' }, select: { metadata: true } }),
      });
    }
  });
  afterAll(async () => { await Promise.all([db?.$disconnect(), observer?.$disconnect(), prisma.$disconnect()]); });

  async function fixture() {
    const client = await db.client.create({ data: { name: 'Closure matrix' } });
    const row = await db.case.create({ data: {
      caseNumber: `MIX-${randomUUID()}`, title: 'Closure matrix', caseType: 'CONTRACT_REVIEW',
      clientId: client.id, createdById: userId, assignedLawyerId: userId,
    } });
    caseIds.push(row.id);
    return row;
  }
  const taskData = (caseId: string) => ({ caseId, title: 'Mixed caller task', assignedBy: userId, assignedTo: userId });
  async function waitForLock() {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const rows = await observer.$queryRaw<any[]>`SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "cases"%FOR UPDATE%'`;
      if (rows.length) { closureTrace('matrix-wait', { rows }); return; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('Expected a real case lock wait');
  }

  // Pauses a real transaction immediately after its case lock, without replacing
  // any production query or moving work outside its owning transaction.
  function holdCaseLock(client: PrismaClient, caseId: string) {
    const locked = deferred();
    const release = deferred();
    const actual = client.$transaction.bind(client);
    let held = false;
    jest.spyOn(client, '$transaction').mockImplementation((async (operation: any, options: any) =>
      actual(async tx => operation(new Proxy(tx, {
        get(target, key) {
          if (key === '$queryRaw') return async (...args: any[]) => {
            const result = await (target.$queryRaw as any)(...args);
            if (!held && args[0]?.sql?.includes('FROM "cases"') && args[0]?.values?.[0] === caseId) {
              held = true; locked.resolve(); await release.promise;
            }
            return result;
          };
          return (target as any)[key];
        },
      })), { ...options, timeout: 12000 })) as any);
    return { locked: locked.promise, release: release.resolve };
  }

  it.each(modes)('%s writer commits during closure lock wait and blocks closure', async isolationLevel => {
    const row = await fixture();
    const locked = deferred(); const release = deferred();
    const work = outcome(db.$transaction(async tx => {
      await lockCaseForMutation(tx, row.id); locked.resolve(); await release.promise;
      await createTask(taskData(row.id), tx);
    }, { isolationLevel, timeout: 12000 }));
    let close: ReturnType<typeof outcome> | undefined;
    try {
      await Promise.race([locked.promise, work.then(r => { throw r.error || new Error('Writer ended before barrier'); })]);
      close = outcome(closeCase(row.id, actor));
      await waitForLock();
    } finally { release.resolve(); await Promise.all([work, close]); }
    expect((await work).error).toBeNull();
    expect((await close!).error).toMatchObject({ code: 'CLOSURE_BLOCKED' });
    expect(await db.task.count({ where: { caseId: row.id, status: 'TODO' } })).toBe(1);
    expect(await db.case.findUnique({ where: { id: row.id }, select: { status: true, updatedAt: true } })).toEqual({ status: row.status, updatedAt: row.updatedAt });
    expect(await db.timelineEvent.count({ where: { caseId: row.id, eventType: 'CASE_STATUS_CHANGED' } })).toBe(0);
  });

  it.each(modes)('%s writer waiting behind ordinary close cannot commit work', async isolationLevel => {
    const row = await fixture(); const gate = holdCaseLock(prisma, row.id);
    const close = outcome(closeCase(row.id, actor));
    let work: ReturnType<typeof outcome> | undefined;
    try {
      await Promise.race([gate.locked, close.then(r => { throw r.error || new Error('Closer ended before barrier'); })]);
      work = outcome(db.$transaction(async tx => {
        // Pin a snapshot before attempting the lock in fixed-snapshot modes.
        await tx.case.findUniqueOrThrow({ where: { id: row.id } });
        await createTask(taskData(row.id), tx);
      }, { isolationLevel, timeout: 12000 }));
      await waitForLock();
    } finally { gate.release(); await Promise.all([close, work]); }
    expect((await close).error).toBeNull();
    expect((await work!).error).toMatchObject(isolationLevel === 'Serializable' || isolationLevel === 'RepeatableRead'
      ? { code: 'P2010', meta: { code: '40001' } } : { code: 'CASE_REOPEN_REQUIRED' });
    expect(await db.task.count({ where: { caseId: row.id } })).toBe(0);
    expect((await db.case.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('FINAL');
    await expect(db.$transaction(tx => createTask(taskData(row.id), tx), { isolationLevel })).rejects.toMatchObject({ code: 'CASE_REOPEN_REQUIRED' });
    await reopenCase(row.id, actor);
    await db.$transaction(tx => createTask(taskData(row.id), tx), { isolationLevel });
    expect(await db.task.count({ where: { caseId: row.id } })).toBe(1);
  });

  it.each(modes)('%s supplied transaction rolls back its whole unit, including nested task', async isolationLevel => {
    const row = await fixture();
    await expect(db.$transaction(async tx => {
      await tx.case.update({ where: { id: row.id }, data: { title: 'Must roll back' } });
      await withCaseWorkGuard(tx, row.id, inner => createTask(taskData(row.id), inner));
      throw new Error('owner rollback');
    }, { isolationLevel })).rejects.toThrow('owner rollback');
    expect(await db.task.count({ where: { caseId: row.id } })).toBe(0);
    expect((await db.case.findUniqueOrThrow({ where: { id: row.id } })).title).toBe(row.title);
  });

  it('owned Serializable task transaction retries raw 40001 after close then rejects on fresh status', async () => {
    const row = await fixture(); const gate = holdCaseLock(prisma, row.id);
    const spy = jest.spyOn(db, '$transaction');
    const close = outcome(closeCase(row.id, actor)); let work: ReturnType<typeof outcome> | undefined;
    try {
      await Promise.race([gate.locked, close]);
      work = outcome(createTask(taskData(row.id), db)); await waitForLock();
    } finally { gate.release(); await Promise.all([close, work]); }
    expect((await close).error).toBeNull();
    expect((await work!).error).toMatchObject({ code: 'CASE_REOPEN_REQUIRED' });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(await db.task.count({ where: { caseId: row.id } })).toBe(0);
  });

  async function reviewFixture() {
    const row = await fixture();
    const doc = await db.document.create({ data: { name: 'Review matrix', fileName: 'output.txt', category: 'OTHER', caseId: row.id, clientId: row.clientId, currentVersion: 1, currentVersionInt: 1, version: '1' } });
    const version = await db.documentVersion.create({ data: { documentId: doc.id, version: 1, name: 'output.txt', originalFileName: 'output.txt', uploadedById: userId, isCurrent: true } });
    const review = await createReview(doc.id, actor, { reviewVersionId: version.id }, db);
    return { row, review };
  }
  it('real review ASSIGN commits during ordinary closure wait and remains a blocker', async () => {
    const { row, review } = await reviewFixture(); const gate = holdCaseLock(db, row.id);
    const work = outcome(transitionReview(review.id, 'ASSIGN', actor, { reviewerId: userId, expectedRevision: review.revision }, db));
    let close: ReturnType<typeof outcome> | undefined;
    try { await Promise.race([gate.locked, work]); close = outcome(closeCase(row.id, actor)); await waitForLock(); }
    finally { gate.release(); await Promise.all([work, close]); }
    expect((await work).error).toBeNull();
    expect((await close!).error).toMatchObject({ code: 'CLOSURE_BLOCKED' });
    expect((await db.documentReview.findUniqueOrThrow({ where: { id: review.id } })).status).toBe('ASSIGNED');
    expect((await db.case.findUniqueOrThrow({ where: { id: row.id } })).status).not.toBe('FINAL');
  });
  it('ordinary close wins real review ASSIGN overlap and preserves draft history', async () => {
    const { row, review } = await reviewFixture(); const gate = holdCaseLock(prisma, row.id);
    const close = outcome(closeCase(row.id, actor)); let work: ReturnType<typeof outcome> | undefined;
    try { await Promise.race([gate.locked, close]); work = outcome(transitionReview(review.id, 'ASSIGN', actor, { reviewerId: userId, expectedRevision: review.revision }, db)); await waitForLock(); }
    finally { gate.release(); await Promise.all([work, close]); }
    expect((await close).error).toBeNull(); expect((await work!).error).toMatchObject({ code: 'CASE_REOPEN_REQUIRED' });
    expect((await db.documentReview.findUniqueOrThrow({ where: { id: review.id } })).status).toBe('DRAFT');
  });

  it('submission draft owner retries raw lock conflict after explicit force close without partial writes', async () => {
    const row = await fixture(); const task = await createTask(taskData(row.id), db);
    const gate = holdCaseLock(prisma, row.id); const spy = jest.spyOn(db, '$transaction');
    const close = outcome(closeCase(row.id, actor, { force: true })); let work: ReturnType<typeof outcome> | undefined;
    try { await Promise.race([gate.locked, close]); work = outcome(new TaskSubmissionService(db).createTaskSubmissionDraft(task.id, userId, { assignedReviewerId: reviewerId })); await waitForLock(); }
    finally { gate.release(); await Promise.all([work, close]); }
    expect((await close).error).toBeNull(); expect((await work!).error).toMatchObject({ code: 'CASE_REOPEN_REQUIRED' });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(await db.taskSubmission.count({ where: { taskId: task.id } })).toBe(0);
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('CANCELLED');
  });
  it('owned retry reruns the whole transaction after real PostgreSQL 40001 with no partial task or event', async () => {
    const row = await fixture(); let attempts = 0;
    await withCaseWorkGuard(db, row.id, async tx => {
      attempts++;
      await createTask(taskData(row.id), tx);
      if (attempts === 1) await tx.$executeRawUnsafe("DO $$ BEGIN RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'test serialization abort'; END $$");
    });
    expect(attempts).toBe(2);
    expect(await db.task.count({ where: { caseId: row.id } })).toBe(1);
    expect(await db.timelineEvent.count({ where: { caseId: row.id, eventType: 'TASK_ASSIGNED' } })).toBe(1);
  });

  it.each([['40001', 3], ['23514', 1]] as const)('SQLSTATE %s has bounded whole-transaction attempts (%s)', async (sqlstate, expectedAttempts) => {
    const row = await fixture(); let attempts = 0;
    const work = withCaseWorkGuard(db, row.id, async tx => {
      attempts++; await createTask(taskData(row.id), tx);
      // SQLSTATE comes only from this fixed test table, never application input.
      await tx.$executeRawUnsafe("DO $$ BEGIN RAISE EXCEPTION USING ERRCODE = '" + sqlstate + "', MESSAGE = 'test abort'; END $$");
    });
    await expect(work).rejects.toMatchObject({ code: 'P2010', meta: { code: sqlstate } });
    expect(attempts).toBe(expectedAttempts);
    expect(await db.task.count({ where: { caseId: row.id } })).toBe(0);
    expect(await db.timelineEvent.count({ where: { caseId: row.id } })).toBe(0);
  });

  async function submissionFixture() {
    const row = await fixture();
    const task = await createTask(taskData(row.id), db);
    await db.task.update({ where: { id: task.id }, data: { status: 'IN_PROGRESS' } });
    const document = await db.document.create({ data: { name: 'Submission output', category: 'OTHER', caseId: row.id, clientId: row.clientId } });
    await db.documentVersion.create({ data: { documentId: document.id, version: 1, name: 'output.txt', originalFileName: 'output.txt', uploadedById: userId, isCurrent: true } });
    const service = new TaskSubmissionService(db);
    const draft = await service.createTaskSubmissionDraft(task.id, userId, { assignedReviewerId: reviewerId });
    const submissionId = draft.workflow.activeDraft!.id;
    await service.updateTaskSubmissionDraft(task.id, submissionId, userId, { workSummary: 'Completed test delivery', requestedAttention: 'QUICK_SCAN', zeroTimeConfirmed: true });
    await service.attachSubmissionDocument(task.id, submissionId, userId, { documentId: document.id, role: 'PRIMARY_OUTPUT' });
    expect((await service.validateSubmissionReadiness(task.id, submissionId, userId)).ready).toBe(true);
    return { row, task, submissionId, service };
  }

  it('real submission commits before waiting explicit force close; submission audit survives task cancellation', async () => {
    const { row, task, submissionId } = await submissionFixture();
    const ready = deferred(); const release = deferred();
    const service = new TaskSubmissionService(db, { beforeSubmitCommit: async () => { ready.resolve(); await release.promise; } });
    const work = outcome(service.submitTaskSubmission(task.id, submissionId, userId, randomUUID()));
    let close: ReturnType<typeof outcome> | undefined;
    try { await Promise.race([ready.promise, work]); close = outcome(closeCase(row.id, actor, { force: true })); await waitForLock(); }
    finally { release.resolve(); await Promise.all([work, close]); }
    expect((await work).error).toBeNull(); expect((await close!).error).toBeNull();
    expect((await db.taskSubmission.findUniqueOrThrow({ where: { id: submissionId } })).status).toBe('SUBMITTED');
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('CANCELLED');
    expect(await db.timelineEvent.count({ where: { taskId: task.id, type: 'TASK_SUBMISSION_SUBMITTED' } })).toBe(1);
  });

  it('real submission waiting behind explicit force close retries and rejects without submission audit', async () => {
    const { row, task, submissionId, service } = await submissionFixture();
    const gate = holdCaseLock(prisma, row.id); const spy = jest.spyOn(db, '$transaction');
    const close = outcome(closeCase(row.id, actor, { force: true })); let work: ReturnType<typeof outcome> | undefined;
    try { await Promise.race([gate.locked, close]); work = outcome(service.submitTaskSubmission(task.id, submissionId, userId, randomUUID())); await waitForLock(); }
    finally { gate.release(); await Promise.all([close, work]); }
    expect((await close).error).toBeNull(); expect((await work!).error).toMatchObject({ code: 'CASE_REOPEN_REQUIRED' });
    expect(spy).toHaveBeenCalledTimes(2);
    expect((await db.taskSubmission.findUniqueOrThrow({ where: { id: submissionId } })).status).toBe('DRAFT');
    expect(await db.timelineEvent.count({ where: { taskId: task.id, type: 'TASK_SUBMISSION_SUBMITTED' } })).toBe(0);
  });

});
