# Dashboard Partial Load Contract

Date: 2026-07-21
Updated: 2026-07-21 (validation closeout)

## Contract summary

The Dashboard supports partial data loading. When individual API endpoints fail, the dashboard continues to render successfully loaded sections and shows section-specific fallback states for unavailable data. The global error banner is reserved for catastrophic failures where both core data sources are unavailable.

## Two-tier error model

### Tier 1: Critical failure (SafePanelError, error tone)

- **Condition**: Both `tasks` AND `cases` endpoints return null
- **Banner**: "A műszerfal alapadatai nem tölthetők be."
- **Behavior**: Full error state with retry button
- **Rationale**: Tasks and cases are the two foundational data sources; without both, the dashboard cannot show meaningful operational data

### Tier 2: Section failure (CompactState, neutral tone)

- **Condition**: At least one tracked endpoint failed, but critical failure did not occur
- **Banner**: "Egyes napi munkalisták most nem érhetők el." with "Újratöltés" button
- **Behavior**: Affected sections show individual fallback states; successfully loaded sections render normally
- **Rationale**: Preserves user confidence in data that did load while acknowledging partial unavailability

## Failure vs empty state distinction

Each section distinguishes between a failed request and a successful empty response:

| Section | Failed text | Empty text |
|---|---|---|
| Mai feladataim | "Mai feladatok most nem érhetők el." | "Nincs mára kijelölt feladata." |
| Review-k | "Review adatok most nem érhetők el." | "Nincs review-ra váró munkája." |
| Határidők | "Határidő adatok most nem érhetők el." | "Nincs közelgő határidő." |
| Napi események | "Naptáradatok most nem érhetők el." | "Erre a napra nincs rögzített határidő." |
| Kommunikáció | "A kommunikációs adatok most nem érhetők el." | "Nincs megjeleníthető kommunikáció." |
| Ügyek | "Az operatív ügyáttekintés most nem érhető el." | "Nincs nyitott, jogosultsági körébe tartozó ügy." |
| Itt folytasd | "A következő lépés most nem tölthető be teljesen." | "Nincs félbehagyott vagy azonnali beavatkozást igénylő munkája." |

## Production helper

Logic is extracted to `Frontend/src/lib/dashboardLoadState.ts`:

- `deriveDashboardAvailability(results)` — maps endpoint results to per-section availability
- `getDashboardGlobalFailure(results)` — returns true only when both tasks AND cases are null
- `getDashboardSectionFailure(availability, criticalFailed, loading)` — returns true when any tracked section is unavailable
- `getDashboardSectionState(available, loading)` — returns "loading" | "available" | "unavailable"
- `UNAVAILABLE` — initial state constant

Both `DashboardFocused.tsx` and the test suite import the same module.

## Invariants

1. The global error banner and section failure banner are mutually exclusive
2. During loading, section failure banner is suppressed
3. The retry button on both banners calls the same `load()` function
4. Section fallback states are always present regardless of the section failure banner
5. Successfully loaded sections always render their data
6. A failed endpoint NEVER shows a successful empty message
7. `DashboardEmptyState` is the only component used for section fallbacks (consistent styling)

## Contract scope and the malformed boundary

The contract is **null-based**: each endpoint's result is either non-null
(success) or `null` (failure, via `.catch(() => null)` on a rejected fetch —
i.e. non-2xx or a network error). Availability and the global/section banners are
derived purely from these null checks.

A 2xx response is assumed to carry a **well-formed DTO**. A 200 response with a
non-conforming or invalid body is a backend-contract breach that is **outside**
this contract: `api.ts` intentionally returns raw text for unparseable 200 bodies
(`api.ts:197`), so such a body is treated as "present" rather than "failed". The
genuinely optional endpoints (dashboard stats, news) are accessed defensively and
degrade gracefully; core/section render paths access some nested fields without
full optional-chaining. The path that actually occurs in production — endpoint
*failure* — is the one this contract governs, and it is fully verified.

## Browser QA verification (patched branch)

Verified in a real rendered browser against HEAD `96b17fb` via
`Frontend/tests/dashboardBrowserQA.mjs` (Playwright, route interception, real
`DashboardFocused` + real `dashboardLoadState` helper) — 111/111 checks pass.
This is the patched-code proof; production (old code) was not used. Full evidence:
`dashboard-partial-load-browser-qa.md`.

## Visual hierarchy preservation

No changes to the Dashboard visual hierarchy:
- Same card layout, spacing, typography, and color system
- Same section ordering
- SafePanelError and CompactState use existing OperationalPrimitives components
- DashboardEmptyState is an existing component used throughout the Dashboard
