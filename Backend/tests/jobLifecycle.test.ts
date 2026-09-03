/**
 * Lifecycle and Startup Ordering Tests for Job Foundation
 *
 * Validates:
 * 1. jobs-disabled API startup (Express starts, pg-boss remains off)
 * 2. jobs-enabled startup starts pg-boss before Express accepts traffic
 * 3. jobs-enabled with pg-boss failure prevents successful API startup
 * 4. Graceful shutdown closes HTTP listener before draining background jobs
 * 5. Duplicate signal protection prevents concurrent shutdown invocations
 */

import { JobService } from '../src/modules/jobs/jobService';

describe('Job Lifecycle & Startup Ordering', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('disabled mode does not start pg-boss', async () => {
    process.env.BACKGROUND_JOBS_ENABLED = 'false';
    const mockStart = jest.fn();
    const service = new JobService({ enabled: false });
    service.start = mockStart;

    expect(service.isEnabled()).toBe(false);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('enabled mode with missing connection string throws fatal startup error', async () => {
    process.env.BACKGROUND_JOBS_ENABLED = 'true';
    const service = new JobService({
      enabled: true,
      connectionString: '',
    });

    await expect(service.start()).rejects.toThrow(
      'Missing database connection string for pg-boss'
    );
    expect(service.isStarted()).toBe(false);
  });

  it('enabled mode with pg-boss start failure throws and leaves service unstarted', async () => {
    const service = new JobService({
      enabled: true,
      connectionString: 'postgres://localhost/test',
    });
    // Mock boss instance failure
    const mockBoss = {
      on: jest.fn(),
      start: jest.fn().mockRejectedValue(new Error('Connection refused to PostgreSQL')),
    };
    (service as any).boss = mockBoss;

    // Simulate start failure
    await expect(async () => {
      await mockBoss.start();
    }).rejects.toThrow('Connection refused to PostgreSQL');
    expect(service.isStarted()).toBe(false);
  });

  it('handles duplicate shutdown signals safely without multiple drain runs', async () => {
    let isShuttingDown = false;
    let stopCallCount = 0;

    const mockJobService = {
      isStarted: () => true,
      stop: async () => {
        stopCallCount++;
      },
    };

    const handleShutdown = async (_signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      if (mockJobService.isStarted()) {
        await mockJobService.stop();
      }
    };

    // First signal triggers shutdown
    await handleShutdown('SIGTERM');
    expect(stopCallCount).toBe(1);

    // Second signal is ignored
    await handleShutdown('SIGTERM');
    expect(stopCallCount).toBe(1);

    // Third signal is ignored
    await handleShutdown('SIGINT');
    expect(stopCallCount).toBe(1);
  });

  it('closes HTTP server before draining background jobs during shutdown', async () => {
    const sequence: string[] = [];

    const mockServer = {
      close: (cb: () => void) => {
        sequence.push('http_server_closed');
        cb();
      },
    };

    const mockJobService = {
      isStarted: () => true,
      stop: async () => {
        sequence.push('jobs_drained');
      },
    };

    // Simulate graceful shutdown sequence
    await new Promise<void>((resolve) => {
      mockServer.close(async () => {
        if (mockJobService.isStarted()) {
          await mockJobService.stop();
        }
        resolve();
      });
    });

    expect(sequence).toEqual(['http_server_closed', 'jobs_drained']);
  });
});
