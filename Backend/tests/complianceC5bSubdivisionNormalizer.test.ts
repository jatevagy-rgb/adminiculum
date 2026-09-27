/**
 * C5B-1 — specification tests for the canonical subdivision normalizer.
 *
 * Proves the accepted C5B-1 contract:
 *   - EU normalization reuses C5A semantics (same vocabulary, ranks, depth) and
 *     exposes the canonical segment representation,
 *   - HU_STRUCTURED_COMPONENTS_V1 normalizes the structured component input,
 *   - HU_LEGACY_SLASH_V1 parses only the approved narrow slash shapes, with the
 *     inserted section `15/A` owned by the section identity,
 *   - canonical serialization escapes a reserved `/` as `%2F` and round-trips,
 *   - hierarchy helpers are pure segment comparisons (no scoring),
 *   - the module is pure, fail-closed and OPT-IN (no production import).
 *
 * No database is required. These tests do not touch C4A/C4B/C4C runtime paths;
 * the existing C4A, C4B, C4C and C5A suites are run unchanged alongside.
 */
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { describe, expect, it } from '@jest/globals';
import {
  HU_SUBDIVISION_CODES,
  SUBDIVISION_NORMALIZATION_ERROR_CODES,
  SUBDIVISION_RELATIONS,
  compareCanonicalSubdivisions,
  normalizeEliSubdivisionPath,
  normalizeHuStructuredComponents,
  parseCanonicalSubdivisionPath,
  parseHuLegacySlashLocator,
  serializeCanonicalSubdivision,
  type CanonicalSubdivision,
  type HuStructuredComponents,
  type SubdivisionNormalizationResult,
} from '../src/modules/compliance-doc-intelligence/subdivisionNormalizer';

const SRC_DIR = path.join(__dirname, '..', 'src');
const MODULE_FILE = path.join(SRC_DIR, 'modules', 'compliance-doc-intelligence', 'subdivisionNormalizer.ts');

function expectInvalid(result: SubdivisionNormalizationResult, errorCode: string): void {
  expect(result).toEqual({ valid: false, errorCode });
}

function subdivisionOf(result: SubdivisionNormalizationResult): CanonicalSubdivision {
  if ('subdivision' in result) return result.subdivision;
  throw new Error(`expected a valid normalization, got ${result.errorCode}`);
}

function eli(value: string): CanonicalSubdivision {
  return subdivisionOf(normalizeEliSubdivisionPath(value));
}

function huLegacy(value: string): CanonicalSubdivision {
  return subdivisionOf(parseHuLegacySlashLocator(value));
}

function huStructured(input: HuStructuredComponents): CanonicalSubdivision {
  return subdivisionOf(normalizeHuStructuredComponents(input));
}

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectSourceFiles(full));
    else if (entry.isFile() && full.endsWith('.ts')) files.push(full);
  }
  return files;
}

/* ------------------------------------------------------------------ */
/*  1. EU normalization (C5A-reusing)                                  */
/* ------------------------------------------------------------------ */

