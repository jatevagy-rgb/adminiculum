# Communication Workspace Migration Draft Review

Status: draft/review only. This document does not modify Prisma schema, does not create a migration, and does not apply any database change.

## 1. Review Inputs

Inspected inputs:

- `docs/communication-workspace-next-data-model.md` from COMM5A;
- `Backend/prisma/schema.prisma`;
- existing migration folders under `Backend/prisma/migrations/`.

Current important baseline:

- `Communication` already exists in Prisma and maps to `communications`;
- `CommunicationAttachment` already exists and maps to `communication_attachments`;
- `Communication.type` uses `CommunicationType` with `EMAIL`, `PHONE`, `MEETING`, `LETTER`, `NOTE`;
- `Task.sourceCommunicationId` exists in Prisma as an optional scalar linked to `Communication`;
- the deployed read-only list contract is already authenticated, scalar-only, and ungated;
- mutating/detail communication endpoints remain gated by `ENABLE_COMMUNICATIONS_PERSISTENCE`;
- client portal communication exposure is out of scope.

Migration-history observation:

- the local migration folders do not appear to contain the introduction of `communications`, `communication_attachments`, or `CommunicationType`;
- this means production/staging drift must be treated as a first-class risk before any migration is applied;
- the safest next migration should therefore avoid broad foreign-key assumptions and should add nullable/scalar fields first.

## 2. Smallest Safe Additive Change Set

Recommended first migration layer:

1. Add nullable scalar thread/direction fields to existing `Communication`.
2. Add new tables for thread, classification history, assignment workflow, and remembered rules.
3. Keep target links scalar-first for the first migration pass.
4. Avoid required foreign keys to `Client`, `Case`, `Task`, `Document`, or review tables until production drift is verified.
5. Keep provider-readiness fields optional and behavior-neutral.
6. Do not expose client portal fields or client-visible communication states.

The proposed first pass intentionally does not implement:

- Outlook/Graph sync;
- AI classification;
- persisted reply-state UI claims;
- automatic remembered rules;
- client portal communication visibility;
- destructive backfills or required data migrations.

## 3. Proposed Prisma Schema Diff

Non-applied draft only:

