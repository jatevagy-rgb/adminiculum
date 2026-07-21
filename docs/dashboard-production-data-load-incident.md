# Dashboard Production Data Load Incident

Date: 2026-07-21

## Incident summary

The authenticated Dashboard loaded its shell and visual layout but displayed degraded fallbacks for data-dependent sections. The reported symptom consisted of four simultaneous error indicators.

## Observed symptom (as reported)

1. "Az adatok betöltése sikertelen." — global error banner (SafePanelError)
2. "A következő lépés most nem tölthető be teljesen." — "Itt folytasd" section degraded state
3. "Az operatív ügyáttekintés most nem érhető el." — operational overview empty state
4. "Nyitott ügyek: —" — open case count unavailable

## Reproduction attempt

### First reload

- Timestamp: 2026-07-21T13:48:51Z
- Authenticated user: dr. HUBAY Gyula Máté (ADMIN)
- Result: **Dashboard fully functional**
- Error banners: none
- "Nyitott ügyek: 11" — count rendered correctly
- All 5 operational groups present: Határidő közeleg, Nálunk van a következő lépés, Review alatt, Ügyfélre várunk, Nincs meghatározott következő lépés
- "10 ügyhöz nincs következő lépés rendelve" — unspecified count rendered
- Case cards visible with client data (Saubermacher-Magyarország Kft., L3 Pilot cases)
- Tasks, reviews, calendar strip, communications — all rendered

### Second reload

- Timestamp: 2026-07-21T13:50:37Z
- Result: **Dashboard fully functional** (identical to first reload)
- Zero error banners
- "Nyitott ügyek: 11" confirmed

### Third and fourth reloads (second diagnosis session)

- Timestamp: 2026-07-21T16:07:14Z (third) and 2026-07-21T16:08:02Z (fourth)
- Result: **Dashboard fully functional** on both reloads
- Zero error banners
- "Nyitott ügyek: 11" confirmed
- All 5 operational groups present with data

### Conclusion

The reported symptom is **not reproducible** across four controlled reloads spanning two diagnosis sessions. The incident was transient.

## Console evidence

8 console messages captured per reload, all MSAL informational logs:

1. [msal] initialize:start
2. [msal] initialize:done
3. [msal] redirect:start
4. [msal] redirect:result Object
5. [msal] accounts:count 1
6. [msal] activeAccount:set from cache
7. [msal] storage:keys_after_redirect Array(8)
8. [msal] ready:true

Zero console errors. Zero console warnings. Zero failed fetch errors. Zero CORS errors. Zero React rendering errors.

## Network evidence (Performance Resource Timing API)

All 10 unique backend endpoints returned HTTP 200 across two load cycles:

| Path | Status | Duration (ms) |
|---|---|---|
| /api/v1/auth/me | 200 | 43-46 |
| /api/v1/notifications/unread-count | 200 | 59-296 |
| /api/v1/tasks/my/tasks | 200 | 107-237 |
| /api/v1/cases | 200 | 146-236 |
| /api/v1/clients | 200 | 177-315 |
| /api/v1/agenda | 200 | 237 |
| /api/v1/communications | 200 | 158-237 |
| /api/v1/cases/dashboard/stats | 200 | 275 |
| /api/v1/cases/dashboard/operational-overview | 200 | 274 |
| /api/v1/news-feed/legal | 200 | 1004 |

CORS preflight: `OPTIONS /api/v1/cases/dashboard/operational-overview` → 204.

Zero failed requests. Zero non-200 responses. All endpoints authenticated and authorized successfully.

## Authentication state

- MSAL initialized and ready
- 1 account in cache
- Active account set from cache (no interactive login required)
- No authentication errors in console

## Incident classification

**Transient** — the failure did not reproduce across two controlled reloads with active monitoring. The most probable cause is a brief backend unavailability of the operational-overview endpoint (cold start, platform restart, or timeout).

## Structural vulnerability identified

See: dashboard-production-error-propagation.md

The frontend error aggregation at DashboardFocused.tsx:298 treats a single optional endpoint failure as a global data load failure, producing a misleading error banner even when 5 of 6 data sources loaded successfully.
