# Adminiculum legal watcher (W1 — EUR-Lex dry run)

Isolated legal-source watcher vertical slice:

```
exported manifest snapshot
  -> distinct CELEX identifiers
  -> official Publications Office CELLAR SPARQL
  -> act-level amendment / consolidation observations
  -> watcher-owned durable local baseline
  -> deterministic diff
  -> dry-run JSON + human report
```

## WHAT_W1_DOES

- Consumes an **exported manifest snapshot** (schema v1) supplied as a file.
- Extracts only `identifierFamily === "CELEX"` entries, normalizes them with the
  same strict C3A token shape the backend uses (`^3[0-9]{4}[A-Z][0-9]{4}$`),
  deduplicates, and queries only those against the **official** CELLAR SPARQL
  endpoint: `https://publications.europa.eu/webapi/rdf/sparql`.
- Emits exactly two event kinds, act-level only:
  - `AMENDMENT_PUBLISHED` — via `cdm:resource_legal_amends_resource_legal`
    (live-verified: `31995L0046` → `32003R1882`)
  - `CONSOLIDATED_VERSION_AVAILABLE` — via
    `cdm:act_consolidated_consolidates_resource_legal` with a CELEX-family
    filter for dated consolidated CELEX (live-verified:
    `32016R0679` → `02016R0679-20160504`)
- Keeps a watcher-owned **local file baseline** (`<state-dir>/state.json`,
  atomic temp+fsync+rename writes). The first successful observation of a
  CELEX is `FIRST_SEEN_BASELINE`: historical relationships are recorded but
  reported with **zero** NEW events.
- Deterministic diff: `UNCHANGED`, `NEW_AMENDMENT`,
  `NEW_CONSOLIDATED_VERSION`, `SOURCE_ERROR`. Event keys are SHA-256 over
  `source|watched CELEX|kind|related CELEX` — independent of row order.
- Per-CELEX isolation: one failed identifier keeps its previous state and
  reports `SOURCE_ERROR`; the others still commit their own state.
- Bounded HTTP everywhere: per-attempt timeout (≤30 s), bounded response size,
  max 2 retries with exponential backoff only for transient failures
  (network error, timeout, 429, 502, 503, 504), hard deadline, fail closed.
- Produces a deterministic machine-readable report that explicitly states
  `adminiculumBackendWrites: 0`.

## WHAT_W1_DOES_NOT_DO

- **Dry-run only** — no Adminiculum backend writes, no observation ingestion.
- The manifest is supplied as an **exported snapshot file**; the watcher never
  calls the production manifest endpoint (workforce-authenticated) and there
  is **no service identity yet**.
- **No production scheduler** — W1 is an on-demand CLI; no cron exists.
- **Only EUR-Lex** (official CELLAR): no NJT, no Magyar Közlöny, no case law,
  no scraping of EUR-Lex HTML, no third-party API.
- **Act-level only** — no subdivision diff, no hierarchical impact (C4C stays
  exact-only), no legal-text mirroring (no body text is stored), no automatic
  compliance conclusion, no customer/case/document data (the types cannot
  represent it), no `REMOVED` legal events (absent events are preserved and
  reported as diagnostics only), no historical backfill.

## Usage

```bash
npm ci
npm run build
npm run watcher -- --manifest ./manifest.json --state-dir ./state [--report-out ./report.json]
```

- `--manifest <path>` — exported manifest snapshot (schema v1 JSON).
- `--state-dir <dir>` — watcher-owned durable state directory (default `./state`;
  never committed to git).
- `--report-out <path>` — write the machine-readable JSON report to `<path>`;
  `-` prints the JSON report to stdout.
- Human summary goes to stdout; structured JSON logs go to stderr.

Environment equivalents: `LEGAL_WATCHER_STATE_DIR`, `LEGAL_WATCHER_EURLEX_ENDPOINT`,
`LEGAL_WATCHER_HTTP_TIMEOUT_MS`, `LEGAL_WATCHER_HTTP_RETRIES` (max 2),
`LEGAL_WATCHER_HTTP_BACKOFF_MS`, `LEGAL_WATCHER_HTTP_BACKOFF_FACTOR`,
`LEGAL_WATCHER_RESPONSE_MAX_BYTES`, `LEGAL_WATCHER_CONCURRENCY`.

Exit codes: `0` OK, `1` PARTIAL/FAILED, `2` fatal configuration/manifest/state
error.

## Manifest snapshot contract

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-09-27T00:00:00Z",
  "sources": [
    {
      "identifierFamily": "CELEX",
      "sourceIdentifier": "32016R0679",
      "locators": [],
      "referenceCount": 1
    }
  ],
  "unresolvedSummary": { "count": 0, "reasons": {} }
}
```

Only `CELEX` sources are queried. `TV` sources are counted and skipped.
Malformed CELEX identifiers are counted and skipped. Any unexpected field
(privacy guard) is dropped, logged, and reported by name — never propagated.

## Event model

| field | meaning |
| --- | --- |
| `source` | `EURLEX_CELLAR` |
| `sourceIdentifier` | watched CELEX |
| `eventKind` | `AMENDMENT_PUBLISHED` / `CONSOLIDATED_VERSION_AVAILABLE` |
| `eventKey` | SHA-256 hex over `source\|watched\|kind\|related` |
| `relatedIdentifier` | amending CELEX / dated consolidated CELEX |
| `sourceUri` | official CELLAR work URI |
| `capturedAt` | ISO-8601 capture timestamp |
| `payloadHash` | SHA-256 over identity + metadata (powers `METADATA_CHANGED`) |
| `queryProvenance` | which official predicate produced the event |
| `publicationDate` / `effectiveDate` | optional, when officially available |

Language/layer expressions never become duplicate events: queries bind works,
and consolidation layers without a dated consolidated CELEX are not separate
versions. A metadata correction under the same key reports `METADATA_CHANGED`
and is never a new legal event.

## State store

`<state-dir>/state.json` — watched CELEX, known event keys, minimal event
metadata, hashes, last capture metadata. Never stores legal text, HTML,
credentials, or any identity. Writes are atomic; a failed write never replaces
a valid baseline. State must not be committed to git (service-local
`.gitignore`).

## Testing

```bash
npm test          # deterministic tests, mocked CELLAR — no live network
npm run typecheck
npm run build
```

A non-destructive live smoke can be run against the official endpoint with a
manifest snapshot containing `32016R0679`; the first run must establish a
baseline and an immediately repeated run must report zero NEW events. Live
CELLAR availability is never a CI dependency.

## CI

`.github/workflows/legal-watcher-ci.yml` — path-filtered, Node 20, `npm ci`,
typecheck, build, deterministic tests, production Docker build. No live
CELLAR in CI, no Azure deployment in W1.