```diff
 model Communication {
   id              String                    @id @default(uuid())
   type            CommunicationType
+  threadId        String?
+  direction       CommunicationDirection?
   subject         String
   senderName      String?
   senderEmail     String?
   recipientName   String?
   recipientEmail  String?
   content         String?
   summary         String?
   caseId          String?
   clientId        String?
   documentId      String?
   createdById     String
   createdAt       DateTime                  @default(now())
   updatedAt       DateTime                  @updatedAt
   attachments     CommunicationAttachment[]
   relatedTasks    Task[]                    @relation("CommunicationTasks")

+  @@index([threadId, createdAt])
   @@index([caseId, createdAt])
   @@index([clientId, createdAt])
   @@map("communications")
 }

+model CommunicationThread {
+  id                     String                    @id @default(uuid())
+  subject                String?
+  normalizedSubject      String?
+  direction              CommunicationDirection?
+  replyState             CommunicationReplyState?
+  lastMessageAt          DateTime?
+  lastInboundAt          DateTime?
+  lastOutboundAt         DateTime?
+  provider               String?
+  providerTenantId       String?
+  providerMailbox        String?
+  providerThreadId       String?
+  providerConversationId String?
+  syncStatus             CommunicationSyncStatus?
+  createdById            String?
+  createdAt              DateTime                  @default(now())
+  updatedAt              DateTime                  @updatedAt
+
+  @@index([lastMessageAt])
+  @@index([provider, providerTenantId, providerMailbox, providerThreadId])
+  @@map("communication_threads")
+}
+
+model CommunicationClassification {
+  id                String                                @id @default(uuid())
+  communicationId   String?
+  threadId          String?
+  source            CommunicationClassificationSource
+  status            CommunicationClassificationStatus      @default(CONFIRMED)
+  targetType        CommunicationClassificationTargetType?
+  clientId          String?
+  caseId            String?
+  taskId            String?
+  documentId        String?
+  reviewItemId      String?
+  ruleId            String?
+  confidence        Decimal?                              @db.Decimal(5, 4)
+  reason            String?
+  classifiedById    String?
+  classifiedAt      DateTime                              @default(now())
+  overriddenById    String?
+  overriddenAt      DateTime?
+  overrideReason    String?
+  createdAt         DateTime                              @default(now())
+  updatedAt         DateTime                              @updatedAt
+
+  @@index([communicationId, classifiedAt])
+  @@index([threadId, classifiedAt])
+  @@index([clientId, classifiedAt])
+  @@index([caseId, classifiedAt])
+  @@index([taskId, classifiedAt])
+  @@index([documentId, classifiedAt])
+  @@index([reviewItemId, classifiedAt])
+  @@map("communication_classifications")
+}
+
+model CommunicationAssignment {
+  id              String                         @id @default(uuid())
+  communicationId String?
+  threadId        String?
+  taskId          String?
+  caseId          String?
+  clientId        String?
+  documentId      String?
+  assignedToId    String?
+  assignedById    String?
+  status          CommunicationAssignmentStatus  @default(ACTIVE)
+  escalationState CommunicationEscalationState   @default(NONE)
+  note            String?
+  dueAt           DateTime?
+  completedAt     DateTime?
+  createdAt       DateTime                       @default(now())
+  updatedAt       DateTime                       @updatedAt
+
+  @@index([communicationId, createdAt])
+  @@index([threadId, createdAt])
+  @@index([taskId, createdAt])
+  @@index([assignedToId, status])
+  @@index([caseId, status])
+  @@map("communication_assignments")
+}
+
+model CommunicationRule {
+  id              String                 @id @default(uuid())
+  name            String
+  ruleType        CommunicationRuleType
+  pattern         String
+  clientId        String?
+  caseId          String?
+  taskId          String?
+  documentId      String?
+  createdById     String?
+  isActive        Boolean                @default(true)
+  lastAppliedAt   DateTime?
+  createdAt       DateTime               @default(now())
+  updatedAt       DateTime               @updatedAt
+
+  @@index([ruleType, isActive])
+  @@index([clientId, isActive])
+  @@index([caseId, isActive])
+  @@map("communication_rules")
+}
+
+enum CommunicationDirection {
+  INBOUND
+  OUTBOUND
+  INTERNAL
+  SYSTEM
+  MANUAL
+  UNKNOWN
+}
+
+enum CommunicationReplyState {
+  TO_US
+  FROM_US
+  WAITING_EXTERNAL
+  CLOSED
+  UNKNOWN
+}
+
+enum CommunicationClassificationSource {
+  MANUAL
+  REMEMBERED_RULE
+  SYSTEM_SUGGESTION
+}
+
+enum CommunicationClassificationStatus {
+  SUGGESTED
+  CONFIRMED
+  REJECTED
+  SUPERSEDED
+}
+
+enum CommunicationClassificationTargetType {
+  CLIENT
+  CASE
+  TASK
+  DOCUMENT
+  DOCUMENT_REVIEW_SUGGESTION
+}
+
+enum CommunicationAssignmentStatus {
+  ACTIVE
+  DONE
+  CANCELLED
+}
+
+enum CommunicationEscalationState {
+  NONE
+  NEEDS_REVIEW
+  BLOCKED
+}
+
+enum CommunicationRuleType {
+  SENDER_EMAIL
+  SENDER_DOMAIN
+  SUBJECT_CONTAINS
+  PROVIDER_MAILBOX
+  PROVIDER_FOLDER
+  PROVIDER_CONVERSATION
+}
+
+enum CommunicationSyncStatus {
+  NOT_SYNCED
+  IMPORTED
+  SYNCED
+  SYNC_ERROR
+}
```

### Prisma Diff Notes

