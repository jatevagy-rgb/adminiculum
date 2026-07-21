# Calendar Risk Register

Date: 2026-07-21

## Risk matrix

| ID | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | Recurrence expansion produces incorrect occurrences after DST transition | Medium | High | Store recurrenceTimezone; expand in local time, convert to UTC; test with CET↔CEST boundaries specifically | Backend dev |
| R2 | Unified projection query becomes slow as Task/Case volume grows | Low | Medium | Partial indexes on CalendarEvent; existing Task/Case indexes adequate for current scale; monitor query time; add caching in Phase 2 | Backend dev |
| R3 | Optimistic concurrency causes frequent 409s for shared events | Low | Low | Calendar events are low-contention; UI shows clear conflict message with refresh action; acceptable UX for law office scale | Frontend dev |
| R4 | Private event placeholder leaks timing information | Medium | Medium | Acknowledged trade-off: time is visible for availability, all other fields hidden; document in security review; accepted for MVP | Product owner |
| R5 | Existing agenda endpoint and new calendar endpoint diverge in behavior | Medium | High | Clear documentation of coexistence; existing endpoint unchanged; new endpoint is additive; eventual migration path documented | Backend dev |
| R6 | RRULE parsing library introduces supply chain risk | Low | High | Use well-established library (rrule.js or equivalent); pin exact version; audit dependencies | Backend dev |
| R7 | All-day event end-exclusive semantics confuse users | Medium | Low | Frontend displays "Aug 15–17" for startDate 15, endDate 18; user never sees exclusive end; clear documentation for API consumers | Frontend dev |
| R8 | CalendarAuditLog table grows unbounded | Low | Low | 5-year retention with automated cleanup; typical law office generates <10K audit entries/year; negligible storage impact | Ops |
| R9 | Frontend calendar view performance with many overlapping events | Low | Medium | Limit visible items per cell ("+N more" pattern); week view caps overlapping columns at 3; lazy-load detail on click | Frontend dev |
| R10 | Migration rollback needed after data has been created | Low | High | CalendarEvent tables are additive — rollback drops tables without affecting existing data; audit logs preserved separately if needed | Backend dev |
| R11 | Outlook integration in Phase 2 requires model changes that break MVP contracts | Low | Medium | MVP model includes no external sync fields; Phase 2 adds columns (additive migration); API contract remains backward-compatible via optional fields | Architect |
| R12 | Authorization matrix has gaps for edge-case role combinations | Medium | High | Comprehensive matrix documented in calendar-authorization-and-visibility.md; test each role × visibility combination; capability-based frontend prevents unauthorized actions | Backend dev |
| R13 | Task.dueDate reschedule from calendar bypasses task workflow validation | Low | High | Write-back calls existing rescheduleTaskDueDate which includes full validation (status checks, authorization); no new code path | Backend dev |
| R14 | Recurrence exception accumulation degrades query performance | Low | Low | Exceptions are standard CalendarEvent rows with seriesId set; indexed; max 200 per series; well within performance budget | Backend dev |
| R15 | User creates CalendarEvent duplicating a Task deadline, causing confusion | Medium | Medium | By design: no deduplication; visual distinction (different icons/badges) makes source clear; documented in unified-projection.md | Product owner |

## Open questions

| ID | Question | Status | Deadline | Decision |
|---|---|---|---|---|
| Q1 | Should the Dashboard 7-day strip be migrated to the unified projection API in MVP? | Decided | — | No. Phase 2. Existing agenda API continues serving the strip. |
| Q2 | Should review deadlines (TaskReviewDecision.correctionDeadline) be projected? | Decided | — | No. Phase 2. Review lifecycle is too complex for initial projection. |
| Q3 | Should participants receive in-app notifications when added to an event? | Decided | — | Deferred. Notification system for calendar events is Phase 2. |
| Q4 | Maximum recurrence series duration? | Decided | — | 2 years from creation. System-imposed boundary. |
| Q5 | Should EXTERNAL_REVIEWER and CLIENT roles see any calendar data? | Decided | — | No calendar access for CLIENT. EXTERNAL_REVIEWER sees only CASE_TEAM events on their assigned cases. |
| Q6 | Should the calendar support file attachments on events? | Open | Before Slice 2 | Leaning No for MVP. Events can link to cases which have document management. |
| Q7 | Should cancelled events be hidden or shown with strikethrough? | Decided | — | Shown with strikethrough and CANCELLED badge. Filterable via includeCancelled parameter. |
