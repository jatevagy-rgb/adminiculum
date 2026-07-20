# Client Color Dashboard Production Acceptance

Date: 2026-07-20

Authentication: legitimate Microsoft session; no bypass.

## Dashboard

- `Műszerfal` appears once and the shell says `Belső munkapad`.
- `Itt folytasd` was truthful and contained no terminal/closed task resume action.
- `Ügyek, ahol lépés szükséges` rendered supported, recorded operational groups only.
- The open-case summary stayed secondary; the seven-day calendar and communication panel remained intact.
- No duplicate KPI strip or multicolored KPI wall remained.
- 1366×768 and 1440×900 had no horizontal overflow.

## Client color contract

- Clients exposes `Ügyfélszín`, `Nincs színjelölés`, and the controlled ten-color Hungarian palette.
- The UI explains that color is a visual identifier, not status or priority.
- No legacy arbitrary color field is shown.
- No production client color was saved, changed, or cleared during acceptance.
- Production currently contains no non-null `colorKey` values; Cases, Tasks, Communications, Review, and Notifications therefore exercised their honest neutral fallback.
- Mixed-color behavior remains covered by the integrated authenticated local QA and focused static tests; no production data was fabricated for screenshots.

## Workflow surfaces

- Cases loaded real rows, preserved status independently, and had no horizontal overflow.
- Tasks loaded the task/Leadás workflow controls and honest empty state without lifecycle mutation.
- Communications loaded the read-only list/filter workspace; empty/unassigned state remained neutral.
- Review loaded the full-width honest empty state with attention categories separate from urgency.
- Notifications projection returned no non-null client color and did not infer client identity.
- Documents Compare, Time Entries, Intake, Deadlines, and Case Detail loaded without layout overflow.
- No task or review detail was available in production, and no synthetic workflow record was created.

## Console, network, and route evidence

- Dashboard, Clients, Cases, Tasks, Communications, Review, Documents Compare, Time Entries, Intake, and Deadlines produced no console warning/error in clean route checks.
- Observed page assets came only from the production frontend and production backend hosts; no localhost or loopback asset appeared.
- No CORS error, failed fetch, missing JS/CSS chunk, auth loop, hydration crash, or API 500 was observed.
- The existing Case Detail optional anonymous-document lookup returned the expected gate-off 501 and the shared API helper logged it at error level. The same call exists in the prior `4647c08` frontend, the page remained functional, and no release-touched Case Detail file introduced it. This inherited limitation is not a client-color/Dashboard regression and did not justify an ineffective rollback.

## Visual evidence

Operator-only screenshots were retained outside the repository and were not committed:

- `dashboard-1366x768.png`
- `dashboard-1440x900.png`
- `dashboard-full-1440x900.png`
- `dashboard-title-header-1440x900.png`
- `dashboard-operational-overview-1440x900.png`
- `client-color-editor-1440x900.png`
- `clients-1440x900.png`
- `cases-neutral-fallback-1440x900.png`
- `tasks-neutral-fallback-1440x900.png`
- `communications-notifications-neutral-1440x900.png`
- `review-empty-final-1440x900.png`

The screenshots contain no fabricated production data and are deliberately excluded from Git.