describe('C5B-1 EU normalization over C5A', () => {
  it('normalizes the C5A mission examples into canonical segment arrays', () => {
    expect(normalizeEliSubdivisionPath('art_28')).toEqual({
      valid: true,
      subdivision: { canonicalPath: 'art_28', segments: [{ code: 'art', value: '28' }] },
    });
    expect(normalizeEliSubdivisionPath('art_28/par_3')).toEqual({
      valid: true,
      subdivision: {
        canonicalPath: 'art_28/par_3',
        segments: [
          { code: 'art', value: '28' },
          { code: 'par', value: '3' },
        ],
      },
    });
    expect(normalizeEliSubdivisionPath('art_28/par_3/pnt_g')).toEqual({
      valid: true,
      subdivision: {
        canonicalPath: 'art_28/par_3/pnt_g',
        segments: [
          { code: 'art', value: '28' },
          { code: 'par', value: '3' },
          { code: 'pnt', value: 'g' },
        ],
      },
    });
  });

  it('keeps art_1 and art_15 distinct as parsed segments', () => {
    expect(eli('art_1').segments).toEqual([{ code: 'art', value: '1' }]);
    expect(eli('art_15').segments).toEqual([{ code: 'art', value: '15' }]);
    expect(eli('art_1').canonicalPath).not.toBe(eli('art_15').canonicalPath);
  });

  it('rejects an invalid structural order instead of reordering it', () => {
    expectInvalid(normalizeEliSubdivisionPath('art_28/pnt_g/par_3'), 'INVALID_HIERARCHY');
    expectInvalid(normalizeEliSubdivisionPath('par_3/art_28'), 'INVALID_HIERARCHY');
    expectInvalid(normalizeEliSubdivisionPath('art_28/art_29'), 'INVALID_HIERARCHY');
  });

  it('leaves unranked EU codes order-neutral instead of inventing hierarchy', () => {
    expect(normalizeEliSubdivisionPath('art_5/par_2/pnt_b/sub_c')).toEqual({
      valid: true,
      subdivision: {
        canonicalPath: 'art_5/par_2/pnt_b/sub_c',
        segments: [
          { code: 'art', value: '5' },
          { code: 'par', value: '2' },
          { code: 'pnt', value: 'b' },
          { code: 'sub', value: 'c' },
        ],
      },
    });
    // `tit` is a known EU code with no structural rank: it is not given one here.
    expect(normalizeEliSubdivisionPath('tit_1/art_5').valid).toBe(true);
  });

  it('rejects a path deeper than the C5A maximum', () => {
    expectInvalid(
      normalizeEliSubdivisionPath('prt_I/tis_II/cpt_III/sct_IV/sbs_V/art_1/par_2'),
      'UNSUPPORTED_INPUT_FORMAT',
    );
  });

  it('rejects unknown levels and malformed segments instead of repairing them', () => {
    expectInvalid(normalizeEliSubdivisionPath('zzz_5'), 'UNKNOWN_LEVEL');
    expectInvalid(normalizeEliSubdivisionPath('art'), 'MALFORMED_INPUT');
    expectInvalid(normalizeEliSubdivisionPath('ART_5'), 'MALFORMED_INPUT');
    expectInvalid(normalizeEliSubdivisionPath('art_'), 'MALFORMED_INPUT');
    expectInvalid(normalizeEliSubdivisionPath(''), 'MALFORMED_INPUT');
    expectInvalid(normalizeEliSubdivisionPath(null), 'MALFORMED_INPUT');
    expectInvalid(normalizeEliSubdivisionPath(undefined), 'MALFORMED_INPUT');
  });

  it('does not accept Hungarian section identity as an EU level', () => {
    expectInvalid(normalizeEliSubdivisionPath('sec_5'), 'UNKNOWN_LEVEL');
    expectInvalid(normalizeEliSubdivisionPath('spt_aa'), 'UNKNOWN_LEVEL');
  });

  it('preserves the colon identifier that C5A already permits', () => {
    expect(normalizeEliSubdivisionPath('art_6:59')).toEqual({
      valid: true,
      subdivision: { canonicalPath: 'art_6:59', segments: [{ code: 'art', value: '6:59' }] },
    });
  });
});

/* ------------------------------------------------------------------ */
/*  2. HU_STRUCTURED_COMPONENTS_V1                                     */
/* ------------------------------------------------------------------ */

