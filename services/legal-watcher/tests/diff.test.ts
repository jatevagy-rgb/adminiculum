/**
 * T12-T18 — deterministic diff semantics.
 */
import { diffCelex, mergeEventsForState, sortEvents } from '../src/diff';
import { makeEvent } from './helpers';
import type { CelexStateEntry } from '../src/types';

function entry(events: ReturnType<typeof makeEvent>[], firstSeenAt = '2026-09-01T00:00:00.000Z'): CelexStateEntry {
  const map: CelexStateEntry['events'] = {};
  for (const event of events) map[event.eventKey] = event;
  return {
    firstSeenAt,
    events: map,
    lastSuccessfulRunId: 'r0',
    lastSuccessfulAt: firstSeenAt,
  };
}

const AMEND_A = () => makeEvent('32016R0679', 'AMENDMENT_PUBLISHED', '32003R1882');
const CONS_A = () => makeEvent('32016R0679', 'CONSOLIDATED_VERSION_AVAILABLE', '02016R0679-20160504');
const AMEND_B = () => makeEvent('32016R0679', 'AMENDMENT_PUBLISHED', '32025R0001');

describe('act-level diff', () => {
  test('T12 first run establishes FIRST_SEEN_BASELINE with zero NEW events', () => {
    const result = diffCelex('32016R0679', undefined, [AMEND_A(), CONS_A()]);
    expect(result.status).toBe('FIRST_SEEN_BASELINE');
    expect(result.newEvents).toEqual([]);
    expect(result.baselineEvents).toHaveLength(2);
  });

  test('T13 identical second run is UNCHANGED with zero NEW events', () => {
    const first = diffCelex('32016R0679', undefined, [AMEND_A(), CONS_A()]);
    const merged = mergeEventsForState(undefined, first, 'r1', '2026-09-27T12:00:00.000Z');
    const second = diffCelex('32016R0679', merged, [AMEND_A(), CONS_A()]);
    expect(second.status).toBe('UNCHANGED');
    expect(second.newEvents).toEqual([]);
  });

  test('T14 reordered response rows produce identical (zero NEW) results', () => {
    const first = diffCelex('32016R0679', undefined, [AMEND_A(), CONS_A()]);
    const merged = mergeEventsForState(undefined, first, 'r1', '2026-09-27T12:00:00.000Z');
    const second = diffCelex('32016R0679', merged, [CONS_A(), AMEND_A()]);
    expect(second.status).toBe('UNCHANGED');
    expect(second.newEvents).toEqual([]);
  });

  test('T15 newly appearing modifying CELEX yields exactly one NEW_AMENDMENT', () => {
    const first = diffCelex('32016R0679', undefined, [AMEND_A(), CONS_A()]);
    const merged = mergeEventsForState(undefined, first, 'r1', '2026-09-27T12:00:00.000Z');
    const second = diffCelex('32016R0679', merged, [AMEND_A(), CONS_A(), AMEND_B()]);
    expect(second.status).toBe('NEW_AMENDMENT');
    expect(second.newEvents).toHaveLength(1);
    expect(second.newEvents[0].eventKey).toBe(AMEND_B().eventKey);
  });

  test('T16 newly appearing consolidated CELEX yields exactly one NEW_CONSOLIDATED_VERSION', () => {
    const first = diffCelex('32016R0679', undefined, [AMEND_A()]);
    const merged = mergeEventsForState(undefined, first, 'r1', '2026-09-27T12:00:00.000Z');
    const second = diffCelex('32016R0679', merged, [AMEND_A(), CONS_A()]);
    expect(second.status).toBe('NEW_CONSOLIDATED_VERSION');
    expect(second.newEvents).toHaveLength(1);
    expect(second.newEvents[0].eventKind).toBe('CONSOLIDATED_VERSION_AVAILABLE');
  });

  test('T17 a repeated same new event is unchanged, not another NEW', () => {
    const first = diffCelex('32016R0679', undefined, [AMEND_A()]);
    const merged1 = mergeEventsForState(undefined, first, 'r1', '2026-09-27T12:00:00.000Z');
    const withNew = diffCelex('32016R0679', merged1, [AMEND_A(), CONS_A()]);
    expect(withNew.newEvents).toHaveLength(1);
    const merged2 = mergeEventsForState(merged1, withNew, 'r2', '2026-09-27T12:01:00.000Z');
    const again = diffCelex('32016R0679', merged2, [AMEND_A(), CONS_A()]);
    expect(again.status).toBe('UNCHANGED');
    expect(again.newEvents).toEqual([]);
  });

  test('T18 metadata correction under the same event key is not a new legal event', () => {
    const original = AMEND_A();
    const corrected = makeEvent('32016R0679', 'AMENDMENT_PUBLISHED', '32003R1882', {
      publicationDate: '2003-10-15',
    });
    expect(corrected.eventKey).toBe(original.eventKey);
    expect(corrected.payloadHash).not.toBe(original.payloadHash);
    const first = diffCelex('32016R0679', undefined, [original]);
    const merged = mergeEventsForState(undefined, first, 'r1', '2026-09-27T12:00:00.000Z');
    const second = diffCelex('32016R0679', merged, [corrected]);
    expect(second.status).toBe('UNCHANGED');
    expect(second.newEvents).toEqual([]);
    expect(second.metadataChangedKeys).toEqual([corrected.eventKey]);
  });

  test('events absent from a later response are preserved, never removed', () => {
    const first = diffCelex('32016R0679', undefined, [AMEND_A(), CONS_A()]);
    const merged = mergeEventsForState(undefined, first, 'r1', '2026-09-27T12:00:00.000Z');
    const second = diffCelex('32016R0679', merged, [AMEND_A()]);
    expect(second.status).toBe('UNCHANGED');
    expect(second.newEvents).toEqual([]);
    expect(second.missingFromSourceKeys).toEqual([CONS_A().eventKey]);
    const nextMerged = mergeEventsForState(merged, second, 'r2', '2026-09-27T12:01:00.000Z');
    expect(nextMerged).toBeDefined();
    expect(Object.keys(nextMerged!.events).sort()).toEqual(
      [AMEND_A().eventKey, CONS_A().eventKey].sort(),
    );
  });

  test('sortEvents is deterministic for arbitrary row order', () => {
    const events = [CONS_A(), AMEND_A(), AMEND_B()];
    const sorted = sortEvents(events);
    const keys = sorted.map((e) => e.eventKey);
    expect(keys).toEqual([...keys].sort());
  });

  test('SOURCE_ERROR never produces a merged state entry', () => {
    const result = {
      sourceIdentifier: '32016R0679',
      status: 'SOURCE_ERROR' as const,
      observedEvents: [],
      baselineEvents: [],
      newEvents: [],
      metadataChangedKeys: [],
      missingFromSourceKeys: [],
      error: { sourceIdentifier: '32016R0679', phase: 'RESOLVE', code: 'TIMEOUT', message: 'x' },
    };
    expect(mergeEventsForState(entry([AMEND_A()]), result, 'r9', 't')).toBeUndefined();
  });
});
