import { prisma } from '../src/prisma/prisma.service';
import { closureTrace, traceClosureTransactions } from './helpers/caseClosureTrace';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { closeCase } from '../src/modules/cases/lifecycleService';
import { lockCaseForMutation } from '../src/modules/cases/caseMutationGuard';
import { createTask } from '../src/modules/tasks/services';
import { TaskSubmissionService } from '../src/modules/tasks/taskSubmission.service';
import { createReview, transitionReview } from '../src/modules/documents/review/reviewService';

const url = process.env.CASE_CLOSURE_REPAIR_TEST_DATABASE_URL;
const describeWithDatabase = url ? describe : describe.skip;

describeWithDatabase('case closure coordination on dedicated PostgreSQL', () => {
  let writer: PrismaClient;
  let observer: PrismaClient;
  const userId = randomUUID();
  const actor = { userId, role: 'LAWYER' };
  let sequence = 0;
  let caseIds: string[] = [];

  async function newCase() {
    const clientId = randomUUID();
    const caseId = randomUUID();
    await writer.client.create({ data: { id: clientId, name: 'Closure concurrency test client' } });
    await writer.case.create({ data: {
      id: caseId, caseNumber: `CC-REPAIR-${++sequence}-${caseId.slice(0, 8)}`,
      title: 'Closure concurrency test case', caseType: 'CONTRACT_REVIEW',
      clientId, createdById: userId, assignedLawyerId: userId,
    } });
    caseIds.push(caseId);
    return { caseId, clientId };
  }

  async function newDocument(caseId: string, clientId: string) {
    const documentId = randomUUID();
    const versionId = randomUUID();
    await writer.document.create({ data: {
      id: documentId, name: 'Closure test output', fileName: 'output.txt',
      category: 'OTHER', caseId, clientId, currentVersion: 1, currentVersionInt: 1, version: '1',
    } });
    await writer.documentVersion.create({ data: {
      id: versionId, documentId, version: 1, name: 'output.txt',
      originalFileName: 'output.txt', uploadedById: userId, isCurrent: true,
    } });
    return { documentId, versionId };
  }

  async function waitUntilCloseWaitsForCaseLock() {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const rows = await observer.$queryRaw<Array<{ waiting: bigint }>>`
        SELECT count(*)::bigint AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND query LIKE '%FROM "cases"%FOR UPDATE%'
      `;
      if (rows[0].waiting > 0n) {
        closureTrace('lock-wait', { connections: await observer.$queryRaw`SELECT pid, backend_xid::text AS xid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'` });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('Close did not reach the database case lock before the barrier deadline.');
  }

  beforeAll(async () => {
    const parsed = new URL(url as string);
    expect(['127.0.0.1', 'localhost', '::1']).toContain(parsed.hostname);
    expect(parsed.pathname.replace(/^\//, '')).toMatch(/^adminiculum_case_closure_repair_/);
    expect(process.env.DATABASE_URL).toBe(url);
    writer = new PrismaClient({ datasources: { db: { url } } });
    observer = new PrismaClient({ datasources: { db: { url } } });
    await Promise.all([writer.$connect(), observer.$connect()]);
    await writer.user.create({ data: {
      id: userId, email: `closure-${userId}@example.invalid`, name: 'Closure Test Lawyer',
      role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [],
    } });
  }, 30000);

  beforeEach(() => {
    caseIds = [];
    traceClosureTransactions(prisma, 'lifecycle-or-default-writer');
    traceClosureTransactions(writer, 'caller-writer');
  });

  afterEach(async () => {
    try {
      for (const caseId of caseIds) {
        const row = await observer.case.findUniqueOrThrow({ where: { id: caseId }, select: { id: true, status: true, updatedAt: true } });
        const tasks = await observer.task.findMany({ where: { caseId }, select: { id: true, status: true } });
        const events = await observer.timelineEvent.findMany({ where: { caseId, eventType: 'CASE_STATUS_CHANGED' }, select: { id: true, metadata: true } });
        closureTrace('persisted', { row, tasks, events });
      }
    } finally {
      jest.restoreAllMocks();
    }
  });

  afterAll(async () => {
    await Promise.all([writer?.$disconnect(), observer?.$disconnect()]);
  });

  it('required task commits first, so ordinary close rejects', async () => {
    const { caseId } = await newCase();
    await createTask({ caseId, title: 'Required work', assignedBy: userId, assignedTo: userId });
    await expect(closeCase(caseId, actor)).rejects.toMatchObject({ code: 'CLOSURE_BLOCKED' });
    expect((await writer.case.findUniqueOrThrow({ where: { id: caseId } })).status).not.toBe('FINAL');
  });

  it('ordinary close commits first, so task and standalone review creation reject', async () => {
    const { caseId, clientId } = await newCase();
    const { documentId, versionId } = await newDocument(caseId, clientId);
    await closeCase(caseId, actor);
    await expect(createTask({ caseId, title: 'Late work', assignedBy: userId })).rejects.toMatchObject({ code: 'CASE_REOPEN_REQUIRED' });
    await expect(createReview(documentId, actor, { reviewVersionId: versionId }, writer)).rejects.toMatchObject({ code: 'CASE_REOPEN_REQUIRED' });
    expect(await writer.task.count({ where: { caseId } })).toBe(0);
    expect(await writer.documentReview.count({ where: { documentId } })).toBe(0);
  });

  it('overlap cannot commit FINAL with an unfinished task', async () => {
    const { caseId } = await newCase();
    let release!: () => void;
    let locked!: () => void;
    const releaseBarrier = new Promise<void>((resolve) => { release = resolve; });
    const lockedBarrier = new Promise<void>((resolve) => { locked = resolve; });
    const work = writer.$transaction(async (tx) => {
      await lockCaseForMutation(tx, caseId);
      locked();
      await releaseBarrier;
      await createTask({ caseId, title: 'Overlapping work', assignedBy: userId }, tx);
    }, { timeout: 12000 });
    let close: Promise<unknown> | undefined;
    try {
      await Promise.race([lockedBarrier, work]);
      close = closeCase(caseId, actor).then(() => 'closed', (error: unknown) => error);
      await waitUntilCloseWaitsForCaseLock();
    } finally {
      release();
      await Promise.allSettled([work, close]);
    }
    await work;
    await expect(close).resolves.toMatchObject({ code: 'CLOSURE_BLOCKED' });
    expect((await writer.case.findUniqueOrThrow({ where: { id: caseId } })).status).not.toBe('FINAL');
    expect(await writer.task.count({ where: { caseId, status: 'TODO' } })).toBe(1);
  });

  it('concurrent duplicate close writes exactly one truthful close event', async () => {
    const { caseId } = await newCase();
    const results = await Promise.allSettled([closeCase(caseId, actor), closeCase(caseId, actor)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const events = await writer.timelineEvent.findMany({ where: { caseId, eventType: 'CASE_STATUS_CHANGED' } });
    expect(events.filter((event) => (event.metadata as any)?.lifecycleAction === 'CLOSE')).toHaveLength(1);
  });

  it('force close keeps history but blocks submission and review resubmission until reopen', async () => {
    const { caseId, clientId } = await newCase();
    const { documentId, versionId } = await newDocument(caseId, clientId);
    const task = await createTask({ caseId, title: 'Submission history', assignedBy: userId, assignedTo: userId });
    const review = await createReview(documentId, actor, { reviewVersionId: versionId }, writer);
    const assigned = await transitionReview(review.id, 'ASSIGN', actor, { reviewerId: userId, expectedRevision: review.revision }, writer);
    const started = await transitionReview(review.id, 'START', actor, { expectedRevision: assigned.revision }, writer);
    const returned = await transitionReview(review.id, 'REQUEST_CHANGES', actor, { safeRationale: 'Correction needed', expectedRevision: started.revision }, writer);
    await closeCase(caseId, actor, { force: true });
    await expect(new TaskSubmissionService(writer).createTaskSubmissionDraft(task.id, userId, {})).rejects.toMatchObject({ code: 'CASE_REOPEN_REQUIRED' });
    await expect(transitionReview(review.id, 'RESUBMIT', actor, { versionId, expectedRevision: returned.revision }, writer)).rejects.toMatchObject({ code: 'CASE_REOPEN_REQUIRED' });
    expect((await writer.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('CANCELLED');
    expect((await writer.documentReview.findUniqueOrThrow({ where: { id: review.id } })).status).toBe('CHANGES_REQUESTED');
  });
});
