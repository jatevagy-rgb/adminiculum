# TASK_ORCHESTRATION_REUSE_AUDIT — Sequential mode (3B1)

Base: master `fb6f48c3153c112ce2a3cbac28e333adbe002242`
Scope: SEQUENTIAL only. PARALLEL is explicitly OUT OF SCOPE.
Rule: one canonical task/review universe. No second approval engine.

## 1. Canonical components inspected

| Component | Location | Role today |
|---|---|---|
| `Task` | `Backend/prisma/schema.prisma` | executable work unit; `assignedToId`, `plannedReviewerId`, `status`, `taskDefinitionId`, `attentionCategory`, `estimatedMinutes` |
| `TaskSubmission` | schema | canonical submission lifecycle (DRAFT → SUBMITTED → APPROVED / RETURNED, revisions) |
| `TaskReviewDecision` | schema | canonical review decision record |
| `TaskAssignmentHistory` | schema | reassignment history |
| `TaskCollaborator` | schema | parallel collaborators (metadata; grants no access) |
| `TaskDefinition` | schema | reusable type/label/default estimate/default attention |
| task lifecycle service | `Backend/src/modules/tasks/services.ts` | create/transition/submit/review |
| planning | `Backend/src/modules/tasks/taskPlanning.ts` | `resolveTaskPlanning`, `assertTaskPlanningRolesEligible` (case eligibility), planned reviewer/collaborators |
| case work package | `Backend/src/modules/cases/caseWorkPackageOperational.service.ts` | `listCaseResponsibleCandidates`, `canAssign`, canonical completion |
| dashboard workload | `Backend/src/modules/cases/dashboardOperational.ts` + `tasks/attentionCategory.ts` | counts **active** tasks assigned to the user by attention category |
| case authorization | `Backend/src/modules/cases/authorization.ts` + `requireCaseReadAccess`/`requireCaseManageAccess` | canonical case access |
| timeline/audit | case/task activity surfaces | canonical events |

## 2. Capability matrix (REUSE / EXTEND / NEW)

| Capability | Classification | Basis |
|---|---|---|
| worker execution | REUSE | canonical `Task.assignedToId` + status transitions |
| submission | REUSE | `TaskSubmission` lifecycle, unchanged |
| review assignment | REUSE | `Task` as a REVIEW-stage unit submitted to the configured reviewer; existing reviewer authorization |
| approve | REUSE | `TaskReviewDecision` APPROVE semantics |
| return for rework | REUSE | existing RETURNED/revision semantics (no new rejection system) |
| resubmit | REUSE | existing revision resubmit path |
| final receiver | REUSE | a FINAL_RECEIVE stage implemented as a canonical Task assigned to the responsible lawyer |
| stage order | **NEW (additive)** | no ordered-stage relation exists |
| current active stage | **EXTEND** | derived from stage Tasks' canonical statuses + an additive stage link |
| blocked future stage | **EXTEND** | stage Tasks created but not actionable until prior stage approves; must not appear in dashboard workload |
| parent/logical work read model | **NEW (additive)** | small projection grouping stage Tasks |
| audit/timeline | **EXTEND** | emit canonical events on stage transitions; no content payloads |
| authorization | REUSE | `assertTaskPlanningRolesEligible` + case guards; stage membership grants no access |
| dashboard visibility | **EXTEND** | only the ACTIVE stage counts as the user's workload; parent is not double-counted |

## 3. Proposed minimal additive persistence (to be confirmed during implementation)

Principle: **canonical `Task` rows remain the executable units.** Orchestration metadata only *relates* them.

- `TaskSequence` (logical parent metadata): `id`, `caseId`, `clientId`, `title`, `createdById`, `status` (derived), `createdAt/updatedAt`. No execution semantics of its own.
- `TaskSequenceStage`: `id`, `sequenceId`, `order` (int), `role` (`EXECUTE` | `REVIEW` | `FINAL_RECEIVE`), `taskId` (FK to the canonical `Task` that executes this stage), unique `(sequenceId, order)`.
- Optional additive `Task.sequenceStageId` (nullable) for reverse lookup.

All additive/nullable; legacy Tasks remain valid; no backfill; no destructive migration.

Stage state mapping (no new cosmetic enum where canonical state suffices):
- `ACTIVE` = stage Task assigned & actionable (not terminal)
- `WAITING` = stage Task exists but is not yet actionable (blocked by prior stage)
- `COMPLETED` = stage Task canonical completion/approval
- `RETURNED/REWORK` = stage Task's `TaskSubmission` is RETURNED

## 4. Transition design (reusing canonical lifecycle)

- Create: stage 1 `EXECUTE` Task actionable; REVIEW/FINAL stage Tasks created in a waiting state.
- EXECUTE→REVIEW: worker submits via `TaskSubmission`; on canonical submission event, activate REVIEW stage.
- REVIEW APPROVE: `TaskReviewDecision` APPROVE → complete review stage → activate next stage; repeated APPROVE idempotent (no double activation).
- REVIEW RETURN: canonical RETURNED → reactivate the configured prior `EXECUTE` stage; reviewer waits.
- RESUBMIT: existing revision path → reviewer actionable again; no duplicate chain.
- FINAL_RECEIVE: activates the responsible lawyer's stage; completion only via explicit canonical action (no auto-completion).

Open items to prove before coding (do not assume):
1. Whether a waiting stage Task can be persisted without appearing in dashboard workload (dashboard filters on `assignedToId` + non-terminal status) — likely needs `assignedToId` withheld until activation, or an explicit "not yet actionable" discriminator.
2. Whether the existing submission/review machinery cleanly supports re-activating a prior EXECUTE stage on RETURN without creating a new Task.
3. Exact activation hook point (submission complete vs review decision) in `tasks/services.ts`.

## 5. Regression inventory (potentially affected)
Task create · Task update · `TaskSubmission` · `TaskReviewDecision` · `plannedReviewerId` · `TaskCollaborator` · `TaskDefinition` · attention category · estimated time · dashboard workload · Case Workspace · case authorization · task authorization · Communication source-linked tasks.

## 6. Test plan (maps to mission §17)
PG: SIMPLE legacy; SEQUENTIAL create; first stage active; future blocked; execute submit; review activated; approve; next activated; final receiver; reject→rework; rework→worker; resubmit→reviewer; early future-stage action denied; duplicate approve/reject idempotent; outsider/inactive rejected; cross-case/client denied; no access granted; dashboard only active counted; existing submission/review regressions.

## 7. Status
This audit is the required first increment. Implementation is NOT started. A draft PR containing this audit is opened for review; no runtime code, no schema, no migration yet.
