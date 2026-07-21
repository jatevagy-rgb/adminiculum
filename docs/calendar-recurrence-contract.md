# Calendar Recurrence Contract

Date: 2026-07-21

## Decision: Option C — Hybrid (RFC5545 RRULE + structured metadata)

### Evaluated options

**Option A: Raw RFC5545 RRULE only.**
Pro: Standard, compact, portable. Con: Parsing complexity, timezone edge cases require external library, no queryable fields.

**Option B: Structured recurrence fields only.**
Pro: Queryable, simple validation. Con: Cannot represent all RFC5545 patterns, limits future Graph interoperability, custom format.

**Option C: Hybrid — normalized RRULE string + timezone + boundary fields.** (SELECTED)
Pro: Standard representation for full pattern expressiveness, structured boundary fields for query optimization, timezone stored separately for DST handling. Con: Slightly more complex, requires RRULE parsing library.

**Rationale for Option C:** Graph/Outlook use RFC5545 RRULE natively. Storing the RRULE directly ensures future sync compatibility without lossy conversion. The structured `recurrenceTimezone` and `recurrenceEndAt` fields enable query-time optimization without parsing every RRULE.

## Model

### Series event (the "template")

A recurring event series is represented by a single CalendarEvent record where:
- `recurrenceRule` is a non-null RFC5545 RRULE string (e.g., `FREQ=WEEKLY;BYDAY=MO,WE,FR`)
- `recurrenceTimezone` is the IANA timezone for expansion (e.g., `Europe/Budapest`)
- `recurrenceEndAt` is the hard boundary (from RRULE UNTIL/COUNT or system maximum)
- `seriesId` is null (this IS the series root)
- `startAt/endAt` define the first occurrence's time
- `isSeriesException` is false

### Regular occurrence (virtual)

Regular occurrences are **not materialized as database rows**. They are computed at query time by expanding the RRULE within the requested date range, using the series event's fields as a template.

Each virtual occurrence has a stable synthetic ID: `{seriesEventId}:{originalStartAt_ISO}`.

### Exception occurrence (materialized)

When a single occurrence is edited (title changed, time moved, etc.), a new CalendarEvent row is created:
- `seriesId` = the series root event ID
- `isSeriesException` = true
- `originalStartAt` = the original computed start time of this occurrence
- `isCancelled` = false
- Modified fields carry the new values; unmodified fields inherit from the series template

### Cancelled occurrence (materialized)

When a single occurrence is deleted/cancelled:
- A CalendarEvent row is created (or the existing exception is updated)
- `seriesId` = the series root event ID
- `isSeriesException` = true
- `originalStartAt` = the original computed start time
- `isCancelled` = true

This prevents the cancelled occurrence from reappearing on re-expansion.

### "This and following" edit

When a user edits "this and following" occurrences:
1. The original series' `recurrenceEndAt` is truncated to just before the split point
2. A new series CalendarEvent is created with the modified fields, starting from the split point, carrying forward the remaining recurrence pattern

This splits one series into two. Existing exceptions before the split point remain attached to the original series. Exceptions at or after the split point are either reassigned to the new series or regenerated.

## Supported patterns

| Pattern | RRULE example | Supported? |
|---|---|---|
| Weekly on specific days | `FREQ=WEEKLY;BYDAY=MO,WE,FR` | Yes |
| Monthly on day-of-month | `FREQ=MONTHLY;BYMONTHDAY=15` | Yes |
| Monthly on weekday position | `FREQ=MONTHLY;BYDAY=2TU` (2nd Tuesday) | Yes |
| Daily on weekdays | `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` | Yes |
| Yearly | `FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=15` | Yes |
| End after N occurrences | `FREQ=WEEKLY;BYDAY=MO;COUNT=10` | Yes |
| End on date | `FREQ=WEEKLY;BYDAY=MO;UNTIL=20270101T000000Z` | Yes |
| Every N weeks/months | `FREQ=WEEKLY;INTERVAL=2;BYDAY=MO` | Yes |
| No end (perpetual) | `FREQ=WEEKLY;BYDAY=MO` | Yes, with system-imposed `recurrenceEndAt` |

## Query horizon and expansion strategy

### Expansion rules

1. The client specifies a date range (`from`, `to`) in the calendar list query.
2. For each recurring series whose `startAt <= to` and (`recurrenceEndAt >= from` or `recurrenceEndAt` is null):
   a. Expand the RRULE within `[from, to]` to produce virtual occurrence timestamps.
   b. For each virtual occurrence, check if a materialized exception exists (matched by `seriesId` + `originalStartAt`).
   c. If an exception exists and `isCancelled = true`, skip the occurrence.
   d. If an exception exists and `isCancelled = false`, use the exception's fields instead of the template.
   e. If no exception exists, use the series template fields with the computed start/end times.

### System-imposed boundaries

- If a series has no explicit end (no UNTIL, no COUNT), the system imposes `recurrenceEndAt = startAt + 2 years`.
- Maximum expansion range per query: 62 days (Phase 21 performance contract).
- Maximum occurrences per series per query: 200.

### Timezone and DST

Recurrence expansion uses `recurrenceTimezone` to compute occurrence times. This handles DST transitions correctly:
- A "weekly Monday at 10:00" meeting stays at 10:00 local time even when the clock shifts.
- The UTC timestamp of each occurrence changes with DST.
- See `calendar-timezone-and-all-day-contract.md` for full timezone rules.

## Examples

### Weekly internal meeting, Monday and Wednesday at 14:00, 1 hour

```
CalendarEvent:
  title: "Legal team standup"
  eventType: INTERNAL_MEETING
  startAt: 2026-08-03T12:00:00Z (14:00 Europe/Budapest CEST = UTC+2)
  endAt: 2026-08-03T13:00:00Z
  timezone: "Europe/Budapest"
  recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE"
  recurrenceTimezone: "Europe/Budapest"
  recurrenceEndAt: null (system imposes 2028-08-03)
  seriesId: null
  isSeriesException: false
```

### Single occurrence cancelled (August 18 meeting cancelled)

```
CalendarEvent:
  seriesId: <series event id>
  isSeriesException: true
  originalStartAt: 2026-08-17T12:00:00Z
  isCancelled: true
  title: "Legal team standup" (inherited, stored for audit)
```

### Single occurrence moved (August 20 meeting moved to 15:00)

```
CalendarEvent:
  seriesId: <series event id>
  isSeriesException: true
  originalStartAt: 2026-08-19T12:00:00Z
  isCancelled: false
  startAt: 2026-08-19T13:00:00Z (15:00 Budapest)
  endAt: 2026-08-19T14:00:00Z
  title: "Legal team standup"
```

### Monthly filing deadline, 15th of each month, all-day

```
CalendarEvent:
  title: "Havi ÁFA bevallás"
  eventType: FILING
  allDay: true
  startDate: "2026-08-15"
  endDate: "2026-08-16" (exclusive)
  timezone: "Europe/Budapest"
  recurrenceRule: "FREQ=MONTHLY;BYMONTHDAY=15"
  recurrenceTimezone: "Europe/Budapest"
  recurrenceEndAt: 2028-08-15T00:00:00Z
  caseId: <tax case id>
```
