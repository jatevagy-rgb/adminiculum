/**
 * GROW — Observation → GrowSignal normalization unit tests (no database).
 *
 * The normalizer is the fail-closed boundary between canonical Observatory
 * storage and the Grow research engine. These tests lock:
 *  - DECLARED_SURVEY is the authoritative supported source;
 *  - the canonical survey category → problem domain mapping is exact;
 *  - unknown observation types, unknown categories, and malformed/foreign
 *    payloads produce NO signal (fail-closed, no GENERAL_FLOW guessing);
 *  - business-process and observation provenance survive normalization;
 *  - declared and measured provenance are never collapsed.
 */

import {
  DECLARED_SURVEY_OBSERVATION_TYPE,
  GROW_PAIN_INTAKE_KIND,
  SURVEY_CATEGORY_TO_DOMAIN,
  observationToGrowSignals,
  observationsToGrowSignals,
} from '../src/modules/company-growth/research/observationSignals';

const CANONICAL_CATEGORY_TO_DOMAIN: Record<string, string> = {
  MANUAL_ADMIN: 'MANUAL_ADMIN_LOAD',
  SLOW_APPROVAL: 'APPROVAL_DELAY',
  DUPLICATE_DATA: 'DUPLICATE_DATA_ENTRY',
  TOO_MANY_SYSTEMS: 'SYSTEM_SWITCHING',
  UNCLEAR_OWNERSHIP: 'UNCLEAR_OWNERSHIP',
  REWORK: 'REWORK',
  UNMEASURED_COST: 'UNMEASURED_COST',
  GENERAL_CONCERN: 'GENERAL_FLOW',
};

function validObservation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'obs-1',
    observationType: DECLARED_SURVEY_OBSERVATION_TYPE,
    observedAt: new Date('2026-09-01T10:00:00.000Z'),
    sourceRecordId: 'survey:key-1',
    rawPayload: {
      kind: GROW_PAIN_INTAKE_KIND,
      categories: ['SLOW_APPROVAL'],
      freeText: null,
      processId: null,
    },
    ...overrides,
  } as Parameters<typeof observationToGrowSignals>[0];
}

describe('observationToGrowSignals — canonical mapping', () => {
  it('DECLARED_SURVEY_VALID=PASS', () => {
    const signals = observationToGrowSignals(validObservation());
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      domainKey: 'APPROVAL_DELAY',
      observationId: 'obs-1',
      sourceKind: DECLARED_SURVEY_OBSERVATION_TYPE,
      declared: true,
      measured: false,
      businessProcessId: null,
    });
    expect(signals[0].observedAt.toISOString()).toBe('2026-09-01T10:00:00.000Z');
    expect(signals[0].provenance.categoryKey).toBe('SLOW_APPROVAL');
  });

  it('every canonical survey category maps to its expected domain', () => {
    for (const [category, domain] of Object.entries(CANONICAL_CATEGORY_TO_DOMAIN)) {
      const expectedMapValue = SURVEY_CATEGORY_TO_DOMAIN[category];
      expect(expectedMapValue).toBe(domain);

      const signals = observationToGrowSignals(
        validObservation({
          rawPayload: { kind: GROW_PAIN_INTAKE_KIND, categories: [category] },
        }),
      );
      expect(signals).toHaveLength(1);
      expect(signals[0].domainKey).toBe(domain);
    }
  });

  it('one observation with multiple categories yields one signal per category (observation id preserved)', () => {
    const signals = observationToGrowSignals(
      validObservation({
        rawPayload: { kind: GROW_PAIN_INTAKE_KIND, categories: ['SLOW_APPROVAL', 'REWORK', 'MANUAL_ADMIN'] },
      }),
    );
    expect(signals.map((s) => s.domainKey).sort()).toEqual(['APPROVAL_DELAY', 'MANUAL_ADMIN_LOAD', 'REWORK']);
    for (const signal of signals) {
      expect(signal.observationId).toBe('obs-1');
      expect(signal.declared).toBe(true);
      expect(signal.measured).toBe(false);
    }
  });
});

