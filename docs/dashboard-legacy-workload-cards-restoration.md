# Dashboard Legacy Workload Cards — Restoration

Date: 2026-07-21
Branch: `claude/dashboard-legacy-workload-cards-restore-1` (base `c969a9b`)

## What was restored

The **"Napi munka összefoglaló"** 6-card colored `SummaryCard` grid, restored
from the last correct historical implementation `DashboardFocused.tsx @ a948839`.

### Cards (exact — label · tone/color · value source · href · empty label)

| # | Label | Tone / color | Value source | Href | Empty label |
|---|---|---|---|---|---|
| 1 | Nyitott ügyek | petrol `#126782` | non-closed cases (`availability.cases`) | `/cases` | Nincs ügy |
| 2 | Mai teendők | amber `#FD9E02` | `agenda.summary.today` (`availability.agenda`) | `/deadlines?view=day` | Nincs mai teendő |
| 3 | Közeli határidők | gold `#FFB703` | `deadlines.length` (`availability.agenda`) | `/deadlines` | Nincs közeli határidő |
| 4 | Review tételek | navy `#023047` | `stats.inReview` ↔ `reviewTasks.length` | `/reviews` | Nincs review tétel |
| 5 | Külső kommunikáció | **terracotta `var(--adm-terracotta-700)`** | external communications | `/notifications?view=external` | Nincs külső tétel |
| 6 | Belső kommunikáció | **green `var(--adm-green-800)`** | internal communications | `/notifications?view=internal` | Nincs belső tétel |

Ordering, labels, tones, hrefs, empty labels, caption logic and the card markup
are byte-for-byte the `a948839` feature. The whole card background carries the
semantic color; a translucent inner panel holds the count (verbatim).

## Placement

Historically (`a948839`) the grid rendered **immediately after "Itt folytasd"**
(the resume block) and before the calendar. In the current accepted structure the
next section is "Ügyek, ahol lépés szükséges", so the grid is restored **between
"Itt folytasd" (3) and "Ügyek, ahol lépés szükséges" (4)** — the first
history-supported placement listed in the ticket. All other sections keep their
order:

1. Műszerfal → 2. Gyors műveletek → 3. Itt folytasd → **[Napi munka
összefoglaló]** → 4. Ügyek, ahol lépés szükséges → 5. Mai munkám → 6. Napi
események és határidők → 7. Kommunikáció → 8. További jelzések.

## Files changed

| File | Change |
|---|---|
| `Frontend/src/lib/dashboardWorkloadSummary.ts` | **New** — card manifest + tone/panel/caption helpers (single source of truth, shared with tests). Verbatim colors/labels from `a948839`. |
| `Frontend/src/components/DashboardFocused.tsx` | Restored `closedCaseStatuses`, the `SummaryCard` component, the six value derivations, and the `aria-label="Napi munka összefoglaló"` grid mapped over the manifest. |
| `Frontend/tests/dashboardWorkloadCards.test.ts` | **New** — focused tests importing the real helper. |
| `Frontend/tests/dashboardWorkloadCardsBrowserQA.mjs` | **New** — Playwright QA rendering the real component. |
| `docs/dashboard-legacy-workload-cards-*.md` | **New** — this audit set. |

## Compatibility adaptations (narrowly necessary only)

1. **Helper extraction.** The legacy inlined the card definitions and tone logic.
   To let tests exercise the real definitions (not scrape source), the manifest +
   tone/panel/caption functions were extracted to `dashboardWorkloadSummary.ts`,
   mirroring the accepted `dashboardLoadState.ts` pattern. **Rendered output is
   identical** to `a948839`.
2. **Value-name scoping.** The current component already defines `caseCount`
   (operational-based, used by the operational header). The restored "Nyitott
   ügyek" card keeps its **original** data source (non-closed cases list) under a
   distinct name `summaryOpenCaseCount`, so the operational header is untouched.
3. **Reused existing derivations.** `externalCommunicationCount` /
   `internalCommunicationCount` already existed in the current component with the
   exact legacy logic — reused as-is.

No categories renamed, no copy "improved", no filters added, no minute estimates,
no new data model. The block is restored as the same distinct Dashboard concept.

## Not reverted (explicitly preserved)

- The four current **light icon Quick Action cards** (Új ügy, Új feladat,
  Dokumentum feltöltése, Kommunikáció megnyitása) and their quiet secondary links
  are unchanged. The old seven saturated Quick Action blocks were **not** restored.
- The operational case groups and "Mai munkám" are unchanged.
- The validated partial-load resilience contract is unchanged.
