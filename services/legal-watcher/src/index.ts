/**
 * W1 CLI entry point + run orchestrator. W2 delivery is explicit opt-in.
 *
 * Pipeline: manifest snapshot -> distinct CELEX -> official CELLAR SPARQL ->
 * act-level amendment/consolidation observations -> deterministic diff against
 * watcher-owned durable local baseline -> dry-run report. In explicit DELIVER
 * mode additionally: W2 mapping -> app-only token -> batched observation POST
 * -> bounded result interpretation -> SEPARATE delivery bookkeeping.
 *
 * Per-CELEX isolation: a failed identifier retains its previous state and
 * reports SOURCE_ERROR; other identifiers may still commit their own
 * successful state. A failed state write never advances the baseline.
 *
 * State separation: if a source event was observed successfully but backend
 * delivery failed, the source baseline still advances (the event is not NEW
 * again) while the delivery stays pending for a later run. If delivery
 * bookkeeping could not be persisted, the source baseline is NOT advanced so
 * the event remains eligible for delivery on the next run.
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CellarAdapter, SourceError, type EurlexAdapter } from './adapters/eurlex';
import { createFileStateStore, StateError, type StateStore } from './capture';
import { ConfigError, parseArgs, resolveConfig, type WatcherConfig } from './config';
import {
  createFileDeliveryStateStore,
  deliverObservations,
  selectDeliveryCandidates,
  type DeliveryPostFn,
  type DeliveryStateStore,
} from './delivery';
import { diffCelex, mergeEventsForState } from './diff';
import {
  HttpError,
  nodeFetchPost,
  nodeFetchWithHeaders,
  type BoundedHttpOptions,
} from './http';
import { extractCelexDemand, loadManifestFile, ManifestError } from './manifest';
import { createJsonLogger, truncate, type Logger } from './logging';
import { buildReport, renderHumanSummary } from './report';
import { createTokenProviderFromConfig, type AccessTokenProvider } from './tokenProvider';
import {
  STATE_SCHEMA_VERSION,
  type CelexRunResult,
  type DeliveryMode,
  type DeliveryReport,
  type DeliveryState,
  type DryRunReport,
  type ObservationEvent,
  type OverallStatus,
  type SanitizedError,
  type WatcherState,
} from './types';

export interface WatcherDeps {
  adapter: EurlexAdapter;
  store: StateStore;
  logger: Logger;
  now: () => Date;
  uuid: () => string;
  /** Optional W2 delivery boundaries (required in DELIVER mode). */
  deliveryStore?: DeliveryStateStore;
  tokenProvider?: AccessTokenProvider;
  deliveryPost?: DeliveryPostFn;
}

export interface WatcherOutcome {
  report: DryRunReport;
  exitCode: number;
}

export const HELP_TEXT = [
  'Usage: node dist/index.js --manifest <path> [--state-dir <dir>] [--report-out <path|->] [--deliver]',
  '',
  '  --manifest <path>   exported monitoring manifest snapshot (schema v1, JSON)',
  '  --state-dir <dir>   watcher-owned durable state directory (default: ./state)',
  '  --report-out <path> write the machine-readable JSON report to <path>',
  '                      ("-" prints the JSON report to stdout)',
  '  --deliver           explicitly enable W2 backend delivery (default: dry run)',
  '  --help              show this help',
  '',
  'Environment:',
  '  LEGAL_WATCHER_STATE_DIR, LEGAL_WATCHER_EURLEX_ENDPOINT,',
  '  LEGAL_WATCHER_HTTP_TIMEOUT_MS (<=30000), LEGAL_WATCHER_HTTP_RETRIES (<=2),',
  '  LEGAL_WATCHER_HTTP_BACKOFF_MS, LEGAL_WATCHER_HTTP_BACKOFF_FACTOR,',
  '  LEGAL_WATCHER_RESPONSE_MAX_BYTES, LEGAL_WATCHER_CONCURRENCY,',
  '  LEGAL_WATCHER_DELIVERY_MODE (DRY_RUN|DELIVER), LEGAL_WATCHER_DELIVERY_BATCH_SIZE,',
  '  LEGAL_WATCHER_BACKEND_ENDPOINT (DELIVER only),',
  '  LEGAL_WATCHER_AZURE_AUTH_MODE (CLIENT_SECRET|MANAGED_IDENTITY; default CLIENT_SECRET),',
  '  CLIENT_SECRET mode (default): LEGAL_WATCHER_AZURE_TENANT_ID, LEGAL_WATCHER_AZURE_CLIENT_ID,',
  '  LEGAL_WATCHER_AZURE_CLIENT_SECRET, LEGAL_WATCHER_AZURE_SCOPE,',
  '  LEGAL_WATCHER_AZURE_AUTHORITY_HOST (DELIVER only),',
  '  MANAGED_IDENTITY mode: LEGAL_WATCHER_AZURE_SCOPE (api://<backend-app-id>/.default) or',
  '  LEGAL_WATCHER_AZURE_RESOURCE (api://<backend-app-id>), plus the runtime-provided',
  '  IDENTITY_ENDPOINT and IDENTITY_HEADER (DELIVER only; no secret required)',
  '',
  'DEFAULT IS DRY RUN: zero Adminiculum backend writes, no token request. First',
  'successful observation of a CELEX establishes a FIRST_SEEN_BASELINE (historical',
  'relationships are never reported as new and are never delivered). Exit code:',
  '0 = OK, 1 = PARTIAL/FAILED, 2 = fatal configuration/manifest/state error.',
].join('\n');

