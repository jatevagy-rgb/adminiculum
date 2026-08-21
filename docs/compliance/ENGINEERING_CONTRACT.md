# Engineering Contract — Compliance Source Corpus Hardening

> This document describes the **source-engineering contract** only. It makes no
> legal claim, creates no `Requirement`/`ApplicabilityRule`/`Control` records,
> performs no fact-applicability analysis, and does not implement the Compliance
> Engine (Phase 7/8 belong to later phases and stronger legal review).

## 1. Corpus is read-only external material

The legal TXT corpus (`C:\Users\hubay\Documents\Adminiculum\tvek`) is external
and read-only. It is never modified, renamed, moved or copied into the
repository. The repository holds only scripts, metadata manifests, diagnostics
and tests.

## 2. Modules

| Module | Purpose | Not for |
|---|---|---|
| `scripts/compliance/inventory-source.js` | Deterministic inventory: SHA-256, sizes, citations/CELEX, provenance, classification basis, duplicate/version relationships, diagnostics | legal interpretation |
| `scripts/compliance/normalize-source.js` | Conservative text normalization (LF, BOM, trailing ws; preserves paragraphs, identifiers, Unicode) | translation / summarization / rewording |
| `scripts/compliance/structure-source.js` | Candidate structural marker locators (HU §, subsection, point, annex; EU Article, paragraph, Annex, Chapter, Section) | legal propositions |
| `scripts/compliance/provision-anchor.js` | Stable multi-part source anchor (sourceKey+sha256+provisionReference+excerptSha256; lineSpan advisory) | legal claims |

## 3. Provenance states

`STANDALONE_SOURCE`, `INCORPORATED_PROMULGATED`, `POINTER_ONLY`,
`ARCHIVE_ARTIFACT`, `UNKNOWN`.

- A source is `INCORPORATED_PROMULGATED` when the corpus holds only a national
  promulgation act and **not** the original instrument. Example: the OECD
  Anti-Bribery Convention — the corpus has only `2000. évi XXXVII. törvény`
  (Hungarian promulgation), never a standalone OECD file.

## 4. Classification basis

`content-verified`, `header-title`, `filename-inferred`. Filename-derived
fields are marked inferred and are never authoritative.

## 5. Relationships

`EXACT_DUPLICATE`, `SAME_SOURCE_DIFFERENT_HASH` (version variant),
`POINTER_ONLY`, `ARCHIVE_MEMBER`. The manifest never declares which version is
legally applicable.

## 6. Anchors

Primary stable identity: `sourceKey + sourceSha256 + provisionReference +
excerptSha256`. `lineSpan` is advisory capture-time data; a changed source
checksum requires re-resolving the anchor before any use.

## 7. Product reuse (unchanged)

Company facts later reuse `ClientFact`; assessments/findings later reuse the
existing Assessment/Finding; remediation later reuses `Task`; no second employee
directory; no duplicate document store. These relationships are documented in
`docs/compliance/CURRENT_MODEL_REUSE_MAP.md` and are **not** implemented in
Prisma here (no migration).

## 8. Explicitly out of scope (this lane)

- Deciding what law applies to a company.
- `Requirement` / `ApplicabilityRule` / `Control` / `EvidenceRequirement` /
  `ComplianceDocumentType` / `RegulatoryChange` / `GrowthTrigger`.
- Rules like "50 employees ⇒ whistleblowing" or "webshop ⇒ consumer law".
- Any Prisma schema/migration.
