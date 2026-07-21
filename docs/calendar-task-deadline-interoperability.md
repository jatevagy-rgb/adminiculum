# Calendar Task and Deadline Interoperability

Date: 2026-07-21

## Task due dates in calendar

Task.dueDate is projected into calendar views as an all-day deadline marker via the unified projection API. The projection is read-only except for reschedule.

### Editing behavior

| Action | Permitted? | Mechanism |
|---|---|---|
| View task deadline in calendar | Yes | Unified projection |
| Reschedule task deadline from calendar | Yes | Write-back to `POST /tasks/:id/reschedule` |
| Complete task from calendar | Yes (MVP) | Write-back to task transition endpoint |
| Create a CalendarEvent from a task | No (MVP) | Deferred — see scheduled work blocks |
| Drag task deadline to new date | No (MVP) | Deferred — see drag/drop decision |

### Reschedule write-back

When a user reschedules a projected task deadline in the calendar:
1. Frontend calls `POST /api/v1/tasks/{taskId}/reschedule` with `{ dueAt: "2026-08-20T00:00:00Z" }`
2. Backend validates: task is not COMPLETED/DONE/CANCELLED/ARCHIVED, user has `canUserActOnTask` access
3. Backend updates `Task.dueDate`, creates `DEADLINE_SET` timeline event
4. Calendar refreshes — the projected item moves to the new date

### Completion behavior

When a task is completed, its deadline projection:
- Shows with status `COMPLETED` if `includeCancelled=true` / completed items are requested
- Is excluded from default calendar views (which show OPEN items only)
- The task itself transitions normally through its lifecycle

## Review deadlines in calendar

`TaskReviewDecision.correctionDeadline` may be projected as a deadline marker.

**MVP decision:** Deferred. Review deadlines are not projected in the initial calendar implementation. They remain visible only in the task/review detail UI.

**Rationale:** Review deadlines are part of the submission lifecycle, which has its own complex state machine. Projecting them without full lifecycle awareness risks confusing the calendar with incomplete information.

**Phase 2:** When projected, review deadlines will appear as read-only markers with `sourceType: REVIEW_DEADLINE`, linking to the review detail.

## Scheduled work blocks

A task may eventually have associated "scheduled work time" — CalendarEvent records of a future `SCHEDULED_WORK` type that represent when the user plans to work on a task.

**MVP decision:** Deferred. This requires:
- A new `taskId` relation on CalendarEvent
- A SCHEDULED_WORK event type
- UI for "schedule time for this task"
- Distinction between "deadline for this task" and "time I plan to work on this task"

**Phase 2:** When implemented, scheduled work blocks will be native CalendarEvent records with `taskId` set, distinct from the task's dueDate projection.

## Recurring tasks vs. recurring events

Recurring tasks (e.g., "monthly client report") are a task-management concept, not a calendar concept.

**Decision:** Recurring tasks are out of scope for the calendar model. The calendar supports recurring CalendarEvents (meetings, deadlines). If a task recurs, it is handled by creating new Task records, not by calendar recurrence.

**Rationale:** A recurring task needs its own lifecycle (each occurrence can be independently assigned, submitted, reviewed, completed). Calendar recurrence produces virtual occurrences that share a template. These are fundamentally different.

## External-action deadlines

Tasks with `externalActionRequired` (e.g., waiting for court response) have implicit deadlines. These are not projected into the calendar in MVP.

**Phase 2:** Consider projecting external-action expected-completion dates as tentative calendar markers.

## Dashboard seven-day strip coexistence

The existing Dashboard 7-day strip calls `GET /api/v1/agenda` (the current agenda endpoint). This endpoint is NOT replaced by the calendar API.

**Coexistence plan:**
1. The existing `/api/v1/agenda` endpoint continues to serve the Dashboard strip and the `/deadlines` page.
2. The new `/api/v1/calendar/items` endpoint serves the new full calendar views.
3. Eventually, the Dashboard strip may switch to calling `/api/v1/calendar/items` with `sourceType=TASK_DEADLINE,CASE_DEADLINE` to include CalendarEvent deadlines. This is Phase 2.
4. The `/deadlines` page may eventually be superseded by the calendar's day/week views. This is Phase 2.

No existing endpoint is removed or modified in MVP.
