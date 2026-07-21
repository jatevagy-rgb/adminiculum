# Calendar Performance and Concurrency

Date: 2026-07-21

## Query performance

### Primary query: unified calendar items

`GET /api/v1/calendar/items?from=2026-08-01&to=2026-08-31`

This query merges three sources. Each must be independently performant.

#### CalendarEvent query

```sql
SELECT ce.*, 
       c.id as "caseId", c."caseNumber", c.title as "caseTitle",
       cl.id as "clientId", cl.name as "clientName", cl."colorKey"
FROM "CalendarEvent" ce
LEFT JOIN "Case" c ON ce."caseId" = c.id
LEFT JOIN "Client" cl ON c."clientId" = cl.id
WHERE ce."deletedAt" IS NULL
  AND (
    (ce."allDay" = false AND ce."startAt" < '2026-09-01T00:00:00Z' AND ce."endAt" > '2026-08-01T00:00:00Z')
    OR
    (ce."allDay" = true AND ce."startDate" < '2026-09-01' AND ce."endDate" > '2026-08-01')
  )
ORDER BY COALESCE(ce."startAt", ce."startDate"::timestamptz) ASC;
```

**Index support:**
- `CalendarEvent_startAt_endAt_idx` covers timed event range queries
- `CalendarEvent_startDate_endDate_idx` covers all-day event range queries
- Both are partial indexes (WHERE deletedAt IS NULL)

**Expected performance:** <10ms for monthly view with <500 events (typical law office scale).

#### Task deadline projection query

```sql
SELECT t.id, t.title, t."dueDate", t.status,
       c.id as "caseId", c."caseNumber", c.title as "caseTitle",
       cl.id as "clientId", cl.name as "clientName", cl."colorKey",
       u.id as "assigneeId", u.name as "assigneeName"
FROM "Task" t
JOIN "Case" c ON t."caseId" = c.id
LEFT JOIN "Client" cl ON c."clientId" = cl.id
LEFT JOIN "User" u ON t."assignedToId" = u.id
WHERE t."dueDate" IS NOT NULL
  AND t."dueDate" >= '2026-08-01T00:00:00Z'
  AND t."dueDate" < '2026-09-01T00:00:00Z'
  AND t.status NOT IN ('DONE', 'CANCELLED', 'ARCHIVED')
  AND c.id IN (SELECT "caseId" FROM accessible_cases_for_user(...))
```

**Index support:** Existing Task indexes on dueDate and status. The accessible-cases subquery reuses existing authorization patterns.

#### Case deadline projection query

Similar structure, querying Case.deadline with the same range filter and authorization.

### Participant eager loading

CalendarEventParticipant records are loaded in a single batch query:

```sql
SELECT cep.*, u.name as "userName"
FROM "CalendarEventParticipant" cep
JOIN "User" u ON cep."userId" = u.id
WHERE cep."eventId" IN (...event_ids...)
```

This avoids N+1 queries. The event IDs are collected from the CalendarEvent query result.

### Recurrence expansion performance

Recurrence expansion is computed in application code, not in the database.

**Bounded by:**
- Query range (max 62 days for month view)
- Max 200 occurrences per series per query (enforced in expansion logic)
- 2-year system boundary on recurrence (no infinite series)

**Expected cost:** <1ms per series for WEEKLY/MONTHLY rules within a 62-day window. This produces at most ~9 weekly or ~2 monthly occurrences per series — trivial computation.

**Edge case:** A DAILY recurrence produces up to 62 occurrences in a month view — still well within performance budget.

### Pagination

The unified projection uses cursor-based pagination:
- Default limit: 200 items
- Max limit: 500 items
- Cursor: opaque string encoding the sort position (startAt/startDate + id)
- CalendarEvent, Task, and Case results are merged and sorted before pagination is applied

For typical law office usage (10-50 events per month, 20-100 task deadlines), pagination is rarely needed.

## Concurrency control

### Optimistic concurrency on CalendarEvent

CalendarEvent uses an integer `version` field for optimistic concurrency control.

**Flow:**
1. Client loads event detail: receives `version: 3`
2. Client sends PATCH with `If-Match: 3`
3. Server checks: `WHERE id = :id AND version = 3`
4. If match: update succeeds, `version` incremented to 4, return 200
5. If no match: return 409 VERSION_CONFLICT with current version

```typescript
const result = await prisma.calendarEvent.updateMany({
  where: { id: eventId, version: expectedVersion, deletedAt: null },
  data: { ...updates, version: { increment: 1 }, updatedAt: new Date() },
});

if (result.count === 0) {
  const current = await prisma.calendarEvent.findUnique({ where: { id: eventId } });
  if (!current || current.deletedAt) throw new NotFoundException();
  throw new ConflictException({
    code: 'VERSION_CONFLICT',
    currentVersion: current.version,
    updatedAt: current.updatedAt,
  });
}
```

### Why not database-level locking?

- `SELECT ... FOR UPDATE` blocks concurrent readers unnecessarily
- Calendar events are low-contention (typically edited by one user at a time)
- Optimistic concurrency is simpler, performs better, and matches the frontend pattern (load → edit → save)

### Idempotency for creation

Event creation requires an `Idempotency-Key` header to prevent duplicate events from retried requests.

```typescript
try {
  await prisma.calendarEvent.create({
    data: { ...eventData, idempotencyKey },
  });
} catch (e) {
  if (e.code === 'P2002' && e.meta?.target?.includes('idempotencyKey')) {
    const existing = await prisma.calendarEvent.findUnique({
      where: { idempotencyKey },
    });
    return existing; // Return the already-created event
  }
  throw e;
}
```

**Idempotency key lifecycle:**
- Client generates a UUID v4 before the first request attempt
- Same key is used for all retries of the same logical creation
- Keys are stored indefinitely (unique constraint on the CalendarEvent table)
- No cleanup needed — the key is just a column on the event record

### Participant modification concurrency

Participant add/remove operations do not use optimistic concurrency. They are idempotent by nature:
- Adding an already-present participant: no-op (UNIQUE constraint, upsert)
- Removing an absent participant: no-op (DELETE WHERE returns 0 rows)

### Recurrence series modification concurrency

When modifying a recurring series with `scope=all` or `scope=thisAndFollowing`:
1. The series template event's `version` is checked (optimistic concurrency)
2. If another user modified the series between load and save, 409 is returned
3. Exception occurrences created by `scope=single` do NOT conflict with series-level edits (they are separate records)

## Connection pool considerations

The unified projection query makes 3-4 database round trips per request:
1. CalendarEvent query
2. Task deadline query
3. Case deadline query
4. Participant batch query (if CalendarEvents exist)

With Prisma's connection pool (default 5 connections on B1 SKU), this supports ~12-15 concurrent calendar requests — sufficient for a law office with <20 simultaneous users.

## Caching strategy (MVP)

No application-level caching in MVP. The queries are fast enough for the expected load.

**Phase 2 considerations:**
- Redis cache for expanded recurrence occurrences (invalidated on series modification)
- ETag-based HTTP caching for calendar list responses
- Stale-while-revalidate for the unified projection
