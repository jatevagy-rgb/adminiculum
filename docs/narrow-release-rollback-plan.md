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

Do not redeploy the `7392a6c` backend artifact. The replacement intake-compatible backend artifact was deployed successfully as `1a976a8f-ecbb-4d15-a899-339b9d7444bf`; rollback remains available but was not required.

## Frontend OneDeploy 400 Repackage Note

The frontend deployment attempt for `adminiculum-frontend-editor-ops-7392a6c.zip` failed before replacing the active frontend deployment.

- Failed frontend deployment ID: `7d8f083b-ecf9-448c-a9ed-e9a04de34ad0`.
- Active frontend deployment stayed `d21de1cb-46a1-4994-8bcd-45749c42d14e`.
- No frontend rollback was required.
- Root cause: `ZIP_CONTENT_MODEL_INCOMPATIBLE`; the failed package was a local Windows-built partial `.next` package.
- Corrected package prepared but not deployed: `C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\adminiculum-frontend-editor-ops-7392a6c-repack1.zip`.
- Corrected SHA-256: `29c840461c302befddefb2a4f585134c9fbd0c5ddf66c702c4dada9d67ab15f0`.

If the corrected frontend deployment is later approved and fails, rollback remains the active frontend forensic artifact:

```powershell
az webapp deploy --resource-group Adminiculum --name adminiculumfrontend-austriaeast-01 --type zip --src-path "C:\Users\hubay\AppData\Local\Temp\adminiculum-artifact-forensics\frontend-wwwroot.zip"
```

## Corrected Frontend Deployment Rollback Status

`CORRECTED-FRONTEND-ORYX-REDEPLOY-1` completed successfully after an initial CLI `504 GatewayTimeout`.

- Active frontend deployment after completion: `9650525c-d465-468d-8171-f830128b9e7b`.
- Oryx summary: `Errors (0)`, `Warnings (0)`.
- Rollback required: no.
- Rollback artifact remains available for future use if a later smoke finds a release-blocking issue.


## Backend-Only Intake Compatibility Redeployment

`BACKEND-ONLY-REDEPLOY-INTAKE-COMPAT-1` was executed on 2026-07-16 after explicit human approval.

Deployment command used:

```powershell
az webapp deploy --resource-group Adminiculum --name adminiculumbackend-b1-01 --type zip --src-path "C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\adminiculum-backend-editor-ops-intake-fix-e4e0c00.zip"
```

Deployment result:

- Deployment ID: `1a976a8f-ecbb-4d15-a899-339b9d7444bf`.
- Azure status: `RuntimeSuccessful`.
- Resource: `adminiculumbackend-b1-01`.
- Region: `Austria East`.
- Artifact SHA-256 verified before deploy: `76eacc73a19fa35d0bd092590d45b14d891288ccd37776a58bf44d7a84bea359`.
- Runtime fix source commit: `e4e0c00`.
- Release branch documentation commit before deploy: `bd05fdc`.
- Release identifier: `editor-ops-workflow-intake-fix-1`.

Post-deploy smoke:

| Check | Result |
| --- | --- |
| `GET /health` | `200` |
| unauthenticated `GET /api/v1/communications?limit=8` | `401` |
| bogus route | `404` |
| unauthenticated `GET /api/v1/intake` | `401` |
| authenticated `GET /api/v1/auth/me` | `200` |
| authenticated `GET /api/v1/intake` | `200`, safe DTO (`generatedAt`, `summary`, `items`, `pagination`, `availability`) |
| authenticated `GET /api/v1/agenda` | `200` |
| authenticated `GET /api/v1/workload` | `200` |
| authenticated `GET /api/v1/tasks` | `200` |
| authenticated `GET /api/v1/cases` | `200` |
| authenticated `GET /api/v1/cases/smoke-case/lifecycle` | `404 CASE_NOT_FOUND`, safe missing state |
| authenticated `GET /api/v1/communications?limit=8` | `200`, safe list shape |
| authenticated editor metadata missing smoke document | `404`, safe missing state |
| authenticated document comments missing smoke document | `404 DOCUMENT_NOT_FOUND`, safe missing state |
| Client Portal spoofed summary/export | `501 CLIENT_PORTAL_NOT_ENABLED` |
| Outlook import gate | `501 OUTLOOK_IMPORT_NOT_ENABLED` |
| contract generation gate | `501 CONTRACTS_NOT_ENABLED` |

