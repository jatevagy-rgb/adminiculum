/**
 * Job Service Configuration
 *
 * Resolves job subsystem settings from environment variables with safe defaults.
 */

import { JobServiceConfig } from './types';

export function getJobServiceConfig(): JobServiceConfig {
  const enabled = process.env.BACKGROUND_JOBS_ENABLED === 'true';
  const connectionString = process.env.PG_BOSS_DATABASE_URL || process.env.DATABASE_URL || '';
  const schema = process.env.PG_BOSS_SCHEMA || 'pgboss';
  const maxConnections = Number(process.env.PG_BOSS_MAX_CONNECTIONS) || 5;

  return {
    enabled,
    connectionString,
    schema,
    maxConnections,
    defaultRetryLimit: Number(process.env.PG_BOSS_DEFAULT_RETRY_LIMIT) || 3,
    defaultRetryDelay: Number(process.env.PG_BOSS_DEFAULT_RETRY_DELAY) || 10,
    defaultRetryBackoff: process.env.PG_BOSS_DEFAULT_RETRY_BACKOFF !== 'false',
    defaultExpireInSeconds: Number(process.env.PG_BOSS_DEFAULT_EXPIRE_SECONDS) || 300,
    defaultRetentionSeconds: Number(process.env.PG_BOSS_DEFAULT_RETENTION_SECONDS) || 86400,
  };
}
