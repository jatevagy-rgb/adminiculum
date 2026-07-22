# Shared Attention Category — Runtime Contract (Phase 2)

Date: 2026-07-22

## Canonical enum (unchanged)

Persisted Prisma enum `ReviewAttentionLevel`:
`QUICK_SCAN, APPROVAL, SIGNATURE, EDITING, DETAILED_REVIEW`. Not renamed, not
duplicated as a second persisted enum.

## Shared backend domain module

`Backend/src/modules/tasks/attentionCategory.ts` — the single source of truth for
the taxonomy behaviour (business truth is in the backend, not only frontend
constants):

| Export | Purpose |
|---|---|
| `AttentionCategory` (type) | string-literal union of the five values |
| `ATTENTION_CATEGORY_ORDER` | canonical ordered tuple |
| `ATTENTION_DURATION_BANDS` | indicative planning bands (see duration-contract) |
| `ESTIMATED_MINUTES_MIN` / `_MAX` | 1 / 480 (planning cap = one working day) |
| `isAttentionCategory(v)` | membership guard |
| `parseEstimatedMinutes(v)` | strict validation → `{ok,value}` / `{ok:false,reason}` |
| `itemEstimateRange(item)` | per-item range (explicit > band > null) |
| `aggregateAttentionWorkload(items)` | per-category totals + unclassified count |
| `isCountableWorkloadTask(task,userId)` | no-double-count + user-scope predicate |

### No manual enum duplication

The module defines one canonical ordered tuple and a test asserts
`new Set(ATTENTION_CATEGORY_ORDER)` equals `new Set(Object.values(ReviewAttentionLevel))`
(the same Prisma enum the existing `taskSubmission.service` already uses via
`ATTENTION_VALUES`). Ordering lives in the tuple (Prisma enum object order is not
relied upon); membership is drift-guarded against Prisma.

## Null / unclassified handling

`attentionCategory === null` ⇒ unclassified: counted, **no** duration
contribution, reported as a separate `unclassified.count`. Never defaulted into a
category; no fabricated minutes.

## Actual vs estimate separation

The module deals only in **planning estimates** (bands / explicit
`estimatedMinutes`). Actual worked time (`TimeEntry`, `linkedTimeMinutes`) is
never read or summed here — a hard separation preserved across the contract.

## Frontend presentation module

`Frontend/src/lib/attentionCategory.ts` — prepared, **not yet wired into any
page**: category → label (from the shared `ATTENTION_LABELS`), mark, tone,
accessible label, plus `formatEstimateRange(min,max)` for display. It holds **no
duration-band table** (bands are backend-authoritative; the API supplies computed
ranges). Formatting is kept separate from domain calculation.
