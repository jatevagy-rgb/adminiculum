# Communication Workspace Next Data Model

Status: migration-ready design note only. This document does not modify `schema.prisma`, does not create a migration, does not change runtime code, and does not authorize deployment.

Date: 2026-06-28
Branch: `hotfix/runtime-shape-20260308`

## 1. Current Stable Baseline

The deployed communication workspace is stable in a truthful read-only state:

- backend `GET /api/v1/communications` is authenticated and read-only;
- the list endpoint is intentionally ungated by `ENABLE_COMMUNICATIONS_PERSISTENCE`;
- mutating/detail communication endpoints remain gated by `ENABLE_COMMUNICATIONS_PERSISTENCE`;
- the list response is scalar-only and includes `contentPreview`, `attachmentCount`, and `sourceTaskCount`;
- default list limit is `20`, maximum list limit is `50`;
- `/notifications` calls `getCommunications({ limit: 50 })`;
- dashboard communication tiles route into `/notifications` views;
- authenticated smoke passed with `GET /api/v1/communications?limit=8` returning a safe empty list.

Existing schema vocabulary to preserve:

- `Communication` mapped to `communications`;
- `CommunicationType` with `EMAIL`, `PHONE`, `MEETING`, `LETTER`, `NOTE`;
- `CommunicationAttachment` mapped to `communication_attachments`;
- `Task.sourceCommunicationId` and relation `"CommunicationTasks"`;
- direct nullable IDs on `Communication`: `caseId`, `clientId`, `documentId`;
- target models: `Client`, `Case`, `Task`, `Document`, `DocumentReviewSuggestion`, `User`.

## 2. Design Principles

- Prefer additive migrations only.
- Add nullable fields first.
- Do not remove or reinterpret existing direct IDs during the first migration.
- Do not introduce UI claims before persisted data exists.
- Keep provider integration optional and future-safe.
- Keep client portal exposure explicitly disabled until separate client-portal auth and policy work exists.
- Treat automation as suggestion/audit data, not as silent final classification.

## 3. Proposed Model Additions

### 3.1 Threading

Add `CommunicationThread` to group related `Communication` records. This should support manually grouped communication now and provider conversations later.

Recommended fields:

- `id`;
- `subject`;
- `direction`;
- `replyState`;
- `lastMessageAt`;
- optional provider readiness fields:
  - `provider`;
  - `providerTenantId`;
  - `providerMailbox`;
  - `providerConversationId`;
  - `providerThreadId`;
  - `syncStatus`;
  - `lastSyncedAt`;
- audit timestamps.

Add nullable `communicationThreadId` to `Communication`. Existing `Communication` rows remain valid without a thread.

Do not assume Outlook or Graph sync exists. Provider fields are metadata slots only until a provider integration is separately implemented.

### 3.2 Direction and Reply State

Add a persisted direction enum before using direction in UI logic:

```prisma
enum CommunicationDirection {
  INBOUND
  OUTBOUND
  INTERNAL
  SYSTEM
  MANUAL
  UNKNOWN
}
```

Add a persisted reply-state enum only if the product accepts explicit state tracking:

```prisma
enum CommunicationReplyState {
  TO_US
  FROM_US
  WAITING_EXTERNAL
  CLOSED
  UNKNOWN
}
```

Recommended placement:

- `Communication.direction` for item-level direction;
- `CommunicationThread.replyState` for thread-level reply tracking;
- optional `Communication.replyState` only if item-level tracking is required later.

The UI must not claim reply tracking until these fields are persisted, populated, and returned by a backend contract.

### 3.3 Classification

Add `CommunicationClassification` as an audit/history table. It should represent reviewed classification decisions rather than mutating only direct IDs.

Recommended fields:

- `id`;
- nullable `communicationId`;
- nullable `communicationThreadId`;
- `targetType`;
- nullable target IDs:
  - `clientId`;
  - `caseId`;
  - `taskId`;
  - `documentId`;
  - `documentReviewSuggestionId`;
- `source`;
- `status`;
- nullable `suggestedByRuleId`;
- nullable `classifiedById`;
- `classifiedAt`;
- override fields:
  - `overriddenById`;
  - `overriddenAt`;
  - `overrideReason`;
- audit timestamps.

Suggested enums:

```prisma
enum CommunicationClassificationSource {
  MANUAL
  REMEMBERED_RULE
  SYSTEM_SUGGESTION
}

enum CommunicationClassificationStatus {
  SUGGESTED
  CONFIRMED
  REJECTED
  SUPERSEDED
}

enum CommunicationClassificationTargetType {
  CLIENT
  CASE
  TASK
  DOCUMENT
  DOCUMENT_REVIEW_SUGGESTION
}
```

`SYSTEM_SUGGESTION` is a data model placeholder only. It must not be described as AI classification unless an actual AI feature is implemented and audited later.

### 3.4 Assignment and Workflow

Add `CommunicationAssignment` to link a communication item or thread to work.

Recommended fields:

- `id`;
- nullable `communicationId`;
- nullable `communicationThreadId`;
- `taskId`;
- nullable `caseId`;
- nullable `clientId`;
- nullable `documentId`;
- nullable `documentReviewSuggestionId`;
- nullable `responsibleUserId`;
- nullable `assignedById`;
- `assignedAt`;
- `status`;
- nullable `escalationState`;
- nullable `assignmentContext`;
- audit timestamps.

Suggested enums:

```prisma
enum CommunicationAssignmentStatus {
  ACTIVE
  DONE
  CANCELLED
}

enum CommunicationEscalationState {
  NONE
  NEEDS_REVIEW
  BLOCKED
}
```

This model should not create fake priority. If prioritization is needed later, use explicit user-entered status or an audited backend rule, not fabricated scores.

### 3.5 Rules and Remembrance

Add `CommunicationRule` only as an opt-in/manual rule system.

Recommended fields:

- `id`;
- `ruleType`;
- `pattern`;
- nullable target IDs:
  - `clientId`;
  - `caseId`;
  - `taskId`;
  - `documentId`;
- `isActive`;
- `createdById`;
- `createdAt`;
- `updatedAt`;
- nullable `lastMatchedAt`;
- nullable `notes`.

Suggested enum:

```prisma
enum CommunicationRuleType {
  SENDER_EMAIL
  SENDER_DOMAIN
  SUBJECT_CONTAINS
  PROVIDER_MAILBOX
  PROVIDER_FOLDER
  PROVIDER_CONVERSATION
}
```

Safe meaning of remembered rule:

- a user confirms a classification;
- the UI offers to remember a narrow matching pattern;
- the rule later creates a `SUGGESTED` classification;
- a lawyer confirms or rejects it.

Rules should not silently finalize classifications in the first implementation.

### 3.6 Provider Integration Readiness

Provider fields may be added as nullable metadata, but no provider sync claim should be made.

Future-safe provider fields:

- `provider`;
- `providerTenantId`;
- `providerMailbox`;
- `providerFolderId`;
- `providerMessageId`;
- `providerConversationId`;
- `providerThreadId`;
- `providerInternetMessageId`;
- `providerWebUrl`;
- `syncStatus`;
- `lastSyncedAt`;
- `syncError`;

Suggested enum:

```prisma
enum CommunicationSyncStatus {
  NOT_SYNCED
  IMPORTED
  SYNCED
  SYNC_ERROR
}
```

These fields should remain nullable. They must not be required for manual/internal communication.

### 3.7 Client Portal Boundary

Client portal communication exposure remains a non-goal.

Before client-visible communication can exist, the product needs:

- separate client portal authentication;
- authorization rules per client/case;
- redaction and confidentiality review;
- explicit publish/unpublish state;
- audit log for who exposed communication and when;
- dedicated client-facing API contracts.

The current client portal guard must remain `501 FEATURE_NOT_AVAILABLE` with reason `CLIENT_PORTAL_NOT_ENABLED`.

## 4. Non-Applied Prisma Sketch

This sketch is for migration planning. Do not paste it into `schema.prisma` without reviewing relation names, generated SQL, deployed DB drift, and rollback strategy.

