# Narrow Release Rollback Plan

Date: 2026-07-15
Branch: `release/editor-ops-workflow-1`
Deployment action: none

## Rollback principle

This release has not been deployed. If later deployed and a runtime regression appears, rollback should redeploy the currently active production artifacts rather than applying database changes or feature-flag changes.

## Rollback candidates

- Frontend active artifact: `d21de1cb-46a1-4994-8bcd-45749c42d14e` / ZIP SHA-256 `53081a3cc46dc28e97b12c6f82b403fc2bcfdc304a9b737672c4a560c226e8dc`.
- Backend active artifact: `f3129580-9574-429a-a1b3-f078b1319cd7` / ZIP SHA-256 `8ece0510ed5546abafc6ec5e001b066bbc98d2f2cd05fa4e3f9b0696d8709949`.

## Rollback triggers

- Backend health failure.
- Auth regression.
- Client Portal guard regression.
- Schema/migration expectation mismatch.
- Frontend production bundle containing localhost/dev auth values.
- Editor, Case Detail, Tasks, Intake, Workload, Deadlines, Time Entries, Litigation, Notifications, or Clause Library blocking regression.

## Non-actions during rollback

- Do not run migrations.
- Do not change DB state.
- Do not enable feature flags.
- Do not modify Azure app settings unless an explicit operator rollback plan requires it.

## Final rollback artifact confirmation

Rollback deployment IDs remain:

- Frontend active deployment ID: `d21de1cb-46a1-4994-8bcd-45749c42d14e`.
- Backend active deployment ID: `f3129580-9574-429a-a1b3-f078b1319cd7`.

Locally available forensic rollback ZIPs:

- Frontend: `C:\Users\hubay\AppData\Local\Temp\adminiculum-artifact-forensics\frontend-wwwroot.zip` with SHA-256 `53081a3cc46dc28e97b12c6f82b403fc2bcfdc304a9b737672c4a560c226e8dc`.
- Backend: `C:\Users\hubay\AppData\Local\Temp\adminiculum-artifact-forensics\backend-wwwroot.zip` with SHA-256 `8ece0510ed5546abafc6ec5e001b066bbc98d2f2cd05fa4e3f9b0696d8709949`.

Rollback command previews only, do not run without approval:

```powershell
az webapp deploy --resource-group Adminiculum --name adminiculumfrontend-austriaeast-01 --type zip --src-path "C:\Users\hubay\AppData\Local\Temp\adminiculum-artifact-forensics\frontend-wwwroot.zip"
az webapp deploy --resource-group Adminiculum --name adminiculumbackend-b1-01 --type zip --src-path "C:\Users\hubay\AppData\Local\Temp\adminiculum-artifact-forensics\backend-wwwroot.zip"
```

## Executed backend rollback after production deploy attempt

On 2026-07-16 the backend narrow release artifact was deployed and then rolled back after a release-blocking smoke failure.

- Failed backend release deployment ID: `24f6a5a5-4004-4b7d-98ba-f91d5737fc52`.
- Trigger: authenticated `GET /api/v1/intake` returned `500`.
- Rollback artifact used: `C:\Users\hubay\AppData\Local\Temp\adminiculum-artifact-forensics\backend-wwwroot.zip`.
- Rollback artifact SHA-256 verified before final smoke: `8ece0510ed5546abafc6ec5e001b066bbc98d2f2cd05fa4e3f9b0696d8709949`.
- Rollback deployment completed through OneDeploy/Kudu after the operator-side command was interrupted.
- Kudu rollback deployment log timestamp: `2026-07-16T08:21:20Z` to `2026-07-16T08:21:22Z`.
- Final active backend deployment version from startup log: `48ff2e32-c3af-4463-ad8c-245d0ff6f10d`.
- Post-rollback backend smoke: health `200`, auth-first communications `401`, bogus route `404`, authenticated communications `200`, authenticated intake `404` prior-baseline behavior.
- Frontend rollback was not needed because frontend was not deployed.

Do not redeploy the `7392a6c` backend artifact without a separate intake enum-compatibility fix and a new validation/artifact cycle.
