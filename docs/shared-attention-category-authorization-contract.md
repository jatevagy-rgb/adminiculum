# Shared Attention Category — Authorization Contract (Phase 6)

Date: 2026-07-22

## Current Task authorization (audited)

- **Create** (`POST /api/v1/tasks`, `routes.ts`): `authenticate` → actor from
  token; assignment gated by `taskService.canAssign(assignedBy, assignedTo)`.
- **Update**: goes through `taskService` under `authenticate`, using existing
  task/case authorization. No per-field permission today.

## Who may set/change the new fields

- `attentionCategory` and `estimatedMinutes` are edited under the **existing
  task create/update authorization** — the task creator (where already
  authorized), the current assignee, or a user with existing task-management
  authority for that task's case. **No new broad permission** is introduced.

## Constraints

- Changing category/estimate must **not**:
  - trigger or bypass reassignment (assignment stays governed by `canAssign`);
  - grant access to another case (case-scope authorization unchanged);
  - disclose another lawyer's workload.
- Category/estimate are ordinary task fields; editing them carries no more
  privilege than editing a task's priority or due date today.

## Dashboard aggregation scope

- Defaults to the **authenticated user's assigned workload only**
  (`isCountableWorkloadTask(task, currentUserId)` requires
  `task.assignedToId === currentUserId`).
- No other user's workload is returned by default.
- **Team totals are out of scope** for this slice. If added later, gate behind an
  explicit team-lead authorization; never expose team/other-user workload without
  it.

## Review submission authorization (unchanged)

`TaskSubmission.requestedAttention` remains governed by the existing submission
authorization (submitter sets it while DRAFT; self-review prohibited). This
contract does not alter Review decision behaviour.
