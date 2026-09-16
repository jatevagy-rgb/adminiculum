/**
 * CDI-1 — clause x anchor extraction from the controlled row structure.
 *
 * One matrix row produces ONE relation per anchor control it contains. A row
 * without an anchor content control carries no machine anchor identity at all,
 * so it is skipped with an internal warning rather than having an anchor
 * invented from its display text.
 */
import { readDocxContentControlRows, type ContentControlReadResult } from './contentControls';
import {
  ADM_TAG_PREFIX,
  ANCHOR_CONTROL_KIND,
  ANCHOR_METADATA_KIND,
  CLAUSE_CONTROL_KIND,
  MAX_ROWS_PER_DOCUMENT,
  MAX_WARNINGS_PER_RESULT,
  RECOGNIZED_NON_FIELD_KINDS,
  RELATION_TYPE_CONTROL_KIND,
  WARNING,
  type DocxParseOutcome,
  type DocxParseStats,
  type ExtractedClauseAnchorRow,
  type ParsedControl,
} from './types';

function isAdmControl(control: ParsedControl): boolean {
  return control.kind.startsWith(ADM_TAG_PREFIX);
}

function isRecognizedKind(kind: string): boolean {
  return (
    kind === CLAUSE_CONTROL_KIND ||
    kind === RELATION_TYPE_CONTROL_KIND ||
    Object.prototype.hasOwnProperty.call(ANCHOR_CONTROL_KIND, kind) ||
    Object.prototype.hasOwnProperty.call(ANCHOR_METADATA_KIND, kind) ||
    RECOGNIZED_NON_FIELD_KINDS.has(kind)
  );
}

/** Text of a control: the controlled value, falling back to its alias. */
function controlText(control: ParsedControl): { value: string; fromAlias: boolean } {
  if (control.value) return { value: control.value.replace(/\n+/g, ' '), fromAlias: false };
  if (control.alias) return { value: control.alias, fromAlias: true };
  return { value: '', fromAlias: false };
}

/**
 * ADM-RELTYPE is the only control that real masters transport on two lines:
 * a source label ("Ptk.", "Ehat. tv.", "GDPR") and then the machine token.
 * The machine token is the value; the label is preserved as an internal
 * observation instead of being fused into the relation type.
 */
function relationTypeText(control: ParsedControl): { value: string; label: string | null } {
  if (control.lines.length > 1) {
    return {
      value: control.lines[control.lines.length - 1],
      label: control.lines.slice(0, -1).join(' '),
    };
  }
  return { value: controlText(control).value, label: null };
}

