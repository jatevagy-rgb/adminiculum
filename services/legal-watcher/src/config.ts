/**
 * Environment + CLI configuration.
 *
 * All defaults are safe (fail-closed): the watcher runs in DRY_RUN mode
 * unless delivery is explicitly enabled with `--deliver` or
 * `LEGAL_WATCHER_DELIVERY_MODE=DELIVER`. DELIVER mode additionally requires an
 * explicit backend endpoint and app-only token configuration; otherwise
 * configuration fails before any observation or network work. All HTTP knobs
 * are bounded.
 */
import type { AppOnlyTokenConfig } from './tokenProvider';
import type { DeliveryMode } from './types';

export const DEFAULT_EURLEX_ENDPOINT = 'https://publications.europa.eu/webapi/rdf/sparql';

export interface WatcherConfig {
  manifestPath: string;
  stateDir: string;
  reportOutPath: string | null;
  eurlexEndpoint: string;
  httpTimeoutMs: number;
  /** Additional attempts AFTER the first attempt (hard maximum 2). */
  httpRetries: number;
  httpBackoffMs: number;
  httpBackoffFactor: number;
  responseMaxBytes: number;
  concurrency: number;
  /** Explicit optional W2 delivery mode. Absent means DRY_RUN. */
  deliveryMode?: DeliveryMode;
  /** Backend base URL for W2 delivery; required in DELIVER mode. */
  backendEndpoint?: string | null;
  /** Observations per W2 request (1..200). */
  deliveryBatchSize?: number;
  /** App-only token configuration; required in DELIVER mode. */
  tokenConfig?: AppOnlyTokenConfig | null;
}

export interface CliArgs {
  manifestPath?: string;
  stateDir?: string;
  reportOut?: string;
  deliver: boolean;
  help: boolean;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { deliver: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      out.help = true;
      continue;
    }
    if (arg === '--deliver') {
      out.deliver = true;
      continue;
    }
    if (arg === '--manifest' || arg === '--state-dir' || arg === '--report-out') {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new ConfigError(`${arg} requires a value`);
      }
      if (arg === '--manifest') out.manifestPath = next;
      if (arg === '--state-dir') out.stateDir = next;
      if (arg === '--report-out') out.reportOut = next;
      i++;
      continue;
    }
    throw new ConfigError(`unknown argument: ${arg}`);
  }
  return out;
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new ConfigError(`invalid ${name}: ${raw} (expected ${min}..${max})`);
  }
  return value;
}

export function parseDeliveryMode(raw: string): DeliveryMode {
  const normalized = raw.trim().toUpperCase();
  if (normalized === 'DRY_RUN') return 'DRY_RUN';
  if (normalized === 'DELIVER') return 'DELIVER';
  throw new ConfigError(
    `invalid LEGAL_WATCHER_DELIVERY_MODE: ${raw} (expected DRY_RUN or DELIVER)`,
  );
}

function resolveBackendEndpoint(): string | null {
  const raw = (process.env.LEGAL_WATCHER_BACKEND_ENDPOINT ?? '').trim();
  if (raw === '') return null;
  const normalized = raw.replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s]+$/.test(normalized)) {
    throw new ConfigError(
      `invalid LEGAL_WATCHER_BACKEND_ENDPOINT: ${raw} (expected an http(s) URL)`,
    );
  }
  return normalized;
}

function resolveTokenConfig(): AppOnlyTokenConfig {
  const tenantId = (process.env.LEGAL_WATCHER_AZURE_TENANT_ID ?? '').trim();
  const clientId = (process.env.LEGAL_WATCHER_AZURE_CLIENT_ID ?? '').trim();
  const clientSecret = process.env.LEGAL_WATCHER_AZURE_CLIENT_SECRET ?? '';
  const scope = (process.env.LEGAL_WATCHER_AZURE_SCOPE ?? '').trim();
  if (tenantId === '' || clientId === '' || clientSecret === '' || scope === '') {
    throw new ConfigError(
      'DELIVER mode requires LEGAL_WATCHER_AZURE_TENANT_ID, LEGAL_WATCHER_AZURE_CLIENT_ID, ' +
        'LEGAL_WATCHER_AZURE_CLIENT_SECRET and LEGAL_WATCHER_AZURE_SCOPE',
    );
  }
  const authorityHost = (process.env.LEGAL_WATCHER_AZURE_AUTHORITY_HOST ?? '').trim();
  return {
    tenantId,
    clientId,
    clientSecret,
    scope,
    ...(authorityHost === '' ? {} : { authorityHost }),
  };
}

export function resolveConfig(args: CliArgs): WatcherConfig {
  const manifestPath =
    args.manifestPath ?? process.env.LEGAL_WATCHER_MANIFEST ?? '';
  if (!manifestPath) {
    throw new ConfigError(
      'missing --manifest <path> (or LEGAL_WATCHER_MANIFEST environment variable)',
    );
  }
  const deliveryMode: DeliveryMode = args.deliver
    ? 'DELIVER'
    : parseDeliveryMode(process.env.LEGAL_WATCHER_DELIVERY_MODE ?? 'DRY_RUN');
  const backendEndpoint = resolveBackendEndpoint();
  let tokenConfig: AppOnlyTokenConfig | null = null;
  if (deliveryMode === 'DELIVER') {
    if (backendEndpoint === null) {
      throw new ConfigError('DELIVER mode requires LEGAL_WATCHER_BACKEND_ENDPOINT');
    }
    tokenConfig = resolveTokenConfig();
  }
  return {
    manifestPath,
    stateDir: args.stateDir ?? process.env.LEGAL_WATCHER_STATE_DIR ?? 'state',
    reportOutPath:
      args.reportOut ?? process.env.LEGAL_WATCHER_REPORT_OUT ?? null,
    eurlexEndpoint:
      process.env.LEGAL_WATCHER_EURLEX_ENDPOINT ?? DEFAULT_EURLEX_ENDPOINT,
    httpTimeoutMs: envInt('LEGAL_WATCHER_HTTP_TIMEOUT_MS', 30000, 100, 30000),
    httpRetries: envInt('LEGAL_WATCHER_HTTP_RETRIES', 2, 0, 2),
    httpBackoffMs: envInt('LEGAL_WATCHER_HTTP_BACKOFF_MS', 500, 0, 5000),
    httpBackoffFactor: envInt('LEGAL_WATCHER_HTTP_BACKOFF_FACTOR', 2, 1, 5),
    responseMaxBytes: envInt(
      'LEGAL_WATCHER_RESPONSE_MAX_BYTES',
      5 * 1024 * 1024,
      1024,
      64 * 1024 * 1024,
    ),
    concurrency: envInt('LEGAL_WATCHER_CONCURRENCY', 2, 1, 8),
    deliveryMode,
    backendEndpoint,
    deliveryBatchSize: envInt('LEGAL_WATCHER_DELIVERY_BATCH_SIZE', 50, 1, 200),
    tokenConfig,
  };
}
