# Shared Attention Category — Test Matrix (Phase 16)

Date: 2026-07-22

Tests below are planned for the implementation slices; they exercise real
helpers/components (per the established resilience/workload testing pattern), not
just source strings.

| # | Scenario | Expected |
|---|---|---|
| 1 | Each of the five categories | correct label/icon/tone/band resolved from the shared module |
| 2 | Task with explicit `estimatedMinutes` | per-item min == max == estimate; aggregation uses it |
| 3 | Task with category, no explicit estimate | per-item min/max == category band |
| 4 | Task with null category | counted in "Nincs besorolva"; **no** time contribution |
| 5 | Zero items in a category | card shows `0 feladat`, no time range; no crash |
| 6 | Mixed Review + Task items present | task workload aggregates tasks; review queue aggregates submissions; independent |
| 7 | Task assigned-to-me **and** has a submission | counted **exactly once** in "my workload" (no double count) |
| 8 | Overdue quick item (QUICK_SCAN, past deadline) | urgency = CRITICAL, category = QUICK_SCAN, shown independently |
| 9 | Non-urgent detailed item (DETAILED_REVIEW, far deadline) | urgency = LATER/NONE, category unchanged; both dimensions independent |
| 10 | Filter by category on Tasks | only matching-category tasks shown; status/priority/deadline filters still apply |
| 11 | Edit a task's category | value persists; content-light audit event emitted; source submission `requestedAttention` unchanged |
| 12 | Permission denial (edit category without task-manage) | `403`; no change; safe message |
| 13 | Malformed category value in API | `400 INVALID_ATTENTION_CATEGORY`; no write |
| 14 | Legacy task (null category, null estimate) | remains unclassified; not defaulted; count-only |
| 15 | Partial endpoint failure (workload source 500) | local "Most nem elérhető", no global banner, no fake zero |
| 16 | Successful empty workload (no assigned open tasks) | honest empty ("Nincs rám váró besorolt munka."), distinct from failure |
| 17 | Duration format < 1 hour | `kb. 25–50 perc` |
| 18 | Duration format ≥ 1 hour | `kb. 1–2 óra`; mixed `kb. 45 perc–2 óra` |
| 19 | Exact-estimate aggregation (all explicit) | single value, no range (`kb. 50 perc` / `kb. 2 óra`) |
| 20 | Range aggregation (band items) | Σmin–Σmax, correct formatting, Hungarian decimal comma |

## Cross-cutting assertions

- Attention category and urgency never derived from each other (independent).
- Estimate never summed into actual `TimeEntry`/`linkedTimeMinutes`.
- Unclassified never contributes fabricated minutes.
- Shared module is the single source: Review, Tasks, and Dashboard resolve the
  same label/tone/band for a given value.
- Dashboard "my workload" scoped to the authenticated user (no other users'
  totals leaked).
