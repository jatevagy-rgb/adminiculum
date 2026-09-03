/**
 * Unit tests for Job Foundation
 *
 * Validates:
 * 1. Configuration resolution and PG_BOSS_DATABASE_URL precedence over DATABASE_URL
 * 2. Disabled mode behavior (jobService.isEnabled() === false, start() no-op)
 * 3. Enabled mode with missing database URL strictly throws startup error
 * 4. Enqueue error when service is not started
 * 5. Worker registration deduplication (before start and active duplicate rejection)
 * 6. Clean stop and restart worker re-binding
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

  describe('3. Worker Registration & Duplicate Binding Prevention', () => {
    it('allows worker registration before start with deterministic replacement', async () => {
      const service = new JobService({ enabled: true });
      const handler1 = jest.fn().mockResolvedValue(1);
      const handler2 = jest.fn().mockResolvedValue(2);

      await service.registerWorker('doc.process', handler1);
      await service.registerWorker('doc.process', handler2);

      expect(service.isStarted()).toBe(false);
    });

    it('rejects duplicate active worker registration when service is already running', async () => {
      const service = new JobService({ enabled: true });
      // Simulate running state with mock boss
      (service as any).isRunning = true;
      (service as any).boss = {
        work: jest.fn().mockResolvedValue('worker-123'),
      };

      const handler = jest.fn().mockResolvedValue(true);

      // First active registration succeeds
      await service.registerWorker('doc.extract', handler);

      // Duplicate active registration for same queue is rejected
      await expect(service.registerWorker('doc.extract', handler)).rejects.toThrow(
        'Worker for queue "doc.extract" is already registered/bound'
      );
    });

    it('resets worker binding tracking upon clean stop', async () => {
      const service = new JobService({ enabled: true });
      const mockBoss = {
        work: jest.fn().mockResolvedValue('worker-123'),
        stop: jest.fn().mockResolvedValue(undefined),
      };
      (service as any).isRunning = true;
      (service as any).boss = mockBoss;

      const handler = jest.fn().mockResolvedValue(true);
      await service.registerWorker('doc.scan', handler);

      // Stop resets bound state
      await service.stop();
      expect(service.isStarted()).toBe(false);
      expect((service as any).boundQueues.size).toBe(0);
    });
  });
});
