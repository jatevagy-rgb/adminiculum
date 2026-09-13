# CODEX_COMPLETION_MATRIX.md

Base audited: `origin/master` @ `2e592a10` + PR #215 (`codex/word-product-reconciliation` @ `574206b4`) merged into `devin/final-product-grow-word-completion`.

Recovery note: the interrupted Codex session's local work was never pushed and is not recoverable. Rows below classify requirements against **what exists on master + PR #215**. Reconstruction follows the declared contracts, not guesswork.

Legend: DONE (exists and works) / PARTIAL (exists, gaps) / NOT_STARTED / SUPERSEDED (covered differently on master) / FIX (exists but broken).

## WORD

| Requirement | Classification | Evidence |
|---|---|---|
| Dashboard orientation | DONE | `Dashboard.tsx`/`DashboardFocused.tsx`: workload tiles, task attention links, client-grouped communication counts, legal news. PR #215 audit: ALREADY_COMPLETE. |
| Cases | DONE | Case list + CaseDetail + operational polish; PR #215: SUPERSEDED_BY_NEW_PRODUCT_DECISION (cases stay separate from task attention). |
| Communication | DONE (PR #215) | CommunicationWorkspace case-first intake (PR #215), linkCommunicationToCase, canonical dialog. |
| Task catalogue | NOT_STARTED | TaskType is a fixed enum; no user catalogue. PR #215 marked BLOCKED by schema ownership — now released. |
| Task work roles | NOT_STARTED | Single `assignedToId` + TaskSubmission/reviewer lifecycle only. |
| Clients | DONE | Compact client cards; dossier editing; lifecycle archive (PR #208). |
| Dossier | DONE | Client page: identity, house style, calendar/cases/comms/time links, Grow card. |
| Portal | PARTIAL→DONE (PR #215) | PR #215: clarified portal settings + save outcomes. Section ordering review remains light. |
| Organization | DONE (PR #215) | OrganizationEditor wires guarded person/group create/update/reparent; backend validates same-client + cycles. |
| Calendar | DONE | Client calendar day/month/year/5y views over authoritative sources. |
| Billing | DONE | hourly rates, billing-preparations review workspace, invoice drafts, PDF. |
| Visibility | DONE | MilestonePublicationPanel, publication grants, no parallel enums. |
| Document workspace | PARTIAL (PR #215) | Three-column arrangement of existing controls landed in PR #215 (compare page + review controls). Region labeling/STACK order final reconciliation needed. |
| Known-person anonymization | NOT_STARTED | AnonymizeModal exists; no OrganizationPerson picker / explicit person-field mapping. |

## GROW

| Requirement | Classification | Evidence |
|---|---|---|
| Research corpus | NOT_STARTED | No `research/` module. Verified citation identified: Goel, Bandara & Gable (2023), DOI 10.1007/s41471-023-00158-y. |
| Domains | NOT_STARTED | No ProblemDomain model/module. |
| Diagnosis | NOT_STARTED | No DiagnosisCandidate. |
| Evidence gate | NOT_STARTED | No sufficiency decision. |
| Recommendations | NOT_STARTED | No RecommendationCandidate/Run. |
| Human review | NOT_STARTED | — |
| Opportunity | NOT_STARTED | No ImprovementOpportunity. |
| Initiative handoff | PARTIAL | `DevelopmentInitiative` + client-company routes exist; link from a recommendation does not. |
| Outcome | NOT_STARTED | No OutcomeMeasurement; ProcessObservationSnapshot exists (T2B) to reuse for before/after. |
| ROI | NOT_STARTED | No roiEngine. |
| Grow Home | NOT_STARTED | `vallalati-mukodes` workspace exists (operations overview) but no opportunity/Initiative outlet. |
| Opportunity feed | NOT_STARTED | — |
| Detail + evidence drawer | NOT_STARTED | — |
| Progress screen | PARTIAL | DevelopmentInitiative listing exists inside workspace; no dedicated progress projection. |
| Results screen | NOT_STARTED | — |

## OBS

| Requirement | Classification | Evidence |
|---|---|---|
| Source registration | DONE (backend only) | `ObservatoryIngestionService.registerExternalSource`; NO HTTP route exists. |
| Discovery run | DONE (backend only) | start/complete/fail/partial; NO HTTP route. |
| Observation | DONE (backend only) | `ingestObservation` idempotent (clientId+connectionId+key), digest-checked; NO HTTP route. |
| Survey intake | NOT_STARTED | No `intake.ts`, no `GrowIntake.tsx`. |
| File import | NOT_STARTED | Out of scope unless needed for the vertical. |
| Process map | NOT_STARTED | No projection/component; BusinessProcessStep has `position` ordering (no nextStepIds — matches Codex finding). |
| Connector boundary | DONE | `validateNoSecrets` + Observation-only writes; no canonical writes from ingestion. |

## VALIDATION

| Item | Classification | Evidence |
|---|---|---|
| Demo Kft | PARTIAL | demo-kft reset/presentation scripts exist; Grow journey not covered. |
| Migration replay | DONE (baseline) | `verify-migration-replay` PASS on merged base; must re-pass after additive migration. |
| Backend aggregate baseline | RUNNING | Full `jest --runInBand` on base vs branch required. NOTE: `obs1Ingestion.integration.test.ts` FAILS on master (mock actor has no User row → requireInternal 403) — preexisting failure, non-blocking in CI (continue-on-error). |
| Frontend tests | DONE (baseline pending) | 91 test files; suite must pass on branch. |
| Browser smoke | NOT_STARTED | — |
| Accessibility smoke | NOT_STARTED | — |
| CI | PENDING | — |
| PR | PENDING | — |