Feature/app setting posture after deploy:

- `ENABLE_COMMUNICATIONS_PERSISTENCE=true`.
- `ENABLE_CLIENT_PORTAL_PUBLIC=false`.
- `ENABLE_OUTLOOK_IMPORT` absent/off.
- Contract generation remains gated.
- No Azure app settings or feature flags were changed.

Network/log audit:

- No smoke response contained raw Prisma error text, stack trace, `workspaceText`, AI/n8n markers, or sensitive content.
- Invalid-token intake response remained sanitized as `401` with no Prisma/stack leakage.
- No production mutation smoke was performed.

Frontend state:

- Frontend was not deployed.
- Frontend App Service remained `Running` with `lastModifiedTimeUtc` `2026-06-25T20:29:59.863333`.

Rollback status:

- Rollback was not required.
- Rollback artifact remained available and hash-verified before deployment: `8ece0510ed5546abafc6ec5e001b066bbc98d2f2cd05fa4e3f9b0696d8709949`.

Final classification:

`backend_only_intake_compat_redeployment_1_success`


## Frontend-Only Editor Ops Deployment Attempt Blocked

`FRONTEND-ONLY-DEPLOY-NARROW-EDITOR-OPS-1` was attempted on 2026-07-16 after explicit human approval, but Azure OneDeploy rejected the prepared frontend ZIP before activation.

Artifact integrity before deploy:

- Artifact: `C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\adminiculum-frontend-editor-ops-7392a6c.zip`.
- SHA-256 verified: `6939271e34658852dcaab3b46df2d39256350744fb46baadf1f383eaa7d7a5a4`.
- Manifest source commit: `7392a6c`.
- Manifest branch: `release/editor-ops-workflow-1`.
- Manifest component: `frontend`.
- Manifest release identifier: `editor-ops-workflow-1`.
- Production public backend URL in manifest: `https://adminiculumbackend-b1-01.azurewebsites.net`.

Deployment command attempted:

```powershell
az webapp deploy --resource-group Adminiculum --name adminiculumfrontend-austriaeast-01 --type zip --src-path "C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\adminiculum-frontend-editor-ops-7392a6c.zip"
```

Azure result:

- Failed frontend deployment ID: `7d8f083b-ecf9-448c-a9ed-e9a04de34ad0`.
- Deployment status: `3` / failed.
- OneDeploy log: Oryx build was invoked, build summary reported `Errors (0)` / `Warnings (0)`, then final deployment failed.
- The failed deployment is inactive.
- The previous active frontend deployment remained active: `d21de1cb-46a1-4994-8bcd-45749c42d14e`.
- Frontend App Service remained `Running` with `lastModifiedTimeUtc` `2026-06-25T20:29:59.863333`.

Safety verification after failed attempt:

- Backend stayed healthy on deployment `1a976a8f-ecbb-4d15-a899-339b9d7444bf`.
- Backend smoke after failed attempt: `/health` `200`, authenticated intake `200`, agenda `200`, tasks `200`, cases `200`.
- Frontend smoke routes on the still-active baseline returned `200` for `/`, `/cases`, `/tasks`, and `/notifications`.
- Frontend app settings were not changed; `NEXT_PUBLIC_BACKEND_BASE_URL` remained `https://adminiculumbackend-b1-01.azurewebsites.net`.
- No backend deploy, schema change, migration, DB operation, app-setting change, feature-flag change, Client Portal enablement, Outlook enablement, AI/n8n enablement, or rollback occurred.

Assessment:

- This is not a runtime smoke failure of the new frontend because the new frontend did not activate.
- This is not a rollback case because the prior frontend deployment stayed active.
- Current frontend deployment posture is blocked on Azure/OneDeploy artifact activation.
- A future retry needs an explicit follow-up decision on deploy mechanics/artifact shape; do not silently rebuild or upload a different frontend artifact under this approval.

Final classification:

`frontend_only_editor_ops_deployment_1_blocked_azure_operation`
