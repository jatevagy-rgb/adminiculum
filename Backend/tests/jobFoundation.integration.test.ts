/**
 * PostgreSQL Integration tests for pg-boss Job Foundation
 *
 * Validates real PostgreSQL database integration:
 * 1. Startup & schema migration in isolated test schema (pgboss_integration_test)
 * 2. Enqueueing and receiving jobs via worker
 * 3. Execution completion and payload context handling
 * 4. Retry handling on failure
 * 5. Deterministic singleton key deduplication regardless of submission order
 * 6. Real active-handler graceful drain with controlled barrier
 * 7. Clean restart with state persistence
 */

import { Client } from 'pg';
import { JobService } from '../src/modules/jobs/jobService';

const databaseUrl =
  process.env.JOB_FOUNDATION_TEST_DATABASE_URL ||
  process.env.DEMO_KFT_TEST_DATABASE_URL ||
  process.env.MIGRATION_REPLAY_DATABASE_URL ||
  process.env.CLIENT_IDENTITY_TEST_DATABASE_URL ||
  process.env.DATABASE_URL;

const describeWithDb = databaseUrl ? describe : describe.skip;

describeWithDb('Job Foundation PostgreSQL Integration', () => {
  jest.setTimeout(30000);
  const TEST_SCHEMA = 'pgboss_integration_test';
  let pgClient: Client;
  let activeServices: JobService[] = [];

  beforeAll(async () => {
    if (!databaseUrl) return;
    pgClient = new Client({ connectionString: databaseUrl });
    await pgClient.connect();
  });

  afterEach(async () => {
    for (const service of activeServices) {
      if (service.isStarted()) {
        try {
          await service.stop({ graceful: false, timeout: 1000 });
        } catch {
          // ignore cleanup errors during teardown
        }
      }
    }
    activeServices = [];
  });

  afterAll(async () => {
    if (pgClient) {
      await pgClient.end().catch(() => {});
    }
  });

  it('starts pg-boss and creates isolated test schema in PostgreSQL', async () => {
    const service = new JobService({
      enabled: true,
      connectionString: databaseUrl,
      schema: TEST_SCHEMA,
      maxConnections: 3,
    });
    activeServices.push(service);

    await service.start();
    expect(service.isStarted()).toBe(true);

    // Verify schema, queue and version table exist
    const res = await pgClient.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1;`,
      [TEST_SCHEMA]
    );
    const tableNames = res.rows.map((r) => r.table_name);
    expect(tableNames).toContain('version');
    expect(tableNames).toContain('job');
    expect(tableNames).toContain('queue');

    await service.stop({ graceful: true, timeout: 3000 });
    expect(service.isStarted()).toBe(false);
  });

  it('enqueues and processes a job with payload and context', async () => {
    const service = new JobService({
      enabled: true,
      connectionString: databaseUrl,
      schema: TEST_SCHEMA,
      maxConnections: 3,
    });
    activeServices.push(service);

    const receivedJobs: Array<{ data: any; jobId: string }> = [];

    const jobPromise = new Promise<{ data: any; jobId: string }>((resolve) => {
      service.registerWorker(
        'test.smoke',
        async (data, context) => {
          const item = { data, jobId: context.jobId };
          receivedJobs.push(item);
          resolve(item);
          return { success: true };
        },
        { pollingIntervalSeconds: 1 }
      );
    });

    await service.start();

    const enqueuedId = await service.enqueue('test.smoke', { documentId: 'doc-12345', action: 'SMOKE_TEST' });
    expect(enqueuedId).toBeTruthy();

    const result = await Promise.race([
      jobPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Job execution timed out')), 10000)),
    ]);

    expect(result).toMatchObject({
      jobId: enqueuedId,
      data: { documentId: 'doc-12345', action: 'SMOKE_TEST' },
    });

    await service.stop({ graceful: true, timeout: 3000 });
  });

  it('handles retry behavior on worker failure', async () => {
    const service = new JobService({
      enabled: true,
      connectionString: databaseUrl,
      schema: TEST_SCHEMA,
      maxConnections: 3,
      clockMonitorIntervalSeconds: 1,
    });
    activeServices.push(service);

    let attemptCount = 0;

    const retryPromise = new Promise<number>((resolve) => {
      service.registerWorker(
        'test.retry',
        async (_data) => {
          attemptCount++;
          if (attemptCount === 1) {
            throw new Error('Intentional first failure for retry test');
          }
          resolve(attemptCount);
          return { success: true };
        },
        { pollingIntervalSeconds: 1 }
      );
    });

    await service.start();

    await service.enqueue(
      'test.retry',
      { test: 'retry-job' },
      { retryLimit: 2, retryDelay: 1, retryBackoff: false }
    );

    const finalAttempts = await Promise.race([
      retryPromise,
      new Promise<number>((_, reject) =>
        setTimeout(() => reject(new Error('Retry test timed out')), 15000)
      ),
    ]);

    expect(finalAttempts).toBe(2);

    await service.stop({ graceful: true, timeout: 3000 });
  });

  it('deduplicates duplicate job submissions using singletonKey regardless of submission order', async () => {
    const service = new JobService({
      enabled: true,
      connectionString: databaseUrl,
      schema: TEST_SCHEMA,
      maxConnections: 3,
    });
    activeServices.push(service);

    await service.start();

    // 1. Order A: singleton job -> duplicate singleton job on same key -> second is deduplicated (null)
    const keyA = `singleton-order-a-${Date.now()}`;
    const jobA1 = await service.enqueue('test.singleton_order', { doc: 'A' }, { singletonKey: keyA });
    expect(jobA1).toBeTruthy();

    const jobA2 = await service.enqueue('test.singleton_order', { doc: 'A-dup' }, { singletonKey: keyA });
    expect(jobA2).toBeNull();

    // 2. Order B: normal non-singleton job -> singleton job on same queue -> both succeed independently
    const keyB = `singleton-order-b-${Date.now()}`;
    const jobB1 = await service.enqueue('test.singleton_order', { doc: 'B-normal' });
    expect(jobB1).toBeTruthy();

    const jobB2 = await service.enqueue('test.singleton_order', { doc: 'B-singleton' }, { singletonKey: keyB });
    expect(jobB2).toBeTruthy();

    const jobB3 = await service.enqueue('test.singleton_order', { doc: 'B-singleton-dup' }, { singletonKey: keyB });
    expect(jobB3).toBeNull();

    await service.stop({ graceful: true, timeout: 3000 });
  });

  it('gracefully stops worker execution and drains active handlers before stopping', async () => {
    const service = new JobService({
      enabled: true,
      connectionString: databaseUrl,
      schema: TEST_SCHEMA,
      maxConnections: 3,
    });
    activeServices.push(service);

    let handlerStarted = false;
    let handlerCompleted = false;
    let stopResolved = false;

    let releaseBarrier: () => void = () => {};
    const handlerBarrier = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });

    let notifyHandlerStarted: () => void = () => {};
    const handlerStartedPromise = new Promise<void>((resolve) => {
      notifyHandlerStarted = resolve;
    });

    await service.registerWorker(
      'test.drain',
      async (_data) => {
        handlerStarted = true;
        notifyHandlerStarted();
        // Block handler on barrier promise until test releases it
        await handlerBarrier;
        handlerCompleted = true;
        return { drained: true };
      },
      { pollingIntervalSeconds: 1 }
    );

    await service.start();

    const jobId = await service.enqueue('test.drain', { item: 'drain-payload' });
    expect(jobId).toBeTruthy();

    // 1. Wait until handler begins executing
    await handlerStartedPromise;
    expect(handlerStarted).toBe(true);
    expect(handlerCompleted).toBe(false);

    // 2. Initiate graceful stop while handler is in-flight
    const stopPromise = service.stop({ graceful: true, timeout: 5000 }).then(() => {
      stopResolved = true;
    });

    // 3. Small yield to verify stop is pending while handler is blocked
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(stopResolved).toBe(false);
    expect(handlerCompleted).toBe(false);

    // 4. Release barrier to allow handler to finish
    releaseBarrier();

    // 5. Await graceful stop resolution
    await stopPromise;
    expect(stopResolved).toBe(true);
    expect(handlerCompleted).toBe(true);
    expect(service.isStarted()).toBe(false);
  });

  it('preserves state across restart', async () => {
    // 1. Start first instance, enqueue a job without registering a worker on service1
    const service1 = new JobService({
      enabled: true,
      connectionString: databaseUrl,
      schema: TEST_SCHEMA,
      maxConnections: 3,
    });
    activeServices.push(service1);
    await service1.start();

    const jobId = await service1.enqueue('test.restart', { token: 'persist-123' });
    expect(jobId).toBeTruthy();

    await service1.stop({ graceful: true, timeout: 3000 });

    // 2. Start second instance with worker registered, receives persisted job
    const service2 = new JobService({
      enabled: true,
      connectionString: databaseUrl,
      schema: TEST_SCHEMA,
      maxConnections: 3,
    });
    activeServices.push(service2);

    const receivedPromise = new Promise<{ token: string }>((resolve) => {
      service2.registerWorker('test.restart', async (data) => {
        resolve(data);
        return { ok: true };
      }, { pollingIntervalSeconds: 1 });
    });

    await service2.start();

    const received = await Promise.race([
      receivedPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Restart test timed out')), 10000)),
    ]);

    expect(received).toEqual({ token: 'persist-123' });

    await service2.stop({ graceful: true, timeout: 3000 });
  });
});