function sanitizeSourceError(sourceIdentifier: string, err: unknown): SanitizedError {
  if (err instanceof SourceError) {
    return {
      sourceIdentifier,
      phase: err.phase,
      code: err.code,
      message: truncate(err.message, 240),
    };
  }
  if (err instanceof HttpError) {
    return {
      sourceIdentifier,
      phase: 'HTTP',
      code: err.code,
      message: truncate(err.message, 240),
      statusCode: err.statusCode,
    };
  }
  return {
    sourceIdentifier,
    phase: 'UNKNOWN',
    code: 'UNKNOWN',
    message: truncate(err instanceof Error ? err.message : String(err), 240),
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export function httpOptionsFromConfig(config: WatcherConfig): BoundedHttpOptions {
  return {
    timeoutMs: config.httpTimeoutMs,
    retries: config.httpRetries,
    backoffMs: config.httpBackoffMs,
    backoffFactor: config.httpBackoffFactor,
    maxBytes: config.responseMaxBytes,
    deadlineMs:
      config.httpTimeoutMs * (config.httpRetries + 1) +
      config.httpBackoffMs * (config.httpRetries + 2),
  };
}

export async function runWatcher(
  config: WatcherConfig,
  deps: WatcherDeps,
): Promise<WatcherOutcome> {
  const startedAt = deps.now();
  const runId = deps.uuid();
  const logger = deps.logger;
  const deliveryMode: DeliveryMode = config.deliveryMode ?? 'DRY_RUN';
  logger.info('LW_RUN_START', 'watcher run started', { runId, deliveryMode });

  let deliveryStore: DeliveryStateStore | null = null;
  let tokenProvider: AccessTokenProvider | null = null;
  let deliveryState: DeliveryState | null = null;
  if (deliveryMode === 'DELIVER') {
    deliveryStore = deps.deliveryStore ?? null;
    tokenProvider = deps.tokenProvider ?? null;
    if (deliveryStore === null) {
      throw new ConfigError('DELIVER mode requires a delivery state store');
    }
    if (tokenProvider === null) {
      throw new ConfigError('DELIVER mode requires an app-only token provider');
    }
    if (!config.backendEndpoint) {
      throw new ConfigError('DELIVER mode requires a backend endpoint');
    }
    deliveryState = deliveryStore.load();
  }

  const manifest = loadManifestFile(config.manifestPath);
  const demand = extractCelexDemand(manifest, (droppedPath) =>
    logger.warn('LW_PRIVACY_GUARD', 'dropped unexpected manifest field', { path: droppedPath }),
  );
  logger.info('LW_MANIFEST_LOADED', 'manifest snapshot loaded', {
    sources: manifest.sources.length,
    distinctCelex: demand.distinctCelex.length,
  });

  const state = deps.store.load();
  const sanitizedErrors: SanitizedError[] = [];

  const results = await mapWithConcurrency(demand.distinctCelex, config.concurrency, async (celex) => {
    logger.info('LW_CELEX_START', 'observing CELEX', { celex });
    try {
      const events = await deps.adapter.observe(celex);
      const result = diffCelex(celex, state.entries[celex], events);
      logger.info('LW_CELEX_DONE', 'CELEX observed', {
        celex,
        status: result.status,
        events: result.observedEvents.length,
      });
      return result;
    } catch (err) {
      const sanitized = sanitizeSourceError(celex, err);
      logger.error('LW_SOURCE_ERROR', sanitized.message, {
        celex,
        phase: sanitized.phase,
        code: sanitized.code,
      });
      sanitizedErrors.push(sanitized);
      return {
        sourceIdentifier: celex,
        status: 'SOURCE_ERROR' as const,
        observedEvents: [],
        baselineEvents: [],
        newEvents: [],
        metadataChangedKeys: [],
        missingFromSourceKeys: [],
        error: sanitized,
      };
    }
  });

  const celexResults: CelexRunResult[] = results
    .slice()
    .sort((a, b) => (a.sourceIdentifier < b.sourceIdentifier ? -1 : 1));
  const observations: ObservationEvent[] = [];
  for (const result of celexResults) {
    for (const event of result.observedEvents) observations.push(event);
  }

  // W2 delivery phase runs BEFORE the source baseline save so that a delivery
  // bookkeeping write failure can never strand a source-seen, undelivered
  // event (see the state-divergence guard below).
  let deliveryReport: DeliveryReport | null = null;
  let deliveryStateSaveFailed: string | null = null;
  if (
    deliveryMode === 'DELIVER' &&
    deliveryStore !== null &&
    tokenProvider !== null &&
    deliveryState !== null
  ) {
    const candidates = selectDeliveryCandidates(celexResults, deliveryState, state);
    logger.info('LW_DELIVERY_PLAN', 'delivery candidates selected', {
      runId,
      candidates: candidates.length,
    });
    const outcome = await deliverObservations(
      {
        endpoint: config.backendEndpoint ?? '',
        tokenProvider,
        post: deps.deliveryPost ?? nodeFetchWithHeaders,
        http: httpOptionsFromConfig(config),
        batchSize: config.deliveryBatchSize ?? 50,
        now: deps.now,
        logger,
        runId,
      },
      candidates,
      deliveryState,
    );
    deliveryReport = outcome.report;
    logger.info('LW_DELIVERY_DONE', 'delivery run finished', {
      runId,
      attempted: outcome.report.attemptedCount,
      delivered: outcome.report.deliveredCount,
      rejected: outcome.report.rejectedCount,
      error: outcome.report.errorCount,
    });
    if (outcome.stateChanged) {
      try {
        deliveryStore.save(outcome.state);
        logger.info('LW_DELIVERY_STATE_SAVED', 'delivery state saved', {
          runId,
          delivered: Object.keys(outcome.state.delivered).length,
          pending: outcome.report.pendingCount,
        });
      } catch (err) {
        deliveryStateSaveFailed = err instanceof Error ? err.message : String(err);
        logger.error('LW_DELIVERY_STATE_SAVE_FAILED', deliveryStateSaveFailed);
      }
    }
  }

  const successfulCount = celexResults.filter((r) => r.status !== 'SOURCE_ERROR').length;
  let stateSaveFailed: string | null = null;
  if (deliveryStateSaveFailed !== null) {
    logger.error(
      'LW_STATE_SAVE_BLOCKED',
      'source baseline NOT advanced because delivery bookkeeping could not be persisted',
    );
  } else if (successfulCount > 0) {
    const nextState: WatcherState = {
      schemaVersion: STATE_SCHEMA_VERSION,
      entries: { ...state.entries },
    };
    const completedIso = deps.now().toISOString();
    for (const result of celexResults) {
      const merged = mergeEventsForState(state.entries[result.sourceIdentifier], result, runId, completedIso);
      if (merged) nextState.entries[result.sourceIdentifier] = merged;
    }
    try {
      deps.store.save(nextState);
      logger.info('LW_STATE_SAVED', 'durable state saved', {
        entries: Object.keys(nextState.entries).length,
      });
    } catch (err) {
      stateSaveFailed = err instanceof Error ? err.message : String(err);
      logger.error('LW_STATE_SAVE_FAILED', stateSaveFailed);
    }
  } else {
    logger.info('LW_STATE_SKIPPED', 'no successful observations; durable state untouched');
  }

  const failedCount = celexResults.length - successfulCount;
  const deliveryFailed =
    deliveryReport !== null && deliveryReport.rejectedCount + deliveryReport.errorCount > 0;
  let overallStatus: OverallStatus;
  if (stateSaveFailed !== null || deliveryStateSaveFailed !== null) overallStatus = 'FAILED';
  else if (failedCount > 0 && successfulCount > 0) overallStatus = 'PARTIAL';
  else if (failedCount > 0) overallStatus = 'FAILED';
  else overallStatus = 'OK';
  if (overallStatus === 'OK' && deliveryFailed) overallStatus = 'PARTIAL';

  const completedAt = deps.now();
  const report = buildReport({
    manifestSchemaVersion: manifest.schemaVersion,
    manifestCounts: demand.counts,
    runId,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    overallStatus,
    celexResults,
    observations,
    sanitizedErrors,
    dryRun: deliveryMode === 'DRY_RUN',
    deliveryMode,
    delivery: deliveryReport,
    adminiculumBackendWrites: deliveryReport === null ? 0 : deliveryReport.acceptedCount,
  });
  logger.info('LW_RUN_END', 'watcher run finished', {
    runId,
    status: overallStatus,
    newAmendment: report.newAmendmentCount,
    newConsolidated: report.newConsolidatedVersionCount,
  });

  return { report, exitCode: overallStatus === 'OK' ? 0 : 1 };
}

export interface CliIo {
  stdout: { write(text: string): void };
  stderr: { write(text: string): void };
}

export async function main(argv: string[], io: CliIo): Promise<number> {
  const logger = createJsonLogger((line) => io.stderr.write(`${line}\n`));
  try {
    const args = parseArgs(argv);
    if (args.help) {
      io.stdout.write(`${HELP_TEXT}\n`);
      return 0;
    }
    const config = resolveConfig(args);
    const httpOptions = httpOptionsFromConfig(config);
    const deps: WatcherDeps = {
      adapter: new CellarAdapter({
        post: nodeFetchPost,
        http: httpOptions,
        endpoint: config.eurlexEndpoint,
      }),
      store: createFileStateStore(config.stateDir),
      logger,
      now: () => new Date(),
      uuid: () => randomUUID(),
    };
    if (config.deliveryMode === 'DELIVER') {
      if (!config.tokenConfig) {
        throw new ConfigError('DELIVER mode requires app-only token configuration');
      }
      deps.deliveryStore = createFileDeliveryStateStore(config.stateDir);
      deps.tokenProvider = createTokenProviderFromConfig(config.tokenConfig);
      deps.deliveryPost = nodeFetchWithHeaders;
    }
    const { report, exitCode } = await runWatcher(config, deps);
    io.stdout.write(`${renderHumanSummary(report)}\n`);
    if (config.reportOutPath !== null && config.reportOutPath !== '-') {
      try {
        const resolved = path.resolve(config.reportOutPath);
        fs.mkdirSync(path.dirname(resolved), { recursive: true });
        fs.writeFileSync(resolved, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      } catch (err) {
        logger.error('LW_REPORT_WRITE_FAILED', err instanceof Error ? err.message : String(err));
        return 1;
      }
    } else if (config.reportOutPath === '-') {
      io.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    }
    return exitCode;
  } catch (err) {
    if (err instanceof ConfigError || err instanceof ManifestError || err instanceof StateError) {
      logger.error('LW_FATAL', err.message);
      io.stderr.write(`${err.message}\n`);
      return 2;
    }
    logger.error('LW_FATAL', err instanceof Error ? err.message : String(err));
    io.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }
}

if (require.main === module) {
  void main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr }).then((code) => {
    process.exitCode = code;
  });
}
