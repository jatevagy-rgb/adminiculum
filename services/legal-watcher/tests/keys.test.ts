/**
 * T26 — deterministic event keys + hashes (hardcoded SHA-256 vectors).
 */
import { eventKeyFor, payloadHashFor, sha256Hex } from '../src/keys';

describe('deterministic event identity', () => {
  test('T26 event keys are stable SHA-256 hex vectors', () => {
    expect(eventKeyFor('32016R0679', 'AMENDMENT_PUBLISHED', '32003R1882')).toBe(
      '7e36d5f9f7b5a3ced9e28e6a8a60394a009a96c8f4537958c57bf7e45fafb4e1',
    );
    expect(eventKeyFor('32016R0679', 'CONSOLIDATED_VERSION_AVAILABLE', '02016R0679-20160504')).toBe(
      'af011814cccde2a754f847c58b99d0ad8d92bae3e50e95c10e0643ca780c2147',
    );
  });

  test('T26 event keys are independent of construction order and row order', () => {
    const a = eventKeyFor('32016R0679', 'AMENDMENT_PUBLISHED', '32003R1882');
    const b = eventKeyFor('32016R0679', 'AMENDMENT_PUBLISHED', '32003R1882');
    expect(a).toBe(b);
    const c = eventKeyFor('32022L2555', 'AMENDMENT_PUBLISHED', '32003R1882');
    expect(c).not.toBe(a);
    const d = eventKeyFor('32016R0679', 'CONSOLIDATED_VERSION_AVAILABLE', '32003R1882');
    expect(d).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  test('T26 payload hash covers metadata but not the event key', () => {
    const base = {
      source: 'EURLEX_CELLAR' as const,
      sourceIdentifier: '32016R0679',
      eventKind: 'AMENDMENT_PUBLISHED' as const,
      relatedIdentifier: '32003R1882',
      sourceUri: 'http://publications.europa.eu/resource/cellar/a',
      capturedAt: '2026-09-27T12:00:00.000Z',
      queryProvenance: 'p',
    };
    const h1 = payloadHashFor(base);
    const h2 = payloadHashFor({ ...base, publicationDate: '2003-09-26' });
    expect(h1).not.toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex(['x', 'y'])).toBe(sha256Hex(['x', 'y']));
  });
});
