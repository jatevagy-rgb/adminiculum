/**
 * Optional W2 backend delivery (explicit opt-in; default remains DRY-RUN).
 *
 * Maps W1 observation events to the locked W2 contract:
 *   POST <backend>/api/v1/compliance-intelligence/legal-source-observations
 *   Authorization: Bearer <app-only token>
 *   { "schemaVersion": 1, "observations": [ ... ] }
 *
 * State separation: source-seen state (`state.json`) and delivery bookkeeping
 * (`delivery.json`) are distinct files with distinct semantics. A failed
 * delivery never un-sees the source event, and a delivered event is never
 * re-posted. Failed deliveries stay pending and are retried on later runs.
 *
 * Bounded HTTP: same timeout/retry/backoff policy as W1. Retries (bounded,
 * hard maximum 2 extra attempts) are used ONLY for 429, 5xx, network errors
 * and timeouts; 400/401/403 are single-attempt and fail closed. No infinite
 * retry, and after a batch-level transport failure the remaining batches are
 * left pending for the next run instead of being hammered.
 *
 * Tokens are never persisted, never logged and never embedded in reports or
 * state; only the Authorization request header carries the token.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { StateError } from './capture';
import {
  boundedHttpPost,
  HttpError,
  type BoundedHttpOptions,
  type HttpStreamResponse,
} from './http';
import { truncate, type Logger } from './logging';
import { TokenProviderError, type AccessTokenProvider } from './tokenProvider';
import {
  DELIVERY_STATE_SCHEMA_VERSION,
  W2_ENDPOINT_PATH,
  W2_IDENTIFIER_FAMILY,
  W2_SCHEMA_VERSION,
  W2_SOURCE,
  type CelexRunResult,
  type DeliveryBatchSummary,
  type DeliveryObservationSummary,
  type DeliveryReport,
  type DeliveryState,
  type ObservationEvent,
  type W2BatchResponse,
  type W2Envelope,
  type W2Observation,
  type W2ResultEntry,
} from './types';

/**
 * Header-explicit POST boundary used by the W2 delivery client. Production
 * wiring uses `nodeFetchWithHeaders`; tests inject a fake.
 */
export type DeliveryPostFn = (
  url: string,
  body: string,
  headers: Record<string, string>,
  signal: AbortSignal,
) => Promise<HttpStreamResponse>;

/** Full ISO-8601 timestamp WITH timezone (contract: optional ISO timestamp). */
const FULL_ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * W1 date metadata is an xsd:date (e.g. "2016-05-04"), not a timezone
 * timestamp. The W2 `effectiveFrom` field is OPTIONAL and documented as an
 * ISO timestamp with timezone, so a date-only value is never upgraded into an
 * invented midnight timestamp: it is omitted.
 */
export function selectEffectiveFrom(event: ObservationEvent): string | undefined {
  const raw =
    event.eventKind === 'AMENDMENT_PUBLISHED' ? event.publicationDate : event.effectiveDate;
  if (raw === undefined || !FULL_ISO_TIMESTAMP.test(raw)) return undefined;
  return raw;
}

/**
 * Exact W2 payload mapping. Existing W1 evidence is used verbatim:
 * idempotencyKey = the deterministic W1 event key,
 * evidence.sha256 = the captured W1 payload hash,
 * evidence.sourceUri/capturedAt/queryProvenance = W1 capture metadata.
 */
export function mapEventToW2Observation(event: ObservationEvent): W2Observation {
  const effectiveFrom = selectEffectiveFrom(event);
  return {
    idempotencyKey: event.eventKey,
    kind: event.eventKind,
    source: W2_SOURCE,
    identifierFamily: W2_IDENTIFIER_FAMILY,
    sourceIdentifier: event.sourceIdentifier,
    relatedIdentifier: event.relatedIdentifier,
    ...(effectiveFrom === undefined ? {} : { effectiveFrom }),
    evidence: {
      sourceUri: event.sourceUri,
      sha256: event.payloadHash,
      capturedAt: event.capturedAt,
      queryProvenance: event.queryProvenance,
    },
    warnings: [],
  };
}

export function buildW2Envelope(observations: W2Observation[]): W2Envelope {
  return { schemaVersion: W2_SCHEMA_VERSION, observations };
}

/**
 * Delivery candidates for a run:
 *  - events that are NEW since the durable source baseline (W1 detected a
 *    legal event), plus
 *  - previously attempted events still pending delivery that are observed
 *    again (retry), never events already delivered.
 * FIRST_SEEN_BASELINE history is never delivered: historical relationships
 * are not newly detected legal events, and W1 semantics are preserved.
 */
