# Task Attention Migration — Production Metadata (Phase 2)

Date: 2026-07-22
Branch: `claude/task-attention-migration-audit-1` (base `115cd01`)

## Read-only production metadata access: NOT AVAILABLE

A live read-only production PostgreSQL connection authorized for metadata
inspection was **not separately available**:

- no `DATABASE_URL` / `POSTGRES*` in the environment;
- no `Backend/.env` with a production connection string;
- `psql` client not installed;
- no read-only replica endpoint provided.

Per the ticket, production metadata must be inspected via a **separately
available and authorized** read-only connection; it must **not** be inferred
solely from `schema.prisma`, and a production write credential must **not** be
extracted (e.g. from Azure app settings) to manufacture a connection. None was
available, so the required live inspection of `information_schema.columns`,
`pg_type` / `pg_enum`, `pg_indexes`, and `_prisma_migrations` was **not
performed**.

## Why this is a material blocker, not a formality

The committed migration history is **incomplete for the `tasks` table**:

- **No committed migration creates the `tasks` table** (0 occurrences in the
  `20260211153100_baseline` migration; the table is only referenced later via
  `ALTER TABLE "tasks"` and FK `REFERENCES "tasks"("id")`).
- The `tasks_*_idx` indexes declared in `schema.prisma`
  (`tasks_complexityScore_idx`, `tasks_maturityStage_idx`, `tasks_riskScore_idx`,
  `tasks_stuckReason_idx`) are **not created by any committed migration**.

This is consistent with the known constraint that historical replay is broken at
`20260212180000_add_workload_tracking`. Therefore the **exact current `tasks`
column set and index set cannot be proven from the repository**, and the presence
of the two new columns cannot be confirmed absent without a live read. A live
read-only metadata pass is a genuine prerequisite.

## Evidence actually used (repo, applied DDL — NOT a live read)

Where identifiers/conventions are stated in this audit set, they are grounded in
**applied migration DDL** (SQL that ran against production, since the recorded
head `20260719120000_add_client_color_key` is at or after it) and in Prisma's
deterministic naming — explicitly distinguished from a live production read:

| Fact | Source (applied DDL) |
|---|---|
| Enum `"ReviewAttentionLevel"` exists with the five values | `20260718120000_add_task_submission_workflow/migration.sql:8` |
| `TaskSubmission.requestedAttention "ReviewAttentionLevel"` (nullable) | same migration `:34` |
| Table name is `"tasks"` | `…add_task_submission_workflow:143` FK `REFERENCES "tasks"("id")`; `…add_communication_baseline:56` `ALTER TABLE "tasks"` |
| Enum-column ADD convention (quoted enum type, nullable, no default) | recorded head `20260719120000_add_client_color_key`: `ALTER TABLE "clients" ADD COLUMN "colorKey" "ClientColorKey";` |
| Index naming convention `"table_col_idx"` | `task_submissions_taskId_status_idx`, etc. |

## Not inspected

No Task row content, client, matter, task-description, or legal content was
accessed (no DB connection was made at all).

## Classification driver

Because DONE-MEANS #1 ("production metadata is inspected read-only") is unmet and
the repo cannot substitute for it (broken/incomplete history), this audit ends at
**TASK_ATTENTION_MIGRATION_METADATA_BLOCKER**. The SQL candidate and full rollout
analysis are prepared so a future run with authorized read-only access can
confirm-and-proceed quickly.

## 2026-07-22 metadata retry: authentication proof blocker

A later ticket authorized a temporary single-IP PostgreSQL firewall rule and one
Entra-token TLS connection attempt. The run stopped before firewall creation
because the required Entra administrator proof failed:

- server `adminiculum` was Ready;
- `activeDirectoryAuth` and `passwordAuth` were Enabled;
- current Azure identity was `hubay.gyula@balintfy.onmicrosoft.com`;
- current public egress IP was `37.76.6.18`;
- frontend and backend health returned HTTP 200;
- Azure CLI `microsoft-entra-admin list` returned `[]`;
- ARM `Microsoft.DBforPostgreSQL/flexibleServers/administrators` returned `[]`.

Per the authorized procedure, no firewall rule was created, no token was
requested, no database connection was attempted, and no metadata was obtained.
The temporary rule name `metadata-audit-client-20260722` was verified absent
after the stopped run.

Updated blocker:
`POSTGRES_METADATA_AUTHENTICATION_BLOCKER` /
`TASK_ATTENTION_MIGRATION_METADATA_INCOMPLETE`
