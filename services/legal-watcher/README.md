# Adminiculum legal watcher (W1 — EUR-Lex dry run + optional W2 delivery)

Isolated legal-source watcher vertical slice:

```
manifest source (FILE snapshot | BACKEND watcher-monitoring manifest)
  -> distinct CELEX identifiers
  -> official Publications Office CELLAR SPARQL
  -> act-level amendment / consolidation observations
  -> watcher-owned durable local baseline
  -> deterministic diff
  -> dry-run JSON + human report
  -> (explicit opt-in) W2 legal-source-observations delivery
```

## WHAT_W1_DOES

- Consumes the monitoring manifest (schema v1) in one of two explicit modes:
  - **FILE** (default) — an exported snapshot file supplied with `--manifest`
    (or `LEGAL_WATCHER_MANIFEST`); no backend call is ever made.
  - **BACKEND** (`LEGAL_WATCHER_MANIFEST_MODE=BACKEND`) — reads the dedicated
    app-only endpoint
    `GET <backendEndpoint>/api/v1/compliance-intelligence/watcher-monitoring-manifest`
    with the same app-only Bearer token used by W2 delivery. No wrapper, no
    local-file fallback: a failed read fails the run before any CELLAR query.
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
  reported with **zero** NEW events and are never delivered.
- Deterministic diff: `UNCHANGED`, `NEW_AMENDMENT`,
  `NEW_CONSOLIDATED_VERSION`, `SOURCE_ERROR`. Event keys are SHA-256 over
  `source|watched CELEX|kind|related CELEX` — independent of row order.
- Per-CELEX isolation: one failed identifier keeps its previous state and
  reports `SOURCE_ERROR`; the others still commit their own state.
- Bounded HTTP everywhere: per-attempt timeout (≤30 s), bounded response size,
  max 2 retries with exponential backoff only for transient failures
  (network error, timeout, 429, 502, 503, 504), hard deadline, fail closed.
- Produces a deterministic machine-readable report that explicitly states
  `adminiculumBackendWrites`. It is `0` unless delivery was explicitly enabled.
- **Optional W2 delivery (explicit opt-in, default off):** newly detected
  events can be mapped to the locked W2 contract and POSTed to the
  compliance-intelligence endpoint; see "W2 delivery" below.

## WHAT_W1_DOES_NOT_DO

- **Writes nothing unless delivery is explicitly enabled.** No Adminiculum
  backend writes happen in DRY_RUN. FILE manifest mode additionally makes no
  token request; BACKEND manifest mode performs exactly one authenticated read
  (the watcher-monitoring manifest) per run, still with zero backend writes.
- FILE mode never calls the backend. BACKEND mode calls only the dedicated
  app-only watcher-monitoring manifest endpoint — never the
  workforce-authenticated production monitoring endpoint.
- **No production scheduler** — the watcher is an on-demand CLI; no cron
  exists. There is no Azure deployment or provisioning in this repository.
- **Only EUR-Lex** (official CELLAR): no NJT, no Magyar Közlöny, no case law,
  no scraping of EUR-Lex HTML, no third-party API.
- **Act-level only** — no subdivision diff, no hierarchical impact (C4C stays
  exact-only), no legal-text mirroring (no body text is stored), no automatic
  compliance conclusion, no customer/case/document data (the types cannot
  represent it), no `REMOVED` legal events (absent events are preserved and
  reported as diagnostics only), no historical backfill.
- No legal text, customer identity, case, document or user identity ever
  enters the W2 payload or the delivery state.

## Usage

```bash
npm ci
npm run build
# FILE manifest mode (default): exported snapshot file
npm run watcher -- --manifest ./manifest.json --state-dir ./state [--report-out ./report.json] [--deliver]
# BACKEND manifest mode: read the watcher-monitoring manifest directly
LEGAL_WATCHER_MANIFEST_MODE=BACKEND LEGAL_WATCHER_BACKEND_ENDPOINT=https://backend.example.test \
  LEGAL_WATCHER_AZURE_TENANT_ID=... LEGAL_WATCHER_AZURE_CLIENT_ID=... \
  LEGAL_WATCHER_AZURE_CLIENT_SECRET=... LEGAL_WATCHER_AZURE_SCOPE=api://.../.default \
  npm run watcher -- --state-dir ./state
```

- `--manifest <path>` — exported manifest snapshot (schema v1 JSON); required in
  FILE mode, ignored in BACKEND mode.
