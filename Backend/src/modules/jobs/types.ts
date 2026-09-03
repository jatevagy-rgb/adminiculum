/**
 * Job Foundation Types & Interfaces
 *
 * Provides a version-isolated abstraction over background job scheduling and execution.
 */

export interface JobOptions {
  /** Job priority (higher number = higher priority) */
  priority?: number;
  /** Number of retry attempts on failure */
  retryLimit?: number;
  /** Delay between retries in seconds */
  retryDelay?: number;
  /** Whether to apply exponential backoff on retry */
  retryBackoff?: boolean;
  /** Schedule execution for a future date/time or seconds */
  startAfter?: number | string | Date;
  /** Job expiration/timeout in seconds */
  expireInSeconds?: number;
  /** Completed/failed job retention in seconds */
  retentionSeconds?: number;
  /** Unique key ensuring only one job with this key exists in the queue */
  singletonKey?: string;
  /** Dead-letter queue name on permanent failure */
  deadLetter?: string;
}

export interface JobContext {
  jobId: string;
  queueName: string;
}

export type JobHandler<TData = any, TResult = any> = (
  data: TData,
  context: JobContext
) => Promise<TResult>;

export interface WorkerOptions {
  batchSize?: number;
  pollingIntervalSeconds?: number;
}

export interface JobServiceConfig {
  enabled: boolean;
  connectionString?: string;
  schema?: string;
  maxConnections?: number;
  defaultRetryLimit?: number;
  defaultRetryDelay?: number;
  defaultRetryBackoff?: boolean;
  defaultExpireInSeconds?: number;
  defaultRetentionSeconds?: number;
  clockMonitorIntervalSeconds?: number;
}
