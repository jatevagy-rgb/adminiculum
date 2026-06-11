# Production Migration Reconciliation Runbook

This runbook preserves the R1B migration reconciliation plan for the
`DocumentReviewSuggestion` persistence foundation. It is a planning document
only. Do not execute commands from this document until an approved production
operator window is scheduled.

## Current Production State

- Frontend App Service: `adminiculumfrontend-austriaeast-01`
- Backend App Service: `adminiculumbackend-b1-01`
- Shared App Service Plan: `Adminiculum / ASP-AdminiculumRG-be7b`
- Azure PostgreSQL Flexible Server: `Adminiculum-RG / adminiculum`
- Target database: `adminiculum`
- Latest R1A commit: `38ba0a8dee5874029b539879ae83478ec523d57b`
- R1A commit message: `feat(review): add document review suggestion persistence foundation`
- R1A migration: `20260610214500_add_document_review_suggestions`

## Critical Warning

Do not run normal `prisma migrate deploy` yet.

The production `_prisma_migrations` table is sparse and behind the local
migration folder history. Some schema effects already exist in production but
their migration names are not recorded. Running `prisma migrate deploy` now may
try to execute older unrecorded migrations first and fail on duplicate
tables, columns, indexes, or types before reaching R1A.

## Known Drift

- `documents.workspaceText` exists, but
  `20260518120000_add_workspace_text` is not recorded.
- `timeline_events.communicationId` exists.
- `communications` table is absent.
- `communication_attachments` table is absent.
- `tasks.sourceCommunicationId` is absent.
- `anonymous_documents` table exists, but indexes from
  `20260331090100_add_anonymous_documents` are absent.
- R1A target objects are absent:
  - `document_review_suggestions`
  - `DocumentReviewWorkspaceSource`
  - `DocumentReviewSuggestionType`
  - `DocumentReviewSuggestionStatus`
- R1A foreign-key targets are compatible:
  - `cases.id`
  - `documents.id`
  - `document_versions.id`
  - `users.id`

## Bucketed Migration Plan

### Bucket A — Already Recorded

| Migration | Status | Later action |
| --- | --- | --- |
| `20260212180000_add_workload_tracking` | Recorded as finished, with an additional rolled-back duplicate record | Leave alone; note duplicate history record |

### Bucket B — Present But Not Recorded

These migrations have live schema effects that appear present but are not
recorded in `_prisma_migrations`. They are candidates for later official
`prisma migrate resolve --applied`, but only after fresh proof checks.

| Migration | Live proof required before resolve |
| --- | --- |
| `20260402131500_add_client_identity_fields` | `clients.taxNumber`, `clients.companyRegistrationNumber`, and `clients.authorizedRepresentative` exist; data backfill intent is acceptable |
| `20260405183100_add_case_client_role` | `cases.clientRole` exists |
| `20260406120000_add_client_color` | `clients.color` exists with compatible type |
| `20260408140000_add_case_collaborators` | `case_collaborators` table, primary key, unique key, foreign keys, and indexes exist |
| `20260518120000_add_workspace_text` | `documents.workspaceText` exists as a text-compatible column |

### Bucket C — Absent And Candidate For Normal Apply

These migrations appear absent and should be applied in dependency order after
Bucket B and Bucket D are reconciled.

1. `20260330120000_add_generation_drafts`
2. `20260331100000_add_rehydration_fields`
3. `20260416175000_add_comparison_snapshot_foundation`
4. `20260417100000_add_timesheet_report_instances`
5. `20260417113000_add_timesheet_report_artifacts`
6. `20260417123000_add_timesheet_presets`
7. `20260514201500_add_legal_analyses`
8. `20260515190000_add_lawyer_handoff_package`
9. `20260517175500_add_client_house_style_profile`
10. `20260517191600_add_client_house_style_header_fields`
11. `20260610214500_add_document_review_suggestions`

### Bucket D — Partial Or Manual Review Required

| Area | Status | Required later plan |
| --- | --- | --- |
| `20260331090100_add_anonymous_documents` | Table exists, migration record absent, expected indexes absent | Verify full table shape, apply missing indexes/comments with idempotent targeted SQL, then resolve as applied |
| Communication drift | `timeline_events.communicationId` exists; `communications`, `communication_attachments`, and `tasks.sourceCommunicationId` are absent | Manual review; no matching local migration exists in the current migration folder set |

## Staged Execution Proposal

### Stage 0 — Backup And Preflight

- Schedule execution outside office working hours if possible.
- Confirm latest Azure PostgreSQL backup and restore point availability.
- Keep the old/current backend package available for rollback.
- Optionally export a schema-only snapshot from an approved secure path.
- Run read-only metadata prechecks immediately before any change:
  - `_prisma_migrations`
  - live tables
  - live columns
  - live indexes
  - live enum types
  - backend and frontend health
- Confirm current health:
  - frontend `/` returns `200`
  - backend `/health` returns `200`
  - backend `/api/v1/auth/me` without token returns `401`

### Stage 1 — Resolve Proven-Present Bucket B Migrations