export function extractClauseAnchorRows(read: ContentControlReadResult): DocxParseOutcome {
  const warnings: string[] = [...read.warnings];
  const addWarning = (code: string): void => {
    if (warnings.length < MAX_WARNINGS_PER_RESULT && !warnings.includes(code)) warnings.push(code);
  };

  const stats: DocxParseStats = {
    admLinks: 0,
    rowsWithoutAnchor: 0,
    rowsWithoutClause: 0,
    controlsOutsideTableRow: read.looseControls.filter(isAdmControl).length,
  };
  if (stats.controlsOutsideTableRow > 0) addWarning(WARNING.CONTROL_OUTSIDE_TABLE_ROW);

  const rows: ExtractedClauseAnchorRow[] = [];

  for (const row of read.rows) {
    const controls = row.cells.flatMap((cell) => cell.controls);
    const admControls = controls.filter(isAdmControl);
    if (admControls.length === 0) continue;
    stats.admLinks += 1;

    for (const control of admControls) {
      if (!isRecognizedKind(control.kind)) {
        addWarning(`${WARNING.UNKNOWN_ADM_CONTROL_KIND}:${control.kind}`);
      }
      // Multi-line transport is only expected for ADM-RELTYPE. Anything else is
      // reported instead of being silently flattened or truncated.
      if (control.lines.length > 1 && control.kind !== RELATION_TYPE_CONTROL_KIND) {
        addWarning(`${WARNING.MULTILINE_CONTROL_VALUE}:${control.kind}`);
      }
    }

    // The rationale column is the trailing cell that carries no ADM control.
    // Older masters put plain-text citation columns before it: that is reported
    // here, for ingestible and skipped rows alike, instead of being silently
    // mixed into the rationale or promoted into anchors.
    const controlFreeCells = row.cells.filter(
      (cell) => !cell.controls.filter(isAdmControl).length,
    );
    const nonEmptyControlFree = controlFreeCells.filter((cell) => cell.plainText);
    if (nonEmptyControlFree.length > 1) {
      addWarning(`${WARNING.LEGACY_CITATION_COLUMNS}:row=${row.index}`);
    }
    const rationale = nonEmptyControlFree.length
      ? nonEmptyControlFree[nonEmptyControlFree.length - 1].plainText
      : null;

    const clauseControl = admControls.find((control) => control.kind === CLAUSE_CONTROL_KIND);
    if (!clauseControl) {
      stats.rowsWithoutClause += 1;
      addWarning(`${WARNING.ROW_WITHOUT_CLAUSE_CONTROL}:row=${row.index}`);
      continue;
    }

    const clause = controlText(clauseControl);
    if (!clause.value) {
      // A clause control with no readable value cannot identify a clause.
      addWarning(`${WARNING.CLAUSE_VALUE_MISSING}:row=${row.index}`);
      continue;
    }

    const anchorControls = admControls.filter((control) =>
      Object.prototype.hasOwnProperty.call(ANCHOR_CONTROL_KIND, control.kind),
    );
    if (anchorControls.length === 0) {
      stats.rowsWithoutAnchor += 1;
      addWarning(`${WARNING.ROW_WITHOUT_ANCHOR_CONTROL}:row=${row.index}`);
      continue;
    }

    const relationControl = admControls.find((control) => control.kind === RELATION_TYPE_CONTROL_KIND);
    const relation = relationControl ? relationTypeText(relationControl) : null;
    const relationTypeRaw = relation ? relation.value || null : null;
    if (relation && relation.label) {
      addWarning(`${WARNING.RELATION_TYPE_SOURCE_LABEL}:${relation.label}`);
    }

    const metadataControls = admControls.filter((control) =>
      Object.prototype.hasOwnProperty.call(ANCHOR_METADATA_KIND, control.kind),
    );

    for (const anchorControl of anchorControls) {
      if (rows.length >= MAX_ROWS_PER_DOCUMENT) {
        addWarning(WARNING.ROW_LIMIT_REACHED);
        return { rows, warnings, stats };
      }

      const anchor = controlText(anchorControl);
      if (!anchor.value) {
        addWarning(`${WARNING.PENDING_ANCHOR_CONTROL}:row=${row.index}`);
        continue;
      }

      const rowWarnings: string[] = [];
      if (clause.fromAlias) rowWarnings.push(WARNING.CLAUSE_VALUE_FROM_ALIAS);
      if (anchor.fromAlias) rowWarnings.push(WARNING.ANCHOR_DISPLAY_FROM_ALIAS);

      const fields: Record<string, string | null> = {
        eli: null,
        celex: null,
        locator: null,
        ecli: null,
        caseId: null,
        caseLocator: null,
        decisionId: null,
        authorityLocator: null,
        sourceUrl: null,
      };
      const seenKinds = new Set<string>();

      for (const metadata of metadataControls) {
        const field = ANCHOR_METADATA_KIND[metadata.kind];
        const belongsToAnchor = metadata.stableId
          ? metadata.stableId === anchorControl.stableId
          : anchorControls.length === 1;
        if (!belongsToAnchor) {
          // Metadata that names another anchor is reported, never reassigned.
          addWarning(`${WARNING.ORPHAN_ANCHOR_METADATA}:${metadata.kind}`);
          continue;
        }
        if (!metadata.stableId) {
          addWarning(`${WARNING.LOOSE_ANCHOR_METADATA}:${metadata.kind}`);
        }
        if (seenKinds.has(metadata.kind) || fields[field] !== null) {
          addWarning(`${WARNING.DUPLICATE_ANCHOR_METADATA}:${metadata.kind}`);
          continue;
        }
        const text = controlText(metadata).value;
        if (!text) continue;
        seenKinds.add(metadata.kind);
        fields[field] = text;
      }

      rows.push({
        clauseRef: clause.value,
        clauseTitle: clauseControl.alias && clauseControl.alias !== clause.value ? clauseControl.alias : null,
        clauseStableId: clauseControl.stableId,
        relationTypeRaw,
        anchorType: ANCHOR_CONTROL_KIND[anchorControl.kind],
        anchorDisplay: anchor.value,
        anchorStableId: anchorControl.stableId,
        eli: fields.eli,
        celex: fields.celex,
        locator: fields.locator,
        ecli: fields.ecli,
        caseId: fields.caseId,
        caseLocator: fields.caseLocator,
        decisionId: fields.decisionId,
        authorityLocator: fields.authorityLocator,
        sourceUrl: fields.sourceUrl,
        rationale,
        warnings: rowWarnings,
      });
    }
  }

  return { rows, warnings, stats };
}

/**
 * Parse an INTERNAL_ANALYSIS compliance master DOCX into clause x anchor rows.
 * Container/XML problems throw a bounded error; callers treat that as non-fatal.
 */
export async function parseComplianceMasterDocx(buffer: Buffer): Promise<DocxParseOutcome> {
  const read = await readDocxContentControlRows(buffer);
  return extractClauseAnchorRows(read);
}
