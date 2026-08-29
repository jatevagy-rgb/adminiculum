# 16 — Recovery Execution Roadmap (R0–R5 rails + connection spine)

> Execution sequence ordered by: R0 live stability → R1 restore core connections → R2 replay draft/old semantics → R3 converge duplicated systems → R4 complete end-to-end lawyer flow → R5 true greenfield only.
> Every item carries a label: `KEEP` / `FINISH` / `RECONNECT` / `SEMANTIC_REPLAY` / `MERGE_EXISTING` / `GREENFIELD`.
> This file is docs-only and evidence-grounded (see `01`–`15`). Item labels are descriptive; they are NOT a proof that the underlying canonical code is end-to-end wired.

---

## R0 — LIVE STABILITY

### Already complete (baseline truth — do NOT re-open, do NOT re-describe)

| Assertion | Value | Evidence |
|---|---|---|
| Canonical migration replay | PASS | `.github/workflows/prisma-migration-replayability.yml` + backend-postgresql-integration "Provision schema" |
| Schema verification | PASS | migration replayability workflow |
| Demo Kft reset | PASS | `test:demo-kft:db` / `demoKftFixture.integration.test.ts` (a **reset of the Demo Kft fixture**, NOT a global synthetic-data purge) |
| Demo Kft fixture — CASES | 3 | fixture |
| Demo Kft fixture — TIME_TOTAL_MINUTES | 875 | fixture |
| Demo Kft fixture — BASELINE_EMPLOYEE_COUNT | 47 | fixture |

### Currently OPEN R0

| ID | Item | Status | Note |
|----|------|--------|------|
| R0-A | PR90 task String-ID contract | code ready; exact-head central Preflight + Backend PG now green | awaiting final acceptance/merge → `FINISH` |
| R0-B | Portal authenticated workspace/persona mismatch | OPEN **P1** | → `FINISH` (auth/persona alignment) |
| R0-C | Production malware scanner provider | OPEN **P1** | **NEVER recommend fail-open fallback**; only CLEAN files may reach storage; solution = real provider + safe mapping → `FINISH` (security) |
| R0-D | Safe error surfaces (PR86) | NOT on current canonical | must wait for PR81 ordering/current-canonical synchronization → `FINISH` (blocked-by-ordering) |
| R0-E | Fixture pollution / acceptance data hygiene | SEPARATE from Demo Kft reset | **never** describe Demo reset as a global synthetic-data purge → `FINISH` (hygiene) |

---

## R1 — RESTORE EXISTING CORE CONNECTIONS

| Item | Label | REUSE | REPLAY | CONNECT | DELETE/DEPRECATE | BUILD_NEW |
|---|---|---|---|---|---|---|
| Enable + credential real Outlook inbound | `FINISH` | `outlookGraphLive.ts` + `syncOutlookMailbox` (PROVEN foundation) | — | enable `ENABLE_OUTLOOK_IMPORT` + `OUTLOOK_GRAPH_*`; surface real sender/subject/attachment | — | — |
| Document text-diff (DOCX/PDF) | `RECONNECT` | `textExtractor.ts` (mammoth/pdf-parse) | DOCX/PDF diff resolver path | comparison resolver → extractor | — | — |
| Case→work-package on modern creation | `RECONNECT` | `createCaseWorkPackageSnapshot` | — | call snapshot from intake/comm/portal | — | — |
| Communication create-case → responsible | `RECONNECT` | `assignedLawyerId` wiring | — | set on comm create-case | — | — |
| Intake typed deadlines → agenda | `RECONNECT` (STRONGLY_INDICATED) | `CaseIntakeDeadline` + `agenda` | — | mirror/merge intake deadlines into deadline/agenda surface | — | — |
| Internal intake → portal visibility | `RECONNECT` (schema) | `client-publication` + grant + `intakeConversionService` | — | grant+publication for internally-intaken matters | — | schema/permission for grant |
| Consistent case type across paths | `FINISH` | `caseType`/`matterType`/`CaseTypeDefinition` | — | set real caseType on intake/comm/portal | — | — |