- `Communication.threadId` is nullable to avoid any backfill requirement.
- `Communication.direction` is nullable so existing records remain untouched.
- `CommunicationThread.replyState` is nullable; the UI must not claim reply-state tracking until values are persisted by real workflow code.
- Target links stay scalar-first in this draft. Relations and foreign keys can be added later after DB drift is verified.
- Provider fields are optional metadata only; they do not imply sync behavior.
- `CommunicationClassification.confidence` supports future system suggestions but does not imply AI classification.

## 4. Proposed SQL Migration Draft

Non-applied draft only:

```sql
-- Draft only. Do not run without production/staging drift verification.

DO $$ BEGIN
  CREATE TYPE "CommunicationDirection" AS ENUM (
    'INBOUND', 'OUTBOUND', 'INTERNAL', 'SYSTEM', 'MANUAL', 'UNKNOWN'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommunicationReplyState" AS ENUM (
    'TO_US', 'FROM_US', 'WAITING_EXTERNAL', 'CLOSED', 'UNKNOWN'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommunicationClassificationSource" AS ENUM (
    'MANUAL', 'REMEMBERED_RULE', 'SYSTEM_SUGGESTION'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommunicationClassificationStatus" AS ENUM (
    'SUGGESTED', 'CONFIRMED', 'REJECTED', 'SUPERSEDED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommunicationClassificationTargetType" AS ENUM (
    'CLIENT', 'CASE', 'TASK', 'DOCUMENT', 'DOCUMENT_REVIEW_SUGGESTION'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommunicationAssignmentStatus" AS ENUM (
    'ACTIVE', 'DONE', 'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommunicationEscalationState" AS ENUM (
    'NONE', 'NEEDS_REVIEW', 'BLOCKED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommunicationRuleType" AS ENUM (
    'SENDER_EMAIL', 'SENDER_DOMAIN', 'SUBJECT_CONTAINS',
    'PROVIDER_MAILBOX', 'PROVIDER_FOLDER', 'PROVIDER_CONVERSATION'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommunicationSyncStatus" AS ENUM (
    'NOT_SYNCED', 'IMPORTED', 'SYNCED', 'SYNC_ERROR'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "communications"
  ADD COLUMN IF NOT EXISTS "threadId" TEXT,
  ADD COLUMN IF NOT EXISTS "direction" "CommunicationDirection";

CREATE TABLE IF NOT EXISTS "communication_threads" (
  "id" TEXT NOT NULL,
  "subject" TEXT,
  "normalizedSubject" TEXT,
  "direction" "CommunicationDirection",
  "replyState" "CommunicationReplyState",
  "lastMessageAt" TIMESTAMP(3),
  "lastInboundAt" TIMESTAMP(3),
  "lastOutboundAt" TIMESTAMP(3),
  "provider" TEXT,
  "providerTenantId" TEXT,
  "providerMailbox" TEXT,
  "providerThreadId" TEXT,
  "providerConversationId" TEXT,
  "syncStatus" "CommunicationSyncStatus",
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "communication_threads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "communication_classifications" (
  "id" TEXT NOT NULL,
  "communicationId" TEXT,
  "threadId" TEXT,
  "source" "CommunicationClassificationSource" NOT NULL,
  "status" "CommunicationClassificationStatus" NOT NULL DEFAULT 'CONFIRMED',
  "targetType" "CommunicationClassificationTargetType",
  "clientId" TEXT,
  "caseId" TEXT,
  "taskId" TEXT,
  "documentId" TEXT,
  "reviewItemId" TEXT,
  "ruleId" TEXT,
  "confidence" DECIMAL(5,4),
  "reason" TEXT,
  "classifiedById" TEXT,
  "classifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "overriddenById" TEXT,
  "overriddenAt" TIMESTAMP(3),
  "overrideReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "communication_classifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "communication_assignments" (
  "id" TEXT NOT NULL,
  "communicationId" TEXT,
  "threadId" TEXT,
  "taskId" TEXT,
  "caseId" TEXT,
  "clientId" TEXT,
  "documentId" TEXT,
  "assignedToId" TEXT,
  "assignedById" TEXT,
  "status" "CommunicationAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "escalationState" "CommunicationEscalationState" NOT NULL DEFAULT 'NONE',
  "note" TEXT,
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "communication_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "communication_rules" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "ruleType" "CommunicationRuleType" NOT NULL,
  "pattern" TEXT NOT NULL,
  "clientId" TEXT,
  "caseId" TEXT,
  "taskId" TEXT,
  "documentId" TEXT,
  "createdById" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastAppliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "communication_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "communications_threadId_createdAt_idx"
  ON "communications"("threadId", "createdAt");

CREATE INDEX IF NOT EXISTS "communication_threads_lastMessageAt_idx"
  ON "communication_threads"("lastMessageAt");

CREATE INDEX IF NOT EXISTS "communication_threads_provider_thread_idx"
  ON "communication_threads"("provider", "providerTenantId", "providerMailbox", "providerThreadId");

CREATE INDEX IF NOT EXISTS "communication_classifications_communicationId_classifiedAt_idx"
  ON "communication_classifications"("communicationId", "classifiedAt");

CREATE INDEX IF NOT EXISTS "communication_classifications_threadId_classifiedAt_idx"
  ON "communication_classifications"("threadId", "classifiedAt");

CREATE INDEX IF NOT EXISTS "communication_classifications_clientId_classifiedAt_idx"
  ON "communication_classifications"("clientId", "classifiedAt");

CREATE INDEX IF NOT EXISTS "communication_classifications_caseId_classifiedAt_idx"
  ON "communication_classifications"("caseId", "classifiedAt");

CREATE INDEX IF NOT EXISTS "communication_classifications_taskId_classifiedAt_idx"
  ON "communication_classifications"("taskId", "classifiedAt");

CREATE INDEX IF NOT EXISTS "communication_classifications_documentId_classifiedAt_idx"
  ON "communication_classifications"("documentId", "classifiedAt");

CREATE INDEX IF NOT EXISTS "communication_classifications_reviewItemId_classifiedAt_idx"
  ON "communication_classifications"("reviewItemId", "classifiedAt");

CREATE INDEX IF NOT EXISTS "communication_assignments_communicationId_createdAt_idx"
  ON "communication_assignments"("communicationId", "createdAt");

CREATE INDEX IF NOT EXISTS "communication_assignments_threadId_createdAt_idx"
  ON "communication_assignments"("threadId", "createdAt");

CREATE INDEX IF NOT EXISTS "communication_assignments_taskId_createdAt_idx"
  ON "communication_assignments"("taskId", "createdAt");

CREATE INDEX IF NOT EXISTS "communication_assignments_assignedToId_status_idx"
  ON "communication_assignments"("assignedToId", "status");

CREATE INDEX IF NOT EXISTS "communication_assignments_caseId_status_idx"
  ON "communication_assignments"("caseId", "status");

CREATE INDEX IF NOT EXISTS "communication_rules_ruleType_isActive_idx"
  ON "communication_rules"("ruleType", "isActive");

CREATE INDEX IF NOT EXISTS "communication_rules_clientId_isActive_idx"
  ON "communication_rules"("clientId", "isActive");

CREATE INDEX IF NOT EXISTS "communication_rules_caseId_isActive_idx"
  ON "communication_rules"("caseId", "isActive");
```

