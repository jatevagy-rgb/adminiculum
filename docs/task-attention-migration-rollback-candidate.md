# Task Attention Migration — Rollback Candidate (Phase 9)

Date: 2026-07-22
Status: candidate — **NOT executed**.

## Rollback SQL (schema-only, reverse order)

```sql
-- Drop the index first (if it was created)
DROP INDEX "tasks_attentionCategory_idx";

-- Then the columns (reverse of creation order)
ALTER TABLE "tasks" DROP COLUMN "estimatedMinutes";
ALTER TABLE "tasks" DROP COLUMN "attentionCategory";
```

If the index was deferred (per index-audit), omit the `DROP INDEX`.

## Must NOT be dropped

- `"ReviewAttentionLevel"` enum type (shared with `task_submissions`);
- `task_submissions."requestedAttention"` or any Review data;
- any other index/column/constraint on `tasks`.

## Data-loss note

Rollback after the runtime has written values loses **only the new planning
metadata** (`attentionCategory` / `estimatedMinutes` on `tasks`). It does **not**
delete Task rows or any other field. Because the columns are additive and
nullable, dropping them cannot cascade to related data.

## Idempotency / partial rollback

Fail-fast (no `IF EXISTS`): a rollback statement errors if the object is already
absent — the desired signal for verifying exactly how far a partial apply/rollback
progressed. Order matters: drop the index before the column it references.

## Testing

Rollback is validated only in a **disposable database** (see test-plan), never in
production.
