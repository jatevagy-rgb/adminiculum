# Source Inventory — Grow-with-Us Compliance Corpus

> Preparation / tooling output. NOT a legal opinion. No requirement extraction,
> no production schema, no runtime dependency. Metadata + checksums only.

## 1. Purpose

This document is the human-readable summary of the deterministic machine inventory
produced by `scripts/compliance/inventory-source.js`. It supports the future
Phase 7 (Source Inventory / Extraction) and Phase 8 (Rule Engine) work.

Key principle: **the legal TXT corpus is read-only external material.** It is
never modified, renamed, moved or copied into the repository. The repository
holds only metadata, checksums, summaries and small sample records.

## 2. Corpus Facts

| Property | Value |
|---|---|
| Corpus root | `C:\Users\hubay\Documents\Adminiculum\tvek` |
| Files scanned | 65 (64 `.txt` + 1 `.zip`) |
| Source versions (TXT legal texts) | 63 |
| Unique legal sources | 62 |
| Note/pointer files | 1 (`jogszabaly.txt`, 162 bytes, non-substantive) |
| Archive artifacts | 1 (`tv ek.zip`, 4.4 MB, packaging duplicate of the TXT corpus) |
| Encoding | UTF-8 (all 64 TXT files decode cleanly, no replacement chars) |

## 3. Source Types Identified

| Source type | Count | Notes |
|---|---|---|
| `HU_ACT` (törvény) | 39 | Hungarian statutes, 1990–2025, from `njt.jog.gov.hu` |
| `HU_GOVERNMENT_DECREE` (Korm. rendelet) | 7 | Implementing government decrees |
| `HU_MINISTRY_DECREE` (NM / NGM / MüM rendelet) | 3 | Ministry-level implementing decrees |
| `EU_CONSOLIDATED` (Egységes szerkezetbe foglalt SZÖVEG) | 4 | EUR-Lex consolidated texts with CELEX + version date |
| `EU_OJ_TEXT` (L_…HU.…xml.txt) | 10 | EUR-Lex Official-Journal-derived original texts |
| Non-source artifacts | 2 | 1 note pointer + 1 zip archive |

All HU legal texts carry a download header:

```
CÍM: <title>
FORRÁS: <njt.jog.gov.hu URL>
LETÖLTÉS: <ISO timestamp>
```

EU texts carry a similar header with `eur-lex.europa.eu` or
`publications.europa.eu` source URLs and a CELEX number.

## 4. Jurisdictions Identified

| Jurisdiction | Count (unique sources) | Notes |
|---|---|---|
| HU (Hungary) | 49 | Statutes + decrees, consolidated current-state exports with `Hatályos:` validity range |
| EU (European Union) | 13 | Regulations and directives, HU language |
| US / UK / OECD / other | 0 | **None present.** The only OECD-related material is the Hungarian promulgation act of the OECD Anti-Bribery Convention (2000. évi XXXVII. törvény), which is **incorporated/promulgated text, NOT a standalone OECD source.** See §8b. |

The corpus is therefore **HU + EU only.** No foreign common-law or other
national sources exist.

## 5. EU Instrument Identification (CELEX)

Every EU file carries a CELEX identifier (13 alphanumeric chars). The kind letter
discriminates the act type (R = regulation, L = directive, D = decision).

| CELEX | Instrument | Short name |
|---|---|---|
| 32006R1907 | Reg. (EC) 1907/2006 | REACH (chemicals) — 2 files (near-duplicate, see §7) |
| 32008R1272 | Reg. (EC) 1272/2008 | CLP (classification/labelling/packaging) |
| 32021R0821 | Reg. (EU) 2021/821 | Dual-use export controls |
| 32013R0952 | Reg. (EU) 952/2013 | Union Customs Code |
| 32016R0679 | Reg. (EU) 2016/679 | GDPR |
| 32019R1020 | Reg. (EU) 2019/1020 | Market Surveillance |
| 32022R2065 | Reg. (EU) 2022/2065 | Digital Services Act (DSA) |
| 32022R2554 | Reg. (EU) 2022/2554 | DORA (financial digital resilience) |
| 32022L2555 | Dir. (EU) 2022/2555 | NIS2 (cybersecurity) |
| 32022L2557 | Dir. (EU) 2022/2557 | CER (critical entities resilience) |
| 32023R0988 | Reg. (EU) 2023/988 | General Product Safety Regulation |
| 32024R1689 | Reg. (EU) 2024/1689 | AI Act |
| — (no CELEX derivable) | Comm. Recommendation 2003/361/EC | SME definition (OJ L 2024/9077 corrigendum supplement) |

**Caution:** 32022L2555 and 32022L2557 are **directives**, not regulations. The
sector digit (3 = EU legislation) is the family; the **kind letter** (L) is the
act type. This is handled correctly in the manifest.

