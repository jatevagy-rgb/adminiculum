/**
 * C5A — Hungarian ELI act-type and ELI subdivision reference data (DATA ONLY).
 *
 * This module is pure static data: no Prisma, no database, no network, no
 * background lookup, no runtime registration. Adding a newly verified type code
 * or subdivision code is a DATA update here — never a Prisma migration.
 *
 * AUTHORITATIVE SOURCES (verified 2026-09-20):
 *  - Hungarian act type codes:
 *      https://njt.hu/eli/tipuskodok   ("A linkben használható típus rövidítések")
 *  - Hungarian ELI URI schemes (act-identity arity):
 *      https://njt.hu/eli/urisemak     ("Az Európai jogszabály-azonosító hazai
 *                                       implementációjában használható hivatkozási séma")
 *  - EU ELI subdivision controlled vocabulary:
 *      http://publications.europa.eu/resource/authority/subdivision
 *      concept scheme version 20260617-0 (labels resolved through the
 *      Publications Office SPARQL endpoint on the verification date)
 *
 * FAIL CLOSED > GUESS. A type code listed by NJT but whose act-identity arity is
 * not proven by an NJT URI scheme is deliberately NOT in ELI_ACT_TYPES; it is
 * recorded in ELI_UNVERIFIED_ACT_TYPES so a later slice can promote it with
 * evidence, as a data-only change.
 */

/** Date on which the values in this file were checked against the sources above. */
export const ELI_REFERENCE_VERIFIED_ON = '2026-09-20';

export interface EliReferenceSource {
  url: string;
  title: string;
  /** Exact dataset/table version when the source publishes one; null otherwise. */
  version: string | null;
}

export const ELI_ACT_TYPE_SOURCE: EliReferenceSource = {
  url: 'https://njt.hu/eli/tipuskodok',
  title: 'NJT — A linkben használható típus rövidítések táblázata',
  version: null,
};

export const ELI_ACT_URI_SCHEME_SOURCE: EliReferenceSource = {
  url: 'https://njt.hu/eli/urisemak',
  title: 'NJT — Az Európai jogszabály-azonosító hazai implementációjában használható hivatkozási séma',
  version: null,
};

export const ELI_SUBDIVISION_SOURCE: EliReferenceSource = {
  url: 'http://publications.europa.eu/resource/authority/subdivision',
  title: 'EU Publications Office — Subdivision authority table',
  version: '20260617-0',
};

/**
 * Positional identity-segment kinds after the act type code.
 *
 * The kind is a bounded SHAPE, not a closed registry:
 *  - `year`          four-digit year (NJT: "négyjegyű formában: ÉÉÉÉ")
 *  - `serial`        the NJT `{sr}` act serial number
 *  - `issuer`        the NJT `{kib}` issuer abbreviation
 *  - `municipality`  the NJT `{orkib}` KSH settlement code of a local government
 *
 * The issuer and municipality CONTROLLED LISTS are separate NJT vocabularies
 * (https://njt.hu/eli/kibocsatokodok, https://njt.hu/eli/kshkodok) and are NOT
 * closed in C5A: only the transport-safe shape is checked here.
 */
export type EliActIdentitySegmentKind = 'year' | 'serial' | 'issuer' | 'municipality';

export interface EliActTypeDefinition {
  /** Exact, case-sensitive NJT type code, e.g. "TV". */
  code: string;
  /** Hungarian name exactly as published by NJT. */
  label: string;
  /** Ordered act-identity segments that a reference to one act must carry. */
  identitySegments: readonly EliActIdentitySegmentKind[];
}

/**
 * Act types whose act-identity arity is proven by an explicit NJT URI scheme.
 *
 * Derived from https://njt.hu/eli/urisemak:
 *  - `Alaptv[/{date}]`                      → type only (the date is a version
 *                                             selector, not part of identity)
 *  - `ATV_MOD[/{sr}]`                       → + serial
 *  - `AlapAt/{ev}[/{sr}/...]`               → + year, serial
 *  - `ALK_MOD/{ev}[/{sr}/...]`              → + year, serial
 *  - `TV|TVI|TVR|HELY|KOZL/{ev}[/{sr}/...]` → + year, serial
 *  - `H|INTEZK|POL_NY|R|REK|UT/{ev}/{kib}[/{sr}/...]`
 *                                           → + year, issuer, serial
 *  - `OR/{ev}/{orkib}[/{sr}/...]`           → + year, municipality, serial
 *
 * The optional trailing `{date}/{nyelv}/{ffmt}` transport parameters of the NJT
 * scheme are NOT act identity and are therefore not part of this grammar.
 */
