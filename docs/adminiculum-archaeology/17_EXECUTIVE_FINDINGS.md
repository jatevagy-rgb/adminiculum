# 17 — Executive Findings

> Consolidated, evidence-grounded summary of the forensic audit. Canonical = `50945ecd309c4c609fc48d07218fe42917ab8e82` (`release/editor-ops-workflow-1`). Confidence: PROVEN/STRONGLY_INDICATED/UNPROVEN as noted throughout `01`–`16`. Counts derived from `01`/`02`/`09`.

## The one-sentence finding

**Adminiculum already contains ~63% of the communicated master roadmap as working or semi-working code; the real deficit is broken CONNECTIONS (case→work-package on modern paths, case→portal for internal intake, DOCX/PDF text-diff, version-history UI) plus a small set of true greenfield (persisted thread/unread/reply, outgoing mail, case-level reviewer, billing).**

## Headline metrics

- **CURRENT_CANONICAL=** `50945ecd309c4c609fc48d07218fe42917ab8e82`
- **MASTER_ROADMAP_ITEMS_TOTAL=** `90` (MR-001…MR-090)
- **CURRENT_CANONICAL_WORKING=** `57` (KEEP — live & reachable)
- **CURRENT_CANONICAL_PARTIAL=** `18` (FINISH — foundation exists, incomplete/disconnected)
- **CURRENT_BACKEND_ONLY=** `~7` (MR-012, 013, 046, 047, 070, 085, 038)
- **CURRENT_UI_ONLY=** `1` (MR-058 prompt catalog is component-only) — plus several backend-only fall in above
- **HISTORICALLY_WORKING_CAPABILITIES_FOUND=** `14` (see `12`)
- **OLD_VERSION_MORE_COMPLETE_THAN_CURRENT=** `4` (demoted-grant-ease, case→workpackage, version-history, doc text-diff — the last three are recoverable)
- **LOST_SEMANTICS_FOUND=** `8` (see `12` / `05`)
- **REMOVED_BUT_RECOVERABLE=** `4` (workpackage-on-modern-paths, DOCX text-diff, version-history UI, SP-folder-move? — the first three proven)
- **DRAFT_REPLAY_CANDIDATES=** `5` (`peterfi/communication-workspace-canonical`, `case-first-communication-context`, `case-overview-communication-snapshot`, `client-overview-communication-snapshot`, `client-communication-summary-read-model`)
- **TRUE_GREENFIELD_ITEMS=** `5` (MR-012 case reviewer, MR-038 thread, MR-039 unread/reply, MR-040 outgoing mail, MR-075 billing)

## Workflow engines

- **WORKFLOW_ENGINES_FOUND=** `9` mechanisms (E1 V1 status, E2 V2 state machine, E3 DAG/orchestration, E4 work-package, E5a lifecycle, E5b intake, E6 task lifecycle, E7a document review, E7b work-items) — see `03`
- **WORKFLOW_ENGINES_TO_KEEP=** `7` (E3, E4, E5a, E5b, E6, E7a, E7b)
- **WORKFLOW_ENGINES_TO_MERGE=** `2` (E4→merge with E3; E7a→merge with doc pipeline)
- **WORKFLOW_ENGINES_TO_DEPRECATE=** `1` (E1 V1 — READ_COMPATIBILITY_ONLY) · **REMOVE_LATER=** `1` (E2 V2, zero importers — PROVEN dead)

## Outlook / communication

- **OUTLOOK_REAL_FOUNDATION=** PROVEN — real app-only Graph inbound read + persist + safe thread→case linkage, on `POST /communications/outlook/sync`, gated OFF by default (`04`); normalize-only facade is separate
- **OUTLOOK_HISTORICAL_CAPABILITIES=** inbound ingest, metadata-only attachments, case/create-case/link-client/extract-task/edeadline, link-task; NO delta/subscription/webhook/outgoing/unread/thread-persistence
- **OUTLOOK_MISSING_CONNECTIONS=** outgoing mail, persisted thread/unread/reply (→ schema), delta/subscription, attachment→document, case→portal for internal intake, global attention wiring

## Historical completeness indexes

- **CASE_INTAKE_HISTORICAL_COMPLETENESS=** PROVEN — ≥4 creation paths + transactional intake; but workpackage/reviewer/portal are NOT wired on modern paths (`05`)
- **DOCUMENT_HISTORICAL_COMPLETENESS=** HIGH — review lifecycle + structured compare + anonymize/rehydrate + publication all survive; DOCX/PDF text-diff + version-history UI disconnected (`06`)
- **PORTAL_HISTORICAL_COMPLETENESS=** HIGH — onboarding + membership + workspace/grant + CASE_RELAY/ORG all PROVEN working; only the grant→browse ease regressed (`07`)

