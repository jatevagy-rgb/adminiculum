# 03 — Workflow Engine Archaeology

> Deep reconstruction of every workflow-like mechanism ever implemented. Evidence: `git log --all`, `git ls-tree 50945ecd`, `git log --diff-filter=A --follow`, file reads. Confidence `PROVEN`/`STRONGLY_INDICATED`/`UNPROVEN`. No repo topology was altered by the original `809d602` box-in; every engine below survives the box at `Backend/src/modules/...`.

## Headline finding

**There is no single `WorkflowInstance`/`WorkflowEngine` persistence model.** The modern engine stamps a DAG onto real `Task` rows via nullable string columns (`Task.workflowInstanceId/workflowTemplateKey/workflowTemplateVersion/workflowStepKey/workflowDependsOnKeys[]/workflowActivatedAt`). **Nine distinct workflow-like mechanisms coexist** in canonical (E1 V1 status, E2 V2 state machine, E3 DAG/orchestration, E4 work-package, E5a lifecycle, E5b intake, E6 task lifecycle, E7a document review, E7b work-items). No `workflowInstance`/`workItem`/`Workflow` Prisma model exists; `Task.workflowInstanceId` (`schema.prisma:1576`) is a plain `randomUUID` string, not an FK.

## Engine 1 — Case Workflow Engine **V1** (status-transition + SharePoint-move)

| Field | Value |
|---|---|
| Path | `Backend/src/modules/workflow/` (`workflow.service.ts`, `workflow.types.ts`, `index.ts`) — header "Case Workflow Engine v1" |
| FIRST | `35687fd` (initial commit, `src/modules/workflow/`) · LAST_RELEVANT `809d602` (box move) |
| State | Present @ `50945ecd`; imported by `cases/routes.ts:8` + `cases/services.ts:8` |
| Routes | `GET /cases` status filter, `PATCH /:caseId/status` ("NOW USES WORKFLOW ENGINE"), `GET /:caseId/workflow-graph`, `GET /:caseId/workflow-history` |
| Services | `isValidStatus / canTransition / canUserTransition / changeStatus` (Prisma tx + SharePoint `driveService.moveFile`) / `getWorkflowGraph / getWorkflowHistory / getWorkflowStats` |
| Models | none (operates on `Case`/`Document`/`TimelineEvent`); string statuses overlap `enum CaseStatus` but omit `ON_HOLD/CANCELLED/ARCHIVED` |
| Frontend | no direct consumer verified → **backend-only reachable** |
| Tests | none dedicated |
| Classify | **READ_COMPATIBILITY_ONLY / DEPRECATE** (stale status set; SharePooint move not used by modern DAG) |

## Engine 2 — Case Workflow **V2** pure state machine (`cases/workflow.ts`)

| Field | Value |
|---|---|
| Path | `Backend/src/modules/cases/workflow.ts` |
| State | Present @ `50945ecd` but **zero importers** (grep over `Backend/src` returns only self-references) → **dead code** |
| Models | none (`CaseStatusV2 = GENERATING|IN_PROGRESS|REVIEW|CLOSED|ARCHIVED`) |
| Classify | **REMOVE_LATER** (PROVEN dead) |

## Engine 3 — Case Workflow **DAG / Orchestration** (THE modern engine) ⭐

| Field | Value |
|---|---|
| Path | `cases/caseWorkflowOrchestration.ts` (+ `workflowTemplateService.ts` admin) |
| FIRST | `8b616ca` "Add customer invitation and workflow reliability foundation"; LAST_RELEVANT `9eec7bf` "instantiate work packages during case creation" |
| State | **Present + fully wired + reachable** (backend + frontend + tests) |
| Models | `WorkflowTemplate` (`schema.prisma:2888`, `@@unique([key,version])`); no instance model — stamped on `Task` |
| Routes | `GET/POST/PATCH /cases/workflow-templates[...]`, `/:caseId/workflow-summary`; wired into `POST /cases` (`services.ts:533`) and `POST /cases/intake` |
| Services | `WORKFLOW_TEMPLATES` (`SIMPLE`, `CONTRACT_REVIEW_TRIAD`), `validateWorkflowDag` (cycle/dup/dangling), `instantiateCaseWorkflow` (DAG of BLOCKED/TODO tasks), `activateReadyWorkflowSuccessors` (BLOCKED→TODO on predecessor DONE), `listBuiltinWorkflowTemplates`, `resolveTemplateForInstantiation` |
| Frontend | `app/settings/workflows/page.tsx`, `components/cases/intake/CaseIntakeSections.tsx`, `useCaseIntakeForm.ts`, `app/clients/[clientId]/page.tsx`, `lib/api.ts` |
| Tests | `caseWorkflowDag.behaviour.test.ts`, `caseWorkflowTemplates.integration.test.ts`, `caseWorkflowSummary.test.ts` |
| What it does | On case creation instantiate DAG as Tasks; completing a step (`tasks/services.ts:completeTask` → `activateReadyWorkflowSuccessors`) unlocks successors; milestone-candidate steps feed Case-level milestone publication |
| Classify | **KEEP_CANONICAL** (primary, active) |

