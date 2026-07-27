/**
 * Deterministic comparison engine (STRUCTURED-DOC-COMPARISON-1).
 *
 * The engine is the foundation the whole subsystem trusts: a persisted
 * comparison is only meaningful if the same versions always diff to the same
 * segments. These tests lock insertion/deletion/replacement behaviour, the
 * truthful non-READY states (identical / unsupported / too-large), reproducibility,
 * and the guards against pathological runtime.
 */
import {
  compareVersions,
  normalizeText,
  COMPARISON_ALGORITHM_REVISION,
  MAX_INPUT_CHARS,
  type ComparisonResult,
} from '../src/modules/documents/comparison/diffEngine';

const run = (base: string | null, target: string | null, extra: Partial<Parameters<typeof compareVersions>[0]> = {}): ComparisonResult =>
  compareVersions({ baseText: base, targetText: target, baseSupported: true, targetSupported: true, ...extra });

const P = (...paras: string[]) => paras.join('\n\n');

describe('elementary edits', () => {
  it('1: detects a pure insertion', () => {
    const r = run(P('Alpha', 'Béta'), P('Alpha', 'Új bekezdés', 'Béta'));
    expect(r.status).toBe('READY');
    expect(r.summary.inserts).toBe(1);
    expect(r.summary.deletes).toBe(0);
    const ins = r.segments.find((s) => s.changeType === 'INSERT')!;
    expect(ins.targetExcerpt).toContain('Új bekezdés');
    expect(ins.baseStart).toBeNull();
  });

  it('2: detects a pure deletion', () => {
    const r = run(P('Alpha', 'Törlendő', 'Béta'), P('Alpha', 'Béta'));
    expect(r.summary.deletes).toBe(1);
    expect(r.summary.inserts).toBe(0);
    const del = r.segments.find((s) => s.changeType === 'DELETE')!;
    expect(del.baseExcerpt).toContain('Törlendő');
    expect(del.targetStart).toBeNull();
  });

  it('3: detects a replacement as one REPLACE, not delete+insert', () => {
    const r = run(P('Alpha', 'A díj 100 EUR.', 'Béta'), P('Alpha', 'A díj 250 EUR.', 'Béta'));
    expect(r.summary.replaces).toBe(1);
    expect(r.summary.inserts).toBe(0);
    expect(r.summary.deletes).toBe(0);
    const rep = r.segments.find((s) => s.changeType === 'REPLACE')!;
    expect(rep.baseExcerpt).toContain('100');
    expect(rep.targetExcerpt).toContain('250');
  });

  it('4: handles multiple paragraphs with mixed edits', () => {
    const r = run(P('Egy', 'Kettő', 'Három', 'Négy'), P('Egy', 'Kettő módosítva', 'Négy', 'Öt'));
    expect(r.status).toBe('READY');
    expect(r.summary.total).toBeGreaterThanOrEqual(2);
    // "Három" removed, "Öt" added, "Kettő" replaced.
    expect(r.segments.some((s) => s.baseExcerpt?.includes('Három'))).toBe(true);
    expect(r.segments.some((s) => s.targetExcerpt?.includes('Öt'))).toBe(true);
  });

  it('5: reports a whitespace-only change as FORMAT_ONLY', () => {
    const r = run(P('Alpha', 'A   szerződés   hatályos.'), P('Alpha', 'A szerződés hatályos.'));
    expect(r.summary.formatOnly).toBe(1);
    expect(r.summary.replaces).toBe(0);
  });

  it('6: handles repeated identical paragraphs without spurious churn', () => {
    const r = run(P('X', 'X', 'X'), P('X', 'X', 'X', 'X'));
    expect(r.status).toBe('READY');
    expect(r.summary.inserts).toBe(1);
    expect(r.summary.deletes).toBe(0);
    expect(r.summary.replaces).toBe(0);
  });
});

