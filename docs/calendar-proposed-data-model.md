# Calendar Proposed Data Model

Date: 2026-07-21

## Proposed Prisma schema (not applied)

```prisma
enum CalendarEventType {
  COURT_HEARING
  AUTHORITY_APPOINTMENT
  CLIENT_MEETING
  INTERNAL_MEETING
  LEGAL_DEADLINE
  FILING
  DOCUMENT_SIGNING
  OFFICE_EVENT
  LEAVE
  OTHER
}

enum CalendarEventVisibility {
  OFFICE
  CASE_TEAM
  PARTICIPANTS
  PRIVATE
}

enum CalendarEventStatus {
  CONFIRMED
  TENTATIVE
  CANCELLED
}

enum CalendarAvailability {
  BUSY
  FREE
  TENTATIVE
  OUT_OF_OFFICE
}

enum CalendarParticipantRole {
  ORGANIZER
  REQUIRED
  OPTIONAL
}

enum CalendarParticipantResponse {
  ACCEPTED
  DECLINED
  TENTATIVE
  PENDING
}

model CalendarEvent {
  id                  String                    @id @default(uuid())
  title               String
  description         String?
  eventType           CalendarEventType
  status              CalendarEventStatus       @default(CONFIRMED)
  visibility          CalendarEventVisibility   @default(OFFICE)
  availability        CalendarAvailability      @default(BUSY)

  // Time fields
  startAt             DateTime?
  endAt               DateTime?
  allDay              Boolean                   @default(false)
  startDate           String?                   // YYYY-MM-DD for all-day events
  endDate             String?                   // YYYY-MM-DD exclusive end for all-day
  timezone            String?                   // IANA timezone of originating user

  // Location
  location            String?
  onlineMeetingUrl    String?

  // Relations
  caseId              String?
  case                Case?                     @relation(fields: [caseId], references: [id])
  responsibleUserId   String?
  responsibleUser     User?                     @relation("CalendarEventResponsible", fields: [responsibleUserId], references: [id])
  createdById         String
  createdBy           User                      @relation("CalendarEventCreatedBy", fields: [createdById], references: [id])

  // Recurrence
  recurrenceRule      String?                   // RFC5545 RRULE string
  recurrenceTimezone  String?                   // IANA timezone for recurrence expansion
  recurrenceEndAt     DateTime?                 // Hard end boundary for recurrence
  seriesId            String?                   // Points to the original series event
  seriesEvent         CalendarEvent?            @relation("CalendarSeries", fields: [seriesId], references: [id])
  seriesOccurrences   CalendarEvent[]           @relation("CalendarSeries")
  originalStartAt     DateTime?                 // Original occurrence start (for exceptions)
  isSeriesException   Boolean                   @default(false)
  isCancelled         Boolean                   @default(false) // For cancelled single occurrences

  // External sync (future)
  externalProvider    String?                   // e.g. "microsoft_graph"
  externalId          String?
  externalVersion     String?
  lastExternalSyncAt  DateTime?

  // Metadata
  version             Int                       @default(1)
  createdAt           DateTime                  @default(now())
  updatedAt           DateTime                  @updatedAt
  deletedAt           DateTime?

  // Related
  participants        CalendarEventParticipant[]

  @@index([startAt, endAt])
  @@index([startDate, endDate])
  @@index([caseId])
  @@index([responsibleUserId])
  @@index([createdById])
  @@index([seriesId])
  @@index([eventType])
  @@index([deletedAt])
  @@index([externalProvider, externalId])
}

model CalendarEventParticipant {
  id              String                      @id @default(uuid())
  eventId         String
  event           CalendarEvent               @relation(fields: [eventId], references: [id], onDelete: Cascade)
  userId          String
  user            User                        @relation(fields: [userId], references: [id])
  role            CalendarParticipantRole      @default(REQUIRED)
  response        CalendarParticipantResponse  @default(PENDING)
  createdAt       DateTime                    @default(now())
  updatedAt       DateTime                    @updatedAt

  @@unique([eventId, userId])
  @@index([userId])
}
```

## Field decisions

### Accepted fields

