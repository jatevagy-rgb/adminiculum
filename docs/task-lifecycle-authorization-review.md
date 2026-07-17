# Task Lifecycle Authorization Review

Date: 2026-07-17

## Scope

Reviewed task transitions, review queue visibility, case participation and Leadás mutations. No authentication provider or token-validation code was changed.

## Findings Before Hardening

- An assigned worker could approve or return their own review-status task.
- The review queue included tasks assigned to the current user, allowing self-review presentation.
- Any same-case Leadás reader could update or archive another preparer's Leadás.
- Any same-case user could call the Leadás review route.
- Generic Leadás `PATCH` could set terminal review states and bypass the explicit review route.
- A rejected Leadás did not require a reviewer note.

## Implemented Non-Schema Rules

| Operation | Rule |
| --- | --- |
| Start task | Assigned worker only; an unassigned task is not silently self-claimed. |
| Submit task | Assigned worker only under the existing task transition contract. The task list no longer exposes direct submission because task-owned Leadás prerequisites cannot be proven. |
| Block/unblock task | Assigned worker only. |
| Approve/return task | Non-assignee supervisor or participating lawyer role only; self-review is denied. |
| Review queue | Excludes tasks assigned to the current reviewer. Non-privileged scope remains case/task participation based. |
| Read Leadás | Existing case authorization remains required. |
| Update/archive Leadás | Preparer or `ADMIN`/`PARTNER` only. |
| Review Leadás | Preparer is denied; assigned case lawyer or `ADMIN`/`PARTNER` only. |
| Terminal Leadás state | `APPROVED`, `REJECTED`, `IN_REVIEW` and `ARCHIVED` cannot be assigned through generic `PATCH`. |
| Return Leadás | Rejection requires a non-empty reviewer note. |

## Safe Errors

- `TASK_ACTION_FORBIDDEN`
- `INVALID_TASK_TRANSITION`
- `HANDOFF_WRITE_FORBIDDEN`
- `HANDOFF_SELF_REVIEW_FORBIDDEN`
- `HANDOFF_REVIEW_FORBIDDEN`
- `HANDOFF_TRANSITION_REQUIRES_EXPLICIT_ROUTE`
- `HANDOFF_NOT_READY`
- `REVIEW_ALREADY_DECIDED`
- `REVIEW_COMMENT_REQUIRED`

## Remaining Authorization Blockers

- No persisted task reviewer assignment exists.
- No persisted Leadás submitter distinct from preparer exists.
- No immutable Leadás revision prevents historical review overwrite.
- Task approval and Leadás approval are separate mutations and cannot be authorized/committed atomically.
- Existing direct task submission cannot prove Leadás/time prerequisites.

These remaining items require an approved schema and API design. They are not simulated with frontend state, comments, generic JSON or notification payloads.

Classification: `TASK_LIFECYCLE_SCHEMA_APPROVAL_REQUIRED`
