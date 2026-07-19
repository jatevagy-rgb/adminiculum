# Task Lifecycle Frontend Redeployment

Date: 2026-07-19

## Precheck

- Previous frontend deployment `f1ab9847-fb1a-4e7f-9c8a-e103904c2711`: status `4`, complete, active.
- Backend deployment `be17637b-5431-4de6-a96a-98fe8ada884a`: status `4`, complete, active.
- Backend `/health`, authenticated tasks, and authenticated review queue: `200`.
- Frontend `/`, `/tasks`, and `/reviews`: `200`.
- Frontend and backend HTTP 5xx count in the immediate five-minute precheck: zero.
- Concurrent frontend deployment count: zero.
- Frontend App Service settings: 11, SHA-256 `e09de0b6747bddf0e836796efd0d90a313cc224748f293a0afa11dcca2cce01f`.
- Production backend target: `https://adminiculumbackend-b1-01.azurewebsites.net`.

## One Deployment Attempt

Command shape:

```powershell
az webapp deploy `
  --resource-group Adminiculum `
  --name adminiculumfrontend-austriaeast-01 `
  --src-path <checksum-verified-recovery-artifact> `
  --type zip `
  --clean true `
  --restart true `
  --async true `
  --track-status false `
  --only-show-errors
```

The local CLI process timed out after upload. No retry was issued. Kudu had already created deployment `2af5724d-277b-49ad-997d-80f557a36aff`, so the operation continued under bounded read-only polling.

The corrected Kudu trace shows one incoming publish request and one background continuation for that same request. It does not show a second incoming publish competing with the build.

## Kudu Result

- Deployment ID: `2af5724d-277b-49ad-997d-80f557a36aff`.
- Received: `2026-07-19T18:05:14Z`.
- Started: `2026-07-19T18:05:15Z`.
- Ended: `2026-07-19T18:15:10Z`.
- Status: `4`.
- Complete: true.
- Active: true.
- Oryx: Node `20.20.2`, Next.js `15.5.20`.
- Next compile: successful in 2.5 minutes.
- Static pages: 22/22.
- Oryx summary: errors 0, warnings 0.
- Output copy to `/home/site/wwwroot`: completed.
- Natural OneDeploy recycle trigger: completed.

The inherited Next.js `<img>` optimization warning remains visible in the detailed build log but did not appear as an Oryx deployment issue.

## Activation And Immutability

The deployed `release-manifest.json` proves runtime source `4647c08`, compatible backend deployment, required migration head, production API target, and target App Service. The pre/post App Service settings count and SHA-256 are identical. Backend deployment remained unchanged. No database connection, migration, backend deployment, manual restart, setting change, resource change, or feature-flag change occurred.

Rollback required: no.
