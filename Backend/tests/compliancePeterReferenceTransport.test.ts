/**
 * C4A compatibility — Peter's `T/...` legal reference transport alias.
 *
 * Peter's external machine-reference format (`T/<year>/<act>/<opaque-locator>`,
 * e.g. `T/2013/5/6:59/2`) is accepted as an INPUT TRANSPORT ALIAS and normalized
 * to the existing canonical `TV/...` namespace, so persisted anchor keys, C4B
 * identifier families and NJT ELI deduplication are unchanged. `T` is never
 * persisted as a source and is never emitted as a monitoring identifier family.
 *
 * The opaque locator may contain `:` (e.g. `6:59`, `5:12`) and is preserved
 * byte-for-byte — it is never rewritten into another syntax.
 */
import { describe, expect, it } from '@jest/globals';
import { parseCanonicalLegalReference } from '../src/modules/compliance-doc-intelligence/canonicalLegalReference';
import { parseComplianceMasterDocx } from '../src/modules/compliance-doc-intelligence/extractClauseAnchors';
import { normalizeExtractedRow } from '../src/modules/compliance-doc-intelligence/normalize';
import { projectMonitoringManifest } from '../src/modules/compliance-doc-intelligence/monitoringManifest';
import {
  cell,
  cellWithControls,
  cellWithRaw,
  docxRow,
  documentRelsXml,
  hyperlink,
  masterDocxBufferWithRels,
  sdt,
  sdtTwoLine,
  SHARED_LEGAL_ANCHOR_ID,
  type RelationshipEntry,
} from './helpers/complianceMasterDocxFixture';

const RELATION = 'MANDATORY_BASIS';

/* ------------------------------------------------------------------ */
/*  Parser-level transport alias coverage                              */
/* ------------------------------------------------------------------ */

