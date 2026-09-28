/**
 * Shared W1 watcher types.
 *
 * The watcher is INTERNAL-ONLY state: no client, case, document, requirement,
 * control or user identity exists in any of these shapes. The privacy boundary
 * is structural: these types cannot represent such fields.
 */

export const REPORT_SCHEMA_VERSION = 1;
export const STATE_SCHEMA_VERSION = 1;
export const SOURCE_NAME = 'EURLEX_CELLAR' as const;

export type EventKind = 'AMENDMENT_PUBLISHED' | 'CONSOLIDATED_VERSION_AVAILABLE';

export type CelexRunStatus =
  | 'FIRST_SEEN_BASELINE'
  | 'UNCHANGED'
  | 'NEW_AMENDMENT'
  | 'NEW_CONSOLIDATED_VERSION'
  | 'SOURCE_ERROR';

export type OverallStatus = 'OK' | 'PARTIAL' | 'FAILED';

/**
 * A single act-level observation event. Identity is deterministic: eventKey =
 * sha256(source|sourceIdentifier|eventKind|relatedIdentifier). payloadHash
 * additionally covers metadata (URI + optional dates) and powers the
 * METADATA_CHANGED diagnostic without ever creating a new legal event.
 */
export interface ObservationEvent {
  source: typeof SOURCE_NAME;
  /** Watched CELEX (canonical uppercase base form, e.g. 32016R0679). */
  sourceIdentifier: string;
  eventKind: EventKind;
  /** Deterministic SHA-256 hex key. */
  eventKey: string;
  /**
   * Related stable CELEX identifier:
   * - AMENDMENT_PUBLISHED: base CELEX of the amending act (e.g. 32003R1882)
   * - CONSOLIDATED_VERSION_AVAILABLE: dated consolidated CELEX
   *   (e.g. 02016R0679-20160504)
   */
  relatedIdentifier: string;
  /** Official CELLAR URI of the related work. */
  sourceUri: string;
  /** ISO-8601 capture timestamp of this observation run. */
  capturedAt: string;
  /** SHA-256 hex over identity + metadata (metadata-change diagnostic). */
  payloadHash: string;
  /** Which official query produced this event. */
  queryProvenance: string;
  /** Amending act document date (xsd:date), when officially available. */
  publicationDate?: string;
  /** Consolidated version date (xsd:date), when officially available. */
  effectiveDate?: string;
}

export interface SanitizedError {
  sourceIdentifier: string;
  phase: string;
  code: string;
  message: string;
  statusCode?: number;
}

export interface CelexRunResult {
  sourceIdentifier: string;
  status: CelexRunStatus;
  /** All events observed during this run (deterministically ordered). */
  observedEvents: ObservationEvent[];
  /** Events observed this run that are NEW since the durable baseline. */
  newEvents: ObservationEvent[];
  /** Events recorded as baseline (only populated on FIRST_SEEN_BASELINE). */
  baselineEvents: ObservationEvent[];
  /** Known event keys whose non-identity metadata changed. Diagnostic only. */
  metadataChangedKeys: string[];
  /** Known event keys absent from the current source response. Diagnostic only; never deleted. */
  missingFromSourceKeys: string[];
  error: SanitizedError | null;
}

export interface CelexStateEntry {
  firstSeenAt: string;
  events: Record<string, ObservationEvent>;
  lastSuccessfulRunId: string;
  lastSuccessfulAt: string;
}

export interface WatcherState {
  schemaVersion: typeof STATE_SCHEMA_VERSION;
  entries: Record<string, CelexStateEntry>;
}

export interface ManifestCounts {
  manifestSourceCount: number;
  celexReferenceCount: number;
  distinctCelexCount: number;
  nonCelexSkipped: number;
  invalidCelexCount: number;
  /** Names of unexpected identity-like fields dropped by the privacy guard. */
  droppedIdentityFields: string[];
}

export interface CelexRunSummary {
  sourceIdentifier: string;
  status: CelexRunStatus;
  newAmendmentCount: number;
  newConsolidatedVersionCount: number;
  metadataChangedKeys: string[];
  missingFromSourceKeys: string[];
}

export interface DryRunReport {
  reportVersion: number;
  manifestSchemaVersion: number;
  runId: string;
  startedAt: string;
  completedAt: string;
  dryRun: true;
  adminiculumBackendWrites: 0;
  overallStatus: OverallStatus;
  manifest: ManifestCounts;
  queriedCelexCount: number;
  successfulCelexCount: number;
  failedCelexCount: number;
  firstSeenBaselineCount: number;
  unchangedCount: number;
  newAmendmentCount: number;
  newConsolidatedVersionCount: number;
  sourceErrorCount: number;
  metadataChangedCount: number;
  missingFromSourceCount: number;
  sanitizedErrors: SanitizedError[];
  /** All events observed this run, deterministically ordered by eventKey. */
  observations: ObservationEvent[];
  celexResults: CelexRunSummary[];
}
