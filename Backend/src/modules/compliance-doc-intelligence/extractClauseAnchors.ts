/**
 * CDI-1 — clause x anchor extraction from the controlled row structure.
 *
 * One matrix row produces ONE relation per anchor control it contains. A row
 * without an anchor content control carries no machine anchor identity at all,
 * so it is skipped with an internal warning rather than having an anchor
 * invented from its display text.
 */
import { readDocxContentControlRows, type ContentControlReadResult } from './contentControls';
import { parseCanonicalLegalReference } from './canonicalLegalReference';
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

/** The row's ADM-RELTYPE relation, if the row transports one. */
function relationOf(admControls: ParsedControl[]): { value: string | null; label: string | null } {
  const control = admControls.find((item) => item.kind === RELATION_TYPE_CONTROL_KIND);
  if (!control) return { value: null, label: null };
  const relation = relationTypeText(control);
  return { value: relation.value || null, label: relation.label };
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
    hyperlinkLegalAnchors: 0,
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
      // C4A: an ALTERNATIVE legal-anchor transport. Only a row with NO ADM anchor
      // control may derive LEGAL anchors from canonical hyperlink targets, and
      // only from the structural target — never from the visible text. Ordinary
      // http(s) links stay ordinary content and produce nothing here.
      const derived: Array<{ canonicalReference: string; locator: string | null; display: string }> = [];
      const seenReferences = new Set<string>();
      for (const hyperlink of row.cells.flatMap((cell) => cell.hyperlinks)) {
        if (hyperlink.relationshipId && !hyperlink.target) {
          addWarning(`${WARNING.HYPERLINK_RELATIONSHIP_UNRESOLVED}:row=${row.index}`);
          continue;
        }
        const parsed = parseCanonicalLegalReference(hyperlink.target);
        if (!parsed) continue;
        if (!hyperlink.text) {
          addWarning(`${WARNING.HYPERLINK_LEGAL_ANCHOR_NO_DISPLAY}:row=${row.index}`);
          continue;
        }
        // Deterministic: the first occurrence of a reference wins, and one
        // canonical hyperlink produces exactly one relation.
        if (seenReferences.has(parsed.canonicalReference)) continue;
        seenReferences.add(parsed.canonicalReference);
        derived.push({ canonicalReference: parsed.canonicalReference, locator: parsed.locator, display: hyperlink.text });
      }
      if (derived.length === 0) {
        stats.rowsWithoutAnchor += 1;
        addWarning(`${WARNING.ROW_WITHOUT_ANCHOR_CONTROL}:row=${row.index}`);
        continue;
      }

      addWarning(WARNING.HYPERLINK_LEGAL_ANCHOR_USED);
      const derivedRelation = relationOf(admControls);
      if (derivedRelation.label) {
        addWarning(`${WARNING.RELATION_TYPE_SOURCE_LABEL}:${derivedRelation.label}`);
      }
      for (const item of derived) {
        if (rows.length >= MAX_ROWS_PER_DOCUMENT) {
          addWarning(WARNING.ROW_LIMIT_REACHED);
          return { rows, warnings, stats };
        }
        const rowWarnings: string[] = [];
        if (clause.fromAlias) rowWarnings.push(WARNING.CLAUSE_VALUE_FROM_ALIAS);
        rows.push({
          clauseRef: clause.value,
          clauseTitle: clauseControl.alias && clauseControl.alias !== clause.value ? clauseControl.alias : null,
          clauseStableId: clauseControl.stableId,
          relationTypeRaw: derivedRelation.value,
          anchorType: 'LEGAL',
          anchorDisplay: item.display,
          anchorStableId: null,
          eli: null,
          celex: null,
          locator: item.locator,
          ecli: null,
          caseId: null,
          caseLocator: null,
          decisionId: null,
          authorityLocator: null,
          sourceUrl: null,
          rationale,
          canonicalReference: item.canonicalReference,
          warnings: rowWarnings,
        });
        stats.hyperlinkLegalAnchors += 1;
      }
      continue;
    }

    const relation = relationOf(admControls);
    const relationTypeRaw = relation.value;
    if (relation.label) {
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
