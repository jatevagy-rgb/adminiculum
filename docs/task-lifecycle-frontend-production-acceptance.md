# Task Lifecycle Frontend Production Acceptance

Date: 2026-07-19
Frontend deployment: `2af5724d-277b-49ad-997d-80f557a36aff`

## HTTP, Asset, API, And CORS Proof

- Frontend routes `/`, `/tasks`, `/reviews`, `/cases`, `/notifications`, `/time-entries`, `/documents/compare`, `/intake`, `/calendar`, and `/deadlines`: `200`.
- Twenty-nine route-observed JavaScript/CSS assets: 29/29 returned `200`.
- Production assets: zero `localhost:3001`, zero `/api/v1/auth/login`, and zero old `Review / Leadás` heading matches.
- Backend `/health`: `200`.
- Authenticated tasks and review queue: `200`, both safely empty.
- Unauthenticated tasks: `401`.
- Production-origin CORS preflight: `204`.
- Allowed origin: `https://adminiculumfrontend-austriaeast-01.azurewebsites.net`.
- Allowed headers include `Idempotency-Key` and `If-Match`.
- Client Portal spoofed summary/export: `501`, feature `CLIENT_PORTAL`, reason `CLIENT_PORTAL_NOT_ENABLED`.

## Authenticated Dashboard

Legitimate Microsoft authentication succeeded without bypass. The new frontend is visibly active:

- only the compact `Nyitott ügyek` summary remains;
- the duplicated KPI strip and `Beérkezési sor` are absent;
- the seven-day Adminiculum deadline calendar is present;
- `Mai teendők` and `Review-ra vár` each appear once;
- quick actions, `Itt folytasd`, the open-matter summary, and the calendar begin within the `1366×768` viewport;
- no horizontal overflow at `1366×768` or `1440×900`.

Measured `1366×768` vertical bounds: quick actions `144–250`, resume work `266–408`, open matters `424–463`, calendar `479–715`.

## Authenticated Tasks

- No combined `Review / Leadás` copy is present.
- The page explicitly presents task state and Leadás revision as separate backend-driven concepts.
- The production task list is empty, so no real task drawer, submission detail, or Leadás state could be opened without creating production data.
- The empty state is truthful: `Nincs kijelölt feladat` and an option to create a task for an existing case.
- No `Failed to fetch`, raw error, or horizontal overflow at `1366×768` or `1440×900`.

## Authenticated Review

- Review workspace is active and backend-driven.
- Empty state: `Nincs review-ra váró Leadás`.
- Attention categories and deadline urgency remain separate.
- At `1440×900`, the empty main layout has one content child and no permanent empty detail sidebar.
- No duplicate legacy/new entries, raw error, failed fetch, or horizontal overflow at either required viewport.

## Other Authenticated Routes

Cases, Communications, Time entries, Documents compare, Intake, Calendar/Agenda, and Deadlines loaded without an auth loop, failed fetch, raw 500, or horizontal overflow.

## Console And Visual Evidence

- Browser console errors/warnings after the authenticated route sweep: zero.
- HTTP/static checks found no missing chunk and no failed route request.
- Exact viewport DOM, bounding-box, overflow, and visible-state checks were completed at `1366×768` and `1440×900`.
- The in-app browser's screenshot command repeatedly timed out in `Page.captureScreenshot`; no screenshot file was produced or retained. This is an evidence-capture limitation, not a product layout or network failure.
- No safe production task or submission existed, so task-detail and Leadás screenshots were not fabricated.

## Result

Authenticated production acceptance passed with the explicit empty-production-data and screenshot-capture limitations above. No production workflow record was created or mutated.