```prisma
enum CommunicationDirection {
  INBOUND
  OUTBOUND
  INTERNAL
  SYSTEM
  MANUAL
  UNKNOWN
}

enum CommunicationReplyState {
  TO_US
  FROM_US
  WAITING_EXTERNAL
  CLOSED
  UNKNOWN
}

enum CommunicationClassificationSource {
  MANUAL
  REMEMBERED_RULE
  SYSTEM_SUGGESTION
}

enum CommunicationClassificationStatus {
  SUGGESTED
  CONFIRMED
  REJECTED
  SUPERSEDED
}

enum CommunicationClassificationTargetType {
  CLIENT
  CASE
  TASK
  DOCUMENT
  DOCUMENT_REVIEW_SUGGESTION
}

enum CommunicationAssignmentStatus {
  ACTIVE
  DONE
  CANCELLED
}

enum CommunicationEscalationState {
  NONE
  NEEDS_REVIEW
  BLOCKED
}

enum CommunicationRuleType {
  SENDER_EMAIL
  SENDER_DOMAIN
  SUBJECT_CONTAINS
  PROVIDER_MAILBOX
  PROVIDER_FOLDER
  PROVIDER_CONVERSATION
}

enum CommunicationSyncStatus {
  NOT_SYNCED
  IMPORTED
  SYNCED
  SYNC_ERROR
}

model CommunicationThread {
  id                     String                    @id @default(uuid())
  subject                String?
  direction              CommunicationDirection    @default(UNKNOWN)
  replyState             CommunicationReplyState   @default(UNKNOWN)
  lastMessageAt          DateTime?
  provider               String?
  providerTenantId       String?
  providerMailbox        String?
  providerConversationId String?
  providerThreadId       String?
  syncStatus             CommunicationSyncStatus   @default(NOT_SYNCED)
  lastSyncedAt           DateTime?
  syncError              String?
  createdAt              DateTime                  @default(now())
  updatedAt              DateTime                  @updatedAt

  @@unique([provider, providerTenantId, providerMailbox, providerThreadId])
  @@index([replyState, lastMessageAt])
  @@index([provider, providerConversationId])
  @@map("communication_threads")
}

model CommunicationClassification {
  id                         String                                @id @default(uuid())
  communicationId            String?
  communicationThreadId      String?
  targetType                 CommunicationClassificationTargetType
  clientId                   String?
  caseId                     String?
  taskId                     String?
  documentId                 String?
  documentReviewSuggestionId String?
  source                     CommunicationClassificationSource
  status                     CommunicationClassificationStatus     @default(CONFIRMED)
  suggestedByRuleId          String?
  classifiedById             String?
  classifiedAt               DateTime                              @default(now())
  overriddenById             String?
  overriddenAt               DateTime?
  overrideReason             String?
  createdAt                  DateTime                              @default(now())
  updatedAt                  DateTime                              @updatedAt

  @@index([communicationId, classifiedAt])
  @@index([communicationThreadId, classifiedAt])
  @@index([clientId, classifiedAt])
  @@index([caseId, classifiedAt])
  @@index([taskId, classifiedAt])
  @@map("communication_classifications")
}

model CommunicationAssignment {
  id                         String                         @id @default(uuid())
  communicationId            String?
  communicationThreadId      String?
  taskId                     String
  caseId                     String?
  clientId                   String?
  documentId                 String?
  documentReviewSuggestionId String?
  responsibleUserId          String?
  assignedById               String?
  assignedAt                 DateTime                       @default(now())
  status                     CommunicationAssignmentStatus  @default(ACTIVE)
  escalationState            CommunicationEscalationState   @default(NONE)
  assignmentContext          String?
  createdAt                  DateTime                       @default(now())
  updatedAt                  DateTime                       @updatedAt

  @@index([taskId, assignedAt])
  @@index([communicationId])
  @@index([communicationThreadId])
  @@index([responsibleUserId, status])
  @@map("communication_assignments")
}

model CommunicationRule {
  id            String                @id @default(uuid())
  ruleType      CommunicationRuleType
  pattern       String
  clientId      String?
  caseId        String?
  taskId        String?
  documentId    String?
  isActive      Boolean               @default(true)
  createdById   String?
  createdAt     DateTime              @default(now())
  updatedAt     DateTime              @updatedAt
  lastMatchedAt DateTime?
  notes         String?

  @@index([ruleType, isActive])
  @@index([clientId])
  @@index([caseId])
  @@map("communication_rules")
}
```

Required changes to existing `Communication` would be additive:

- nullable `communicationThreadId`;
- nullable `direction`;
- nullable provider metadata fields only if provider readiness is in the same migration scope;
- optional relation declarations after relation names are reviewed.

## 5. Safe Migration Sequence

