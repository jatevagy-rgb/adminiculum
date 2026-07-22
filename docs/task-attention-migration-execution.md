# Task Attention Production Migration Execution

Date: 2026-07-22

Migration: `20260722135148_add_task_attention_category`

## Target

- Production server: `adminiculum.postgres.database.azure.com`.
- Database: `adminiculum`.
- Schema: `public`.
- PostgreSQL version: `15.18`.
- Pre-apply migration head: `20260719120000_add_client_color_key`.

## Migration SQL

Review-only source file:

`Backend/prisma/migrations/20260722135148_add_task_attention_category/migration.sql`

```sql
ALTER TABLE "tasks"
  ADD COLUMN "attentionCategory" "ReviewAttentionLevel",
  ADD COLUMN "estimatedMinutes" INTEGER;
```

- SHA-256: `0FA432F258B6B82CFB751F3E676321D4D6F2D761866F07D045EE2DD8DEC0DD9E`.
- SQL scope: one `ALTER TABLE "tasks"` statement.
- Added columns: `attentionCategory`, `estimatedMinutes`.
- Not included: index creation, enum changes, defaults, `NOT NULL`, checks, backfill, data updates, unrelated DDL.

## Execution Method

- Used the established production-head one-shot Node/`pg` method.
- Used Microsoft Entra authentication with an ephemeral token.
- Did not use app credentials.
- Did not run `prisma migrate deploy`, `prisma migrate dev`, `prisma db push`, or historical replay.
- Applied only the reviewed SQL against the verified production head.
- Verified physical schema before writing the `_prisma_migrations` record.

## Execution Result

- Start: `2026-07-22T11:57:18.693Z`.
- Schema commit proof time: `2026-07-22T11:57:19.076Z`.
- Migration history record time: `2026-07-22T11:57:19.210Z`.
- End: `2026-07-22T11:57:19.281Z`.
- Result: migration SQL committed successfully.
- Attempts: 1.
- Row data touched: none.

## Safety Notes

- No backend deploy occurred.
- No frontend deploy occurred.
- No runtime feature rollout occurred.
- No seed or fake data was added.
- No Task row content was read or updated.
