# Calendar API Contract

Date: 2026-07-21

## Routes

### Unified calendar read

```
GET /api/v1/calendar/items
```

Merges CalendarEvent rows, Task.dueDate projections, and Case.deadline projections.

Query parameters:
- `from` (required): YYYY-MM-DD start boundary
- `to` (required): YYYY-MM-DD end boundary (exclusive)
- `view`: `day` | `week` | `month` (affects default range validation)
- `userId`: filter to events where user is responsible, creator, or participant
- `caseId`: filter to events linked to this case
- `clientId`: filter to events on cases belonging to this client
- `eventType`: comma-separated CalendarEventType values
- `sourceType`: comma-separated source types: `CALENDAR_EVENT`, `TASK_DEADLINE`, `CASE_DEADLINE`
- `includeProjections`: `true` (default) | `false` — whether to include Task/Case projections
- `includeCancelled`: `false` (default) | `true`
- `limit`: max items (default 200, max 500)
- `cursor`: opaque cursor for pagination

Range limits:
- `day` view: max 7 days
- `week` view: max 31 days
- `month` view: max 62 days
- No view specified: max 62 days
- `from` and `to` are required — no unbounded queries

Response: `CalendarItemListResponse`

```typescript
interface CalendarItemListResponse {
  generatedAt: string;          // ISO timestamp
  timezone: string;             // Application timezone
  range: { from: string; to: string };
  items: CalendarItem[];
  pagination: { cursor: string | null; hasMore: boolean };
  availability: {
    calendarEvents: boolean;    // true
    taskDeadlines: boolean;     // true if includeProjections
    caseDeadlines: boolean;     // true if includeProjections
    hearings: boolean;          // false until event type filter includes COURT_HEARING
    externalCalendar: boolean;  // false until Graph enabled
  };
}
```

### CalendarEvent CRUD

```
GET    /api/v1/calendar/events/:id
POST   /api/v1/calendar/events
PATCH  /api/v1/calendar/events/:id
DELETE /api/v1/calendar/events/:id
```

#### GET /api/v1/calendar/events/:id

Returns full event details including description. Applies authorization check.

Response: `CalendarEventDetailResponse`

```typescript
interface CalendarEventDetailResponse {
  id: string;
  title: string;
  description: string | null;
  eventType: CalendarEventType;
  status: CalendarEventStatus;
  visibility: CalendarEventVisibility;
  availability: CalendarAvailability;
  startAt: string | null;
  endAt: string | null;
  allDay: boolean;
  startDate: string | null;
  endDate: string | null;
  timezone: string | null;
  location: string | null;
  onlineMeetingUrl: string | null;
  case: { id: string; caseNumber: string; title: string; client: { id: string; name: string; colorKey: string | null } } | null;
  responsibleUser: { id: string; name: string; email: string } | null;
  createdBy: { id: string; name: string };
  participants: CalendarParticipantDto[];
  recurrence: {
    rule: string;
    timezone: string;
    endAt: string | null;
    isException: boolean;
    seriesId: string | null;
  } | null;
  capabilities: {
    canEdit: boolean;
    canDelete: boolean;
    canCancel: boolean;
    canEditSeries: boolean;
    canAddParticipants: boolean;
  };
  version: number;
  createdAt: string;
  updatedAt: string;
}
```

#### POST /api/v1/calendar/events

Creates a new CalendarEvent. Requires `Idempotency-Key` header.

Request body: `CreateCalendarEventRequest`

```typescript
interface CreateCalendarEventRequest {
  title: string;
  description?: string;
  eventType: CalendarEventType;
  visibility?: CalendarEventVisibility;     // defaults per type
  availability?: CalendarAvailability;       // defaults to BUSY
  startAt?: string;                          // required for timed
  endAt?: string;                            // required for timed
  allDay?: boolean;                          // default false
  startDate?: string;                        // required for all-day
  endDate?: string;                          // required for all-day
  timezone?: string;                         // defaults to app TZ
  location?: string;
  onlineMeetingUrl?: string;
  caseId?: string;
  responsibleUserId?: string;
  recurrenceRule?: string;
  recurrenceTimezone?: string;
  recurrenceEndAt?: string;
  participantUserIds?: string[];
}
```

Returns: `CalendarEventDetailResponse` with HTTP 201.

#### PATCH /api/v1/calendar/events/:id

Updates an existing CalendarEvent. Requires `If-Match` header with current version for optimistic concurrency.

Query parameters for recurrence:
- `scope`: `single` (default) | `thisAndFollowing` | `all`

If `scope=single` on a recurring series: creates an exception occurrence.
If `scope=thisAndFollowing`: splits the series.
If `scope=all`: updates the series template.

Request body: partial `CreateCalendarEventRequest` (only changed fields).

Returns: `CalendarEventDetailResponse` with HTTP 200.
Returns: HTTP 409 if version conflict.

#### DELETE /api/v1/calendar/events/:id

Soft-deletes an event.

Query parameters for recurrence:
- `scope`: `single` (default) | `thisAndFollowing` | `all`

If `scope=single` on a recurring series: creates a cancelled occurrence exception.
If `scope=thisAndFollowing`: truncates the series.
If `scope=all`: soft-deletes the series and all exceptions.

Returns: HTTP 204.

### Participant management

```
POST   /api/v1/calendar/events/:id/participants
DELETE /api/v1/calendar/events/:id/participants/:userId
```

#### POST /api/v1/calendar/events/:id/participants

Adds participant(s).

```typescript
interface AddParticipantsRequest {
  participants: { userId: string; role?: CalendarParticipantRole }[];
}
```

Returns: HTTP 200 with updated participant list.

#### DELETE /api/v1/calendar/events/:id/participants/:userId

Removes a participant.

Returns: HTTP 204.

### Event cancellation

```
POST /api/v1/calendar/events/:id/cancel
```

Sets event status to CANCELLED without soft-deleting. The event remains visible in the calendar as a cancelled item (strikethrough display). Recurrence scope parameter applies.

Returns: HTTP 200 with updated event.

## Error responses

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_EVENT_DATA` | Validation failure (missing fields, invalid dates, invalid RRULE) |
| 400 | `INVALID_DATE_RANGE` | Query range exceeds maximum |
| 401 | `UNAUTHORIZED` | No valid auth token |
| 403 | `CALENDAR_ACCESS_DENIED` | User cannot read/edit/delete this event |
| 404 | `EVENT_NOT_FOUND` | Event does not exist or is soft-deleted |
| 409 | `VERSION_CONFLICT` | If-Match version does not match current version |
| 409 | `DUPLICATE_EVENT` | Idempotency-Key already processed |

## Conflict response (409)

```json
{
  "status": 409,
  "code": "VERSION_CONFLICT",
  "message": "The event has been modified since you last loaded it.",
  "currentVersion": 3,
  "updatedAt": "2026-08-15T10:30:00.000Z"
}
```
