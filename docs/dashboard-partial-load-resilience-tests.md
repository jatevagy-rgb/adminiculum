# Dashboard Partial Load Resilience Tests

Date: 2026-07-21
Updated: 2026-07-21 (validation closeout — tests rewritten to import production helper)

## Test file

`Frontend/tests/dashboardPartialLoadResilience.test.ts`

## Previous tests (replaced)

The initial tests duplicated the boolean logic manually. This was identified as a validation gap: the tests could pass even if the production code diverged. The tests were rewritten to import and exercise the real `dashboardLoadState.ts` helper.

## Test runner

Node.js built-in test runner (`node:test`) with `node:assert/strict`. Executed via `npx tsx --test`.

## Production helper imported

```typescript
import {
  deriveDashboardAvailability,
  getDashboardGlobalFailure,
  getDashboardSectionFailure,
  UNAVAILABLE,
  type DashboardEndpointResults,
} from "../src/lib/dashboardLoadState";
```

Same module imported by `DashboardFocused.tsx` — no parallel implementation.

## Test suites (4 suites, 27 tests)

### Suite 1: deriveDashboardAvailability (3 tests)

| # | Scenario | Assertion |
|---|---|---|
| 1 | All OK | All 6 availability flags true |
| 2 | All FAIL | All flags false, equals UNAVAILABLE constant |
| 3 | Single failure | Only affected field false |

### Suite 2: getDashboardGlobalFailure — criticality contract (11 tests)

| # | Scenario | Expected |
|---|---|---|
| 1 | All succeed | false |
| 2 | Only tasks fail | false |
| 3 | Only cases fail | false |
| 4 | Tasks AND cases fail | true |
| 5 | Only agenda fails | false |
| 6 | Only stats fails | false |
| 7 | Only operational fails | false |
| 8 | Only communications fails | false |
| 9 | All fail | true |
| 10 | Cases + agenda + operational fail, tasks OK | false |
| 11 | Tasks + operational fail, cases OK | false |

### Suite 3: getDashboardSectionFailure — section failure banner (5 tests)

| # | Scenario | Expected |
|---|---|---|
| 1 | All available | false |
| 2 | One section unavailable | true |
| 3 | Suppressed during loading | false |
| 4 | Suppressed when critical failure active | false |
| 5 | Multiple sections unavailable | true |

### Suite 4: Failure vs empty state distinction (8 tests)

| # | Scenario | Assertion |
|---|---|---|
| 1 | Communications failed | availability.communications === false |
| 2 | Communications successful empty | availability.communications === true |
| 3 | Agenda failed | availability.agenda === false |
| 4 | Agenda successful empty | availability.agenda === true |
| 5 | Operational failed | availability.operational === false |
| 6 | Operational successful empty | availability.operational === true |
| 7 | Stats failed | availability.stats === false |
| 8 | Stats successful empty | availability.stats === true |

## Results

4 suites, 27 tests, 0 failures, 0 skipped.

## Backend visual hierarchy test update

`Backend/tests/dashboardVisualHierarchyFrontend.test.ts` line 150: assertion changed from `expect(dashboard).not.toContain('<CompactState')` to `expect(dashboard).toContain('<CompactState')` because the Dashboard now legitimately uses CompactState for the section failure banner.

Backend test results after update: 55 suites pass, 504 tests pass, 47 skipped (expected), 3 suites skipped.
