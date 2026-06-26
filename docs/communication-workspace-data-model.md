# Communication Workspace Data Model Design

Status: design note only. This document does not apply a Prisma schema change, does not create a migration, and does not define an implementation contract for immediate deployment.

## 1. Product Goal

The communication workspace should become the operational place for external messages, internal notes, reply state, classification, and task association. It should support lawyer-reviewed classification of communication into the existing Adminiculum work graph:

- client
- case
- task
- document or review item

The first implementation should preserve the current product truthfulness rules: no fake email data, no live Outlook or Microsoft Graph claim until integration is explicitly implemented, and no automatic legal conclusion from communication metadata.

## 2. Existing Schema and Domain Names

The current Prisma schema already contains a basic communication layer:

- `Communication` mapped to `communications`
- `CommunicationType` with `EMAIL`, `PHONE`, `MEETING`, `LETTER`, `NOTE`
- `CommunicationAttachment` mapped to `communication_attachments`
- `Task.sourceCommunicationId` and `Task.sourceCommunication` via relation `"CommunicationTasks"`
- optional direct IDs on `Communication`: `caseId`, `clientId`, `documentId`

Relevant existing target models:

- `Client`
- `Case`
- `Task`
- `Document`
- `DocumentVersion`
- `DocumentReviewSuggestion`
- `User`
- `TimelineEvent`
- `Notification`

The future model should extend this existing vocabulary rather than replacing it blindly.

## 3. Entities

### `Communication`

Existing record for a message, note, call, meeting, or letter. Future use should clarify whether this represents a single message item or a manually created communication note.

Recommended future role:

- stores message-level metadata and safe body/summary fields;
- belongs optionally to a `CommunicationThread`;
- remains the source for attachments and task extraction;
- may keep current `caseId`, `clientId`, `documentId` fields during migration for backward compatibility.

### `CommunicationThread`

New concept for grouping message items into one conversation.

Recommended future role:

- stores stable external provider thread ID when available;
- groups incoming/outgoing messages;
- carries aggregate reply state;
- supports task assignment from the whole thread, not only one message.

### `CommunicationClassification`

New concept for reviewed classification decisions.

Recommended future role:

- links a communication or thread to client/case/task/document/review;
- records source: manual, remembered rule, system suggestion;
- records classifier, timestamp, override state, and confidence if suggested;
- creates an audit trail instead of mutating only direct foreign keys.

### `CommunicationAssignment`

New concept for linking communication to lawyer-assigned work.

Recommended future role:

- associates a communication item or thread with a `Task`;
- records who attached it, when, and whether it was attached during task creation;
- supports the workflow where a lawyer assigns a task and attaches the relevant email/thread.

### `CommunicationRule`

New concept for remembered classification decisions.

Recommended future role:

- stores rules approved by users, such as sender domain to client, sender to client, subject pattern to case, or mailbox/folder to workflow;
- proposes future classifications but does not silently finalize them unless a later policy explicitly allows that;
- records who created or last updated the rule.

## 4. Suggested Prisma Model Sketch

Non-applied draft. Do not paste into `schema.prisma` without a migration design, data backfill plan, and review of relation names against the current deployed database.

```prisma
enum CommunicationDirection {
  INBOUND
  OUTBOUND
  INTERNAL
}

enum CommunicationReplyState {
  TO_US
  FROM_US
  WAITING_EXTERNAL
  CLOSED
}

enum CommunicationClassificationSource {
  MANUAL
  REMEMBERED_RULE
  SYSTEM_SUGGESTION
}

enum CommunicationClassificationTargetType {
  CLIENT
  CASE
  TASK
  DOCUMENT
  DOCUMENT_REVIEW_SUGGESTION
}

enum CommunicationRuleType {
  SENDER_EMAIL
  SENDER_DOMAIN
  SUBJECT_PATTERN
  PROVIDER_THREAD
}

model CommunicationThread {
  id                 String                    @id @default(uuid())
  provider           String?
  providerThreadId   String?
  subject            String?
  direction          CommunicationDirection?
  replyState         CommunicationReplyState   @default(CLOSED)
  lastMessageAt      DateTime?
  createdAt          DateTime                  @default(now())
  updatedAt          DateTime                  @updatedAt

  // Future relation:
  // communications      Communication[]
  // classifications     CommunicationClassification[]
  // assignments         CommunicationAssignment[]

  @@unique([provider, providerThreadId])
  @@index([replyState, lastMessageAt])
  @@map("communication_threads")
}

model CommunicationClassification {
  id                         String                          @id @default(uuid())
  communicationId            String?
  communicationThreadId      String?
  targetType                 CommunicationClassificationTargetType
  clientId                   String?
  caseId                     String?
  taskId                     String?
  documentId                 String?
  documentReviewSuggestionId String?
  source                     CommunicationClassificationSource
  suggestedByRuleId          String?
  classifiedById             String?
  classifiedAt               DateTime                        @default(now())
  overriddenAt               DateTime?
  overriddenById             String?
  overrideReason             String?
  confidence                 Float?
  createdAt                  DateTime                        @default(now())
  updatedAt                  DateTime                        @updatedAt

  @@index([communicationId])
  @@index([communicationThreadId])
  @@index([clientId, classifiedAt])
  @@index([caseId, classifiedAt])
  @@index([taskId, classifiedAt])
  @@map("communication_classifications")
}

model CommunicationAssignment {
  id                    String   @id @default(uuid())
  communicationId       String?
  communicationThreadId String?
  taskId                String
  caseId                String?
  assignedById          String?
  assignedAt            DateTime @default(now())
  assignmentContext     String?
  createdAt             DateTime @default(now())

  @@index([taskId, assignedAt])
  @@index([communicationId])
  @@index([communicationThreadId])
  @@map("communication_assignments")
}

model CommunicationRule {
  id              String                @id @default(uuid())
  ruleType        CommunicationRuleType
  pattern         String
  clientId        String?
  caseId          String?
  taskId          String?
  documentId      String?
  isActive        Boolean               @default(true)
  createdById     String?
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt
  lastMatchedAt   DateTime?

  @@index([ruleType, isActive])
  @@index([clientId])
  @@index([caseId])
  @@map("communication_rules")
}
```