describe('observationToGrowSignals — fail-closed behavior', () => {
  it('UNKNOWN_OBSERVATION_TYPE_FAIL_CLOSED=PASS', () => {
    expect(observationToGrowSignals(validObservation({ observationType: 'VENDOR_RECORD' }))).toEqual([]);
    expect(observationToGrowSignals(validObservation({ observationType: 'FACT_RECORD' }))).toEqual([]);
    expect(observationToGrowSignals(validObservation({ observationType: 'SYSTEM_RECORD' }))).toEqual([]);
    expect(observationToGrowSignals(validObservation({ observationType: 'PROCESS_RECORD' }))).toEqual([]);
  });

  it('GENERIC_RECORD_FAIL_CLOSED=PASS', () => {
    expect(
      observationToGrowSignals(
        validObservation({
          observationType: 'GENERIC_RECORD',
          rawPayload: { categories: ['SLOW_APPROVAL'], kind: GROW_PAIN_INTAKE_KIND },
        }),
      ),
    ).toEqual([]);
  });

  it('UNKNOWN_CATEGORY_FAIL_CLOSED=PASS (no silent GENERAL_FLOW fallback)', () => {
    const signals = observationToGrowSignals(
      validObservation({
        rawPayload: { kind: GROW_PAIN_INTAKE_KIND, categories: ['TOTALLY_UNKNOWN', 'SLOW_APPROVAL'] },
      }),
    );
    expect(signals).toHaveLength(1);
    expect(signals[0].domainKey).toBe('APPROVAL_DELAY');
    expect(signals.some((s) => s.domainKey === 'GENERAL_FLOW')).toBe(false);
  });

  it('MALFORMED_SURVEY_FAIL_CLOSED=PASS', () => {
    for (const payload of [null, 'string', 42, [], true, {}, { kind: GROW_PAIN_INTAKE_KIND }, { kind: GROW_PAIN_INTAKE_KIND, categories: 'SLOW_APPROVAL' }]) {
      expect(observationToGrowSignals(validObservation({ rawPayload: payload }))).toEqual([]);
    }
  });

  it('NO_RAW_PAYLOAD_GUESSING=PASS (categories without the canonical producer marker are ignored)', () => {
    expect(
      observationToGrowSignals(
        validObservation({ rawPayload: { categories: ['SLOW_APPROVAL', 'REWORK'] } }),
      ),
    ).toEqual([]);
    // Arbitrary JSON must never be interpreted as a Grow problem.
    expect(
      observationToGrowSignals(
        validObservation({ rawPayload: { problem: 'approval is slow', domain: 'APPROVAL_DELAY' } }),
      ),
    ).toEqual([]);
  });

  it('empty category list yields no signal', () => {
    expect(
      observationToGrowSignals(validObservation({ rawPayload: { kind: GROW_PAIN_INTAKE_KIND, categories: [] } })),
    ).toEqual([]);
  });
});

describe('observationToGrowSignals — provenance', () => {
  it('BUSINESS_PROCESS_REFERENCE_PRESERVED=PASS', () => {
    const signals = observationToGrowSignals(
      validObservation({
        rawPayload: { kind: GROW_PAIN_INTAKE_KIND, categories: ['REWORK'], processId: 'process-123' },
      }),
    );
    expect(signals).toHaveLength(1);
    expect(signals[0].businessProcessId).toBe('process-123');
  });

  it('non-string / blank business process reference is not inferred', () => {
    expect(
      observationToGrowSignals(
        validObservation({ rawPayload: { kind: GROW_PAIN_INTAKE_KIND, categories: ['REWORK'], processId: 123 } }),
      )[0].businessProcessId,
    ).toBeNull();
    expect(
      observationToGrowSignals(
        validObservation({ rawPayload: { kind: GROW_PAIN_INTAKE_KIND, categories: ['REWORK'], processId: '   ' } }),
      )[0].businessProcessId,
    ).toBeNull();
  });

  it('OBSERVATION_ID_PROVENANCE_PRESERVED=PASS', () => {
    const signals = observationToGrowSignals(
      validObservation({
        id: 'observation-xyz',
        sourceRecordId: 'survey:abc',
        rawPayload: {
          kind: GROW_PAIN_INTAKE_KIND,
          categories: ['DUPLICATE_DATA'],
          provenance: { channel: 'CLIENT_PORTAL' },
        },
      }),
    );
    expect(signals).toHaveLength(1);
    expect(signals[0].observationId).toBe('observation-xyz');
    expect(signals[0].provenance.sourceRecordId).toBe('survey:abc');
    expect(signals[0].provenance.channel).toBe('CLIENT_PORTAL');
  });

  it('observationsToGrowSignals flattens and skips non-signal observations', () => {
    const signals = observationsToGrowSignals([
      validObservation({ id: 'obs-a' }),
      validObservation({ id: 'obs-b', observationType: 'GENERIC_RECORD' }),
      validObservation({
        id: 'obs-c',
        rawPayload: { kind: GROW_PAIN_INTAKE_KIND, categories: ['REWORK'] },
      }),
    ]);
    expect(signals.map((s) => s.observationId).sort()).toEqual(['obs-a', 'obs-c']);
  });
});
