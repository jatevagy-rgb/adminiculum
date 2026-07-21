# Calendar Authorization and Visibility

Date: 2026-07-21

## Visibility enum

| Level | Meaning | Who sees full details | Who sees busy placeholder |
|---|---|---|---|
| `OFFICE` | Visible to all authenticated internal users | All internal users | N/A (already visible) |
| `CASE_TEAM` | Visible to case team members only | Case assignedLawyer, createdBy, collaborators + ADMIN/PARTNER | Other internal users see "Foglalt" |
| `PARTICIPANTS` | Visible to event participants only | Event creator, responsible, participants + ADMIN/PARTNER | Other internal users see "Foglalt" |
| `PRIVATE` | Visible only to creator | Event creator + ADMIN | Other users see "Foglalt" |

### Default visibility per event type

| Event type | Default visibility |
|---|---|
| COURT_HEARING | CASE_TEAM |
| AUTHORITY_APPOINTMENT | CASE_TEAM |
| CLIENT_MEETING | CASE_TEAM |
| INTERNAL_MEETING | OFFICE |
| LEGAL_DEADLINE | CASE_TEAM |
| FILING | CASE_TEAM |
| DOCUMENT_SIGNING | CASE_TEAM |
| OFFICE_EVENT | OFFICE |
| LEAVE | OFFICE |
| OTHER | PARTICIPANTS |

## Authorization matrix

### Read

| Actor | OFFICE events | CASE_TEAM events | PARTICIPANTS events | PRIVATE events |
|---|---|---|---|---|
| ADMIN | Full details | Full details | Full details | Full details |
| PARTNER | Full details | Full details (all cases) | Full details if participant | Busy placeholder only |
| LAWYER | Full details | Full details if on case team | Full details if participant | Busy placeholder only |
| COLLAB_LAWYER | Full details | Full details if on case team | Full details if participant | Busy placeholder only |
| TRAINEE | Full details | Full details if on case team | Full details if participant | Busy placeholder only |
| LEGAL_ASSISTANT | Full details | Full details if on case team | Full details if participant | Busy placeholder only |
| EXTERNAL_REVIEWER | Not visible | Full details if on case team | Full details if participant | Not visible |
| CLIENT | Not visible | Not visible | Not visible | Not visible |

### Create

| Actor | Own personal | Office-wide | Case event | Another user's event | Legal deadline | Leave |
|---|---|---|---|---|---|---|
| ADMIN | Yes | Yes | Yes (any case) | Yes | Yes (any case) | Yes (any user) |
| PARTNER | Yes | Yes | Yes (any case) | Yes (subordinates) | Yes (any case) | Yes (own only) |
| LAWYER | Yes | No | Yes (own cases) | No | Yes (own cases) | Yes (own only) |
| COLLAB_LAWYER | Yes | No | Yes (assigned cases) | No | No | Yes (own only) |
| TRAINEE | Yes | No | Yes (assigned cases) | No | No | Yes (own only) |
| LEGAL_ASSISTANT | Yes | No | No | No | No | Yes (own only) |

### Update

| Actor | Condition |
|---|---|
| Event creator | Always (own events) |
| Responsible user | If `responsibleUserId` matches |
| ADMIN | Always |
| PARTNER | Always for case events; own events; subordinate events |
| Case assignedLawyer | If event is on their case |
| Participant with ORGANIZER role | Always for that event |
| Other participant | No |
| Case collaborator | No (read-only for events on collaborated cases) |

### Delete/Cancel

| Actor | Can cancel? | Can hard-delete? |
|---|---|---|
| Event creator | Yes | No (soft delete only) |
| ADMIN | Yes | Yes (administrative) |
| PARTNER | Yes (case events, subordinate events) | No |
| Responsible user | Yes | No |
| Case assignedLawyer | Yes (case events) | No |
| Others | No | No |

Series operations:
- Cancel single occurrence: same rules as cancel
- Cancel "this and following": same rules as cancel, applied to series modification
- Cancel entire series: only creator, ADMIN, or case assignedLawyer

## Private event ("Foglalt") behavior

When a user does not have full-details access to an event, the calendar API returns a **busy placeholder**:

```json
{
  "id": "placeholder:{eventId}",
  "sourceType": "CALENDAR_EVENT",
  "title": "Foglalt",
  "eventType": null,
  "startAt": "2026-08-15T08:00:00.000Z",
  "endAt": "2026-08-15T09:00:00.000Z",
  "allDay": false,
  "status": "CONFIRMED",
  "availability": "BUSY",
  "case": null,
  "client": null,
  "clientColorKey": null,
  "responsibleUser": null,
  "participants": [],
  "visibility": "PRIVATE",
  "location": null,
  "description": null,
  "canEdit": false,
  "canDelete": false,
  "isPlaceholder": true
}
```

Rules:
- Title: always "Foglalt" (busy)
- Event type: hidden
- Case: hidden
- Client: hidden
- Client color: hidden
- Location: hidden
- Description: hidden
- Participants: hidden
- Responsible user: hidden
- Time: visible (needed for availability display)
- All-day: visible
- `isPlaceholder: true` so the frontend can render it differently

## Sensitive content separation

Calendar list DTOs never include `description`. The description is fetched only on event detail requests (`GET /api/v1/calendar/events/:id`), which apply the full authorization check.

This prevents accidental exposure of confidential legal notes in month-view grid cells.

## Case team membership

For CASE_TEAM visibility, "case team" means:
- `Case.assignedLawyerId` matches the user
- `Case.createdById` matches the user
- A `CaseCollaborator` record exists for the user on that case

This reuses the existing `getAccessibleCases` pattern from the case authorization module.
