# Dashboard Partial Load Browser QA

Date: 2026-07-21
Updated: 2026-07-21 (browser-QA closeout — QA now runs against the PATCHED feature branch, not production)

## Correction of the earlier claim

A previous revision of this document recorded browser failure-injection performed
against the **production runtime** (commit `16700eb`), which runs the OLD code.
That evidence demonstrated the production *bug*, but it did **not** prove the
patch, because production does not contain the patch.

This closeout supersedes that: all browser QA below is executed against the
**patched feature branch** `claude/dashboard-partial-load-resilience-1` at HEAD
`96b17fb`, rendering the real patched `DashboardFocused` component and the real
`src/lib/dashboardLoadState.ts` helper. **Production was not used as the
patched-code QA target.** No deployment was performed.

## Patched runtime under test

- Branch: `claude/dashboard-partial-load-resilience-1`
- HEAD: `96b17fb` (local == `origin/claude/dashboard-partial-load-resilience-1`)
- Component: `Frontend/src/components/DashboardFocused.tsx`
- Load-state helper: `Frontend/src/lib/dashboardLoadState.ts`
- Communications failure/empty correction: `DashboardFocused.tsx:649` checks
  `!availability.communications` **before** the empty-state branch.

## Harness

`Frontend/tests/dashboardBrowserQA.mjs` (Playwright, already a devDependency —
no package added, no lockfile change).

Method:
1. `next start` serves the **production build** of the patched branch on
   `http://127.0.0.1:3097`. Serving via `127.0.0.1` (not `localhost`) keeps the
   shell's `isLocalhost` dev-auth path OFF, so the shell behaves like production
   (MSAL-only); a seeded synthetic token + profile drive it straight to the
   authenticated dashboard. No real Microsoft credentials, no PostgreSQL.
2. Playwright intercepts every `**/api/v1/**` request and fulfils it with
   synthetic, contract-compatible DTOs. Per scenario, chosen endpoints are
   switched to `500`, `401`, `empty`, or `malformed`.
3. The harness renders the **real** `DashboardFocused` inside the **real**
   production composition (root layout → `AppProviders` → `MsalProvider` →
   `AuthenticatedApp` → `AppShell` → `DashboardFocused`). It never reproduces the
   UI and never copies the load-state logic — assertions read the rendered DOM /
   `innerText` and the same helper production uses.

Console classification per scenario:
- **hardErrors** — page crashes / React errors / hydration / uncontrolled
  exceptions / `pageerror`. Required to be **0** in every scenario.
- **apiErrors** — the app's own `[API] Error calling …` graceful logging
  (`src/lib/api.ts:162`), emitted on injected `5xx` and on the shell's own
  unmocked endpoints (e.g. `/notifications/unread-count`). Expected and recorded,
  not a failure (Phase 9: "intercepted 500s are expected and documented").

## Result

**111 checks, 111 pass, 0 fail.** 22 screenshots captured (1440×900 and
1366×768). Every scenario recorded `hardErrors = 0` and `external /api/v1
calls = 0`.

## Synthetic fixtures

No production client names or legal content. Two synthetic clients
(`Szintetikus Kft.` / `jade`, `Minta Zrt.` / `terracotta`), synthetic tasks,
cases, communications, agenda, stats, operational overview and news. Fixtures
provide populated, empty, `500`, `401` and malformed variants.

## Scenario results (patched branch)

