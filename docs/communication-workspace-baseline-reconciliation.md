# Communication Workspace Baseline Reconciliation Design

Status: docs/design only. This document does not modify Prisma schema, does not create migration files, does not apply migrations, and does not change runtime behavior.

## 1. Current Mismatch Summary

COMM5D proved the deployed Azure PostgreSQL database is missing the communication baseline objects currently expected by `Backend/prisma/schema.prisma`.

Current Prisma schema expects:

- `CommunicationType` enum with `EMAIL`, `PHONE`, `MEETING`, `LETTER`, `NOTE`;
- `communications` table via `Communication`;
- `communication_attachments` table via `CommunicationAttachment`;
- nullable `tasks.sourceCommunicationId`;
- indexes:
  - `communications_caseId_createdAt_idx`;
  - `communications_clientId_createdAt_idx`;
- foreign keys:
  - `communication_attachments.communicationId` → `communications.id` with cascade delete;
  - `tasks.sourceCommunicationId` → `communications.id` with set-null delete.

Deployed Azure DB lacks:

- `CommunicationType`;
- `communications`;
- `communication_attachments`;
- `tasks.sourceCommunicationId`;
- communication-related migration names in `_prisma_migrations`.

Current endpoint safety:

- `GET /api/v1/communications` remains route-safe because missing-table/runtime DB errors are caught and mapped to a safe empty list;
- this is an operational tolerance, not a substitute for aligning the database with the Prisma schema;
- no client portal exposure exists or should be introduced in this baseline pass.

## 2. Reconciliation Options

### Option A — Dedicated Baseline Migration

Create a dedicated additive baseline migration that introduces only the objects already present in the current Prisma schema.

Includes:

- `CommunicationType`;
- `communications`;
- `communication_attachments`;
- nullable `tasks.sourceCommunicationId`;
- required baseline indexes and FKs.

Benefits:

- aligns deployed DB with current Prisma schema;
- avoids next-layer communication objects until the baseline is real;
- does not require backend or frontend behavior changes;
- preserves production data and avoids reset/rebaseline.

Risks:

- migration history is already divergent, so generated SQL must be reviewed carefully;
- idempotency guards may be needed if clone/staging and production differ;
- FK/index names must match or intentionally map to Prisma expectations.

### Option B — Mark an Old Migration as Applied

Marking an existing or old migration as applied is only valid when the objects already exist in the target database.

COMM5D proved the deployed DB lacks the communication baseline objects, so this is not valid for production.

Using `prisma migrate resolve --applied` without the objects would make migration history less honest and leave runtime schema drift unresolved.

### Option C — Reset / Rebaseline Production

Resetting or rebaselining production is not acceptable.

Reasons:

- destructive risk to production data;
- unnecessary because the missing baseline can be added additively;
- conflicts with the current safe deployed state and no-runtime-change requirement.

## 3. Recommended Path

Use Option A: a dedicated additive communication baseline migration.

Baseline rules:

- add only the missing baseline objects;
- do not include `CommunicationThread`;
- do not include `CommunicationClassification`;
- do not include `CommunicationAssignment`;
- do not include `CommunicationRule`;
- do not include provider sync fields;
- do not include direction/reply-state fields;
- do not add seed/fake communication rows;
- keep `tasks.sourceCommunicationId` nullable;
- keep `ENABLE_COMMUNICATIONS_PERSISTENCE` disabled unless a later task explicitly enables persistence;
- do not expose communications to the client portal;
- do not change frontend behavior.

Backfill stance:

- no data backfill is required for the baseline;
- existing `tasks` rows should remain valid because `sourceCommunicationId` is nullable;
- existing communications cannot be backfilled because the deployed DB has no communication table.

## 4. Proposed SQL Outline

Non-applied outline only:

```sql
-- Draft outline only. Do not run as-is without generating/reviewing a real migration.

DO $$
BEGIN
  CREATE TYPE "CommunicationType" AS ENUM (
    'EMAIL',
    'PHONE',
    'MEETING',
    'LETTER',
    'NOTE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "communications" (
  "id" TEXT NOT NULL,
  "type" "CommunicationType" NOT NULL,
  "subject" TEXT NOT NULL,
  "senderName" TEXT,
  "senderEmail" TEXT,
  "recipientName" TEXT,
  "recipientEmail" TEXT,
  "content" TEXT,
  "summary" TEXT,
  "caseId" TEXT,
  "clientId" TEXT,
  "documentId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "communications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "communication_attachments" (
  "id" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileType" TEXT,
  "description" TEXT,
  "url" TEXT,
  "spItemId" TEXT,
  "communicationId" TEXT NOT NULL,
  "documentId" TEXT,
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "communication_attachments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "sourceCommunicationId" TEXT;

CREATE INDEX IF NOT EXISTS "communications_caseId_createdAt_idx"
  ON "communications"("caseId", "createdAt");

CREATE INDEX IF NOT EXISTS "communications_clientId_createdAt_idx"
  ON "communications"("clientId", "createdAt");

DO $$
BEGIN
  ALTER TABLE "communication_attachments"
    ADD CONSTRAINT "communication_attachments_communicationId_fkey"
    FOREIGN KEY ("communicationId")
    REFERENCES "communications"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "tasks"
    ADD CONSTRAINT "tasks_sourceCommunicationId_fkey"
    FOREIGN KEY ("sourceCommunicationId")
    REFERENCES "communications"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
```

### Idempotency Considerations

Use guards because environments are known to differ:

- `CREATE TYPE` should be wrapped in a `duplicate_object` guard;
- `CREATE TABLE IF NOT EXISTS` is appropriate for empty missing tables;
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is appropriate for `tasks.sourceCommunicationId`;
- `CREATE INDEX IF NOT EXISTS` is appropriate for baseline indexes;
- FK creation should be guarded because PostgreSQL does not support `ADD CONSTRAINT IF NOT EXISTS`.