---

## R2 — REPLAY DRAFT / OLD SEMANTICS

| Item | Label | SOURCE (draft/historical) | WHAT TO REPLAY | GATE (must hold) |
|---|---|---|---|---|
| Client-wide communication read model | `SEMANTIC_REPLAY` | `peterfi/client-communication-summary-read-model` (`clientSummary.service.ts`) | fail-closed dual-link auth, no-N+1 bounded query, effective-timestamp contract | **BRANCH-ONLY, not canonical** — revalue + merge with its case-auth repair + independent-review addendum intact |
| Case-first / client-case-overview comm context | `MERGE_EXISTING` | `peterfi/case-first-communication-context`, `case-overview-communication-snapshot`, `client-overview-communication-snapshot` | communicationContext.ts + `/clients/[clientId]/communications` + honest contextual entries | de-dupe (case-overview block already existed); do NOT duplicate an inbox |
| Composition/safety contract | `SEMANTIC_REPLAY` | `peterfi/communication-workspace-canonical` | `communicationWorkspace.ts` (no provider-id leak, real filters, no fake unread) | unchanged semantics |

> Note: `MR-046` immutable DocumentVersion history is alive at canonical — **NOT** a replay/semantics target here.

---

## R3 — CONVERGE DUPLICATED SYSTEMS

| Item | Label | REUSE | CONNECT | DELETE/DEPRECATE | BUILD_NEW |
|---|---|---|---|---|---|
| Single communication inbox | `MERGE_EXISTING` | `CommunicationsOverview` + `CommunicationWorkspace` | merge to one global workspace; keep a triage toggle | deprecate the redundant inbox | — |
| Single compare surface | `MERGE_EXISTING` | `ComparisonWorkspace` | redirect legacy `app/documents/compare` → `ComparisonWorkspace` | deprecate legacy compare surface | — |
| Single workflow engine story | `KEEP` | DAG engine (E3) + work-package (E4) | document E1/E2 as read-compat; use E3+E4 as one | deprecate V1 (READ_COMPATIBILITY_ONLY); remove dead V2 | — |
| Canonical auth source-of-truth | `KEEP` | `client-interaction/base.ts` | ensure all client-domain modules use it | — | — |
| Converge Outlook endpoints | `DEPRECATE_OLD` | `POST /outlook/sync` (live path) | — | deprecate normalize-only `/outlook/import` + `/import-dry-run` facade (or document as test-only) | — |

---

## R4 — COMPLETE END-TO-END LAWYER FLOW

| Item | Label | REUSE | CONNECT | BUILD_NEW |
|---|---|---|---|---|
| Cases → portal (internal intake grant) | `FINISH` | grant + publication | close MR-013 gap | (schema/permission) |
| Global attention center | `FINISH` | `modules/notifications` + `attentionCategory` | wire cross-capability attention inbox | attention inbox surface |
| Standalone surfaces | `FINISH` | clause-library, handoff packages, settings, search/classify, change reports (backends exist) | add pages/export/UI | — |
| Full create-case intaken flow (portal matter with tasks) | `FINISH` | `createCaseFromPortalIntakeInTransaction` | add task generation to portal path | — |
| Review queue / batch review | `FINISH` | TaskReview + DocumentReview | batch surface | — |

---

## R5 — TRUE GREENFIELD ONLY

| Item | Label | BUILD_NEW (justification) |
|---|---|---|
| Case-level reviewer assignment at creation | `GREENFIELD` | no creation path sets it (MR-012) |
| Persisted Outlook thread model | `GREENFIELD` | requires schema; `THREAD_PERSISTENCE_FOLLOWUP=YES` (MR-038) |
| Outlook unread / read / reply state | `GREENFIELD` | requires schema/inbox model (MR-039); customer-portal `ClientQuestionThread`/read-state is separate |
| Outgoing mail (send/reply) | `GREENFIELD` | no Graph sendMail anywhere (MR-040) |
| Billing / invoice engine | `GREENFIELD` | placeholder only (MR-075) |
| (later) Outlook delta/subscription sync | `GREENFIELD` | bounded poll only (part of MR-032) |