- `--state-dir <dir>` — watcher-owned durable state directory (default `./state`;
  never committed to git).
- `--report-out <path>` — write the machine-readable JSON report to `<path>`;
  `-` prints the JSON report to stdout.
- `--deliver` — explicitly enable W2 backend delivery (default: dry run).
- Human summary goes to stdout; structured JSON logs go to stderr.

Environment equivalents: `LEGAL_WATCHER_MANIFEST_MODE` (`FILE`|`BACKEND`, default
`FILE`), `LEGAL_WATCHER_MANIFEST` (snapshot path in FILE mode),
`LEGAL_WATCHER_STATE_DIR`, `LEGAL_WATCHER_EURLEX_ENDPOINT`,
`LEGAL_WATCHER_HTTP_TIMEOUT_MS`, `LEGAL_WATCHER_HTTP_RETRIES` (max 2),
`LEGAL_WATCHER_HTTP_BACKOFF_MS`, `LEGAL_WATCHER_HTTP_BACKOFF_FACTOR`,
`LEGAL_WATCHER_RESPONSE_MAX_BYTES`, `LEGAL_WATCHER_CONCURRENCY`.

## Manifest source modes

- `LEGAL_WATCHER_MANIFEST_MODE=FILE` (default): requires `--manifest <path>` or
  `LEGAL_WATCHER_MANIFEST`. The watcher never calls the backend and, in
  DRY_RUN, never requests a token.
- `LEGAL_WATCHER_MANIFEST_MODE=BACKEND`: does not require `--manifest`; requires
  `LEGAL_WATCHER_BACKEND_ENDPOINT` and app-only token configuration (exactly the
  same `CLIENT_SECRET`/`MANAGED_IDENTITY` selection as W2 delivery), and reads
  `GET <endpoint>/api/v1/compliance-intelligence/watcher-monitoring-manifest`
  once per run. With `DELIVER` the single token provider instance is reused for
  the manifest GET and the observation POST. Backend manifest failures abort the
  run before any CELLAR query, delivery POST or state write; there is no
  fallback to a local file.

The remote response is the existing manifest schema v1 with no wrapper and is
validated by the exact same parser/validator as a FILE snapshot, including the
privacy guard for unexpected fields.

Exit codes: `0` OK, `1` PARTIAL/FAILED, `2` fatal configuration/manifest/state
error.

## W2 delivery (explicit opt-in)

Default is `DRY_RUN`: zero backend writes and W1 output preserved exactly. In
FILE manifest mode DRY_RUN also makes no token request; in BACKEND manifest
mode DRY_RUN performs exactly one authenticated manifest read.

Required configuration for `DELIVER` (missing configuration fails closed at
startup, before any observation):

- `LEGAL_WATCHER_DELIVERY_MODE=DELIVER` (or `--deliver`)
- `LEGAL_WATCHER_BACKEND_ENDPOINT` — backend base URL (http(s))
- `LEGAL_WATCHER_AZURE_AUTH_MODE` — `CLIENT_SECRET` (default when unset) or
  `MANAGED_IDENTITY`
- CLIENT_SECRET mode (default, unchanged): `LEGAL_WATCHER_AZURE_TENANT_ID`,
  `LEGAL_WATCHER_AZURE_CLIENT_ID`, `LEGAL_WATCHER_AZURE_CLIENT_SECRET`,
  `LEGAL_WATCHER_AZURE_SCOPE` — app-only client-credentials token (no
  `az login`, no human/workforce token, no token storage or logging)
- MANAGED_IDENTITY mode: no secret/tenant environment. Requires
  `LEGAL_WATCHER_AZURE_SCOPE` (`api://<backend-app-id>/.default`; the resource
  is derived by stripping exactly that terminal suffix) or
  `LEGAL_WATCHER_AZURE_RESOURCE` (`api://<backend-app-id>`), plus the
  runtime-injected `IDENTITY_ENDPOINT` and `IDENTITY_HEADER` of the Azure
  managed identity. Only `api://` resources are accepted; Graph/ARM resources
  fail closed. Missing runtime variables fail configuration before any
  observation. Requests are bounded, the token is cached in memory only, and
  there is no silent fallback to CLIENT_SECRET.
