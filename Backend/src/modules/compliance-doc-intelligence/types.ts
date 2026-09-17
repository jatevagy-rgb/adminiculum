/**
 * CDI-1 — Compliance document intelligence: internal vocabulary, bounds and types.
 *
 * This module reads the structural metadata that an INTERNAL_ANALYSIS compliance
 * master DOCX carries in Word Developer Content Controls (the ADM-* convention).
 * It is INTERNAL analysis metadata: nothing here is client-safe, and no value in
 * this module may be projected through the client portal.
 *
 * Design rules encoded here:
 * - The controlled machine values are authoritative. Human-readable display text
 *   is never used to synthesise a monitoring key.
 * - A missing machine value stays missing. Nothing is invented or inferred.
 * - Unknown but syntactically valid values are preserved verbatim.
 */

/** WordprocessingML main namespace. */
export const WORDPROCESSINGML_NAMESPACE =
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Part that carries the compliance master matrix. */
export const DOCX_MAIN_PART = 'word/document.xml';

/** Relationships part of the main document. Resolves `w:hyperlink r:id`. */
export const DOCX_RELS_PART = 'word/_rels/document.xml.rels';

/** OpenXML relationships namespace (the `r:` attribute prefix). */
export const RELATIONSHIPS_NAMESPACE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Every compliance control tag starts with this prefix. */
export const ADM_TAG_PREFIX = 'ADM-';

export type ComplianceAnchorTypeValue = 'LEGAL' | 'CASE' | 'AUTHORITY';

/** ADM-<KIND> -> anchor source type. Closed vocabulary (DECISION 2). */
export const ANCHOR_CONTROL_KIND: Record<string, ComplianceAnchorTypeValue> = {
  'ADM-LEGALANCHOR': 'LEGAL',
  'ADM-CASEANCHOR': 'CASE',
  'ADM-AUTHORITYANCHOR': 'AUTHORITY',
};

export type AnchorMetadataField =
  | 'eli'
  | 'celex'
  | 'locator'
  | 'ecli'
  | 'caseId'
  | 'caseLocator'
  | 'decisionId'
  | 'authorityLocator'
  | 'sourceUrl';

/** ADM-<KIND> -> structured anchor metadata field. */
export const ANCHOR_METADATA_KIND: Record<string, AnchorMetadataField> = {
  'ADM-ELI': 'eli',
  'ADM-CELEX': 'celex',
  'ADM-LOCATOR': 'locator',
  'ADM-ECLI': 'ecli',
  'ADM-CASEID': 'caseId',
  'ADM-CASELOCATOR': 'caseLocator',
  'ADM-DECISIONID': 'decisionId',
  'ADM-AUTHORITYLOCATOR': 'authorityLocator',
  'ADM-SOURCEURL': 'sourceUrl',
};

export const CLAUSE_CONTROL_KIND = 'ADM-CLAUSE';
export const RELATION_TYPE_CONTROL_KIND = 'ADM-RELTYPE';

/**
 * Recognized ADM kinds that carry no clause/anchor field of the approved model.
 * ADM-DOCREF / ADM-LEGALREF / ADM-PROVISION are observed in real masters and must
 * not be treated as malformed controls.
 */
export const RECOGNIZED_NON_FIELD_KINDS: ReadonlySet<string> = new Set([
  'ADM-DOCREF',
  'ADM-LEGALREF',
  'ADM-PROVISION',
]);

/**
 * Explicit missing state for a row whose document carries no ADM-RELTYPE.
 * This is not a relation type and never means anything else.
 */
export const UNSPECIFIED_RELATION_TYPE = 'UNSPECIFIED';

/** relationType is stored as a bounded machine token, not a Prisma enum. */
export const MAX_RELATION_TYPE_LENGTH = 64;

/** Bounded internal processing limits. A larger document is refused, not parsed. */
export const MAX_DOCUMENT_XML_BYTES = 40 * 1024 * 1024;
export const MAX_ROWS_PER_DOCUMENT = 5000;
export const MAX_WARNINGS_PER_RESULT = 64;
/** Bounded relationship-part read and hyperlink collection (same order as rows). */
export const MAX_RELS_XML_BYTES = 4 * 1024 * 1024;
export const MAX_RELATIONSHIPS_PER_DOCUMENT = 5000;
export const MAX_HYPERLINKS_PER_DOCUMENT = 5000;