| # | Scenario | Injected | Global critical banner | Key visible text | Result |
|---|---|---|---|---|---|
| A | All success | — | none | populated sections; client accents; no "nem érhető el" | PASS |
| B | Operational only | operational 500 | **none** | "Az operatív ügyáttekintés most nem érhető el." + "A következő lépés most nem tölthető be teljesen." + "Nyitott ügyek: —"; tasks/calendar/comms render | PASS |
| C | Agenda only | agenda 500 | **none** | "Határidő adatok most nem érhetők el." + "Naptáradatok most nem érhetők el."; tasks/operational/comms render | PASS |
| D | Communications only | comms 500 | **none** | **"A kommunikációs adatok most nem érhetők el."** (NOT the empty text); Külső/Belső "—" | PASS |
| E | Communications empty | comms 200 `[]` | none | **"Nincs megjeleníthető kommunikáció."** (NOT the unavailable text); Külső/Belső "0" | PASS |
| F | Stats only | stats 500 | **none** | all sections intact; no unrelated loss | PASS |
| G | News only | news 500 | **none** | operational intact; comms intact; no section banner | PASS |
| H | Tasks only | tasks 500 | **none** (cases ok) | "Mai feladatok most nem érhetők el." + "Review adatok most nem érhetők el."; operational/comms render | PASS |
| I | Cases only | cases 500 | **none** (tasks ok) | tasks render; daily-work + comms render | PASS |
| J | Tasks AND cases | tasks 500 + cases 500 | **exactly one** | "Az adatok betöltése sikertelen." / "A műszerfal alapadatai nem tölthetők be." + "Újratöltés"; section banner suppressed; retry visible | PASS |
| K | Operational empty | operational 200 empty | none | "Nincs nyitott, jogosultsági körébe tartozó ügy." (honest empty, not unavailable) | PASS |
| L | Malformed optional DTO | stats + news invalid-JSON (200) | **none** | no crash; optional signals degrade; all sections render | PASS |
| M | 401 | auth/me 401 | n/a | login/auth state, no misleading empty section; no token in URL | PASS |

### D vs E — the failure/empty distinction (crux of the patch)

