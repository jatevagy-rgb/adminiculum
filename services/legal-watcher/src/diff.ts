/**
 * Deterministic act-level diff semantics.
 *
 *  - FIRST_SEEN_BASELINE: first successful observation of a CELEX; every
 *    discovered event is recorded as baseline and ZERO events are reported
 *    as new (historical relationships are not "newly detected changes").
 *  - UNCHANGED: same stable event keys, nothing new.
 *  - NEW_AMENDMENT / NEW_CONSOLIDATED_VERSION: new stable event keys.
 *  - SOURCE_ERROR: capture failure (see index.ts); previous state preserved.
 *
 * There is deliberately NO REMOVED legal event. Events absent from a later
 * response are never deleted, never emitted as legal change, and the previous
 * baseline is preserved; they are reported as missingFromSource diagnostics.
 * A metadata correction under the same event key reports METADATA_CHANGED and
 * is never classified as a newly published legal event.
 */
import type { CelexRunResult, CelexStateEntry, ObservationEvent } from './types';

export function sortEvents(events: ObservationEvent[]): ObservationEvent[] {
  return [...events].sort((a, b) => (a.eventKey < b.eventKey ? -1 : a.eventKey > b.eventKey ? 1 : 0));
}

export function diffCelex(
  sourceIdentifier: string,
  previous: CelexStateEntry | undefined,
  observed: ObservationEvent[],
): CelexRunResult {
  const sorted = sortEvents(observed);

  if (!previous) {
    return {
      sourceIdentifier,
      status: 'FIRST_SEEN_BASELINE',
      observedEvents: sorted,
      baselineEvents: sorted,
      newEvents: [],
      metadataChangedKeys: [],
      missingFromSourceKeys: [],
      error: null,
    };
  }

  const known = previous.events;
  const newEvents = sorted.filter((event) => !(event.eventKey in known));
  const metadataChangedKeys = sorted
    .filter((event) => event.eventKey in known && known[event.eventKey].payloadHash !== event.payloadHash)
    .map((event) => event.eventKey);
  const currentKeys = new Set(sorted.map((event) => event.eventKey));
  const missingFromSourceKeys = Object.keys(known)
    .filter((key) => !currentKeys.has(key))
    .sort();

  const newAmendments = newEvents.filter((e) => e.eventKind === 'AMENDMENT_PUBLISHED').length;
  const newConsolidations = newEvents.filter((e) => e.eventKind === 'CONSOLIDATED_VERSION_AVAILABLE').length;
  const status =
    newAmendments > 0
      ? 'NEW_AMENDMENT'
      : newConsolidations > 0
        ? 'NEW_CONSOLIDATED_VERSION'
        : 'UNCHANGED';

  return {
    sourceIdentifier,
    status,
    observedEvents: sorted,
    baselineEvents: [],
    newEvents,
    metadataChangedKeys,
    missingFromSourceKeys,
    error: null,
  };
}

/**
 * Merges the durable state entry after a successful run. Missing-from-source
 * events are PRESERVED (never deleted). Latest observation wins for a key so
 * a metadata correction updates the stored payload without creating an event.
 * Returns undefined for SOURCE_ERROR: the caller keeps the previous entry.
 */
export function mergeEventsForState(
  previous: CelexStateEntry | undefined,
  result: CelexRunResult,
  runId: string,
  at: string,
): CelexStateEntry | undefined {
  if (result.status === 'SOURCE_ERROR') return undefined;
  const events: Record<string, ObservationEvent> = { ...(previous?.events ?? {}) };
  for (const event of result.observedEvents) {
    events[event.eventKey] = event;
  }
  return {
    firstSeenAt: previous?.firstSeenAt ?? at,
    events,
    lastSuccessfulRunId: runId,
    lastSuccessfulAt: at,
  };
}
