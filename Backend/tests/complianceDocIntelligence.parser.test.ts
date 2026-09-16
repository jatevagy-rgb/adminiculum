/**
 * CDI-1 — structural extraction tests (no database).
 *
 * The fixture is a MINIMAL SYNTHETIC DOCX written here, mirroring the verified
 * real master structure: one `w:tr` per relation row, four cells, ADM-* content
 * controls with `ADM-<KIND>[:<stableId>]` tags and `w:alias` display text, and a
 * trailing control-free rationale cell. No real legal document is included.
 *
 * Real-master facts these tests encode (verified locally, not committed):
 * - 06_Joule_DPA_v1.0.docx: 402 controls / 67 ADM-CLAUSE / 67 ADM-RELTYPE /
 *   54 ADM-LEGALANCHOR / 10 ADM-CASEANCHOR / 3 ADM-AUTHORITYANCHOR
 * - tags carry an explicit stable id: ADM-LEGALANCHOR:la_baa4796f2169
 * - metadata controls share the anchor's stable id: ADM-ELI:la_baa4796f2169
 * - 01_Joule_Platform_MSA.docx is a legacy family with ADM-CLAUSE + ADM-DOCREF
 *   and plain-text citation columns, i.e. no anchor control at all
 */
import { describe, expect, it } from '@jest/globals';
import JSZip from 'jszip';
import {
  buildAnchorKey,
  computeRowDigest,
  normalizeExtractedRow,
  normalizeRelationType,
} from '../src/modules/compliance-doc-intelligence/normalize';
import {
  extractClauseAnchorRows,
  parseComplianceMasterDocx,
} from '../src/modules/compliance-doc-intelligence/extractClauseAnchors';
import { readContentControlRows } from '../src/modules/compliance-doc-intelligence/contentControls';
import {
  authorityRowXml,
  caseRowXml,
  cell,
  cellWithControls,
  docxRow,
  esc,
  legalRowXml,
  masterDocxBuffer,
  relationRowXml,
  sdt,
  sdtTwoLine,
} from './helpers/complianceMasterDocxFixture';

/* ------------------------------------------------------------------ */
/*  Synthetic DOCX fixture (shared helpers + bespoke rows below)       */
/* ------------------------------------------------------------------ */

const LEGAL_ROW = legalRowXml();
const CASE_ROW = caseRowXml();
const AUTHORITY_ROW = authorityRowXml();

async function parseRowsOf(rowsXml: string) {
  const buffer = await masterDocxBuffer(rowsXml);
  return parseComplianceMasterDocx(buffer);
}

/* ------------------------------------------------------------------ */

