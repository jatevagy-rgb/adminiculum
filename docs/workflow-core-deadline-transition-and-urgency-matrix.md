# Workflow Core Deadline Transition and Urgency Matrix

## Canonical Urgency

| Urgency | Rule |
| --- | --- |
| `OVERDUE` | `dueAt` is before the current server time. |
| `TODAY` | `dueAt` is later today. |
| `TOMORROW` | `dueAt` is on the next local day. |
| `THIS_WEEK` | `dueAt` is inside the configured agenda window, default seven days. |
| `LATER` | `dueAt` is outside the agenda window or invalid. |

Urgency uses only persisted date fields. It does not inspect titles, descriptions, communication bodies, document text, or AI output.

## Status Mapping

| Source | Open | Completed | Cancelled |
| --- | --- | --- | --- |
| Task | any non-closed task status | `COMPLETED`, `DONE`, `APPROVED`, `REJECTED`, `DECLINED` | `CANCELLED`, `ARCHIVED` |
| Case deadline | active case without `completedAt` | `completedAt` set, `COMPLETED`, `DONE`, `APPROVED` | `CANCELLED`, `ARCHIVED` |

## Capability Rules

| Capability | Rule |
| --- | --- |
| `canOpen` | always true for returned items with an href. |
| `canReschedule` | open task deadline and current user is assignee or case manager/collaborator/privileged actor. |
| `canComplete` | open task deadline in a review/submitted state and current user is allowed to act. |
| `canCreateTask` | open case deadline and current user is case manager. |
| `canReopen`, `canCancel` | false in this pass. |

## Mutation Boundary

`POST /api/v1/tasks/:id/reschedule` accepts only `{ "dueAt": string | null }`.

Rejected:

- arbitrary `status`, `priority`, assignment, case, document, or payload fields;
- invalid dates;
- closed/cancelled/archived tasks;
- users without task/case action permission.

Accepted mutations update only `tasks.dueDate` and create a content-minimal `DEADLINE_SET` timeline event with `taskId`, `source`, and `dueAt`.