### SQL Draft Notes

- The SQL uses `IF NOT EXISTS`/duplicate-object guards because existing migration history may not fully represent deployed DB reality.
- Prisma-generated migration SQL may not include these guards by default; if this draft becomes an actual migration, decide whether to hand-review and keep guard patterns.
- No target foreign keys are included in the first pass because deployed DB drift is not yet proven safe.
- The draft uses current Prisma naming style with quoted camelCase columns such as `"threadId"` and `"lastMessageAt"`.
- There is no data backfill and no attempt to infer thread, direction, reply, classification, or rule state from existing rows.

## 5. Proposed Tables and Model Responsibilities

### `CommunicationThread`

Stores a durable thread grouping without assuming provider sync:

- optional subject and normalized subject;
- optional direction/reply-state fields;
- optional provider identifiers for future import readiness;
- optional sync status for later integration work only.

### `CommunicationClassification`

Stores classification decisions and history:

- manual decisions;
- opt-in remembered-rule classifications;
- future system suggestions without AI claims;
- audit fields for classifier, override user, override time, and reason;
- scalar target IDs for client, case, task, document, and review item.

### `CommunicationAssignment`

Stores communication-to-work workflow:

- optional communication/thread/task/case/client/document links;
- responsible user fields;
- status and escalation state;
- due/completed timestamps.

