# Task Attention Migration Rollback Plan

Date: 2026-07-22

## Rollback Status

Rollback was not needed.

The migration completed successfully, both columns were verified, the migration history row was recorded once, and backend/frontend health remained green.

## Rollback Criteria

Rollback would only be considered if:

- migration application was materially incomplete;
- metadata verification failed;
- the old backend regressed because of the additive columns;
- production health regressed in a way attributable to this migration.

Rollback is not required merely because runtime usage of the new fields is not deployed yet.

## Candidate Rollback SQL

```sql
ALTER TABLE "tasks"
  DROP COLUMN "estimatedMinutes",
  DROP COLUMN "attentionCategory";
```

## Objects Not To Drop

Do not drop:

- `ReviewAttentionLevel`;
- `TaskSubmission.requestedAttention`;
- Task rows;
- unrelated task workflow or review objects.

## Operational Notes

Any rollback would require a separate explicit approval, production metadata precheck, firewall/token cleanup, and migration-history decision. No rollback was performed in this task.
