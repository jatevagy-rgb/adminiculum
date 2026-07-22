# Task Attention Migration — Enum Proof (Phase 3)

Date: 2026-07-22

## Result

The PostgreSQL enum for `ReviewAttentionLevel` is proven to exist in production
**from applied migration DDL** (not a live read — see metadata doc).

## Evidence

`Backend/prisma/migrations/20260718120000_add_task_submission_workflow/migration.sql:8`:
```sql
CREATE TYPE "ReviewAttentionLevel" AS ENUM ('QUICK_SCAN', 'APPROVAL', 'SIGNATURE', 'EDITING', 'DETAILED_REVIEW');
```
And `:34` uses it (nullable):
```sql
"requestedAttention" "ReviewAttentionLevel",
```

The recorded production migration head is `20260719120000_add_client_color_key`,
which is **after** `20260718120000`, so this enum-creating migration has been
applied to production.

| Property | Value (from applied DDL) |
|---|---|
| Exact PostgreSQL type name | `"ReviewAttentionLevel"` (double-quoted) |
| Schema | `public` (default; the migrations use unqualified quoted identifiers) |
| Enum values | `QUICK_SCAN, APPROVAL, SIGNATURE, EDITING, DETAILED_REVIEW` |
| Order | as listed above |
| Used by | `task_submissions."requestedAttention"` (nullable) |

These match the candidate exactly.

## Action

**Do not create or alter the enum.** The candidate migration reuses the existing
type via `"ReviewAttentionLevel"` on the new `tasks."attentionCategory"` column.

## Live confirmation still required (blocker)

A live read must confirm (before execution) via:
```sql
SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'ReviewAttentionLevel' ORDER BY e.enumsortorder;
```
Expected: the five values in the order above. If the live enum differs →
`TASK_ATTENTION_MIGRATION_ENUM_BLOCKER`. Applied-DDL evidence indicates it will
match, but this is not a substitute for the live check.

## 2026-07-22 live confirmation attempt

The approved metadata retry did not reach the live enum query. Entra
administrator proof returned empty via both Azure CLI and ARM, so the flow
stopped before firewall creation and before any database token or TLS connection.

Live enum status remains **unconfirmed**. The applied-DDL proof above is still
the best available evidence, but it does not close the live metadata requirement.

## 2026-07-22 live enum confirmation

The live read-only metadata query confirmed `ReviewAttentionLevel` in `public`
with the expected values and order:

| Order | Value |
|---:|---|
| 1 | `QUICK_SCAN` |
| 2 | `APPROVAL` |
| 3 | `SIGNATURE` |
| 4 | `EDITING` |
| 5 | `DETAILED_REVIEW` |

Result: no enum blocker. The Task Attention migration must reuse the existing
`"ReviewAttentionLevel"` type and must not create or alter it.