Only after fresh proof checks, use official Prisma resolve commands for
Bucket B migrations. Do not manually edit `_prisma_migrations`.

If any proof check fails, stop and do not resolve that migration.

### Stage 2 — Repair Partial `anonymous_documents`

Do not resolve `20260331090100_add_anonymous_documents` before missing objects
are repaired and verified.

Required proof before repair:

- `anonymous_documents` table exists.
- Expected columns and compatible types exist.
- Expected primary key exists.
- Expected indexes are absent or partially absent.

If the table shape differs from the migration intent, stop and write a manual
repair plan instead of applying indexes.

After targeted repair and verification, run official
`prisma migrate resolve --applied 20260331090100_add_anonymous_documents`.

### Stage 3 — Apply Absent Bucket C Migrations

After Stage 1 and Stage 2 are complete, prefer normal `prisma migrate deploy`
over targeted SQL so Prisma applies and records the absent migrations in order.

Communication drift is not represented by the current migration folder set.
Do not invent communication repair SQL in this runbook.

### Stage 4 — Apply R1A

R1A should apply through normal `prisma migrate deploy` after migration history
is safe.

Expected R1A objects:

- `DocumentReviewWorkspaceSource`
- `DocumentReviewSuggestionType`
- `DocumentReviewSuggestionStatus`
- `document_review_suggestions`
- indexes on document/status, case/createdAt, document/workspace source,
  document version, and author
- foreign keys to `cases`, `documents`, `document_versions`, and `users`

Postcheck SQL should confirm table, enums, indexes, foreign keys, and
`_prisma_migrations` record.

### Stage 5 — Backend Deploy

- Deploy committed `HEAD:Backend` only to `adminiculumbackend-b1-01`.
- Do not deploy backend before DB migration succeeds.
- Post-deploy checks:
  - backend `/health` returns `200`
  - backend `/api/v1/auth/me` without token returns `401`
  - unauthenticated review suggestion route returns expected auth-protected
    behavior, normally `401`

### Stage 6 — Frontend Persistence Wiring Later

- No frontend UI persistence wiring is part of this reconciliation.
- Frontend API helpers already exist.
- A later R1D patch can wire the TipTap UI after backend persistence is live.

## DO NOT RUN YET — Future Command Block

```powershell
# Stage 0
cd C:\Users\hubay\Documents\Adminiculum\Backend
npx prisma migrate status

# Stage 1 — only after fresh proof checks
npx prisma migrate resolve --applied 20260402131500_add_client_identity_fields
npx prisma migrate resolve --applied 20260405183100_add_case_client_role
npx prisma migrate resolve --applied 20260406120000_add_client_color
npx prisma migrate resolve --applied 20260408140000_add_case_collaborators
npx prisma migrate resolve --applied 20260518120000_add_workspace_text

# Stage 2 — only after targeted anonymous repair verification
npx prisma migrate resolve --applied 20260331090100_add_anonymous_documents

# Stage 3 and Stage 4
npx prisma migrate deploy
```

## DO NOT RUN YET — Anonymous Repair SQL Draft

Run only inside an approved transaction after the table shape is verified.

```sql
BEGIN;

CREATE INDEX IF NOT EXISTS "idx_anonymous_documents_caseId_createdAt"
  ON "anonymous_documents"("caseId", "createdAt");

CREATE INDEX IF NOT EXISTS "idx_anonymous_documents_sourceDocId"
  ON "anonymous_documents"("sourceDocId");

COMMENT ON TABLE "anonymous_documents"
  IS 'Stores anonymized documents with token mappings for rehydration';

COMMENT ON COLUMN "anonymous_documents"."redactedItems"
  IS 'JSON array of {type, original, replacement, position} for reversing anonymization';

COMMIT;
```

## Stop And Rollback Criteria

- If targeted SQL fails: rollback the transaction, stop, and do not resolve the
  migration.
- If `prisma migrate resolve` proof is missing: stop and do not run the resolve.
- If `prisma migrate deploy` fails: stop, inspect the failed migration, and do
  not edit `_prisma_migrations` manually.
- If backend deploy fails: keep the current backend live or redeploy the
  previous known-good backend package.
- If health checks fail: stop rollout, inspect logs, and rollback backend
  package if needed. Do not perform more DB changes.

## Green Criteria Before Execution

- Execution window is scheduled outside busy office hours.
- Latest Azure PostgreSQL backup or restore point is confirmed.
- Optional schema-only snapshot is captured or explicitly waived.
- Read-only prechecks match this runbook.
- Bucket B proof checks are fresh and complete.
- `anonymous_documents` table shape is verified.
- Missing anonymous indexes/comments are repaired and verified, or a written
  decision defers them.
- Communication drift is acknowledged and not conflated with R1A.
- Previous backend package is available for rollback.
- No unrelated local code changes are pending.
- Operator understands DB password rotation remains postponed and separate.

## Password Rotation Note

Database password rotation remains postponed and is separate from migration
history reconciliation. Do not rotate DB passwords as part of this plan.