Possible extension to existing `Communication` in a later migration:

```prisma
// Non-applied draft fields only:
// threadId       String?
// provider       String?
// providerItemId String?
// direction      CommunicationDirection?
// replyState     CommunicationReplyState @default(CLOSED)
// receivedAt     DateTime?
// sentAt         DateTime?
```

## 5. Relationships

Recommended relationship shape:

- `CommunicationThread` has many `Communication` items.
- `Communication` can have many `CommunicationClassification` rows over time.
- `CommunicationThread` can also have classification rows for thread-level decisions.
- `CommunicationClassification` may point to one or more target IDs, constrained by `targetType` at application level.
- `CommunicationAssignment` links a communication item or thread to a `Task`.
- `CommunicationRule` proposes future `CommunicationClassification` records but should not silently finalize them in the first implementation.
- Existing `Task.sourceCommunicationId` can remain as a compatibility shortcut for the primary source communication.

Because Prisma does not enforce polymorphic relations directly, the first implementation should avoid over-complex relation declarations until target ownership and delete behavior are reviewed.

## 6. Workflow Examples

### External Email to Client and Case

1. A future inbox process creates `CommunicationThread` and `Communication` metadata.
2. A sender-domain rule proposes a `Client`.
3. Subject or manual review proposes a `Case`.
4. A lawyer confirms the classification.
5. The app writes `CommunicationClassification` with `source = MANUAL` or `REMEMBERED_RULE`.
6. Dashboard and workspace show the item as client/case classified.

### Internal Note to Review Item

1. A user creates an internal `Communication` of type `NOTE`.
2. The note is linked to a `DocumentReviewSuggestion`.
3. A classification row records the user and timestamp.
4. The case review workspace can show the note without treating it as external email.

### Task Assignment from Thread

1. A lawyer creates or assigns a `Task`.
2. The assignment UI offers a selected communication thread.
3. The app creates `CommunicationAssignment`.
4. If needed for compatibility, the task's `sourceCommunicationId` points to the most relevant message item.
5. The communication workspace shows the thread as linked to a task and responsible lawyer.

### Classification Override

1. A remembered rule proposes the wrong client.
2. A lawyer overrides the proposal.
3. The original classification row is marked with `overriddenAt`, `overriddenById`, and `overrideReason`.
4. A corrected row is created with `source = MANUAL`.
5. The rule is reviewed or disabled if the same mistake repeats.

## 7. Dashboard Impact

The dashboard should remain summary-only:

- show counts and compact entry points for external/internal communication;
- avoid raw email body display;
- avoid fake rows or synthetic senders;
- link communication tiles to the communication workspace views;
- show reply-state counts only after real data exists;
- keep risk/escalation out of the dashboard unless tied to case/workspace context.

Future dashboard data should come from aggregated classified communication, not from unreviewed raw inbox state.

## 8. Communication Workspace Impact

The communication workspace should become the primary work surface for:

- external vs internal lanes;
- reply state lanes;
- client/case/task/document classification;
- classification audit history;
- rule suggestions and remembered decisions;
- attaching communication to task assignment.

First implementation should show honest empty states until real communication data exists.

## 9. Migration Risks

- Existing `Communication.caseId`, `clientId`, and `documentId` are direct IDs without full relations; backfill must not break current case communication pages.
- `Task.sourceCommunicationId` already exists and should not be replaced casually.
- A new thread layer requires deduplication rules for provider IDs and local manual notes.
- Polymorphic review/document links can become ambiguous if `Document`, `DocumentVersion`, and `DocumentReviewSuggestion` are mixed without a clear target type.
- Delete behavior must be conservative: deleting a case/task/document should not silently destroy audit history unless explicitly designed.
- Remembered rules may encode sensitive client knowledge and need permission checks.
- Graph/Outlook identifiers must be feature-flagged and nullable until the integration is live.

## 10. Rollout Plan

1. Confirm current `Communication` usage in case, document, client, task, review, and notification flows.
2. Add enums and new tables in a reviewed migration only after this design is approved.
3. Backfill `CommunicationClassification` from existing direct `caseId`, `clientId`, and `documentId` fields.
4. Add read APIs for workspace lanes behind a feature flag.
5. Add manual classification UI first.
6. Add remembered rule suggestions after audit logging is in place.
7. Add task-association UI during task creation and assignment.
8. Consider provider/thread IDs only after Graph readiness and privacy review.
9. Activate dashboard counts from real classified communication data.

## 11. Non-Goals for First Implementation

- No live Outlook or Microsoft Graph sync.
- No raw mailbox ingestion.
- No automatic final classification without user review.
- No client portal exposure.
- No legal risk scoring from communication.
- No migration in this design task.
- No Prisma client generation.
- No backend route implementation.
- No dashboard fake data.