export function selectDeliveryCandidates(
  results: CelexRunResult[],
  state: DeliveryState,
): ObservationEvent[] {
  const candidates = new Map<string, ObservationEvent>();
  for (const result of results) {
    if (result.status === 'SOURCE_ERROR') continue;
    const newKeys = new Set(result.newEvents.map((event) => event.eventKey));
    for (const event of result.observedEvents) {
      if (state.delivered[event.eventKey] !== undefined) continue;
      if (newKeys.has(event.eventKey) || state.pending[event.eventKey] !== undefined) {
        candidates.set(event.eventKey, event);
      }
    }
  }
  return Array.from(candidates.values()).sort((a, b) =>
    a.eventKey < b.eventKey ? -1 : a.eventKey > b.eventKey ? 1 : 0,
  );
}

export interface DeliveryStateStore {
  load(): DeliveryState;
  save(state: DeliveryState): void;
}

export function emptyDeliveryState(): DeliveryState {
  return { schemaVersion: DELIVERY_STATE_SCHEMA_VERSION, delivered: {}, pending: {} };
}

function isDeliveryState(raw: unknown): raw is DeliveryState {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const obj = raw as Record<string, unknown>;
  return (
    obj.schemaVersion === DELIVERY_STATE_SCHEMA_VERSION &&
    obj.delivered !== null &&
    typeof obj.delivered === 'object' &&
    !Array.isArray(obj.delivered) &&
    obj.pending !== null &&
    typeof obj.pending === 'object' &&
    !Array.isArray(obj.pending)
  );
}

/**
 * Watcher-owned delivery bookkeeping (`<state-dir>/delivery.json`), separate
 * from the source-seen baseline (`state.json`). Atomic temp+fsync+rename:
 * a failed write never replaces a valid delivery state.
 */
export function createFileDeliveryStateStore(stateDir: string): DeliveryStateStore {
  const filePath = path.join(stateDir, 'delivery.json');
  const tmpPath = path.join(stateDir, 'delivery.json.tmp');

  function load(): DeliveryState {
    let text: string;
    try {
      text = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyDeliveryState();
      throw new StateError(`cannot read delivery state file: ${filePath}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new StateError(`delivery state file is not valid JSON: ${filePath}`);
    }
    if (!isDeliveryState(parsed)) {
      throw new StateError(`delivery state file has unsupported shape: ${filePath}`);
    }
    return parsed;
  }

  function save(state: DeliveryState): void {
    try {
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      const fd = fs.openSync(tmpPath, 'r+');
      try {
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tmpPath, filePath);
    } catch (err) {
      throw new StateError(
        `delivery state write failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { load, save };
}

export interface DeliveryRunOptions {
  /** Backend base URL; the fixed W2 endpoint path is appended. */
  endpoint: string;
  tokenProvider: AccessTokenProvider;
  post: DeliveryPostFn;
  http: BoundedHttpOptions;
  batchSize: number;
  now: () => Date;
  logger: Logger;
  runId: string;
}

export interface DeliveryOutcome {
  report: DeliveryReport;
  /** Next delivery state (only persisted by the caller when stateChanged). */
  state: DeliveryState;
  stateChanged: boolean;
}

export function isDeliveryRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

interface DeliveryErrorInfo {
  code: string;
  message: string;
  statusCode: number | null;
}

function classifyDeliveryError(err: unknown): DeliveryErrorInfo {
  if (err instanceof HttpError) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return { code: 'AUTH_ERROR', message: truncate(err.message, 240), statusCode: err.statusCode };
    }
    if (err.statusCode === 400) {
      return {
        code: 'MALFORMED_ENVELOPE',
        message: truncate(err.message, 240),
        statusCode: 400,
      };
    }
    return {
      code: err.code,
      message: truncate(err.message, 240),
      statusCode: err.statusCode ?? null,
    };
  }
  return {
    code: 'DELIVERY_ERROR',
    message: truncate(err instanceof Error ? err.message : String(err), 240),
    statusCode: null,
  };
}

const W2_STATUSES = new Set(['ACCEPTED', 'DUPLICATE', 'REJECTED']);

/** Strict response validation; any deviation is a failed batch (fail closed). */
function parseW2BatchResponse(text: string): W2BatchResponse | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.schemaVersion !== W2_SCHEMA_VERSION) return null;
  if (!Array.isArray(obj.results)) return null;
  const results: W2ResultEntry[] = [];
  for (const entry of obj.results) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const record = entry as Record<string, unknown>;
    const key = record.idempotencyKey;
    if (key !== null && typeof key !== 'string') return null;
    if (typeof record.status !== 'string' || !W2_STATUSES.has(record.status)) return null;
    const reason = record.reason;
    if (reason !== null && typeof reason !== 'string') return null;
    const warnings = record.warnings;
    if (!Array.isArray(warnings) || warnings.some((warning) => typeof warning !== 'string')) {
      return null;
    }
    results.push({
      idempotencyKey: key,
      status: record.status as W2ResultEntry['status'],
      reason,
      warnings: warnings as string[],
    });
  }
  return { schemaVersion: W2_SCHEMA_VERSION, results };
}

