/**
 * Contract-specific insertion presets.
 *
 * Every preset is STRUCTURED editor content (allow-listed nodes only, no
 * opaque HTML) and must pass the strict schema validator — this is asserted
 * by unit tests. Presets never insert signatures, never contact external
 * systems, and only reference the safe field-token allow-list.
 */

import { EditorNode, generateClauseId, newClauseNode } from './editorModel';

function text(value: string, marks?: EditorNode['marks']): EditorNode {
  return marks ? { type: 'text', text: value, marks } : { type: 'text', text: value };
}

function paragraph(...content: EditorNode[]): EditorNode {
  return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };
}

function bold(value: string): EditorNode {
  return text(value, [{ type: 'bold' }]);
}

function token(fieldId: string): EditorNode {
  return { type: 'fieldToken', attrs: { fieldId } };
}

function cell(header: boolean, ...content: EditorNode[]): EditorNode {
  return {
    type: header ? 'tableHeader' : 'tableCell',
    attrs: { colspan: 1, rowspan: 1 },
    content: content.length > 0 ? content : [paragraph()],
  };
}

function row(...cells: EditorNode[]): EditorNode {
  return { type: 'tableRow', content: cells };
}

// ---------------------------------------------------------------------------
// Party block — labeled two-column table with safe manual/token fields
// ---------------------------------------------------------------------------

