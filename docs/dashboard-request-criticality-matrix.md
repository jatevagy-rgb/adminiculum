# Dashboard Request Criticality Matrix

Date: 2026-07-21
Updated: 2026-07-21 (validation closeout)

## Endpoint classification

| # | Endpoint | Classification | Global error on failure? | Section affected | Failure UI | Reason |
|---|---|---|---|---|---|---|
| 1 | `GET /api/v1/tasks/my/tasks` | Critical (paired) | Only if cases also fail | Mai feladataim, Review-k | "Mai feladatok most nem érhetők el." / "Review adatok most nem érhetők el." | Tasks+reviews are per-user work items; without them the user loses their personal task list but can still see cases, calendar, communications |
| 2 | `GET /api/v1/cases` | Critical (paired) | Only if tasks also fail | Quick Actions document link, caseById lookups | Cross-reference lookups degrade (no client accents on deadline items) | Cases provide cross-reference data; without them deadline items lack client accents but sections still render |
| 3 | `GET /api/v1/agenda` | Section-scoped | No | Napi események, Következő 7 nap határidői | "Naptáradatok most nem érhetők el." / "Határidő adatok most nem érhetők el." | Calendar and deadline sections have explicit unavailable states; other sections unaffected |
| 4 | `GET /api/v1/cases/dashboard/stats` | Section-scoped | No | További jelzések (documents) | Section hidden when no data | recentDocuments derives from stats; when null, the collapsible section simply doesn't appear |
| 5 | `GET /api/v1/cases/dashboard/operational-overview` | Section-scoped | No | Ügyek, Itt folytasd, Nyitott ügyek count | "A következő lépés most nem tölthető be teljesen." / "Az operatív ügyáttekintés most nem érhető el." / "—" for count | Three existing fallback states already handle this; browser QA confirmed production bug when this is in the global error check |
| 6 | `GET /api/v1/communications` | Optional | No | Kommunikáció | "A kommunikációs adatok most nem érhetők el." (failure) vs "Nincs megjeleníthető kommunikáció." (empty) | Failure and empty are now distinguished; previously failure showed misleading empty-state text |
| 7 | `GET /api/v1/clients` | Optional | No | Communication client filter chips | Filter chips hidden | Purely supplemental; not tracked in availability |
| 8 | `GET /api/v1/news-feed/legal` | Optional | No | Jogi hírek (inside További jelzések) | Section hidden when no data | Loaded outside main Promise.all; failure → empty array; section hidden if no docs either |
| 9 | `GET /api/v1/notifications/unread-count` | Not in scope | No | Header badge | Loaded by shell, not DashboardFocused | Not part of Dashboard data orchestration |

## Critical error condition

```typescript
getDashboardGlobalFailure(endpointResults)
// Implementation: !taskResult && !caseResult
```

Derived from first-principles analysis: each endpoint's rendered dependencies were audited. Every section has explicit fallback states. The user can do meaningful work with any single endpoint missing. Tasks and cases together represent the core "my work" view — only their simultaneous failure warrants a global banner.

## Section failure condition

```typescript
getDashboardSectionFailure(availability, criticalLoadFailed, loading)
```

Fires when any tracked endpoint is unavailable but the Dashboard is not in critical failure and is not loading. Shows neutral-tone CompactState: "Egyes napi munkalisták most nem érhetők el."

## Logic extraction

Both functions are defined in `Frontend/src/lib/dashboardLoadState.ts` and imported by both `DashboardFocused.tsx` and the test suite — no duplicated logic.

## Browser QA evidence (production, 2026-07-21)

| Scenario | Production behavior (old code) | Patched behavior |
|---|---|---|
| All 200 | No banner, all sections normal | Same |
| operational-overview 500 | **"Az adatok betöltése sikertelen."** — misleading global error | No global banner; section-local fallbacks only |
| communications 500 | **"Nincs megjeleníthető kommunikáció."** — falsely implies empty | "A kommunikációs adatok most nem érhetők el." — distinct failure state |

## Design rationale

The previous OR-based error condition was overly aggressive. A single transient failure of any one of 5 endpoints triggered the global error banner, even though the dashboard had 4-6 other sections rendering successfully. The production incident on 2026-07-21 demonstrated this, and browser failure injection re-confirmed it during validation.
