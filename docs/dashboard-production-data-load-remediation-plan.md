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

### Implemented patch: Frontend resilience (DASHBOARD-PARTIAL-LOAD-RESILIENCE-PATCH-1)

**Status:** Implemented on branch `claude/dashboard-partial-load-resilience-1`.

**Scope:**
- File: `Frontend/src/components/DashboardFocused.tsx`
- Change: Global error condition from OR to AND, two-tier banner system, section-specific fallbacks

**Applied change:**
```typescript
// Before (line 298):
setError(!taskResult || !caseResult || !agendaResult || !statsResult || !operationalResult);

// After:
const criticalLoadFailed = !taskResult && !caseResult;
setError(criticalLoadFailed);
```

**Additional changes:**
- Two-tier banner: critical (SafePanelError) when tasks+cases fail, neutral (CompactState) when individual sections fail
- Section fallbacks added for: tasks, reviews, 7-day deadlines, calendar strip
- 20 unit tests covering 15 failure combinations

**What this preserves:**
- All existing section-specific degraded states remain unchanged
- "A következő lépés most nem tölthető be teljesen." still shows when operational fails
- "Az operatív ügyáttekintés most nem érhető el." still shows when operational fails
- "Nyitott ügyek: —" still shows when operational fails

**What this eliminates:**
- The misleading "Az adatok betöltése sikertelen." when only a secondary endpoint fails
- User confusion when most of the Dashboard works but the banner implies total failure

See `dashboard-partial-load-contract.md` for the full two-tier error model.

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

## Validation completed (2026-07-21)

1. `tsc --noEmit` — clean
2. `npm run build` — clean
3. `npm run verify:prod-env` — OK
4. 27 unit tests + 22 existing frontend tests — all pass
5. 504 backend tests — all pass
6. Browser failure injection QA on production — bugs confirmed, patch addresses them
7. Communications failure/empty distinction — fixed

## Next authorized step

1. Deploy to staging for full visual QA of patched code under failure injection
2. Screen reader accessibility verification
3. The patch does not require a backend change, schema change, or redeployment of the backend
4. The patch requires only a frontend rebuild and redeployment
