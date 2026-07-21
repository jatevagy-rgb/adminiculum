# Dashboard Request Criticality Matrix

Date: 2026-07-21

## Endpoint classification

| # | Endpoint | Classification | Global error on failure? | Section affected | Fallback behavior |
|---|---|---|---|---|---|
| 1 | `GET /api/v1/tasks/my/tasks` | Critical (paired with cases) | Only if cases also fail | Mai feladataim, Review-k | DashboardEmptyState: "Mai feladatok most nem érhetők el." / "Review adatok most nem érhetők el." |
| 2 | `GET /api/v1/cases` | Critical (paired with tasks) | Only if tasks also fail | Quick Actions, case lookups | Section gracefully empty |
| 3 | `GET /api/v1/agenda` | Section-scoped | No | Napi események, Következő 7 nap | DashboardEmptyState: "Naptáradatok most nem érhetők el." / "Határidő adatok most nem érhetők el." |
| 4 | `GET /api/v1/cases/dashboard/stats` | Section-scoped | No | További jelzések (documents) | Section hidden (no data to render) |
| 5 | `GET /api/v1/cases/dashboard/operational-overview` | Section-scoped | No | Ügyek, Itt folytasd, Nyitott ügyek count | Existing fallback: "A következő lépés most nem tölthető be teljesen." / "Az operatív ügyáttekintés most nem érhető el." / "—" for count |
| 6 | `GET /api/v1/communications` | Optional | No | Kommunikáció | Existing empty state: "Nincs megjeleníthető kommunikáció." |
| 7 | `GET /api/v1/clients` | Optional | No | Communication client filter | Filter chips hidden |

## Critical error condition

```typescript
const criticalLoadFailed = !taskResult && !caseResult;
```

The global error banner ("A műszerfal alapadatai nem tölthetők be.") fires only when both tasks AND cases fail simultaneously. This replaces the previous OR-based condition where any single endpoint failure triggered the global banner.

## Section failure condition

```typescript
const hasSectionFailure = !loading && !criticalLoadFailed && (
  !availability.tasks || !availability.cases || !availability.agenda ||
  !availability.stats || !availability.operational || !availability.communications
);
```

When individual sections fail but the dashboard is not in critical failure, a neutral-tone CompactState banner shows: "Egyes napi munkalisták most nem érhetők el."

## Design rationale

The previous OR-based error condition (`!taskResult || !caseResult || !agendaResult || !statsResult || !operationalResult`) was overly aggressive. A single transient failure of any one of 5 endpoints triggered the global error banner, even though the dashboard had 4-6 other sections rendering successfully. The incident on 2026-07-21 demonstrated this: the operational-overview endpoint failed transiently, but the resulting banner suggested a total data load failure.

The new AND-based condition for critical error means the dashboard only shows a global failure banner when the two core data sources (tasks and cases) are both unavailable. Individual section failures are communicated per-section with neutral-tone fallbacks, preserving user trust in the data that did load.
