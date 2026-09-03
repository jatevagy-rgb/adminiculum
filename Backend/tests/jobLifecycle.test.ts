/**
 * Lifecycle and Startup Ordering Tests for Job Foundation
 *
 * Tests the real production AppLifecycle orchestrator implementation:
 * 1. jobs-disabled: pg-boss start not required, Express listener opens
 * 2. jobs-enabled: pg-boss start completes BEFORE Express listener opens
 * 3. jobs-enabled failure: pg-boss rejection prevents Express listener from opening
 * 4. Graceful shutdown: server.close completes before jobService.stop
 * 5. Duplicate signals: idempotency guard prevents duplicate shutdown sequences
 */

import express from 'express';
import http from 'http';
import { AppLifecycle } from '../src/lifecycle';
import { JobService } from '../src/modules/jobs/jobService';

describe('Job Lifecycle & Production Startup/Shutdown Ordering', () => {
  let mockApp: express.Application;
  let mockServer: http.Server;
  let exitFn: jest.Mock;

  beforeEach(() => {
    exitFn = jest.fn();
    mockServer = {
      close: jest.fn((cb?: () => void) => {
        if (cb) cb();
        return mockServer;
      }),
      on: jest.fn(),
    } as unknown as http.Server;

    mockApp = {
      listen: jest.fn((_port: number, _host: string, cb?: () => void) => {
        if (cb) process.nextTick(cb);
        return mockServer;
      }),
    } as unknown as express.Application;
  });

  it('1. Jobs disabled: starts HTTP listener without requiring jobService.start', async () => {
    const jobService = new JobService({ enabled: false });
    const jobStartSpy = jest.spyOn(jobService, 'start');

    const lifecycle = new AppLifecycle({
      app: mockApp,
      jobService,
      port: 3001,
      exitFn,
    });

    const server = await lifecycle.bootstrap();

    expect(jobStartSpy).not.toHaveBeenCalled();
    expect(mockApp.listen).toHaveBeenCalledWith(3001, '0.0.0.0', expect.any(Function));
    expect(server).toBe(mockServer);
  });

  it('2. Jobs enabled: completes jobService.start BEFORE opening HTTP listener', async () => {
    const executionOrder: string[] = [];

    const jobService = new JobService({
      enabled: true,
      connectionString: 'postgres://localhost/test',
    });

    jest.spyOn(jobService, 'start').mockImplementation(async () => {
      executionOrder.push('job_service_started');
    });

    (mockApp.listen as jest.Mock).mockImplementation((_port: number, _host: string, cb?: () => void) => {
      executionOrder.push('http_listener_opened');
      if (cb) cb();
      return mockServer;
    });

    const lifecycle = new AppLifecycle({
      app: mockApp,
      jobService,
      port: 3001,
      exitFn,
    });

    await lifecycle.bootstrap();

    expect(executionOrder).toEqual(['job_service_started', 'http_listener_opened']);
  });

  it('3. Jobs enabled & pg-boss start fails: rejects bootstrap and NEVER calls app.listen', async () => {
    const jobService = new JobService({
      enabled: true,
      connectionString: 'postgres://localhost/test',
    });

    jest.spyOn(jobService, 'start').mockRejectedValue(
      new Error('PostgreSQL connection refused')
    );

    const lifecycle = new AppLifecycle({
      app: mockApp,
      jobService,
      port: 3001,
      exitFn,
    });

    await expect(lifecycle.bootstrap()).rejects.toThrow('PostgreSQL connection refused');

    expect(mockApp.listen).not.toHaveBeenCalled();
    expect(lifecycle.getServer()).toBeNull();
  });

  it('4. Graceful shutdown: closes HTTP server BEFORE draining background jobs', async () => {
    const shutdownOrder: string[] = [];

    const jobService = new JobService({
      enabled: true,
      connectionString: 'postgres://localhost/test',
    });
    jest.spyOn(jobService, 'isStarted').mockReturnValue(true);
    jest.spyOn(jobService, 'stop').mockImplementation(async () => {
      shutdownOrder.push('jobs_stopped');
    });

    (mockServer.close as jest.Mock).mockImplementation((cb?: () => void) => {
      shutdownOrder.push('http_server_closed');
      if (cb) cb();
      return mockServer;
    });

    const lifecycle = new AppLifecycle({
      app: mockApp,
      jobService,
      port: 3001,
      exitFn,
    });
    lifecycle.setServer(mockServer);

    await lifecycle.handleGracefulShutdown('SIGTERM');

    expect(shutdownOrder).toEqual(['http_server_closed', 'jobs_stopped']);
    expect(exitFn).toHaveBeenCalledWith(0);
  });

  it('5. Duplicate signals: executes shutdown sequence exactly once', async () => {
    const jobService = new JobService({
      enabled: true,
      connectionString: 'postgres://localhost/test',
    });
    jest.spyOn(jobService, 'isStarted').mockReturnValue(true);
    const jobStopSpy = jest.spyOn(jobService, 'stop').mockResolvedValue(undefined);

    const lifecycle = new AppLifecycle({
      app: mockApp,
      jobService,
      port: 3001,
      exitFn,
    });
    lifecycle.setServer(mockServer);

    // Concurrently trigger multiple signals
    await Promise.all([
      lifecycle.handleGracefulShutdown('SIGTERM'),
      lifecycle.handleGracefulShutdown('SIGTERM'),
      lifecycle.handleGracefulShutdown('SIGINT'),
    ]);

    expect(mockServer.close).toHaveBeenCalledTimes(1);
    expect(jobStopSpy).toHaveBeenCalledTimes(1);
    expect(exitFn).toHaveBeenCalledTimes(1);
    expect(exitFn).toHaveBeenCalledWith(0);
  });
});
