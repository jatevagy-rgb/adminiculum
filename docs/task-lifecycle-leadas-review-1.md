# Task Lifecycle — Leadás And Review Workflow 1

Date: 2026-07-17

## Source And Integration Base

- Worktree: `C:\Users\hubay\Documents\Adminiculum-task-lifecycle`
- Branch: `codex/task-lifecycle-leadas-review-1`
- Base includes official release commit `aa5a263`.
- Base includes accepted dashboard commits `10e1bd3` and `a607f6e`.
- Parked commit `24bc6c5` is not in ancestry.
- Production runtime source `1033a4d` remains an ancestor.

## Product Matrix

| User-facing state | Persisted interpretation now | Safe action now | Full target status |
| --- | --- | --- | --- |
| Teendő | `Task.status=PENDING|TODO` | `Indítás` for assigned worker | Supported. |
| Folyamatban | `Task.status=IN_PROGRESS` | Open task context | Supported. |
| Leadás piszkozat | Case-level `LawyerHandoffPackage=DRAFT|PREPARED` | Open case Leadás view | Not task-linked; incomplete. |
| Review alatt | Task review status or case-level submitted Leadás | Open review detail | Two independent records; incomplete. |
| Visszaküldve | Rejected Leadás or task returned to `IN_PROGRESS` | Continue correction | No immutable revision/returned marker; incomplete. |
| Jóváhagyva | Approved Leadás or closed task | View result | Not atomic; incomplete. |
| Kiküldésre vár | No persisted contract | No action shown | Missing. |
| Lezárva | `Task.status=DONE|COMPLETED` | View | Supported at task level only. |

## Implemented Safe Portion

- Separated task worker and reviewer capabilities.
- Prevented self-review for task approval/return.
- Excluded self-assigned tasks from review queue results.
- Restricted Leadás update/archive to preparer or administrator.
- Restricted Leadás review to a different, authorized reviewer.
- Required submitted state before Leadás review and a note for return.
- Prevented generic `PATCH` from assigning terminal Leadás review states.
- Added a content-minimal submitted timeline event when an existing Leadás is submitted.
- Removed direct `Review-ra küldés`, `Jóváhagyás` and `Visszaküldés` mutations from task-list rows.
- Split the task table into separate `Állapot` and `Leadás` columns.
- Combined matter/client into one compact column and preserved the accepted card/grid direction.
- Made `Indítás` select/open the task context after success.
- Added task deep-link selection to `/reviews?taskId=...`.
- Labelled review attention and effort as suggested, not submitter-selected.
- Standardized ordinary handoff UI copy to `Leadás`.

## Deterministic List Action

| State/capability | Action |
| --- | --- |
| Assigned Teendő | `Indítás` |
| Folyamatban | `Megnyitás` |
| Review state, eligible reviewer | `Review megnyitása` |
| Review state, non-reviewer | `Állapot megtekintése` |
| Blocked assigned task | `Feloldás` |
| Closed task | `Megtekintés` |

The list does not present submission or approval before a task-owned Leadás can be proven.

## Honest Leadás Projection

Task work-item DTOs currently return `handoff: null`. The task table therefore shows `Nincs kapcsolt Leadás`; it does not derive Leadás state from generic task status. The selected-task panel links to the case Leadás view and explicitly says that no task link is proven.

## Validation Evidence

- Targeted lifecycle suite: passed, 5 suites / 74 tests.
- Prisma validation: passed with a temporary localhost placeholder URL used only to satisfy schema parsing; no database connection was made.
- Backend TypeScript and build: passed.
- Frontend TypeScript and production build: passed.
- Frontend production environment guard: passed; no localhost API/auth target was present in `.next`.
- Full backend suite: 44 suites passed and 1 inherited dashboard static guard failed; 441 of 442 tests passed. `Frontend/src/components/DashboardFocused.tsx` and `Backend/tests/opsPagesUxCleanupStatic.test.ts` are unchanged from accepted dashboard commit `a607f6e`, whose KPI closeout removed the stale `value: number | null` card-grid marker still asserted by that test.
- Dependency audit was read-only: Backend reported 19 inherited findings (2 low, 9 moderate, 7 high, 1 critical); Frontend reported 4 moderate findings. No dependency or lockfile was changed and no audit fix was run.

The inherited dashboard guard does not change the schema-blocker classification and was not repaired inside this task-lifecycle branch.

## Blocked Full Workflow

The following requested guarantees cannot be completed without schema changes:

- task-owned Leadás draft and immutable revisions;
- submitter, reviewer assignment, remaining issues and requested attention;
- submitted output or explicit text-only outcome;
- task/Leadás-linked time and retry idempotency;
- atomic Leadás submit + task transition + audit + notification;
- durable return history and revised resubmission;
- atomic approval/closure;
- external sending/submission state.

No deployment or release artifact is authorized from this branch while this gate remains.

Classification: `TASK_LIFECYCLE_SCHEMA_APPROVAL_REQUIRED`