## Engine 4 — Work Package engine (WP1–WP5) ⭐

| Field | Value |
|---|---|
| Path | `work-package-admin/` (`routes.ts`,`service.ts`) + `cases/caseWorkPackage.service.ts` |
| FIRST | `f8e91d4` work-package admin; `caseWorkPackage.service.ts` `9eec7bf` |
| State | Present + wired; branch lineage `codex/work-package-wp1…wp5b` + `recovery/wp*` + `jatevagy/wp-*` |
| Models | `CaseTypeDefinition`, `WorkPackageTemplate`, `WorkPackageTemplateItem` (+ `WorkPackageModuleType` enum), `CaseWorkPackage` (1:1 case, `snapshotWorkflowTemplateId`), `CaseWorkPackageItem` |
| Routes | `/api/v1/work-package-admin/case-types[...]/templates[...]` (mounted `index.ts:230`) |
| Services | case-type/template CRUD + activate/version; `createCaseWorkPackageSnapshot(tx,…)` (validates required/optional modules, snapshots template → case); wired `cases/services.ts:525` |
| Frontend | `app/settings/work-packages/page.tsx` |
| Tests | `workPackageAdmin.integration.test.ts`, `workPackageCaseCreation.integration.test.ts`, `workPackageSchema.integration.test.ts` |
| Classify | **KEEP_CANONICAL / MERGE_WITH_E3** |

## Engine 5 — Case Lifecycle + Intake-Opening (state-transition services)

**5a Case Lifecycle** — `cases/lifecycle.ts` + `lifecycleService.ts` (`WORKFLOW-CORE-LITIGATION-CASE-LIFECYCLE-1`; FIRST `77381ce`; LAST `lifecycleService.ts`→`581ffc2`, `lifecycle.ts`→`e321feb`). Routes `POST /:caseId/close|reopen|archive`, `GET /:caseId/lifecycle`. `deriveClosureBlockers`, `validateCaseLifecycleTransition`, forced-close cancels open tasks. Tests `caseLifecycle.test.ts`, `caseLifecycleWorkflowCompletion.integration.test.ts`, `litigationCaseLifecycleStaticGuards.test.ts`. → **KEEP_CANONICAL**.

**5b Matter Intake / Opening** — `cases/intakeService.ts` + `intakeReadiness.ts` (`WORKFLOW-CORE-INTAKE-MATTER-OPENING-1`; FIRST `a319255`; LAST `581ffc2`), `intakeCreate.service.ts` (`CASE-INTAKE-REDESIGN-1`; FIRST `02e02d8`). Routes `GET /:caseId/intake-readiness`, `POST /:caseId/opening-tasks|activate|decline-intake`, `GET /api/v1/intake` queue. `getCaseIntakeReadiness`, `createOpeningTasks` (dedupe via `Task.type`), `activateMatter/declineIntake`, `getIntakeQueue`, `createCaseIntake` (one transaction matter+participants+deadlines+thread-links+tasks+optional DAG). Tests `caseIntakeCreate.behaviour.test.ts`, `intakeQueue.test.ts`, `intakeReadiness.test.ts`, `intakeMatterOpeningStaticGuards.test.ts`. → **KEEP_CANONICAL**.

## Engine 6 — Task lifecycle + Submission/Review ⭐

