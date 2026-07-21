# Dashboard Partial Load Browser QA

Date: 2026-07-21
Updated: 2026-07-21 (validation closeout)

## QA method

Production Dashboard at `https://adminiculumfrontend-austriaeast-01.azurewebsites.net/` with browser-level `window.fetch` interception to simulate endpoint failures. Authenticated as dr. HUBAY Gyula Máté (ADMIN).

Note: The production site runs the old code (commit `16700eb`), not the patched version. Browser QA documents the **production bug behavior** and confirms the patch fixes it via unit test evidence and build verification.

## Viewports tested

- 1366×768
- 1440×900

## Scenario results

### A. All endpoints 200

- **Result**: No global warning, all sections render normally
- **Evidence**: Accessibility tree shows all 7 sections (Gyors műveletek, Itt folytasd, Ügyek, Mai munkám, Napi események, Kommunikáció, További jelzések). "Operatív ügycsoportok" visible. No error banners.
- **Verified at both viewports**: Yes

### B. operational-overview 500

- **Production behavior (bug)**: "Az adatok betöltése sikertelen." — misleading global red error banner fires even though 6 of 7 endpoints succeeded
- **Patched behavior (unit-tested)**: No global banner. Section-local fallbacks for operational, resume, and case count. Tasks, calendar, communications remain usable.
- **Bug confirmed**: Yes — this is the exact production incident from 2026-07-21

### D. communications 500

- **Production behavior (bug)**: "Nincs megjeleníthető kommunikáció." — falsely implies there are no communications when the endpoint actually failed
- **Patched behavior (unit-tested)**: "A kommunikációs adatok most nem érhetők el." — distinct failure state
- **Bug confirmed**: Yes — failure/empty conflation verified on production

### Scenarios not browser-testable on production

The following scenarios are validated by the 27-test unit suite importing the real production helper:

- C. agenda 500 → no global banner, local fallback (unit test #5)
- E. stats 500 → no global banner, section hidden (unit test #6)
- F. tasks 500 → no global banner, section failure (unit test #2)
- G. cases 500 → no global banner, section failure (unit test #3)
- H. all critical fail → global banner, section banner suppressed (unit test #9, #4)
- I. valid empty responses → honest empty states, not unavailable wording (suite 4, 8 tests)

## Retry behavior

- **Retry button**: Present on both SafePanelError and CompactState banners
- **Accessible name**: "Újratöltés" (button element)
- **Keyboard reachable**: Yes (focus-visible styles present)
- **Behavior**: Calls `load()` which re-fetches all endpoints via Promise.all
- **No automatic loop**: Retry is user-initiated only
- **Recovery**: Verified on production — full page reload after clearing failure injection restores all sections

## Accessibility notes

- `DashboardEmptyState` uses `role="status"` — screen reader announces state changes
- All sections have `aria-labelledby` pointing to section headings
- Retry buttons have visible focus ring (`focus-visible:ring-2`)
- Fallback states use text only — distinguishable without color
- Calendar tab strip uses `role="tablist"` with `aria-selected`

## Limitation

Full visual QA of the **patched** code under failure injection requires a local dev server with Azure AD configuration or a staging deployment. The patch has been validated through:
1. TypeScript compilation: `tsc --noEmit` clean
2. Production build: `npm run build` clean
3. Production env verification: `verify:prod-env` clean
4. 27 unit tests importing real production logic
5. 504 backend tests passing (including updated visual hierarchy guard)
