/**
 * C4A — canonical legal hyperlink transport (additive to the ADM transport).
 *
 * Proves the hyperlink alternative for rows that carry NO ADM anchor control:
 *   - exact `TV/<year>/<act>[/<opaque-tail>]` and the
 *     `https://ref.adminiculum.hu/...` wrapper normalize to one canonical ref;
 *   - the locator tail stays opaque;
 *   - ordinary / malformed links never become anchors;
 *   - a legacy ADM anchor control always wins and is never duplicated;
 *   - multiple canonical hyperlinks in one row produce deterministic rows;
 *   - the digest payload is unchanged (no backfill / no drift on re-ingest);
 *   - C3A stays exact-CELEX-only and nothing reaches a customer surface.
 *
 * No database is required.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from '@jest/globals';
import {
  canonicalReferenceFromAnchorKey,
  parseCanonicalLegalReference,
} from '../src/modules/compliance-doc-intelligence/canonicalLegalReference';
import {
  computeRowDigest,
  normalizeExtractedRow,
  buildAnchorKey,
} from '../src/modules/compliance-doc-intelligence/normalize';
import { parseComplianceMasterDocx } from '../src/modules/compliance-doc-intelligence/extractClauseAnchors';
import { resolveCelexBindings } from '../src/modules/compliance-doc-intelligence/legalSourceBinding';
import type { ExtractedClauseAnchorRow } from '../src/modules/compliance-doc-intelligence/types';
import {
  cell,
  cellWithControls,
  cellWithRaw,
  docxRow,
  documentRelsXml,
  hyperlink,
  legalRowXml,
  masterDocxBuffer,
  masterDocxBufferWithRels,
  sdt,
} from './helpers/complianceMasterDocxFixture';

/* ------------------------------------------------------------------ */
/*  1. The canonical reference parser                                  */
/* ------------------------------------------------------------------ */

