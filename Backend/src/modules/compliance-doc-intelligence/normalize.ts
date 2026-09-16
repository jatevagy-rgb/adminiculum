/**
 * CDI-1 — normalization of extracted clause/anchor rows.
 *
 * Everything here is deterministic and derived only from machine metadata that
 * the document actually transports. Nothing is derived from human display text:
 * a row without enough machine metadata keeps `anchorKey = null` and carries an
 * internal warning instead of a synthesised key.
 */
import { createHash } from 'node:crypto';
import {
  KNOWN_RELATION_TYPES,
  MAX_RELATION_TYPE_LENGTH,
  UNSPECIFIED_RELATION_TYPE,
  WARNING,
  type ComplianceAnchorTypeValue,
  type ExtractedClauseAnchorRow,
} from './types';

/** Persist-ready row after normalization. */
export interface NormalizedClauseAnchorRow {
  clauseRef: string;
  clauseTitle: string | null;
  clauseStableId: string | null;
  relationType: string;
  anchorType: ComplianceAnchorTypeValue;
  anchorDisplay: string;
  anchorStableId: string | null;
  anchorKey: string | null;
  eli: string | null;
  celex: string | null;
  locator: string | null;
  ecli: string | null;
  caseId: string | null;
  caseLocator: string | null;
  decisionId: string | null;
  authorityLocator: string | null;
  sourceUrl: string | null;
  rationale: string | null;
  warnings: string[];
}

/** Whitespace is collapsed, never removed: the source value stays readable. */
export function collapseWhitespace(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const collapsed = String(value).replace(/\s+/g, ' ').trim();
  return collapsed.length ? collapsed : null;
}

/**
 * Normalize an ADM-RELTYPE value: trim, uppercase, collapse whitespace.
 *
 * The value is preserved as transported. A token outside the documented
 * vocabulary raises an informational warning but is never rewritten into
 * another relation meaning, and never requires a schema change.
 */
export function normalizeRelationType(raw: string | null | undefined): {
  value: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  const collapsed = collapseWhitespace(raw);
  if (!collapsed) {
    return { value: UNSPECIFIED_RELATION_TYPE, warnings: [WARNING.RELATION_TYPE_MISSING] };
  }

  const token = collapsed.toUpperCase();
  if (token.length > MAX_RELATION_TYPE_LENGTH) {
    // The stored value is bounded; an over-long token is not silently truncated.
    return { value: UNSPECIFIED_RELATION_TYPE, warnings: [WARNING.RELATION_TYPE_UNPARSEABLE] };
  }
  if (!/^[A-Z0-9_]+$/.test(token)) {
    warnings.push(WARNING.RELATION_TYPE_UNPARSEABLE);
  }
  if (!KNOWN_RELATION_TYPES.has(token)) {
    warnings.push(`${WARNING.UNKNOWN_RELATION_TYPE}:${token}`);
  }
  return { value: token, warnings };
}

export interface AnchorKeyInput {
  anchorType: ComplianceAnchorTypeValue;
  anchorStableId: string | null;
  eli: string | null;
  celex: string | null;
  locator: string | null;
  ecli: string | null;
  caseId: string | null;
  caseLocator: string | null;
  decisionId: string | null;
  authorityLocator: string | null;
}

/**
 * Build the monitoring lookup key for one anchor.
 *
 * Precedence (approved rule):
 *   1. the explicit stable anchor id the document transports in the control tag
 *   2. LEGAL     ELI + locator, otherwise CELEX + locator
 *      CASE      ECLI, otherwise caseId, plus caseLocator
 *      AUTHORITY decisionId, plus authorityLocator
 *   3. null — the row is still preserved, with an unresolved-anchor warning.
 *
 * `sourceUrl` is supporting metadata and deliberately never forms the key.
 */