## Connections

- **BROKEN_CONNECTIONS_TOTAL=** `6` (case→workpackage modern paths, case→portal internal intake, doc→text-diff, comm-attr→document, intake-deadline→agenda, comm→responsible)
- **HISTORICALLY_WORKING_CONNECTIONS_TOTAL=** `~14` (spine mostly intact — see `10`)
- **RECOVERABLE_CONNECTIONS_TOTAL=** `5` (workpackage, text-diff, version-history, comm→responsible, intake→agenda) plus `1` requiring schema (internal-intake→portal)

## Reuse

- **ROADMAP_ITEMS_WITH_EXISTING_REUSABLE_FOUNDATION=** `60` (KEEP 57 + RECONNECT 3) — i.e., ~2/3 of the roadmap is not greenfield
- **ROADMAP_ITEMS_TRULY_STARTING_FROM_ZERO=** `5` (BUILD_NEW)

## TOP-10 "we already built this"

1. Task submission + review lifecycle · 2. Document review lifecycle · 3. Structured document comparison (typed segments) · 4. Anonymous/rehydrate pipeline · 5. Case→workpackage→DAG→tasks · 6. Client self-service onboarding + membership request · 7. Organization hierarchy + authority/access + CASE_RELAY · 8. Outlook real inbound (gated) · 9. Matter intake (transactional, typed deadlines, thread-links) · 10. Client-wide communication read model (fail-closed, no N+1; branch)

## TOP-10 "we lost or disconnected"

1. Case→work-package on modern creation paths · 2. DOCX/PDF text-diff (extractor exists, gated off) · 3. Version-history presentation · 4. Case→portal for internally-intaken matters · 5. Communication create-case responsible lawyer · 6. Intake typed deadlines → agenda · 7. V1 case-status→SharePoint-folder move (superseded) · 8. Grant→browse portal ease (intentional) · 9. Global attention inbox surface · 10. Standalone clause-library/handoff/settings pages

## TOP-10 connections to restore first

1. case→workpackage (intake/comm/portal) · 2. document→text-diff (DOCX/PDF) · 3. case→portal grant (internal intake) · 4. version-history UI · 5. comm-create-case→responsible · 6. intake-deadline→agenda · 7. enable+credential real Outlook sync · 8. merge `peterfi` communication read-model/context · 9. converge two inboxes / two compares · 10. wire global attention center

## Findings (severity)

- **P0 (highest-leverage recoverable):** (1) case→workpackage broken on the modern default intake path — new matters cannot instantiate a real workable scope; (2) DOCX/PDF text-diff disabled despite the extraction engine present — the primary Word corpus is excluded from the product's own compare, and AGENTS.md "compare is metadata-only" is now FALSE; (3) internal intake / communication-created matters never become portal-visible; (4) communication create-case sets no responsible lawyer.
- **P1:** duplicated surfaces (two communication inboxes, two compare surfaces); V1 workflow engine + stale routes comment; intake `caseIntakeDeadline` not mirrored to `Case.deadline`; version-history UI removed; Outlook sync gate OFF by default (a real feature that appears missing); several backends with no UI (search, classify, change report).
- **P2:** standalone surfaces absent (clause-library, handoff, settings, review-queue, prompt board); a stale-architecture branch family (`next-development`, `ops-pages-ux-cleanup-1`, `runtime-shape-20260308`) carrying a synthetic-data mock portal that must NOT be merged.

## PRODUCT_ARCHAEOLOGY_CONFIDENCE

**MEDIUM-HIGH.** The four archaeology agents + this workspace's own session work produced **PROVEN** evidence (exact SHAs, ancestors, file/route/model reads, mount points, branch ahead/behind counts) for the workflow engines (`03`), Outlook/communication (`04`), intake (`05`), document (`06`), portal/org (`07`), and graveyard/reconciliation (`08`/`14`). **Medium** caveats: (a) no toolchain → no `tsc`/runtime verification, so "reachable ≠ runtime-verified"; (b) frontend reachability of several API routes is marked UNPROVEN/STRONGLY_INDICATED where no component consumer was read; (c) a few cross-domain links (agenda reads `Case.deadline`) are STRONGLY_INDICATED not exhaustively traced; (d) `main` is stale (`1b2f879`), so the audit deliberately used `release/editor-ops-workflow-1`.

