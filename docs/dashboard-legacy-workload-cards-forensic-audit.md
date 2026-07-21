# Dashboard Legacy Workload Cards — Forensic Audit

Date: 2026-07-21
Branch: `claude/dashboard-legacy-workload-cards-restore-1` (base `c969a9b`)

## Objective

Locate, from git history, the exact prior implementation of the colored Dashboard
cards that summarized the kinds of work waiting for the lawyer (user described:
"multiple colored cards including dark green and terracotta"). Do not redesign,
do not invent — restore the exact historical feature.

## What the feature is NOT (ruled out by evidence)

| Candidate | Why ruled out |
|---|---|
| Old 7 saturated **Quick Actions** blocks (Új ügy terracotta / Munkaórák green / …), removed by `fdf3b15` | Explicitly excluded by the ticket ("not the Quick Actions strip"); those are actions, not a work summary. |
| 5 **operational case-group** counters (DEADLINE_APPROACHING / OFFICE_ACTION / REVIEW / CLIENT_WAITING / UNSPECIFIED) | Explicitly excluded ("not the five operational case-group counters"); still present today. |
| `Dashboard.tsx` `KpiCard` **work-bucket** tiles (`123f3c7`: "Rám vár / Tőlem függ / Review alatt / Sürgős ma / Átadásra kész / Kész ezen a héten") | Early, superseded by count tiles well before production; used raw-hex tones, not the `--adm-terracotta`/`--adm-green` tokens the user named; lived in the orphaned `Dashboard.tsx`, not the current component. |
| `Dashboard.tsx` `KpiCard` **count** tiles (`a948839`: petrol/amber/yellow/navy/cyan) | Orphaned `Dashboard.tsx` (never rendered after `e73c1c2`); colors do not include terracotta/green. |
| New minute/effort estimation model | Never existed in history; explicitly forbidden. |

## The feature (proven)

The **"Napi munka összefoglaló"** colored `SummaryCard` grid **inside the current
`DashboardFocused.tsx`** — a distinct block from Quick Actions and from the
operational case groups. It uses the established Dashboard design tokens the user
named.

### Lifecycle (from `git log -S "SummaryCard" -- DashboardFocused.tsx`)

| Commit (chrono) | Rendered SummaryCards | Colors |
|---|---|---|
| `84774be` refactor: keep simplified dashboard card grid | 4: Aktív ügyek, Nyitott feladatok, Közeli határidők, Review tételek | petrol / amber / gold / navy |
| **`a948839` refactor: simplify operational workflow ux** | **6: Nyitott ügyek, Mai teendők, Közeli határidők, Review tételek, Külső kommunikáció, Belső kommunikáció** | petrol / amber / gold / navy / **terracotta** / **green** |
| `10e1bd3` refactor: simplify dashboard calendar workflow | 3: Nyitott ügyek, Mai teendők, Review tételek (terracotta/green/gold dropped) | petrol / amber / navy |
| `a607f6e` fix: remove duplicate dashboard KPI summaries | — (removed entirely) | — |

The **only** version containing both **dark green** (`--adm-green-800`) and
**terracotta** (`--adm-terracotta-700`) is **`a948839`** — the last *correct*
implementation. `10e1bd3` degraded it (dropped the terracotta/green/gold cards)
and `a607f6e` removed the remainder.

## Selected historical version

- **Feature:** `SummaryCard` grid, `aria-label="Napi munka összefoglaló"`.
- **Historical commit (last correct):** `a948839`.
- **Component:** `Frontend/src/components/DashboardFocused.tsx`.

## Removal root cause

Not a single deletion — a two-step erosion, both refactors labelled "simplify":

1. **`10e1bd3`** ("simplify dashboard calendar workflow") reduced the 6-card grid
   to 3, dropping exactly the terracotta (Külső kommunikáció), green (Belső
   kommunikáció) and gold (Közeli határidők) cards.
2. **`a607f6e`** ("remove duplicate dashboard KPI summaries") removed the
   remaining 3 cards and the `SummaryCard` component/type entirely, treating them
   as duplicative of the operational case counts.

The user's recollection that it "disappeared when Quick Actions became icon-based
light cards" is chronologically approximate: `a607f6e` is in the same
visual-evolution window as the Quick Actions redesign (`fdf3b15`), but the cards
were actually eroded by the two "simplify" refactors just before it.

## Forensic timeline (commit → file → labels → data source → reason removed → is-the-feature)

| Commit | File | Card labels | Data source | Reason removed/replaced | User-requested? |
|---|---|---|---|---|---|
| `84774be` | DashboardFocused.tsx | Aktív ügyek / Nyitott feladatok / Közeli határidők / Review tételek | cases, tasks, deadlines, stats | superseded by `a948839` (6-card) | precursor |
| **`a948839`** | **DashboardFocused.tsx** | **Nyitott ügyek / Mai teendők / Közeli határidők / Review tételek / Külső kommunikáció / Belső kommunikáció** | cases (non-closed), agenda.today, deadlines, stats.inReview↔reviewTasks, communications (external/internal) | eroded by `10e1bd3` then removed by `a607f6e` | **YES — exact match** |
| `10e1bd3` | DashboardFocused.tsx | Nyitott ügyek / Mai teendők / Review tételek | as above (subset) | fully removed by `a607f6e` | degraded form |
| `a607f6e` | DashboardFocused.tsx | — | — | removed as "duplicate KPI summaries" | removal commit |

## Determination

Feature proven and uniquely identified: the **6-card "Napi munka összefoglaló"
`SummaryCard` grid at `a948839`**. It matches every element of the user's
description — colored cards, dark green + terracotta + other established tokens,
summarizing kinds of work waiting, inside the current component, distinct from
Quick Actions and the operational case groups, with no minute estimates.

Classification basis: **NOT** `DASHBOARD_LEGACY_WORKLOAD_CARDS_NOT_FOUND` — the
exact feature is proven from history.