/**
 * Documented + OBSERVED relation vocabulary (106 distinct tokens read from 23
 * real masters in the JOULE CRM corpus). Used ONLY to raise an internal
 * informational warning for an unfamiliar-but-valid token: it never rejects,
 * rewrites or normalizes a value, and adding a new token never requires a
 * migration.
 */
export const KNOWN_RELATION_TYPES: ReadonlySet<string> = new Set([
  // Documented in the CDI-1 architecture decision.
  'MANDATORY_BASIS',
  'LEGAL_LIMIT',
  'ROLE_DEFINITION',
  'CONTRACTUAL_CHOICE',
  'CONTRACTUAL_FRAMEWORK',
  'CONDITIONAL_MANDATORY',
  'MANDATORY_INFO',
  // Observed in real masters.
  'ACCOUNTABILITY',
  'ADEQUACY_MECHANISM',
  'AUTHORITY_CONTROL',
  'AUTHORIZED_PROCESSING',
  'AUTOMATED_DECISION_DISCLOSURE',
  'AUTOMATED_DECISION_RIGHT',
  'CASELAW_INTERPRETATION',
  'CONDITIONAL_CROSS_BORDER',
  'CONDITIONAL_EXCEPTION',
  'CONDITIONAL_REQUIREMENT',
  'CONDITIONAL_TRANSFER_BASIS',
  'CONFIDENTIALITY',
  'CONFLICTS_RULE',
  'CONFLICT_GUARDRAIL',
  'CONSENT_REQUIREMENT',
  'CONSENT_WITHDRAWAL',
  'CONTRACTUAL_ALLOCATION',
  'CONTRACTUAL_GUARDRAIL',
  'CONTRACTUAL_IMPLEMENTATION',
  'CONTRACT_FORMATION',
  'CONTRACT_PARTY_SEPARATION',
  'COOKIE_RULE',
  'CORRECTION_CONSEQUENCE',
  'DATA_MINIMISATION',
  'DATA_PROCESSOR_CONTRACT',
  'DATA_PROTECTION_CONTEXT',
  'DATA_PROTECTION_PRINCIPLE',
  'DATA_PROTECTION_ROLE',
  'DATA_SUBJECT_RIGHT',
  'DEADLINE_BASIS',
  'DOCUMENTATION_BASIS',
  'DOCUMENTATION_DUTY',
  'ENFORCEMENT_BENCHMARK',
  'EVIDENCE_CONTEXT',
  'EVIDENCE_RETENTION',
  'EXEMPTION_RULE',
  'FURTHER_PURPOSE_NOTICE',
  'INCIDENT_DUTY',
  'INDEPENDENCE_STANDARD',
  'INDIRECT_DATA_CATEGORY',
  'INDIRECT_RECIPIENT_TRANSPARENCY',
  'INDIRECT_SOURCE_DISCLOSURE',
  'INDIRECT_TRANSPARENCY',
  'INTEGRITY_CONFIDENTIALITY',
  'INTERPRETATION',
  'JUDICIAL_REMEDY',
  'JURISDICTION_CONTEXT',
  'LEGAL_BASIS',
  'LEGAL_CONSEQUENCE',
  'LEGAL_GUARDRAIL',
  'LEGAL_PROTECTION',
  'LIABILITY_BASELINE',
  'MANDATORY_EVIDENCE',
  'MANDATORY_INFORMATION',
  'OUTPUT_DUTY',
  'PERSONALITY_RIGHT',
  'PRECONDITION_DOCUMENTATION',
  'PROCESSOR_FRAMEWORK',
  'PROCESSOR_INSTRUCTION',
  'PROFESSIONAL_CONTENT',
  'PROFESSIONAL_RESPONSIBILITY',
  'PROFESSIONAL_RESULT',
  'PROFESSIONAL_SCOPE',
  'PROFESSIONAL_STANDARD',
  'PROHIBITION',
  'RECIPIENT_TRANSPARENCY',
  'REGISTRY_CONTENT',
  'REGISTRY_OBLIGATION',
  'REGISTRY_REPORTING',
  'REQUEST_DEADLINE',
  'RETENTION',
  'RETENTION_BASIS',
  'RETENTION_REQUIREMENT',
  'ROLE_ALLOCATION',
  'ROLE_DEPENDENT',
  'ROLE_GUARDRAIL',
  'SAFEGUARD_MECHANISM',
  'SCC_MECHANISM',
  'SECTORAL_BASIS',
  'SECURITY_CONTEXT',
  'SECURITY_CONTROL',
  'SECURITY_REQUIREMENT',
  'SECURITY_RISK_ASSESSMENT',
  'STATUTORY_BASELINE',
  'STATUTORY_CONTEXT',
  'STATUTORY_DEFAULT',
  'STATUTORY_MODEL',
  'STORAGE_LIMITATION',
  'SUBPROCESSOR_AUTHORIZATION',
  'SUBPROCESSOR_FLOWDOWN',
  'SUPERVISORY_REMEDY',
  'SURVIVAL_RETENTION',
  'TRANSFER_REQUIREMENT',
  'TRANSFER_TRANSPARENCY',
  'TRANSPARENCY_REQUIREMENT',
  'UI_MANDATORY_GATE',
  'VERIFICATION_BASIS',
]);