describe('C5B-1 HU_STRUCTURED_COMPONENTS_V1', () => {
  it('normalizes the approved component chain', () => {
    expect(normalizeHuStructuredComponents({ section: '5' })).toEqual({
      valid: true,
      subdivision: { canonicalPath: 'sec_5', segments: [{ code: 'sec', value: '5' }] },
    });
    expect(huStructured({ section: '5', paragraph: '1' }).canonicalPath).toBe('sec_5/par_1');
    expect(huStructured({ section: '5', paragraph: '10' }).canonicalPath).toBe('sec_5/par_10');
    expect(huStructured({ section: '5', paragraph: '2', point: 'b' }).canonicalPath).toBe('sec_5/par_2/pnt_b');
    expect(
      huStructured({ section: '5', paragraph: '2', point: 'a', subpoint: 'aa' }).canonicalPath,
    ).toBe('sec_5/par_2/pnt_a/spt_aa');
  });

  it('supports letter-parent and numeric-parent alpont forms', () => {
    expect(
      huStructured({ section: '5', paragraph: '2', point: 'a', subpoint: 'ab' }).canonicalPath,
    ).toBe('sec_5/par_2/pnt_a/spt_ab');
    expect(
      huStructured({ section: '5', paragraph: '2', point: '1', subpoint: 'a' }).canonicalPath,
    ).toBe('sec_5/par_2/pnt_1/spt_a');
  });

  it('serializes inserted and colon section identities', () => {
    expect(normalizeHuStructuredComponents({ section: '15/A' })).toEqual({
      valid: true,
      subdivision: { canonicalPath: 'sec_15%2FA', segments: [{ code: 'sec', value: '15/A' }] },
    });
    expect(huStructured({ section: '6:114' }).canonicalPath).toBe('sec_6:114');
    expect(huStructured({ section: '6:114', paragraph: '1' }).canonicalPath).toBe('sec_6:114/par_1');
  });

  it('rejects missing semantic parents as INVALID_HIERARCHY', () => {
    expectInvalid(normalizeHuStructuredComponents({ paragraph: '2' }), 'INVALID_HIERARCHY');
    expectInvalid(normalizeHuStructuredComponents({ point: 'b' }), 'INVALID_HIERARCHY');
    expectInvalid(normalizeHuStructuredComponents({ subpoint: 'aa' }), 'INVALID_HIERARCHY');
    expectInvalid(normalizeHuStructuredComponents({ section: '5', point: 'b' }), 'INVALID_HIERARCHY');
    expectInvalid(normalizeHuStructuredComponents({ section: '5', paragraph: '2', subpoint: 'aa' }), 'INVALID_HIERARCHY');
    expectInvalid(normalizeHuStructuredComponents({ section: '5', subpoint: 'aa' }), 'INVALID_HIERARCHY');
  });

  it('rejects non-canonical leading-zero identifiers', () => {
    expectInvalid(normalizeHuStructuredComponents({ section: '5', paragraph: '02' }), 'NON_CANONICAL_IDENTIFIER');
    expectInvalid(normalizeHuStructuredComponents({ section: '05' }), 'NON_CANONICAL_IDENTIFIER');
    expectInvalid(normalizeHuStructuredComponents({ section: '015/A' }), 'NON_CANONICAL_IDENTIFIER');
  });

  it('rejects uppercase, accented and two-letter point identifiers', () => {
    expectInvalid(normalizeHuStructuredComponents({ section: '5', paragraph: '2', point: 'B' }), 'UNSUPPORTED_IDENTIFIER');
    expectInvalid(normalizeHuStructuredComponents({ section: '5', paragraph: '2', point: 'é' }), 'UNSUPPORTED_IDENTIFIER');
    expectInvalid(normalizeHuStructuredComponents({ section: '5', paragraph: '2', point: 'bb' }), 'UNSUPPORTED_IDENTIFIER');
  });

  it('rejects an alpont whose first letter differs from its parent point', () => {
    expectInvalid(
      normalizeHuStructuredComponents({ section: '5', paragraph: '2', point: 'a', subpoint: 'ba' }),
      'UNSUPPORTED_IDENTIFIER',
    );
    expectInvalid(
      normalizeHuStructuredComponents({ section: '5', paragraph: '2', point: '1', subpoint: 'aa' }),
      'UNSUPPORTED_IDENTIFIER',
    );
  });

  it('rejects unsupported section value shapes without guessing', () => {
    expectInvalid(normalizeHuStructuredComponents({ section: '5/2' }), 'UNSUPPORTED_IDENTIFIER');
    expectInvalid(normalizeHuStructuredComponents({ section: '15/a' }), 'UNSUPPORTED_IDENTIFIER');
    expectInvalid(normalizeHuStructuredComponents({ section: '15/A/B' }), 'UNSUPPORTED_IDENTIFIER');
    expectInvalid(normalizeHuStructuredComponents({ section: 'IV' }), 'UNSUPPORTED_IDENTIFIER');
  });

  it('rejects empty and non-structured inputs', () => {
    expectInvalid(normalizeHuStructuredComponents({}), 'MALFORMED_INPUT');
    expectInvalid(normalizeHuStructuredComponents({ section: '' }), 'MALFORMED_INPUT');
    expectInvalid(normalizeHuStructuredComponents(null), 'MALFORMED_INPUT');
    expectInvalid(normalizeHuStructuredComponents(undefined), 'MALFORMED_INPUT');
    expectInvalid(normalizeHuStructuredComponents({ section: 5 as never }), 'MALFORMED_INPUT');
  });
});

