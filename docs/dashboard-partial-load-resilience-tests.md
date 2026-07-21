# Dashboard Partial Load Resilience Tests

Date: 2026-07-21

## Test file

`Frontend/tests/dashboardPartialLoadResilience.test.ts`

## Test runner

Node.js built-in test runner (`node:test`) with `node:assert/strict`. Executed via `tsx --test`.

## Test matrix — error classification (15 tests)

| # | Scenario | Tasks | Cases | Agenda | Stats | Operational | Communications | Expected: criticalLoadFailed | Expected: hasSectionFailure |
|---|---|---|---|---|---|---|---|---|---|
| 1 | All succeed | OK | OK | OK | OK | OK | OK | false | false |
| 2 | Only tasks fail | FAIL | OK | OK | OK | OK | OK | false | true |
| 3 | Only cases fail | OK | FAIL | OK | OK | OK | OK | false | true |
| 4 | Tasks AND cases fail | FAIL | FAIL | OK | OK | OK | OK | true | false (suppressed) |
| 5 | Only agenda fails | OK | OK | FAIL | OK | OK | OK | false | true |
| 6 | Only stats fail | OK | OK | OK | FAIL | OK | OK | false | true |
| 7 | Only operational fails | OK | OK | OK | OK | FAIL | OK | false | true |
| 8 | Only communications fail | OK | OK | OK | OK | OK | FAIL | false | true |
| 9 | Only clients fail | OK | OK | OK | OK | OK | OK | false | false |
| 10 | Agenda + stats fail | OK | OK | FAIL | FAIL | OK | OK | false | true |
| 11 | Tasks + operational fail | FAIL | OK | OK | OK | FAIL | OK | false | true |
| 12 | All fail | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | true | false (suppressed) |
| 13 | Agenda fails during loading | OK | OK | FAIL | OK | OK | OK | false | false (loading) |
| 14 | Tasks + cases + agenda fail | FAIL | FAIL | FAIL | OK | OK | OK | true | false (suppressed) |
| 15 | Cases + agenda + operational fail | OK | FAIL | FAIL | OK | FAIL | OK | false | true |

## Test matrix — section availability (5 tests)

| # | Scenario | Assertion |
|---|---|---|
| 16 | Tasks unavailable | `availability.tasks === false` → tasks and reviews fallback |
| 17 | Agenda unavailable | `availability.agenda === false` → deadlines and calendar fallback |
| 18 | Operational unavailable | `availability.operational === false` → focusDataComplete is false |
| 19 | Stats unavailable | `availability.stats === false` → signals section hidden |
| 20 | Communications unavailable | `availability.communications === false` → empty state |

## Results

All 20 tests pass. 2 suites, 0 failures, 0 skipped.

## Key invariants verified

1. Critical failure requires BOTH tasks AND cases to be null (AND, not OR)
2. Section failure banner is suppressed during loading
3. Section failure banner is suppressed when critical failure is active
4. Clients endpoint failure does not affect any tracked availability
5. Individual section availability correctly reflects endpoint failure state
