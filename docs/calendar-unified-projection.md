# Calendar Unified Projection

Date: 2026-07-21

## CalendarItem DTO

The unified calendar projection returns `CalendarItem` records that merge heterogeneous sources into a common shape.

```typescript
interface CalendarItem {
  // Identity
  id: string;                    // Stable ID (see below)
  sourceType: CalendarItemSourceType;
  sourceId: string;              // Original record ID

  // Display
  title: string;
  eventType: string | null;      // CalendarEventType or null for projections
  startAt: string | null;        // ISO UTC for timed events
  endAt: string | null;
  startDate: string | null;      // YYYY-MM-DD for all-day
  endDate: string | null;
  allDay: boolean;
  status: string;                // CONFIRMED, TENTATIVE, CANCELLED, OPEN, COMPLETED
  urgency: string | null;        // OVERDUE, TODAY, TOMORROW, THIS_WEEK, LATER (for deadlines)

  // Relations
  case: { id: string; caseNumber: string; title: string } | null;
  client: { id: string; name: string } | null;
  clientColorKey: string | null;
  responsibleUser: { id: string; name: string } | null;
  participants: { id: string; name: string; role: string }[];

  // Presentation
  visibility: string;
  availability: string;
  isPlaceholder: boolean;        // True for private/unauthorized events

  // Capabilities
  canEdit: boolean;
  canDelete: boolean;
  canReschedule: boolean;        // For task/case deadline projections
  canComplete: boolean;          // For task projections

  // Navigation
  detailRoute: string;           // Frontend route for event detail/edit
  editEndpoint: string | null;   // API endpoint for write-back

  // Recurrence
  recurrence: {
    isRecurring: boolean;
    isException: boolean;
    seriesId: string | null;
  } | null;
}
```

## Source types

```typescript
type CalendarItemSourceType =
  | "CALENDAR_EVENT"       // Native CalendarEvent record
  | "TASK_DEADLINE"        // Projected from Task.dueDate
  | "CASE_DEADLINE";       // Projected from Case.deadline
```

## Stable synthetic IDs

Each source type produces IDs with a prefix to prevent collisions:

| Source | ID pattern | Example |
|---|---|---|
| CalendarEvent (single) | `cal:{eventId}` | `cal:a1b2c3d4-...` |
| CalendarEvent (recurrence occurrence) | `cal:{seriesId}:{originalStartAt_ISO}` | `cal:a1b2c3d4:2026-08-15T08:00:00Z` |
| CalendarEvent (exception) | `cal:{exceptionId}` | `cal:e5f6g7h8-...` |
| Task deadline | `task:{taskId}` | `task:t1u2v3w4-...` |
| Case deadline | `case:{caseId}` | `case:c5d6e7f8-...` |

The ID prefix tells the frontend which detail route and edit endpoint to use.

## Projection rules

### Task deadline projection

For each Task where `dueDate IS NOT NULL` and falls within the query range:

```typescript
{
  id: `task:${task.id}`,
  sourceType: "TASK_DEADLINE",
  sourceId: task.id,
  title: task.title,
  eventType: null,
  startAt: null,
  endAt: null,
  startDate: formatDate(task.dueDate),  // YYYY-MM-DD
  endDate: nextDay(formatDate(task.dueDate)),
  allDay: true,
  status: mapTaskStatus(task.status),   // OPEN, COMPLETED, CANCELLED
  urgency: computeUrgency(task.dueDate),
  case: { id: task.case.id, caseNumber: task.case.caseNumber, title: task.case.title },
  client: task.case.client ? { id: task.case.client.id, name: task.case.client.name } : null,
  clientColorKey: task.case.client?.colorKey || null,
  responsibleUser: task.assignedTo ? { id: task.assignedTo.id, name: task.assignedTo.name } : null,
  participants: [],
  visibility: "CASE_TEAM",
  availability: "FREE",
  isPlaceholder: false,
  canEdit: false,
  canDelete: false,
  canReschedule: canUserActOnTask(task, actor),
  canComplete: canUserActOnTask(task, actor) && isCompletable(task),
  detailRoute: `/tasks?taskId=${task.id}`,
  editEndpoint: `/api/v1/tasks/${task.id}/reschedule`,
  recurrence: null,
}
```

Authorization: Uses existing `canUserActOnTask` logic. Only shows tasks from accessible cases (reusing `getAccessibleCases`).

### Case deadline projection

For each Case where `deadline IS NOT NULL` and falls within the query range:

```typescript
{
  id: `case:${caseRecord.id}`,
  sourceType: "CASE_DEADLINE",
  sourceId: caseRecord.id,
  title: `${caseRecord.title} — Ügyhatáridő`,
  eventType: null,
  startDate: formatDate(caseRecord.deadline),
  endDate: nextDay(formatDate(caseRecord.deadline)),
  allDay: true,
  status: "OPEN",
  urgency: computeUrgency(caseRecord.deadline),
  case: { id: caseRecord.id, caseNumber: caseRecord.caseNumber, title: caseRecord.title },
  client: caseRecord.client ? { id: caseRecord.client.id, name: caseRecord.client.name } : null,
  clientColorKey: caseRecord.client?.colorKey || null,
  responsibleUser: caseRecord.assignedLawyer ? { ... } : null,
  participants: [],
  visibility: "CASE_TEAM",
  availability: "FREE",
  isPlaceholder: false,
  canEdit: false,
  canDelete: false,
  canReschedule: isCaseManager(caseRecord, actor),
  canComplete: false,
  detailRoute: `/cases/${caseRecord.id}`,
  editEndpoint: `/api/v1/cases/${caseRecord.id}`,
  recurrence: null,
}
```

### CalendarEvent projection

For each CalendarEvent (including expanded recurrence occurrences):

- Full detail mapping as per CalendarItem fields
- Visibility/authorization applied: unauthorized users get busy placeholder
- Description excluded from list DTO
- Participants included (name/role only, no email)

## Sorting

Items are sorted by:
1. Start time/date ascending (all-day events sort before timed events on the same day)
2. Duration ascending (shorter events first)
3. Source type: CALENDAR_EVENT before TASK_DEADLINE before CASE_DEADLINE
4. Title alphabetically

## Duplicate prevention

The projection explicitly prevents duplicate display:
- A Task.dueDate projection and a CalendarEvent of type LEGAL_DEADLINE for the same case/date are NOT deduplicated. They represent different concepts (task work deadline vs. standalone legal deadline).
- If a user creates a CalendarEvent manually for a task's deadline, the system shows both. This is by design — the CalendarEvent may carry additional information (participants, location) that the task deadline projection does not.
- The UI should make the source type visually distinct (different icon/badge) so users understand the difference.

## Performance considerations

- Task and Case projections are batched queries with JOINs, not N+1
- CalendarEvent query includes eager-loaded participants, case, and case.client
- Recurrence expansion is bounded by query range and max 200 occurrences per series
- Authorization filtering happens in the database query (WHERE clauses) for tasks and cases
- CalendarEvent visibility filtering is applied in application code after query (needed for placeholder generation)