## 6. Hungarian Instrument Identification

Hungarian statutes follow the citation form `YYYY. évi <ROMAN>. törvény` and
decrees follow `<number>/<year>. (<M. DD.>) <issuer> rendelet`. The njt export
includes a `Hatályos:` line giving the current validity window of the
consolidated text (e.g. `2026. 08. 12. – 2026. 09. 26.`; open-ended when only a
start date is present). All are treated as **consolidated current-state** exports.

The full list of 62 canonical sources with citations and titles is in
`docs/compliance/source-manifest.json` (`legalSources[]` + `versions[]`).

## 7. Near-Duplicate / Version Handling

`Egységes szerkezetbe foglalt SZÖVEG_ 32006R1907 — HU — 11.05.2026.txt` and its
`(1)` twin share the same canonical key (`EU:EU_REGULATION:CELEX:32006R1907`),
same CELEX version date (2026-05-11) but **different SHA-256 checksums**
(`76199ff7…` vs `489f4181…`, size 1,329,738 vs 1,329,440 bytes). One is a
re-download with a minor content delta. The manifest flags this as a
near-duplicate group; a human/legal reviewer must decide the canonical version
before any Phase-7 processing. This is exactly the change-detection scenario the
manifest schema is designed to surface.

## 8. Completeness and Confidence

| Parse confidence | Versions |
|---|---|
| HIGH | 62 |
| MEDIUM | 1 (`L_202490772…` — OJ supplement; CELEX not derivable from OJ number) |
| LOW | 0 |

| Completeness (structural heuristic) | Versions |
|---|---|
| COMPLETE | 62 |
| PARTIAL | 1 (`19/2014. (IV. 29.) NGM rendelet`, 9,300 bytes — small body, likely complete but unverified) |

Completeness is a **structural heuristic only** — it is not legal verification.
The note `structural heuristic flags small body…` marks such entries.

## 9. Domain Coverage Map

Classification is deliberately conservative. "Good coverage" requires multiple
primary sources (statute + implementing instruments); a single source is never
claimed as coverage.

| Compliance domain | Classification | Evidence in corpus |
|---|---|---|
| Tax | GOOD SOURCE COVERAGE | 2007/CXXVII (VAT), 1995/CXVII (PIT), 1996/LXXXI (corporate+dividend tax), 2017/CL (tax procedure), 2017/CLI (tax administration), 2018/LII (social contribution), 465/2017, 2022/XLV, 2025/LIV, 1990/C (local taxes) |
| Employment & labor | GOOD SOURCE COVERAGE | 2012/I (Labour Code), 1993/XCIII (OHS), 5/1993 MüM (OHS implementation), 33/1998 NM (medical fitness), 2019/CXXII (social security) |
| Corporate / company law | GOOD SOURCE COVERAGE | 2006/V (company registry/procedure), 2013/V (Civil Code), 2000/C (accounting) |
| Data protection & privacy | GOOD SOURCE COVERAGE | GDPR (2016/679) + 2011/CXII (Infotv / FOIA) |
| Consumer & e-commerce | GOOD SOURCE COVERAGE | 1997/CLV (consumer protection), 2008/XLVII (unfair practices), 2013/V consumer parts, 151/2003, 45/2014, 19/2014 NGM, 373/2021, 2001/CVIII (e-commerce), DSA, GPSR (2023/988) |
| Chemicals | GOOD SOURCE COVERAGE | REACH + CLP (both consolidated) |
| Environment / waste | GOOD SOURCE COVERAGE | 1995/LIII (environment), 2012/CLXXXV (waste), 80/2023 (EPR) |
| Cybersecurity | GOOD SOURCE COVERAGE | NIS2 + DORA + 2024/LXIX (HU Cybersecurity Act) + 418/2024 (implementing decree) |
| AI | GOOD SOURCE COVERAGE | AI Act (2024/1689) + 2025/LXXV (HU AI implementation) + 344/2025 (implementing decree) |
| Product safety / market surveillance | PARTIAL SOURCE COVERAGE | 2019/1020 + GPSR; no HU implementing specifics in corpus |
| Export control / sanctions | PARTIAL SOURCE COVERAGE | Dual-use (2021/821) + 2017/LII (EU/UN financial sanctions) |
| Anti-bribery / AML | PARTIAL SOURCE COVERAGE | OECD Convention (2000/XXXVII) + 2017/LIII (AML/CTF) |
| Competition | PARTIAL SOURCE COVERAGE | 1996/LVII (competition act) alone |
| Public procurement | PARTIAL SOURCE COVERAGE | 2015/CXLIII alone |
| Customs | GOOD SOURCE COVERAGE | UCC (952/2013) + 2017/CLII (HU customs implementation) |
| Intellectual property | GOOD SOURCE COVERAGE | 1995/XXXIII (patents), 1997/XI (trademarks/geographic indications), 1999/LXXVI (copyright) |
| Trade secrets | PARTIAL SOURCE COVERAGE | 2018/LIV alone |
| Critical entities resilience | PARTIAL SOURCE COVERAGE | CER (2022/2557) + 2024/LXXXIV |
| Financial-sector resilience | PARTIAL SOURCE COVERAGE | DORA (2022/2554) alone |
| Advertising / marketing | PARTIAL SOURCE COVERAGE | 2008/XLVIII (advertising act) alone |
| ESG / sustainability reporting | PARTIAL SOURCE COVERAGE | 2023/CVIII (CSRD-implementing ESRS law) |
| SMEs | PARTIAL SOURCE COVERAGE | 2004/XXXIV (SME act) + 2003/361 Recommendation |
| Whistleblowing | PARTIAL SOURCE COVERAGE | 2023/XXV (complaints/public-interest reports) |

