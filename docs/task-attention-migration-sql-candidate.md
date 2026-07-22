# Task Attention Migration — SQL Candidate (Phase 5)

Date: 2026-07-22
Status: candidate — **NOT executed**. Pending live-metadata confirmation (blocker).

## Exact forward SQL candidate

Grounded in applied-DDL conventions (enum-column ADD from the recorded head;
table `"tasks"`; enum type `"ReviewAttentionLevel"`). Fail-fast (no
`IF NOT EXISTS`) to match the recorded head `add_client_color_key` and to avoid
hiding partial-deployment state.

```sql
-- AlterTable (additive, nullable — no NOT NULL, no DEFAULT, no CHECK, no FK)
ALTER TABLE "tasks" ADD COLUMN "attentionCategory" "ReviewAttentionLevel",
                    ADD COLUMN "estimatedMinutes" INTEGER;

-- CreateIndex (see index-audit — this single-column form is PROVISIONAL,
-- pending live inspection of existing tasks indexes and query plans)
CREATE INDEX "tasks_attentionCategory_idx" ON "tasks"("attentionCategory");
```

Equivalent split form (Prisma may emit either):
```sql
ALTER TABLE "tasks" ADD COLUMN "attentionCategory" "ReviewAttentionLevel";
ALTER TABLE "tasks" ADD COLUMN "estimatedMinutes" INTEGER;
```

## What the SQL does NOT contain (by requirement)

- no `NOT NULL`;
- no `DEFAULT` (legacy rows stay `NULL` / unclassified — no false classification);
- no `CHECK` constraint (estimate range is application-validated — see boundary doc);
- no trigger, no foreign key;
- no data update / backfill;
- no enum creation or alteration;
- no `CREATE INDEX CONCURRENTLY` (see locking doc; a plain `CREATE INDEX` inside
  the migration transaction is the default; concurrently is only considered if
  live table size warrants it, with the transaction caveat documented);
- no `IF NOT EXISTS` (fail-fast; partial state must be detected, not masked —
  see partial-application doc).

## Identifier confidence

| Identifier | Confidence | Basis |
|---|---|---|
| table `"tasks"` | High | applied `ALTER TABLE "tasks"` + FK references |
| enum `"ReviewAttentionLevel"` | High | applied `CREATE TYPE` before the recorded head |
| column names `attentionCategory`, `estimatedMinutes` | High | Prisma maps field→column 1:1 (no `@map`) |
| index name `tasks_attentionCategory_idx` | High | matches schema `map:` + Prisma default convention |
| **absence of the two columns in prod** | **UNPROVEN** | requires live `information_schema.columns` read |
| **existing `tasks` indexes** | **UNPROVEN** | not in migration history (drift) — requires live `pg_indexes` |

The two UNPROVEN rows are why execution is blocked on a live metadata pass.

## Idempotency audit

The SQL is intentionally **non-idempotent** (fail-fast). If any object already
exists, the statement errors — which is the desired signal for a partial
deployment (see partial-application doc), not something to suppress with
`IF NOT EXISTS`.

## 2026-07-22 execution-readiness update

The SQL remains **candidate only** and was not executed. The approved metadata
retry stopped before firewall creation because Entra administrator proof returned
empty. No token, connection, transaction, query, DDL, DML, migration command, or
schema mutation was used.

The exact forward and rollback SQL must not be treated as approved for execution
until live metadata confirms:

- current migration head;
- `ReviewAttentionLevel` values;
- absence of `tasks.attentionCategory` and `tasks.estimatedMinutes`;
- existing `tasks` indexes;
- `tasks` size and approximate row count;
- no partial-application state.