/**
 * One bounded delivery run over the supplied candidates. Never throws for
 * delivery failures: every failure is recorded in the report, the affected
 * events stay pending, and the caller decides whether to persist the state.
 */
export async function deliverObservations(
  options: DeliveryRunOptions,
  candidates: ObservationEvent[],
  state: DeliveryState,
): Promise<DeliveryOutcome> {
  const next: DeliveryState = {
    schemaVersion: state.schemaVersion,
    delivered: { ...state.delivered },
    pending: { ...state.pending },
  };
  const attempted: ObservationEvent[] = [];
  let alreadyDeliveredCount = 0;
  for (const event of candidates) {
    if (next.delivered[event.eventKey] !== undefined) alreadyDeliveredCount++;
    else attempted.push(event);
  }

  const results: DeliveryObservationSummary[] = [];
  const batches: DeliveryBatchSummary[] = [];
  let acceptedCount = 0;
  let duplicateCount = 0;
  let rejectedCount = 0;
  let errorCount = 0;

  const markPending = (
    event: ObservationEvent,
    lastStatus: string,
    lastReason: string | null,
  ): void => {
    const at = options.now().toISOString();
    const existing = next.pending[event.eventKey];
    next.pending[event.eventKey] = {
      firstAttemptAt: existing?.firstAttemptAt ?? at,
      lastAttemptAt: at,
      attempts: (existing?.attempts ?? 0) + 1,
      lastStatus,
      lastReason: lastReason === null ? null : truncate(lastReason, 240),
    };
  };

  const markDelivered = (
    event: ObservationEvent,
    backendStatus: 'ACCEPTED' | 'DUPLICATE',
  ): void => {
    next.delivered[event.eventKey] = {
      deliveredAt: options.now().toISOString(),
      backendStatus,
    };
    delete next.pending[event.eventKey];
  };

  const pushResult = (
    event: ObservationEvent,
    status: DeliveryObservationSummary['status'],
    reason: string | null,
    warnings: string[],
  ): void => {
    results.push({
      idempotencyKey: event.eventKey,
      sourceIdentifier: event.sourceIdentifier,
      kind: event.eventKind,
      status,
      reason: reason === null ? null : truncate(reason, 240),
      warnings,
    });
  };

  const markBatchFailure = (
    batchIndex: number,
    batch: ObservationEvent[],
    errorCode: string,
    errorMessage: string,
    httpStatus: number | null,
  ): void => {
    batches.push({
      batchIndex,
      observationCount: batch.length,
      httpStatus,
      errorCode,
      errorMessage,
    });
    options.logger.warn('LW_DELIVERY_BATCH_FAILED', 'delivery batch failed', {
      runId: options.runId,
      batchIndex,
      observations: batch.length,
      code: errorCode,
      httpStatus,
    });
    for (const event of batch) {
      markPending(event, errorCode, errorMessage);
      pushResult(event, 'ERROR', `${errorCode}: ${errorMessage}`, []);
      errorCount++;
    }
  };

  const buildOutcome = (stateChanged: boolean): DeliveryOutcome => ({
    report: {
      endpoint: `${options.endpoint.replace(/\/+$/, '')}${W2_ENDPOINT_PATH}`,
      candidateCount: candidates.length,
      attemptedCount: attempted.length,
      alreadyDeliveredCount,
      deliveredCount: acceptedCount + duplicateCount,
      acceptedCount,
      duplicateCount,
      rejectedCount,
      errorCount,
      pendingCount: Object.keys(next.pending).length,
      batches,
      results,
    },
    state: next,
    stateChanged,
  });

  if (attempted.length === 0) {
    return buildOutcome(false);
  }

  const endpoint = options.endpoint.replace(/\/+$/, '');
  if (endpoint === '') {
    markBatchFailure(
      0,
      attempted,
      'DELIVERY_CONFIG_ERROR',
      'backend endpoint is not configured',
      null,
    );
    return buildOutcome(true);
  }

  let token: string;
  try {
    token = await options.tokenProvider.getAccessToken();
  } catch (err) {
    const code = err instanceof TokenProviderError ? err.code : 'TOKEN_ERROR';
    const message = truncate(err instanceof Error ? err.message : String(err), 240);
    options.logger.error('LW_DELIVERY_TOKEN_ERROR', 'app-only token could not be acquired', {
      runId: options.runId,
      code,
    });
    markBatchFailure(0, attempted, code, message, null);
    return buildOutcome(true);
  }
  if (typeof token !== 'string' || token === '') {
    markBatchFailure(0, attempted, 'TOKEN_ERROR', 'token provider returned an empty token', null);
    return buildOutcome(true);
  }

  const url = `${endpoint}${W2_ENDPOINT_PATH}`;
  const httpOptions: BoundedHttpOptions = {
    ...options.http,
    retryableStatus: isDeliveryRetryableStatus,
  };
  const batchSize = Math.max(1, Math.floor(options.batchSize));
  const batchCount = Math.ceil(attempted.length / batchSize);

  let aborted = false;
  let abortCode: string | null = null;
  let abortMessage: string | null = null;

  for (let index = 0; index < batchCount; index++) {
    const batch = attempted.slice(index * batchSize, (index + 1) * batchSize);
    if (aborted) {
      markBatchFailure(
        index,
        batch,
        abortCode ?? 'DELIVERY_ABORTED',
        abortMessage ?? 'skipped after an earlier batch failure; retried on the next run',
        null,
      );
      continue;
    }

    const body = JSON.stringify(buildW2Envelope(batch.map(mapEventToW2Observation)));
    const post = (requestUrl: string, requestBody: string, signal: AbortSignal) =>
      options.post(
        requestUrl,
        requestBody,
        {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        signal,
      );

    let response: { status: number; text: string };
    try {
      response = await boundedHttpPost(httpOptions, post, url, body);
    } catch (err) {
      const info = classifyDeliveryError(err);
      markBatchFailure(index, batch, info.code, info.message, info.statusCode);
      aborted = true;
      abortCode = info.code;
      abortMessage = info.message;
      continue;
    }

    if (response.status !== 200) {
      const message = `expected HTTP 200, received HTTP ${response.status}`;
      markBatchFailure(index, batch, 'UNEXPECTED_STATUS', message, response.status);
      aborted = true;
      abortCode = 'UNEXPECTED_STATUS';
      abortMessage = message;
      continue;
    }

    const parsed = parseW2BatchResponse(response.text);
    if (parsed === null) {
      const message = 'backend response is outside the W2 contract';
      markBatchFailure(index, batch, 'MALFORMED_RESPONSE', message, 200);
      aborted = true;
      abortCode = 'MALFORMED_RESPONSE';
      abortMessage = message;
      continue;
    }

    const byKey = new Map<string, W2ResultEntry>();
    for (const entry of parsed.results) {
      if (entry.idempotencyKey !== null) byKey.set(entry.idempotencyKey, entry);
    }
    let batchAccepted = 0;
    let batchDuplicate = 0;
    let batchRejected = 0;
    let batchError = 0;
    for (let offset = 0; offset < batch.length; offset++) {
      const event = batch[offset];
      const entry =
        byKey.get(event.eventKey) ??
        (parsed.results.length === batch.length &&
        parsed.results[offset].idempotencyKey === null
          ? parsed.results[offset]
          : undefined);
      if (entry === undefined) {
        batchError++;
        errorCount++;
        const message = 'backend response contained no result for this idempotencyKey';
        markPending(event, 'MISSING_RESULT', message);
        pushResult(event, 'ERROR', `MISSING_RESULT: ${message}`, []);
        continue;
      }
      if (entry.status === 'ACCEPTED') {
        batchAccepted++;
        acceptedCount++;
        markDelivered(event, 'ACCEPTED');
        pushResult(event, 'ACCEPTED', entry.reason, entry.warnings);
      } else if (entry.status === 'DUPLICATE') {
        batchDuplicate++;
        duplicateCount++;
        markDelivered(event, 'DUPLICATE');
        pushResult(event, 'DUPLICATE', entry.reason, entry.warnings);
      } else {
        batchRejected++;
        rejectedCount++;
        markPending(event, 'REJECTED', entry.reason);
        pushResult(event, 'REJECTED', entry.reason, entry.warnings);
      }
    }
    batches.push({
      batchIndex: index,
      observationCount: batch.length,
      httpStatus: 200,
      errorCode: batchError > 0 ? 'PARTIAL_RESULTS' : null,
      errorMessage:
        batchError > 0 ? 'some observations had no matching result entry' : null,
    });
    options.logger.info('LW_DELIVERY_BATCH', 'delivery batch processed', {
      runId: options.runId,
      batchIndex: index,
      observations: batch.length,
      accepted: batchAccepted,
      duplicate: batchDuplicate,
      rejected: batchRejected,
      error: batchError,
    });
  }

  return buildOutcome(true);
}
