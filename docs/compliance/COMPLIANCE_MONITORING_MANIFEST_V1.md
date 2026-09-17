# Compliance Monitoring Manifest — schemaVersion 1 (C4B)

Read-only contract between Adminiculum and the **external** legal-source watcher.

## Purpose

Adminiculum publishes **monitoring demand only**: which legal source should be
monitored, and which locator(s) matter. Adminiculum keeps all customer and
document impact knowledge internally.

```
DOCX  [Eker. tv. 5. § (2) b) pont]  →  target TV/2001/108/5/2/b
  → C4A  ComplianceDocumentClauseAnchor.anchorKey = LEGAL|REF=TV/2001/108/5/2/b
  → C4B  monitoring manifest entry
         { identifierFamily: "TV", sourceIdentifier: "TV/2001/108", locators: ["5/2/b"] }
```

The watcher then monitors `TV/2001/108` without ever receiving customer data.

## Endpoint

```
GET /api/v1/compliance-intelligence/monitoring-manifest
```

- INTERNAL only: workforce `authenticate` + `requireInternal`.
- Cross-client aggregate by design (no client scoping is claimed or faked).
- Read-only. No storage, no cache, no migration, no background job.

## Scope

Included: anchors of the **current** `DocumentVersion` of documents linked as
`INTERNAL_ANALYSIS`.

Excluded:
- superseded / historical DocumentVersions (immutable provenance stays queryable
  but creates no monitoring demand);
- `CLIENT_POLICY` documents;
- anything without a supported machine identifier (accounted for in
  `unresolvedSummary`).

## Response

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-09-17T00:00:00.000Z",
  "sources": [
    {
      "identifierFamily": "TV",
      "sourceIdentifier": "TV/2001/108",
      "locators": ["5/2/b"],
      "referenceCount": 3
    },
    {
      "identifierFamily": "CELEX",
      "sourceIdentifier": "32016R0679",
      "locators": ["art=28;par=3"],
      "referenceCount": 8
    }
  ],
  "unresolvedSummary": {
    "count": 2,
    "reasons": { "NO_MACHINE_IDENTIFIER": 1, "UNSUPPORTED_ELI": 1 }
  }
}
```

### Fields

| Field | Meaning |
| --- | --- |
| `schemaVersion` | `1`. Bump only on a breaking shape change. |
| `generatedAt` | Manifest generation timestamp (non-deterministic field). |
| `sources[].identifierFamily` | `TV` or `CELEX`. |
| `sources[].sourceIdentifier` | Canonical source, e.g. `TV/2001/108`, `32016R0679`. |
| `sources[].locators` | Unique, sorted, opaque locators. Empty when only a source-level reference exists — a locator is never invented. |
| `sources[].referenceCount` | Number of contributing persisted anchor usages (not the deduplicated source count). |
| `unresolvedSummary` | Bounded aggregate counts only, never raw payload. |

### Supported identifier families (schemaVersion 1)

1. **C4A TV canonical reference** — `anchorKey = LEGAL|REF=TV/<year>/<act>[/<opaque-tail>]`
   (raw or `https://ref.adminiculum.hu/TV/...` wrapper). Parsed by the existing
   C4A parser; the locator stays opaque.
2. **Legacy NJT ELI** — exactly `https://njt.jog.gov.hu/eli/TV/<year>/<number>`.
   The persisted locator is preserved verbatim (`sec=15/B;par=4` stays as-is; it
   is never translated to another syntax).
3. **CELEX** — existing strict C3A normalization (`^3\d{4}[A-Z]\d{4}$`).

Precedence per anchor row: C4A TV reference → exact NJT ELI → CELEX. Precedence
is projection-only; the persisted anchor is never rewritten.

### Unresolved reasons (closed set)

`NO_MACHINE_IDENTIFIER`, `MALFORMED_CANONICAL_REFERENCE`, `UNSUPPORTED_ELI`,
`INVALID_CELEX`, `UNSUPPORTED_IDENTIFIER_FAMILY`.

### Determinism

`sources` are sorted by `identifierFamily` then `sourceIdentifier`; `locators`
are unique and sorted with `null` omitted. Identical input yields an identical
`sources` / `unresolvedSummary` shape (only `generatedAt` varies).

## Privacy boundary

The manifest MUST NOT contain: client id/name, matter id/title, case id,
document id/title, documentVersionId, clause ref/title/text, rationale, finding,
requirement, client fact or internal note. The database select is limited to the
projection fields (`anchorType`, `anchorKey`, `eli`, `celex`, `locator`), so
identity is never read.

## Ownership boundary

| Owner | Responsibility |
| --- | --- |
| **Adminiculum** | compliance documents → clause anchors → canonical legal references → customer/document impact map |
| **Watcher (external)** | official legal sources → fetching → polling → change detection → regulatory monitoring |

Adminiculum does **not** implement: polling, scheduling, scraping, source
fetching, alerts, webhooks, `LegalSourceVersion` creation or automatic compliance
status changes. The watcher's return channel is intentionally **not** defined in
this version.
