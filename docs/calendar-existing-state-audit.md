# Calendar Existing State Audit

Date: 2026-07-21
Branch: claude/shared-office-calendar-audit-1
Base: fc6996d (release/editor-ops-workflow-1)

## Inventory

### Task.dueDate

- Model: `Task`
- Field: `dueDate DateTime?`
- API: `GET /api/v1/agenda` (projected as `WorkflowDeadlineDto` with `sourceType: TASK`), `POST /api/v1/tasks/:id/reschedule`, `PATCH /api/v1/tasks/:id/deadline`
- UI: Dashboard 7-day strip, `/deadlines` page (agenda/day/week views), task table "Határidő" column, case work items
- Authorization: `canUserActOnTask` — ADMIN/PARTNER bypass; otherwise must be task assignee, assigner, case lawyer, case creator, or case collaborator
- Duplication risk: HIGH if a separate CalendarEvent row is created for task deadlines
- Recommended future role: Task.dueDate remains authoritative for task work deadlines. Calendar views project it read-only. No duplicate editable row.

### Case.deadline

- Model: `Case`
- Field: `deadline DateTime?`
- API: `GET /api/v1/agenda` (projected as `WorkflowDeadlineDto` with `sourceType: CASE_DEADLINE`, only for MY_CASES/CASE scopes), `PATCH /api/v1/cases/:caseId` (body includes `deadline`)
- UI: Dashboard operational overview (DEADLINE_APPROACHING group), `/deadlines` page
- Authorization: `requireCaseManageAccess` for writes — ADMIN/PARTNER bypass; otherwise must be case assignedLawyer or createdBy
- Duplication risk: HIGH if duplicated as CalendarEvent
- Recommended future role: Case.deadline remains authoritative for case-level legal deadlines. Calendar views project it read-only.

### Agenda service

- File: `Backend/src/modules/agenda/service.ts`
- Route: `GET /api/v1/agenda`
- Nature: **Real-time projection**, not a separate model. Merges Task.dueDate and Case.deadline into `WorkflowDeadlineDto` items grouped by day.
- Scopes: MY_WORK (tasks assigned to user, no case deadlines), MY_CASES (tasks + case deadlines for accessible cases), CASE (single case)
- Range: default 14 days, maximum 45 days, maximum 100 items
- Sorting: urgency rank, importance rank, due date, user assignment, source type
- Availability flags: `taskDueDates: true`, `caseDeadlines: true/false`, `hearings: false`, `reminders: false`, `teamScope: false`, `externalCalendar: false`

### Dashboard operational overview

- File: `Backend/src/modules/cases/dashboardOperational.ts`
- Route: `GET /api/v1/cases/dashboard/operational-overview`
- Groups cases by operational urgency: DEADLINE_APPROACHING (nearest deadline <= 7 days), OFFICE_ACTION, REVIEW, CLIENT_WAITING, UNSPECIFIED
- Returns resume candidate for the user's most urgent actionable task
- ADMIN/PARTNER see all cases; others see only accessible cases

### Notification model

- Model: `Notification` with `id, type, title, message, link, isRead, userId, createdAt`
- Types: `TASK_DUE_SOON`, `TASK_OVERDUE` exist in enum but are **never created** by any code path
- No creation service, no scheduler, no push/WebSocket/SSE infrastructure
- Read-only CRUD: list, unread-count, mark-read, mark-all-read
- A `buildDeadlineNotificationPreview()` helper exists but is never called

### TimelineEvent (audit log)

- Model: `TimelineEvent` with `eventType, payload, description, metadata, caseId, userId, documentId, taskId, communicationId, timeEntryId, createdAt`
- **Case-scoped only** — `caseId` is required, not nullable
- Types include: `DEADLINE_SET`, `DEADLINE_WARNING`, `DEADLINE_MISSED`, `MEETING_SCHEDULED`
- Created via `createTimelineEvent()` in task/case services
- No standalone cross-entity audit log exists

### User model

- No timezone field
- No locale field
- No calendar preference fields
- Roles: ADMIN, PARTNER, LAWYER, TRAINEE, LEGAL_ASSISTANT, CLIENT, EXTERNAL_REVIEWER, COLLAB_LAWYER

### Frontend calendar state

- `/calendar` route exists but **redirects to `/deadlines`**
- `/deadlines` page: three views (Munkasor/agenda, Napi nézet/day, Heti nézet/week) — all are **filtered lists**, not time grids
- Dashboard 7-day strip: inline `grid-cols-7` buttons, not a reusable calendar component
- No month view anywhere
- No third-party calendar library
- No reusable calendar grid component
- Client colors projected via `ClientAccent` component with 10 color keys
- Frontend performs zero role-based checks — relies entirely on backend `capabilities` objects

### Missing infrastructure

| Concept | Status |
|---|---|
| CalendarEvent model | Does not exist |
| Per-user timezone | Does not exist |
| Reminder scheduler | Does not exist |
| Notification creation service | Does not exist |
| Standalone audit log | Does not exist (TimelineEvent is case-scoped) |
| Hearing/court-date entity | Does not exist |
| External calendar integration | Does not exist |
| Team scope in agenda | Explicitly rejected |
| Time-range events (start/end) | Does not exist (startsAt always null) |
| Month/week time-grid view | Does not exist |
| Drag-and-drop scheduling | Does not exist |

## Agenda contract summary

The current "agenda" is a **real-time Task+Case deadline projection**. It is not a separate event model. It produces `WorkflowDeadlineDto` items that are point-in-time deadlines (dueAt only, no start/end range). The frontend renders these as filtered lists grouped by day, not as a time-grid calendar.

This architecture cannot support:
- Time-range events (meetings, hearings with start+end)
- Events without a case relation (office closures, personal leave)
- Events without a task relation (client meetings)
- Recurring events
- Participants beyond the task assignee
- Visibility/privacy controls
- External calendar sync
- Month or week time-grid views
