# Task Lifecycle Production Acceptance

Date: 2026-07-19

## Backend Acceptance

An Azure CLI delegated token for the production Adminiculum API scope was available. No token value was printed or stored.

| Check | Result |
| --- | --- |
| `/health` | `200` |
| unauthenticated tasks | `401` |
| authenticated tasks | `200` |
| authenticated review queue | `200` |
| authenticated dashboard statistics | `200` |
| unauthenticated communications | `401` |
| authenticated communications | `200`, safe `communications` + `pagination` shape |
| authenticated time entries | `200` |
| fake task lifecycle target | safe `404` |
| Client Portal spoofed summary/export | `501 CLIENT_PORTAL_NOT_ENABLED` |
| CORS preflight | `204`, production origin and lifecycle headers accepted |

No mutation was sent to a real client task. Local full lifecycle mutation behavior remains the applicable proof for transition behavior.

## Frontend Acceptance

The new frontend artifact did not activate and therefore could not pass authenticated production acceptance. The prior known-good frontend was restored once and then proved by public route smoke:

- `/`, `/tasks`, `/reviews`, `/time-entries`, `/cases`, `/notifications`, `/documents/compare`, `/intake`, `/deadlines`: `200`.
- Login page rendered without console errors.
- Production API base setting remained `https://adminiculumbackend-b1-01.azurewebsites.net`.

The in-app browser session available during final verification was not authenticated, so no claim is made that the rolled-back frontend exercised the new task lifecycle UI. This is the release blocker that prevents a success classification.

## Acceptance Decision

- Backend and migrated schema: accepted.
- Restored prior frontend availability: accepted.
- Integrated task-lifecycle frontend release: not accepted and not active.
- Overall release result: frontend rolled back; follow-up requires a fresh, separately approved frontend artifact/deploy ticket.
