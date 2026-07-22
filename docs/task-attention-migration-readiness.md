# Task Attention Migration — Readiness (Phases 4, 14 + summary)

Date: 2026-07-22
Branch: `claude/task-attention-migration-audit-1` (base `115cd01`)

## Outcome

Read-only migration audit and SQL candidate prepared. **Blocked** on the one hard
prerequisite: a live read-only production metadata inspection, for which no
authorized connection was separately available (see production-metadata doc). The
repository cannot substitute — the `tasks` table and its indexes are not in the
committed migration history (broken/incomplete history), so the exact production
state and column-absence cannot be proven from the repo.

## Task table current-state (Phase 4) — expected, UNCONFIRMED

Expected (candidate assumption, requires live confirmation):
- `tasks.attentionCategory` absent; `tasks.estimatedMinutes` absent;
- adding both nullable ⇒ **no backfill**, existing rows remain valid, **no table
  rewrite**, no FK, no uniqueness;
- row count obtainable metadata-safely (`SELECT reltuples FROM pg_class WHERE
  relname='tasks'`) at execution time — not read here.

These cannot be asserted as fact without the live read → blocker.

## Privacy & retention (Phase 14)

- New fields hold only an **enum planning classification** and an **integer
  planning estimate** — no task description, legal analysis, client/document/
  communication content.
- Retention follows the Task lifecycle: deleting a Task removes the fields with
  it; no separate retention store.
- Audit stays content-light (`TASK_ATTENTION_CATEGORY_CHANGED` /
  `TASK_ESTIMATE_CHANGED`: task id, old→new, actor, timestamp).

## DONE-MEANS status

| # | Criterion | Status |
|---|---|---|
| 1 | production metadata inspected read-only | ❌ (no authorized connection) |
| 2 | enum existence + values proven | ⚠️ proven from applied DDL; live confirm pending |
| 3 | current Task columns proven absent | ❌ requires live read |
| 4 | exact SQL candidate prepared | ✅ |
| 5 | index choice justified | ✅ (recommend defer/composite; candidate single-col is provisional) |
| 6 | locking impact assessed | ✅ |
| 7 | rollback SQL prepared | ✅ |
| 8 | partial-application handling defined | ✅ (7 states, fail-fast) |
| 9 | old/new backend compatibility documented | ✅ (B safe, E unsafe) |
| 10 | execution method avoids historical replay | ✅ (reviewed SQL + controlled record; no migrate deploy) |
| 11 | no DB mutation | ✅ (no connection made) |
| 12 | no migration directory created | ✅ |
| 13 | docs-only branch pushed | ✅ |

## Remaining blocker

A separately-provisioned, authorized **read-only production DB connection** to
run the metadata queries in the metadata/enum/partial-application docs. With that,
criteria 1–3 close and the audit advances to
`TASK_ATTENTION_MIGRATION_AUDIT_READY_FOR_EXECUTION_APPROVAL`. A secondary,
metadata-dependent item: finalize the **index strategy** (the single-column
candidate should likely become a composite or be deferred).

## Zero-change confirmation

No runtime change, no schema change, no migration directory, no DB write, no
deployment, no Azure change in this audit.

## Classification

`TASK_ATTENTION_MIGRATION_METADATA_BLOCKER`
