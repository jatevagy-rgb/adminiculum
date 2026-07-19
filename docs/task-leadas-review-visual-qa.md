# Task Leadás And Review Visual QA

Date: 2026-07-19
Environment: authenticated localhost frontend/backend with disposable synthetic PostgreSQL data

## Completed Checks

- `/tasks` at 1366×768 and 1440×900: semantic table headers, separate task/Leadás states, overlay drawer, readable task context and no document-level horizontal overflow.
- Leadás draft: explicit saved state, document/time controls, backend readiness and compact revision history remained readable.
- Completed readiness copy was corrected to positive fulfilled-prerequisite labels.
- `/reviews` empty state at 1366×768: queue occupies the available width and no empty detail panel is rendered.
- Status is not color-only; text and symbols remain present.

Screenshots were captured under the local temporary QA directory and intentionally not added to Git:

- `tasks-ready-1366x768.png`
- `tasks-ready-1440x900.png`
- `reviews-empty-1366x768.png`

## Not Accepted

Submitted, returned, revision-2, approved and external-action visual states could not be reached in-browser because the backend CORS preflight rejects `Idempotency-Key` and `If-Match`. No fake state or direct-API workaround was used to claim visual acceptance.

Visual release acceptance remains blocked until the backend CORS contract is hardened and the full browser lifecycle is repeated.
