# Calendar Migration Design

Date: 2026-07-21

## Overview

This document specifies the database migration plan for introducing the calendar feature. All schema snippets here are **documentation only** — no actual migration files are created by this audit.

## Migration sequence

The calendar feature requires **two sequential migrations** to maintain a clean dependency chain.

### Migration 1: Core calendar tables

**Name:** `YYYYMMDDHHMMSS_add_calendar_event`

Creates the CalendarEvent table, CalendarEventParticipant table, and all associated enums.

```sql
-- Enums
CREATE TYPE "CalendarEventType" AS ENUM (
  'COURT_HEARING',
  'AUTHORITY_APPOINTMENT',
  'CLIENT_MEETING',
  'INTERNAL_MEETING',
  'LEGAL_DEADLINE',
  'FILING',
  'DOCUMENT_SIGNING',
  'OFFICE_EVENT',
  'LEAVE',
  'OTHER'
);

CREATE TYPE "CalendarEventStatus" AS ENUM (
  'CONFIRMED',
  'TENTATIVE',
  'CANCELLED'
);

CREATE TYPE "CalendarEventVisibility" AS ENUM (
  'OFFICE',
  'CASE_TEAM',
  'PARTICIPANTS',
  'PRIVATE'
);

CREATE TYPE "CalendarAvailability" AS ENUM (
  'FREE',
  'TENTATIVE',
  'BUSY',
  'OUT_OF_OFFICE'
);

CREATE TYPE "CalendarParticipantRole" AS ENUM (
  'ORGANIZER',
  'REQUIRED',
  'OPTIONAL',
  'OBSERVER'
);

CREATE TYPE "CalendarAuditAction" AS ENUM (
  'CREATED',
  'UPDATED',
  'CANCELLED',
  'DELETED',
  'RESTORED',
  'PARTICIPANT_ADDED',
  'PARTICIPANT_REMOVED',
  'RECURRENCE_EXCEPTION_CREATED',
  'SERIES_SPLIT',
  'SERIES_TERMINATED'
);

-- CalendarEvent table
CREATE TABLE "CalendarEvent" (
  "id"                  TEXT NOT NULL DEFAULT gen_random_uuid(),
  "title"               TEXT NOT NULL,
  "description"         TEXT,
  "eventType"           "CalendarEventType" NOT NULL,
  "status"              "CalendarEventStatus" NOT NULL DEFAULT 'CONFIRMED',
  "visibility"          "CalendarEventVisibility" NOT NULL DEFAULT 'OFFICE',
  "availability"        "CalendarAvailability" NOT NULL DEFAULT 'BUSY',
  "allDay"              BOOLEAN NOT NULL DEFAULT false,
  "startAt"             TIMESTAMPTZ,
  "endAt"               TIMESTAMPTZ,
  "startDate"           TEXT,
  "endDate"             TEXT,
  "timezone"            TEXT,
  "location"            TEXT,
  "onlineMeetingUrl"    TEXT,
  "isRecurring"         BOOLEAN NOT NULL DEFAULT false,
  "recurrenceRule"      TEXT,
  "recurrenceTimezone"  TEXT,
  "recurrenceEndAt"     TIMESTAMPTZ,
  "seriesId"            TEXT,
  "originalStartAt"     TIMESTAMPTZ,
  "caseId"              TEXT,
  "responsibleUserId"   TEXT,
  "createdById"         TEXT NOT NULL,
  "version"             INTEGER NOT NULL DEFAULT 1,
  "idempotencyKey"      TEXT,
  "deletedAt"           TIMESTAMPTZ,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CalendarEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL,
  CONSTRAINT "CalendarEvent_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "CalendarEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "CalendarEvent_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL
);

-- Indexes
CREATE INDEX "CalendarEvent_startAt_endAt_idx" ON "CalendarEvent" ("startAt", "endAt") WHERE "deletedAt" IS NULL;
CREATE INDEX "CalendarEvent_startDate_endDate_idx" ON "CalendarEvent" ("startDate", "endDate") WHERE "deletedAt" IS NULL AND "allDay" = true;
CREATE INDEX "CalendarEvent_caseId_idx" ON "CalendarEvent" ("caseId") WHERE "deletedAt" IS NULL;
CREATE INDEX "CalendarEvent_responsibleUserId_idx" ON "CalendarEvent" ("responsibleUserId") WHERE "deletedAt" IS NULL;
CREATE INDEX "CalendarEvent_createdById_idx" ON "CalendarEvent" ("createdById") WHERE "deletedAt" IS NULL;
CREATE INDEX "CalendarEvent_seriesId_idx" ON "CalendarEvent" ("seriesId") WHERE "seriesId" IS NOT NULL;
CREATE INDEX "CalendarEvent_eventType_idx" ON "CalendarEvent" ("eventType") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "CalendarEvent_idempotencyKey_key" ON "CalendarEvent" ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;

-- CalendarEventParticipant table
CREATE TABLE "CalendarEventParticipant" (
  "id"        TEXT NOT NULL DEFAULT gen_random_uuid(),
  "eventId"   TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "role"      "CalendarParticipantRole" NOT NULL DEFAULT 'REQUIRED',
  "addedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "CalendarEventParticipant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CalendarEventParticipant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE,
  CONSTRAINT "CalendarEventParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "CalendarEventParticipant_eventId_userId_key" UNIQUE ("eventId", "userId")
);

CREATE INDEX "CalendarEventParticipant_userId_idx" ON "CalendarEventParticipant" ("userId");

-- CalendarAuditLog table
CREATE TABLE "CalendarAuditLog" (
  "id"            TEXT NOT NULL DEFAULT gen_random_uuid(),
  "eventId"       TEXT NOT NULL,
  "action"        "CalendarAuditAction" NOT NULL,
  "actorId"       TEXT NOT NULL,
  "timestamp"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "fieldChanges"  JSONB,
  "metadata"      JSONB,

  CONSTRAINT "CalendarAuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CalendarAuditLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE RESTRICT,
  CONSTRAINT "CalendarAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT
);

CREATE INDEX "CalendarAuditLog_eventId_timestamp_idx" ON "CalendarAuditLog" ("eventId", "timestamp");
CREATE INDEX "CalendarAuditLog_actorId_timestamp_idx" ON "CalendarAuditLog" ("actorId", "timestamp");
```