Before turning this outline into a migration, confirm whether Prisma-generated SQL should be manually edited to include guards. If edited, review the migration carefully and test it against a clone/staging database first.

## 5. Risk Review

### Enum Naming / Casing Risk

Prisma expects `"CommunicationType"` with exact quoted casing.

Risk:

- unquoted or lowercased enum creation would not match Prisma expectations;
- adding enum values later is possible, but renaming/removing enum values is awkward.

Mitigation:

- use exactly `"CommunicationType"`;
- use only current Prisma enum values.

### Prisma Migration History Risk

COMM5D showed no deployed communication migration names.

Risk:

- `_prisma_migrations` may not describe all schema changes currently in production;
- a normal generated migration may assume a cleaner migration history than production actually has.

Mitigation:

- create a dedicated baseline migration with reviewed SQL;
- apply first to a clone/staging DB;
- keep this migration separate from next-layer communication objects.

### Table Naming / Casing Risk

Current Prisma maps:

- `Communication` → `communications`;
- `CommunicationAttachment` → `communication_attachments`.

Columns use quoted camelCase names such as:

- `senderName`;
- `recipientEmail`;
- `createdById`;
- `createdAt`;
- `sourceCommunicationId`.

Mitigation:

- preserve current Prisma naming style;
- do not introduce snake_case column alternatives in this baseline pass.

### FK / Index Naming Risk

Expected names:

- `communications_caseId_createdAt_idx`;
- `communications_clientId_createdAt_idx`;
- `communication_attachments_communicationId_fkey`;
- `tasks_sourceCommunicationId_fkey`.

Risk:

- generated names may differ if Prisma schema changes or if SQL is hand-written differently;
- duplicate constraints may exist in some environments.

Mitigation:

- review generated SQL;
- use guarded constraint creation for manually reviewed SQL;
- verify post-apply names through `pg_indexes` and `pg_constraint`.

### Runtime Risk

The read-only list endpoint currently tolerates missing communication baseline objects by returning a safe empty list.

After baseline migration:

- missing-table handling should no longer be needed for these baseline objects;
- behavior should remain unchanged if no communication rows exist;
- mutating/detail communication endpoints must remain gated by `ENABLE_COMMUNICATIONS_PERSISTENCE`.

### Rollback / Abandon Strategy

Before apply:

- abandon by not creating or not applying the baseline migration.

After apply but before any data exists:

- prefer leaving additive baseline objects in place;
- if rollback is absolutely required, drop FKs, indexes, tables, and enum in reverse order after confirming no data exists.

After data exists:

- do not destructively drop communication tables without export and product sign-off;
- gate behavior at the API/UI layer instead.

## 6. Deploy / Apply Sequence Proposal

Recommended later sequence:

1. Generate a dedicated baseline migration in a separate task.
2. Review migration SQL against this design.
3. Apply to clone/staging if available.
4. Run post-apply introspection:
   - `CommunicationType`;
   - `communications`;
   - `communication_attachments`;
   - `tasks.sourceCommunicationId`;
   - communication indexes;
   - communication FKs.
5. Run backend validation.
6. Smoke deployed/staging backend:
   - `/health`;
   - unauthenticated `GET /api/v1/communications` → `401`;
   - authenticated `GET /api/v1/communications?limit=8` → `200` safe list;
   - client portal spoofed summary/export → `501 CLIENT_PORTAL_NOT_ENABLED`.
7. Apply to production only after clone/staging proof is clean.
8. Re-run the same post-apply introspection and smoke checks in production.

No backend behavior change is needed for the baseline migration.

No frontend behavior change is needed for the baseline migration.

No Azure app setting change is needed for the baseline migration.

## 7. Validation Checklist

Before apply:

- confirm target DB identity;
- confirm baseline objects are still missing or compatible;
- review generated SQL;
- confirm no next-layer objects are included;
- confirm `tasks.sourceCommunicationId` is nullable;
- confirm `ENABLE_COMMUNICATIONS_PERSISTENCE` remains disabled unless separately approved.

After apply:

- prove `CommunicationType` exists with expected values;
- prove `communications` exists with expected columns;
- prove `communication_attachments` exists with expected columns;
- prove `tasks.sourceCommunicationId` exists and is nullable;
- prove communication indexes exist;
- prove communication FKs exist;
- confirm `/health` returns `200`;
- confirm unauthenticated communications request returns `401`;
- confirm authenticated communications request returns `200` with safe list shape;
- confirm client portal spoofed summary/export remains `501 CLIENT_PORTAL_NOT_ENABLED`;
- confirm no frontend, auth, client portal, or Azure config behavior changed.

## 8. Recommended Next Prompt

```text
Adminiculum — COMM5F create communication baseline migration draft only

Use docs/communication-workspace-baseline-reconciliation.md as the design source.
Create a dedicated Prisma/SQL migration draft for only:
- CommunicationType
- communications
- communication_attachments
- nullable tasks.sourceCommunicationId
- current baseline indexes/FKs

Do not include CommunicationThread, CommunicationClassification, CommunicationAssignment, CommunicationRule, provider fields, direction, or reply-state.
Do not apply migrations.
Do not deploy.
Do not change backend/frontend runtime code, auth, Azure config, package files, or client portal.
Validate generated SQL against the deployed DB proof before commit.
```

## 9. Design Conclusion

The safe reconciliation path is a dedicated additive baseline migration matching the current Prisma communication baseline. The COMM5B next-layer model must wait until the deployed DB has this baseline and post-apply proof confirms the objects exist.