/* ------------------------------------------------------------------ */
/*  3. HU_LEGACY_SLASH_V1                                              */
/* ------------------------------------------------------------------ */

describe('C5B-1 HU_LEGACY_SLASH_V1', () => {
  it('parses the approved narrow shapes', () => {
    expect(parseHuLegacySlashLocator('5')).toEqual({
      valid: true,
      subdivision: { canonicalPath: 'sec_5', segments: [{ code: 'sec', value: '5' }] },
    });
    expect(huLegacy('5/1').canonicalPath).toBe('sec_5/par_1');
    expect(huLegacy('5/10').canonicalPath).toBe('sec_5/par_10');
    expect(huLegacy('5/2/b').canonicalPath).toBe('sec_5/par_2/pnt_b');
    expect(huLegacy('15/A').canonicalPath).toBe('sec_15%2FA');
    expect(huLegacy('15/A/1').canonicalPath).toBe('sec_15%2FA/par_1');
    expect(huLegacy('6:114').canonicalPath).toBe('sec_6:114');
    expect(huLegacy('6:114/1').canonicalPath).toBe('sec_6:114/par_1');
  });

  it('owns a slash inside the section identity and never parses 15/A as a child', () => {
    const inserted = huLegacy('15/A');
    expect(inserted.segments).toEqual([{ code: 'sec', value: '15/A' }]);
    expect(inserted.segments).toHaveLength(1);
    expect(inserted.canonicalPath).toBe('sec_15%2FA');
    expect(huLegacy('15/A/1').segments).toEqual([
      { code: 'sec', value: '15/A' },
      { code: 'par', value: '1' },
    ]);
  });

  it('rejects a leading-zero paragraph as NON_CANONICAL_IDENTIFIER', () => {
    expectInvalid(parseHuLegacySlashLocator('5/02'), 'NON_CANONICAL_IDENTIFIER');
  });

  it('rejects uppercase, accented and two-letter point identifiers', () => {
    expectInvalid(parseHuLegacySlashLocator('5/2/B'), 'UNSUPPORTED_IDENTIFIER');
    expectInvalid(parseHuLegacySlashLocator('5/2/é'), 'UNSUPPORTED_IDENTIFIER');
    expectInvalid(parseHuLegacySlashLocator('5/2/bb'), 'UNSUPPORTED_IDENTIFIER');
  });

  it('stops at the point level: subpoints are structured-mode only', () => {
    expect(huLegacy('5/2/b').canonicalPath).toBe('sec_5/par_2/pnt_b');
    expectInvalid(parseHuLegacySlashLocator('5/2/b/ba'), 'UNSUPPORTED_INPUT_FORMAT');
    expectInvalid(parseHuLegacySlashLocator('5/2/a/aa'), 'UNSUPPORTED_INPUT_FORMAT');
    expectInvalid(parseHuLegacySlashLocator('5/2/1/a'), 'UNSUPPORTED_INPUT_FORMAT');
    // Inserted section consumes the second token, so `aa` sits at the point
    // position: invalid identifier, still fail-closed.
    expectInvalid(parseHuLegacySlashLocator('15/A/1/aa'), 'UNSUPPORTED_IDENTIFIER');
  });

  it('rejects a point value at the paragraph position as a missing paragraph', () => {
    expectInvalid(parseHuLegacySlashLocator('5/a'), 'INVALID_HIERARCHY');
  });

  it('keeps typed semicolon locators opaque and unsupported', () => {
    expectInvalid(parseHuLegacySlashLocator('sec=15/B;par=4'), 'UNSUPPORTED_INPUT_FORMAT');
    expectInvalid(parseHuLegacySlashLocator('sec=5;par=2;point=b'), 'UNSUPPORTED_INPUT_FORMAT');
  });

  it('fails closed without partial normalization', () => {
    expectInvalid(parseHuLegacySlashLocator('5/2/INVALID'), 'UNSUPPORTED_IDENTIFIER');
    expectInvalid(parseHuLegacySlashLocator('5/2/2x'), 'UNSUPPORTED_IDENTIFIER');
  });

  it('rejects malformed and over-long shapes', () => {
    expectInvalid(parseHuLegacySlashLocator('5/'), 'MALFORMED_INPUT');
    expectInvalid(parseHuLegacySlashLocator('5//2'), 'MALFORMED_INPUT');
    expectInvalid(parseHuLegacySlashLocator('/5'), 'MALFORMED_INPUT');
    expectInvalid(parseHuLegacySlashLocator(''), 'MALFORMED_INPUT');
    expectInvalid(parseHuLegacySlashLocator(null), 'MALFORMED_INPUT');
    expectInvalid(parseHuLegacySlashLocator('IV/2'), 'UNSUPPORTED_IDENTIFIER');
    expectInvalid(parseHuLegacySlashLocator('5-10'), 'UNSUPPORTED_IDENTIFIER');
    expectInvalid(parseHuLegacySlashLocator('5/1/2/3/4'), 'UNSUPPORTED_INPUT_FORMAT');
  });
});