describe('C4A Peter transport alias (T/...)', () => {
  it('A. normalizes T/2013/5/5:12 to the canonical TV namespace', () => {
    expect(parseCanonicalLegalReference('T/2013/5/5:12')).toEqual({
      canonicalReference: 'TV/2013/5/5:12',
      sourceReference: 'TV/2013/5',
      locator: '5:12',
    });
  });

  it('B. keeps a deeper opaque locator byte-for-byte', () => {
    expect(parseCanonicalLegalReference('T/2013/5/6:59/2')).toEqual({
      canonicalReference: 'TV/2013/5/6:59/2',
      sourceReference: 'TV/2013/5',
      locator: '6:59/2',
    });
  });

  it('C. accepts the same colon locator with the canonical TV prefix', () => {
    expect(parseCanonicalLegalReference('TV/2013/5/6:59/2')).toEqual({
      canonicalReference: 'TV/2013/5/6:59/2',
      sourceReference: 'TV/2013/5',
      locator: '6:59/2',
    });
  });

  it('D. accepts the ref.adminiculum.hu T wrapper', () => {
    expect(parseCanonicalLegalReference('https://ref.adminiculum.hu/T/2013/5/6:59/2')).toEqual({
      canonicalReference: 'TV/2013/5/6:59/2',
      sourceReference: 'TV/2013/5',
      locator: '6:59/2',
    });
  });

  it('E. leaves the existing TV reference byte-for-byte identical', () => {
    const parsed = parseCanonicalLegalReference('TV/2001/108/5/2/b');
    expect(parsed).toEqual({
      canonicalReference: 'TV/2001/108/5/2/b',
      sourceReference: 'TV/2001/108',
      locator: '5/2/b',
    });
  });

  it('F. leaves the existing TV wrapper byte-for-byte identical', () => {
    expect(parseCanonicalLegalReference('https://ref.adminiculum.hu/TV/2001/108/5/2/b')).toEqual({
      canonicalReference: 'TV/2001/108/5/2/b',
      sourceReference: 'TV/2001/108',
      locator: '5/2/b',
    });
  });

  it('G/H. rejects a malformed year or act number', () => {
    expect(parseCanonicalLegalReference('T/foo/5/6:59')).toBeNull();
    expect(parseCanonicalLegalReference('T/2013/foo/6:59')).toBeNull();
  });

  it('I. still rejects query strings, fragments, whitespace and other hosts', () => {
    expect(parseCanonicalLegalReference('T/2013/5/6:59?x=1')).toBeNull();
    expect(parseCanonicalLegalReference('T/2013/5/6:59#frag')).toBeNull();
    expect(parseCanonicalLegalReference('T/2013/5/ 6:59')).toBeNull();
    expect(parseCanonicalLegalReference('https://example.com/T/2013/5/6:59/2')).toBeNull();
    expect(parseCanonicalLegalReference('T/2013/5/')).toBeNull();
    expect(parseCanonicalLegalReference('T/2013/5/6:59//2')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  Structural DOCX transport                                          */
/* ------------------------------------------------------------------ */

function peterRow(links: Array<{ rid: string; text: string }>, extraCell?: string): string {
  return docxRow([
    cellWithControls('', [sdt('ADM-CLAUSE', 'cl_peter', 'Clause 6:59. § (2)', '6:59. § (2)')]),
    cellWithControls('', [sdtTwoLine('ADM-RELTYPE', 'rel_peter', RELATION, [RELATION])]),
    cellWithRaw('', links.map((link) => hyperlink(link.rid, link.text)).join('')),
    cell(extraCell ?? ''),
  ]);
}

async function parseRows(rowsXml: string, rels: RelationshipEntry[]) {
  const buffer = await masterDocxBufferWithRels(rowsXml, documentRelsXml(rels));
  return parseComplianceMasterDocx(buffer);
}

describe('C4A Peter transport — structural DOCX behaviour', () => {
  it('J. derives one LEGAL relation from a T/... hyperlink target', async () => {
    const outcome = await parseRows(peterRow([{ rid: 'rId1', text: 'Ptk. 6:59. § (2)' }]), [
      { id: 'rId1', target: 'T/2013/5/6:59/2', targetMode: 'External' },
    ]);

    expect(outcome.rows).toHaveLength(1);
    const row = outcome.rows[0];
    expect(row.anchorType).toBe('LEGAL');
    expect(row.anchorDisplay).toBe('Ptk. 6:59. § (2)');
    expect(row.anchorStableId).toBeNull();
    expect(row.canonicalReference).toBe('TV/2013/5/6:59/2');
    expect(row.locator).toBe('6:59/2');
    expect(row.sourceUrl).toBeNull();

    const normalized = normalizeExtractedRow(row);
    expect(normalized.anchorKey).toBe('LEGAL|REF=TV/2013/5/6:59/2');
  });

  it('K. keeps the legacy ADM anchor authoritative and does not duplicate the Peter relation', async () => {
    const admAnchorCell = cellWithControls('', [
      sdt('ADM-LEGALANCHOR', SHARED_LEGAL_ANCHOR_ID, 'ADM-LEGALANCHOR | GDPR 28. cikk (3)', 'GDPR 28. cikk (3)'),
      sdt('ADM-CELEX', SHARED_LEGAL_ANCHOR_ID, 'CELEX | 32016R0679', '32016R0679'),
    ]);
    const rowsXml = docxRow([
      cellWithControls('', [sdt('ADM-CLAUSE', 'cl_peter', 'Clause 6:59. § (2)', '6:59. § (2)')]),
      cellWithControls('', [sdtTwoLine('ADM-RELTYPE', 'rel_peter', RELATION, [RELATION])]),
      admAnchorCell,
      cellWithRaw('', hyperlink('rId1', 'Ptk. 6:59. § (2)')),
    ]);
    const outcome = await parseRows(rowsXml, [{ id: 'rId1', target: 'T/2013/5/6:59/2', targetMode: 'External' }]);

    expect(outcome.rows).toHaveLength(1);
    expect(outcome.rows[0].anchorStableId).toBe(SHARED_LEGAL_ANCHOR_ID);
    expect(outcome.rows[0].canonicalReference ?? null).toBeNull();
    expect(normalizeExtractedRow(outcome.rows[0]).anchorKey).toBe(`LEGAL|SID=${SHARED_LEGAL_ANCHOR_ID}`);
    expect(outcome.stats.hyperlinkLegalAnchors).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  C4B projection                                                     */
/* ------------------------------------------------------------------ */

describe('C4B projection of a Peter-transported anchor', () => {
  it('L. projects the normalized TV source and the opaque colon locator (never a T family)', () => {
    const manifest = projectMonitoringManifest(
      [
        {
          anchorType: 'LEGAL',
          anchorKey: 'LEGAL|REF=TV/2013/5/6:59/2',
          eli: null,
          celex: null,
          locator: '6:59/2',
        },
      ],
      '2026-09-17T00:00:00.000Z',
    );

    expect(manifest.sources).toEqual([
      { identifierFamily: 'TV', sourceIdentifier: 'TV/2013/5', locators: ['6:59/2'], referenceCount: 1 },
    ]);
    expect(manifest.sources.some((source) => (source.identifierFamily as string) === 'T')).toBe(false);
    expect(JSON.stringify(manifest)).not.toContain('"T"');
  });
});