---

## CRITICAL CONNECTION SPINE (authoritative execution spine)

| # | Arrow | CURRENT_CANONICAL | DRAFT_PR | HISTORICAL_SOURCE | MISSING_DELTA | TARGET_PHASE |
|---|---|---|---|---|---|---|
| 1 | OUTLOOK INBOUND → | `outlookGraphLive.ts` + `syncOutlookMailbox` (gated) | — | `b88fb84` (live Graph reader) | enable + credentials; delta (later) | R1 (enable) / R5 (delta) |
| 2 | → COMMUNICATION | `Communication`/`CommunicationAttachment` | — | — | — | R0/R3 |
| 3 | → CLIENT | `link-client`; client-wide read model | `peterfi/client-communication-summary-read-model` | — | merge fail-closed read model | R2 |
| 4 | → CASE | `create-case`/`createCaseIntake` | `peterfi/case-first-communication-context` | `ab5b96d` (atomic create-case) | merge case-first context | R2 |
| 5 | → RESPONSIBLE LAWYER | set on intake/portal; **NULL on comm create-case** | — | — | assign on comm path | R1 |
| 6 | → CASE TYPE | `caseType`/`matterType`; comm hardcodes OTHER | — | — | consistent caseType on comm/portal | R1 |
| 7 | → WORK PACKAGE | legacy `createCase` only | — | wp1–wp5 (codex/recovery) | snapshot on modern paths | R1 |
| 8 | → TASK | DAG E3 + opening-tasks; portal path has none | — | — | task generation on portal path | R1 |
| 9 | → DOCUMENT | documents ledger (+ immutable versions) | — | — | — | R0/KEEP |
| 10 | → REVIEW | document review lifecycle | — | `d1d8fd6` | — | KEEP |
| 11 | → LAWYER DECISION | TaskReviewDecision + review approve | — | — | — | KEEP |
| 12 | → DEADLINE/AGENDA | `Case.deadline` + `CaseIntakeDeadline` + `agenda` | — | — | intake deadlines → agenda | R1 |
| 13 | → TIME | `TimeEntry` + timesheet report | — | — | — | KEEP |
| 14 | → PORTAL | publication + grant (CP1 only) | — | `intakeConversionService` + `client-publication` | internal-intake → grant | R4 (schema) |
| 15 | → OUTGOING/REPLY | **none** | — | — | Graph sendMail (schema) | R5 (greenfield) |
| 16 | → CASE CLOSE | lifecycle close/reopen/archive | — | `e321feb`/`581ffc2` | — | KEEP |

**Spine status:** steps 2,4,9,10,11,13,16 are `WORKING_CANONICAL`. Steps 1 (gated), 3 (branch), 12, 14 are `PARTIAL`. Step 15 is `MISSING/GREENFIELD`. No step is a browser-editor resurrection; Word stays primary.

---

## Guardrails (all phases)

- **Word remains the primary editor** — never resurrect browser-editor autosave/track-changes.
- **No fake data** — no synthetic/mock portal generation; honest empty states remain.
- **Fail-closed authorization** — any new read model must reuse `client-interaction/base` gates; no frontend-only auth; malware scanner never fails open.
- **No blind merge** of stale-architecture branches (`next-development`, `ops-pages-ux-cleanup-1`, `runtime-shape-20260308`).
- **Wire CI from the start** — any new PG suite must run in `.github/workflows/backend-postgresql-integration.yml`.
- **Fixture hygiene is separate** from Demo Kft reset; never present Demo reset as a global synthetic-data purge.
