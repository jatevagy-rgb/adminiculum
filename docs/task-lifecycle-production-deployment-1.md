# Task Lifecycle Production Deployment 1

Date: 2026-07-19
Runtime source commit: `4647c080f7c070713ff9ec1f82e4140e3f622c77`

## Backend Deployment

- Target: `adminiculumbackend-b1-01`.
- Method: one `az webapp deploy --type zip` invocation using the existing Oryx source-ZIP path.
- Artifact: `C:\Users\hubay\AppData\Local\Temp\adminiculum-task-lifecycle-prod-4647c08-20260719T162339Z\adminiculum-backend-task-lifecycle-4647c08.zip`.
- SHA-256: `f60e1492a04064f590529ee6981b80f2ed03a2b51177bb72e7f0026c8ef63f03`.
- Deployment ID: `be17637b-5431-4de6-a96a-98fe8ada884a`.
- Kudu result: status 4, complete, active.
- Kudu interval: `2026-07-19T16:37:21.0033329Z` to `2026-07-19T16:40:50.1417512Z`.
- Backend smoke: passed.

## Frontend Candidate Deployment

- Target: `adminiculumfrontend-austriaeast-01`.
- Method: one `az webapp deploy --type zip` invocation using the existing Oryx source-ZIP path.
- Artifact: `C:\Users\hubay\AppData\Local\Temp\adminiculum-task-lifecycle-prod-4647c08-20260719T162339Z\adminiculum-frontend-task-lifecycle-4647c08.zip`.
- SHA-256: `987a77f4ef0ad27142ce440d4d06230e57937951e00edbb759b67fa2e733768c`.
- Authoritative failed deployment record: `a27dcd43-96a9-44de-bcde-8657a4bb4bb6`, status 3, inactive.
- Intermediate OneDeploy tracker observed before rollback: `3fc3f4ba-09b7-4de3-a496-bb13c75ca126`.
- Failure mode: Oryx did not reach activation; frontend routes returned `503` while the operation was stalled.
- No blind retry of the candidate artifact was performed.

## Frontend Rollback

The authorized one-time component rollback used the immediately preceding known-good frontend artifact.

- Artifact: `C:\Users\hubay\AppData\Local\Temp\adminiculum-sol56-ux-release\adminiculum-frontend-sol56-ux-1033a4d.zip`.
- SHA-256: `68ec4754616a1b61dfa8aefdb28790605afc7333f2a2d5d3f7cfdb45ee746ae5`.
- CLI result: `504 GatewayTimeout`; no retry was made.
- Kudu deployment ID: `f1ab9847-fb1a-4e7f-9c8a-e103904c2711`.
- Kudu result: status 4, complete, active.
- Kudu interval: `2026-07-19T17:05:35.6169801Z` to `2026-07-19T17:15:01.4851748Z`.
- Active frontend runtime source: `1033a4dcf1ceeeb70bb6ff22d2963a172d776986`.
- Restored routes: `/`, `/tasks`, `/reviews`, `/time-entries`, `/cases`, `/notifications`, `/documents/compare`, `/intake`, `/deadlines` all returned `200`.

## Final Component State

- Production schema: task lifecycle migration applied and verified.
- Backend: task lifecycle release active and healthy.
- Frontend: prior known-good SOL56 UX artifact active after rollback.
- Full task-lifecycle frontend acceptance: not achieved in production.
- No settings, flags, auth, package, SKU, scale, slot, or resource changes occurred.

Final classification: `TASK_LIFECYCLE_PRODUCTION_FRONTEND_ROLLED_BACK`