export const ELI_ACT_TYPES: readonly EliActTypeDefinition[] = [
  { code: 'Alaptv', label: 'Alaptörvény', identitySegments: [] },
  { code: 'ATV_MOD', label: 'Alaptörvény módosítása', identitySegments: ['serial'] },
  { code: 'AlapAt', label: 'Alaptörvény Átmeneti Rendelkezései', identitySegments: ['year', 'serial'] },
  { code: 'ALK_MOD', label: 'alkotmánymódosítás', identitySegments: ['year', 'serial'] },
  { code: 'TV', label: 'törvény', identitySegments: ['year', 'serial'] },
  { code: 'TVI', label: 'törvény indokolás', identitySegments: ['year', 'serial'] },
  { code: 'TVR', label: 'törvényerejű rendelet', identitySegments: ['year', 'serial'] },
  { code: 'HELY', label: 'helyesbítés', identitySegments: ['year', 'serial'] },
  { code: 'KOZL', label: 'közlemény', identitySegments: ['year', 'serial'] },
  { code: 'H', label: 'határozat', identitySegments: ['year', 'issuer', 'serial'] },
  { code: 'INTEZK', label: 'intézkedés', identitySegments: ['year', 'issuer', 'serial'] },
  { code: 'POL_NY', label: 'politikai nyilatkozat', identitySegments: ['year', 'issuer', 'serial'] },
  { code: 'R', label: 'rendelet', identitySegments: ['year', 'issuer', 'serial'] },
  { code: 'REK', label: 'rendelkezés', identitySegments: ['year', 'issuer', 'serial'] },
  { code: 'UT', label: 'utasítás', identitySegments: ['year', 'issuer', 'serial'] },
  { code: 'OR', label: 'önkormányzati rendelet', identitySegments: ['year', 'municipality', 'serial'] },
];

/**
 * Type codes NJT publishes but whose act-identity arity C5A does NOT treat as
 * verified. They are rejected as UNKNOWN_ACT_TYPE (fail closed), not guessed:
 *
 *  - `AtvI` / `AtvMI`: justification documents of the Fundamental Law; NJT does
 *    not publish an explicit URI scheme for them, and the Alaptörvény has no
 *    year/issuer, so the generic `{tip}/{ev}/{kib}` form cannot be assumed.
 *  - `RI`: reused by NJT for both "rendelet indokolás" (issuer form) and the
 *    local-government "Rendelet indokolás" (municipality form); the second
 *    identity segment kind is therefore ambiguous.
 *  - `_KOZL`: a malformed/duplicated rendering of `KOZL` in the published type
 *    table; it is not adopted as a distinct act type.
 */
export const ELI_UNVERIFIED_ACT_TYPES: readonly string[] = ['AtvI', 'AtvMI', 'RI', '_KOZL'];

/**
 * The EU "Subdivision" controlled vocabulary (concept scheme 20260617-0),
 * lowercased to the ELI URI segment form. This is the exact verified code set —
 * no code was added or removed by assumption.
 *
 * Every code in the scheme is three lowercase letters except `OP_DATPRO`
 * ("Provisional data"), which is explicitly excluded here: it is not a
 * structural legal subdivision and does not fit the three-letter ELI segment
 * form. No other code was excluded.
 */
export const ELI_SUBDIVISION_CODES: readonly string[] = [
  'ace', 'act', 'agr', 'aln', 'anx', 'app', 'art', 'cgr', 'cit', 'cls', 'cnv', 'col', 'cor', 'cpt',
  'dcl', 'des', 'dia', 'enc', 'end', 'enf', 'exl', 'exm', 'fgr', 'fna', 'fnp', 'ftn', 'idt', 'img',
  'inp', 'iti', 'itm', 'lfd', 'lgd', 'llg', 'lst', 'ltr', 'mnt', 'not', 'oth', 'pag', 'par', 'pbl',
  'pcd', 'pnt', 'pro', 'prt', 'pta', 'pti', 'rct', 'row', 'rul', 'sbs', 'sct', 'sfr', 'snt', 'sub',
  'tab', 'tbg', 'tbh', 'tis', 'tit', 'toc', 'txn', 'txo', 'unp', 'wrp',
];

/**
 * Identifier cardinality of one subdivision code.
 *
 *  - `REQUIRED`  the code cannot form a canonical identity without `_<identifier>`
 *  - `FIXED_ONE` the code is a deterministic singleton; the canonical identifier
 *                is exactly `1` (so `pbl_1`, never bare `pbl`)
 *  - `OPTIONAL`  the code may appear with or without an identifier — reserved for
 *                a form PROVEN by authoritative material; currently unused
 */
export type EliSubdivisionIdentifierRequirement = 'REQUIRED' | 'FIXED_ONE' | 'OPTIONAL';

