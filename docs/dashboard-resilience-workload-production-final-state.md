# Dashboard Resilience + Workload Cards — Production Final State

Date: 2026-07-22

## Release

- Release branch: `release/editor-ops-workflow-1` @ `77bece8` (pushed).
- Runtime source commit: `bddeb81`.
- Integrated: dashboard partial-load resilience + legacy 6-card "Napi munka
  összefoglaló" restoration.

## Frontend (deployed)

- App: `adminiculumfrontend-austriaeast-01`.
- Active deployment: **`76702f05-3a3e-4f59-861e-81e37c91cd99`** (OneDeploy,
  status 4, active, complete; end 2026-07-22T08:50:26Z).
- Superseded deployment (rollback target): `0a985d83-a744-4560-b1eb-cb6fd9673981`.
- Serving Next.js (NODE|20-lts, Oryx build), HTTP 200.

## Backend (unchanged)

- App: `adminiculumbackend-b1-01`; active deployment
  `2ab2eb62-cd3c-4dc9-9475-308d1e10d07b` — **not redeployed**.

## Database (untouched)

- No connection, query, or migration. Migration head remains
  `20260719120000_add_client_color_key` (by invariance — backend/DB not touched).

## Azure / cost (unchanged)

- App service plan: B1 Basic, capacity 1. AlwaysOn true.
- App-settings hash before == after: `9dceafa1…2882` (11 settings).
- No slot, scaling, worker, auth, env-var, DB-tier, or monitoring change.
- Resource count unchanged. Only Azure write: the single frontend deployment.

## Behavior in production

- Partial-load resilience: optional section failure stays local; failure text
  distinct from successful-empty; single critical banner only for tasks+cases
  failure (verified in local browser QA 111/111; production normal-state shows no
  false error).
- Six colored workload cards live with terracotta + dark-green tokens and live
  counts; four light Quick Actions preserved; operational overview + Mai munkám
  preserved.

## Validation summary

Frontend: tsc/build/verify:prod-env clean; resilience unit 27/27; workload unit
16/16; resilience browser QA 111/111; workload browser QA 27/27. Backend: prisma
valid, tsc clean, 55 suites / 504 tests, build clean, no src/generated diff.
