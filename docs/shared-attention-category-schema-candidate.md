# Shared Attention Category — Prisma Schema Candidate (Phase 4)

Date: 2026-07-22
Branch: `claude/shared-attention-category-domain-1` (base `a578c2a` via audit `84e1d1d`)

## No migration created or run

- **No** migration directory added or edited (`Backend/prisma/migrations/` is
  zero-diff).
- **No** `prisma migrate dev` / `migrate deploy` executed.
- **No** database connection. `prisma validate` and `prisma generate` operate on
  the schema/generated client only.
- `prisma format` was **not** committed — it would reformat the entire (non-canonical)
  file; only the minimal additive edit is kept so the diff shows just the candidate.

## Exact additive change (schema.prisma, `model Task`)

```diff
   lastProgressAt  DateTime?
   stuckSince      DateTime?
+
+  // Shared attention-category workload planning (candidate — additive, nullable).
+  // Reuses the existing ReviewAttentionLevel enum (no new/renamed enum). Nullable
+  // so legacy rows stay unclassified with no default; estimatedMinutes is an
+  // optional explicit PLANNING estimate (never actual time — that stays in TimeEntry).
+  attentionCategory ReviewAttentionLevel?
+  estimatedMinutes  Int?
 
   // Dates
   dueDate         DateTime?
...
  @@index([stuckReason], map: "tasks_stuckReason_idx")
  @@map("tasks")
```

## Confirmations

- **Nullable preserves legacy rows.** `attentionCategory` and `estimatedMinutes`
  are both `?` (nullable) with **no `@default`** — existing Task rows remain
  unclassified, no data rewrite required.
- **TaskSubmission.requestedAttention unchanged.** No edit to the submission model.
- **No enum rename / no new enum.** Reuses the deployed `ReviewAttentionLevel`.
- **No destructive statement.** Two additive nullable columns only.
- **No false default.** Nothing classifies a legacy task automatically.
- **No backfill required for deployment safety** — the columns are optional.
- **No first-migration index.** Production metadata proved `tasks` is tiny
  (`96 kB` total relation size), and `attentionCategory` is a five-value
  low-cardinality enum. A standalone index is intentionally rejected for the
  initial candidate; future indexing must be evidence-driven.

## Production metadata alignment

The production metadata audit at
`claude/task-attention-migration-audit-1` / `baf4ca6` proved:

- PostgreSQL 15.18;
- migration head `20260719120000_add_client_color_key`;
- `ReviewAttentionLevel` exists with the five expected values;
- `tasks.attentionCategory` and `tasks.estimatedMinutes` are absent;
- no partial application state exists;
- current `tasks` indexes are pkey plus complexity/maturity/risk/stuckReason;
- `tasks` total relation size is `96 kB`.

The schema candidate therefore contains only:

```prisma
attentionCategory ReviewAttentionLevel?
estimatedMinutes  Int?
```

and no `@@index([attentionCategory])` or replacement composite index.

## Validation performed (schema-only, no DB)

- `prisma validate` → "The schema … is valid 🚀".
- `prisma generate` → client generated (into `node_modules`, not committed).
- Backend `tsc`, full test suite (56 suites / 525 tests), and `build` pass with
  the generated fields present but unused (no runtime rollout).

## Remaining migration gate

Applying these columns to the production database requires a **separate approved
migration ticket**. Blanket `prisma migrate deploy` is prohibited because
historical replay is broken at `20260212180000_add_workload_tracking`; the
migration must be authored as a production-head-additive migration (pattern:
`20260719120000_add_client_color_key`). See migration-readiness doc.
