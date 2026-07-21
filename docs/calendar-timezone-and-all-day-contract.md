# Calendar Timezone and All-Day Contract

Date: 2026-07-21

## Timed events

### Storage

- `startAt` and `endAt` are stored as UTC `DateTime` in PostgreSQL (`timestamptz`).
- `timezone` stores the IANA timezone of the creating user (e.g., `Europe/Budapest`).
- The timezone is stored for display purposes and recurrence expansion, not for query filtering.

### API serialization

- API returns `startAt` and `endAt` as ISO 8601 UTC strings: `2026-08-15T08:00:00.000Z`
- API also returns `timezone: "Europe/Budapest"` so the frontend can display local time.
- API accepts creation/update in UTC. The frontend converts from local time before sending.

### Display

- The frontend converts UTC to the user's display timezone (currently the application-wide timezone, future: per-user).
- A meeting at `startAt: 2026-08-15T08:00:00Z` with `timezone: "Europe/Budapest"` displays as "10:00" in CEST (UTC+2).

### DST transitions

- When CET → CEST (spring forward): a 02:00 event is not skipped; the RRULE expansion shifts it to the new offset. A weekly meeting at 10:00 CET becomes 10:00 CEST (08:00 UTC instead of 09:00 UTC).
- When CEST → CET (fall back): the event stays at local 10:00. The UTC time shifts back.
- `recurrenceTimezone` governs this behavior. Expansion always produces the correct local time.

## All-day events

### Storage

- `allDay = true`
- `startDate` stores the start date as a plain string: `"2026-08-15"` (YYYY-MM-DD)
- `endDate` stores the **exclusive** end date: `"2026-08-16"` for a single-day event
- `startAt` and `endAt` are **null** for all-day events
- `timezone` may be set to indicate the originating office timezone but is not required for all-day events

### Rationale for separate date fields

Storing all-day events as midnight-to-midnight UTC timestamps is error-prone:
- "August 15" in Budapest (UTC+2) would be `2026-08-14T22:00:00Z` to `2026-08-15T22:00:00Z`, which is confusing
- DST transitions cause midnight to shift, creating off-by-one day errors
- Date-only legal deadlines ("file by August 15") have no meaningful time component

Using plain date strings avoids all timezone ambiguity for all-day events.

### End-exclusive semantics

`endDate` is exclusive, matching iCalendar DTEND semantics:
- A 1-day event on Aug 15: `startDate: "2026-08-15"`, `endDate: "2026-08-16"`
- A 3-day leave Aug 15–17: `startDate: "2026-08-15"`, `endDate: "2026-08-18"`
- Duration = endDate - startDate in days

### API serialization

- API returns `startDate: "2026-08-15"` and `endDate: "2026-08-16"` as plain strings
- API accepts the same format for creation/update
- `startAt`/`endAt` are omitted or null in all-day event DTOs

### Display

- All-day events are rendered in the all-day row of week view and as full-width bars in month view
- Multi-day all-day events span across day columns
- The frontend does not convert all-day dates through any timezone transformation

## Date-only legal deadlines

Legal deadlines ("file by August 15") are date-only concepts. They are stored as all-day CalendarEvent records:
- `allDay: true`
- `startDate: "2026-08-15"`
- `endDate: "2026-08-16"` (1-day)
- `eventType: LEGAL_DEADLINE` or `FILING`

This is distinct from `Task.dueDate` which is a `DateTime?` (point-in-time). The existing Task dueDate is projected into calendar views as a deadline marker. Standalone legal deadlines without a task are CalendarEvent records.

## Office timezone

The current application has no per-user timezone. It uses `process.env.TZ` or `Intl.DateTimeFormat().resolvedOptions().timeZone` or `'UTC'`.

For MVP:
- The application timezone (Hungary/Budapest for this law office) is the default for all users.
- `timezone` on CalendarEvent defaults to the application timezone.
- Per-user timezone is deferred to Phase 2. The User model field addition is noted in the migration design.

## Validation rules

| Condition | Rule |
|---|---|
| Timed event | `allDay = false`, `startAt` required, `endAt` required, `startAt < endAt`, `startDate`/`endDate` must be null |
| All-day event | `allDay = true`, `startDate` required, `endDate` required, `startDate < endDate`, `startAt`/`endAt` must be null |
| Timed event max duration | `endAt - startAt <= 7 days` (prevent accidental week-long timed events) |
| All-day event max duration | `endDate - startDate <= 90 days` (prevent accidental year-long events) |
| Timezone format | Must be a valid IANA timezone string if provided |
| Date format | `startDate`/`endDate` must match `YYYY-MM-DD` |

## Query behavior

Calendar list queries use `from` and `to` parameters (YYYY-MM-DD strings).

For timed events: include events where `startAt < to_end_of_day_utc AND endAt > from_start_of_day_utc`.

For all-day events: include events where `startDate < to AND endDate > from` (simple string comparison since dates are YYYY-MM-DD).
