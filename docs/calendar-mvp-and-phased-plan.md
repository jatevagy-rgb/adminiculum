# Calendar MVP Definition and Phased Implementation Plan

Date: 2026-07-21

## MVP scope

The MVP delivers a functional shared office calendar that coexists with the existing deadline system.

### MVP includes

1. **CalendarEvent CRUD** — create, read, update, soft-delete calendar events
2. **10 event types** — COURT_HEARING through OTHER
3. **Unified projection API** — merges CalendarEvent + Task.dueDate + Case.deadline
4. **Month, week, day, agenda views** — frontend calendar UI
5. **Authorization and visibility** — role-based access, private event placeholders
6. **Participants** — add/remove users to events with roles
7. **Recurrence** — basic RRULE (daily, weekly, monthly, yearly), single/thisAndFollowing/all edit scope
8. **All-day events** — date-only storage, exclusive end semantics
9. **Task deadline reschedule from calendar** — write-back to existing reschedule endpoint
10. **Optimistic concurrency** — version-based conflict detection
11. **Audit logging** — CalendarAuditLog for all mutations
12. **Client color integration** — events inherit case client color
13. **Soft delete with retention** — 2-year event retention, 5-year audit retention

### MVP excludes

1. Outlook/Graph integration
2. Drag-and-drop event rescheduling
3. Scheduled work blocks (task → calendar time association)
4. Review deadline projection
5. External-action deadline projection
6. Per-user timezone
7. Notification/reminder system for calendar events
8. Recurring task creation
9. Calendar sharing/export (iCal feed)
10. Meeting room / resource booking
11. Dashboard 7-day strip integration (strip continues using existing agenda API)
12. Read audit logging
13. Application-level caching

## Implementation slices

The implementation is divided into 6 sequential slices. Each slice is independently deployable and testable.

### Slice 1: Database foundation

**Duration estimate:** 1-2 days

**Deliverables:**
- Prisma schema additions (CalendarEvent, CalendarEventParticipant, CalendarAuditLog, 6 enums)
- Database migration
- `prisma generate` verification
- No API endpoints, no frontend changes

**Acceptance criteria:**
- Migration runs cleanly against staging database
- Prisma Client types are generated
- Existing test suite passes unchanged
- Rollback procedure verified

### Slice 2: CalendarEvent CRUD API

**Duration estimate:** 3-4 days

**Deliverables:**
- `Backend/src/modules/calendar/` module structure
- CalendarEvent service (create, read, update, soft-delete)
- CalendarEvent controller with routes
- Input validation (Zod schemas)
- Authorization middleware
- Optimistic concurrency (version check)
- Idempotency key handling
- CalendarAuditLog writes on all mutations
- Unit tests for service layer
- Integration tests for API endpoints

**Acceptance criteria:**
- All CRUD operations work via API
- Authorization matrix enforced (tested per role)
- Version conflict returns 409
- Duplicate idempotency key returns existing event
- Audit log entries created for every mutation

### Slice 3: Participants and recurrence

**Duration estimate:** 3-4 days

**Deliverables:**
- Participant add/remove endpoints
- RRULE parsing and validation
- Recurrence expansion engine (virtual occurrences)
- Exception occurrence creation (scope=single)
- Series split (scope=thisAndFollowing)
- Series-wide update (scope=all)
- Cancellation endpoint
- Tests for recurrence edge cases (DST, boundaries, max occurrences)

**Acceptance criteria:**
- Participants can be added/removed
- Weekly/monthly/yearly recurrence expands correctly
- DST transitions produce correct local times
- Exception occurrences override series defaults
- Series split creates two independent series
- Max 200 occurrences per series per query enforced

### Slice 4: Unified projection API

**Duration estimate:** 2-3 days

**Deliverables:**
- `GET /api/v1/calendar/items` endpoint
- Task deadline projection with authorization
- Case deadline projection with authorization
- CalendarEvent projection with visibility/placeholder logic
- Merge and sort across all three sources
- Cursor-based pagination
- Source type and event type filtering
- Range validation

**Acceptance criteria:**
- All three source types appear in response
- Private events return "Foglalt" placeholder for unauthorized users
- Task deadlines respect `canUserActOnTask`
- Case deadlines respect `requireCaseReadAccess`
- Pagination works across merged sources
- Range limits enforced (max 62 days)

### Slice 5: Frontend calendar views

**Duration estimate:** 5-7 days

**Deliverables:**
- Calendar page route (`/calendar` — repurpose existing redirect)
- Month view component
- Week view component
- Day view component
- Agenda/list view component
- View switcher and date navigation
- Event creation dialog (quick + full)
- Event detail panel
- Edit dialog with recurrence scope selector
- Private event placeholder rendering
- Client color integration
- Responsive layouts
- Loading and error states

**Acceptance criteria:**
- All four views render correctly
- Events are color-coded by client
- Private events show "Foglalt"
- Event creation works from all views
- Edit with recurrence scope works
- Responsive at desktop, tablet, mobile breakpoints
- Keyboard navigation functional

### Slice 6: Task interoperability and polish

**Duration estimate:** 2-3 days

**Deliverables:**
- Task deadline reschedule from calendar detail panel
- Task completion from calendar
- Visual distinction for projected items (icons, badges)
- Edge case fixes from slice 5 testing
- Performance optimization if needed
- Documentation updates

**Acceptance criteria:**
- Task deadline can be rescheduled from calendar
- Task can be marked complete from calendar
- Projected items are visually distinct from native events
- No regression in existing deadline/agenda views
- No regression in Dashboard 7-day strip

## Total estimated duration

16-23 development days (3-5 weeks for a single developer).

## Dependency chain

```
Slice 1 (DB) → Slice 2 (CRUD) → Slice 3 (Participants/Recurrence)
                                         ↓
                               Slice 4 (Projection) → Slice 5 (Frontend) → Slice 6 (Polish)
```

Slices 2 and 3 are backend-only. Slice 5 depends on Slice 4 (needs the unified API). Slice 6 depends on Slice 5.

## Phase 2 roadmap (post-MVP)

| Feature | Priority | Estimated effort |
|---|---|---|
| Drag-and-drop rescheduling | High | 2-3 days |
| Dashboard strip integration | High | 1-2 days |
| Notification/reminders for events | High | 3-4 days |
| Outlook one-way export | Medium | 4-5 days |
| Per-user timezone | Medium | 2-3 days |
| Scheduled work blocks | Medium | 3-4 days |
| Review deadline projection | Low | 1-2 days |
| Outlook bidirectional sync | Low | 8-12 days |
| Calendar sharing (iCal feed) | Low | 2-3 days |
| Read audit logging | Low | 1-2 days |
