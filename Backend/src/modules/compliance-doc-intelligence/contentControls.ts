/**
 * CDI-1 — structural reader for Word Developer Content Controls.
 *
 * Reads the OpenXML body part (`word/document.xml`) with a real XML parser and
 * reports the ADM-* content controls grouped by the table row they belong to.
 *
 * Why not reuse the frontend importer: Frontend/src/lib/editor/docxInterop.ts is
 * a browser editor import that deliberately FLATTENS content controls
 * ("CONTENT_CONTROL_FLATTENED") and never reads `w:tag`. It is a visual import
 * path, not canonical ingestion logic, so it cannot be the source of internal
 * compliance metadata.
 *
 * Why not mammoth (documents/textExtractor.ts): it returns flat text and drops
 * the control structure these rows are made of.
 *
 * A row in a real compliance master is one table row (`w:tr`) holding:
 *   one ADM-CLAUSE, one ADM-RELTYPE and one anchor control
 *   (ADM-LEGALANCHOR | ADM-CASEANCHOR | ADM-AUTHORITYANCHOR) plus zero or more
 *   anchor metadata controls that share the anchor's stable id
 *   (ADM-ELI, ADM-CELEX, ADM-LOCATOR, ADM-ECLI, ADM-CASEID, ADM-CASELOCATOR,
 *    ADM-DECISIONID, ADM-AUTHORITYLOCATOR, ADM-SOURCEURL).
 *
 * Verified against real masters: 06_Joule_DPA_v1.0.docx (402 controls),
 * 01_Joule_Platform_MSA.docx (79 controls), DPA 1. sz. melléklet (114 controls).
 */
import JSZip from 'jszip';
import {
  DOCX_MAIN_PART,
  DOCX_RELS_PART,
  MAX_DOCUMENT_XML_BYTES,
  MAX_HYPERLINKS_PER_DOCUMENT,
  MAX_RELATIONSHIPS_PER_DOCUMENT,
  MAX_RELS_XML_BYTES,
  MAX_ROWS_PER_DOCUMENT,
  WARNING,
  WORDPROCESSINGML_NAMESPACE,
  type ParsedControl,
  type ParsedHyperlink,
  type ParsedRow,
} from './types';

interface SaxAttribute {
  name: string;
  value: string;
  prefix?: string;
  local?: string;
  uri?: string;
}

interface SaxTag {
  name: string;
  prefix?: string;
  local?: string;
  uri?: string;
  attributes: Record<string, SaxAttribute>;
}

interface SaxParser {
  onopentag: ((tag: SaxTag) => void) | null;
  onclosetag: (() => void) | null;
  ontext: ((text: string) => void) | null;
  onerror: ((error: Error) => void) | null;
  write(chunk: string): SaxParser;
  close(): SaxParser;
}

