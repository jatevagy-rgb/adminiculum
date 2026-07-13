# Workflow Core Task Transition Matrix

This matrix covers only transitions supported by current production-compatible task fields.

| Current state | Action | Allowed actor | Required conditions | New state | Repeat behavior | Error cases |
|---|---|---|---|---|---|---|
| `TODO`, `PENDING` | start | assignee, assigner, privileged manager | authenticated, task accessible | `IN_PROGRESS` | repeat after state change returns `409` | `400` malformed, `403` unauthorized, `404` missing, `409` invalid state |
| `IN_PROGRESS` | submit for review | assignee, assigner, privileged manager | authenticated, task accessible | `IN_REVIEW` | repeat returns `409` | same |
| `IN_REVIEW`, `SUBMITTED`, `UNDER_REVIEW` | approve | assignee, assigner, privileged manager | authenticated, task accessible | `DONE` | repeat returns `409` | same |
| `IN_REVIEW`, `SUBMITTED`, `UNDER_REVIEW` | return for correction | assignee, assigner, privileged manager | authenticated, task accessible | `IN_PROGRESS` | repeat after return returns `409` | same |
| `TODO`, `PENDING`, `IN_PROGRESS` | block | assignee, assigner, privileged manager | structured `TaskStuckReason` | `BLOCKED` | repeat returns `409` | invalid reason returns `400` |
| `BLOCKED` | unblock | assignee, assigner, privileged manager | task currently blocked | `IN_PROGRESS` | repeat returns `409` | same |

## Unsupported conceptual transitions

| Concept | Why not implemented |
|---|---|
| `WAITING` as separate persisted state | No separate field exists beyond structured blocker reason. |
| handoff offered/accepted/returned by recipient | Current handoff package schema has preparer/reviewer, not recipient. |
| automatic responsibility transfer after handoff | No approved field or product rule exists. |
| arbitrary frontend status patch | Explicitly rejected; transitions must use action endpoints. |
| AI/task classification transitions | Out of scope and unsupported. |
