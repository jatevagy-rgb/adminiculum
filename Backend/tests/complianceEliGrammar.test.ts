/**
 * C5A — specification tests for the pure Hungarian ELI act + subdivision grammar.
 *
 * Proves paired valid / near-invalid cases for
 *   - Hungarian act references (type code + verified act-identity arity), and
 *   - ELI subdivision paths (segment form + verified EU code set + hierarchy),
 * plus that the module is genuinely pure (no database, no network, no ingestion
 * wiring) and that every vocabulary carries its authoritative source + date.
 *
 * No database is required. This suite does not touch C4A/C4B/C3A runtime paths.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from '@jest/globals';
import {
  ELI_GRAMMAR_ERROR_CODES,
  MAX_SUBDIVISION_DEPTH,
  getEliActTypeDefinition,
  isKnownEliActType,
  isKnownEliSubdivisionCode,
  validateEliActReference,
  validateEliSubdivisionPath,
} from '../src/modules/compliance-doc-intelligence/eliGrammar';
import {
  ELI_ACT_TYPES,
  ELI_ACT_TYPE_SOURCE,
  ELI_ACT_URI_SCHEME_SOURCE,
  ELI_REFERENCE_VERIFIED_ON,
  ELI_SUBDIVISION_CODES,
  ELI_SUBDIVISION_HIERARCHY_RANK,
  ELI_SUBDIVISION_IDENTIFIER_POLICY,
  ELI_SUBDIVISION_SOURCE,
  ELI_UNVERIFIED_ACT_TYPES,
} from '../src/modules/compliance-doc-intelligence/eliReferenceData';

const MODULE_DIR = path.join(__dirname, '..', 'src', 'modules', 'compliance-doc-intelligence');

function expectInvalidAct(value: string | null | undefined, errorCode: string): void {
  expect(validateEliActReference(value)).toEqual({ valid: false, errorCode });
}

function expectInvalidSubdivision(value: string | null | undefined, errorCode: string): void {
  expect(validateEliSubdivisionPath(value)).toEqual({ valid: false, errorCode });
}

/* ------------------------------------------------------------------ */
/*  1. Act references — verified types and arity                       */
/* ------------------------------------------------------------------ */

