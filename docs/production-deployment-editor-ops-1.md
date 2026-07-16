# Production Deployment Editor Ops 1

Date: 2026-07-16
Release branch: `release/editor-ops-workflow-1`
Final release documentation commit before deploy attempt: `fff586b`
Runtime artifact source commit: `7392a6c`

## Summary

The backend narrow release artifact was deployed to production, but backend smoke found a release-blocking regression on the authenticated intake route. The frontend artifact was not deployed. The backend rollback artifact deployment completed and production backend behavior returned to the prior known-good baseline.

Final classification:

`backend_only_intake_compat_redeployment_1_success`

## Artifacts

| Component | Artifact | SHA-256 | Deployment result |
| --- | --- | --- | --- |
| Backend release | `C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\adminiculum-backend-editor-ops-7392a6c.zip` | `fb0626cf16a9457f0235dfc19e9eb4b51d30f2f1459c075430ebb95b4c3112c6` | Deployed, then rolled back |
| Frontend release | `C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\adminiculum-frontend-editor-ops-7392a6c.zip` | `6939271e34658852dcaab3b46df2d39256350744fb46baadf1f383eaa7d7a5a4` | Not deployed |
| Backend rollback | `C:\Users\hubay\AppData\Local\Temp\adminiculum-artifact-forensics\backend-wwwroot.zip` | `8ece0510ed5546abafc6ec5e001b066bbc98d2f2cd05fa4e3f9b0696d8709949` | Deployed successfully |

## Backend Release Deploy

Command used:

```powershell
az webapp deploy --resource-group Adminiculum --name adminiculumbackend-b1-01 --type zip --src-path "C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\adminiculum-backend-editor-ops-7392a6c.zip"
```

Azure deployment status:

- Release deployment ID: `24f6a5a5-4004-4b7d-98ba-f91d5737fc52`
- Status from deploy output: `RuntimeSuccessful`
- Resource: `adminiculumbackend-b1-01`
- Region: `Austria East`

## Backend Release Smoke Failure

Immediate backend smoke after release deploy:

| Check | Result |
| --- | --- |
| `GET /health` | `200` |
| unauthenticated `GET /api/v1/communications?limit=8` | `401` |
| bogus route | `404` |
| authenticated `GET /api/v1/communications?limit=8` | `200` |
| authenticated `GET /api/v1/agenda` | `200` |
| authenticated `GET /api/v1/workload` | `200` |
| authenticated `GET /api/v1/time-entries` | `200` |
| authenticated `GET /api/v1/intake` | `500` release blocker |
| editor metadata missing smoke document | `404` safe missing state |
| comments missing smoke document | `404` safe missing state |
| Client Portal summary | `501 FEATURE_NOT_AVAILABLE` |
| Outlook import | `501 FEATURE_NOT_AVAILABLE` |
| contract generation | `501 FEATURE_NOT_AVAILABLE` |
| unauthenticated document delete missing smoke document | `401` |

Safe root-cause clue preserved from production logs:

- Request path: `GET /api/v1/intake`
- Failure occurred after authentication, inside intake queue read logic.
- Error category: Prisma client validation.
- Indicator: `Task.status notIn` contained values not valid for the deployed `TaskStatus` enum.
- Affected code category: `Backend/src/modules/cases/intakeService.ts`, open-task count query used by intake queue.

No production data payloads, tokens, secrets, document content, or client details were recorded.

## Backend Rollback

The rollback command was started with the prior known-good artifact. The operator-side command was interrupted, but Kudu/App Service completed the deployment and restarted the backend.

Rollback command:

```powershell
az webapp deploy --resource-group Adminiculum --name adminiculumbackend-b1-01 --type zip --src-path "C:\Users\hubay\AppData\Local\Temp\adminiculum-artifact-forensics\backend-wwwroot.zip"
```

Rollback evidence:

- Rollback artifact SHA-256 rechecked: `8ece0510ed5546abafc6ec5e001b066bbc98d2f2cd05fa4e3f9b0696d8709949`
- Kudu deployment log timestamp: `2026-07-16T08:21:20Z` / `2026-07-16T08:21:22Z`
- Startup log timestamp: `2026-07-16T08:22:32Z`
- Final active backend deployment version from startup log: `48ff2e32-c3af-4463-ad8c-245d0ff6f10d`
- Startup validation passed.