export function buildAnchorKey(input: AnchorKeyInput): { key: string | null; warnings: string[] } {
  const warnings: string[] = [];
  const stableId = collapseWhitespace(input.anchorStableId);
  if (stableId) {
    return { key: `${input.anchorType}|SID=${stableId}`, warnings };
  }

  const eli = collapseWhitespace(input.eli);
  const celex = collapseWhitespace(input.celex);
  const locator = collapseWhitespace(input.locator);
  const ecli = collapseWhitespace(input.ecli);
  const caseId = collapseWhitespace(input.caseId);
  const caseLocator = collapseWhitespace(input.caseLocator);
  const decisionId = collapseWhitespace(input.decisionId);
  const authorityLocator = collapseWhitespace(input.authorityLocator);

  switch (input.anchorType) {
    case 'LEGAL': {
      if (eli) return { key: `LEGAL|ELI=${eli}${locator ? `|LOC=${locator}` : ''}`, warnings };
      if (celex) return { key: `LEGAL|CELEX=${celex}${locator ? `|LOC=${locator}` : ''}`, warnings };
      break;
    }
    case 'CASE': {
      if (ecli) return { key: `CASE|ECLI=${ecli}${caseLocator ? `|LOC=${caseLocator}` : ''}`, warnings };
      if (caseId) return { key: `CASE|ID=${caseId}${caseLocator ? `|LOC=${caseLocator}` : ''}`, warnings };
      break;
    }
    case 'AUTHORITY': {
      if (decisionId) {
        return { key: `AUTHORITY|DEC=${decisionId}${authorityLocator ? `|LOC=${authorityLocator}` : ''}`, warnings };
      }
      break;
    }
    default:
      break;
  }

  warnings.push(WARNING.ANCHOR_KEY_UNRESOLVED);
  return { key: null, warnings };
}

/** Field order of the idempotency digest. Semantic fields only. */
const ROW_DIGEST_FIELDS: Array<keyof NormalizedClauseAnchorRow> = [
  'clauseRef',
  'clauseTitle',
  'clauseStableId',
  'relationType',
  'anchorType',
  'anchorDisplay',
  'anchorStableId',
  'anchorKey',
  'eli',
  'celex',
  'locator',
  'ecli',
  'caseId',
  'caseLocator',
  'decisionId',
  'authorityLocator',
  'sourceUrl',
  'rationale',
];

/**
 * sha256 over the normalized semantic row. Deliberately independent of raw XML
 * formatting, of parser warnings and of ingestion timestamps, so re-ingesting
 * the same DocumentVersion produces exactly the same digest set.
 */
export function computeRowDigest(row: NormalizedClauseAnchorRow): string {
  const payload = ROW_DIGEST_FIELDS.map((field) => {
    const value = row[field];
    return value === null || value === undefined ? '' : String(value);
  });
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/** Turn one extracted row into its persist-ready normalized form. */
export function normalizeExtractedRow(row: ExtractedClauseAnchorRow): NormalizedClauseAnchorRow {
  const relation = normalizeRelationType(row.relationTypeRaw);
  const warnings = [...row.warnings, ...relation.warnings];
  const anchor = buildAnchorKey({
    anchorType: row.anchorType,
    anchorStableId: row.anchorStableId,
    eli: row.eli,
    celex: row.celex,
    locator: row.locator,
    ecli: row.ecli,
    caseId: row.caseId,
    caseLocator: row.caseLocator,
    decisionId: row.decisionId,
    authorityLocator: row.authorityLocator,
  });
  warnings.push(...anchor.warnings);

  return {
    clauseRef: row.clauseRef,
    clauseTitle: collapseWhitespace(row.clauseTitle),
    clauseStableId: collapseWhitespace(row.clauseStableId),
    relationType: relation.value,
    anchorType: row.anchorType,
    anchorDisplay: row.anchorDisplay,
    anchorStableId: collapseWhitespace(row.anchorStableId),
    anchorKey: anchor.key,
    eli: collapseWhitespace(row.eli),
    celex: collapseWhitespace(row.celex),
    locator: collapseWhitespace(row.locator),
    ecli: collapseWhitespace(row.ecli),
    caseId: collapseWhitespace(row.caseId),
    caseLocator: collapseWhitespace(row.caseLocator),
    decisionId: collapseWhitespace(row.decisionId),
    authorityLocator: collapseWhitespace(row.authorityLocator),
    sourceUrl: collapseWhitespace(row.sourceUrl),
    rationale: collapseWhitespace(row.rationale),
    warnings: [...new Set(warnings)].sort(),
  };
}
