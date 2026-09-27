/**
 * Contract date candidate extractor — pure, deterministic unit tests.
 *
 * Proves the extraction layer ONLY produces candidates bound to text facts:
 * keyword-supported Hungarian date patterns, supporting excerpts with offsets,
 * stable excerpt hashes, dedupe by (type, day), no fabricated confidence, and
 * never any persistence or canonical write.
 */
import {
  extractContractDateCandidates,
  excerptHashOf,
  normalizeExcerptText,
} from '../src/modules/contract-date-candidates/extractor';

const EFFECTIVE_TEXT =
  'Jelen szerződés a felek aláírását követően, 2024. 05. 12. napján lép hatályba. A szolgáltató ettől az időponttól köteles teljesíteni.';
const EXPIRY_TEXT =
  'A szerződés hatálya 2025.03.31. napjával lejár, kivéve ha a felek a lejárat előtt meghosszabbítják.';
const PAYMENT_TEXT =
  'A vállalkozói díj fizetési határidő: 2024. június 30. Késedelmes fizetés esetén késedelmi kamat jár.';
const MILESTONE_TEXT =
  'A harmadik ütem teljesítési határidő 2024.12.01. Az átadás-átvételi jegyzőkönyv eddig az időpontig aláírandó.';
const NOTICE_TEXT =
  'A felek rendes felmondási határidő: 2024.11.15. A felmondás csak írásban érvényes.';
const NO_KEYWORD_TEXT =
  'Az ingatlan címe 2024. 05. 12. napjától nem releváns, mert 2025.03.31. napon ellenőriztük a nyilvántartást.';

describe('extractContractDateCandidates — detection', () => {
  it('detects EFFECTIVE with Hungarian yyyy. mm. dd. pattern', () => {
    const result = extractContractDateCandidates(EFFECTIVE_TEXT);
    expect(result).toHaveLength(1);
    expect(result[0].dateType).toBe('EFFECTIVE');
    expect(result[0].proposedDate.toISOString().slice(0, 10)).toBe('2024-05-12');
  });

  it('detects EXPIRY', () => {
    const result = extractContractDateCandidates(EXPIRY_TEXT);
    expect(result).toHaveLength(1);
    expect(result[0].dateType).toBe('EXPIRY');
    expect(result[0].proposedDate.toISOString().slice(0, 10)).toBe('2025-03-31');
  });

  it('detects PAYMENT_DUE with Hungarian month-name pattern', () => {
    const result = extractContractDateCandidates(PAYMENT_TEXT);
    expect(result).toHaveLength(1);
    expect(result[0].dateType).toBe('PAYMENT_DUE');
    expect(result[0].proposedDate.toISOString().slice(0, 10)).toBe('2024-06-30');
  });

  it('detects MILESTONE and NOTICE', () => {
    expect(extractContractDateCandidates(MILESTONE_TEXT)[0].dateType).toBe('MILESTONE');
    expect(extractContractDateCandidates(NOTICE_TEXT)[0].dateType).toBe('NOTICE');
  });

  it('produces nothing without a supporting keyword window', () => {
    expect(extractContractDateCandidates(NO_KEYWORD_TEXT)).toHaveLength(0);
  });

  it('produces nothing for empty text', () => {
    expect(extractContractDateCandidates('')).toHaveLength(0);
  });
});

describe('extractContractDateCandidates — source provenance', () => {
  it('captures a supporting excerpt containing the date token', () => {
    const result = extractContractDateCandidates(EFFECTIVE_TEXT);
    expect(result).toHaveLength(1);
    const { sourceExcerpt, excerptStartOffset, excerptEndOffset } = result[0];
    expect(sourceExcerpt).toContain('2024. 05. 12.');
    expect(sourceExcerpt).toContain('hatályba');
    expect(excerptStartOffset).toBeGreaterThanOrEqual(0);
    expect(excerptEndOffset).toBeGreaterThan(excerptStartOffset);
    expect(excerptEndOffset).toBeLessThanOrEqual(EFFECTIVE_TEXT.length);
    expect(EFFECTIVE_TEXT.slice(excerptStartOffset, excerptEndOffset).trim()).toBe(sourceExcerpt);
  });

  it('excerpt hash is deterministic and normalized', () => {
    const first = excerptHashOf('A fizetési határidő: 2024.  június  30.');
    const second = excerptHashOf('A fizetési határidő: 2024. június 30.');
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{8}$/);
  });

  it('normalizes whitespace for containment checks', () => {
    expect(normalizeExcerptText('a\n\tb  c ')).toBe('a b c');
  });

  it('never emits a fabricated confidence score', () => {
    const result = extractContractDateCandidates(EFFECTIVE_TEXT);
    for (const candidate of result) {
      expect(Object.keys(candidate)).not.toContain('confidence');
      expect(JSON.stringify(candidate)).not.toContain('confidence');
    }
  });
});

describe('extractContractDateCandidates — dedupe and bounds', () => {
  it('deduplicates the same (type, day) identity from different patterns', () => {
    const text = 'A szerződés 2024. 05. 12. napján lép hatályba, hatálybalépés: 2024.05.12.';
    const result = extractContractDateCandidates(text);
    expect(result.filter((c) => c.dateType === 'EFFECTIVE')).toHaveLength(1);
  });

  it('keeps distinct types for the same day', () => {
    const text =
      'A szerződés 2024. 05. 12. napján lép hatályba. A fizetési határidő 2024. 05. 12. A lejárat 2024. 05. 12.';
    const types = extractContractDateCandidates(text).map((candidate) => candidate.dateType).sort();
    expect(types).toEqual(['EFFECTIVE', 'EXPIRY', 'PAYMENT_DUE']);
  });

  it('ignores far-future/far-past years', () => {
    expect(extractContractDateCandidates('A szerződés 1800. 01. 01. napján lép hatályba.')).toHaveLength(0);
    expect(extractContractDateCandidates('A szerződés 2155. 01. 01. napján lép hatályba.')).toHaveLength(0);
  });
});