**No source present / unclear:** food & feed safety, pharmaceuticals,
medical devices, veterinary, aviation, maritime, automotive type approval,
energy sector regulation, insurance/prudential banking, telecommunications,
postal, ePrivacy, geoblocking, consumer credit beyond the listed decrees, AML
EU-level texts (AMLD6/AMLA), NIS2 national implementing law (2024/LXIX is the HU
cybersecurity act; the NIS2 transposition mapping must be confirmed in review).

## 10. Source Anchor Strategy

Future `LegalProvision` provenance must point back into the TXT sources. Line
numbers alone are unreliable because regenerated exports shift. The manifest and
this task therefore design a **multi-part, stable anchor**:

```
sourceAnchor = {
  legalSourceId,        // LS-XXXX from the manifest (stable canonical identity)
  sha256,               // checksum of the source file at capture time
  citation,             // e.g. "1995. évi LIII. törvény" or "32006R1907"
  provisionReference,   // e.g. "21. § (1)", "31. cikk (1)", "1. Cikk 1. bekezdés"
  headingContext,       // nearby heading, e.g. "A biztonsági adatlapokra vonatkozó követelmények"
  lineRange,            // [startLine, endLine] AT CAPTURE TIME — informational only
  excerptSha256         // SHA-256 of the normalized provision excerpt text
}
```

Rules:
- `excerptSha256` + `citation` + `provisionReference` are the **primary** stable
  anchor; they survive file regeneration.
- `lineRange` is advisory; it must be re-verified against the current file
  checksum before use.
- A changed `sha256` for the same `legalSourceId` means the anchor must be
  re-resolved before any legal assertion is made.

## 11. Version / Change Preparation

The manifest schema supports future change detection without implementing the
RegulatoryChange domain:

- `LegalSource` (identity): `canonicalSourceKey` (e.g. `HU:ACT:1995:LIII` or
  `EU:EU_REGULATION:CELEX:32006R1907`).
- `LegalSourceVersion` (one per physical file): `sha256`, `sizeBytes`,
  `versionDate`, `effectivePeriod`, `downloadedAt`.

Detection rule (metadata-level only, no legal diff):
> same `legalSourceId` + different `sha256` ⇒ candidate `RegulatoryChange`.

The REACH pair in this corpus is a live example (§7).

## 12. Repository Output (kept compact)

- `docs/compliance/source-manifest.json` — machine-readable manifest (80 KB, metadata + checksums only)
- `docs/compliance/SOURCE_INVENTORY.md` — this document
- `docs/compliance/CURRENT_MODEL_REUSE_MAP.md` — reuse/dedup analysis for the future engine
- `docs/compliance/fact-definition-candidates.json` — applicability-input design manifest
- `docs/compliance/candidate-extraction-examples.json` — 4 non-production sample extractions
- `scripts/compliance/inventory-source.js` — deterministic inventory tool
- `scripts/compliance/inventory-source.test.js` — 19 tests

No legal text is copied into the repository. No DB rows, no Prisma models, no
migrations, no API, no deployment.

## 13. Regeneration

Regenerate the manifest deterministically:

```bash
node scripts/compliance/inventory-source.js \
  --corpus "C:\Users\hubay\Documents\Adminiculum\tvek" \
  --out docs/compliance/source-manifest.json \
  --generated-at "2026-08-20T00:00:00.000Z"
```

Run tests:

```bash
node --test scripts/compliance/inventory-source.test.js
```

## 14. Provenance Classification (hardened)

Every source version is now classified by what it IS in the corpus — so the
inventory never implies a standalone source exists when only a national
incorporation instrument is present.

| Provenance | Count (versions) | Meaning |
|---|---|---|
| `STANDALONE_SOURCE` | 62 | An original legal source file present in the corpus |
| `INCORPORATED_PROMULGATED` | 1 | National act that promulgates an instrument whose original is **not** standalone here |
| `POINTER_ONLY` | 1 | Non-substantive note/pointer (`jogszabaly.txt`) |
| `ARCHIVE_ARTIFACT` | 1 | Packaging archive (`tv ek.zip`) |
| `UNKNOWN` | 0 | — |

