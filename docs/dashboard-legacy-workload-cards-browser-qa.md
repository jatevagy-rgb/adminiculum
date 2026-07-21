# Dashboard Legacy Workload Cards — Browser QA

Date: 2026-07-21
Branch: `claude/dashboard-legacy-workload-cards-restore-1`

## Method

`Frontend/tests/dashboardWorkloadCardsBrowserQA.mjs` (Playwright — existing
devDependency, no package/lockfile change). `next start` serves the production
build of the restored branch on `http://127.0.0.1:3097`; every `**/api/v1/**`
call is intercepted with synthetic, contract-compatible DTOs. The **real**
`DashboardFocused` renders inside the real production composition; the harness
reads the live DOM (`section[aria-label="Napi munka összefoglaló"]`) — it does not
reproduce the UI or copy the card logic.

## Result

**27 checks, 27 pass, 0 fail.** Hard errors = 0 in every scenario. Screenshots at
**1366×768, 1440×900 and 1100×800**.

## Scenarios

### Populated (all sources 200)
- Grid present with **exactly 6** cards.
- Exact labels **and order**: Nyitott ügyek, Mai teendők, Közeli határidők, Review tételek, Külső kommunikáció, Belső kommunikáció.
- Exact navigation hrefs: `/cases`, `/deadlines?view=day`, `/deadlines`, `/reviews`, `/notifications?view=external`, `/notifications?view=internal`.
- **Külső kommunikáció** background = `rgb(143, 69, 55)` (**`--adm-terracotta-700`**); **Belső kommunikáció** = `rgb(1, 67, 55)` (**`--adm-green-800`**) — the exact colors the user named, computed from the live rendered DOM.
- Live counts (e.g. "Nyitott ügyek" = 4 active of 5 fixture cases, one CLOSED excluded) — no hardcoded values.
- No `"Most nem elérhető"` when all sources are healthy.

### Zero / successful-empty (all sources 200 empty)
- 6 cards render; each shows its **empty label** (e.g. "Nincs ügy"), **not** `"Most nem elérhető"` — successful-empty is distinct from failure.

### Source failure (cases / agenda / stats / communications / tasks → 500)
- 6 cards still render (no crash); affected cards show **`"Most nem elérhető"`** (null), never a fake `0`.
- No global critical Dashboard error from a card source failing (partial-load contract preserved).

### Quick Actions preservation (populated)
- Exactly **4** primary Quick Action cards in the grid, all **light/white** (`rgb(255, 255, 255)`) — Új ügy, Új feladat, Dokumentum feltöltése, Kommunikáció megnyitása.
- The old seven saturated Quick Action blocks were **not** reintroduced.
- Operational case groups ("Ügyek, ahol lépés szükséges") and "Mai munkám" unchanged.

## Historical comparison

- **Before (pre-restoration, `c969a9b`):** `before-restoration-1440x900.png` — "Itt folytasd" flows directly into "Ügyek, ahol lépés szükséges"; no colored summary grid.
- **After (restored):** `populated-1440x900.png` — the 6-card "Napi munka összefoglaló" grid appears between them, with dark green + terracotta cards, matching the `a948839` feature.

## Screenshot evidence (`Frontend/qa-screenshots-workload/`, git-ignored, harness-reproduced)

1. `before-restoration-1440x900.png` — current Dashboard before restoration
2. `populated-1440x900.png`, `populated-1366x768.png`, `populated-1100x800.png` — restored grid, populated, responsive
3. `empty-zero-1440x900.png` — successful-empty state
4. `source-failure-1440x900.png` — source-failure local fallback

Navigation/activation is proven by the exact `href` assertions on each card (the
cards are `<Link>`s; clicking routes to the listed pages).

## Console / network

- Hard errors (React / hydration / uncontrolled) = 0 in every scenario.
- No external `/api/v1` call left the local harness.
- Injected 5xx produce only the app's expected `[API] Error calling …` logs.