- optional: `LEGAL_WATCHER_AZURE_AUTHORITY_HOST` (CLIENT_SECRET mode),
  `LEGAL_WATCHER_DELIVERY_BATCH_SIZE` (1..100, default 50)

Wire contract per run (only when there is something to deliver):

```
POST <LEGAL_WATCHER_BACKEND_ENDPOINT>/api/v1/compliance-intelligence/legal-source-observations
Authorization: Bearer <app-only token>
Content-Type: application/json

{
  "schemaVersion": 1,
  "observations": [
    {
      "idempotencyKey": "<deterministic W1 event key>",
      "kind": "AMENDMENT_PUBLISHED" | "CONSOLIDATED_VERSION_AVAILABLE",
      "source": "EUR_LEX",
      "identifierFamily": "CELEX",
      "sourceIdentifier": "<watched/base CELEX>",
      "relatedIdentifier": "<event-causing CELEX>",
      "effectiveFrom": "<optional, only a full ISO timestamp with timezone>",
      "evidence": {
        "sourceUri": "<official CELLAR work URI>",
        "sha256": "<W1 payload hash>",
        "capturedAt": "<W1 capture timestamp>",
        "queryProvenance": "<which official query produced the event>"
      },
      "warnings": []
    }
  ]
}
```

Delivery semantics:

- `ACCEPTED` and `DUPLICATE` are delivery successes and are recorded as
  delivered; a delivered event is never re-posted.
- `REJECTED` is a delivery failure: the reason is preserved, nothing is marked
  delivered, and the event stays pending for a later run.
- `400` malformed envelope, `401`/`403` auth, `503`, `429`, other 5xx and
  network failures fail closed. Only `429`/5xx/network/timeouts are retried,
  bounded (max 2 extra attempts); there is no infinite retry. After a
  batch-level failure the remaining batches are left pending for the next run.
- Source-seen state and delivery state are **separate**: a source event that
  was observed but could not be delivered is not `NEW` again on the next run,
  while its delivery remains retryable. The W1 baseline is never rolled back.

## Production runtime (Azure Container Apps Job)

The chosen production runtime is an Azure Container Apps Job reusing the
existing `adminiculum-malware-ca-env` environment (Austria East, consumption
profile), running with a **system-assigned managed identity**. The managed
identity is expected to later receive the `LegalSource.Ingest` application
role on the Adminiculum API; the backend pins the identity's client/app id via
`LEGAL_WATCHER_CLIENT_ID`. The job authenticates with
`LEGAL_WATCHER_AZURE_AUTH_MODE=MANAGED_IDENTITY`, so no client secret is
provisioned into the job. The same managed identity, endpoint and token
provider instance are reused when the job runs with
`LEGAL_WATCHER_MANIFEST_MODE=BACKEND`; both the manifest GET and the delivery
POST run under one app-only token provider.

State stays file-based (`state.json`, `delivery.json`); it is **not** moved to
PostgreSQL. `LEGAL_WATCHER_STATE_DIR` must point at a persistent mounted
volume inside the job — the planned production mount is Azure Files. Running
the job on an ephemeral container filesystem would lose the W1 baseline and
pending W2 deliveries between runs.

No Azure resource is provisioned by this repository; the description above is
an operational requirement, not an automated deployment step.

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
a valid baseline.

`<state-dir>/delivery.json` — W2 delivery bookkeeping only (delivered event
keys with backend status/timestamp, plus pending failures). Created only in
explicit DELIVER mode and only when there is something to record. Never stores
tokens or identity. Writes are atomic. If delivery bookkeeping cannot be
persisted, the source baseline is not advanced so no undelivered event can be
stranded.

State must not be committed to git (service-local `.gitignore`). In production
`LEGAL_WATCHER_STATE_DIR` must be a persistent mounted volume (see
"Production runtime" above).

## Testing

```bash
npm test          # deterministic tests, mocked CELLAR/backend — no live network
npm run typecheck
npm run build
```

A non-destructive live smoke can be run against the official endpoint with a
manifest snapshot containing `32016R0679`; the first run must establish a
baseline and an immediately repeated run must report zero NEW events. Live
CELLAR availability is never a CI dependency, and no live backend POST or
Azure login is performed by the test suite.

## CI

`.github/workflows/legal-watcher-ci.yml` — path-filtered, Node 20, `npm ci`,
typecheck, build, deterministic tests, production Docker build. No live
CELLAR in CI, no live backend delivery, no Azure deployment.
