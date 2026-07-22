# Task Attention Migration — Locking & Operational Impact (Phase 8)

Date: 2026-07-22

## Adding two nullable columns without default

On PostgreSQL (all supported versions ≥ 11), `ADD COLUMN ... <nullable, no
default>` is a **metadata-only** change:
- takes a brief `ACCESS EXCLUSIVE` lock on `"tasks"` for the catalog update;
- **no table rewrite**, **no row scan** (the columns are simply NULL for existing
  rows);
- duration is effectively constant regardless of row count;
- write-blocking is limited to the sub-second catalog lock (may queue briefly
  behind long-running transactions on `tasks`).

Nullable + no default is specifically chosen to keep this metadata-only.

## Creating the index

- Plain `CREATE INDEX "tasks_attentionCategory_idx" ON "tasks"(...)` takes a
  `SHARE` lock: it **blocks writes** (INSERT/UPDATE/DELETE) on `tasks` for the
  build duration, but allows reads. Duration scales with table size.
- `CREATE INDEX CONCURRENTLY` avoids blocking writes but **cannot run inside a
  transaction block**. Prisma wraps each migration in a transaction by default,
  so `CONCURRENTLY` is **incompatible** with a standard Prisma-applied migration
  unless the migration is authored to run outside the transaction (e.g. Prisma's
  `-- CreateIndex` is emitted without CONCURRENTLY; using CONCURRENTLY requires a
  non-transactional execution path and manual `_prisma_migrations` recording).

## Recommendation

- **Columns:** safe any time (metadata-only). No special window.
- **Index:** given the low-cardinality single-column index is itself
  questionable (see index-audit), prefer to **defer the index** or add a measured
  composite later. If an index is added in this migration:
  - if `tasks` is small (unknown without metadata), a plain `CREATE INDEX` in the
    Prisma transaction is fine (brief write block);
  - if `tasks` is large, either schedule a low-traffic window for the plain build,
    or apply the index **separately** via `CREATE INDEX CONCURRENTLY` outside the
    Prisma transaction with controlled migration-history recording (separate
    approval). **Do not** put `CONCURRENTLY` inside the Prisma-transaction
    migration.
- **Table size is unknown** (no metadata read) — the window/method decision must
  be finalized after a live size/plan check.

## Deployment window

- Columns-only: no window needed.
- Index: default to a low-traffic window for a plain build; only use CONCURRENTLY
  (separate path) if size demands it.

## Rollback strategy

Schema-only and fast: drop index, drop the two columns (see rollback doc). All
metadata-only / index-drop operations; no data movement.

## Traffic risk

Minimal for the columns. The only material risk is the index build's write lock
on a large `tasks` table — mitigated by defer/composite/CONCURRENTLY-separate.

## 2026-07-22 live sizing attempt

The approved metadata retry did not obtain `tasks` size or approximate row count.
The run stopped before firewall creation because Entra administrator proof
returned empty via Azure CLI and ARM.

Locking assessment therefore remains conditional:

- nullable column additions are still expected to be metadata-only;
- index locking cannot be finalized without live `tasks` size and index proof;
- production execution approval remains blocked.