| Field | Rationale |
|---|---|
| `title` | Required. Every event needs a display name. |
| `description` | Optional. Free-text notes. Excluded from list DTOs for performance and privacy. |
| `eventType` | Required. Controlled taxonomy. Drives defaults and authorization. |
| `status` | Required. CONFIRMED/TENTATIVE/CANCELLED. Matches standard calendar semantics. |
| `visibility` | Required. Controls who can see event details. Default per event type. |
| `availability` | Required. Marks time as BUSY/FREE/TENTATIVE/OUT_OF_OFFICE for future availability views. |
| `startAt/endAt` | Timed events. UTC timestamps. Required for non-all-day events. |
| `allDay` | Boolean. When true, startDate/endDate are used instead of startAt/endAt. |
| `startDate/endDate` | String YYYY-MM-DD. Used only for all-day events. endDate is exclusive (matches iCalendar DTEND semantics). |
| `timezone` | IANA timezone string. Stored for display and recurrence expansion. |
| `location` | Optional free text. |
| `onlineMeetingUrl` | Optional URL. See deferred fields discussion. |
| `caseId` | Optional. Links to Case for case-related events. Client color derived via Case → Client. |
| `responsibleUserId` | Optional. The lawyer/user responsible for this event. |
| `createdById` | Required. Audit trail. |
| `recurrenceRule` | RFC5545 RRULE string. See recurrence contract. |
| `recurrenceTimezone` | IANA timezone for recurrence expansion. |
| `recurrenceEndAt` | Hard boundary for recurrence to prevent infinite expansion. |
| `seriesId` | Points to the original series event for exceptions/modified occurrences. |
| `originalStartAt` | The original occurrence start time before modification. Used to identify which occurrence was edited. |
| `isSeriesException` | Marks this record as an exception to a recurring series. |
| `isCancelled` | Marks a single occurrence as cancelled without deleting the record. |
| `externalProvider/externalId/externalVersion/lastExternalSyncAt` | Future Graph integration fields. Nullable, not used in MVP. |
| `version` | Integer for optimistic concurrency. |
| `deletedAt` | Soft delete. Business events should not be hard-deleted. |

### Deferred fields

| Field | Reason for deferral |
|---|---|
| `onlineMeetingUrl` | **Included but optional.** Could be deferred, but the field is trivial (nullable String) and avoids a future schema migration. Cost of inclusion is near zero. |
| `CalendarEventReminder` model | Reminder scheduling requires background job infrastructure that does not exist. The model shape is defined in this audit but the table is deferred to Phase 2 migration. |
| `CalendarExternalLink` model | Full external sync metadata. Deferred until Graph integration. The core CalendarEvent external fields suffice for basic import tracking. |
| Direct `clientId` | See case-and-client relation section. Not included; client derived via caseId → Case → Client. |

### Rejected fields

| Field | Reason for rejection |
|---|---|
| `clientId` on CalendarEvent | Client is always derived via Case. Adding a direct clientId creates ambiguity when caseId is also set. Client-only meetings (no case) are rare enough to handle via a "general matters" case pattern rather than a separate relation. |
| `priority` on CalendarEvent | Events have times, not priorities. Urgency is derived from proximity to start time. Priority belongs on tasks, not calendar events. |
| `reminderOffset` on CalendarEvent | Reminders are per-user preferences, not event-level fields. Belongs in CalendarEventReminder. |
| `color` on CalendarEvent | Color is derived from event type and client accent, not stored per-event. No arbitrary CSS values. |
| `attendeeEmails` | External attendee emails are a privacy concern. Deferred to Graph integration where external attendees are managed via the Graph API, not stored locally. |

## Soft delete

**Decision: Yes.** CalendarEvent uses `deletedAt` for soft delete.

**Rationale:** Legal events (hearings, filings, deadlines) should retain audit history. Hard deletion loses the record of when a hearing was scheduled and later cancelled. Soft-deleted records are excluded from calendar queries via `WHERE deletedAt IS NULL` but remain available for audit.

**Exception:** True deletion (hard delete) may be needed for GDPR data-subject requests. This is handled as an administrative operation, not a user-facing feature.
