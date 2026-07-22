# Shared Attention Category — Duration Contract (Phase 3)

Date: 2026-07-22

## Bands (authoritative, backend)

`ATTENTION_DURATION_BANDS` in `Backend/src/modules/tasks/attentionCategory.ts`:

| Category | min | max |
|---|---|---|
| QUICK_SCAN | 5 | 15 |
| APPROVAL | 10 | 20 |
| SIGNATURE | 5 | 10 |
| EDITING | 30 | 60 |
| DETAILED_REVIEW | 60 | 120 |

Indicative **planning** values only — **not** billing time, actual work time,
SLA, performance target, or commitment. One authoritative backend source; the
frontend never re-declares them.

## Per-item precedence (`itemEstimateRange`)

1. explicit valid `estimatedMinutes` → `{min: v, max: v}`;
2. else category band → `{band.min, band.max}`;
3. else (null category) → `null` (no duration; unclassified count only).

A null-category item contributes no duration even if an estimate is present
(bucketed as unclassified, count only).

## Aggregation (`aggregateAttentionWorkload`)

Per category (all five returned in canonical order, zeros included):
`count`, `minMinutes = Σ per-item min`, `maxMinutes = Σ per-item max`.
Plus `unclassified.count`. The caller passes **one item per task** (see
no-double-counting); the function counts each item exactly once.

## Estimate validation (`parseEstimatedMinutes`)

Accept: integer in `[1, 480]`. Reject with a typed reason (never silently clamp):

| Input | Reason |
|---|---|
| non-number / NaN / Infinity / string | `NOT_A_NUMBER` |
| decimal (e.g. 12.5) | `NOT_INTEGER` |
| 0 or negative | `NOT_POSITIVE` |
| > 480 | `TOO_LARGE` |

The API maps a rejection to a stable `400 INVALID_ESTIMATED_MINUTES` (see DTO
candidate). `null`/absent is allowed (optional field) and handled by the caller.

## Display formatting (frontend `formatEstimateRange`)

Formats an API-provided `(min,max)` minute range; no precision invented:

| Case | Output |
|---|---|
| both < 60 | `kb. 25–50 perc` |
| both ≥ 60 | `kb. 1–2 óra` / `kb. 3–6 óra` |
| min < 60 ≤ max | `kb. 45 perc–2 óra` |
| min == max | collapse → `kb. 50 perc` / `kb. 2 óra` |
| fractional hours | Hungarian comma, one decimal → `kb. 1,5 óra` |
| zero/empty | `""` (caller renders count-only) |

Verified by 10 frontend + 21 backend tests (see test docs).
