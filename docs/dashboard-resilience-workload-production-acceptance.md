# Dashboard Resilience + Workload Cards — Production Acceptance

Date: 2026-07-22
Method: authenticated Microsoft Chrome session (existing SSO; no credentials
entered), production site, read-only (no data mutated). Viewports 1440×900 and
1366×768. Authenticated as dr. HUBAY Gyula Máté (ADMIN).

## Quick Actions

Exactly **four light icon cards** — Új ügy, Új feladat, Dokumentum feltöltése,
Kommunikáció megnyitása — with quiet secondary links (Review sor / Határidők /
Munkaórák). The old seven saturated blocks are **absent**.

## Napi munka összefoglaló (restored)

Section visible between "Itt folytasd" and "Ügyek, ahol lépés szükséges". Six
cards, exact labels and order, live production counts:

| Card | Tone / color (production) | Count | Caption |
|---|---|---|---|
| Nyitott ügyek | petrol | 11 | Aktív tétel |
| Mai teendők | amber | 0 | Nincs mai teendő |
| Közeli határidők | gold | 0 | Nincs közeli határidő |
| Review tételek | navy | 0 | Nincs review tétel |
| Külső kommunikáció | **terracotta** | 0 | Nincs külső tétel |
| Belső kommunikáció | **dark green** | 0 | Nincs belső tétel |

- Live counts (Nyitott ügyek = 11 matches the /cases list of 11 cases).
- Zero values show the **successful-empty** labels ("Nincs …"), NOT "Most nem
  elérhető" — endpoints succeeded empty; failure text is reserved for failures.
- No invented minute/effort text. No broken link.

## Terracotta / dark-green cards

Zoomed close view confirmed Külső kommunikáció renders terracotta (reddish-brown,
`--adm-terracotta-700`) and Belső kommunikáció renders dark green
(`--adm-green-800`) — the historical tokens.

## Partial-load (normal state)

No false global error banner; Dashboard loads normally; no "…nem érhető el"
unavailable text while endpoints succeed (empty sections show honest empty
labels).

## Existing Dashboard preserved

- Itt folytasd — "Nincs félbehagyott vagy azonnali beavatkozást igénylő munkája."
- Ügyek, ahol lépés szükséges (operational overview) — case rows render below the grid.
- Mai munkám — Mai feladataim / Nekem kijelölt Review-k / Következő 7 nap határidői.
- Napi események és határidők — weekly calendar strip (jul 22–28).
- Kommunikáció — "Nincs megjeleníthető kommunikáció." (successful empty).

## Other routes (read-only, no mutation)

- `/cases` — "Ügyek 11 ügy", full list, client color rails. OK.
- `/tasks` — "Feladatok 0 tétel", review workspace, case filter. OK.
- `/reviews` — Review workspace with category counters, "Nincs review-ra váró
  Leadás." OK.

No crash, missing chunk, or auth loop on any route.

## Console / network

- Browser console: **no errors** (no React, hydration, CORS, chunk, or
  Failed-to-fetch errors) across repeated checks.
- API calls target the real backend `adminiculumbackend-b1-01.azurewebsites.net`
  (CORS preflight 204); **no localhost** calls.
- Dashboard rendered real data (11 cases), proving the API cycle succeeded
  (no 500 in normal acceptance); the workload cards add **no** new endpoint —
  they reuse the existing dashboard data.