## Noise/confidence on the hypothesis

- **CONFIRMED (PROVEN).** "Some 'new roadmap work' is actually reconstruction/integration work" — the client/portal/identity, task, document, work-package, and communication cores are largely built. Two full generations of portal code and a six-generation document pipeline exist in history.
- **CONFIRMED (PROVEN).** "Backend capabilities survived while UI entry points disappeared" — DOCX extraction, `DocumentVersion`, `searchDocuments`/`classifyDocument`, change reports, case-deadlines, handoff export.
- **CONFIRMED (PROVEN).** "Features believed missing may already exist under old names" — `/tasks`/`/deadlines`/`/reviews`/`/clause-library`/`/settings` are all live at canonical.
- **PARTIALLY CONFIRMED.** "Old implementations deprecated before semantics replayed" — the V2 `cases/workflow.ts` (dead) and V1 SP-folder move are the clearest cases; both are safely superseded, not recoverable-value.
- **NOT CONFIRMED (UNPROVEN).** The mock portal generation and the browser editor were never desirable to resurrect; no lost high-value capability needs a browser clone.

## Executive bottom line

The highest-value work is **not** building new features. It is (a) **merging the `peterfi` communication read-model/context stack** (fail-closed, no N+1) which this workspace already built, (b) **reconnecting case→workpackage→portal** on the modern creation paths, and (c) **flipping on DOCX/PDF text-diff + version-history** from existing backends. True greenfield is confined to thread/unread/reply, outgoing mail, case-level reviewer, and billing.

---

# Count Reconciliation (non-exclusive categories)

The register uses **two distinct lenses**. They are NOT a single partition; summing them would double-count. This section makes the overlap explicit so the numbers are never misread.

## Lens A — Recommended ACTION (exhaustive partition of MR-001…MR-090)

Each MR carries exactly **one** primary action (see `09`). These are mutually exclusive and sum to 90:

| ACTION | count | MR ids (examples) |
|---|---|---|
| KEEP | 57 | 001,004,005,006,007,009,014-016,018-024,026-030,031,035,036,041,042,045,048,050-056,059-065,067-069,071-073,076,079,082-084,086-088,090 |
| FINISH | 18 | 002,008,017,025,032,037,046,057,058,066,070,074,077,078,080,081,085,089 |
| RECONNECT | 5 | 003,010,013,047,049 |
| MERGE_EXISTING_COMPONENTS | 3 | 011,043,044 |
| REPLACE_BAD_CURRENT_UI | 1 | 034 |
| DEPRECATE_OLD | 1 | 033 |
| BUILD_NEW | 5 | 012,038,039,040,075 |
| **TOTAL** | **90** | ✓ |

## Lens B — STATUS / descriptor (non-exclusive, from `02`)

These describe FACETS and can overlap each other and Lens A. They are **not** a partition and must not be summed with Lens A:

- `CURRENT_CANONICAL_WORKING` (57 in the executive) == the KEEP bucket. It is a convenient shorthand but is NOT a proof that all 57 are fully end-to-end working — e.g. MR-013 (case→portal), MR-025 (CASE_RELAY), MR-038 (thread) carry additional PARTIAL/BACKEND_ONLY labels in `02`. So **WORKING is a sub-approximation of KEEP, not a disjoint fact.**
- `CURRENT_CANONICAL_PARTIAL` (18) == the FINISH bucket: foundations exist, surface-incomplete. Disjoint from KEEP, but **overlaps** the BACKEND_ONLY / UI_ONLY descriptors below.
- `CURRENT_BACKEND_ONLY` (~7: MR-012, 013, 046, 047, 070, 075-adjacent, 085) is a **subset** of FINISH/KEEP — those MRs are also counted in Lens A. Adding ~7 to 57+18 **double-counts** them (the 57+18+~7+1 ≈ 83/84 appearance is a red herring).
- `CURRENT_UI_ONLY` (1: MR-058 prompt catalog) is also in the 90 (FINISH).
- `PLANNED_ONLY` = 0 (the roadmap items we classified were all implemented at least partially; nothing is code-only-planned).
- `TRUE_GREENFIELD / BUILD_NEW` (5) == the BUILD_NEW bucket; **disjoint** from the rest.
- `UNKNOWN` = 0. We deliberately did not use an UNKNOWN bucket; uncertain evidence is labelled **UNPROVEN** at the claim level instead, so the register never ducks into a catch-all.

