# Task Attention Runtime Rollout Gate

Date: 2026-07-22

## Current Gate

The production database now contains the additive `tasks` columns needed for a later runtime rollout:

- `attentionCategory`.
- `estimatedMinutes`.

No API, UI, or background behavior currently depends on these columns from this task.

## What Is Still Required

A separate runtime rollout ticket must decide and validate:

- backend read/write API behavior for the new task attention fields;
- frontend task form and display behavior;
- Dashboard or workload presentation, if any;
- input validation and Hungarian labels;
- permission boundaries;
- route tests;
- authenticated browser smoke.

## Explicit Non-Goals From This Migration

- No backend runtime deployment.
- No frontend deployment.
- No Dashboard workload cards.
- No API wiring.
- No default, `NOT NULL`, check constraint, or backfill.
- No index in the first migration.
- No fake task attention values.

## Recommended Next Prompt

`Adminiculum — TASK-ATTENTION-RUNTIME-ROLLOUT-1`

This next task should start from the production schema state documented here and must remain separate from the production-head migration apply.