export function buildPartyBlock(designation = 'Megbízó'): EditorNode[] {
  return [
    paragraph(bold(designation)),
    {
      type: 'table',
      content: [
        row(cell(false, paragraph(bold('Név:'))), cell(false, paragraph(token('party.name')))),
        row(cell(false, paragraph(bold('Székhely / cím:'))), cell(false, paragraph(token('party.seat')))),
        row(cell(false, paragraph(bold('Képviseli:'))), cell(false, paragraph(token('party.representative')))),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Recital block — "Tekintettel arra, hogy…" preamble
// ---------------------------------------------------------------------------

export function buildRecitalBlock(): EditorNode[] {
  return [
    paragraph(bold('PREAMBULUM')),
    paragraph(text('Tekintettel arra, hogy a Felek együttműködésük kereteit írásban kívánják rögzíteni;')),
    paragraph(text('tekintettel arra, hogy [további előzmény];')),
    paragraph(text('a Felek az alábbi megállapodást kötik:')),
  ];
}

// ---------------------------------------------------------------------------
// Definition block — ordered definitions list with bold defined terms
// ---------------------------------------------------------------------------

export function buildDefinitionBlock(): EditorNode[] {
  const definitionItem = (term: string, definition: string): EditorNode => ({
    type: 'listItem',
    content: [paragraph(bold(`„${term}”`), text(`: ${definition}`))],
  });
  return [
    paragraph(bold('Értelmező rendelkezések')),
    {
      type: 'orderedList',
      attrs: { start: 1, listStyle: 'decimal' },
      content: [
        definitionItem('Szerződés', 'a jelen megállapodás, annak valamennyi mellékletével együtt.'),
        definitionItem('Fél / Felek', 'a jelen Szerződést aláíró felek külön-külön, illetve együttesen.'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Clause / subclause
// ---------------------------------------------------------------------------

export function buildClauseBlock(title?: string): EditorNode[] {
  return [newClauseNode(generateClauseId(), title)];
}

// ---------------------------------------------------------------------------
// Annex reference — structured reference only (no file is created)
// ---------------------------------------------------------------------------

export function buildAnnexReference(annexNumber = 1): EditorNode[] {
  return [
    paragraph(
      bold(`${annexNumber}. számú melléklet`),
      text(' — [a melléklet megnevezése]. A melléklet a Szerződés elválaszthatatlan részét képezi.')
    ),
  ];
}

// ---------------------------------------------------------------------------
// Signature block — 1/2/N parties; signature LINES only, never signatures
// ---------------------------------------------------------------------------

export function buildSignatureBlock(parties: number): EditorNode[] {
  const partyCount = Math.max(1, Math.min(parties, 6));
  const signatureCell = (label: string): EditorNode =>
    cell(
      false,
      paragraph(text('____________________________')),
      paragraph(bold(label)),
      paragraph(token('party.name')),
      paragraph(text('[tisztség / meghatalmazás]'))
    );

  const rows: EditorNode[] = [];
  for (let index = 0; index < partyCount; index += 2) {
    const left = signatureCell(index === 0 ? 'Megbízó' : `${index + 1}. Fél`);
    const right =
      index + 1 < partyCount
        ? signatureCell(index === 0 ? 'Megbízott' : `${index + 2}. Fél`)
        : cell(false, paragraph());
    rows.push(row(left, right));
  }

  return [
    paragraph(
      text('Kelt: '),
      token('date.custom'),
    ),
    paragraph(text('A Felek a jelen Szerződést mint akaratukkal mindenben megegyezőt, jóváhagyólag írják alá.')),
    { type: 'table', content: rows },
  ];
}

// ---------------------------------------------------------------------------
// Table presets
// ---------------------------------------------------------------------------

export function buildFeeTable(): EditorNode[] {
  return [
    {
      type: 'table',
      content: [
        row(cell(true, paragraph(bold('Tétel'))), cell(true, paragraph(bold('Díj'))), cell(true, paragraph(bold('Esedékesség')))),
        row(cell(false, paragraph()), cell(false, paragraph(token('amount.value'))), cell(false, paragraph(token('date.custom')))),
      ],
    },
  ];
}

export function buildMilestoneTable(): EditorNode[] {
  return [
    {
      type: 'table',
      content: [
        row(
          cell(true, paragraph(bold('Mérföldkő'))),
          cell(true, paragraph(bold('Határidő'))),
          cell(true, paragraph(bold('Teljesítés igazolása')))
        ),
        row(cell(false, paragraph()), cell(false, paragraph(token('date.custom'))), cell(false, paragraph())),
      ],
    },
  ];
}

export function buildAnnexIndexTable(): EditorNode[] {
  return [
    paragraph(bold('Mellékletek jegyzéke')),
    {
      type: 'table',
      content: [
        row(cell(true, paragraph(bold('Szám'))), cell(true, paragraph(bold('Megnevezés')))),
        row(cell(false, paragraph(text('1.'))), cell(false, paragraph())),
        row(cell(false, paragraph(text('2.'))), cell(false, paragraph())),
      ],
    },
  ];
}

export interface InsertionPresetDefinition {
  id: string;
  label: string;
  description: string;
  build: () => EditorNode[];
}

export const INSERTION_PRESETS: readonly InsertionPresetDefinition[] = [
  { id: 'party', label: 'Fél adatblokk', description: 'Szerződő fél adatai táblázatban', build: () => buildPartyBlock() },
  { id: 'recital', label: 'Preambulum', description: '„Tekintettel arra, hogy…” bevezető', build: buildRecitalBlock },
  { id: 'definitions', label: 'Értelmező rendelkezések', description: 'Definíciós lista', build: buildDefinitionBlock },
  { id: 'clause', label: 'Szerződéses pont', description: 'Számozott jogi pont', build: () => buildClauseBlock() },
  { id: 'annex', label: 'Melléklet-hivatkozás', description: 'Strukturált mellékletutalás', build: () => buildAnnexReference() },
  { id: 'signature-2', label: 'Aláírási blokk (2 fél)', description: 'Két fél aláírása egymás mellett', build: () => buildSignatureBlock(2) },
  { id: 'signature-1', label: 'Aláírási blokk (1 fél)', description: 'Egyoldalú nyilatkozat aláírása', build: () => buildSignatureBlock(1) },
  { id: 'fee-table', label: 'Díjtáblázat', description: 'Tétel / díj / esedékesség', build: buildFeeTable },
  { id: 'milestone-table', label: 'Mérföldkő táblázat', description: 'Mérföldkő / határidő / igazolás', build: buildMilestoneTable },
  { id: 'annex-index', label: 'Mellékletjegyzék', description: 'Mellékletek táblázatos jegyzéke', build: buildAnnexIndexTable },
] as const;
