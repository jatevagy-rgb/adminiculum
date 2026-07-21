# Dashboard Production Failed Request Matrix

Date: 2026-07-21

## Dashboard API request inventory

The DashboardFocused component (`Frontend/src/components/DashboardFocused.tsx:273`) issues 7 parallel requests via `Promise.all`, each wrapped with `.catch(() => null)`.

| # | API function | Route | Required for global error? | Section affected | Global error impact | Status during reproduction |
|---|---|---|---|---|---|---|
| 1 | `getMyTasks()` | GET /api/v1/tasks (filtered) | Yes (line 298) | Mai feladataim, Review-k | Sets `error=true` | OK |
| 2 | `getCases(1, 200)` | GET /api/v1/cases?page=1&limit=200 | Yes (line 298) | Quick Actions document link, case lookups | Sets `error=true` | OK |
| 3 | `getClients()` | GET /api/v1/clients | No | Communication client filter | Does not affect `error` | OK |
| 4 | `getCommunications({limit:50})` | GET /api/v1/communications?limit=50 | No | Kommunikáció section | Does not affect `error` | OK |
| 5 | `getWorkflowAgenda(...)` | GET /api/v1/agenda?scope=MY_WORK&status=OPEN&limit=50 | Yes (line 298) | Napi események, Következő 7 nap | Sets `error=true` | OK |
| 6 | `getDashboardStats()` | GET /api/v1/dashboard/stats | Yes (line 298) | További jelzések (documents) | Sets `error=true` | OK |
| 7 | `getDashboardOperationalOverview()` | GET /api/v1/cases/dashboard/operational-overview | Yes (line 298) | Ügyek ahol lépés szükséges, Itt folytasd, Nyitott ügyek count | Sets `error=true` | OK |

## Error flag logic (line 298)

```typescript
setError(!taskResult || !caseResult || !agendaResult || !statsResult || !operationalResult);
```

5 of 7 endpoints are treated as required. If ANY one returns null (its `.catch(() => null)` triggered), the global `error` flag is set to true.

## Availability tracking (lines 290-297)

Each endpoint independently tracks its availability:

```typescript
setAvailability({
  tasks: taskResult !== null,
  cases: caseResult !== null,
  agenda: agendaResult !== null,
  stats: statsResult !== null,
  communications: communicationResult !== null,
  operational: operationalResult !== null,
});
```

This per-section availability IS used for section-specific degraded states. But the global `error` flag overrides the nuance by showing a misleading global banner.

## Symptom-to-endpoint mapping

| Observed symptom | Triggering condition | Endpoint responsible |
|---|---|---|
| "Az adatok betöltése sikertelen." | `error === true` (line 439) | ANY of: tasks, cases, agenda, stats, operational |
| "A következő lépés most nem tölthető be teljesen." | `!focusDataComplete` i.e. `!availability.operational` (line 452) | operational-overview only |
| "Az operatív ügyáttekintés most nem érhető el." | `operational === null` (line 523) | operational-overview only |
| "Nyitott ügyek: —" | `caseCount === null` i.e. `!availability.operational` (line 469) | operational-overview only |

## Conclusion

All 4 reported symptoms are consistent with a single transient failure of `GET /api/v1/cases/dashboard/operational-overview`. The other 6 endpoints succeeded, but the global error banner fired because the `error` flag check includes `operationalResult`.

## Reproduction status

All 7 endpoints returned successfully during both controlled reloads (2026-07-21T13:48Z and 2026-07-21T13:50Z). No failed requests observed.
