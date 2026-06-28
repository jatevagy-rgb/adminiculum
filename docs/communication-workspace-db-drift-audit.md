# Communication Workspace DB Drift Audit

Status: read-only audit. No Prisma schema changes, migration files, runtime code, seed data, Azure config changes, or deployments were made.

## 1. Audit Scope

This audit reviews the current communication-related database shape before creating any real migration for the next communication model layer.

Compared inputs:

- `Backend/prisma/schema.prisma`;
- existing folders under `Backend/prisma/migrations/`;
- `docs/communication-workspace-migration-draft-review.md`;
- read-only SQL introspection against the reachable database from `Backend/.env`;
- read-only Azure metadata for the deployed backend and PostgreSQL resources.

Important limitation:

- direct SQL access to the deployed Azure PostgreSQL database from this workstation timed out;
- Kudu command execution against the backend App Service returned `401`;
- no Azure firewall, networking, app setting, or deployment change was made to work around this.

Therefore, the table-level findings below are verified against the reachable local `Backend/.env` target, not the deployed production/staging database.

## 2. Audit Method

Commands used were read-only:

- `git branch --show-current`;
- `git rev-parse --short HEAD`;
- `git status --short`;
- `rg` over Prisma schema, migration folders, and communication docs;
- Node + `pg` SQL introspection against metadata views:
  - `information_schema.tables`;
  - `information_schema.columns`;
  - `pg_indexes`;
  - `pg_constraint`;
  - `pg_type` / `pg_enum`;
- `az webapp list`;
- `az webapp config appsettings list`;
- `az postgres flexible-server list`.

Commands explicitly not run:

- `prisma migrate dev`;
- `prisma migrate deploy`;
- migration generation;
- destructive SQL;
- seed scripts;
- deployment commands.

## 3. Targets Reached

### Local SQL Target

The reachable SQL target from `Backend/.env` was:

- host: `localhost`;
- port: `5432`;
- database: `adminiculum`;
- schema: `public`;
- PostgreSQL: `18.1`.

### Azure Metadata Target

Read-only Azure metadata showed:

- backend App Service: `adminiculumbackend-b1-01`;
- frontend App Service: `adminiculumfrontend-austriaeast-01`;
- PostgreSQL flexible servers:
  - `adminiculum.postgres.database.azure.com`;
  - `adminiculum-bp3-rc1b-clone.postgres.database.azure.com`.

The backend App Service has a `DATABASE_URL` setting, but direct SQL access from this workstation timed out on the Azure PostgreSQL endpoint.

## 4. DB Objects Found

Verified in the reachable local database:

| Object | Found | Notes |
|---|---:|---|
| `communications` table | Yes | Matches current scalar communication list baseline. |
| `communication_attachments` table | Yes | Attachment table exists with FK to `communications`. |
| `tasks.sourceCommunicationId` column | Yes | Nullable `text`; FK exists to `communications(id)`. |
| `CommunicationType` enum | Yes | Values: `EMAIL`, `PHONE`, `MEETING`, `LETTER`, `NOTE`. |
| `communication_threads` table | No | No collision locally. |
| `communication_classifications` table | No | No collision locally. |
| `communication_assignments` table | No | No collision locally. |
| `communication_rules` table | No | No collision locally. |
| COMM5B proposed enums | No | No enum-name collision locally beyond existing `CommunicationType`. |

Local row counts:

| Query | Count |
|---|---:|
| `communications` | 3 |
| `communication_attachments` | 0 |
| `tasks` with `sourceCommunicationId IS NOT NULL` | 0 |

## 5. Current Communication Columns

The reachable local `communications` table contains:

| Column | Type | Nullable | Default |
|---|---|---:|---|
| `id` | `text` | No | none |
| `type` | `CommunicationType` | No | none |
| `subject` | `text` | No | none |
| `senderName` | `text` | Yes | none |
| `senderEmail` | `text` | Yes | none |
| `recipientName` | `text` | Yes | none |
| `recipientEmail` | `text` | Yes | none |
| `content` | `text` | Yes | none |
| `summary` | `text` | Yes | none |
| `caseId` | `text` | Yes | none |
| `clientId` | `text` | Yes | none |
| `documentId` | `text` | Yes | none |
| `createdById` | `text` | No | none |
| `createdAt` | `timestamp(3)` | No | `CURRENT_TIMESTAMP` |
| `updatedAt` | `timestamp(3)` | No | none |

