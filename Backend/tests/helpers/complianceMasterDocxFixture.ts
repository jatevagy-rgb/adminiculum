/**
 * CDI-1 test fixture — a MINIMAL SYNTHETIC compliance master DOCX.
 *
 * This mirrors the verified real-master structure (one `w:tr` per relation row,
 * four cells, ADM-* content controls with `ADM-<KIND>[:<stableId>]` tags and
 * `w:alias` display text, a trailing control-free rationale cell) without
 * containing any real legal document. Real masters are confidential and are
 * never committed.
 *
 * Verified real-master facts reproduced here:
 * - tags transport an explicit stable id: ADM-LEGALANCHOR:la_baa4796f2169
 * - metadata controls share the anchor's stable id: ADM-ELI:la_baa4796f2169
 * - ADM-RELTYPE may transport a source label and the machine token on two lines
 *   separated by `w:br`
 * - legacy masters carry ADM-CLAUSE + plain-text citation columns with NO anchor
 *   control at all (01_Joule_Platform_MSA.docx family)
 */
import JSZip from 'jszip';

export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** One single-line content control: ADM-<KIND>[:<stableId>]. */
export function sdt(kind: string, stableId: string | null, alias: string, value: string): string {
  const tag = stableId ? `${kind}:${stableId}` : kind;
  return (
    '<w:sdt><w:sdtPr>' +
    `<w:alias w:val="${esc(alias)}"/><w:tag w:val="${esc(tag)}"/><w:text/>` +
    '</w:sdtPr><w:sdtContent><w:r>' +
    `<w:t xml:space="preserve">${esc(value)}</w:t>` +
    '</w:r></w:sdtContent></w:sdt>'
  );
}

/** A control whose controlled content spans two lines, separated by `w:br`. */
export function sdtTwoLine(kind: string, stableId: string | null, alias: string, lines: string[]): string {
  const tag = stableId ? `${kind}:${stableId}` : kind;
  const runs = lines
    .map((line, index) => `<w:r>${index > 0 ? '<w:br/>' : ''}<w:t>${esc(line)}</w:t></w:r>`)
    .join('');
  return (
    '<w:sdt><w:sdtPr>' +
    `<w:alias w:val="${esc(alias)}"/><w:tag w:val="${esc(tag)}"/><w:text/>` +
    `</w:sdtPr><w:sdtContent>${runs}</w:sdtContent></w:sdt>`
  );
}

export function cell(value: string): string {
  return `<w:tc><w:p><w:r><w:t>${esc(value)}</w:t></w:r></w:p></w:tc>`;
}

export function cellWithControls(prefix: string, controls: string[]): string {
  return `<w:tc><w:p><w:r><w:t>${esc(prefix)}</w:t></w:r>${controls.join('')}</w:p></w:tc>`;
}

export function docxRow(cells: string[]): string {
  return `<w:tr>${cells.join('')}</w:tr>`;
}

export interface RelationRowInput {
  clauseId: string;
  clause: string;
  clauseAlias?: string;
  relationId?: string | null;
  relation?: string | null;
  anchor: { kind: string; id: string | null; display: string };
  metadata?: Array<{ kind: string; id: string | null; alias: string; value: string }>;
  rationale?: string;
}

const ANCHOR_METADATA_ORDER = [
  'ADM-ELI',
  'ADM-CELEX',
  'ADM-LOCATOR',
  'ADM-ECLI',
  'ADM-CASEID',
  'ADM-CASELOCATOR',
  'ADM-DECISIONID',
  'ADM-AUTHORITYLOCATOR',
  'ADM-SOURCEURL',
];

