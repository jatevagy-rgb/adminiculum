# Calendar Source-of-Truth Matrix

Date: 2026-07-21

## Matrix

| Calendar item | Authoritative source | Editable in calendar? | Write-back target | Duplicate event row? |
|---|---|---|---|---|
| Task due date | `Task.dueDate` | Yes — reschedule only | `POST /tasks/:id/reschedule` → updates Task.dueDate | **No.** Projected read-only via unified API. |
| Case deadline | `Case.deadline` | Yes — date change only | `PATCH /cases/:id` → updates Case.deadline | **No.** Projected read-only via unified API. |
| Review deadline | `TaskReviewDecision.correctionDeadline` | No — managed via review workflow | Review lifecycle service | **No.** Read-only projection if surfaced. |
| Court hearing | `CalendarEvent` (COURT_HEARING) | Yes — full edit | Direct CalendarEvent CRUD | N/A — native event |
| Client meeting | `CalendarEvent` (CLIENT_MEETING) | Yes — full edit | Direct CalendarEvent CRUD | N/A — native event |
| Internal meeting | `CalendarEvent` (INTERNAL_MEETING) | Yes — full edit | Direct CalendarEvent CRUD | N/A — native event |
| Filing deadline | `CalendarEvent` (FILING) | Yes — full edit | Direct CalendarEvent CRUD | N/A — native event |
| Legal deadline | `CalendarEvent` (LEGAL_DEADLINE) | Yes — full edit | Direct CalendarEvent CRUD | N/A — native event |
| Office closure | `CalendarEvent` (OFFICE_EVENT) | Yes — full edit | Direct CalendarEvent CRUD | N/A — native event |
| Leave | `CalendarEvent` (LEAVE) | Yes — full edit | Direct CalendarEvent CRUD | N/A — native event |
| Outlook-imported event | `CalendarEvent` with `externalProvider` set | Limited — protected fields | CalendarEvent + external link metadata | **No.** Single CalendarEvent row with external link. |

## Principles

### P1: No duplicate editable deadlines

A task's due date appears exactly once in calendar views. It is sourced from `Task.dueDate` and projected by the unified calendar API. There is no CalendarEvent row for task deadlines. When a user edits a projected task deadline in the calendar, the write-back targets `POST /tasks/:id/reschedule` which updates `Task.dueDate` directly.

**Rationale:** Two independently editable copies of the same deadline will inevitably diverge, creating confusion about the real deadline for legal work.

### P2: Unified calendar projection merges heterogeneous sources

The calendar list API (`GET /api/v1/calendar/items`) returns a merged stream of:
1. CalendarEvent rows (native events)
2. Task.dueDate projections (synthetic items with `sourceType: TASK_DEADLINE`)
3. Case.deadline projections (synthetic items with `sourceType: CASE_DEADLINE`)

Each item carries `canEdit` and `canDelete` capabilities. Projected items have `canEdit: true` only for the specific editable field (e.g., reschedule date), not for full event editing.

### P3: Write-back targets the authoritative source

When the calendar UI permits editing a projected item:
- Task deadline reschedule → calls the existing task reschedule endpoint
- Case deadline change → calls the existing case update endpoint
- Native CalendarEvent edit → calls the CalendarEvent CRUD endpoint

The calendar API itself does not provide a generic "edit any calendar item" endpoint. The frontend routes edits to the correct authoritative endpoint based on `sourceType`.

### P4: External imports create local CalendarEvent records

When Outlook/Graph integration is enabled (future), imported events are stored as CalendarEvent rows with `externalProvider`, `externalId`, and sync metadata. The CalendarEvent is the internal authoritative record. External changes are reconciled via explicit sync, not automatic overwrites.

### P5: Review deadlines are read-only projections

Review correction deadlines (`TaskReviewDecision.correctionDeadline`) may appear in calendar views but are not editable from the calendar. They are managed exclusively through the review workflow UI.

## Compatibility assessment

This source-of-truth model is compatible with the current architecture because:

1. The existing agenda service already projects Task.dueDate and Case.deadline into unified `WorkflowDeadlineDto` items. The new unified calendar API extends this pattern to include CalendarEvent rows.
2. The existing `POST /tasks/:id/reschedule` endpoint already validates transitions and creates timeline events. Calendar write-back reuses this.
3. The existing `PATCH /cases/:id` endpoint already handles Case.deadline updates. Calendar write-back reuses this.
4. No existing endpoint or model needs to be changed to support native CalendarEvent CRUD alongside the existing projections.