The reachable local `communication_attachments` table contains:

| Column | Type | Nullable | Default |
|---|---|---:|---|
| `id` | `text` | No | none |
| `fileName` | `text` | No | none |
| `fileType` | `text` | Yes | none |
| `description` | `text` | Yes | none |
| `url` | `text` | Yes | none |
| `spItemId` | `text` | Yes | none |
| `communicationId` | `text` | No | none |
| `documentId` | `text` | Yes | none |
| `uploadedById` | `text` | No | none |
| `createdAt` | `timestamp(3)` | No | `CURRENT_TIMESTAMP` |

## 6. Current Indexes and Foreign Keys

Verified local communication-related indexes:

- `communications_pkey`;
- `communications_caseId_createdAt_idx`;
- `communications_clientId_createdAt_idx`;
- `communication_attachments_pkey`;
- `tasks_pkey`.

Verified local communication-related foreign keys:

- `communication_attachments("communicationId")` → `communications(id)` with `ON DELETE CASCADE`;
- `tasks("sourceCommunicationId")` → `communications(id)` with `ON DELETE SET NULL`.

Notable finding:

- Prisma schema and reachable local DB agree that `Task.sourceCommunicationId` is already nullable and FK-backed.

## 7. Schema vs DB Drift Findings

### Prisma Schema Alignment

The reachable local DB aligns with the current Prisma model names and field casing for:

- `Communication` → `communications`;
- `CommunicationAttachment` → `communication_attachments`;
- `CommunicationType`;
- quoted camelCase columns such as `senderName`, `caseId`, `createdAt`, and `sourceCommunicationId`.

This supports the COMM5B draft choice to use quoted camelCase column names such as `threadId`, `lastMessageAt`, and `classifiedById` if no explicit `@map` attributes are added.

### Migration History Drift

The local migration folders still do not show the introduction of:

- `communications`;
- `communication_attachments`;
- `CommunicationType`;
- `tasks.sourceCommunicationId`.

This is real repository migration-history drift, even though the reachable DB and Prisma schema align today.

Risk:

- a future generated migration may assume the current communication baseline already exists because it is present in `schema.prisma`;
- an environment created only from the tracked migration history may not reconstruct the same communication baseline;
- before applying a real migration, the team should decide whether to preserve this as accepted historical drift or introduce a baseline/repair migration strategy for new environments.

### Deployed DB Verification Gap

The deployed DB could not be introspected from this workstation:

- Azure App Service metadata confirms the backend has `DATABASE_URL`;
- direct DB connection timed out;
- Kudu command execution returned `401`.

Risk:

- local findings should not be treated as proof of deployed DB shape;
- COMM5D should not apply a real migration until deployed DB introspection succeeds from an allowed network path or App Service command path.

## 8. Naming and Collision Risks

### Table Names

No local collisions were found for:

- `communication_threads`;
- `communication_classifications`;
- `communication_assignments`;
- `communication_rules`.

These names are consistent with the existing snake_case table mapping style:

- `communications`;
- `communication_attachments`.

### Prisma Model Names

No local collisions were found for proposed Prisma model names:

- `CommunicationThread`;
- `CommunicationClassification`;
- `CommunicationAssignment`;
- `CommunicationRule`.

### Column Casing

Existing DB columns use Prisma's quoted camelCase style:

- `senderName`;
- `senderEmail`;
- `recipientName`;
- `recipientEmail`;
- `caseId`;
- `clientId`;
- `documentId`;
- `createdById`;
- `createdAt`;
- `updatedAt`;
- `sourceCommunicationId`.

Recommendation:

- either keep COMM5B's quoted camelCase convention for the next migration;
- or explicitly choose snake_case with `@map`, but do not mix styles casually inside the same communication layer.

For smallest risk, keep the existing quoted camelCase convention.

### Index Names

No local index-name collisions were found for the proposed COMM5B index names.

However, generated Prisma index names can be long. Before applying a real migration, review generated SQL for:

- PostgreSQL 63-byte identifier truncation;
- accidental duplicate names after truncation;
- consistency with current names such as `communications_caseId_createdAt_idx`.