| Field | Value |
|---|---|
| Path | `modules/tasks/` (`services.ts`,`routes.ts`,`taskSubmission.*`,`taskReviewDecision.*`,`taskAuthorization.ts`,`taskStatus.ts`,`attentionCategory.ts`) |
| FIRST | `tasks/*` `35687fd`; `taskSubmission` `974e076`; `taskReviewDecision` `eea7198`; `taskStatus` `e4e0c00`; `attentionCategory` `1b57495` |
| Models | `Task` (`schema.prisma:1549`, status enum `PENDING|IN_PROGRESS|SUBMITTED|UNDER_REVIEW|COMPLETED|CANCELLED|BLOCKED|TODO|IN_REVIEW|DONE`), `TaskSubmission` (+ docs/time-entries + `idempotencyKey` + `supersedes`), `TaskReviewDecision` |
| Routes | `/tasks` CRUD + `/start|submit|complete|block|unblock|reschedule|reassign|attention`, `/review-queue`, `/auto-generate`, `/:id/submissions`, `/task-review-decision` |
| Services | `createTask/startTask/submitTask/completeTask`(+successor activation)`/blockTask/reassignTask/autoGenerateTask`/`getReviewTasksForUser`; `taskSubmissionService` (readiness, draft/edit/attach-doc/time-entry, no self-review); `taskReviewDecisionService` (APPROVE/RETURN/CORRECTION); transition rules in `cases/workItems.ts` (`validateTaskTransition`, `deriveTaskCapabilities`, independent-reviewer rule) |
| Frontend | `components/tasks/TaskSubmissionWorkspace.tsx`, `TaskReviewWorkspace.tsx`, `app/tasks/`, `app/reviews/page.tsx`, `app/workload/` |
| Tests | `taskLifecycleSchema.integration.test.ts`, `taskSubmission.integration/route.test.ts`, `taskReviewDecision.integration/route.test.ts`, `taskReviewQueue.route/service.test.ts`, `taskWorkflowTransitions.test.ts`, `taskLifecycleCors.test.ts` |
| Classify | **KEEP_CANONICAL** |

## Engine 7 — Document Review workflow + Work Items

**7a Document Review** (`DOC-REVIEW-WORKFLOW-1`) — `modules/documents/review/*` (`reviewWorkflow.ts`, `reviewService.ts`, `reviewDto.ts`, `review.routes.ts`; FIRST `d1d8fd6`; LAST `655db5e`). Models `DocumentReview`, `DocumentReviewRound`, `ReviewPoint`, `ReviewDecision` (round-versioned). Routes `/api/v1/document-reviews/...` + `/api/v1/documents/.../review` (mounted `index.ts:294-295`). Pure `evaluateTransition` (DRAFT/ASSIGNED/IN_REVIEW/CHANGES_REQUESTED/RESUBMITTED/APPROVED/CANCELLED/CLOSED), approval-applies-only-to-exact-version invariant. Frontend `DocumentReviewWorkflowPanel.tsx`, `app/cases/[caseId]/review/[documentId]/*`. Tests `documentReviewWorkflow.integration.test.ts`, `reviewWorkflow.behaviour.test.ts`. → **KEEP_CANONICAL / MERGE**.

**7b Work Items** — `cases/workItems.ts` (FIRST `4599b66`). Unified case work list (`Task`+`Document`+`Communication`+conditional `LawyerHandoffPackage`). Route `GET /:caseId/work-items`. → **KEEP_CANONICAL**.

## Lost-capability answer (central question)

> **Which capabilities of the old workflow system were lost when the current product was built?**

- **V1 SharePoint-folder-per-status automation** (case status → physical SP folder move) is superseded by the DAG engine; the DAG does **not** move SP folders. If case-status→SP-folder organization is still desired, it is **not** reproduced (READ_COMPATIBILITY_ONLY/DEPRECATE).
- **Case creation → work package** exists ONLY on the legacy `createCase` path (work-package snapshot `services.ts:525`). It is **missing** on intake/communication/portal paths (see `05_CASE_INTAKE_ARCHAEOLOGY.md`).
- **Portal matters → task generation**: portal-originated cases create **no** tasks (see `05`).
- **Case-level reviewer assignment**: never existed at creation; only downstream document review.
- **V2 `cases/workflow.ts`** semantics (generating→in_progress→review→closed→archived) are dead — the useful bits were re-expressed in the DAG engine; nothing must be resurrected.
- **`autoGenerateTask`** is a separate template-driven generator, NOT orchestration — no general automation/orchestration framework exists anywhere (PROVEN absence).

## Classification summary

| Engine | id | Classify |
|---|---|---|
| Case Workflow V1 | E1 | DEPRECATE (READ_COMPATIBILITY_ONLY) |
| Case Workflow V2 | E2 | REMOVE_LATER (dead code) |
| DAG / Orchestration | E3 | KEEP_CANONICAL |
| Work Package (WP) | E4 | KEEP_CANONICAL / MERGE_WITH_E3 |
| Case Lifecycle | E5a | KEEP_CANONICAL |
| Intake / Matter Opening | E5b | KEEP_CANONICAL |
| Task lifecycle + submission/review | E6 | KEEP_CANONICAL |
| Document Review | E7a | KEEP_CANONICAL / MERGE |
| Work Items wrapper | E7b | KEEP_CANONICAL |

> **Honesty note:** E1/E2 are tagged DEPRECATE/REMOVE_LATER not because they are "wrong" but because their semantics are stale or fully superseded. No recommendation here is a blind-merge: any action on E2 must first confirm zero importers (PROVEN) and any action on E1 must confirm the SP-folder move is no longer required (UNPROVEN/STRONGLY_INDICATED).
