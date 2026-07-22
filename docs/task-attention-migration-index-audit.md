# Task Attention Migration — Index Audit (Phase 7)

Date: 2026-07-22

## Query patterns

- **Tasks filter:** `WHERE "attentionCategory" = $1` (+ status/assignee filters).
- **Dashboard workload (assignee-scoped):**
  `WHERE "assignedToId" = $me AND "status" NOT IN (<closed>)` then group by
  `"attentionCategory"`.

The dominant read is **assignee-scoped**; `attentionCategory` alone is a
5-value, low-cardinality column.

## Options

| Option | Index | Assessment |
|---|---|---|
| A | `("attentionCategory")` (the current candidate) | Low cardinality (5 values); Postgres often ignores a standalone low-selectivity index; adds write cost for little read benefit unless the table is large and category filters are highly selective. |
| B | `("assignedToId", "attentionCategory")` | Leads with a selective column matching the assignee-scoped aggregation; supports both the workload query and category filtering within a user. |
| C | `("assignedToId", "status", "attentionCategory")` | Best matches the workload predicate (assignee + open status) and still allows category grouping; largest/most specific. |
| D | none initially | Smallest migration; rely on any existing `assignedToId`/`status` index + sequential category grouping until query plans justify a new index. |

## Recommendation (pending live metadata)

**Preferred: defer the dedicated index (Option D) in the FIRST additive
migration, then add a measured composite (Option B or C) in a follow-up** — OR,
if an index is wanted immediately, use **Option B `("assignedToId",
"attentionCategory")`**, not the single-column Option A.

Rationale:
- The single-column Option A on a 5-value enum is unlikely to be optimal and may
  be unused by the planner.
- The correct composite depends on the **existing `tasks` indexes**, which are
  **not in the migration history** and are therefore **unknown without a live
  `pg_indexes` read**. If `("assignedToId", "status")` already exists, a new
  index may be redundant or should extend it.

## Schema-candidate implication

The schema candidate (`115cd01`) currently declares
`@@index([attentionCategory])` (Option A). Per this audit that single-column
index is **provisional and likely should change** (to Option B/C, or be deferred).
This is **not** corrected here (docs-only audit; no schema change). It is recorded
as a schema-candidate correction to apply **after** the live index inspection.

Because the exact existing-index set cannot be read, the index decision is itself
gated by the metadata blocker; it does not, on its own, upgrade to
`INDEX_STRATEGY_BLOCKER` — the primary blocker remains missing metadata.
