/**
 * Adminiculum Job Service Adapter
 *
 * Implements a lightweight, resilient adapter wrapping pg-boss for asynchronous background task execution.
 */

import PgBoss from 'pg-boss';
import { getJobServiceConfig } from './config';
import { JobContext, JobHandler, JobOptions, JobServiceConfig, WorkerOptions } from './types';

export class JobService {
  private boss: PgBoss | null = null;
  private config: JobServiceConfig;
  private registeredWorkers: Map<
    string,
    { handler: JobHandler; options?: WorkerOptions }
  > = new Map();
  private boundQueues: Set<string> = new Set();
  private isRunning = false;

  private createdQueues: Set<string> = new Set<string>();

  constructor(customConfig?: Partial<JobServiceConfig>) {
    this.config = { ...getJobServiceConfig(), ...customConfig };
  }

  public isEnabled(): boolean {
    return Boolean(this.config.enabled);
  }

  public isStarted(): boolean {
    return this.isRunning;
  }

  public async registerWorker<TData = any, TResult = any>(
    queueName: string,
    handler: JobHandler<TData, TResult>,
    options?: WorkerOptions
  ): Promise<void> {
    if (this.isRunning && this.boss) {
      if (this.boundQueues.has(queueName)) {
        throw new Error(`[JobService] Worker for queue "${queueName}" is already registered/bound.`);
      }
      this.registeredWorkers.set(queueName, { handler, options });
      this.boundQueues.add(queueName);
      await this.ensureQueue(queueName);
      await this.bindWorker(queueName, handler, options);
    } else {
      this.registeredWorkers.set(queueName, { handler, options });
    }
  }

  public async enqueue<TData extends object = any>(
    queueName: string,
    data: TData,
    options?: JobOptions
  ): Promise<string | null> {
    if (!this.isEnabled()) {
      console.warn(`[JobService] Jobs disabled. Skipping enqueue for queue: ${queueName}`);
      return null;
    }
    if (!this.isRunning || !this.boss) {
      throw new Error(`[JobService] Cannot enqueue job. Job service is not started.`);
    }

    await this.ensureQueue(queueName, options?.singletonKey ? 'short' : 'standard');

    const rawSendOptions: PgBoss.SendOptions = {
      retryLimit: options?.retryLimit ?? this.config.defaultRetryLimit,
      retryDelay: options?.retryDelay ?? this.config.defaultRetryDelay,
      retryBackoff: options?.retryBackoff ?? this.config.defaultRetryBackoff,
      expireInSeconds: options?.expireInSeconds ?? this.config.defaultExpireInSeconds,
      retentionSeconds: options?.retentionSeconds ?? this.config.defaultRetentionSeconds,
      priority: options?.priority,
      startAfter: options?.startAfter,
      singletonKey: options?.singletonKey,
      deadLetter: options?.deadLetter,
    };

    const sendOptions: PgBoss.SendOptions = Object.fromEntries(
      Object.entries(rawSendOptions).filter(([_, v]) => v !== undefined)
    ) as PgBoss.SendOptions;

    return await this.boss.send(queueName, data, sendOptions);
  }

  public async start(): Promise<void> {
    if (!this.isEnabled()) {
      console.log('[JobService] Background jobs are disabled (BACKGROUND_JOBS_ENABLED != true).');
      return;
    }

    if (this.isRunning) {
      return;
    }

    if (!this.config.connectionString) {
      throw new Error('[JobService] Missing database connection string for pg-boss.');
    }

    const bossOptions: PgBoss.ConstructorOptions = {
      connectionString: this.config.connectionString,
      schema: this.config.schema,
      max: this.config.maxConnections,
      application_name: 'adminiculum-jobs',
    };
    if (this.config.clockMonitorIntervalSeconds !== undefined) {
      bossOptions.clockMonitorIntervalSeconds = this.config.clockMonitorIntervalSeconds;
    }

    this.boss = new PgBoss(bossOptions);

    this.boss.on('error', (err) => {
      console.error('[JobService] pg-boss internal error:', err.message);
    });

    await this.boss.start();
    this.isRunning = true;
    this.boundQueues.clear();
    this.createdQueues.clear();
    console.log(`[JobService] pg-boss started successfully in schema "${this.config.schema}".`);

    for (const [queueName, { handler, options }] of this.registeredWorkers.entries()) {
      this.boundQueues.add(queueName);
      await this.ensureQueue(queueName);
      await this.bindWorker(queueName, handler, options);
    }
  }

  public async stop(options?: { graceful?: boolean; timeout?: number }): Promise<void> {
    if (!this.isRunning || !this.boss) {
      return;
    }

    const timeout = options?.timeout ?? 5000;
    const graceful = options?.graceful ?? true;

    try {
      await this.boss.stop({ graceful, timeout });
      console.log('[JobService] pg-boss stopped cleanly.');
    } catch (error) {
      console.error('[JobService] Error stopping pg-boss:', error);
    } finally {
      this.boundQueues.clear();
      this.createdQueues.clear();
      this.isRunning = false;
      this.boss = null;
    }
  }

  private async ensureQueue(queueName: string, policy: PgBoss.QueuePolicy = 'standard'): Promise<void> {
    if (!this.boss || this.createdQueues.has(queueName)) {
      return;
    }
    try {
      await this.boss.createQueue(queueName, { name: queueName, policy });
    } catch {
      // queue may already exist in database
    }
    this.createdQueues.add(queueName);
  }

  public getBossInstance(): PgBoss | null {
    return this.boss;
  }

  private async bindWorker<TData, TResult>(
    queueName: string,
    handler: JobHandler<TData, TResult>,
    options?: WorkerOptions
  ): Promise<void> {
    if (!this.boss) return;

    const workOptions: PgBoss.WorkOptions = {
      batchSize: options?.batchSize ?? 1,
      pollingIntervalSeconds: options?.pollingIntervalSeconds ?? 2,
    };

    await this.boss.work(queueName, workOptions, async (jobs: PgBoss.Job<TData>[]) => {
      for (const job of jobs) {
        const context: JobContext = {
          jobId: job.id,
          queueName,
        };
        await handler(job.data, context);
      }
    });
  }
}

export const jobService = new JobService();
