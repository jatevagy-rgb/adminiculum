# Calendar Decision Log

Date: 2026-07-21

## Decisions

### D1: New CalendarEvent model required

**Context:** Could calendar events be stored as Tasks with a special type, or as TimelineEvent records?

**Decision:** New dedicated CalendarEvent model.

**Rationale:** Tasks have lifecycle semantics (submission, review, completion) that don't apply to meetings. TimelineEvent is case-scoped and audit-specific. A calendar event is a fundamentally different entity — it has participants, recurrence, visibility, and availability concepts that don't map to either existing model.

**Alternatives rejected:**
- Task with `isCalendarEvent` flag — pollutes Task model with irrelevant fields
- TimelineEvent reuse — case-scoped, wrong semantic

---

### D2: Task.dueDate projected read-only, not duplicated

**Context:** Should creating a Task automatically create a CalendarEvent, or should task deadlines be projected at query time?

**Decision:** Runtime projection. Task.dueDate is the source of truth; the calendar shows it as a read-only projected item.

**Rationale:** Duplicating data creates synchronization problems. If a CalendarEvent copy of a task deadline gets out of sync with Task.dueDate, which one is authoritative? Projection eliminates this class of bugs entirely.

**Trade-off:** Task deadlines cannot carry calendar-specific metadata (participants, location). This is acceptable — a task deadline is "when this work is due," not "when we meet about this work."

---

### D3: Unified projection API (single endpoint)

**Context:** Should the frontend call three separate endpoints (calendar events, task deadlines, case deadlines) and merge client-side, or should the backend provide a unified API?

**Decision:** Single `GET /api/v1/calendar/items` endpoint returns all sources merged.

**Rationale:** Client-side merging requires the frontend to understand authorization rules for three different entity types. Server-side merging centralizes authorization, sorting, pagination, and placeholder generation. It also enables server-side optimizations (batched queries, caching) without frontend changes.

---

### D4: Hybrid RFC5545 RRULE for recurrence

**Context:** Use RRULE strings, a structured JSON object, or a custom recurrence model?

**Decision:** RRULE strings stored in `recurrenceRule` field, with structured metadata (`recurrenceTimezone`, `recurrenceEndAt`) alongside.

**Rationale:** RRULE is a well-established standard with library support. Storing the full string enables future interoperability with iCal/Outlook. Structured metadata fields avoid parsing the RRULE for common queries (timezone, end boundary).

**Trade-off:** RRULE strings are opaque to SQL queries. Filtering by recurrence pattern requires application-level logic. Acceptable for the expected event volume.

---

### D5: Virtual occurrences, not materialized rows

**Context:** Should each occurrence of a recurring event be a separate database row, or should occurrences be computed at query time?

**Decision:** Virtual occurrences computed by RRULE expansion. Only exceptions (modified/cancelled single occurrences) are materialized as rows.

**Rationale:** A weekly event for 2 years produces 104 rows if materialized. With 50 recurring events, that's 5,200 rows to maintain. Modifying a series (e.g., changing time) requires updating all future rows. Virtual expansion avoids this complexity.

**Trade-off:** Cannot query specific occurrences by ID in the database. The synthetic ID (`cal:{seriesId}:{originalStartAt}`) addresses this at the API level.

---

### D6: No direct clientId on CalendarEvent

**Context:** Should CalendarEvent have a direct `clientId` foreign key?

**Decision:** No. Client is derived via `CalendarEvent.case.client`.

**Rationale:** Events are linked to cases, and cases have clients. Adding a direct clientId creates two paths to client data that could diverge. Events not linked to a case have no client — this is correct (an internal meeting has no client).

**Trade-off:** Filtering by client requires a join through Case. Acceptable for the expected query patterns.

---

### D7: Soft delete via deletedAt

**Context:** Hard delete, soft delete, or archive status?

**Decision:** Soft delete using `deletedAt` timestamp.

**Rationale:** Law office compliance requires audit trail. Soft delete preserves the record for the retention period (2 years) while excluding it from normal queries. Hard delete is reserved for retention cleanup and ADMIN administrative action.

---

### D8: Optimistic concurrency via integer version

**Context:** Use database-level locking, optimistic concurrency with timestamps, or optimistic concurrency with version counter?

**Decision:** Integer `version` field incremented on each update.

**Rationale:** Integer comparison is simpler and more reliable than timestamp comparison (no precision issues). Database-level locking is unnecessary for the expected concurrency level (<20 simultaneous users). Version field maps cleanly to `If-Match` / `ETag` HTTP semantics.

---

### D9: Private events show "Foglalt" (busy) placeholder

**Context:** Should private events be completely hidden from unauthorized users, or shown as busy placeholders?

**Decision:** Show "Foglalt" placeholder with visible time range but no other details.

**Rationale:** Completely hiding events would make it impossible to see a colleague's availability. The placeholder shows when someone is busy without revealing what they're doing. This matches Google Calendar and Outlook behavior.

**Trade-off:** Time visibility reveals that something is scheduled. Accepted — availability information is necessary for scheduling.

---

### D10: Description excluded from list DTOs

**Context:** Should calendar list views include event descriptions?

**Decision:** No. Description is only returned by the detail endpoint (`GET /api/v1/calendar/events/:id`).

**Rationale:** Descriptions may contain confidential legal notes. Including them in list responses means they're transferred to the client even when not displayed (month view cells don't show descriptions). Fetching on detail-view access limits exposure.

---

### D11: Existing agenda API unchanged

**Context:** Should the new calendar API replace the existing `/api/v1/agenda` endpoint?

**Decision:** No. Both endpoints coexist. The existing endpoint continues serving the Dashboard 7-day strip and the `/deadlines` page.

**Rationale:** Changing the existing endpoint risks breaking the Dashboard, which is the primary entry point. The new calendar API is additive. Phase 2 may migrate the Dashboard strip to the new API.

---

### D12: Monday as first day of week

**Context:** Which day starts the week in calendar views?

**Decision:** Monday (Hungarian convention).

**Rationale:** Hungarian business and legal calendars use Monday as the first day. The application is used by a Hungarian law office.

---

### D13: CalendarAuditLog as separate table (not TimelineEvent)

**Context:** Reuse the existing TimelineEvent model for calendar audit, or create a dedicated table?

**Decision:** Dedicated CalendarAuditLog table.

**Rationale:** TimelineEvent is case-scoped (requires `caseId`). Not all calendar events have a case. TimelineEvent types are task/case lifecycle specific. Calendar audit needs its own action types and field-change tracking.

---

### D14: No notifications in MVP

**Context:** Should creating or modifying a calendar event trigger notifications to participants?

**Decision:** Deferred to Phase 2.

**Rationale:** The existing Notification model is simple CRUD (message + read status). Calendar notifications need scheduling (remind 15 min before), cancellation on event change, and recurrence-aware delivery. This is a significant feature that should not gate the MVP.

---

### D15: 2-year recurrence boundary

**Context:** How far into the future can a recurring event extend?

**Decision:** System-imposed 2-year boundary from creation date.

**Rationale:** Unbounded recurrence creates performance risk in expansion and conceptual risk in scheduling (does a "weekly standup" 5 years from now have meaning?). 2 years covers annual cycles with margin. Series can be extended by editing `recurrenceEndAt`.