/* ------------------------------------------------------------------ */
/*  4. Canonical serialization                                         */
/* ------------------------------------------------------------------ */

describe('C5B-1 canonical serialization', () => {
  it('escapes a reserved slash with canonical uppercase percent hex', () => {
    expect(serializeCanonicalSubdivision([{ code: 'sec', value: '15/A' }])).toBe('sec_15%2FA');
    expect(
      serializeCanonicalSubdivision([
        { code: 'sec', value: '15/A' },
        { code: 'par', value: '1' },
      ]),
    ).toBe('sec_15%2FA/par_1');
  });

  it('round-trips HU inserted-section paths', () => {
    const parsed = subdivisionOf(parseCanonicalSubdivisionPath('sec_15%2FA/par_1'));
    expect(parsed.segments).toEqual([
      { code: 'sec', value: '15/A' },
      { code: 'par', value: '1' },
    ]);
    expect(serializeCanonicalSubdivision(parsed.segments)).toBe('sec_15%2FA/par_1');
    const reparsed = subdivisionOf(
      parseCanonicalSubdivisionPath(serializeCanonicalSubdivision(parsed.segments) as string),
    );
    expect(reparsed.segments).toEqual(parsed.segments);
  });

  it('round-trips EU, colon-section and alpont paths', () => {
    for (const canonicalPath of [
      'art_28/par_3/pnt_g',
      'sec_6:114',
      'art_6:59',
      'sec_5/par_2/pnt_a/spt_ab',
      'sec_5',
    ]) {
      const parsed = subdivisionOf(parseCanonicalSubdivisionPath(canonicalPath));
      expect(parsed.canonicalPath).toBe(canonicalPath);
      expect(serializeCanonicalSubdivision(parsed.segments)).toBe(canonicalPath);
      expect(subdivisionOf(parseCanonicalSubdivisionPath(parsed.canonicalPath)).segments).toEqual(parsed.segments);
    }
  });

  it('rejects malformed percent escapes', () => {
    expectInvalid(parseCanonicalSubdivisionPath('sec_15%2'), 'MALFORMED_INPUT');
    expectInvalid(parseCanonicalSubdivisionPath('sec_15%'), 'MALFORMED_INPUT');
    expectInvalid(parseCanonicalSubdivisionPath('sec_15%ZZ'), 'MALFORMED_INPUT');
    expectInvalid(parseCanonicalSubdivisionPath('sec_15%2G'), 'MALFORMED_INPUT');
  });

  it('rejects alternate encodings as non-canonical', () => {
    expectInvalid(parseCanonicalSubdivisionPath('sec_15%2fA'), 'NON_CANONICAL_IDENTIFIER');
    expectInvalid(parseCanonicalSubdivisionPath('sec_15%20A'), 'NON_CANONICAL_IDENTIFIER');
  });

  it('keeps raw and encoded segment boundaries safe', () => {
    expectInvalid(parseCanonicalSubdivisionPath('sec_15/A'), 'MALFORMED_INPUT');
    expectInvalid(parseCanonicalSubdivisionPath('sec_15/A/par_1'), 'MALFORMED_INPUT');
    expect(subdivisionOf(parseCanonicalSubdivisionPath('sec_15%2FA/par_1')).segments).toHaveLength(2);
  });

  it('reads shared-code paths with their EU reading (no HU inference without sec/spt)', () => {
    expect(parseCanonicalSubdivisionPath('par_1')).toEqual({
      valid: true,
      subdivision: { canonicalPath: 'par_1', segments: [{ code: 'par', value: '1' }] },
    });
  });

  it('rejects non-canonical segment arrays instead of repairing them', () => {
    expect(serializeCanonicalSubdivision([{ code: 'sec', value: '05' }])).toBeNull();
    expect(serializeCanonicalSubdivision([{ code: 'sec', value: '5' }, { code: 'par', value: '02' }])).toBeNull();
    expect(
      serializeCanonicalSubdivision([
        { code: 'sec', value: '5' },
        { code: 'par', value: '1' },
        { code: 'pnt', value: 'B' },
      ]),
    ).toBeNull();
    expect(serializeCanonicalSubdivision([{ code: 'sec', value: '5' }, { code: 'spt', value: 'aa' }])).toBeNull();
    expect(serializeCanonicalSubdivision([{ code: 'sec', value: '5' }, { code: 'art', value: '1' }])).toBeNull();
    expect(serializeCanonicalSubdivision([{ code: 'zzz', value: '5' }])).toBeNull();
    expect(serializeCanonicalSubdivision([])).toBeNull();
    expect(serializeCanonicalSubdivision(null)).toBeNull();
    expect(serializeCanonicalSubdivision(undefined)).toBeNull();
  });

  it('serializes canonical EU and HU segment arrays', () => {
    expect(serializeCanonicalSubdivision([{ code: 'art', value: '28' }, { code: 'par', value: '3' }])).toBe(
      'art_28/par_3',
    );
    expect(
      serializeCanonicalSubdivision([
        { code: 'sec', value: '5' },
        { code: 'par', value: '2' },
        { code: 'pnt', value: 'a' },
        { code: 'spt', value: 'ab' },
      ]),
    ).toBe('sec_5/par_2/pnt_a/spt_ab');
  });

  it('uses the canonical spt subpoint code and never emits subpnt', () => {
    const letterParent = huStructured({ section: '5', paragraph: '2', point: 'a', subpoint: 'aa' });
    const numericParent = huStructured({ section: '5', paragraph: '2', point: '1', subpoint: 'a' });
    expect(letterParent.canonicalPath).toBe('sec_5/par_2/pnt_a/spt_aa');
    expect(numericParent.canonicalPath).toBe('sec_5/par_2/pnt_1/spt_a');
    expect(numericParent.segments).toEqual([
      { code: 'sec', value: '5' },
      { code: 'par', value: '2' },
      { code: 'pnt', value: '1' },
      { code: 'spt', value: 'a' },
    ]);
    for (const output of [letterParent.canonicalPath, numericParent.canonicalPath]) {
      expect(output).not.toContain('/subpnt_');
      expect(output).not.toContain('subpnt');
    }
    expect(readFileSync(MODULE_FILE, 'utf8')).not.toMatch(/subpnt/);
  });
});

