# Dashboard Production Data Load Remediation Plan

Date: 2026-07-21

## Incident status

**Transient — not currently reproducible.**

The reported symptom did not reproduce across two controlled reloads with active monitoring. All 7 Dashboard API endpoints returned successfully.

## Root cause summary

1. **Transient trigger:** The `GET /api/v1/cases/dashboard/operational-overview` endpoint failed briefly (probable cause: Azure App Service cold start, platform restart, or network timeout).

2. **Structural amplifier:** The frontend error aggregation at `DashboardFocused.tsx:298` treats the operational-overview endpoint as globally required. Its failure triggers a misleading "Az adatok betöltése sikertelen" banner even when all other endpoints succeed.

## Remediation classification

### Immediate action: None required

The transient trigger has resolved. No data was lost. No data integrity impact. No security impact.

### Recommended future patch: Frontend resilience

A narrow frontend patch should decouple the operational-overview endpoint from the global error flag.

**Scope:**
- File: `Frontend/src/components/DashboardFocused.tsx`
- Line: 298
- Change: Remove `operationalResult` (and optionally `statsResult` and `agendaResult`) from the global error check
- Preserve: Section-specific degraded states at lines 452, 523, and 469 (these already handle operational-overview failure correctly)

**Proposed change:**
```typescript
// Before (line 298):
setError(!taskResult || !caseResult || !agendaResult || !statsResult || !operationalResult);

// After:
setError(!taskResult || !caseResult);
```

**Rationale:** Tasks and cases are the minimum viable Dashboard data sources. Stats, agenda, and operational overview each have their own section-specific fallbacks. Only a failure of tasks or cases warrants a global error banner.

**What this preserves:**
- All existing section-specific degraded states remain unchanged
- "A következő lépés most nem tölthető be teljesen." still shows when operational fails
- "Az operatív ügyáttekintés most nem érhető el." still shows when operational fails
- "Nyitott ügyek: —" still shows when operational fails
- The global error banner still fires when tasks or cases truly fail

**What this eliminates:**
- The misleading "Az adatok betöltése sikertelen." when only a secondary endpoint fails
- User confusion when most of the Dashboard works but the banner implies total failure

### Not required

- Backend hotfix — no backend route failure evidenced
- Schema/migration change — no database issue evidenced
- CORS configuration change — preflight succeeded (204)
- Auth/Azure configuration change — MSAL authentication working correctly
- Deployment — no deployment mismatch evidenced

## Intentional visual design confirmation

The following are intentional design decisions and must not be changed as part of any remediation:

1. **Four light Quick Action cards** (Új ügy, Új feladat, Dokumentum feltöltése, Kommunikáció megnyitása) use neutral `bg-white` with `border-[var(--adm-border)]` and green accent hover states. These are intentionally unsaturated. The old seven-block colorful strip was removed by design.

2. **Client accent colors** appear ONLY on successfully loaded data rows (case cards, task rows, communication rows, deadline items) via the `<ClientAccent colorKey={...}>` component. When data doesn't load, client accents are correctly absent — this is data absence, not a visual bug.

3. **Production rows with `colorKey = null`** correctly render neutral (no accent stripe). This is expected for clients without an assigned color key.

4. **An API failure must never be "fixed" by adding arbitrary static colors.** The accent system is data-driven by design.

## Deployment provenance

### Frontend
- Active deployment: `0a985d83-a744-4560-b1eb-cb6fd9673981`
- Source commit: `16700eb`
- Status: active, complete

### Backend
- Active deployment: `2ab2eb62-cd3c-4dc9-9475-308d1e10d07b`
- Source commit: `16700eb`
- Status: active, complete

### Database
- Migration head: `20260719120000_add_client_color_key`
- No missing-column errors observed
- No Prisma errors observed

Frontend and backend are from the same release ancestry. No deployment contract mismatch.

## Next authorized step

1. Review this diagnosis documentation
2. If the frontend resilience patch is approved, create a separate ticket for the narrow change at DashboardFocused.tsx:298
3. The patch does not require a backend change, schema change, or redeployment of the backend
4. The patch requires only a frontend rebuild and redeployment
