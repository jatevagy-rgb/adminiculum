/**
 * PostgreSQL Integration tests for pg-boss Job Foundation
 *
 * Validates real PostgreSQL database integration:
 * 1. Startup & schema migration in isolated test schema (pgboss_integration_test)
 * 2. Enqueueing and receiving jobs via worker
 * 3. Execution completion and payload context handling
 * 4. Retry handling on failure
 * 5. Singleton key deduplication (pg-boss 10.4.2 semantics)
 * 6. Graceful shutdown
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
  const TEST_SCHEMA = 'pgboss_integration_test';
  let pgClient: Client;

  beforeAll(async () => {
    if (!databaseUrl) return;
    pgClient = new Client({ connectionString: databaseUrl });
    await pgClient.connect();
    // Drop test schema to start fresh
    await pgClient.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE;`);
  });

  afterAll(async () => {
    if (pgClient) {
      await pgClient.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE;`).catch(() => {});
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

    await service.start();
    expect(service.isStarted()).toBe(true);

    // Verify schema and version table exist
    const res = await pgClient.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1;`,
      [TEST_SCHEMA]
    );
    const tableNames = res.rows.map((r) => r.table_name);
    expect(tableNames).toContain('version');
    expect(tableNames).toContain('job');

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
      new Promise((_, reject) => setTimeout(() => reject(new Error('Job execution timed out')), 8000)),
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
    });

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
        setTimeout(() => reject(new Error('Retry test timed out')), 10000)
      ),
    ]);

    expect(finalAttempts).toBe(2);

    await service.stop({ graceful: true, timeout: 3000 });
  });

  it('deduplicates duplicate job submissions using singletonKey', async () => {
    const service = new JobService({
      enabled: true,
      connectionString: databaseUrl,
      schema: TEST_SCHEMA,
      maxConnections: 3,
    });

    await service.start();

    const singletonKey = `doc-extract-${Date.now()}`;
    const firstJobId = await service.enqueue(
      'test.singleton',
      { docId: 'doc-101', attempt: 1 },
      { singletonKey }
    );
    expect(firstJobId).toBeTruthy();

    // Second submission with same singleton key while first is active/pending returns null
    const secondJobId = await service.enqueue(
      'test.singleton',
      { docId: 'doc-101', attempt: 2 },
      { singletonKey }
    );
    expect(secondJobId).toBeNull();

    await service.stop({ graceful: true, timeout: 3000 });
  });

  it('gracefully stops worker execution and drains cleanly', async () => {
    const service = new JobService({
      enabled: true,
      connectionString: databaseUrl,
      schema: TEST_SCHEMA,
      maxConnections: 3,
    });

    await service.start();
    expect(service.isStarted()).toBe(true);
    expect(service.getBossInstance()).not.toBeNull();

    await service.stop({ graceful: true, timeout: 3000 });
    expect(service.isStarted()).toBe(false);
    expect(service.getBossInstance()).toBeNull();
  });

  it('preserves state across restart', async () => {
    // 1. Start first instance, enqueue a future job
    const service1 = new JobService({
      enabled: true,
      connectionString: databaseUrl,
      schema: TEST_SCHEMA,
      maxConnections: 3,
    });
    await service1.start();

    const futureDate = new Date(Date.now() + 1000); // 1 second in future
    const jobId = await service1.enqueue('test.restart', { token: 'persist-123' }, { startAfter: futureDate });
    expect(jobId).toBeTruthy();

    await service1.stop({ graceful: true, timeout: 3000 });

    // 2. Start second instance, worker receives persisted job
    const service2 = new JobService({
      enabled: true,
      connectionString: databaseUrl,
      schema: TEST_SCHEMA,
      maxConnections: 3,
    });

    const receivedPromise = new Promise<{ token: string }>((resolve) => {
      service2.registerWorker('test.restart', async (data) => {
        resolve(data);
        return { ok: true };
      }, { pollingIntervalSeconds: 1 });
    });

    await service2.start();

    const received = await Promise.race([
      receivedPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Restart test timed out')), 8000)),
    ]);

    expect(received).toEqual({ token: 'persist-123' });

    await service2.stop({ graceful: true, timeout: 3000 });
  });
});
