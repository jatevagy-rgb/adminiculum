# Calendar Outlook and External Calendar Future Boundary

Date: 2026-07-21

## Current state

The Adminiculum application does **not** currently integrate with Microsoft Outlook, Microsoft Graph API, or any external calendar provider. Authentication uses Microsoft Entra ID (Azure AD) via MSAL, but only for identity — no Graph API scopes are requested.

## Outlook integration scope

Outlook/Graph integration is explicitly **out of scope** for the calendar MVP. This document defines the boundary so that the MVP data model does not block future integration.

## What Outlook integration would require

### Microsoft Graph Calendar API

- Scope: `Calendars.ReadWrite` or `Calendars.Read` on the user's Microsoft 365 mailbox
- Endpoint: `GET /me/calendarView`, `POST /me/events`, etc.
- Authentication: delegated (user-level) or application (daemon-level) permissions via the existing Entra ID app registration

### Sync model options

| Approach | Description | Complexity | Latency |
|---|---|---|---|
| Pull sync | Periodic polling of Graph delta endpoints | Medium | Minutes |
| Push sync (webhooks) | Graph subscription notifications | High | Seconds |
| One-way export | Push Adminiculum events to Outlook | Medium | On-change |
| Two-way sync | Full bidirectional merge | Very high | Varies |

**Recommended Phase 2 approach:** One-way export (Adminiculum → Outlook) first, then pull sync (Outlook → Adminiculum) second.

### Data mapping

| Adminiculum field | Graph Event field |
|---|---|
| title | subject |
| description | body.content |
| startAt | start.dateTime + start.timeZone |
| endAt | end.dateTime + end.timeZone |
| allDay (startDate/endDate) | isAllDay + start.dateTime/end.dateTime |
| location | location.displayName |
| onlineMeetingUrl | onlineMeeting.joinUrl |
| recurrenceRule (RRULE) | recurrence.pattern + recurrence.range |
| status CANCELLED | isCancelled |
| visibility | sensitivity (normal/personal/private/confidential) |
| availability | showAs (free/tentative/busy/oof/workingElsewhere/unknown) |
| participants | attendees[] |

### RRULE ↔ Graph recurrence mapping

Graph uses a structured recurrence object, not RRULE strings. Conversion is needed:

- `FREQ=WEEKLY;BYDAY=MO,WE,FR` → `{ pattern: { type: "weekly", daysOfWeek: ["monday","wednesday","friday"], interval: 1 } }`
- `FREQ=MONTHLY;BYMONTHDAY=15` → `{ pattern: { type: "absoluteMonthly", dayOfMonth: 15, interval: 1 } }`
- The MVP stores RRULE strings because they are more expressive than Graph's pattern object. Conversion is straightforward for common patterns.

## MVP model compatibility

The CalendarEvent model is designed to not block Outlook integration:

### Fields already compatible

- `externalId` (String?, deferred) — reserved for storing the Graph event ID when sync is enabled
- `externalSource` (String?, deferred) — reserved for `"outlook"`, `"google"`, etc.
- `externalSyncedAt` (DateTime?, deferred) — last sync timestamp
- `onlineMeetingUrl` — already in the model, maps to Teams meeting URLs
- `timezone` — already stored, needed for Graph start/end timezone
- `recurrenceRule` as RRULE — convertible to/from Graph pattern

### Fields that will need addition in Phase 2

| Field | Purpose |
|---|---|
| `externalId` | Graph event ID |
| `externalSource` | Source identifier (outlook, google) |
| `externalSyncedAt` | Last successful sync timestamp |
| `externalChangeKey` | Graph changeKey for delta sync |
| `syncDirection` | INBOUND, OUTBOUND, BIDIRECTIONAL |

These fields are intentionally NOT included in the MVP schema. They will be added in a dedicated migration when Outlook integration begins.

## Boundary rules for MVP implementation

1. **Do NOT** request Graph API scopes in the Entra ID app registration
2. **Do NOT** add `@microsoft/microsoft-graph-client` or Graph SDK packages
3. **Do NOT** add external calendar sync fields to the CalendarEvent model
4. **Do NOT** create webhook subscription infrastructure
5. **Do NOT** add "Sync with Outlook" UI elements
6. **Do** use RRULE format (convertible to Graph pattern later)
7. **Do** use IANA timezone identifiers (compatible with Graph timeZone)
8. **Do** use ISO 8601 date/time format (compatible with Graph dateTime)
9. **Do** store `onlineMeetingUrl` as a plain URL field (can hold Teams URLs later)
10. **Do** keep the participant model simple (userId-based, can map to Graph attendees later)

## Risk: Calendar event ownership conflict

If bidirectional sync is ever enabled, an event created in Outlook and synced to Adminiculum raises ownership questions:
- Who is the "creator" in Adminiculum? The sync process or the Outlook user?
- Can the event be edited in Adminiculum, or is it read-only (source-of-truth in Outlook)?
- What happens if both sides edit simultaneously?

**Deferred decision:** These questions will be resolved when Outlook sync design begins. The MVP model's `createdById` field assumes Adminiculum-native events only.
