# Calendar Event Type Taxonomy

Date: 2026-07-21

## Approved enum: `CalendarEventType`

| Type | Hungarian label | Business meaning | Case required? | Task relation? | All-day? | Recurrence? | Default visibility | Default reminder | Workflow color | Client color? | Blocks availability? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| COURT_HEARING | Tárgyalás | Court hearing or oral proceeding | Yes | No | No | No | CASE_TEAM | 1 day + 1 hour | `--adm-terracotta-700` | Yes (via case) | Yes |
| AUTHORITY_APPOINTMENT | Hatósági tárgyalás | Appointment at authority/regulator | Yes | No | No | No | CASE_TEAM | 1 day + 1 hour | `--adm-terracotta-600` | Yes (via case) | Yes |
| CLIENT_MEETING | Ügyféltalálkozó | Meeting with client | Yes | No | No | Yes | CASE_TEAM | 1 day + 30 min | `--adm-green-700` | Yes (via case) | Yes |
| INTERNAL_MEETING | Belső megbeszélés | Internal office meeting | No | No | No | Yes | OFFICE | 30 min | `--adm-blue-700` | No | Yes |
| LEGAL_DEADLINE | Jogi határidő | Standalone legal/statutory deadline | Yes | Optional | Yes | No | CASE_TEAM | 2 days + 1 day | `--adm-terracotta-700` | Yes (via case) | No |
| FILING | Beadvány benyújtása | Court/authority filing deadline | Yes | Optional | Yes | No | CASE_TEAM | 2 days + 1 day | `--adm-terracotta-700` | Yes (via case) | No |
| DOCUMENT_SIGNING | Irat aláírása | Document signing ceremony | Yes | No | No | No | CASE_TEAM | 1 day + 1 hour | `--adm-ochre-600` | Yes (via case) | Yes |
| OFFICE_EVENT | Irodai esemény | Office-wide event or closure | No | No | Yes | Yes | OFFICE | 1 day | `--adm-blue-600` | No | Configurable |
| LEAVE | Szabadság | Personal leave / vacation | No | No | Yes | No | OFFICE | None | `--adm-sand-400` | No | Yes |
| OTHER | Egyéb | Uncategorized event | No | No | Configurable | Yes | PARTICIPANTS | 30 min | `--adm-text-muted` | Optional | Configurable |

## Rejected alternatives

### COUNTERPARTY_MEETING
**Rejected.** A meeting with an opposing party is a CLIENT_MEETING or COURT_HEARING depending on context. Creating a separate type for every meeting counterpart would proliferate the taxonomy without adding value. The event description and participant list carry this context.

### PHONE_CALL
**Rejected.** A phone call is either a CLIENT_MEETING (if scheduled with a client), INTERNAL_MEETING (if internal), or simply a task. Scheduled calls use the appropriate meeting type. Unscheduled calls are not calendar events.

### FOCUS_TIME
**Deferred to Phase 2.** Requires personal calendar filtering UI that is not in MVP scope. The concept is valid but premature.

### TASK_DEADLINE
**Rejected as a CalendarEvent type.** Task deadlines are projected from Task.dueDate, not stored as CalendarEvent records. Creating a TASK_DEADLINE event type would violate the source-of-truth rule and risk duplication. Task deadlines appear in calendar views via the unified projection API, not as CalendarEvent rows.

### REMINDER
**Rejected.** A reminder is not an event type — it is a notification preference attached to an event. Reminders belong in CalendarEventReminder, not CalendarEvent.

## Notes

- **Case requirement:** Types marked "Case required?" = Yes must have a non-null `caseId`. This ensures legal events maintain proper case context and client color projection.
- **Client color projection:** Always derived via `Case → Client → ClientColorKey`. Never stored directly on CalendarEvent.
- **Workflow color:** The event-type color token. Used as the primary fill/tint in calendar views. Client color appears as a narrow accent (border or dot), not as the primary fill.
- **Default reminder:** Specifies the default reminder offset(s) when creating an event of this type. Users can override per-event. The reminder scheduler is deferred.
- **Availability:** "Blocks availability" determines whether the event marks the participant's time as busy in future availability views.