export interface EliSubdivisionIdentifierPolicy {
  requirement: EliSubdivisionIdentifierRequirement;
  /** For `FIXED_ONE`, the only accepted identifier. */
  fixedIdentifier?: string;
  /** Provenance: `EU` only when the authoritative source itself proves the rule. */
  source: 'EU' | 'ADMINICULUM_CANONICALIZATION_POLICY';
  note: string;
}

/**
 * Canonical identifier requirement per subdivision code.
 *
 * FAIL-CLOSED DEFAULT — any code absent from this map is treated as `REQUIRED`.
 * Codes whose usage has not been proven therefore stay non-canonical in bare form
 * without forcing policy metadata for all 66 verified codes.
 *
 * SOURCE FACT vs POLICY. The EU "Subdivision" authority table
 * (concept scheme 20260617-0) publishes each code and its English label, e.g.
 * `PBL` = "preamble", `ENC` = "enacting terms", `WRP` = "closing part",
 * `INP` = "introductory part", `TOC` = "table of contents", `TIT` = "title",
 * `TIS` = "title (subdivision)". It does NOT publish the identifier cardinality
 * of a canonical subdivision URI. The deterministic `_1` singleton rule below is
 * therefore an ADMINICULUM CANONICALIZATION POLICY, labelled explicitly on every
 * entry — it is not asserted as an EU fact.
 */
export const ELI_SUBDIVISION_IDENTIFIER_POLICY: Readonly<Record<string, EliSubdivisionIdentifierPolicy>> = {
  pbl: {
    requirement: 'FIXED_ONE',
    fixedIdentifier: '1',
    source: 'ADMINICULUM_CANONICALIZATION_POLICY',
    note: 'preamble — one per act',
  },
  enc: {
    requirement: 'FIXED_ONE',
    fixedIdentifier: '1',
    source: 'ADMINICULUM_CANONICALIZATION_POLICY',
    note: 'enacting terms — one per act',
  },
  wrp: {
    requirement: 'FIXED_ONE',
    fixedIdentifier: '1',
    source: 'ADMINICULUM_CANONICALIZATION_POLICY',
    note: 'closing part — one per act',
  },
  inp: {
    requirement: 'FIXED_ONE',
    fixedIdentifier: '1',
    source: 'ADMINICULUM_CANONICALIZATION_POLICY',
    note: 'introductory part — one per act',
  },
  toc: {
    requirement: 'FIXED_ONE',
    fixedIdentifier: '1',
    source: 'ADMINICULUM_CANONICALIZATION_POLICY',
    note: 'table of contents — one per act',
  },
  tit: {
    requirement: 'FIXED_ONE',
    fixedIdentifier: '1',
    source: 'ADMINICULUM_CANONICALIZATION_POLICY',
    note: 'title metadata (EU label "title"); NOT the structural title container',
  },
};

/**
 * BOUNDED STRUCTURAL HIERARCHY — Adminiculum ordering policy, not an EU value.
 *
 * The EU Subdivision authority table is FLAT: it publishes subdivision codes but
 * no parent/child relation between them. The ranks below are Adminiculum's
 * bounded, reviewable ordering of the structural containment chain used by ELI
 * URIs (part → title → chapter → section → subsection → article → paragraph →
 * point), with document-level containers first and the annex as a top-level
 * container.
 *
 * TIS vs TIT (authoritative EU labels, verified 2026-09-20):
 *   - `tis` = "title (subdivision)" → the STRUCTURAL title container ("cím").
 *   - `tit` = "title"               → title metadata/text. Its structural role is
 *     NOT proven, so it is deliberately NOT ranked here (order-neutral) and is
 *     never used as the structural title container.
 *
 * A subdivision path must carry strictly increasing ranks. A code that is NOT
 * ranked here is a known EU subdivision code but order-neutral: it is never
 * repaired, and it imposes no ordering constraint. In particular `sub`
 * (subparagraph) and `idt` (indent) are deliberately left unranked in C5A: the
 * authority table gives them no proven position relative to `par`/`pnt`, so
 * ranking them would be a guess. Reviewable data, no code path.
 */
export const ELI_SUBDIVISION_HIERARCHY_RANK: Readonly<Record<string, number>> = {
  pbl: 10, // preamble
  rct: 20, // recital
  enc: 30, // enacting terms
  anx: 35, // annex
  prt: 40, // part
  tis: 50, // title (subdivision) — the structural title container
  cpt: 60, // chapter
  sct: 70, // section
  sbs: 75, // subsection
  art: 80, // article
  par: 90, // paragraph
  aln: 95, // unnumbered paragraph
  unp: 95, // unnumbered paragraph
  pnt: 110, // point
  pta: 110, // point
  pti: 110, // point
};