### `CommunicationRule`

Stores manually created remembered classification rules:

- pattern and rule type;
- optional target IDs;
- active flag and last-applied timestamp;
- no automatic creation or provider-sync claim.

## 6. Migration Risks

### Drift Risk

The highest risk is that the local Prisma schema and deployed database may not share identical communication-table history. The local migration folders do not show the introduction of `communications`, so a production/staging schema introspection should precede any actual migration.

### Foreign-Key Risk

Adding foreign keys to existing target tables could fail if:

- columns are missing or differently named;
- orphan scalar IDs already exist;
- target table naming differs from Prisma assumptions;
- production data violates referential constraints.

The first migration should therefore remain scalar-first. Add foreign keys in a later hardening migration only after drift and orphan checks pass.

### Enum Risk

PostgreSQL enums are additive but awkward to remove. The enum names and values should be reviewed carefully before migration creation.

### UI Claim Risk

The UI must not claim:

- reply-state tracking;
- Outlook/Graph provider sync;
- AI classification;
- automatic remembered rules;
- client-visible communication exposure.

Those claims require persisted values plus backend workflow code, not just schema fields.

### Backfill Risk

No broad backfill is recommended. Existing rows should remain valid with `NULL` thread/direction fields until explicit, audited backfill logic exists.

## 7. Deploy Order Recommendation

Recommended sequence:

1. Keep this review as docs-only.
2. Run a read-only production/staging DB drift audit for:
   - `communications`;
   - `communication_attachments`;
   - `tasks.sourceCommunicationId`;
   - `clients`, `cases`, `documents`, `document_review_suggestions`, and `users`.
3. Create a dedicated schema/migration branch.
4. Apply the proposed Prisma diff to `Backend/prisma/schema.prisma` locally only.
5. Generate migration SQL against a disposable local/shadow database.
6. Compare generated SQL with this draft and hand-review guards/index names.
7. Run backend TypeScript and route-feature-guard tests.
8. Deploy the migration separately from behavior changes.
9. Extend backend read contracts with optional fields only after the migration is deployed.
10. Reveal frontend UI claims only after persisted workflow data exists.

## 8. Rollback / Abandon Strategy

Before migration application:

- abandon by closing the migration PR;
- no runtime rollback is needed.

After migration application but before runtime use:

- prefer leaving unused additive tables/columns dormant if production risk is low;
- if removal is required and no data exists, drop indexes, new tables, new nullable columns, and new enum types in reverse order;
- verify no Prisma Client or backend code depends on the removed objects.

After runtime use or user data exists:

- do not destructively drop tables or columns without export/backfill planning;
- mark features dormant in backend contracts and UI;
- use a follow-up migration to deprecate rather than erase data.

## 9. Recommended Next Prompt

Use this only after a read-only DB drift audit confirms the deployed database has the expected current communication tables and columns:

```text
Adminiculum — COMM5C create additive Prisma migration for communication model

Use docs/communication-workspace-migration-draft-review.md as the reviewed draft.
Create the additive Prisma schema change and migration SQL only.
Do not deploy.
Do not add runtime behavior.
Do not touch frontend, auth, Azure, package files, or client portal.
Run backend validation and report drift findings before commit.
```

## 10. Review Conclusion

The proposed next communication data model can be migration-ready as an additive, nullable, scalar-first layer. It should not be applied until production/staging drift is explicitly checked, because current migration history does not fully explain the existing communication schema.
