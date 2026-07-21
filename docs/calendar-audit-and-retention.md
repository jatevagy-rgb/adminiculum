# Calendar Audit and Retention

Date: 2026-07-21

## Audit trail requirements

Law office calendar events require audit logging for:
- Compliance: ability to prove what was scheduled and when
- Dispute resolution: evidence that a hearing or deadline was known and acknowledged
- Administrative oversight: who changed what and when

## Audit mechanism

### TimelineEvent reuse assessment

The existing `TimelineEvent` model is **case-scoped** (`caseId` is required). It is unsuitable for calendar audit because:
- Not all calendar events are case-related (OFFICE_EVENT, LEAVE, INTERNAL_MEETING without case)
- TimelineEvent types are task/case lifecycle specific (CREATED, SUBMITTED, REVIEWED, etc.)
- Adding calendar-specific event types to the existing enum would pollute the case timeline

**Decision:** Calendar audit uses a separate `CalendarAuditLog` table.

### CalendarAuditLog proposed schema

```prisma
model CalendarAuditLog {
  id             String   @id @default(uuid())
  eventId        String
  action         CalendarAuditAction
  actorId        String
  timestamp      DateTime @default(now())
  fieldChanges   Json?    // { field: { old: value, new: value } }
  metadata       Json?    // Additional context (scope, recurrence info)

  event          CalendarEvent @relation(fields: [eventId], references: [id])
  actor          User          @relation(fields: [actorId], references: [id])

  @@index([eventId, timestamp])
  @@index([actorId, timestamp])
}

enum CalendarAuditAction {
  CREATED
  UPDATED
  CANCELLED
  DELETED
  RESTORED
  PARTICIPANT_ADDED
  PARTICIPANT_REMOVED
  RECURRENCE_EXCEPTION_CREATED
  SERIES_SPLIT
  SERIES_TERMINATED
}
```

### What is logged

| Action | Fields recorded |
|---|---|
| CREATED | All initial field values |
| UPDATED | Changed fields only (old → new) |
| CANCELLED | Previous status, cancellation scope |
| DELETED | Soft-delete timestamp, who deleted |
| RESTORED | Who restored, previous deletedAt |
| PARTICIPANT_ADDED | userId, role |
| PARTICIPANT_REMOVED | userId |
| RECURRENCE_EXCEPTION_CREATED | originalStartAt, which fields differ from series |
| SERIES_SPLIT | splitAt date, new series ID |
| SERIES_TERMINATED | previous recurrenceEndAt, new endAt |

### What is NOT logged

- Read access (list/detail views) — no read audit in MVP
- Projection queries (task/case deadline reads) — these use existing task/case authorization
- Failed authorization attempts — logged at HTTP middleware level, not calendar-specific

## Retention policy

### CalendarEvent records

| State | Retention |
|---|---|
| Active (deletedAt IS NULL) | Indefinite |
| Soft-deleted (deletedAt IS NOT NULL) | 2 years from deletedAt |
| Cancelled (status = CANCELLED) | Indefinite (remains visible) |

### CalendarAuditLog records

| Policy | Duration |
|---|---|
| Minimum retention | 5 years from timestamp |
| Legal hold | Indefinite if case has active legal hold |
| Cleanup | Automated batch job, weekly |

### Rationale

- 5-year audit retention exceeds the Hungarian statute of limitations for most civil matters (3 years) with margin
- Legal hold prevents cleanup when litigation is pending
- Soft-deleted events are retained 2 years so accidental deletions can be recovered and audited

## Soft delete behavior

### Deletion cascade

When a CalendarEvent is soft-deleted:
1. `deletedAt` is set to `now()`
2. CalendarAuditLog entry is created with action `DELETED`
3. CalendarEventParticipant records are NOT deleted (preserved for audit)
4. The event is excluded from all calendar queries (WHERE deletedAt IS NULL)
5. Notifications for future occurrences of this event are cancelled

### Restoration

ADMIN users can restore soft-deleted events within the retention window:
1. `deletedAt` is set back to `NULL`
2. CalendarAuditLog entry is created with action `RESTORED`
3. Participant records are intact and become active again
4. Notifications are NOT automatically re-created (must be manually re-enabled)

### Hard deletion (retention cleanup)

After the 2-year retention window:
1. CalendarEventParticipant records are deleted (CASCADE)
2. CalendarEvent record is deleted
3. CalendarAuditLog records are NOT deleted (they have their own 5-year retention)

## Recurrence audit specifics

### Series modification

When a recurring series is modified with `scope=all`:
- Single audit entry on the series template event
- `fieldChanges` records the template-level changes
- `metadata` includes `{ scope: "all", affectedOccurrences: "all_future" }`

### Exception creation

When a single occurrence is modified (`scope=single`):
- Audit entry with action `RECURRENCE_EXCEPTION_CREATED` on the series template
- Separate `CREATED` audit entry on the new exception event
- `metadata` includes `{ originalStartAt: "...", seriesId: "..." }`

### Series split

When `scope=thisAndFollowing`:
- `SERIES_TERMINATED` audit entry on the original series (recurrenceEndAt updated)
- `CREATED` audit entry on the new series
- `metadata` includes `{ splitAt: "...", originalSeriesId: "...", newSeriesId: "..." }`

## API for audit access

No dedicated audit API in MVP. Audit logs are accessible only via direct database queries for ADMIN users.

**Phase 2:** Consider `GET /api/v1/calendar/events/:id/history` returning a paginated list of audit entries for a specific event.