### Migration 2: User timezone (optional, Phase 2)

**Name:** `YYYYMMDDHHMMSS_add_user_timezone`

```sql
ALTER TABLE "User" ADD COLUMN "timezone" TEXT DEFAULT 'Europe/Budapest';
```

This migration is deferred to Phase 2 when per-user timezone support is implemented. The MVP uses the application-wide timezone.

## Prisma schema additions

The following Prisma model definitions correspond to Migration 1. These are **documentation only** — the actual `schema.prisma` file is not modified by this audit.

```prisma
model CalendarEvent {
  id                  String                     @id @default(uuid())
  title               String
  description         String?
  eventType           CalendarEventType
  status              CalendarEventStatus        @default(CONFIRMED)
  visibility          CalendarEventVisibility    @default(OFFICE)
  availability        CalendarAvailability       @default(BUSY)
  allDay              Boolean                    @default(false)
  startAt             DateTime?
  endAt               DateTime?
  startDate           String?
  endDate             String?
  timezone            String?
  location            String?
  onlineMeetingUrl    String?
  isRecurring         Boolean                    @default(false)
  recurrenceRule      String?
  recurrenceTimezone  String?
  recurrenceEndAt     DateTime?
  seriesId            String?
  originalStartAt     DateTime?
  caseId              String?
  responsibleUserId   String?
  createdById         String
  version             Int                        @default(1)
  idempotencyKey      String?                    @unique
  deletedAt           DateTime?
  createdAt           DateTime                   @default(now())
  updatedAt           DateTime                   @updatedAt

  case                Case?                      @relation(fields: [caseId], references: [id])
  responsibleUser     User?                      @relation("CalendarEventResponsible", fields: [responsibleUserId], references: [id])
  createdBy           User                       @relation("CalendarEventCreatedBy", fields: [createdById], references: [id])
  series              CalendarEvent?             @relation("CalendarEventSeries", fields: [seriesId], references: [id])
  exceptions          CalendarEvent[]            @relation("CalendarEventSeries")
  participants        CalendarEventParticipant[]
  auditLogs           CalendarAuditLog[]

  @@index([startAt, endAt])
  @@index([startDate, endDate])
  @@index([caseId])
  @@index([responsibleUserId])
  @@index([createdById])
  @@index([seriesId])
  @@index([eventType])
}

model CalendarEventParticipant {
  id       String                  @id @default(uuid())
  eventId  String
  userId   String
  role     CalendarParticipantRole @default(REQUIRED)
  addedAt  DateTime               @default(now())

  event    CalendarEvent           @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user     User                    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([eventId, userId])
  @@index([userId])
}

model CalendarAuditLog {
  id           String              @id @default(uuid())
  eventId      String
  action       CalendarAuditAction
  actorId      String
  timestamp    DateTime            @default(now())
  fieldChanges Json?
  metadata     Json?

  event        CalendarEvent       @relation(fields: [eventId], references: [id])
  actor        User                @relation("CalendarAuditActor", fields: [actorId], references: [id])

  @@index([eventId, timestamp])
  @@index([actorId, timestamp])
}
```

## Existing model additions (relations only)

```prisma
// Add to existing Case model:
calendarEvents CalendarEvent[]

// Add to existing User model:
calendarEventsResponsible    CalendarEvent[]            @relation("CalendarEventResponsible")
calendarEventsCreated        CalendarEvent[]            @relation("CalendarEventCreatedBy")
calendarEventParticipations  CalendarEventParticipant[]
calendarAuditActions         CalendarAuditLog[]         @relation("CalendarAuditActor")
```

## Data migration

No data migration is needed. The calendar feature introduces new tables with no existing data to transform. Existing Task.dueDate and Case.deadline data is projected at runtime, not copied.

## Rollback plan

If the calendar migration needs to be rolled back:

1. `DROP TABLE "CalendarAuditLog";`
2. `DROP TABLE "CalendarEventParticipant";`
3. `DROP TABLE "CalendarEvent";`
4. Drop all 6 enums in reverse order
5. Remove relation fields from Case and User models in schema.prisma
6. Run `prisma generate`

No existing data is affected by rollback — the calendar tables are additive.

## Pre-migration checklist

- [ ] All documentation files reviewed and approved
- [ ] CalendarEvent model fields finalized
- [ ] Index strategy reviewed for query patterns
- [ ] Enum values confirmed with product owner
- [ ] Rollback procedure tested in staging
- [ ] Existing test suite passes with no changes
