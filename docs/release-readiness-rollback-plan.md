# Release Readiness Rollback Plan

Date: 2026-07-15
Current HEAD: `6800b13`

## Rollback posture

Rollback is not being performed by this package. Because the exact active production deployment commits are not fully proven from repo records, rollback targets must be verified from Azure/App Service deployment history before any deploy.

| Component | Previous known-good candidate | Confidence | Rollback independence | Caveat |
|---|---:|---|---|---|
| Frontend | `71e4293` | Medium | Usually independent | Must verify active frontend deployment ID/artifact. |
| Backend | `d950e87` | Medium | Usually independent | Must verify active backend deployment ID/artifact. |

## Rollback triggers

- Backend `/health` fails.
- Auth behavior regresses or protected routes stop returning 401 unauthenticated.
- Client Portal guard opens unexpectedly.
- Frontend bundle calls localhost, dev auth, or wrong backend URL.
- Editor route hard-crashes or loses export-only warning.
- Core workflow routes return 500 for normal authenticated reads.
- OpenAPI/CORS/admin route exposure regresses beyond approved behavior.

## Frontend rollback

1. Verify exact active frontend deploy ID and artifact commit.
2. Redeploy previous known-good frontend artifact/commit only.
3. Do not change backend or Azure settings unless rollback runbook explicitly requires it.
4. Smoke `/`, `/cases`, `/tasks`, `/documents/[id]/edit`, `/notifications`, `/clause-library`, `/portal`.
5. Grep deployed bundle for `localhost:3001`, `127.0.0.1`, `/api/v1/auth/login`, test credentials, and dev backend URLs.

## Backend rollback

1. Verify exact active backend deploy ID and artifact commit.
2. Redeploy previous known-good backend artifact/commit only.
3. Do not run migrations.
4. Smoke `/health`, auth/me unauth 401, cases/tasks/communications read routes, client-portal guard, Outlook import gate-off.
5. Confirm app settings unchanged.

## Feature-flag kill switches

- Keep `ENABLE_CLIENT_PORTAL*` off.
- Keep `ENABLE_OUTLOOK_IMPORT` off unless separately approved.
- Keep runtime-admin routes off unless explicit operational need exists.
- Keep editor server persistence/document AI flags off unless separately approved.
- Contract generation/clause library flags must follow existing production approvals.

## Data caveats

This readiness package did not run migrations or write data. The candidate branch contains schema/migration files; if those were ever applied in a future separate release, rollback would no longer be code-only and would require a DB-specific rollback plan.