/** Internal warning codes. Row-level codes are persisted on the row. */
export const WARNING = {
  RELATION_TYPE_MISSING: 'RELATION_TYPE_MISSING',
  RELATION_TYPE_UNPARSEABLE: 'RELATION_TYPE_UNPARSEABLE',
  CLAUSE_VALUE_MISSING: 'CLAUSE_VALUE_MISSING',
  CLAUSE_VALUE_FROM_ALIAS: 'CLAUSE_VALUE_FROM_ALIAS',
  PENDING_ANCHOR_CONTROL: 'PENDING_ANCHOR_CONTROL',
  ANCHOR_DISPLAY_FROM_ALIAS: 'ANCHOR_DISPLAY_FROM_ALIAS',
  ANCHOR_KEY_UNRESOLVED: 'ANCHOR_KEY_UNRESOLVED',
  ORPHAN_ANCHOR_METADATA: 'ORPHAN_ANCHOR_METADATA',
  LOOSE_ANCHOR_METADATA: 'LOOSE_ANCHOR_METADATA',
  LEGACY_CITATION_COLUMNS: 'LEGACY_CITATION_COLUMNS',
  DUPLICATE_ANCHOR_METADATA: 'DUPLICATE_ANCHOR_METADATA',
  ROW_WITHOUT_ANCHOR_CONTROL: 'ROW_WITHOUT_ANCHOR_CONTROL',
  ROW_WITHOUT_CLAUSE_CONTROL: 'ROW_WITHOUT_CLAUSE_CONTROL',
  CONTROL_OUTSIDE_TABLE_ROW: 'CONTROL_OUTSIDE_TABLE_ROW',
  TAG_MALFORMED: 'TAG_MALFORMED',
  UNKNOWN_ADM_CONTROL_KIND: 'UNKNOWN_ADM_CONTROL_KIND',
  UNKNOWN_RELATION_TYPE: 'UNKNOWN_RELATION_TYPE',
  MULTILINE_CONTROL_VALUE: 'MULTILINE_CONTROL_VALUE',
  RELATION_TYPE_SOURCE_LABEL: 'RELATION_TYPE_SOURCE_LABEL',
  ROW_LIMIT_REACHED: 'ROW_LIMIT_REACHED',
  XML_UNCLOSED_ELEMENTS: 'XML_UNCLOSED_ELEMENTS',
  // C4A hyperlink transport (internal observations only).
  HYPERLINK_LEGAL_ANCHOR_USED: 'HYPERLINK_LEGAL_ANCHOR_USED',
  HYPERLINK_LEGAL_ANCHOR_NO_DISPLAY: 'HYPERLINK_LEGAL_ANCHOR_NO_DISPLAY',
  HYPERLINK_RELATIONSHIP_UNRESOLVED: 'HYPERLINK_RELATIONSHIP_UNRESOLVED',
  HYPERLINK_LIMIT_REACHED: 'HYPERLINK_LIMIT_REACHED',
} as const;

