# Task Attention Migration — Partial-Application Handling (Phase 12)

Date: 2026-07-22

Never mask partial state with `IF NOT EXISTS`. Each state is detected by a
read-only metadata query and handled explicitly.

Detection queries:
- columns: `SELECT column_name FROM information_schema.columns WHERE table_name='tasks' AND column_name IN ('attentionCategory','estimatedMinutes');`
- index: `SELECT indexname FROM pg_indexes WHERE tablename='tasks' AND indexname='tasks_attentionCategory_idx';`
- migration record: `SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name LIKE '%add_task_attention_category';`

| # | State | Detection | Safe action |
|---|---|---|---|
| 1 | Neither column nor index exists | 0 columns, no index | Clean start → apply full forward SQL. History may be recorded on success. |
| 2 | `attentionCategory` only | 1 of 2 columns | **Partial apply — STOP.** Do not blindly re-run (fail-fast SQL would error on the existing column). Repair: add only the missing `estimatedMinutes` (and index if intended) under review; then record history once. |
| 3 | Both columns, index missing | 2 columns, no index | If index intended: create only the index. If index deferred: this is the intended end state. Record history once. |
| 4 | Index exists but migration record missing | index present, no `_prisma_migrations` row | Schema is ahead of history. Do **not** re-apply DDL. Repair = record the migration as applied (history-only), under separate approval; verify columns+index first. |
| 5 | Migration record exists but schema incomplete | history row present, columns/index missing | **Dangerous inconsistency.** Do not trust history. STOP; reconcile by inspecting actual schema and correcting the `_prisma_migrations` row + missing DDL under explicit approval. |
| 6 | Schema complete, backend old | columns+index present, backend = current | Safe (additive; old backend ignores new columns — matrix case B). No action. |
| 7 | Schema complete, candidate backend not deployed | columns+index present, no field-reading backend | Safe intended interim state. Proceed to backend rollout next (rollout-order). |

## Principles

- Fail-fast SQL surfaces states 2–5 as errors/anomalies rather than silently
  "completing".
- History (`_prisma_migrations`) is recorded **once**, only after the schema is
  verified complete.
- Any state 2/4/5 requires a **live metadata read** to diagnose and a
  **separate explicit approval** to repair — reinforcing the metadata gate.