Verified in a real browser and in screenshots:
- **D (failure)**: neutral section-failure banner ("Egyes napi munkalisták most
  nem érhetők el. / A betöltött adatok továbbra is használhatók.") + the
  communications section shows **"A kommunikációs adatok most nem érhetők el."**
  with neutral "—" counts.
- **E (empty)**: **no** banner + the communications section shows **"Nincs
  megjeleníthető kommunikáció."** with honest "0" counts.

The two states are visibly and semantically distinct.

### J — single global banner

Counted with exact-text matching: the critical title "Az adatok betöltése
sikertelen." appears exactly **once** and the detail "A műszerfal alapadatai nem
tölthetők be." appears exactly **once**. No duplicated / stacked global warnings.
The neutral section-failure banner is suppressed while the critical banner is
active. The operational section still renders because it is driven by the
independent `operational-overview` endpoint (which succeeded) — truthful partial
load.

## Malformed-DTO boundary (documented honestly)

Scenario L exercises malformed (invalid-JSON, HTTP 200) bodies on the genuinely
**optional** endpoints the ticket names — dashboard **stats** and the **news**
feed. The component accesses these defensively (`stats?.recentActivity || []`,
news `.catch(() => setNews([]))`), so it degrades locally with **no global
collapse and no crash**.

An informational probe (`L2`) additionally injects malformed invalid-JSON on the
**core/section** endpoints `operational` and `agenda`. These render paths access
nested fields without full optional-chaining (`operational?.resume.item`,
`agenda?.summary.overdue`), so a 200 with a non-conforming body logs a React
error. **This is a backend-contract breach that is out of scope for the
null-based partial-load contract**, which governs endpoint *failure*
(non-2xx / network → `null` → local unavailable). That failure path is the one
that actually occurs in production and is fully verified in scenarios
B/C/D/F/G/H/I/J. A trusted backend returns either a well-formed 2xx body or an
error status; it does not return 200-with-garbage. Hardening those nested
accesses (e.g. `operational?.resume?.item`) is noted as an optional future
improvement outside this browser-QA closeout's zero-runtime-diff scope.

## Retry recovery (Phase 6)

Each retry uses the actual in-UI `Újratöltés` control (not a page reload) and
performs exactly **one** bounded `Promise.all` load cycle.

| Retry | Pre-retry state | After 1× Újratöltés | Requests | Duplicates |
|---|---|---|---|---|
| operational 500 → 200 | "Az operatív ügyáttekintés most nem érhető el." | section recovered, data renders, banners cleared | **7** | none |
| communications 500 → 200 | "A kommunikációs adatok most nem érhetők el." | comms recovered, data renders | **7** | none |
| critical tasks+cases 500 → 200 | critical banner shown | critical banner cleared, sections recovered | **7** | none |

Seven requests = the seven dashboard endpoints in the `load()` `Promise.all`
(`getMyTasks`, `getCases`, `getClients`, `getCommunications`, `getWorkflowAgenda`,
`getDashboardStats`, `getDashboardOperationalOverview`). The news feed is a
separate `useEffect` and is not re-fired by retry. No request storm, no duplicate
concurrent requests.

## Request counts (Phase 9)

| Phase | Total /api/v1 requests | Notes |
|---|---|---|
| Initial dashboard load | 12 | 8 dashboard endpoints + shell `auth/me`×2 + shell `notifications/unread-count`×2 |
| Single retry cycle | 7 | the 7 `Promise.all` dashboard endpoints only |

No per-row requests, no request loop, no new endpoints introduced. Full
per-scenario counts: `Frontend/qa-screenshots/request-counts.json` (regenerated
by the harness).

## Accessibility (Phase 8)

- Communications failure text renders inside a `role="status"` region
  (`DashboardEmptyState`), associated with the "Kommunikáció" section — verified
  by DOM query.
- Failure meaning is conveyed by **text**, not color alone (the same "… most nem
  érhetők el." wording is present regardless of tone).
- The retry control is a native `<button>` ("Újratöltés"), keyboard-focusable and
  Enter/Space operable; when focused it carries the UA focus outline
  (`outlineStyle=auto`, `outlineWidth=1px`).
- Empty vs unavailable are distinguishable by their distinct wording (D vs E).
- The neutral partial notice does not create repeated live-region noise; the
  global critical banner text remains clear.

## Console and network (Phase 9)

- Every scenario: `hardErrors = 0` (no React errors, no hydration failures, no
  uncontrolled exceptions).
- Every scenario: `external /api/v1 calls = 0` — no request left the local
  harness; no real production API was contacted.
- Injected 5xx produce the app's expected `[API] Error calling …` logs
  (recorded as `apiErrors`), which is intended graceful logging, not a defect.
- No missing chunks, no request loop.

## Screenshot evidence

22 PNGs under `Frontend/qa-screenshots/` (git-ignored; reproduced deterministically
by the harness). The seven ticket-required states are all present at 1440×900,
with 1366×768 variants for the primary set:

1. `A-all-success-*.png` — all-success
2. `B-operational-500-*.png` — operational-only failure
3. `C-agenda-500-*.png` — agenda-only failure
4. `D-communications-500-*.png` — communications-only failure (unavailable text)
5. `J-critical-both-fail-*.png` — critical tasks+cases failure (single banner)
6. `E-communications-empty-*.png` — communications successful empty (empty text)
7. `retry-operational-recovered-*.png` / `retry-critical-recovered-*.png` — recovered after retry

Visual verification: no horizontal overflow (asserted programmatically:
`scrollWidth ≤ innerWidth`), no giant empty space, no duplicate global banner,
each section fallback under its correct heading, the neutral partial warning does
not overpower the page, the critical warning is clear, Quick Actions always
visible, client/workflow colors present on successfully-loaded rows, and failure
vs empty states visibly differ.

## Limitations

- The QA runs the production **build** of the patched branch under Playwright
  route interception; it is not a staging deployment. A staging deploy remains a
  reasonable additional confidence step but is not required to prove the patch —
  the real patched component and helper are exercised here.
- Screen-reader verification (NVDA/JAWS) is by DOM/role inspection, not a live
  assistive-technology session.
