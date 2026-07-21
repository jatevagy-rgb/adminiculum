# Calendar Domain Boundaries

Date: 2026-07-21

## Task

**Definition:** Work that someone must perform. Has an assignee, a lifecycle (pending → in progress → completed), and optionally a due date.

**Examples:**
- Draft a submission
- Review a contract
- Call a client
- Upload a document
- Prepare a court filing

**Authoritative model:** `Task`

**Calendar role:** Task.dueDate is projected into calendar views as a read-only deadline marker. The Task itself is not a calendar event. A task may eventually have associated scheduled work blocks (CalendarEvent of type SCHEDULED_WORK), but the task's dueDate remains the authoritative deadline.

**Not a calendar event because:** A task represents work to do, not a time-bound occurrence. "Review contract by Friday" is a task with a deadline, not a meeting.

## Calendar Event

**Definition:** A scheduled occurrence with a defined time boundary (start/end or all-day date). Represents something that happens at a specific time, not work to be performed.

**Examples:**
- Client meeting at 10:00–11:00
- Court hearing on 2026-08-15 at 09:00
- Authority appointment
- Internal team meeting
- Office closure (all-day)
- Personal leave (all-day, multi-day)
- Filing deadline (all-day, date-only legal deadline)
- Focus time block

**Authoritative model:** `CalendarEvent` (new, to be created)

**Calendar role:** Primary content of the calendar. Owns its own start/end time, participants, location, visibility, and recurrence.

## Deadline

**Definition:** A legal or operational due point. A moment by which something must be completed or filed.

**Source-of-truth rule:**

1. **Task work deadlines** are authoritative in `Task.dueDate`. Calendar views project them. Editing a projected task deadline in the calendar must write back to `Task.dueDate`, never to a separate CalendarEvent row.

2. **Case-level legal deadlines** are authoritative in `Case.deadline`. Calendar views project them. Editing must write back to `Case.deadline`.

3. **Standalone legal deadlines** (filing dates, statute-of-limitations dates, court-ordered deadlines not attached to a specific task) are authoritative as `CalendarEvent` records of type `LEGAL_DEADLINE` or `FILING`. These are date-bound calendar events, not tasks.

4. **The system must never silently create two independently editable due dates for the same concept.** A task's deadline appears once in the calendar, sourced from Task.dueDate. It is not duplicated as a CalendarEvent row.

**Decision:** ACCEPTED. This three-source principle is the authoritative rule.

## Reminder

**Definition:** A notification preference attached to a calendar event or deadline. Not a business event itself.

**Examples:**
- "Remind me 30 minutes before the hearing"
- "Remind me 1 day before the filing deadline"

**Model:** `CalendarEventReminder` (future, per-user offset from event start/due)

**Not a calendar event because:** A reminder is a notification trigger, not something that appears in the calendar grid.

**Initial scope:** Deferred. No reminder scheduler exists. The reminder model can be defined but the scheduler is Phase 2.

## Availability Block

**Definition:** A calendar occurrence that marks time as busy/unavailable. May not relate to any case.

**Examples:**
- Personal leave / vacation
- Focus time
- Office closure
- Unavailable block

**Model:** `CalendarEvent` with specific event types (LEAVE, FOCUS_TIME, OFFICE_EVENT)

**Initial scope:** LEAVE and OFFICE_EVENT are in MVP scope. FOCUS_TIME is Phase 2.

## Boundaries summary

| Concept | Model | Editable in calendar? | Calendar display |
|---|---|---|---|
| Task work | Task | Due date only (write-back) | Projected deadline marker |
| Case deadline | Case | Write-back to Case.deadline | Projected deadline marker |
| Standalone legal deadline | CalendarEvent | Yes, directly | Calendar event |
| Client meeting | CalendarEvent | Yes, directly | Calendar event |
| Court hearing | CalendarEvent | Yes, directly | Calendar event |
| Internal meeting | CalendarEvent | Yes, directly | Calendar event |
| Leave | CalendarEvent | Yes, directly | Calendar event |
| Office closure | CalendarEvent | Yes, directly | Calendar event |
| Reminder | CalendarEventReminder | Per-user setting | Not displayed in grid |
| Task itself | Task | Via task UI | Not in calendar |