describe('C5A Hungarian ELI act reference grammar', () => {
  it('accepts the mission act examples with their verified arity', () => {
    expect(validateEliActReference('TV/2001/108')).toEqual({
      valid: true,
      act: {
        typeCode: 'TV',
        identitySegments: [
          { kind: 'year', value: '2001' },
          { kind: 'serial', value: '108' },
        ],
        reference: 'TV/2001/108',
      },
    });
    expect(validateEliActReference('TV/2013/5').valid).toBe(true);

    expect(validateEliActReference('R/2016/IM/21')).toEqual({
      valid: true,
      act: {
        typeCode: 'R',
        identitySegments: [
          { kind: 'year', value: '2016' },
          { kind: 'issuer', value: 'IM' },
          { kind: 'serial', value: '21' },
        ],
        reference: 'R/2016/IM/21',
      },
    });

    expect(validateEliActReference('OR/1992/735616/5')).toEqual({
      valid: true,
      act: {
        typeCode: 'OR',
        identitySegments: [
          { kind: 'year', value: '1992' },
          { kind: 'municipality', value: '735616' },
          { kind: 'serial', value: '5' },
        ],
        reference: 'OR/1992/735616/5',
      },
    });

    expect(validateEliActReference('Alaptv')).toEqual({
      valid: true,
      act: { typeCode: 'Alaptv', identitySegments: [], reference: 'Alaptv' },
    });
  });

  it('accepts every type whose arity the NJT URI scheme proves', () => {
    const samples: Record<string, string> = {
      Alaptv: 'Alaptv',
      ATV_MOD: 'ATV_MOD/4',
      AlapAt: 'AlapAt/2014/56',
      ALK_MOD: 'ALK_MOD/2014/56',
      TV: 'TV/2001/108',
      TVI: 'TVI/2015/12',
      TVR: 'TVR/2015/12',
      HELY: 'HELY/2015/1',
      KOZL: 'KOZL/2015/1',
      H: 'H/2015/KORM/12',
      INTEZK: 'INTEZK/2015/KORM/12',
      POL_NY: 'POL_NY/2015/KORM/12',
      R: 'R/2016/IM/21',
      REK: 'REK/2015/KORM/12',
      UT: 'UT/2014/NFM/30',
      OR: 'OR/1992/735616/5',
    };
    for (const definition of ELI_ACT_TYPES) {
      const sample = samples[definition.code];
      expect(sample).toBeTruthy();
      expect(validateEliActReference(sample).valid).toBe(true);
    }
  });

  it('rejects a wrong segment count without dropping or inventing a segment', () => {
    expectInvalidAct('TV/2001', 'ACT_ARITY_MISMATCH');
    expectInvalidAct('TV/2001/108/EXTRA', 'ACT_ARITY_MISMATCH');
    expectInvalidAct('R/2016/21', 'ACT_ARITY_MISMATCH');
    expectInvalidAct('R/2016/IM', 'ACT_ARITY_MISMATCH');
    expectInvalidAct('R/2016/IM/21/9', 'ACT_ARITY_MISMATCH');
    expectInvalidAct('OR/1992/735616', 'ACT_ARITY_MISMATCH');
    expectInvalidAct('OR/1992/5', 'ACT_ARITY_MISMATCH');
    expectInvalidAct('Alaptv/2020', 'ACT_ARITY_MISMATCH');
    expectInvalidAct('Alaptv/', 'ACT_ARITY_MISMATCH');
  });

  it('rejects an unknown or non-NJT act type instead of guessing one', () => {
    expectInvalidAct('unknown/2001/108', 'UNKNOWN_ACT_TYPE');
    expectInvalidAct('tv/2001/108', 'UNKNOWN_ACT_TYPE');
    // Peter's C4A transport alias is NOT an NJT act type and stays outside this grammar.
    expectInvalidAct('T/2013/5', 'UNKNOWN_ACT_TYPE');
    // NJT publishes these codes but their act-identity arity is not proven.
    for (const unverified of ELI_UNVERIFIED_ACT_TYPES) {
      expectInvalidAct(`${unverified}/2015/1`, 'UNKNOWN_ACT_TYPE');
    }
  });

  it('rejects a malformed identity segment shape rather than repairing it', () => {
    expectInvalidAct('TV/20x1/108', 'ACT_ARITY_MISMATCH');
    expectInvalidAct('TV/200/108', 'ACT_ARITY_MISMATCH');
    expectInvalidAct('R/2016/im/21', 'ACT_ARITY_MISMATCH');
    expectInvalidAct('R/2016/TOOLONGISSUER/21', 'ACT_ARITY_MISMATCH');
    expectInvalidAct('OR/1992/73a616/5', 'ACT_ARITY_MISMATCH');
    expectInvalidAct('TV/2001/108?x=1', 'ACT_ARITY_MISMATCH');
    expectInvalidAct('TV/2001/108#frag', 'ACT_ARITY_MISMATCH');
    expectInvalidAct('TV/ 2001/108', 'ACT_ARITY_MISMATCH');
    expectInvalidAct('TV/2001/10 8', 'ACT_ARITY_MISMATCH');
    expectInvalidAct('', 'UNKNOWN_ACT_TYPE');
    expectInvalidAct('   ', 'UNKNOWN_ACT_TYPE');
    expectInvalidAct(null, 'UNKNOWN_ACT_TYPE');
    expectInvalidAct(undefined, 'UNKNOWN_ACT_TYPE');
  });

  it('does not treat the C4A opaque locator tail as act identity', () => {
    // `TV/2001/108/5/2/b` is a C4A canonical reference, not an act identity: its
    // locator stays opaque and is never folded into or stripped from the act.
    expectInvalidAct('TV/2001/108/5/2/b', 'ACT_ARITY_MISMATCH');
    expectInvalidAct('TV/2001/108/art_5', 'ACT_ARITY_MISMATCH');
    expectInvalidAct('TV/2001/108/', 'ACT_ARITY_MISMATCH');
  });

  it('trims only surrounding transport whitespace', () => {
    expect(validateEliActReference('  TV/2001/108  ')).toEqual({
      valid: true,
      act: {
        typeCode: 'TV',
        identitySegments: [
          { kind: 'year', value: '2001' },
          { kind: 'serial', value: '108' },
        ],
        reference: 'TV/2001/108',
      },
    });
  });

  it('exposes read-only vocabulary queries', () => {
    expect(isKnownEliActType('TV')).toBe(true);
    expect(isKnownEliActType('T')).toBe(false);
    expect(getEliActTypeDefinition('OR')?.identitySegments).toEqual(['year', 'municipality', 'serial']);
    expect(getEliActTypeDefinition('nope')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  2. Subdivision path grammar + hierarchy                            */
/* ------------------------------------------------------------------ */

describe('C5A ELI subdivision path grammar', () => {
  it('accepts the mission subdivision examples', () => {
    expect(validateEliSubdivisionPath('art_5').valid).toBe(true);
    expect(validateEliSubdivisionPath('art_6:59').valid).toBe(true);
    expect(validateEliSubdivisionPath('art_5/par_2').valid).toBe(true);
    expect(validateEliSubdivisionPath('art_5/par_2/pnt_b').valid).toBe(true);
    expect(validateEliSubdivisionPath('anx_1').valid).toBe(true);
  });

  it('parses segments into verified code + bounded identifier', () => {
    expect(validateEliSubdivisionPath('art_6:59/par_2')).toEqual({
      valid: true,
      subdivision: {
        path: 'art_6:59/par_2',
        segments: [
          { code: 'art', identifier: '6:59', hierarchyRank: 80 },
          { code: 'par', identifier: '2', hierarchyRank: 90 },
        ],
      },
    });
  });

  it('requires a canonical identifier: a bare numbered code is not an identity', () => {
    expectInvalidSubdivision('art', 'MALFORMED_SUBDIVISION_SEGMENT');
    expectInvalidSubdivision('par', 'MALFORMED_SUBDIVISION_SEGMENT');
    expectInvalidSubdivision('pnt', 'MALFORMED_SUBDIVISION_SEGMENT');
    expectInvalidSubdivision('anx', 'MALFORMED_SUBDIVISION_SEGMENT');
    expectInvalidSubdivision('unp', 'MALFORMED_SUBDIVISION_SEGMENT');
    // A validator never expands a bare code; the same codes with an identifier stay valid.
    expect(validateEliSubdivisionPath('art_5').valid).toBe(true);
    expect(validateEliSubdivisionPath('anx_1').valid).toBe(true);
    expect(validateEliSubdivisionPath('unp_1').valid).toBe(true);
  });

  it('requires the deterministic `_1` form for singleton structural codes', () => {
    for (const code of ['pbl', 'enc', 'wrp', 'inp', 'toc', 'tit']) {
      expectInvalidSubdivision(code, 'MALFORMED_SUBDIVISION_SEGMENT');
      expect(validateEliSubdivisionPath(`${code}_1`).valid).toBe(true);
      expectInvalidSubdivision(`${code}_2`, 'MALFORMED_SUBDIVISION_SEGMENT');
      expectInvalidSubdivision(`${code}_01`, 'MALFORMED_SUBDIVISION_SEGMENT');
    }
    expect(validateEliSubdivisionPath('pbl_1')).toEqual({
      valid: true,
      subdivision: {
        path: 'pbl_1',
        segments: [{ code: 'pbl', identifier: '1', hierarchyRank: 10 }],
      },
    });
  });

  it('uses `tis` as the structural title and never `tit`', () => {
    // Authoritative EU labels (20260617-0): TIS = "title (subdivision)", TIT = "title".
    expect(ELI_SUBDIVISION_HIERARCHY_RANK.tis).toBe(50);
    expect(ELI_SUBDIVISION_HIERARCHY_RANK.tit).toBeUndefined();
    expect(validateEliSubdivisionPath('prt_I/tis_II/cpt_III/sct_IV/art_1').valid).toBe(true);
    // `tit` is a known code in canonical `_1` form, but order-neutral: not structural.
    expect(validateEliSubdivisionPath('tit_1')).toEqual({
      valid: true,
      subdivision: {
        path: 'tit_1',
        segments: [{ code: 'tit', identifier: '1', hierarchyRank: null }],
      },
    });
  });

  it('accepts a path up to the maximum depth and rejects one segment more', () => {
    const atDepth = 'prt_I/tis_II/cpt_III/sct_IV/sbs_V/art_1';
    expect(atDepth.split('/')).toHaveLength(MAX_SUBDIVISION_DEPTH);
    expect(validateEliSubdivisionPath(atDepth).valid).toBe(true);

    expectInvalidSubdivision('prt_I/tis_II/cpt_III/sct_IV/sbs_V/art_1/par_2', 'SUBDIVISION_TOO_DEEP');
    expectInvalidSubdivision('art_5/par_2/pnt_b/sub_c/pnt_d/idt_e/pnt_f', 'SUBDIVISION_TOO_DEEP');
  });

  it('rejects a malformed segment instead of repairing it', () => {
    expectInvalidSubdivision('xxxx_5', 'MALFORMED_SUBDIVISION_SEGMENT');
    expectInvalidSubdivision('ar_5', 'MALFORMED_SUBDIVISION_SEGMENT');
    expectInvalidSubdivision('ART_5', 'MALFORMED_SUBDIVISION_SEGMENT');
    expectInvalidSubdivision('art_', 'MALFORMED_SUBDIVISION_SEGMENT');
    expectInvalidSubdivision('art_5//par_2', 'MALFORMED_SUBDIVISION_SEGMENT');
    expectInvalidSubdivision('art_5/', 'MALFORMED_SUBDIVISION_SEGMENT');
    expectInvalidSubdivision('/art_5', 'MALFORMED_SUBDIVISION_SEGMENT');
    expectInvalidSubdivision('art_5/ /par_2', 'MALFORMED_SUBDIVISION_SEGMENT');
    expectInvalidSubdivision('art_5?x=1', 'MALFORMED_SUBDIVISION_SEGMENT');
    expectInvalidSubdivision('', 'MALFORMED_SUBDIVISION_SEGMENT');
    expectInvalidSubdivision(null, 'MALFORMED_SUBDIVISION_SEGMENT');
  });

  it('rejects a code outside the verified EU subdivision vocabulary', () => {
    expectInvalidSubdivision('zzz_5', 'UNKNOWN_SUBDIVISION_CODE');
    expectInvalidSubdivision('zzz_5/art_5', 'UNKNOWN_SUBDIVISION_CODE');
    // `OP_DATPRO` is the one EU scheme code excluded from the 3-letter segment form.
    expectInvalidSubdivision('op_datpro', 'MALFORMED_SUBDIVISION_SEGMENT');
    expect(isKnownEliSubdivisionCode('art')).toBe(true);
    expect(isKnownEliSubdivisionCode('OP_DATPRO')).toBe(false);
  });

  it('rejects a parent-level subdivision that appears after a child-level one', () => {
    expectInvalidSubdivision('pnt_b/art_5', 'SUBDIVISION_HIERARCHY_VIOLATION');
    expectInvalidSubdivision('par_2/art_5', 'SUBDIVISION_HIERARCHY_VIOLATION');
    expectInvalidSubdivision('pnt_b/par_2', 'SUBDIVISION_HIERARCHY_VIOLATION');
    expectInvalidSubdivision('art_5/art_6', 'SUBDIVISION_HIERARCHY_VIOLATION');
    expectInvalidSubdivision('par_1/par_2', 'SUBDIVISION_HIERARCHY_VIOLATION');
    expectInvalidSubdivision('art_5/par_2/pnt_b/par_3', 'SUBDIVISION_HIERARCHY_VIOLATION');
    expectInvalidSubdivision('art_5/anx_1', 'SUBDIVISION_HIERARCHY_VIOLATION');
  });

  it('accepts a deeper parent-to-child chain in order', () => {
    for (const subdivisionPath of [
      'art_5/par_2/pnt_b',
      'art_5/par_2/pnt_b/sub_c',
      'art_5/par_2/pnt_b/idt_c',
      'anx_1/art_5/par_1/pnt_a',
      'prt_I/tis_II/cpt_III/sct_IV/art_1',
      'prt_I/cpt_II/sct_III/art_1/par_1/pnt_a',
    ]) {
      expect(validateEliSubdivisionPath(subdivisionPath).valid).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  3. Purity + closed error contract                                  */
/* ------------------------------------------------------------------ */

describe('C5A module purity and closed error contract', () => {
  it('exposes exactly the six closed error codes', () => {
    expect([...ELI_GRAMMAR_ERROR_CODES].sort()).toEqual(
      [
        'ACT_ARITY_MISMATCH',
        'MALFORMED_SUBDIVISION_SEGMENT',
        'SUBDIVISION_HIERARCHY_VIOLATION',
        'SUBDIVISION_TOO_DEEP',
        'UNKNOWN_ACT_TYPE',
        'UNKNOWN_SUBDIVISION_CODE',
      ].sort(),
    );
  });

  it('never imports the database, the network or the ingestion runtime', () => {
    const grammar = readFileSync(path.join(MODULE_DIR, 'eliGrammar.ts'), 'utf8');
    const data = readFileSync(path.join(MODULE_DIR, 'eliReferenceData.ts'), 'utf8');

    // The logic module imports ONLY the data module.
    expect(grammar).toMatch(/from '\.\/eliReferenceData'/);
    for (const source of [grammar, data]) {
      expect(source).not.toMatch(/@prisma/i);
      expect(source).not.toMatch(/require\(/);
      expect(source).not.toMatch(/\bfetch\s*\(/);
      expect(source).not.toMatch(/node:http|node:https|axios/i);
      // The data module is inert: it must import nothing at all.
      if (source === data) expect(source).not.toMatch(/^import\s/m);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  4. Vocabulary integrity + source of truth                          */
/* ------------------------------------------------------------------ */

describe('C5A reference vocabulary integrity', () => {
  it('keeps act type codes unique and subdivision codes 3-letter lowercase', () => {
    const codes = ELI_ACT_TYPES.map((definition) => definition.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);

    expect(ELI_SUBDIVISION_CODES.length).toBeGreaterThan(0);
    expect(new Set(ELI_SUBDIVISION_CODES).size).toBe(ELI_SUBDIVISION_CODES.length);
    for (const code of ELI_SUBDIVISION_CODES) expect(code).toMatch(/^[a-z]{3}$/);
  });

  it('verifies every subdivision code used by the hierarchy rank table', () => {
    for (const [code, rank] of Object.entries(ELI_SUBDIVISION_HIERARCHY_RANK)) {
      expect(ELI_SUBDIVISION_CODES).toContain(code);
      expect(Number.isInteger(rank)).toBe(true);
      expect(rank).toBeGreaterThan(0);
    }
  });

  it('keeps the identifier requirement data-driven with a fail-closed default', () => {
    for (const [code, policy] of Object.entries(ELI_SUBDIVISION_IDENTIFIER_POLICY)) {
      expect(ELI_SUBDIVISION_CODES).toContain(code);
      expect(['REQUIRED', 'FIXED_ONE', 'OPTIONAL']).toContain(policy.requirement);
      expect(['EU', 'ADMINICULUM_CANONICALIZATION_POLICY']).toContain(policy.source);
      expect(policy.note).toBeTruthy();
    }
    // The deterministic `_1` singleton rule is an Adminiculum policy, not an EU fact.
    for (const code of ['pbl', 'enc', 'wrp', 'inp', 'toc', 'tit']) {
      expect(ELI_SUBDIVISION_IDENTIFIER_POLICY[code]).toMatchObject({
        requirement: 'FIXED_ONE',
        fixedIdentifier: '1',
        source: 'ADMINICULUM_CANONICALIZATION_POLICY',
      });
    }
    // A verified EU code with no policy entry falls back to REQUIRED (fail closed).
    expect(ELI_SUBDIVISION_IDENTIFIER_POLICY.ace).toBeUndefined();
    expectInvalidSubdivision('ace', 'MALFORMED_SUBDIVISION_SEGMENT');
    expect(validateEliSubdivisionPath('ace_1').valid).toBe(true);
  });

  it('verifies every candidate code named by the design', () => {
    for (const candidate of ['prt', 'cpt', 'tis', 'sct', 'art', 'par', 'unp', 'pnt', 'idt', 'anx', 'pbl', 'tit']) {
      expect(isKnownEliSubdivisionCode(candidate)).toBe(true);
    }
  });

  it('keeps unverified act types out of the accepted registry', () => {
    for (const unverified of ELI_UNVERIFIED_ACT_TYPES) {
      expect(ELI_ACT_TYPES.some((definition) => definition.code === unverified)).toBe(false);
    }
  });

  it('records the authoritative source and the verification date', () => {
    expect(ELI_REFERENCE_VERIFIED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ELI_ACT_TYPE_SOURCE.url).toContain('njt.hu/eli/tipuskodok');
    expect(ELI_ACT_URI_SCHEME_SOURCE.url).toContain('njt.hu/eli/urisemak');
    expect(ELI_SUBDIVISION_SOURCE.url).toContain('publications.europa.eu/resource/authority/subdivision');
    expect(ELI_SUBDIVISION_SOURCE.version).toBe('20260617-0');
  });
});