/** One relation row: clause | relation type | anchor + metadata | rationale. */
export function relationRowXml(input: RelationRowInput): string {
  const clauseCell = cellWithControls('', [
    sdt('ADM-CLAUSE', input.clauseId, input.clauseAlias ?? `Clause ${input.clause}`, input.clause),
  ]);

  const relationCell =
    input.relation === undefined || input.relation === null
      ? cell('')
      : cellWithControls('', [
          sdtTwoLine('ADM-RELTYPE', input.relationId ?? 'rel_1', input.relation, [input.relation]),
        ]);

  const anchorCell = `<w:tc><w:p>${[
    sdt(input.anchor.kind, input.anchor.id, `${input.anchor.kind} | ${input.anchor.display}`, input.anchor.display),
    ...(input.metadata ?? [])
      .slice()
      .sort((a, b) => ANCHOR_METADATA_ORDER.indexOf(a.kind) - ANCHOR_METADATA_ORDER.indexOf(b.kind))
      .map((metadata) => sdt(metadata.kind, metadata.id, metadata.alias, metadata.value)),
  ].join('')}</w:p></w:tc>`;

  return docxRow([clauseCell, relationCell, anchorCell, cell(input.rationale ?? '')]);
}

/** A DOCX package containing the given body XML. */
export async function buildDocxBuffer(bodyXml: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

/** A DOCX whose body is a single matrix table with the given rows. */
export async function masterDocxBuffer(rowsXml: string): Promise<Buffer> {
  return buildDocxBuffer(`<w:tbl>${rowsXml}</w:tbl>`);
}

/* ------------------------------------------------------------------ */
/*  Canonical rows (same anchor reused by two clauses, plus CASE)      */
/* ------------------------------------------------------------------ */

export const SHARED_LEGAL_ANCHOR_ID = 'la_baa4796f2169';

export function legalRowXml(options: {
  clauseId?: string;
  clause?: string;
  locator?: string;
  relation?: string;
  rationale?: string;
} = {}): string {
  return relationRowXml({
    clauseId: options.clauseId ?? 'cl_aa86615708d5',
    clause: options.clause ?? '1.1.',
    relationId: `rel_${options.clauseId ?? 'aa86615708d5'}`,
    relation: options.relation ?? 'MANDATORY_BASIS',
    anchor: { kind: 'ADM-LEGALANCHOR', id: SHARED_LEGAL_ANCHOR_ID, display: 'GDPR 28. cikk (3)' },
    metadata: [
      {
        kind: 'ADM-ELI',
        id: SHARED_LEGAL_ANCHOR_ID,
        alias: 'ELI | http://data.europa.eu/eli/reg/2016/679/oj',
        value: 'http://data.europa.eu/eli/reg/2016/679/oj',
      },
      { kind: 'ADM-CELEX', id: SHARED_LEGAL_ANCHOR_ID, alias: 'CELEX | 32016R0679', value: '32016R0679' },
      {
        kind: 'ADM-LOCATOR',
        id: SHARED_LEGAL_ANCHOR_ID,
        alias: `Locator | ${options.locator ?? 'art=28;par=3'}`,
        value: options.locator ?? 'art=28;par=3',
      },
    ],
    rationale: options.rationale ?? 'A controller-processor jogviszony kotelezo tartalma.',
  });
}

export function caseRowXml(): string {
  const anchorId = 'ca_760eedf30941';
  return relationRowXml({
    clauseId: 'cl_2c033b8d589e',
    clause: '1.2.',
    relationId: 'rel_dc89489080e5',
    relation: 'INTERPRETATION',
    anchor: { kind: 'ADM-CASEANCHOR', id: anchorId, display: 'C-683/21 Nacionalinis visuomenes sveikatos centras' },
    metadata: [
      { kind: 'ADM-ECLI', id: anchorId, alias: 'ECLI | EU:C:2023:949', value: 'EU:C:2023:949' },
      { kind: 'ADM-CASEID', id: anchorId, alias: 'Ugyszam | 105.K.703.714/2024/17', value: '105.K.703.714/2024/17' },
      { kind: 'ADM-CASELOCATOR', id: anchorId, alias: 'Locator | paras=41-45', value: 'paras=41-45' },
    ],
    rationale: 'A szerepminosites tenyleges befolyason alapul.',
  });
}

export function authorityRowXml(): string {
  const anchorId = 'aa_cc9e2556d71f';
  return relationRowXml({
    clauseId: 'cl_13e6cbdda7a2',
    clause: '13.2.',
    relationId: 'rel_9de75b1f73bb1',
    relation: 'ENFORCEMENT_BENCHMARK',
    anchor: { kind: 'ADM-AUTHORITYANCHOR', id: anchorId, display: 'NAIH-19-18/2024' },
    metadata: [
      { kind: 'ADM-DECISIONID', id: anchorId, alias: 'Azonosito | NAIH-19-18/2024', value: 'NAIH-19-18/2024' },
      { kind: 'ADM-AUTHORITYLOCATOR', id: anchorId, alias: 'Locator | paras=217-241', value: 'paras=217-241' },
      {
        kind: 'ADM-SOURCEURL',
        id: anchorId,
        alias: 'Forras | https://naih.hu/...',
        value: 'https://naih.hu/hatarozatok-vegzesek?download=1427',
      },
    ],
    rationale: 'A NAIH gyakorlata a regisztracios kotelezettseget szigoruan ertelmezi.',
  });
}

/**
 * A modern master: three relations, two of which reuse one legal anchor across
 * two different clauses.
 */
export async function internalAnalysisMasterBuffer(): Promise<Buffer> {
  return masterDocxBuffer(legalRowXml() + legalRowXml({ clauseId: 'cl_b8557b328a38', clause: '4.1.', locator: 'art=28;par=3' }) + caseRowXml());
}

/** The same master with a changed digest set (different locator on one row). */
export async function driftedMasterBuffer(): Promise<Buffer> {
  return masterDocxBuffer(legalRowXml({ locator: 'art=28;par=4' }) + legalRowXml({ clauseId: 'cl_b8557b328a38', clause: '4.1.', locator: 'art=28;par=3' }) + caseRowXml());
}

/** A legacy master family: clause + plain-text citation columns, no anchor. */
export async function legacyMasterBuffer(): Promise<Buffer> {
  return masterDocxBuffer(
    docxRow([
      cellWithControls('', [sdt('ADM-CLAUSE', 'cl_c8058ac9013b48a2', 'Clause 1.1.', '1.1.')]),
      cell('Ptk.; Eker. tv.'),
      cell('Ptk. 6:59., 6:63. §; Eker. tv. 1–2. §'),
      cell('A szolgaltatas targyanak szerzodeses meghatarozasa.'),
    ]),
  );
}

/** A buffer that is not a DOCX package at all. */
export function notADocxBuffer(): Buffer {
  return Buffer.from('this is not a docx package', 'utf8');
}

/* ------------------------------------------------------------------ */
/*  C4A — hyperlinked transport fixtures (additive)                    */
/* ------------------------------------------------------------------ */

/** A cell whose paragraph also carries raw (already-built) XML children. */
export function cellWithRaw(prefix: string, rawXml: string): string {
  return `<w:tc><w:p><w:r><w:t>${esc(prefix)}</w:t></w:r>${rawXml}</w:p></w:tc>`;
}

/** A structural Word hyperlink resolved through `r:id`. */
export function hyperlink(relationshipId: string, text: string): string {
  return `<w:hyperlink r:id="${esc(relationshipId)}"><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:hyperlink>`;
}

export interface RelationshipEntry {
  id: string;
  target: string;
  targetMode?: 'External';
}

/** `word/_rels/document.xml.rels` for the given hyperlink relationships. */
export function documentRelsXml(entries: RelationshipEntry[]): string {
  const relationships = entries
    .map(
      (entry) =>
        `<Relationship Id="${esc(entry.id)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(entry.target)}"${entry.targetMode ? ` TargetMode="${entry.targetMode}"` : ''}/>`,
    )
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`
  );
}

/** A DOCX package with the given body XML and relationship table. */
export async function buildDocxBufferWithRels(bodyXml: string, relsXml: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file('word/_rels/document.xml.rels', relsXml);
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<w:body>${bodyXml}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

/** A matrix-table DOCX with a relationship table (hyperlink rows only). */
export async function masterDocxBufferWithRels(rowsXml: string, relsXml: string): Promise<Buffer> {
  return buildDocxBufferWithRels(`<w:tbl>${rowsXml}</w:tbl>`, relsXml);
}