interface SaxModule {
  parser(strict: boolean, options?: Record<string, unknown>): SaxParser;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sax = require('sax') as SaxModule;

const W_NS = WORDPROCESSINGML_NAMESPACE;

export interface ContentControlReadResult {
  rows: ParsedRow[];
  /** Controls that could not be attached to a table row. */
  looseControls: ParsedControl[];
  warnings: string[];
}

interface MutableCell {
  index: number;
  rawPlain: string;
  controls: ParsedControl[];
  hyperlinks: ParsedHyperlink[];
}

interface MutableHyperlink {
  relationshipId: string | null;
  text: string;
}

interface MutableRow {
  index: number;
  cells: MutableCell[];
}

interface MutableControl {
  tag: string;
  alias: string | null;
  rawValue: string;
  inProps: boolean;
  inContent: boolean;
}

type FrameRole =
  | 'row'
  | 'cell'
  | 'control'
  | 'controlProps'
  | 'controlContent'
  | 'hyperlink'
  | 'text'
  | 'other';

export interface ContentControlReadOptions {
  /**
   * Relationship id -> target map of `word/_rels/document.xml.rels`. A
   * hyperlink without a resolvable target keeps a null target and is never
   * promoted to a machine identity.
   */
  relationships?: Map<string, string>;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Collapse spaces/tabs but preserve the line structure of a control. Real
 * masters transport a source label and the machine token as separate lines
 * inside one control (separated by `w:br` or a paragraph boundary), so the line
 * break is meaningful and must not be flattened away.
 */
function collapseLines(value: string): string {
  return value
    .replace(/[^\S\n]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

function attrValue(tag: SaxTag, qualifiedName: string): string | null {
  const attribute = tag.attributes ? tag.attributes[qualifiedName] : undefined;
  return attribute && typeof attribute.value === 'string' ? attribute.value : null;
}

/**
 * Load `word/document.xml` from a DOCX package. Throws a bounded error when the
 * package or the main part is unusable — callers must treat that as non-fatal.
 */
export async function readDocxMainDocumentXml(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file(DOCX_MAIN_PART);
  if (!entry) {
    throw new Error('DOCX_MAIN_PART_MISSING');
  }
  const xml = await entry.async('string');
  if (xml.length > MAX_DOCUMENT_XML_BYTES) {
    throw new Error('DOCX_MAIN_PART_TOO_LARGE');
  }
  return xml;
}

/**
 * Parse the document body and group ADM content controls by table row.
 *
 * The parser is namespace-aware and matches on the WordprocessingML namespace,
 * so it does not depend on the `w:` prefix specifically. Element text is only
 * collected from `w:t` descendants of a control's `w:sdtContent`.
 */
export function readContentControlRows(
  xml: string,
  options: ContentControlReadOptions = {},
): ContentControlReadResult {
  // Strict XML parsing with preserved case: OOXML element names such as
  // `w:sdtPr` and attribute names such as `w:val` are case-sensitive, and sax
  // upper/lower-cases names in loose mode. Real WordprocessingML is well formed,
  // so strict parsing is the correct structural read; recoverable problems are
  // still reported through onerror without aborting the extraction.
  const parser = sax.parser(true, {
    xmlns: true,
    lowercase: false,
    trim: false,
    normalize: false,
    position: false,
  });

  const warnings: string[] = [];
  const warn = (code: string): void => {
    if (warnings.length < 32 && !warnings.includes(code)) warnings.push(code);
  };

  const relationships = options.relationships ?? new Map<string, string>();
  const rows: ParsedRow[] = [];
  const looseControls: ParsedControl[] = [];
  const frames: FrameRole[] = [];
  const cellStack: MutableCell[] = [];
  const controlStack: MutableControl[] = [];
  const hyperlinkStack: MutableHyperlink[] = [];

  let currentRow: MutableRow | null = null;
  let rowCounter = 0;
  let cellCounter = 0;
  let textDepth = 0;
  let rowLimitReached = false;
  let hyperlinkCounter = 0;
  let hyperlinkLimitReached = false;

  const topControl = (): MutableControl | null =>
    controlStack.length ? controlStack[controlStack.length - 1] : null;

  const finalizeControl = (control: MutableControl): void => {
    const rawTag = control.tag.trim();
    const [kindPart, idPart] = rawTag.split(':', 2);
    const value = collapseLines(control.rawValue);
    const parsed: ParsedControl = {
      tag: rawTag,
      kind: (kindPart || '').trim(),
      stableId: idPart && idPart.trim() ? idPart.trim() : null,
      alias: control.alias ? collapseWhitespace(control.alias) : null,
      value,
      lines: value ? value.split('\n') : [],
    };
    const cell = cellStack.length ? cellStack[cellStack.length - 1] : null;
    if (cell) {
      cell.controls.push(parsed);
      return;
    }
    looseControls.push(parsed);
  };

  parser.onopentag = (tag) => {
    const isWordprocessing = tag.uri === W_NS;
    const local = tag.local || '';

    if (!isWordprocessing) {
      frames.push('other');
      return;
    }

    switch (local) {
      case 'tr': {
        if (rowLimitReached) {
          frames.push('other');
          return;
        }
        rowCounter += 1;
        if (rowCounter > MAX_ROWS_PER_DOCUMENT) {
          rowLimitReached = true;
          warn(WARNING.ROW_LIMIT_REACHED);
          frames.push('other');
          return;
        }
        cellCounter = 0;
        currentRow = { index: rowCounter - 1, cells: [] };
        frames.push('row');
        return;
      }
      case 'tc': {
        if (currentRow) {
          cellCounter += 1;
          const cell: MutableCell = { index: cellCounter - 1, rawPlain: '', controls: [], hyperlinks: [] };
          currentRow.cells.push(cell);
          cellStack.push(cell);
          frames.push('cell');
          return;
        }
        frames.push('other');
        return;
      }
      case 'sdt': {
        controlStack.push({ tag: '', alias: null, rawValue: '', inProps: false, inContent: false });
        frames.push('control');
        return;
      }
      case 'sdtPr': {
        const control = topControl();
        if (control) control.inProps = true;
        frames.push('controlProps');
        return;
      }
      case 'sdtContent': {
        const control = topControl();
        if (control) control.inContent = true;
        frames.push('controlContent');
        return;
      }
      case 'tag': {
        const control = topControl();
        if (control && control.inProps) {
          const value = attrValue(tag, 'w:val');
          if (value !== null) control.tag = value;
        }
        frames.push('other');
        return;
      }
      case 'alias': {
        const control = topControl();
        if (control && control.inProps) {
          const value = attrValue(tag, 'w:val');
          if (value !== null) control.alias = value;
        }
        frames.push('other');
        return;
      }
      case 'hyperlink': {
        // Structural hyperlink: only the relationship id is read here; the
        // target is resolved through the relationship table and the visible text
        // is display only.
        if (hyperlinkLimitReached) {
          frames.push('other');
          return;
        }
        hyperlinkCounter += 1;
        if (hyperlinkCounter > MAX_HYPERLINKS_PER_DOCUMENT) {
          hyperlinkLimitReached = true;
          warn(WARNING.HYPERLINK_LIMIT_REACHED);
          frames.push('other');
          return;
        }
        hyperlinkStack.push({ relationshipId: attrValue(tag, 'r:id'), text: '' });
        frames.push('hyperlink');
        return;
      }
      case 't': {
        textDepth += 1;
        frames.push('text');
        return;
      }
      case 'br':
      case 'cr': {
        // An explicit line break inside a control separates transported lines.
        const control = topControl();
        if (control && control.inContent) control.rawValue += '\n';
        frames.push('other');
        return;
      }
      case 'p': {
        // A paragraph boundary inside a control's content is a line boundary too.
        const control = topControl();
        if (control && control.inContent) control.rawValue += '\n';
        frames.push('other');
        return;
      }
      default: {
        frames.push('other');
      }
    }
  };

  parser.ontext = (text) => {
    if (!text || textDepth === 0) return;
    const hyperlink = hyperlinkStack.length ? hyperlinkStack[hyperlinkStack.length - 1] : null;
    if (hyperlink) hyperlink.text += text;
    const control = topControl();
    if (control && control.inContent) {
      control.rawValue += text;
      return;
    }
    const cell = cellStack.length ? cellStack[cellStack.length - 1] : null;
    if (cell) cell.rawPlain += text;
  };

  const closeFrame = (): void => {
    const role = frames.pop();
    switch (role) {
      case 'row': {
        if (currentRow) {
          rows.push({
            index: currentRow.index,
            cells: currentRow.cells.map((cell) => ({
              index: cell.index,
              plainText: collapseWhitespace(cell.rawPlain),
              controls: cell.controls,
              hyperlinks: cell.hyperlinks,
            })),
          });
          currentRow = null;
        }
        return;
      }
      case 'cell': {
        cellStack.pop();
        return;
      }
      case 'control': {
        const control = controlStack.pop();
        if (control) finalizeControl(control);
        return;
      }
      case 'controlProps': {
        const control = topControl();
        if (control) control.inProps = false;
        return;
      }
      case 'controlContent': {
        const control = topControl();
        if (control) control.inContent = false;
        return;
      }
      case 'hyperlink': {
        const hyperlink = hyperlinkStack.pop();
        if (hyperlink) {
          const target = hyperlink.relationshipId
            ? relationships.get(hyperlink.relationshipId) ?? null
            : null;
          const cell = cellStack.length ? cellStack[cellStack.length - 1] : null;
          if (cell) {
            cell.hyperlinks.push({
              relationshipId: hyperlink.relationshipId,
              target,
              text: collapseWhitespace(hyperlink.text),
            });
          }
        }
        return;
      }
      case 'text': {
        if (textDepth > 0) textDepth -= 1;
        return;
      }
      default:
        return;
    }
  };

  parser.onclosetag = () => closeFrame();
  parser.onerror = (error) => {
    warn('XML_PARSE_ERROR:' + String(error && error.message ? error.message : error).slice(0, 80));
    // sax (non-strict) reports and continues for recoverable problems.
    (parser as unknown as { error: unknown }).error = null;
  };

  parser.write(xml).close();

  // A truncated body leaves open frames; salvage what was read and say so.
  if (frames.length > 0) {
    warn(WARNING.XML_UNCLOSED_ELEMENTS);
    while (frames.length > 0) closeFrame();
  }

  return { rows, looseControls, warnings };
}

/**
 * Parse `word/_rels/document.xml.rels` into an id -> target map.
 *
 * A missing relationships part is normal (a document without hyperlinks) and
 * yields an empty map. An over-large part throws a bounded error that callers
 * treat as non-fatal.
 */
export async function readDocxRelationships(buffer: Buffer): Promise<Map<string, string>> {
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file(DOCX_RELS_PART);
  if (!entry) return new Map();
  const xml = await entry.async('string');
  if (xml.length > MAX_RELS_XML_BYTES) {
    throw new Error('DOCX_RELS_PART_TOO_LARGE');
  }
  return parseRelationshipsXml(xml);
}

/** Structural, namespace-aware read of the relationship table. */
export function parseRelationshipsXml(xml: string): Map<string, string> {
  const parser = sax.parser(true, {
    xmlns: true,
    lowercase: false,
    trim: false,
    normalize: false,
    position: false,
  });
  const map = new Map<string, string>();
  let count = 0;
  parser.onopentag = (tag) => {
    if ((tag.local || '') !== 'Relationship') return;
    if (count >= MAX_RELATIONSHIPS_PER_DOCUMENT) return;
    const id = attrValue(tag, 'Id');
    const target = attrValue(tag, 'Target');
    if (!id || !target) return;
    count += 1;
    map.set(id, target);
  };
  parser.onerror = (error) => {
    void error;
    (parser as unknown as { error: unknown }).error = null;
  };
  parser.write(xml).close();
  return map;
}

/**
 * Convenience: DOCX buffer -> grouped content-control rows.
 *
 * The relationship part is read too so `w:hyperlink` targets resolve. A
 * relationship read problem is non-fatal: rows are still produced and the
 * hyperlinks keep a null target.
 */
export async function readDocxContentControlRows(buffer: Buffer): Promise<ContentControlReadResult> {
  const xml = await readDocxMainDocumentXml(buffer);
  let relationships = new Map<string, string>();
  try {
    relationships = await readDocxRelationships(buffer);
  } catch {
    relationships = new Map();
  }
  return readContentControlRows(xml, { relationships });
}
