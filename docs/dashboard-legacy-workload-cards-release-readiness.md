# Dashboard Legacy Workload Cards — Release Readiness

Date: 2026-07-21
Branch: `claude/dashboard-legacy-workload-cards-restore-1` (base `c969a9b`)

## Summary

The legacy **"Napi munka összefoglaló"** 6-card colored work-summary grid was
identified from git history (`DashboardFocused @ a948839`, the last correct
version; eroded by `10e1bd3`, removed by `a607f6e`) and restored to the current
`DashboardFocused` between "Itt folytasd" and "Ügyek, ahol lépés szükséges" —
labels, tones (incl. **terracotta** + **dark green**), order, hrefs, empty labels
and caption logic verbatim. The four light Quick Action cards, operational case
groups, "Mai munkám", and the partial-load contract are unchanged.

## Files changed

| File | Change |
|---|---|
| `Frontend/src/lib/dashboardWorkloadSummary.ts` | New — card manifest + tone/panel/caption helpers |
| `Frontend/src/components/DashboardFocused.tsx` | Restored the grid, `SummaryCard`, `closedCaseStatuses`, six value derivations |
| `Frontend/tests/dashboardWorkloadCards.test.ts` | New — 16 focused tests importing the real helper |
| `Frontend/tests/dashboardWorkloadCardsBrowserQA.mjs` | New — 27-check Playwright QA rendering the real component |
| `Backend/tests/dashboardOperationalFrontend.test.ts` | Updated stale guard: `<SummaryCard` now expected (restoration) |
| `Backend/tests/opsPagesUxCleanupStatic.test.ts` | Updated stale guard: assert restored grid; keep capacity/minute concept removed |

## Compatibility change of note

The nested reads `stats?.stats?.inReview` and `agenda?.summary?.today` carry one
extra optional-chain vs the `a948839` verbatim, so a malformed (non-conforming
200) source degrades to a count rather than crashing — required to keep the
validated partial-load resilience green. Values are identical to the legacy for
well-formed data.

## Validation

| Check | Result |
|---|---|
| Frontend `tsc --noEmit` | clean |
| Frontend `npm run build` | clean |
| Frontend `verify:prod-env` | OK (no localhost targets) |
| `dashboardWorkloadCards` unit tests | 16 / 16 pass |
| `dashboardPartialLoadResilience` tests | 27 / 27 pass |
| Workload cards browser QA | 27 / 27 pass |
| Partial-load resilience browser QA | 111 / 111 pass (unchanged after restoration) |
| Backend `prisma validate` | valid |
| Backend `tsc --noEmit` | clean |
| Backend `npm test -- --runInBand` | 55 suites / 504 tests pass |
| Backend `npm run build` | clean |

## Zero-diff gates

Unchanged: Prisma, migrations, backend runtime (`Backend/src`), API routes, auth,
CORS, ClientColorKey, TaskSubmission lifecycle, Review decision behavior,
Communications backend, Calendar, Azure/config, environment files, packages,
lockfiles. Only Frontend Dashboard component + new helper/tests + two backend
**test** files (stale guards) changed. No new backend or schema contract →
**not** a contract blocker.

## Preservation confirmations

- Quick Actions remain the **four light icon cards** (Új ügy, Új feladat,
  Dokumentum feltöltése, Kommunikáció megnyitása) + quiet secondary links. The old
  seven saturated blocks were **not** restored.
- Operational case groups and "Mai munkám" unchanged.
- No minute/effort estimate introduced; no new workload model; no category renamed.

## Not done (per ticket)

No deployment, no merge to release, no Azure changes, no database access.

## Classification

```
DASHBOARD_LEGACY_WORKLOAD_CARDS_READY_FOR_RELEASE_INTEGRATION
```
