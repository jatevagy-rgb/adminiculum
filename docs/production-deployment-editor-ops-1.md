# Production Deployment Editor Ops 1

Date: 2026-07-16
Release branch: `release/editor-ops-workflow-1`
Final release documentation commit before deploy attempt: `fff586b`
Runtime artifact source commit: `7392a6c`

## Summary

The backend narrow release artifact was deployed to production, but backend smoke found a release-blocking regression on the authenticated intake route. The frontend artifact was not deployed. The backend rollback artifact deployment completed and production backend behavior returned to the prior known-good baseline.

Final classification:

`production_backend_rollback_1_already_completed_frontend_untouched`

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