Recommended deploy order:

1. **Design approval** — review this document with product, security, and DB owner.
2. **DB drift audit** — compare deployed production schema against local Prisma schema for `communications`, `communication_attachments`, `tasks.sourceCommunicationId`, and target model IDs.
3. **Schema-only PR** — add enums, new tables, nullable `Communication.communicationThreadId`, and indexes.
4. **Generate migration** — inspect SQL manually before applying anywhere.
5. **Staging migration** — apply to staging only; no frontend claims yet.
6. **Backend read contract extension** — add optional fields to `GET /api/v1/communications` only after columns exist.
7. **Backfill job design** — decide whether existing `caseId`, `clientId`, `documentId`, and `sourceCommunicationId` should create initial classifications or assignments.
8. **Runtime gate review** — keep mutating operations gated until write workflows are implemented and tested.
9. **Frontend progressive reveal** — show reply-state, rules, assignments, and provider metadata only when backed by returned persisted fields.
10. **Production migration** — deploy backend/schema in a controlled pass with rollback notes.

## 6. Required Backend Contract Changes

Backend contract changes should be additive:

- extend read-only list items with optional `threadId`, `direction`, and `replyState` only after persistence exists;
- add read-only endpoints for classifications and assignments before adding write flows;
- keep existing scalar list behavior stable for dashboard and `/notifications`;
- keep unsupported write/detail routes gated or return explicit feature-unavailable responses;
- never include raw provider bodies or relation-heavy payloads in dashboard list responses.

Suggested future read-only contracts:

- `GET /api/v1/communications?limit=...` with optional new fields;
- `GET /api/v1/communication-threads?limit=...`;
- `GET /api/v1/communications/:id/classifications`;
- `GET /api/v1/communication-threads/:id/assignments`.

Write contracts should wait for migration completion and workflow review.

## 7. Frontend Claims That Must Wait

Do not show these claims until backed by persisted fields and backend contracts:

- reply-state tracking;
- Outlook or Graph sync;
- provider mailbox/folder/conversation status;
- AI classification;
- remembered rule automation;
- automatic prioritization;
- client-visible communication;
- task assignment from thread unless `CommunicationAssignment` exists.

Safe near-term UI language:

- "read-only lista";
- "nincs válaszállapot-mező";
- "ügyfélhez sorolt, ha `clientId` érkezik";
- "feladathoz kapcsolt, ha `sourceTaskCount` érkezik".

## 8. Rejected / Non-Goal Items

Do not include in the first migration:

- destructive replacement of `Communication.caseId`, `clientId`, or `documentId`;
- mandatory provider fields;
- mandatory thread for every communication;
- automatic AI classification;
- silent remembered-rule finalization;
- client portal exposure;
- fake priority or risk scoring;
- raw Outlook/Graph body import without provider design.

## 9. Validation and Deploy Checklist

For the eventual implementation pass:

- confirm no untracked operational files are staged;
- run `git diff --check`;
- run backend `npx.cmd tsc --noEmit`;
- run backend tests, especially route feature guards;
- run Prisma format/validate after schema changes;
- inspect generated SQL;
- apply migration only in the target environment approved for that pass;
- run frontend `npx.cmd tsc --noEmit` and `npm.cmd run build` if frontend contracts change;
- smoke:
  - `/health` → `200`;
  - unauthenticated communications → `401`;
  - authenticated `GET /api/v1/communications?limit=8` → safe shape;
  - mutating/detail routes remain gated until intentionally enabled;
  - client portal spoofed summary/export remains `501 FEATURE_NOT_AVAILABLE`, reason `CLIENT_PORTAL_NOT_ENABLED`.

## 10. Open Questions

- Should `CommunicationThread.replyState` be required at thread level, or should reply-state stay absent until workflow ownership is clear?
- Should existing direct `caseId`, `clientId`, and `documentId` be treated as confirmed manual classifications during backfill?
- Should `Task.sourceCommunicationId` remain the primary compatibility link after `CommunicationAssignment` exists?
- Which user roles may confirm classifications or create remembered rules?
- What is the minimum audit trail required for override decisions?
- Should provider metadata live on `Communication`, `CommunicationThread`, or a separate provider-message table?
- What retention/redaction policy applies if provider bodies are later imported?
- What client portal policy would be required before any communication can become client-visible?
