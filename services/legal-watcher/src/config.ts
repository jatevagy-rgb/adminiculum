/**
 * Environment + CLI configuration. All defaults are safe (fail-closed) and all
 * HTTP knobs are bounded.
 */
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
}

export interface CliArgs {
  manifestPath?: string;
  stateDir?: string;
  reportOut?: string;
  help: boolean;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      out.help = true;
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

export function resolveConfig(args: CliArgs): WatcherConfig {
  const manifestPath =
    args.manifestPath ?? process.env.LEGAL_WATCHER_MANIFEST ?? '';
  if (!manifestPath) {
    throw new ConfigError(
      'missing --manifest <path> (or LEGAL_WATCHER_MANIFEST environment variable)',
    );
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
  };
}
