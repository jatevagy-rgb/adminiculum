# Shared Attention Category — Duration Bands (Phases 4 & 12)

Date: 2026-07-22

## Purpose

Planning estimates only. **Not** billing records, **not** performance
commitments, **not** actual recorded time (that stays in `TimeEntry` /
`linkedTimeMinutes`).

## Default bands (product defaults)

| Category | Min (min) | Max (min) |
|---|---|---|
| QUICK_SCAN | 5 | 15 |
| APPROVAL | 10 | 20 |
| SIGNATURE | 5 | 10 |
| EDITING | 30 | 60 |
| DETAILED_REVIEW | 60 | 120 |

## Where the bands live (recommendation)

**B — backend application configuration, mirrored by a shared frontend constant**,
for the first implementation: the smallest authoritative solution that avoids
duplicated values, is unit-testable, and can later become configurable.

- Author the bands **once** in a shared module (`attentionCategory` domain
  module). Backend is authoritative for aggregation; the frontend mirrors the
  same constant for display and for any client-side rendering.
- **Not** database-managed and **not** an org-settings table yet — that adds a
  premature settings UI and a migration. The constant is structured so a later
  slice can load overrides from organization settings without changing call
  sites (a single `getDurationBands(orgId?)` seam).

Rejected for v1: (A) frontend-only (backend can't aggregate correctly / not
authoritative); (C) DB-managed (premature migration + UI); (D) org settings
(premature UI).

## Midpoint usage

Do **not** collapse to a single midpoint for display. Aggregate and present a
**range** (min total, max total). A midpoint may be used only for internal
sorting tie-breaks, never shown as a false exact figure.

## Effective per-item estimate (precedence)

1. explicit `Task.estimatedMinutes` if provided → min = max = that value;
2. otherwise the category band (min/max) for `Task.attentionCategory`;
3. otherwise **unclassified** → count only, no time contribution.

## Aggregation rules (Phase 12, exact)

For each category bucket (and an "unclassified" bucket):

- `count` = number of items in the bucket.
- `minTotal` = Σ per-item min; `maxTotal` = Σ per-item max.
  - explicit-estimate item contributes `(estimatedMinutes, estimatedMinutes)`.
  - band item contributes `(band.min, band.max)`.
  - unclassified item contributes `(0, 0)` to time **and is excluded** from any
    displayed range (count only; no fabricated estimate).

Totals are in whole minutes (inputs are whole minutes; no fractional math, so no
rounding needed pre-format).

## Duration formatting (Phase 12, exact)

Format a `(minTotal, maxTotal)` pair. Rounding rules:

- Minutes are shown as-is (already integers).
- Hours are shown to at most **one decimal**, and only when not a whole number;
  a whole number of hours shows no decimal. Round half-up at one decimal.
  Examples: 90 → "1,5 óra"; 120 → "2 óra"; 100 → "1,7 óra".
- Never show misleading precision like "270 perc" for a range, and never show an
  exact total unless every item in the bucket has an explicit estimate.

Presentation by magnitude (both bounds considered):

| Case | Rule | Example |
|---|---|---|
| both < 60 | `kb. {min}–{max} perc` | `kb. 25–50 perc` |
| both ≥ 60 | `kb. {min→óra}–{max→óra} óra` | `kb. 1–2 óra` |
| min < 60 ≤ max | `kb. {min} perc–{max→óra} óra` | `kb. 45 perc–2 óra` |
| min == max (all explicit) | drop the range | `kb. 50 perc` / `kb. 2 óra` |
| bucket all unclassified | no time text | (count only) |

Hungarian decimal comma is used for hour decimals ("1,5 óra"). The existing
`formatMinutes` (`taskWorkflowPresentation.ts`) formats a **single actual** value
as "H óra M perc" and is **not** reused for estimate ranges — a new
`formatEstimateRange(min, max)` is added to the shared module so actual-time and
estimate-range formatting never blur.

## Dashboard presentation

- item count;
- minimum estimated total … maximum estimated total (range).

Example: `3 részletes ellenőrzés · kb. 3–6 óra`.
