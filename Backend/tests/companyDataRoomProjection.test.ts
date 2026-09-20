/**
 * COMPANY OS COCKPIT — canonical provenance / freshness / conflict derivation.
 *
 * These are the pure, schema-free rules the Company Data Room projection uses to
 * answer "Honnan tudjuk?", "Mikor állapítottuk meg?" and "Ez még érvényes?". They
 * must never invent a rule that the canonical models do not carry.
 */
import { classifyFactSourceKind, deriveFactFreshness, safeProvenanceSource } from '../src/modules/company-workspace/service';
import { assertClientSafe, forbidden } from '../src/modules/client-interaction/base';

describe('company data room fact provenance classification', () => {
  it('classifies portal-identity references without exposing the raw value', () => {
    expect(classifyFactSourceKind('CLIENT_PORTAL_IDENTITY:11111111-2222-3333-4444-555555555555', false))
      .toBe('CLIENT_PORTAL_ANSWER');
  });

  it('prefers the portal category even when a source document is also linked', () => {
    expect(classifyFactSourceKind('CLIENT_PORTAL_IDENTITY:abc', true)).toBe('CLIENT_PORTAL_ANSWER');
  });

  it('classifies a linked source document as DOCUMENT', () => {
    expect(classifyFactSourceKind(null, true)).toBe('DOCUMENT');
    expect(classifyFactSourceKind('', true)).toBe('DOCUMENT');
  });

  it('classifies any other non-empty reference as MANUAL', () => {
    expect(classifyFactSourceKind('Belső rögzítés', false)).toBe('MANUAL');
  });

  it('keeps an absent reference unknown rather than guessing', () => {
    expect(classifyFactSourceKind(null, false)).toBe('UNKNOWN');
    expect(classifyFactSourceKind('', false)).toBe('UNKNOWN');
    expect(classifyFactSourceKind('   ', false)).toBe('UNKNOWN');
  });
});

describe('company data room fact freshness', () => {
  const now = new Date('2026-06-15T00:00:00.000Z');

  it('treats a VALIDITY_INTERVAL fact with an open or future validTo as current', () => {
    expect(deriveFactFreshness('VALIDITY_INTERVAL', null, now)).toEqual({
      rule: 'VALIDITY_INTERVAL',
      ruleDefined: true,
      state: 'CURRENT',
    });
    expect(deriveFactFreshness('VALIDITY_INTERVAL', new Date('2026-12-31T00:00:00.000Z'), now).state).toBe('CURRENT');
  });

  it('marks a VALIDITY_INTERVAL fact past its validTo as expired', () => {
    expect(deriveFactFreshness('VALIDITY_INTERVAL', new Date('2026-01-01T00:00:00.000Z'), now)).toEqual({
      rule: 'VALIDITY_INTERVAL',
      ruleDefined: true,
      state: 'EXPIRED',
    });
  });

  it('reports no freshness rule for every temporal policy that defines none', () => {
    for (const policy of ['OBSERVATION', 'EFFECTIVE_INSTANT', 'REFERENCE_PERIOD', 'EVENT', null]) {
      expect(deriveFactFreshness(policy, null, now)).toEqual({
        rule: policy,
        ruleDefined: false,
        state: 'NO_RULE',
      });
    }
  });

  it('never derives staleness from elapsed time for a rule-less policy', () => {
    // A fact observed a decade ago under an OBSERVATION policy stays NO_RULE: the
    // derivation takes no elapsed-time input at all, so no 30/90/365-day window
    // can be applied anywhere.
    expect(deriveFactFreshness.length).toBe(3);
    expect(deriveFactFreshness('OBSERVATION', null, new Date('2026-01-01T00:00:00.000Z'))).toEqual({
      rule: 'OBSERVATION',
      ruleDefined: false,
      state: 'NO_RULE',
    });
  });
});

describe('company data room snapshot provenance', () => {
  it('surfaces only a bounded machine token and rejects anything else', () => {
    expect(safeProvenanceSource({ source: 'CANONICAL_BUSINESS_PROCESS' })).toBe('CANONICAL_BUSINESS_PROCESS');
    expect(safeProvenanceSource({ source: 'EXTERNAL_SURVEY_V2' })).toBe('EXTERNAL_SURVEY_V2');
    expect(safeProvenanceSource({ source: 'free text with spaces' })).toBeNull();
    expect(safeProvenanceSource({ source: 'secret-token-value' })).toBeNull();
    expect(safeProvenanceSource({ source: 'x'.repeat(65) })).toBeNull();
    expect(safeProvenanceSource(null)).toBeNull();
    expect(safeProvenanceSource({})).toBeNull();
    expect(safeProvenanceSource({ source: 42 })).toBeNull();
  });

  it('adds no client-safe-forbidden vocabulary to the new projection literals', () => {
    const sample = {
      provenance: {
        sourceKind: 'CLIENT_PORTAL_ANSWER',
        determinationMethod: 'USER_PROVIDED',
        basis: 'ClientFact.sourceReference + ClientFact.sourceDocumentVersionId + EvidenceRecord',
      },
      freshness: {
        rule: 'VALIDITY_INTERVAL',
        state: 'NO_RULE',
        basis: 'FactDefinition.temporalPolicy',
      },
      conflicts: { overlapPolicy: 'DISALLOW', hasCanonicalSelection: false, reviewRequired: true },
      operatingProfileReview: { rule: 'nextReviewAt', state: 'REVIEW_REQUIRED' },
      snapshot: { provenanceSource: 'CANONICAL_BUSINESS_PROCESS', metricNameHu: 'Összes aktív munkaidő' },
    };
    expect(forbidden(sample)).toBe(false);
    expect(() => assertClientSafe(sample)).not.toThrow();
  });
});
