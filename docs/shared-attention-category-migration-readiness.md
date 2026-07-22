# Shared Attention Category — Migration Readiness (Phase 4 / gate)

Date: 2026-07-22

## This ticket created NO migration and made NO DB access

- `Backend/prisma/migrations/` — zero diff.
- No `prisma migrate dev` / `migrate deploy` / `db push`.
- No database connection (validate/generate are schema/client only, run with a
  dummy `DATABASE_URL`).

## What the separate migration ticket must do

Apply two additive nullable columns to the `tasks` table:
```sql
ALTER TABLE "tasks" ADD COLUMN "attentionCategory" "ReviewAttentionLevel";
ALTER TABLE "tasks" ADD COLUMN "estimatedMinutes" INTEGER;
```
(illustrative — the enum type `ReviewAttentionLevel` already exists in production;
no enum creation/alteration.)

Do **not** create `tasks_attentionCategory_idx` in the first migration.
Production metadata proved the table is tiny (`96 kB` total relation size), and
the five-value enum does not justify a standalone category index without runtime
query evidence. A future candidate could be a measured composite such as
`assignedToId + attentionCategory`, but that is not authorized or required now.

## Constraints for that ticket

- **Blanket `prisma migrate deploy` is prohibited** — historical replay is broken
  at `20260212180000_add_workload_tracking`.
- Author a **production-head-additive** migration against the deployed head
  `20260719120000_add_client_color_key`, following the pattern used for the
  client-color migration (apply and record once; no full-history replay).
- Additive + nullable ⇒ safe on a populated table; zero destructive statements;
  no backfill required for deployment safety.
- Requires explicit human approval and a production-head clone proof, as with
  prior schema releases.

## Readiness checklist

| Item | State |
|---|---|
| Schema candidate authored | ✅ (additive, nullable, `prisma validate` OK) |
| Enum reused, not renamed | ✅ |
| First-migration index | ✅ intentionally omitted |
| Domain contract + validation + aggregation implemented & tested | ✅ |
| DTO / authorization / audit / dashboard contracts documented | ✅ |
| Migration created | ❌ (intentionally deferred) |
| DB accessed | ❌ |
| Runtime rollout of Task fields | ❌ (candidate only) |

## Remaining gate

Production availability of `Task.attentionCategory` / `estimatedMinutes` is gated
on the separate approved migration ticket. Until then the columns exist only in
the schema candidate + generated client; no runtime path reads or writes them.
