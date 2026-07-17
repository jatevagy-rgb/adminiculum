# Task Lifecycle Visual QA

Date: 2026-07-17

## Status

Full authenticated lifecycle visual QA was not executed because the persistence audit stopped the workflow before fake Leadás, time, return-history or approval states could be created.

## Static/UI Checks Implemented

- `Review / leadás` combined heading removed.
- Separate `Állapot` and `Leadás` columns present.
- Case and client condensed into one column to reduce table width.
- Direct list-row submit/approve/return controls removed.
- Review deep link uses `/reviews?taskId=...`.
- Selected task panel collapses when no task is selected.
- Task Leadás status is not inferred from task status.
- Derived attention copy is explicitly `Javasolt`.
- Ordinary user-facing handoff copy uses `Leadás`.

## Screenshot Gate

No screenshots are recorded as lifecycle proof. Required state captures at 1366×768 and 1440×900 remain pending until an approved persisted model and local synthetic lifecycle can produce truthful states after refresh.

## Result

Visual release acceptance: blocked by schema gate, not failed layout QA.

Classification: `TASK_LIFECYCLE_SCHEMA_APPROVAL_REQUIRED`
