# Dashboard Partial Load Contract

Date: 2026-07-21

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

## Section fallback inventory

| Section | Availability check | Fallback text | Component |
|---|---|---|---|
| Mai feladataim | `!availability.tasks` | "Mai feladatok most nem érhetők el." | DashboardEmptyState |
| Nekem kijelölt Review-k | `!availability.tasks` | "Review adatok most nem érhetők el." | DashboardEmptyState |
| Következő 7 nap határidői | `!availability.agenda` | "Határidő adatok most nem érhetők el." | DashboardEmptyState |
| Napi események és határidők | `!availability.agenda` | "Naptáradatok most nem érhetők el." | DashboardEmptyState |
| Itt folytasd | `!availability.operational` | "A következő lépés most nem tölthető be teljesen." | CompactState (existing) |
| Ügyek ahol lépés szükséges | `operational === null` | "Az operatív ügyáttekintés most nem érhető el." | DashboardEmptyState (existing) |
| Nyitott ügyek count | `!availability.operational` | "—" dash | Inline (existing) |
| Kommunikáció | `communications === []` | "Nincs megjeleníthető kommunikáció." | DashboardEmptyState (existing) |
| További jelzések | No data → section hidden | Not shown | Conditional render (existing) |

## Invariants

1. The global error banner and section failure banner are mutually exclusive — when critical failure is active, the section failure banner does not show
2. During loading (`loading === true`), section failure banner is suppressed
3. The retry button on both banners calls the same `load()` function, re-fetching all endpoints
4. Section fallback states are always present regardless of whether the section failure banner shows
5. Successfully loaded sections always render their data, even when other sections have failed

## Visual hierarchy preservation

No changes to the Dashboard visual hierarchy:
- Same card layout, spacing, typography, and color system
- Same section ordering
- SafePanelError and CompactState use existing OperationalPrimitives components
- DashboardEmptyState is an existing component used throughout the Dashboard
- No new visual elements introduced beyond the neutral-tone CompactState banner