export type WarningCode = (typeof WARNING)[keyof typeof WARNING];

/** One Word content control as found in the document body. */
export interface ParsedControl {
  /** Raw `w:tag` value, e.g. "ADM-LEGALANCHOR:la_baa4796f2169". */
  tag: string;
  /** Tag kind token, e.g. "ADM-LEGALANCHOR". */
  kind: string;
  /** Explicit stable machine id carried after the colon, when present. */
  stableId: string | null;
  /** `w:alias` value, trimmed; null when the control carries no alias. */
  alias: string | null;
  /** Controlled text (inside `w:sdtContent`), whitespace-collapsed and trimmed. */
  value: string;
  /**
   * The same controlled text split into its transported lines. Real masters put
   * a source label and the machine token on separate lines inside one control.
   */
  lines: string[];
}

/**
 * One Word hyperlink as found in the document body. The target is resolved
 * structurally through the relationship table; the visible text is display only
 * and is never parsed for identity.
 */
export interface ParsedHyperlink {
  /** `r:id` of the relationship, when the hyperlink carries one. */
  relationshipId: string | null;
  /** Resolved relationship target, or null when it cannot be resolved. */
  target: string | null;
  /** Visible hyperlink text, whitespace-collapsed and trimmed. */
  text: string;
}

export interface ParsedTableCell {
  index: number;
  /** Cell text that is NOT inside any content control. */
  plainText: string;
  controls: ParsedControl[];
  /** Hyperlinks that appear in the cell, in document order. */
  hyperlinks: ParsedHyperlink[];
}

export interface ParsedRow {
  /** 0-based document order among `w:tr` elements. */
  index: number;
  cells: ParsedTableCell[];
}

/** One extracted clause x anchor relation, before normalization/persistence. */
export interface ExtractedClauseAnchorRow {
  clauseRef: string;
  clauseTitle: string | null;
  clauseStableId: string | null;
  /** Raw ADM-RELTYPE value as transported, or null when the row carries none. */
  relationTypeRaw: string | null;
  anchorType: ComplianceAnchorTypeValue;
  anchorDisplay: string;
  anchorStableId: string | null;
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
  /**
   * C4A: canonical reference derived from a row hyperlink target
   * (`TV/<year>/<act>/<opaque-tail>`), when the row carries no ADM anchor
   * control. Null for every legacy ADM transport.
   */
  canonicalReference?: string | null;
  warnings: string[];
}

export interface DocxParseStats {
  /** Rows that carried at least one ADM control. */
  admLinks: number;
  /** Rows skipped because they carried no anchor content control. */
  rowsWithoutAnchor: number;
  /** Rows skipped because they carried no ADM-CLAUSE control. */
  rowsWithoutClause: number;
  /** Controls found outside any table row. */
  controlsOutsideTableRow: number;
  /** C4A: legal anchors derived from canonical hyperlink targets. */
  hyperlinkLegalAnchors: number;
}

export interface DocxParseOutcome {
  rows: ExtractedClauseAnchorRow[];
  warnings: string[];
  stats: DocxParseStats;
}

/** Terminal outcomes of one ingestion attempt. Never thrown to the caller. */
export type IngestStatus =
  | 'CREATED'
  | 'UNCHANGED'
  | 'INGEST_DRIFT'
  | 'NO_ROWS'
  | 'SKIPPED_NOT_INTERNAL_ANALYSIS'
  | 'FAILED';

export interface IngestResult {
  status: IngestStatus;
  documentVersionId: string | null;
  documentId: string | null;
  /** Rows extracted by the parser for this version. */
  parsedRows: number;
  /** Rows written by this attempt. */
  insertedRows: number;
  /** Rows already persisted for this version before the attempt. */
  existingRows: number;
  warnings: string[];
  /** Bounded internal failure code, e.g. "CONTENT_UNAVAILABLE". */
  code?: string;
}