**Correct arithmetic:** the only self-consistent sum is Lens A = 90. Lens B figures are descriptors; the `~` on BACKEND_ONLY reflects that several are PROVEN file/route reads while a couple (e.g. MR-075 billing) are STRONGLY_INDICATED placeholder-only.

## Workflow-engine classification overlap (03)

`WORKFLOW_ENGINES_FOUND=9` is a count of **distinct engine mechanisms** (E1 V1 status, E2 V2 state machine, E3 DAG/orchestration, E4 work-package, E5a lifecycle, E5b intake, E6 task lifecycle, E7a document review, E7b work-items).

The keep/merge/deprecate numbers are **NOT a partition**:
- `TO_KEEP=7` (E3, E4, E5a, E5b, E6, E7a, E7b).
- `TO_MERGE=2` (E4 → merge with E3; E7a → merge with the doc pipeline) is a **subset of the 7 KEEP** — these two are both "keep as canonical AND merge into the pipeline", so they are counted in KEEP too. Adding them to KEEP (7+2=9) double-counts E4 and E7a.
- `TO_DEPRECATE=1` (E1 V1) and `DEAD_REMOVE_LATER=1` (E2 V2) are **outside** the 7 KEEP.

**Correct arithmetic:** distinct 9 = 7 KEEP (incl. 2 merge-candidates) + 1 DEPRECATE + 1 DEAD = 9. So: found=9, keep=7, merge⊂keep(=2), deprecate=1, remove-later=1. No number is inflated.

# Preserved evidence-quality boundaries

The audit deliberately keeps uncertainty rather than converting it. Boundaries, by area:

- **Outlook real Graph inbound — PROVEN** (`outlookGraphLive.ts`: app-only `client_credentials` token → `GET /users/{mailbox}/messages`; `syncOutlookMailbox` calls `reader.fetchRecentInbound`). **Gated-off production state — PROVEN** (`ENABLE_OUTLOOK_IMPORT='true'` + `OUTLOOK_GRAPH_*` env; otherwise 501). The normalize-only `/outlook/import` + `/import-dry-run` are **PRIVATELY separate** (never contact Graph). No live/E2E Graph test → **OUTLOOK runtime reachability UNPROVEN (fake-fetch only)**.
- **Case → work packet disconnected on modern paths — PROVEN** (`createCaseWorkPackageSnapshot` only in legacy `createCase`).
- **DOCX/PDF text-diff disconnection — PROVEN** (`versionText.ts` gates DOCX/PDF as `FORMAT_NOT_TEXT_EXTRACTABLE` while `textExtractor.ts` has mammoth/pdf-parse). AGENTS.md "compare is metadata-only" is **now FALSE** at canonical (full diffEngine + typed segments exist).
- **Version-history UI loss — PROVEN removal by design** (editor guards strip autosave/track-changes); **backend `DocumentVersion` intact PROVEN**; recovery is presentation-only.
- **Case → portal grant/intake gap — PROVEN** (only CP1 conversion yields grant+publication); the permission/schema to close it is **UNPROVEN/BUILD_NEW (MR-013)**.
- **Communication create-case responsible gap — PROVEN** (`assignedLawyerId` never set on that path).
- **Intake deadline → agenda gap — STRONGLY_INDICATED, NOT exhaustively traced** (`CaseIntakeDeadline` typed deadlines not mirrored to `Case.deadline`; `agenda/service.ts` reads `Case.deadline`).
- **Historical membership/onboarding UX — PROVEN end-to-end** (JIT identity → PortalOnboarding → membership request → admin approval → re-login → case grant; all ancestors of canonical). The ease regression (grant→browse) is **intentional/security-hardening, not feature loss**.
- **Workflow-engine count/classification — PROVEN** for file/route/model/mount; frontend reachability of a few routes (workflow-graph, work-items) is **UNPROVEN** (no consumer read).
- **Draft communication stack** (`peterfi/…`) — **PROVEN ahead-of-canonical, not merged**; runtime behavior **UNPROVEN** (no node).
- **Old vs current document generations — PROVEN** SHA lineage (GEN-1→GEN-2→GEN-3→CURRENT); the recoverable text-diff/version-history are **PROVEN** backend-side.

These boundaries are retained verbatim in `02`–`16`; nothing was smoothed toward a more positive reading.