describe('C4A canonical legal reference parsing', () => {
  it('normalizes the raw TV form and keeps the locator opaque', () => {
    expect(parseCanonicalLegalReference('TV/2001/108/5/2/b')).toEqual({
      canonicalReference: 'TV/2001/108/5/2/b',
      sourceReference: 'TV/2001/108',
      locator: '5/2/b',
    });
  });

  it('normalizes the ref.adminiculum.hu wrapper to the same canonical reference', () => {
    expect(parseCanonicalLegalReference('https://ref.adminiculum.hu/TV/2001/108/5/2/b')).toEqual({
      canonicalReference: 'TV/2001/108/5/2/b',
      sourceReference: 'TV/2001/108',
      locator: '5/2/b',
    });
  });

  it('collapses surrounding whitespace only', () => {
    expect(parseCanonicalLegalReference('  TV/2001/108  ')?.canonicalReference).toBe('TV/2001/108');
    expect(parseCanonicalLegalReference('  TV/2001/108  ')?.locator).toBeNull();
  });

  it('keeps non-simple legal notation verbatim instead of interpreting it', () => {
    // `15/A` is opaque: it is preserved, never converted to another syntax.
    const parsed = parseCanonicalLegalReference('TV/1996/1/15/A');
    expect(parsed?.locator).toBe('15/A');
    expect(parsed?.canonicalReference).toBe('TV/1996/1/15/A');
  });

  it('rejects malformed, ambiguous or non-canonical values', () => {
    for (const value of [
      null,
      undefined,
      '',
      '   ',
      'TV/foo/bar',
      'TV/2001',
      'TV/2001/',
      'TV/2001/108/',
      'TV/2001/108//5',
      'tv/2001/108',
      'https://example.com/foo',
      'https://ref.adminiculum.hu/TV/foo/bar',
      'https://ref.adminiculum.hu/other/TV/2001/108',
      'TV/2001/108/5?x=1',
      'TV/2001/108#frag',
      'TV/2001/108 /5',
      `TV/2001/108/${'x'.repeat(80)}`,
      `TV/2001/108/${'9'.repeat(300)}`,
    ]) {
      expect(parseCanonicalLegalReference(value as string)).toBeNull();
    }
  });

  it('derives the DTO reference only from a fully valid anchor key', () => {
    expect(canonicalReferenceFromAnchorKey('LEGAL|REF=TV/2001/108/5/2/b')).toBe('TV/2001/108/5/2/b');
    expect(canonicalReferenceFromAnchorKey('LEGAL|REF=TV/foo/bar')).toBeNull();
    expect(canonicalReferenceFromAnchorKey('LEGAL|SID=la_x')).toBeNull();
    expect(canonicalReferenceFromAnchorKey(null)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  2. End-to-end extraction through a real DOCX package               */
/* ------------------------------------------------------------------ */

const RID_A = 'rIdTvRaw';
const RID_B = 'rIdTvWrapped';
const RID_ORDINARY = 'rIdOrdinary';
const RID_MALFORMED = 'rIdMalformed';

const TV_TEXT = 'Eker. tv. 5. § (2) b) pont';

function hyperlinkRow(cells: string[]): string {
  return docxRow(cells);
}

function clauseCell(clause = '5.2.', id = 'cl_tv') {
  return cellWithControls('', [sdt('ADM-CLAUSE', id, `Clause ${clause}`, clause)]);
}

function relationCell(relation = 'MANDATORY_BASIS', id = 'rel_tv') {
  return cellWithControls('', [sdt('ADM-RELTYPE', id, relation, relation)]);
}

async function parseHyperlinkRow(rowXml: string, targets: Array<{ id: string; target: string }>) {
  const rels = documentRelsXml(targets.map((entry) => ({ id: entry.id, target: entry.target, targetMode: 'External' })));
  return parseComplianceMasterDocx(await masterDocxBufferWithRels(rowXml, rels));
}

describe('C4A hyperlink-derived legal anchors', () => {
  it('A: anchors a row with no ADM anchor control from the raw TV target', async () => {
    const outcome = await parseHyperlinkRow(
      hyperlinkRow([clauseCell(), relationCell(), cellWithRaw('', hyperlink(RID_A, TV_TEXT)), cell('Indok.')]),
      [{ id: RID_A, target: 'TV/2001/108/5/2/b' }],
    );
    expect(outcome.rows).toHaveLength(1);
    const row = outcome.rows[0];
    expect(row.anchorType).toBe('LEGAL');
    expect(row.anchorDisplay).toBe(TV_TEXT);
    expect(row.anchorStableId).toBeNull();
    expect(row.eli).toBeNull();
    expect(row.celex).toBeNull();
    expect(row.ecli).toBeNull();
    expect(row.caseId).toBeNull();
    expect(row.decisionId).toBeNull();
    expect(row.locator).toBe('5/2/b');
    expect(row.canonicalReference).toBe('TV/2001/108/5/2/b');
    const normalized = normalizeExtractedRow(row);
    expect(normalized.anchorKey).toBe('LEGAL|REF=TV/2001/108/5/2/b');
    expect(normalized.sourceUrl).toBeNull();
    // The transport observation is an extraction-level (row) warning.
    expect(outcome.warnings).toContain('HYPERLINK_LEGAL_ANCHOR_USED');
    // The visible text is display only and never part of the identity.
    expect(String(normalized.anchorKey)).not.toContain('Eker');
    expect(outcome.stats.hyperlinkLegalAnchors).toBe(1);
  });

  it('B: the ref.adminiculum.hu wrapper yields the same canonical anchor', async () => {
    const outcome = await parseHyperlinkRow(
      hyperlinkRow([clauseCell(), relationCell(), cellWithRaw('', hyperlink(RID_B, TV_TEXT)), cell('')]),
      [{ id: RID_B, target: 'https://ref.adminiculum.hu/TV/2001/108/5/2/b' }],
    );
    expect(outcome.rows).toHaveLength(1);
    expect(normalizeExtractedRow(outcome.rows[0]).anchorKey).toBe('LEGAL|REF=TV/2001/108/5/2/b');
  });

  it('C: an ordinary hyperlink never becomes a compliance legal anchor', async () => {
    const outcome = await parseHyperlinkRow(
      hyperlinkRow([clauseCell(), relationCell(), cellWithRaw('', hyperlink(RID_ORDINARY, 'Example')), cell('')]),
      [{ id: RID_ORDINARY, target: 'https://example.com/foo' }],
    );
    expect(outcome.rows).toHaveLength(0);
    expect(outcome.stats.hyperlinkLegalAnchors).toBe(0);
    expect(outcome.warnings.some((warning) => warning.startsWith('ROW_WITHOUT_ANCHOR_CONTROL'))).toBe(true);
  });

  it('D: a malformed TV-like target is not promoted to an anchor', async () => {
    const outcome = await parseHyperlinkRow(
      hyperlinkRow([clauseCell(), relationCell(), cellWithRaw('', hyperlink(RID_MALFORMED, 'Eker. tv.')), cell('')]),
      [{ id: RID_MALFORMED, target: 'TV/foo/bar' }],
    );
    expect(outcome.rows).toHaveLength(0);
    expect(outcome.stats.hyperlinkLegalAnchors).toBe(0);
  });

  it('E: an existing ADM anchor control wins — no hyperlink duplicate', async () => {
    const row = docxRow([
      clauseCell(),
      relationCell(),
      cellWithRaw(
        '',
        sdt('ADM-LEGALANCHOR', 'la_legacy', 'JOGSZABALY | Eker. tv. 5. §', 'Eker. tv. 5. §') +
          sdt('ADM-LOCATOR', 'la_legacy', 'Locator | 5/2/b', '5/2/b') +
          hyperlink(RID_A, TV_TEXT),
      ),
      cell('Regi kontrollal jelolt sor.'),
    ]);
    const outcome = await parseHyperlinkRow(row, [{ id: RID_A, target: 'TV/2001/108/5/2/b' }]);
    expect(outcome.rows).toHaveLength(1);
    const normalized = normalizeExtractedRow(outcome.rows[0]);
    expect(normalized.anchorType).toBe('LEGAL');
    expect(normalized.anchorStableId).toBe('la_legacy');
    expect(normalized.anchorKey).toBe('LEGAL|SID=la_legacy');
    expect(normalized.canonicalReference).toBeNull();
    expect(outcome.stats.hyperlinkLegalAnchors).toBe(0);
  });

  it('F: two canonical hyperlinks in one row produce two deterministic rows', async () => {
    const row = hyperlinkRow([
      clauseCell(),
      relationCell(),
      cellWithRaw('', hyperlink(RID_A, 'Eker. tv. 5. § (2) b)') + hyperlink(RID_B, 'Ptk. 6:59. §')),
      cell(''),
    ]);
    const outcome = await parseHyperlinkRow(row, [
      { id: RID_A, target: 'TV/2001/108/5/2/b' },
      { id: RID_B, target: 'https://ref.adminiculum.hu/TV/1959/4/6/59' },
    ]);
    expect(outcome.rows).toHaveLength(2);
    expect(outcome.rows.map((row) => normalizeExtractedRow(row).anchorKey)).toEqual([
      'LEGAL|REF=TV/2001/108/5/2/b',
      'LEGAL|REF=TV/1959/4/6/59',
    ]);
    expect(outcome.rows.map((row) => row.anchorDisplay)).toEqual(['Eker. tv. 5. § (2) b)', 'Ptk. 6:59. §']);
    expect(outcome.stats.hyperlinkLegalAnchors).toBe(2);
    // Deterministic: a repeated identical target is not duplicated.
    const repeated = await parseHyperlinkRow(
      hyperlinkRow([clauseCell(), relationCell(), cellWithRaw('', hyperlink(RID_A, 'a') + hyperlink(RID_B, 'b')), cell('')]),
      [
        { id: RID_A, target: 'TV/2001/108/5/2/b' },
        { id: RID_B, target: 'TV/2001/108/5/2/b' },
      ],
    );
    expect(repeated.rows).toHaveLength(1);
  });

  it('keeps the ADM relation transport, including the explicit missing state', async () => {
    const outcome = await parseHyperlinkRow(
      hyperlinkRow([clauseCell(), cell(''), cellWithRaw('', hyperlink(RID_A, TV_TEXT)), cell('')]),
      [{ id: RID_A, target: 'TV/2001/108/5/2/b' }],
    );
    expect(outcome.rows).toHaveLength(1);
    expect(outcome.rows[0].relationTypeRaw).toBeNull();
    const normalized = normalizeExtractedRow(outcome.rows[0]);
    expect(normalized.relationType).toBe('UNSPECIFIED');
    expect(normalized.warnings).toContain('RELATION_TYPE_MISSING');
  });

  it('never creates an anchor for a row without an ADM-CLAUSE association', async () => {
    const outcome = await parseHyperlinkRow(
      hyperlinkRow([cell('nincs kontroll'), relationCell(), cellWithRaw('', hyperlink(RID_A, TV_TEXT)), cell('')]),
      [{ id: RID_A, target: 'TV/2001/108/5/2/b' }],
    );
    expect(outcome.rows).toHaveLength(0);
    expect(outcome.warnings.some((warning) => warning.startsWith('ROW_WITHOUT_CLAUSE_CONTROL'))).toBe(true);
  });

  it('reports an unresolvable relationship instead of inventing a target', async () => {
    const outcome = await parseHyperlinkRow(
      hyperlinkRow([clauseCell(), relationCell(), cellWithRaw('', hyperlink('rIdMissing', TV_TEXT)), cell('')]),
      [{ id: RID_A, target: 'TV/2001/108/5/2/b' }],
    );
    expect(outcome.rows).toHaveLength(0);
    expect(outcome.warnings.some((warning) => warning.startsWith('HYPERLINK_RELATIONSHIP_UNRESOLVED'))).toBe(true);
  });

  it('reports a canonical hyperlink with no visible text instead of inventing a display', async () => {
    const outcome = await parseHyperlinkRow(
      hyperlinkRow([clauseCell(), relationCell(), cellWithRaw('', hyperlink(RID_A, '   ')), cell('')]),
      [{ id: RID_A, target: 'TV/2001/108/5/2/b' }],
    );
    expect(outcome.rows).toHaveLength(0);
    expect(outcome.warnings).toContain('HYPERLINK_LEGAL_ANCHOR_NO_DISPLAY:row=0');
  });
});

/* ------------------------------------------------------------------ */
/*  3. Backward compatibility of the ADM transport                     */
/* ------------------------------------------------------------------ */

describe('C4A preserves the existing ADM transport', () => {
  it('keeps the canonical ADM row and its hardcoded digest byte-identical', async () => {
    const outcome = await parseComplianceMasterDocx(await masterDocxBuffer(legalRowXml()));
    expect(outcome.rows).toHaveLength(1);
    const normalized = normalizeExtractedRow(outcome.rows[0]);
    expect(normalized.anchorKey).toBe('LEGAL|SID=la_baa4796f2169');
    expect(normalized.canonicalReference).toBeNull();
    // Baseline captured BEFORE the C4A change: the digest payload is unchanged.
    expect(computeRowDigest(normalized)).toBe('b1a69bcd5359422e3808cbc74cb14014533a114a621dd7c694cf2168aa72574e');
  });

  it('keeps an unresolved ADM legal row and an AUTHORITY row at their baseline digests', () => {
    const base: ExtractedClauseAnchorRow = {
      clauseRef: '3.1.',
      clauseTitle: null,
      clauseStableId: null,
      relationTypeRaw: null,
      anchorType: 'LEGAL',
      anchorDisplay: 'GDPR 6. cikk (1)',
      anchorStableId: null,
      eli: null,
      celex: null,
      locator: null,
      ecli: null,
      caseId: null,
      caseLocator: null,
      decisionId: null,
      authorityLocator: null,
      sourceUrl: null,
      rationale: null,
      warnings: [],
    };
    const unresolved = normalizeExtractedRow(base);
    expect(unresolved.anchorKey).toBeNull();
    expect(computeRowDigest(unresolved)).toBe('6e2f540a432462e472e6b3699fe98e7011274ee0794306f7ae578064dc945c36');

    const authority = normalizeExtractedRow({
      ...base,
      anchorType: 'AUTHORITY',
      anchorDisplay: 'NAIH-19-18/2024',
      decisionId: 'NAIH-19-18/2024',
      authorityLocator: 'paras=217-241',
    });
    expect(computeRowDigest(authority)).toBe('16f0e5fb764d8377b88944312cb2b5c36525d343219ece03f302827b252ade1f');
  });

  it('keeps the legacy ELECT precedence when no canonical reference is present', () => {
    expect(
      buildAnchorKey({
        anchorType: 'LEGAL',
        anchorStableId: null,
        eli: 'http://data.europa.eu/eli/reg/2016/679/oj',
        celex: '32016R0679',
        locator: 'art=28;par=3',
        ecli: null,
        caseId: null,
        caseLocator: null,
        decisionId: null,
        authorityLocator: null,
      }).key,
    ).toBe('LEGAL|ELI=http://data.europa.eu/eli/reg/2016/679/oj|LOC=art=28;par=3');
  });

  it('only lets a REVALIDATED canonical reference form the key', () => {
    const input = {
      anchorType: 'LEGAL' as const,
      anchorStableId: null,
      eli: null,
      celex: null,
      locator: null,
      ecli: null,
      caseId: null,
      caseLocator: null,
      decisionId: null,
      authorityLocator: null,
    };
    expect(buildAnchorKey({ ...input, canonicalReference: 'TV/2001/108/5/2/b' }).key).toBe('LEGAL|REF=TV/2001/108/5/2/b');
    expect(buildAnchorKey({ ...input, canonicalReference: 'TV/foo/bar' }).key).toBeNull();
    // The stable ADM id still wins over a hyperlink-derived reference.
    expect(buildAnchorKey({ ...input, anchorStableId: 'la_x', canonicalReference: 'TV/2001/108' }).key).toBe('LEGAL|SID=la_x');
  });
});

/* ------------------------------------------------------------------ */
/*  4. C3A boundary + customer isolation                               */
/* ------------------------------------------------------------------ */

describe('C4A respects the C3A and customer boundaries', () => {
  it('leaves a TV-anchored row unbound under the exact-CELEX C3A resolver', async () => {
    const outcome = await parseHyperlinkRow(
      hyperlinkRow([clauseCell(), relationCell(), cellWithRaw('', hyperlink(RID_A, TV_TEXT)), cell('')]),
      [{ id: RID_A, target: 'TV/2001/108/5/2/b' }],
    );
    const normalized = normalizeExtractedRow(outcome.rows[0]);
    const bindings = await resolveCelexBindings([{ key: 'row-1', row: normalized }], {} as never);
    expect(bindings.get('row-1')).toMatchObject({ status: 'UNRESOLVED', reason: 'NO_CELEX' });
  });

  it('never exposes the canonical reference through a customer-safe compliance module', () => {
    const root = path.join(__dirname, '..', 'src', 'modules', 'compliance');
    for (const file of ['clientSafeComplianceService.ts', 'clientSafeComplianceRoutes.ts']) {
      const source = readFileSync(path.join(root, file), 'utf8');
      expect(source).not.toMatch(/canonicalReference|ref\.adminiculum|TV\/|anchorKey/);
    }
  });
});