describe('boundary inputs', () => {
  it('7: empty base yields inserts only', () => {
    const r = run('', P('Egy', 'Kettő'));
    expect(r.status).toBe('READY');
    expect(r.summary.inserts).toBe(2);
    expect(r.summary.deletes).toBe(0);
  });

  it('8: empty target yields deletes only', () => {
    const r = run(P('Egy', 'Kettő'), '');
    expect(r.summary.deletes).toBe(2);
    expect(r.summary.inserts).toBe(0);
  });

  it('9: identical versions report IDENTICAL with no segments', () => {
    const r = run(P('Egy', 'Kettő'), P('Egy', 'Kettő'));
    expect(r.status).toBe('IDENTICAL');
    expect(r.segments).toHaveLength(0);
  });

  it('9b: whitespace/line-ending-only difference is IDENTICAL after normalization', () => {
    const r = run('Egy\r\nKettő\r\n', 'Egy\nKettő');
    expect(r.status).toBe('IDENTICAL');
  });

  it('10: handles Unicode Hungarian text correctly', () => {
    const r = run(P('Árvíztűrő tükörfúrógép', 'Öl289'), P('Árvíztűrő tükörfúrógép', 'Öt kutya'));
    expect(r.status).toBe('READY');
    expect(r.summary.replaces).toBe(1);
    const rep = r.segments.find((s) => s.changeType === 'REPLACE')!;
    expect(rep.targetExcerpt).toContain('Öt kutya');
  });
});

describe('robustness and determinism', () => {
  it('11: handles long input within the limit', () => {
    const base = Array.from({ length: 1500 }, (_, i) => `Bekezdés ${i}.`).join('\n\n');
    const target = base.replace('Bekezdés 700.', 'Bekezdés 700 módosítva.');
    const r = run(base, target);
    expect(r.status).toBe('READY');
    expect(r.summary.total).toBe(1);
  });

  it('12: is deterministic — identical output on repeat', () => {
    const base = P('Egy', 'A díj 100 EUR.', 'Három', 'Régi bekezdés');
    const target = P('Egy', 'A díj 250 EUR.', 'Új bekezdés', 'Három');
    const a = JSON.stringify(run(base, target));
    const b = JSON.stringify(run(base, target));
    expect(a).toBe(b);
  });

  it('13: rejects input over the size limit with an explicit FAILED status', () => {
    const huge = 'a'.repeat(MAX_INPUT_CHARS + 1);
    const r = run(huge, 'b');
    expect(r.status).toBe('FAILED');
    expect(r.failureCode).toBe('INPUT_TOO_LARGE');
    expect(r.segments).toHaveLength(0);
  });

  it('14: stamps the algorithm revision on every result', () => {
    expect(run(P('a'), P('b')).algorithmRevision).toBe(COMPARISON_ALGORITHM_REVISION);
    expect(run('', '').algorithmRevision).toBe(COMPARISON_ALGORITHM_REVISION);
  });

  it('15: no recursive-rebuild pathology — large near-identical input stays bounded', () => {
    // Many paragraphs, one change: must not explode into O(n) segments or hang.
    const paras = Array.from({ length: 2000 }, (_, i) => `Sor ${i} tartalma.`);
    const base = paras.join('\n\n');
    const target = [...paras.slice(0, 1000), 'Beszúrt sor.', ...paras.slice(1000)].join('\n\n');
    const start = Date.now();
    const r = run(base, target);
    expect(Date.now() - start).toBeLessThan(5000);
    expect(r.status).toBe('READY');
    expect(r.summary.inserts).toBe(1);
    expect(r.summary.total).toBe(1);
  });

  it('flags a moved paragraph as a candidate, never a certain move', () => {
    const r = run(P('Fejléc', 'Egyedi mozgó bekezdés', 'Közép', 'Vége'), P('Fejléc', 'Közép', 'Vége', 'Egyedi mozgó bekezdés'));
    expect(r.summary.moveCandidates).toBeGreaterThanOrEqual(1);
    const mv = r.segments.find((s) => s.changeType === 'MOVE_CANDIDATE')!;
    expect(mv.confidence).toBeLessThan(0.8);
  });
});

describe('unsupported extraction is truthful', () => {
  it('returns UNSUPPORTED when either side lacks authoritative text', () => {
    expect(run('text', null, { targetSupported: false }).status).toBe('UNSUPPORTED');
    expect(run(null, 'text', { baseSupported: false }).status).toBe('UNSUPPORTED');
    const r = run('a', 'b', { baseSupported: false });
    expect(r.failureCode).toBe('EXTRACTION_UNAVAILABLE');
    expect(r.segments).toHaveLength(0);
  });
});

describe('normalizeText', () => {
  it('normalizes line endings and trailing whitespace, preserving paragraph boundaries', () => {
    expect(normalizeText('a  \r\nb\r\n\r\n\r\nc')).toBe('a\nb\n\nc');
  });
});
