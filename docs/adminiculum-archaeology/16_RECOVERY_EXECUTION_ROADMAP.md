# 16 — Recovery Execution Roadmap

> NEW implementation sequence, ordered by: (1) restore historically-working core behavior → (2) reconnect existing components → (3) canonicalize duplicated systems → (4) complete end-to-end flows → (5) only then build true greenfield. Conservative; every phase states REUSE / REPLAY / CONNECT / DELETE-DEPRECATE / BUILD_NEW.

## PHASE R1 — Restore historically-working core behavior

| Item | REUSE | REPLAY | CONNECT | DELETE/DEPRECATE | BUILD_NEW |
|---|---|---|---|---|---|
| Enable real Outlook inbound | `outlookGraphLive.ts` + `syncOutlookMailbox` (`04`) | — | enable + credentials + config; surface real sender/subject/attachment | deprecate normalize-only facade (`/outlook/import`, `import-dry-run`) eventually | — |
| Document value unblock | `textExtractor.ts` (mammoth/pdf-parse) + `DocumentVersion` backend (`06`) | DOCX/PDF text-diff resolver path | resolver → extractor; version-history presentation from docs page | — | — |
| Case→work-package→tasks spine | `createCaseWorkPackageSnapshot` + `instantiateCaseWorkflow` + `createOpeningTasks` (`05`,`03` E3/E5b) | — | call snapshot + workflow on intake/comm/portal | — | — |

## PHASE R2 — Reconnect existing components (highest-leverage, mostly frontend/service wiring)

| Item | REUSE | REPLAY | CONNECT | DELETE/DEPRECATE | BUILD_NEW |
|---|---|---|---|---|---|
| Merge `peterfi` communication stack | `clientSummary.service.ts` + `communicationContext.ts` + case-first pages (`11`) | REPLAY the case-auth repair + independent-review addendum (fail-closed dual-link, effective-timestamp, route/mock tests) | client-wide read model + client case-first context into canonical | — | — |
| Make intake the base creation path | `createCaseIntake` (`05`) | — | assigned lawyer + responsible on comm path; caseType consistent | deprecate legacy `createCase` as default | — |
| Internal intake → portal | `client-publication` + grant + `intakeConversionService` (`05`) | — | grant+publication for internally-intaken matters | — | schema/permission for portal grant |
| Converge compares | `ComparisonWorkspace` (`06`) | — | redirect legacy `app/documents/compare` → `ComparisonWorkspace` | deprecate legacy compare surface | — |

## PHASE R3 — Canonicalize duplicated systems

| Item | REUSE | REPLAY | CONNECT | DELETE/DEPRECATE | BUILD_NEW |
|---|---|---|---|---|---|
| Single communication inbox | `CommunicationsOverview` + `CommunicationWorkspace` (`04`) | — | merge to one global workspace surface; keep triage toggle | deprecate the redundant inbox | — |
| Single workflow engine story | DAG engine (E3) + work-package (E4) (`03`) | — | document V1/V2 as read-compat; wire E3+E4 as one | deprecate V1 (READ_COMPATIBILITY_ONLY); remove dead V2 | — |
| Single auth source-of-truth | `client-interaction/base.ts` (`07`) | — | ensure all client-domain modules use it | — | — |

## PHASE R4 — Complete end-to-end flows

| Item | REUSE | REPLAY | CONNECT | DELETE/DEPRECATE | BUILD_NEW |
|---|---|---|---|---|---|
| Task submission/review to dashboard attention | `modules/notifications` + `attentionCategory` + task attention (`10`) | — | wire global attention center | — | attention inbox surface |
| Standalone surfaces | clause-library, handoff package, settings, search/classify, change reports (`09`) | — | add pages/export/UI over existing backends | — | — |

## PHASE R5 — True greenfield only

| Item | BUILD_NEW (justification) |
|---|---|
| Case-level reviewer assignment at creation | no creation path sets it (MR-012) |
| Persisted thread model | requires schema; `THREAD_PERSISTENCE_FOLLOWUP=YES` (MR-038) |
| Unread / read / reply state | requires schema/inbox model (MR-039) |
| Outgoing mail (send) | no Graph sendMail anywhere (MR-040) |
| Billing / invoice engine | placeholder only (MR-075) |
| (later) delta/subscription Outlook sync | bounded poll only (part of MR-032) |

## Guardrails for every phase

- **Word remains the primary editor** — never resurrect browser-editor autosave/track-changes.
- **No fake data** — no synthetic/mock portal generation; honest empty states remain.
- **Fail-closed authorization** — any new read model must reuse `client-interaction/base` gates; no frontend-only auth.
- **No blind merge** of stale-architecture branches (`next-development`, `ops-pages-ux-cleanup-1`, `runtime-shape-20260308`).
- **Wire CI from the start** — any new PG suite must run in `.github/workflows/backend-postgresql-integration.yml` (learned from PR82).