/* ------------------------------------------------------------------ */
/*  5. Pure hierarchy helpers                                          */
/* ------------------------------------------------------------------ */

describe('C5B-1 pure hierarchy helpers', () => {
  it('returns EXACT for identical segment arrays', () => {
    expect(compareCanonicalSubdivisions(huLegacy('5/2'), huLegacy('5/2'))).toBe('EXACT');
    expect(compareCanonicalSubdivisions(eli('art_28'), eli('art_28'))).toBe('EXACT');
  });

  it('returns ANCESTOR when the anchor covers the complete change', () => {
    expect(compareCanonicalSubdivisions(huLegacy('5'), huLegacy('5/2'))).toBe('ANCESTOR');
    expect(compareCanonicalSubdivisions(eli('art_28'), eli('art_28/par_3'))).toBe('ANCESTOR');
  });

  it('returns DESCENDANT when the change covers the complete anchor', () => {
    expect(compareCanonicalSubdivisions(huLegacy('5/2/b'), huLegacy('5/2'))).toBe('DESCENDANT');
    expect(compareCanonicalSubdivisions(eli('art_28/par_3/pnt_g'), eli('art_28'))).toBe('DESCENDANT');
  });

  it('excludes siblings and different identifiers', () => {
    expect(compareCanonicalSubdivisions(huLegacy('5/2/b'), huLegacy('5/2/c'))).toBe('NO_MATCH');
    expect(compareCanonicalSubdivisions(eli('art_28/par_2'), eli('art_28/par_3'))).toBe('NO_MATCH');
    expect(compareCanonicalSubdivisions(huLegacy('5'), huLegacy('15'))).toBe('NO_MATCH');
    expect(compareCanonicalSubdivisions(eli('par_1'), eli('par_10'))).toBe('NO_MATCH');
    expect(compareCanonicalSubdivisions(huLegacy('15'), huLegacy('15/A'))).toBe('NO_MATCH');
  });

  it('never matches across source grammars (EU art is not HU sec)', () => {
    expect(compareCanonicalSubdivisions(eli('art_5'), huLegacy('5'))).toBe('NO_MATCH');
  });

  it('implements the mission change/anchor example exactly', () => {
    const change = huLegacy('5/2');
    expect(compareCanonicalSubdivisions(huLegacy('5'), change)).toBe('ANCESTOR');
    expect(compareCanonicalSubdivisions(huLegacy('5/2'), change)).toBe('EXACT');
    expect(compareCanonicalSubdivisions(huLegacy('5/2/b'), change)).toBe('DESCENDANT');
    expect(compareCanonicalSubdivisions(huLegacy('5/3'), change)).toBe('NO_MATCH');
    expect(compareCanonicalSubdivisions(huLegacy('15'), change)).toBe('NO_MATCH');
    expect(compareCanonicalSubdivisions(huLegacy('15/A'), change)).toBe('NO_MATCH');
  });
});