## Post-Rollback Smoke

| Check | Result |
| --- | --- |
| `GET /health` | `200` |
| unauthenticated `GET /api/v1/communications?limit=8` | `401` |
| bogus route | `404` |
| authenticated `GET /api/v1/communications?limit=8` | `200` |
| authenticated `GET /api/v1/intake` | `404` prior-baseline route behavior, no longer `500` |
| authenticated Outlook import | `501 FEATURE_NOT_AVAILABLE`, feature `OUTLOOK_IMPORT` |
| Client Portal summary | `501 FEATURE_NOT_AVAILABLE`, feature `CLIENT_PORTAL` |
| contract generation | `501` gated/unavailable behavior |

## Frontend Safety

The frontend artifact was not deployed.

Frontend verification:

- Frontend app state: `Running`
- Frontend `lastModifiedTimeUtc`: `2026-06-25T20:29:59.863333`
- `/`, `/cases`, `/tasks`, and `/notifications` returned `200`
- No frontend rollback was needed.

## Non-Actions

- No frontend deployment.
- No schema change.
- No migration.
- No database operation.
- No Azure configuration change.
- No feature flag change.
- No Client Portal enablement.
- No Outlook enablement.
- No AI/n8n enablement.

## Follow-Up Required

The intake route regression must be fixed offline on a separate release branch before another production deploy attempt. The likely fix area is deployed enum compatibility in the intake queue task-status exclusion query.

## Intake task status production compatibility fix

`INTAKE-TASK-STATUS-PRODUCTION-COMPAT-FIX-1` implemented the narrow backend code fix for the failed production intake smoke, but it is not yet a deployable artifact.

- Failed release deployment ID preserved: `24f6a5a5-4004-4b7d-98ba-f91d5737fc52`.
- Root cause: `Task.status notIn` filters included values absent from the deployed/generated `TaskStatus` enum.
- Valid `TaskStatus` values: `PENDING`, `IN_PROGRESS`, `SUBMITTED`, `UNDER_REVIEW`, `COMPLETED`, `CANCELLED`, `BLOCKED`, `TODO`, `IN_REVIEW`, `DONE`.
- Removed invalid runtime Prisma filter values: `APPROVED`, `REJECTED`, `DECLINED`, `ARCHIVED`.
- Automated backend and frontend validation passed.
- Live local authenticated intake smoke was later completed successfully using process-only local env loading from the primary worktree.
- A replacement backend-only artifact was generated from `e4e0c00`.
- No deployment was performed after the replacement artifact was generated.
- Current posture: `GO_FOR_BACKEND_ONLY_REDEPLOYMENT_APPROVAL`; explicit backend-only deployment approval is still required.


## Intake Fix Completion Artifact

`COMPLETE-INTAKE-COMPAT-SMOKE-AND-BACKEND-ARTIFACT-1` supersedes the earlier local compatibility blocker.

- Source commit: `e4e0c00`.
- Backend artifact: `C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\adminiculum-backend-editor-ops-intake-fix-e4e0c00.zip`.
- Backend artifact SHA-256: `76eacc73a19fa35d0bd092590d45b14d891288ccd37776a58bf44d7a84bea359`.
- Local authenticated `GET /api/v1/intake` smoke passed with `200` and safe empty DTO shape.
- Related authenticated read smoke passed for agenda, workload, tasks, and cases; missing smoke lifecycle route returned safe `404 CASE_NOT_FOUND`.
- Frontend `/intake` compatibility smoke passed locally against the fixed backend with unchanged frontend code.
- Production remains rolled back to active backend version `48ff2e32-c3af-4463-ad8c-245d0ff6f10d`.
- Frontend remains undeployed.
- No deployment, schema change, migration, DB operation, Azure config change, feature flag change, Client Portal enablement, AI/n8n enablement, or frontend runtime change occurred.
- Current posture: `BACKEND_ONLY_REDEPLOYMENT_SUCCESS`; backend redeployed, smoke passed, frontend untouched.


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