describe('CDI-1 structural extraction', () => {
  it('parses one LEGAL clause-anchor row with exact machine metadata', async () => {
    const outcome = await parseRowsOf(LEGAL_ROW);
    expect(outcome.rows).toHaveLength(1);
    const row = outcome.rows[0];
    expect(row.clauseRef).toBe('1.1.');
    expect(row.clauseStableId).toBe('cl_aa86615708d5');
    expect(row.clauseTitle).toBe('Clause 1.1.');
    expect(row.relationTypeRaw).toBe('MANDATORY_BASIS');
    expect(row.anchorType).toBe('LEGAL');
    expect(row.anchorDisplay).toBe('GDPR 28. cikk (3)');
    expect(row.anchorStableId).toBe('la_baa4796f2169');
    expect(row.eli).toBe('http://data.europa.eu/eli/reg/2016/679/oj');
    expect(row.celex).toBe('32016R0679');
    expect(row.locator).toBe('art=28;par=3');
    expect(row.ecli).toBeNull();
    expect(row.decisionId).toBeNull();
    expect(row.rationale).toBe('A controller-processor jogviszony kotelezo tartalma.');
    const normalized = normalizeExtractedRow(row);
    expect(normalized.relationType).toBe('MANDATORY_BASIS');
    // The document transports an explicit stable id: it is preferred as identity.
    expect(normalized.anchorKey).toBe('LEGAL|SID=la_baa4796f2169');
  });

  it('parses one CASE clause-anchor row with exact ECLI / caseId / caseLocator', async () => {
    const outcome = await parseRowsOf(CASE_ROW);
    expect(outcome.rows).toHaveLength(1);
    const row = outcome.rows[0];
    expect(row.anchorType).toBe('CASE');
    expect(row.ecli).toBe('EU:C:2023:949');
    expect(row.caseId).toBe('105.K.703.714/2024/17');
    expect(row.caseLocator).toBe('paras=41-45');
    expect(row.eli).toBeNull();
    expect(row.celex).toBeNull();
    expect(normalizeExtractedRow(row).anchorKey).toBe('CASE|SID=ca_760eedf30941');
  });

  it('parses one AUTHORITY clause-anchor row with exact decisionId / authorityLocator / sourceUrl', async () => {
    const outcome = await parseRowsOf(AUTHORITY_ROW);
    expect(outcome.rows).toHaveLength(1);
    const row = outcome.rows[0];
    expect(row.anchorType).toBe('AUTHORITY');
    expect(row.decisionId).toBe('NAIH-19-18/2024');
    expect(row.authorityLocator).toBe('paras=217-241');
    expect(row.sourceUrl).toBe('https://naih.hu/hatarozatok-vegzesek?download=1427');
    expect(normalizeExtractedRow(row).anchorKey).toBe('AUTHORITY|SID=aa_cc9e2556d71f');
  });

  it('parses multiple independent relation rows', async () => {
    const outcome = await parseRowsOf(LEGAL_ROW + CASE_ROW + AUTHORITY_ROW);
    expect(outcome.rows).toHaveLength(3);
    expect(outcome.rows.map((row) => row.anchorType)).toEqual(['LEGAL', 'CASE', 'AUTHORITY']);
    expect(outcome.rows.map((row) => row.clauseRef)).toEqual(['1.1.', '1.2.', '13.2.']);
    const digests = outcome.rows.map((row) => computeRowDigest(normalizeExtractedRow(row)));
    expect(new Set(digests).size).toBe(3);
  });

  it('separates a transported source label from the machine relation token', async () => {
    const twoLineRow = docxRow([
      cellWithControls('', [sdt('ADM-CLAUSE', 'cl_two', 'Clause 1.1.', '1.1.')]),
      `<w:tc><w:p>${sdtTwoLine('ADM-RELTYPE', 'rel_two', 'rel_two', ['Ehat. tv.', 'ROLE_GUARDRAIL'])}</w:p></w:tc>`,
      `<w:tc><w:p>${sdt('ADM-LEGALANCHOR', 'la_two', 'A | Ehat. tv. 3. §', 'Ehat. tv. 3. §')}</w:p></w:tc>`,
      cell('Ket soros reltype.'),
    ]);
    const outcome = await parseRowsOf(twoLineRow);
    expect(outcome.rows).toHaveLength(1);
    // The machine token is the value; the label is not fused into it.
    expect(outcome.rows[0].relationTypeRaw).toBe('ROLE_GUARDRAIL');
    expect(outcome.warnings.some((warning) => warning === 'RELATION_TYPE_SOURCE_LABEL:Ehat. tv.')).toBe(true);
    const normalized = normalizeExtractedRow(outcome.rows[0]);
    expect(normalized.relationType).toBe('ROLE_GUARDRAIL');
    expect(normalized.warnings).not.toContain('RELATION_TYPE_UNPARSEABLE');
  });

  it('keeps one anchor reused by multiple clauses as distinct clause relationships', async () => {
    const second = relationRowXml({
      clauseId: 'cl_b8557b328a38',
      clause: '4.1.',
      relationId: 'rel_2',
      relation: 'LEGAL_LIMIT',
      anchor: { kind: 'ADM-LEGALANCHOR', id: 'la_baa4796f2169', display: 'GDPR 28. cikk (3)' },
      metadata: [
        { kind: 'ADM-ELI', id: 'la_baa4796f2169', alias: 'ELI | x', value: 'http://data.europa.eu/eli/reg/2016/679/oj' },
      ],
      rationale: 'Masik szerzodeses pont ugyanarra a jogi horgonyra.',
    });
    const outcome = await parseRowsOf(LEGAL_ROW + second);
    expect(outcome.rows).toHaveLength(2);
    expect(outcome.rows[0].clauseRef).toBe('1.1.');
    expect(outcome.rows[1].clauseRef).toBe('4.1.');
    // The same anchor identity, reused; the clause relationships stay distinct.
    expect(normalizeExtractedRow(outcome.rows[0]).anchorKey).toBe('LEGAL|SID=la_baa4796f2169');
    expect(normalizeExtractedRow(outcome.rows[1]).anchorKey).toBe('LEGAL|SID=la_baa4796f2169');
    expect(outcome.rows[0].clauseStableId).not.toBe(outcome.rows[1].clauseStableId);
  });

  it('keeps multiple anchors inside one clause as separate relations', async () => {
    const clause = '2.3.';
    const clauseId = 'cl_multi';
    const twoAnchorRow = docxRow([
      cellWithControls('', [sdt('ADM-CLAUSE', clauseId, `Clause ${clause}`, clause)]),
      cellWithControls('', [sdt('ADM-RELTYPE', 'rel_multi', 'MANDATORY_BASIS', 'MANDATORY_BASIS')]),
      `<w:tc><w:p>${[
        sdt('ADM-LEGALANCHOR', 'la_one', 'JOGSZABALY | GDPR 5. cikk (1)', 'GDPR 5. cikk (1)'),
        sdt('ADM-ELI', 'la_one', 'ELI | a', 'http://data.europa.eu/eli/reg/2016/679/oj'),
        sdt('ADM-LOCATOR', 'la_one', 'Locator | a', 'art=5;par=1'),
        sdt('ADM-LEGALANCHOR', 'la_two', 'JOGSZABALY | GDPR 32. cikk (1)', 'GDPR 32. cikk (1)'),
        sdt('ADM-ELI', 'la_two', 'ELI | b', 'http://data.europa.eu/eli/reg/2016/679/oj'),
        sdt('ADM-LOCATOR', 'la_two', 'Locator | b', 'art=32;par=1'),
      ].join('')}</w:p></w:tc>`,
      cell('Ket kulon jogi horgony ugyanahhoz a pontkhoz.'),
    ]);
    const outcome = await parseRowsOf(twoAnchorRow);
    expect(outcome.rows).toHaveLength(2);
    expect(outcome.rows.map((row) => row.anchorStableId)).toEqual(['la_one', 'la_two']);
    expect(outcome.rows.map((row) => row.locator)).toEqual(['art=5;par=1', 'art=32;par=1']);
    expect(outcome.rows.every((row) => row.clauseRef === '2.3.')).toBe(true);
    // Metadata is attached to the anchor that shares its stable id, never crossed.
    expect(outcome.rows[0].eli).toBe('http://data.europa.eu/eli/reg/2016/679/oj');
    expect(outcome.rows[1].locator).toBe('art=32;par=1');
  });

  it('preserves an unknown but syntactically valid relation type without a schema change', async () => {
    const unknown = relationRowXml({
      clauseId: 'cl_future',
      clause: '9.1.',
      relationId: 'rel_future',
      relation: 'FUTURE_POLICY_BASIS',
      anchor: { kind: 'ADM-LEGALANCHOR', id: 'la_future', display: 'GDPR 24. cikk' },
      metadata: [{ kind: 'ADM-ELI', id: 'la_future', alias: 'ELI | x', value: 'http://data.europa.eu/eli/reg/2016/679/oj' }],
    });
    const outcome = await parseRowsOf(unknown);
    expect(outcome.rows).toHaveLength(1);
    const normalized = normalizeExtractedRow(outcome.rows[0]);
    expect(normalized.relationType).toBe('FUTURE_POLICY_BASIS');
    expect(normalized.warnings).toContain('UNKNOWN_RELATION_TYPE:FUTURE_POLICY_BASIS');
  });

  it('normalizes relation type casing/whitespace but never invents another meaning', () => {
    expect(normalizeRelationType(' mandatory_basis ').value).toBe('MANDATORY_BASIS');
    expect(normalizeRelationType('LEGAL_LIMIT').value).toBe('LEGAL_LIMIT');
    expect(normalizeRelationType('MANDATORY BASIS').value).toBe('MANDATORY BASIS');
    expect(normalizeRelationType('MANDATORY BASIS').warnings).toContain('RELATION_TYPE_UNPARSEABLE');
    expect(normalizeRelationType(null).value).toBe('UNSPECIFIED');
    expect(normalizeRelationType(null).warnings).toContain('RELATION_TYPE_MISSING');
    expect(normalizeRelationType('').value).toBe('UNSPECIFIED');
    expect(normalizeRelationType('X'.repeat(65)).value).toBe('UNSPECIFIED');
    // An over-long or empty value is reported, never silently truncated or remapped.
    expect(normalizeRelationType('X'.repeat(65)).warnings).toContain('RELATION_TYPE_UNPARSEABLE');
  });

  it('does not fabricate an anchor key for a row with incomplete machine metadata', async () => {
    const legacy = relationRowXml({
      clauseId: 'cl_legacy',
      clause: '3.1.',
      relationId: 'rel_legacy',
      relation: 'MANDATORY_BASIS',
      anchor: { kind: 'ADM-LEGALANCHOR', id: null as unknown as string, display: 'GDPR 6. cikk (1)' },
      rationale: 'Regi master, gepi azonosito nelkul.',
    });
    const outcome = await parseRowsOf(legacy);
    expect(outcome.rows).toHaveLength(1);
    const normalized = normalizeExtractedRow(outcome.rows[0]);
    expect(normalized.anchorStableId).toBeNull();
    expect(normalized.anchorKey).toBeNull();
    expect(normalized.anchorDisplay).toBe('GDPR 6. cikk (1)');
    // The display text must never become a key, in any form.
    expect(JSON.stringify(normalized.anchorKey)).not.toContain('GDPR');
    expect(normalized.warnings).toContain('ANCHOR_KEY_UNRESOLVED');
  });

  it('builds the documented deterministic keys when no explicit stable id is transported', () => {
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

    expect(
      buildAnchorKey({
        anchorType: 'LEGAL',
        anchorStableId: null,
        eli: null,
        celex: '32016R0679',
        locator: null,
        ecli: null,
        caseId: null,
        caseLocator: null,
        decisionId: null,
        authorityLocator: null,
      }).key,
    ).toBe('LEGAL|CELEX=32016R0679');

    expect(
      buildAnchorKey({
        anchorType: 'CASE',
        anchorStableId: null,
        eli: null,
        celex: null,
        locator: null,
        ecli: 'EU:C:2023:949',
        caseId: 'C-683/21',
        caseLocator: 'paras=41-45',
        decisionId: null,
        authorityLocator: null,
      }).key,
    ).toBe('CASE|ECLI=EU:C:2023:949|LOC=paras=41-45');

    expect(
      buildAnchorKey({
        anchorType: 'AUTHORITY',
        anchorStableId: null,
        eli: null,
        celex: null,
        locator: null,
        ecli: null,
        caseId: null,
        caseLocator: null,
        decisionId: 'NAIH-19-18/2024',
        authorityLocator: 'paras=217-241',
      }).key,
    ).toBe('AUTHORITY|DEC=NAIH-19-18/2024|LOC=paras=217-241');

    // sourceUrl alone is supporting metadata, never a key.
    const urlOnly = buildAnchorKey({
      anchorType: 'AUTHORITY',
      anchorStableId: null,
      eli: null,
      celex: null,
      locator: null,
      ecli: null,
      caseId: null,
      caseLocator: null,
      decisionId: null,
      authorityLocator: null,
    });
    expect(urlOnly.key).toBeNull();
    expect(urlOnly.warnings).toContain('ANCHOR_KEY_UNRESOLVED');
  });

  it('skips a row without an anchor control instead of inventing an anchor', async () => {
    const legacyRow = docxRow([
      cellWithControls('', [sdt('ADM-CLAUSE', 'cl_c8058ac9013b48a2', 'Clause 1.1.', '1.1.')]),
      cell('Ptk.; Eker. tv.'),
      cell('Ptk. 6:59., 6:63. §; Eker. tv. 1–2. §'),
      cell('A szolgaltatas targyanak szerzodeses meghatarozasa.'),
    ]);
    const outcome = await parseRowsOf(legacyRow);
    expect(outcome.rows).toHaveLength(0);
    expect(outcome.stats.rowsWithoutAnchor).toBe(1);
    expect(outcome.warnings.some((warning) => warning.startsWith('ROW_WITHOUT_ANCHOR_CONTROL'))).toBe(true);
    // The plain-text citation columns are reported, never promoted to anchors.
    expect(outcome.warnings.some((warning) => warning.startsWith('LEGACY_CITATION_COLUMNS'))).toBe(true);
  });

  it('recognizes an undocumented but known ADM kind without treating it as malformed', async () => {
    const docRefRow = docxRow([
      cellWithControls('', [
        sdt('ADM-CLAUSE', 'cl_docref', 'Clause 2.1.', '2.1.'),
        sdt('ADM-DOCREF', 'dr_1', 'Dokumentum | MSA 4.2.', 'MSA 4.2.'),
      ]),
      cellWithControls('', [sdt('ADM-RELTYPE', 'rel_1', 'MANDATORY_BASIS', 'MANDATORY_BASIS')]),
      `<w:tc><w:p>${sdt('ADM-LEGALANCHOR', 'la_x', 'JOGSZABALY | Ptk. 6:59.', 'Ptk. 6:59.')}</w:p></w:tc>`,
      cell('Belso hivatkozas.'),
    ]);
    const outcome = await parseRowsOf(docRefRow);
    expect(outcome.rows).toHaveLength(1);
    expect(outcome.warnings.some((warning) => warning.startsWith('UNKNOWN_ADM_CONTROL_KIND'))).toBe(false);
  });

  it('reports an unrecognized ADM control kind without failing the row', async () => {
    const unknownKindRow = docxRow([
      cellWithControls('', [sdt('ADM-CLAUSE', 'cl_1', 'Clause 1.1.', '1.1.')]),
      cellWithControls('', [sdt('ADM-RELTYPE', 'rel_1', 'LEGAL_LIMIT', 'LEGAL_LIMIT')]),
      `<w:tc><w:p>${sdt('ADM-LEGALANCHOR', 'la_1', 'A | GDPR 5. cikk', 'GDPR 5. cikk')}</w:p></w:tc>`,
      cell(''),
    ]);
    const withUnknown = docxRow([
      cellWithControls('', [
        sdt('ADM-CLAUSE', 'cl_1', 'Clause 1.1.', '1.1.'),
        sdt('ADM-NEWKIND', 'nk_1', 'uj | ertek', 'ertek'),
      ]),
      cellWithControls('', [sdt('ADM-RELTYPE', 'rel_1', 'LEGAL_LIMIT', 'LEGAL_LIMIT')]),
      `<w:tc><w:p>${sdt('ADM-LEGALANCHOR', 'la_1', 'A | GDPR 5. cikk', 'GDPR 5. cikk')}</w:p></w:tc>`,
      cell(''),
    ]);
    void unknownKindRow;
    const outcome = await parseRowsOf(withUnknown);
    expect(outcome.rows).toHaveLength(1);
    expect(outcome.warnings.some((warning) => warning === 'UNKNOWN_ADM_CONTROL_KIND:ADM-NEWKIND')).toBe(true);
  });

  it('keeps metadata that names another anchor out of this row', async () => {
    const mixed = relationRowXml({
      clauseId: 'cl_mix',
      clause: '5.1.',
      relationId: 'rel_mix',
      relation: 'MANDATORY_BASIS',
      anchor: { kind: 'ADM-LEGALANCHOR', id: 'la_keep', display: 'GDPR 5. cikk' },
      metadata: [
        { kind: 'ADM-ELI', id: 'la_keep', alias: 'ELI | a', value: 'http://data.europa.eu/eli/reg/2016/679/oj' },
        { kind: 'ADM-CELEX', id: 'la_other', alias: 'CELEX | b', value: '32016R0679' },
      ],
    });
    const outcome = await parseRowsOf(mixed);
    expect(outcome.rows).toHaveLength(1);
    expect(outcome.rows[0].eli).toBe('http://data.europa.eu/eli/reg/2016/679/oj');
    expect(outcome.rows[0].celex).toBeNull();
    expect(outcome.warnings.some((warning) => warning.startsWith('ORPHAN_ANCHOR_METADATA'))).toBe(true);
  });

  it('marks a row with no ADM-RELTYPE with an explicit missing state', async () => {
    const noRelation = relationRowXml({
      clauseId: 'cl_norel',
      clause: '7.1.',
      anchor: { kind: 'ADM-LEGALANCHOR', id: 'la_norel', display: 'GDPR 5. cikk' },
      metadata: [{ kind: 'ADM-ELI', id: 'la_norel', alias: 'ELI | a', value: 'http://data.europa.eu/eli/reg/2016/679/oj' }],
    });
    const outcome = await parseRowsOf(noRelation);
    expect(outcome.rows).toHaveLength(1);
    expect(outcome.rows[0].relationTypeRaw).toBeNull();
    const normalized = normalizeExtractedRow(outcome.rows[0]);
    expect(normalized.relationType).toBe('UNSPECIFIED');
    expect(normalized.warnings).toContain('RELATION_TYPE_MISSING');
  });

  it('reports controls that are not inside a table row', () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p>' +
      sdt('ADM-LEGALANCHOR', 'la_loose', 'A | GDP 5.', 'GDPR 5. cikk') +
      '</w:p></w:body></w:document>';
    const read = readContentControlRows(xml);
    expect(read.rows).toHaveLength(0);
    expect(read.looseControls).toHaveLength(1);
    const outcome = extractClauseAnchorRows(read);
    expect(outcome.rows).toHaveLength(0);
    expect(outcome.stats.controlsOutsideTableRow).toBe(1);
    expect(outcome.warnings).toContain('CONTROL_OUTSIDE_TABLE_ROW');
  });

  it('fails a bounded error for a DOCX without a main document part', async () => {
    const zip = new JSZip();
    zip.file('word/styles.xml', '<w:styles/>');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    await expect(parseComplianceMasterDocx(buffer)).rejects.toThrow('DOCX_MAIN_PART_MISSING');
  });

  it('produces a stable digest across repeated normalization of the same row', async () => {
    const outcome = await parseRowsOf(LEGAL_ROW);
    const first = normalizeExtractedRow(outcome.rows[0]);
    const second = normalizeExtractedRow(outcome.rows[0]);
    expect(computeRowDigest(first)).toBe(computeRowDigest(second));
    expect(computeRowDigest({ ...first, rationale: 'mas indok' })).not.toBe(computeRowDigest(first));
    expect(computeRowDigest({ ...first, anchorKey: 'LEGAL|SID=other' })).not.toBe(computeRowDigest(first));
  });
});