/* ------------------------------------------------------------------ */
/*  6. Closed contract, purity and opt-in                              */
/* ------------------------------------------------------------------ */

describe('C5B-1 closed contract, purity and opt-in', () => {
  it('exposes exactly the seven closed error codes', () => {
    expect([...SUBDIVISION_NORMALIZATION_ERROR_CODES].sort()).toEqual(
      [
        'AMBIGUOUS_LOCATOR',
        'INVALID_HIERARCHY',
        'MALFORMED_INPUT',
        'NON_CANONICAL_IDENTIFIER',
        'UNKNOWN_LEVEL',
        'UNSUPPORTED_IDENTIFIER',
        'UNSUPPORTED_INPUT_FORMAT',
      ].sort(),
    );
  });

  it('exposes the closed relation and Hungarian code vocabularies', () => {
    expect([...SUBDIVISION_RELATIONS].sort()).toEqual(['ANCESTOR', 'DESCENDANT', 'EXACT', 'NO_MATCH'].sort());
    expect([...HU_SUBDIVISION_CODES]).toEqual(['sec', 'par', 'pnt', 'spt']);
  });

  it('never imports the database, the network or the ingestion runtime', () => {
    const source = readFileSync(MODULE_FILE, 'utf8');
    // The logic module imports ONLY the C5A grammar module.
    expect(source).toMatch(/from '\.\/eliGrammar'/);
    expect(source).not.toMatch(/@prisma/i);
    expect(source).not.toMatch(/require\(/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/node:http|node:https|axios/i);
  });

  it('is opt-in: no production module imports the C5B normalizer', () => {
    const importers = collectSourceFiles(SRC_DIR).filter((file) =>
      /subdivisionNormalizer/.test(readFileSync(file, 'utf8')),
    );
    expect(importers).toEqual([]);
  });
});
