# Task Attention Migration — Execution Plan (Phases 10, 11, 15)

Date: 2026-07-22
Status: plan only — **nothing executed**. Requires a separate approved ticket.

## Migration directory candidate (Phase 10 — NOT created)

Proposed name, newer than the recorded head `20260719120000_add_client_color_key`,
timestamped at the actual execution date:

```
Backend/prisma/migrations/<YYYYMMDDHHMMSS>_add_task_attention_category/migration.sql
```
Suggested suffix: `add_task_attention_category`. The directory and `migration.sql`
are **not created in this audit ticket**. `migration.sql` content = the forward
SQL candidate (see sql-candidate doc).

## Production-head safe method (Phase 11) — avoids historical replay

Because replay is broken at `20260212180000_add_workload_tracking`, **blanket
`prisma migrate deploy` is prohibited** (it would attempt full-history replay).
The approved execution ticket must:

1. Confirm the current production migration head via a live read:
   `SELECT migration_name FROM "_prisma_migrations" WHERE rolled_back_at IS NULL ORDER BY finished_at DESC LIMIT 1;`
   → expect `20260719120000_add_client_color_key`.
2. Confirm schema metadata again (enum values, `tasks` columns absent, existing
   `tasks` indexes) — the metadata read this audit could not perform.
3. Create the single additive migration directory (above) with the audited SQL.
4. Inspect the SQL (diff vs this candidate).
5. Apply **only that migration** against the current head — **not** replay.
6. Verify columns/index/enum present.
7. Verify exactly one `_prisma_migrations` record for it.
8. Never run blanket historical replay.

### Permitted execution method

Prisma cannot safely apply only the new migration via `migrate deploy` when the
recorded history diverges from a replayable state (broken replay). Two permitted
methods, **each under separate explicit approval**:

- **Method 1 (preferred) — reviewed direct SQL + controlled history record:**
  run the audited `migration.sql` via a single reviewed
  `psql`/`prisma db execute --file` against the production head (one statement
  block, fail-fast, inside one transaction for the columns; index per locking
  doc), then insert the corresponding `_prisma_migrations` row (id, checksum,
  migration_name, finished_at) so Prisma's history stays consistent. This mirrors
  the production-head-additive method used for `20260719120000_add_client_color_key`.
- **Method 2 — `prisma migrate resolve --applied`** for the new migration only,
  after applying its SQL out-of-band, to record it without replay. (Still not
  `migrate deploy`.)

Do not use vague "run the migration". Do not `db push`. Do not `migrate deploy`.

## Future verification plan (Phase 15)

**Before:** enum exists (5 values); `tasks.attentionCategory` /
`tasks.estimatedMinutes` absent; `tasks_attentionCategory_idx` absent (if index
intended); head = `20260719120000_add_client_color_key`.

**After:**
- both columns present and **nullable**;
- `attentionCategory` type = `ReviewAttentionLevel`; `estimatedMinutes` type =
  `integer`;
- index exact (if created);
- pre-existing Task rows unchanged and valid; **row count unchanged**; no Task
  content modified;
- old backend still healthy (`/health` 200, task/case reads 200);
- `prisma validate` / `prisma generate` green against the new head;
- exactly one non-rolled-back `_prisma_migrations` record for the new migration.

**Rollback test (disposable DB only):** apply → verify → run rollback SQL →
verify original schema restored. Never on production.

## Estimated-minutes validation boundary (Phase 6)

**Application-only validation** (`1 ≤ estimatedMinutes ≤ 480`) for the first
release — **no DB CHECK constraint**. Rationale: smallest additive migration,
easiest rollback, and the deployed schema validates such ranges in application
code (e.g. `requestedAttention` has no DB CHECK), so adding a DB check here would
introduce a validation style inconsistently. A DB CHECK may be added later if a
schema-wide policy adopts it. Not added silently outside the schema candidate.
