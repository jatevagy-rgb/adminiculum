# Dashboard Resilience + Workload Cards — Production Deployment

Date: 2026-07-22

## Target

`adminiculumfrontend-austriaeast-01` (RG `Adminiculum`, B1 Basic, austriaeast).

## Precheck (immediately before deploy)

| Item | Value |
|---|---|
| Frontend health | HTTP 200 |
| Backend state | Running; active deployment `2ab2eb62-cd3c-4dc9-9475-308d1e10d07b` (unchanged) |
| Production migration head | `20260719120000_add_client_color_key` (unchanged — backend/DB not touched) |
| Concurrent frontend deployment | none (prior active `0a985d83…` status 4) |
| Prior frontend deployment (rollback ref) | `0a985d83-a744-4560-b1eb-cb6fd9673981` |
| App-settings hash | `9dceafa1…2882` (11 settings) |
| Artifact SHA-256 | `907a7202…e119b` |
| Build flags | `SCM_DO_BUILD_DURING_DEPLOYMENT=true`, `ENABLE_ORYX_BUILD=true`, `WEBSITE_RUN_FROM_PACKAGE=0`, NODE\|20-lts |

No DB connection or write performed.

## Deployment (exactly one)

- Method: single async OneDeploy — `az webapp deploy --type zip --async true`.
- One upload attempt only. The CLI foreground call timed out; per protocol it was
  **not retried** — authoritative state was inspected read-only instead.

## Kudu / ARM result

- **Deployment ID:** `76702f05-3a3e-4f59-861e-81e37c91cd99`
- Message: `OneDeploy`
- Status: **4** (success), **complete: true**, **active: true**
- Start: 2026-07-22T08:39:34Z · End: 2026-07-22T08:50:26Z
- Oryx: "Running oryx build… Deployment successful. deployer = OneDeploy",
  output to `/home/site/wwwroot`.
- Production serves the new build: `X-Powered-By: Next.js`, `/_next/static/*`
  chunks, HTTP 200.

## Post-deploy safety

- Backend active deployment still `2ab2eb62…` (no backend deploy).
- App-settings hash after deploy `9dceafa1…2882` — identical (no config change).
- App service plan still B1 Basic, capacity 1, alwaysOn true.
