# Operational UX Visual QA 1

## Environment

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`
- Database host confirmed before startup: `localhost:5432/adminiculum`
- Authenticated local user: `dr. HUBAY Gyula Máté`
- Role: `ADMIN`
- Real local case context: `CASE-2026-021`
- Real local document context used; document body content is not reproduced here.
- Production and Azure were not accessed.

Screenshots were captured into process-local temporary directories and were not committed because filenames and rendered matter context may be confidential.

## Route Matrix

All rows were checked at `1366×768`, `1440×900`, and `1920×1080`.

| Route | Authenticated | Primary work visible | First-view content | Console / request result | Overflow | Screenshot | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | yes | `Itt folytasd` | primary matter plus daily work/deadline/review areas | no blocking error; no unexpected 500/501 | none | yes | pass |
| `/cases` | yes | case filter and rows | at least five case rows at 1366×768 | no blocking error | none | yes | pass |
| populated case detail | yes | one `Következő lépés` CTA | active work, documents, deadline, communication | no raw error; no 500/501 | none | yes | pass |
| case documents | yes | document upload and selected document | first real document auto-selected | no 500/501 | none | yes | pass |
| case communications | yes | compose control | one compact empty/list workspace | no blocking error | none | yes | pass |
| `/tasks` | yes | `Új feladat` and row actions | three real task rows in test case | no blocking error | none | yes | pass |
| `/deadlines` | yes | filters and create action | compact zero-result state | agenda request succeeds | none | yes | pass |
| `/time-entries` | yes | `Munkaóra rögzítése` | case context, totals, first-entry action | no blocking error | none | yes | pass |
| `/intake` | yes | `Új ügy indítása` | compact intake summary and truthful empty state | no blocking error | none | yes | pass |
| `/litigation-workspace` | yes | current step | document and point-capture work visible | document text request succeeds | none | yes | pass |
| `/documents/new/edit` | yes | editor/export controls | editor chrome and canvas | no blocking error | none | yes | pass |
| populated document editor | yes | document canvas | toolbar, canvas, side panel, export | workflow summary succeeds | none | yes | pass |
| `/documents/compare` | yes | editor workspace | document canvas begins in first viewport | no gated-list 501; no raw dev copy | none | yes | pass |
| handoff package | yes | document/review navigation | prerequisite and package action | no blocking error | none | yes | pass |
| `/clause-library` | yes | clause search/list when available | real local clause rows | no blocking error | none | yes | pass |

Total route/view checks: `45`

HTTP page results: `45/45` returned `200`

Authenticated results: `45/45`

Unexpected backend `500`: `0` after fixes

Unexpected gated contract `501`: `0` after capability preflight

Horizontal overflow: `0`

Visible raw `Internal server error`: `0`

Visible raw `CLIENT_INPUT`, `TODO`, or `DOCUMENT_DELETED`: `0` after display mapping

Visible future-backend/track-changes implementation copy on target first views: `0`

## Editor Scroll QA

The populated editor was verified at all required viewports.

| Viewport | Window scroll top/middle/bottom | Canvas scroll top/middle/bottom | Chrome present | Export warning count | Result |
| --- | --- | --- | --- | --- | --- |
| `1366×768` | `0 / 0 / 0` | `0 / 289 / 578` | yes | `1` | pass |
| `1440×900` | `0 / 0 / 0` | `0 / 223 / 446` | yes | `1` | pass |
| `1920×1080` | `0 / 0 / 0` | `0 / 133 / 266` | yes | `1` | pass |

Additional editor checks:

- central canvas owns vertical scrolling;
- top bar and toolbar remain visible;
- right panel remains available without forcing browser-page scrolling;
- tabs and export controls remain present;
- return navigation remains present;
- local/export-only warning is shown exactly once;
- no fake autosave, server persistence, or track-changes claim was introduced.

## Case Center QA

For the populated local case:

- matter identity appears once in the canonical header;
- next step is unambiguous;
- active tasks and recent document are visible;
- deadline and communication summaries are visible;
- no repeated count grid remains;
- no raw errors render;
- canonical tabs link to case, documents, tasks, communications, deadlines, and time;
- main content receives the dominant width.

Empty states were also observed for communications, deadlines, time entries, and intake. Each contracts to one useful message/action instead of retaining a large empty card grid.

## Runtime Regression QA

- Case agenda request: pass after case-status filter correction.
- Case workflow summary: pass after production-compatible communication projection.
- Document text request: pass after explicit document projection.
- Contract generation disabled state: no noisy list call after capability preflight.
- Safe panel errors remain available for secondary failures.

## Validation Notes

- Frontend `tsc --noEmit`: pass.
- Frontend production build: pass.
- Frontend production env guard: pass.
- Frontend package has no `test` script; no package change was made.
- Backend Prisma validate: pass.
- Backend `tsc --noEmit`: pass.
- Backend focused guard tests: 6 suites / 43 tests pass.
- Backend full tests: 42 suites / 420 tests pass.
- Backend build: pass.
- `git diff --check`: pass.

## Result

Authenticated visual QA is complete. The branch is suitable for review but has not been deployed.