## 9. Enum Risks

Existing local enum:

- `CommunicationType` with `EMAIL`, `PHONE`, `MEETING`, `LETTER`, `NOTE`.

No local collisions were found for proposed enums:

- `CommunicationDirection`;
- `CommunicationReplyState`;
- `CommunicationClassificationSource`;
- `CommunicationClassificationStatus`;
- `CommunicationClassificationTargetType`;
- `CommunicationAssignmentStatus`;
- `CommunicationEscalationState`;
- `CommunicationRuleType`;
- `CommunicationSyncStatus`.

Risk:

- PostgreSQL enum removal/renaming is awkward;
- names and values should be reviewed carefully before real migration generation;
- `CommunicationReplyState` should not drive UI claims until persisted workflow logic exists.

## 10. Nullable/Additive Field Risks

COMM5B's additive fields are still appropriate:

- `Communication.threadId String?`;
- `Communication.direction CommunicationDirection?`.

Risk profile:

- nullable columns avoid backfill requirements;
- adding enum-typed nullable columns is safe only if enum creation succeeds first;
- no existing local row requires a computed thread or direction value.

Recommendation:

- keep existing-row fields nullable in the first real migration;
- do not add non-null constraints or defaults to existing `communications` rows in COMM5D.

## 11. Foreign-Key Risks

Local DB already has:

- FK from `communication_attachments.communicationId` to `communications.id`;
- FK from `tasks.sourceCommunicationId` to `communications.id`.

COMM5B intentionally proposed scalar-first new tables without broad target FKs.

That remains the safer recommendation because:

- deployed DB shape is not yet verified;
- historical migration drift exists;
- target IDs may be nullable and optional;
- future classification/assignment rows may initially reference several target domains;
- backfill and orphan checks should precede new FKs to `clients`, `cases`, `tasks`, `documents`, `document_review_suggestions`, or `users`.

## 12. Backfill Risks

Local data is small:

- `communications`: 3 rows;
- `communication_attachments`: 0 rows;
- `tasks.sourceCommunicationId`: 0 populated rows.

Even so, no backfill should be assumed for deployed DB.

Recommendation:

- first migration: add nullable fields and empty new tables only;
- later optional backfill: run a separate read-only estimate first, then a reviewed one-off migration or job if needed.

## 13. Migration Split Recommendation

Split the migration work into smaller steps.

Recommended split:

1. **COMM5D drift unblock**: obtain deployed DB introspection from an allowed network path or Kudu/App Service command path.
2. **COMM5E baseline decision**: decide how to handle missing communication baseline in migration history.
3. **COMM5F additive schema migration**:
   - add nullable `Communication.threadId`;
   - add nullable `Communication.direction`;
   - add proposed enums;
   - add `communication_threads`;
   - add `communication_classifications`;
   - add `communication_assignments`;
   - add `communication_rules`;
   - avoid broad target FKs.
4. **COMM5G backend contract extension**:
   - expose optional persisted fields only after migration exists;
   - keep mutating/detail routes gated unless explicitly enabled.
5. **COMM5H UI claim update**:
   - show reply/classification/workflow states only when backed by persisted data.

Do not combine drift unblock, baseline repair, additive schema migration, backend behavior, and frontend claims in one deployment.

## 14. Final COMM5D Recommendation

Do not create or apply the real communication migration yet.

Recommended COMM5D should be a deployed-DB introspection unblock, not a schema migration:

```text
Adminiculum — COMM5D deployed DB introspection unblock for communication migration

Goal:
Obtain read-only communication-related schema introspection from the deployed Azure PostgreSQL database.

Strict rules:
Do not modify Azure config, Prisma schema, migrations, runtime code, package files, auth, or client portal.
Do not run migration commands.
Do not run destructive SQL.

Use an approved network path or App Service/Kudu command path that can access the deployed DATABASE_URL.
Return only sanitized metadata: table names, columns, indexes, FKs, enum names/values, row counts.
```

If deployed DB introspection becomes available and matches the local findings, proceed to a separate additive migration-generation task.

## 15. Safety Confirmation

No schema, migration, runtime, package, auth, Azure config, client portal, seed, or deployment file was changed.

No migration was generated or applied.

No destructive SQL was executed.