**OECD:** The corpus contains **no standalone OECD source file.** The only
OECD-related material is `2000. évi XXXVII. törvény.txt` — the Hungarian act
that promulgates the OECD Anti-Bribery Convention. Its provenance is
`INCORPORATED_PROMULGATED`; the manifest records a provenance note stating that
no standalone OECD source exists in the corpus. No OECD provenance is fabricated.

## 15. Classification Basis (verified vs inferred)

Each version records `classificationBasis`:
`content-verified` (filename **and** CÍM header agree),
`header-title` (header only), or `filename-inferred` (filename only).

In this corpus all 63 versions are **content-verified** — the filename citation
and the embedded CÍM header agree. `filename-inferred` fields are transparently
marked and are **never** presented as authoritative metadata.

## 16. Duplicate / Version Relationships

`manifest.relationships[]` is a typed, deterministic relationship list:

| Type | Meaning |
|---|---|
| `EXACT_DUPLICATE` | byte-identical files (same SHA-256) |
| `SAME_SOURCE_DIFFERENT_HASH` | same canonical source key, different checksum |
| `POINTER_ONLY` | non-substantive pointer file |
| `ARCHIVE_MEMBER` | packaging archive (with mechanical member list) |

**REACH (Section 4 requirement):** the two REACH files
(`Egységes szerkezetbe foglalt SZÖVEG_ 32006R1907 — HU — 11.05.2026.txt` and its
`(1)` twin) share the same canonical key `EU:EU_REGULATION:CELEX:32006R1907`,
the same CELEX version date `2026-05-11`, and both contain the EUR-Lex document
version marker `068.001`, but differ in checksum and byte size
(`76199ff7…` / 1,329,738 vs `489f4181…` / 1,329,440) and in their capture head
(one begins with the TOC navigation, the other with the consolidated body +
disclaimer). They are recorded as `SAME_SOURCE_DIFFERENT_HASH` /
`POSSIBLE_VERSION_VARIANT`. The manifest **does not declare** which is legally
applicable — that requires legal review.

## 17. Text Normalization

`scripts/compliance/normalize-source.js` is a conservative mechanical layer:
normalizes line endings to LF, strips a UTF-8 BOM, trims trailing whitespace per
line, and **preserves** paragraph boundaries, section/article identifiers and
Hungarian/EU Unicode. It never collapses internal whitespace, never translates,
never summarizes, and never rewrites legal wording. It never writes to the
source corpus.

## 18. Structural Markers (candidate only)

`scripts/compliance/structure-source.js` mechanically reports explicit
structural locators: Hungarian `§`, subsection `(n)`, point, `melléklet`/annex,
`fejezet`/chapter; EU `cikk`/Article, `bekezdés`/paragraph, `melléklet`/Annex,
`fejezet`/Chapter, `szakasz`/Section. Output is structure locators (kind + line),
**not** legal propositions.

## 19. Stable Source Anchors

`scripts/compliance/provision-anchor.js` builds a deterministic multi-part
anchor for a future legal-review candidate:

```
sourceKey + sourceSha256 + provisionReference + excerptSha256   (primary, stable)
headingContext (if explicit)                                     (context)
lineSpan.start/end                                               (advisory only)
```

Line numbers are advisory capture-time data and must be re-verified against the
current file checksum; they are never a stable legal identity. The anchor module
makes no legal claim.

## 20. Diagnostics

`manifest.diagnostics` reports (machine-readable):
`totalFiles`, `txtFiles`, `archiveFiles`, `noteFiles`, `zeroByteFiles`,
`unreadableFiles`, `encodingIssues`, `ambiguousMetadata`, `inferredFromFilename`,
`duplicateAmbiguity`, `provenanceUncertainty`, `incorporatedPromulgated`.

Current corpus: 0 zero-byte, 0 unreadable legal texts, 0 ambiguous metadata, 1
duplicate ambiguity (REACH), 1 incorporated/promulgated (OECD), 0 provenance
uncertainty. See `docs/compliance/CORPUS_DIAGNOSTICS.md`.

## 21. No Requirements / No Legal Conclusions

This lane performs **source engineering only.** The manifest and tooling create
**no** `Requirement`, `ApplicabilityRule`, `Control`, `EvidenceRequirement`,
`ComplianceDocumentType`, `RegulatoryChange` or `GrowthTrigger` records, and make
**no** fact-applicability decisions (e.g. "50 employees ⇒ whistleblowing").
`docs/compliance/CURRENT_MODEL_REUSE_MAP.md` preserves the reuse conclusions for
later phases; no Prisma models or migrations are created.