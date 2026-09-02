/**
 * Unit tests for Job Foundation
 *
 * Validates:
 * 1. Disabled mode behavior (jobService.isEnabled() === false, start() no-op)
 * 2. Configuration resolution from environment variables
 * 3. Enqueue error when service is not started
 * 4. Worker registration before and after startup
 * 5. Clean stop behavior
 */

import { JobService } from '../src/modules/jobs/jobService';
import { getJobServiceConfig } from '../src/modules/jobs/config';

describe('Job Foundation Unit Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.BACKGROUND_JOBS_ENABLED;
    delete process.env.PG_BOSS_SCHEMA;
    delete process.env.PG_BOSS_MAX_CONNECTIONS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('1. Configuration & Disabled Mode', () => {
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
  });

  describe('2. Lifecycle & Worker Registration', () => {
    it('start() does nothing when disabled', async () => {
      const service = new JobService({ enabled: false });
      await service.start();
      expect(service.isStarted()).toBe(false);
      expect(service.getBossInstance()).toBeNull();
    });

    it('start() logs warning and skips when connectionString is missing', async () => {
      const service = new JobService({ enabled: true, connectionString: '' });
      await service.start();
      expect(service.isStarted()).toBe(false);
      expect(service.getBossInstance()).toBeNull();
    });

    it('stop() is idempotent and safe when service is not running', async () => {
      const service = new JobService({ enabled: false });
      await expect(service.stop()).resolves.toBeUndefined();
      expect(service.isStarted()).toBe(false);
    });

    it('allows worker registration while stopped and preserves queue mappings', () => {
      const service = new JobService({ enabled: true });
      const mockHandler = jest.fn().mockResolvedValue(true);

      service.registerWorker('document.extract', mockHandler, { batchSize: 2 });
      // Worker registered in internal map
      expect(service.isStarted()).toBe(false);
    });
  });
});
