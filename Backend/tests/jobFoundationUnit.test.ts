/**
 * Unit tests for Job Foundation
 *
 * Validates:
 * 1. Configuration resolution and PG_BOSS_DATABASE_URL precedence over DATABASE_URL
 * 2. Disabled mode behavior (jobService.isEnabled() === false, start() no-op)
 * 3. Enabled mode with missing database URL strictly throws startup error
 * 4. Enqueue error when service is not started
 * 5. ensureQueue error propagation, default 'standard' policy, and createdQueues tracking
 * 6. Worker registration atomicity, duplicate binding rejection, and production start() failure rollback
 * 7. Stable queue policy determination
 */

import { JobService } from '../src/modules/jobs/jobService';
import { getJobServiceConfig } from '../src/modules/jobs/config';

describe('Job Foundation Unit Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.BACKGROUND_JOBS_ENABLED;
    delete process.env.DATABASE_URL;
    delete process.env.PG_BOSS_DATABASE_URL;
    delete process.env.PG_BOSS_SCHEMA;
    delete process.env.PG_BOSS_MAX_CONNECTIONS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('1. Configuration & Database URL Precedence', () => {
    it('defaults to disabled when BACKGROUND_JOBS_ENABLED is unset or false', () => {
      const config = getJobServiceConfig();
      expect(config.enabled).toBe(false);
      expect(config.schema).toBe('pgboss');
      expect(config.defaultRetryLimit).toBe(3);
      expect(config.defaultRetryDelay).toBe(10);
      expect(config.defaultRetryBackoff).toBe(true);

      const service = new JobService();
      expect(service.isEnabled()).toBe(false);
      expect(service.isStarted()).toBe(false);
    });

    it('enables when BACKGROUND_JOBS_ENABLED is "true"', () => {
      process.env.BACKGROUND_JOBS_ENABLED = 'true';
      process.env.PG_BOSS_SCHEMA = 'custom_boss';
      process.env.PG_BOSS_MAX_CONNECTIONS = '10';

      const config = getJobServiceConfig();
      expect(config.enabled).toBe(true);
      expect(config.schema).toBe('custom_boss');
      expect(config.maxConnections).toBe(10);

      const service = new JobService();
      expect(service.isEnabled()).toBe(true);
    });

    it('uses DATABASE_URL when only DATABASE_URL is present', () => {
      process.env.DATABASE_URL = 'postgres://user:pass@app-db:5432/adminiculum';
      const config = getJobServiceConfig();
      expect(config.connectionString).toBe('postgres://user:pass@app-db:5432/adminiculum');
    });

    it('uses PG_BOSS_DATABASE_URL when only PG_BOSS_DATABASE_URL is present', () => {
      process.env.PG_BOSS_DATABASE_URL = 'postgres://user:pass@jobs-db:5432/pgboss';
      const config = getJobServiceConfig();
      expect(config.connectionString).toBe('postgres://user:pass@jobs-db:5432/pgboss');
    });

    it('gives PG_BOSS_DATABASE_URL precedence when both are present', () => {
      process.env.DATABASE_URL = 'postgres://user:pass@app-db:5432/adminiculum';
      process.env.PG_BOSS_DATABASE_URL = 'postgres://user:pass@dedicated-jobs-db:5432/pgboss';

      const config = getJobServiceConfig();
      expect(config.connectionString).toBe('postgres://user:pass@dedicated-jobs-db:5432/pgboss');
    });
  });

  describe('2. Disabled Mode & Enqueue Guards', () => {
    it('disabled service returns null without error on enqueue', async () => {
      const service = new JobService({ enabled: false });
      const jobId = await service.enqueue('test-queue', { foo: 'bar' });
      expect(jobId).toBeNull();
    });

    it('enabled service throws error if enqueue is called before start', async () => {
      const service = new JobService({ enabled: true, connectionString: 'postgres://localhost/test' });
      await expect(service.enqueue('test-queue', { foo: 'bar' })).rejects.toThrow(
        'Job service is not started'
      );
    });

    it('start() does nothing when disabled even without DB connection', async () => {
      const service = new JobService({ enabled: false, connectionString: '' });
      await expect(service.start()).resolves.toBeUndefined();
      expect(service.isStarted()).toBe(false);
      expect(service.getBossInstance()).toBeNull();
    });

    it('start() strictly throws error when enabled but connection string is missing', async () => {
      const service = new JobService({ enabled: true, connectionString: '' });
      await expect(service.start()).rejects.toThrow(
        'Missing database connection string for pg-boss'
      );
      expect(service.isStarted()).toBe(false);
      expect(service.getBossInstance()).toBeNull();
    });

    it('stop() is idempotent and safe when service is not running', async () => {
      const service = new JobService({ enabled: false });
      await expect(service.stop()).resolves.toBeUndefined();
      expect(service.isStarted()).toBe(false);
    });
  });

  describe('3. ensureQueue() Error Propagation & State Tracking', () => {
    it('records queue in createdQueues on successful createQueue with default standard policy', async () => {
      const service = new JobService({ enabled: true, connectionString: 'postgres://localhost/test' });
      const mockCreateQueue = jest.fn().mockResolvedValue(undefined);
      (service as any).boss = { createQueue: mockCreateQueue };

      await service.ensureQueue('doc.extract');

      expect(mockCreateQueue).toHaveBeenCalledWith('doc.extract', {
        name: 'doc.extract',
        policy: 'standard',
      });
      expect(service.getCreatedQueues()).toContain('doc.extract');
    });

    it('handles idempotent existing queue without error and records as created', async () => {
      const service = new JobService({ enabled: true, connectionString: 'postgres://localhost/test' });
      const mockCreateQueue = jest.fn().mockResolvedValue(undefined);
      (service as any).boss = { createQueue: mockCreateQueue };

      await service.ensureQueue('doc.extract');
      // Second call does not re-invoke boss.createQueue because it is cached
      await service.ensureQueue('doc.extract');

      expect(mockCreateQueue).toHaveBeenCalledTimes(1);
      expect(service.getCreatedQueues()).toContain('doc.extract');
    });

    it('propagates DB failure and does NOT record queue as created', async () => {
      const service = new JobService({ enabled: true, connectionString: 'postgres://localhost/test' });
      const dbError = new Error('Connection terminated unexpectedly');
      const mockCreateQueue = jest.fn().mockRejectedValue(dbError);
      (service as any).boss = { createQueue: mockCreateQueue };

      await expect(service.ensureQueue('doc.fail_queue')).rejects.toThrow(
        'Connection terminated unexpectedly'
      );

      expect(service.getCreatedQueues()).not.toContain('doc.fail_queue');
    });

    it('propagates permission/config failure and does NOT record queue as created', async () => {
      const service = new JobService({ enabled: true, connectionString: 'postgres://localhost/test' });
      const permError = new Error('permission denied for table queue');
      const mockCreateQueue = jest.fn().mockRejectedValue(permError);
      (service as any).boss = { createQueue: mockCreateQueue };

      await expect(service.ensureQueue('doc.forbidden_queue')).rejects.toThrow(
        'permission denied for table queue'
      );

      expect(service.getCreatedQueues()).not.toContain('doc.forbidden_queue');
    });
  });

  describe('4. Worker Registration Atomicity & Rollback', () => {
    it('allows worker registration before start without binding', async () => {
      const service = new JobService({ enabled: true });
      const handler = jest.fn().mockResolvedValue(1);

      await service.registerWorker('doc.process', handler);

      expect(service.isStarted()).toBe(false);
      expect(service.getBoundQueues()).toEqual([]);
    });

    it('marks worker bound ONLY after boss.work() succeeds during active registration', async () => {
      const service = new JobService({ enabled: true });
      const mockWork = jest.fn().mockResolvedValue('worker-id-1');
      const mockCreateQueue = jest.fn().mockResolvedValue(undefined);

      (service as any).isRunning = true;
      (service as any).boss = {
        work: mockWork,
        createQueue: mockCreateQueue,
      };

      const handler = jest.fn().mockResolvedValue(true);
      await service.registerWorker('doc.extract', handler);

      expect(service.isWorkerBound('doc.extract')).toBe(true);
      expect(service.getBoundQueues()).toContain('doc.extract');
      expect(mockWork).toHaveBeenCalled();
    });

    it('rejects duplicate active worker registration when queue is already bound', async () => {
      const service = new JobService({ enabled: true });
      (service as any).isRunning = true;
      (service as any).boss = {
        work: jest.fn().mockResolvedValue('worker-123'),
        createQueue: jest.fn().mockResolvedValue(undefined),
      };

      const handler = jest.fn().mockResolvedValue(true);
      await service.registerWorker('doc.extract', handler);

      await expect(service.registerWorker('doc.extract', handler)).rejects.toThrow(
        'Worker for queue "doc.extract" is already registered/bound'
      );
    });

    it('rolls back worker registration if bindWorker fails on running service', async () => {
      const service = new JobService({ enabled: true });
      const bindError = new Error('Worker bind internal error');
      (service as any).isRunning = true;
      (service as any).boss = {
        work: jest.fn().mockRejectedValue(bindError),
        createQueue: jest.fn().mockResolvedValue(undefined),
      };

      const handler = jest.fn().mockResolvedValue(true);
      await expect(service.registerWorker('doc.fail_bind', handler)).rejects.toThrow(
        'Worker bind internal error'
      );

      expect(service.isWorkerBound('doc.fail_bind')).toBe(false);
      expect(service.getBoundQueues()).not.toContain('doc.fail_bind');
    });

    it('tests actual production start() rollback and resource cleanup when a worker fails to bind', async () => {
      const mockStop = jest.fn().mockResolvedValue(undefined);
      const mockStart = jest.fn().mockResolvedValue(undefined);
      const mockCreateQueue = jest.fn().mockResolvedValue(undefined);
      const mockWork = jest.fn().mockImplementation((queueName: string) => {
        if (queueName === 'worker.b') {
          return Promise.reject(new Error('Worker B bind failure'));
        }
        return Promise.resolve('worker-a-id');
      });

      const mockBoss = {
        start: mockStart,
        stop: mockStop,
        createQueue: mockCreateQueue,
        work: mockWork,
        on: jest.fn(),
      };

      const fakeBossFactory = jest.fn().mockReturnValue(mockBoss);

      const service = new JobService(
        {
          enabled: true,
          connectionString: 'postgres://localhost/test',
        },
        fakeBossFactory
      );

      const handlerA = jest.fn().mockResolvedValue(true);
      const handlerB = jest.fn().mockResolvedValue(true);

      await service.registerWorker('worker.a', handlerA);
      await service.registerWorker('worker.b', handlerB);

      // Invoke the ACTUAL production start() without mocking or overriding it
      await expect(service.start()).rejects.toThrow('Worker B bind failure');

      expect(mockStart).toHaveBeenCalled();
      expect(mockStop).toHaveBeenCalledWith({ graceful: false, timeout: 1000 });
      expect(service.isStarted()).toBe(false);
      expect(service.getBossInstance()).toBeNull();
      expect(service.getBoundQueues()).toEqual([]);
      expect(service.getCreatedQueues()).toEqual([]);
    });

    it('proves clean retry after failed startup without stale state blocking retry', async () => {
      let shouldFail = true;
      const mockStop = jest.fn().mockResolvedValue(undefined);
      const mockStart = jest.fn().mockResolvedValue(undefined);
      const mockCreateQueue = jest.fn().mockResolvedValue(undefined);
      const mockWork = jest.fn().mockImplementation(() => {
        if (shouldFail) {
          return Promise.reject(new Error('Temporary worker bind failure'));
        }
        return Promise.resolve('worker-ok-id');
      });

      const createMockBoss = () => ({
        start: mockStart,
        stop: mockStop,
        createQueue: mockCreateQueue,
        work: mockWork,
        on: jest.fn(),
      });

      const fakeBossFactory = jest.fn().mockImplementation(createMockBoss);

      const service = new JobService(
        {
          enabled: true,
          connectionString: 'postgres://localhost/test',
        },
        fakeBossFactory
      );

      await service.registerWorker('retryable.queue', jest.fn());

      // First attempt fails and rolls back cleanly
      await expect(service.start()).rejects.toThrow('Temporary worker bind failure');
      expect(service.isStarted()).toBe(false);
      expect(service.getBoundQueues()).toEqual([]);

      // Second attempt succeeds
      shouldFail = false;
      await expect(service.start()).resolves.toBeUndefined();
      expect(service.isStarted()).toBe(true);
      expect(service.getBoundQueues()).toContain('retryable.queue');
      expect(service.getCreatedQueues()).toContain('retryable.queue');

      await service.stop();
      expect(service.isStarted()).toBe(false);
    });

    it('resets worker binding tracking upon clean stop', async () => {
      const service = new JobService({ enabled: true });
      const mockBoss = {
        work: jest.fn().mockResolvedValue('worker-123'),
        createQueue: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
      };
      (service as any).isRunning = true;
      (service as any).boss = mockBoss;

      const handler = jest.fn().mockResolvedValue(true);
      await service.registerWorker('doc.scan', handler);

      expect(service.isWorkerBound('doc.scan')).toBe(true);

      await service.stop();
      expect(service.isStarted()).toBe(false);
      expect(service.getBoundQueues()).toEqual([]);
    });
  });

  describe('5. Stable Queue Policy', () => {
    it('defaults queue policy to standard when no special policy is configured', async () => {
      const service = new JobService({ enabled: true, connectionString: 'postgres://localhost/test' });
      const mockCreateQueue = jest.fn().mockResolvedValue(undefined);
      const mockSend = jest.fn().mockResolvedValue('job-id-1');
      (service as any).boss = {
        createQueue: mockCreateQueue,
        send: mockSend,
      };
      (service as any).isRunning = true;

      await service.enqueue('document.extract', { docId: 'doc-123' });
      expect(mockCreateQueue).toHaveBeenCalledWith('document.extract', {
        name: 'document.extract',
        policy: 'standard',
      });
    });

    it('preserves explicitly registered queue policy regardless of enqueue parameters', async () => {
      const service = new JobService({ enabled: true, connectionString: 'postgres://localhost/test' });
      const mockCreateQueue = jest.fn().mockResolvedValue(undefined);
      const mockSend = jest.fn().mockResolvedValue('job-id-1');
      (service as any).boss = {
        createQueue: mockCreateQueue,
        send: mockSend,
      };
      (service as any).isRunning = true;

      service.registerQueue('custom.queue', { policy: 'short' });

      // First enqueue without singletonKey
      await service.enqueue('custom.queue', { msg: 'normal' });
      expect(mockCreateQueue).toHaveBeenCalledWith('custom.queue', {
        name: 'custom.queue',
        policy: 'short',
      });

      // Second enqueue with singletonKey
      await service.enqueue('custom.queue', { msg: 'singleton' }, { singletonKey: 'key-1' });
      // Queue is already established and not re-created with different policy
      expect(mockCreateQueue).toHaveBeenCalledTimes(1);
    });
  });
});
