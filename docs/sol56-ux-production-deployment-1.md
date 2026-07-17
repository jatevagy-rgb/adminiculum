# SOL56 UX Production Deployment 1

Date: 2026-07-17
Release: `sol56-ux-completion-1`
Runtime commit: `1033a4dcf1ceeeb70bb6ff22d2963a172d776986`

## Deployment Commands

Backend:

```powershell
az webapp deploy --resource-group Adminiculum --name adminiculumbackend-b1-01 --type zip --src-path "C:\Users\hubay\AppData\Local\Temp\adminiculum-sol56-ux-release\adminiculum-backend-sol56-ux-1033a4d.zip"
```

Frontend:

```powershell
az webapp deploy --resource-group Adminiculum --name adminiculumfrontend-austriaeast-01 --type zip --src-path "C:\Users\hubay\AppData\Local\Temp\adminiculum-sol56-ux-release\adminiculum-frontend-sol56-ux-1033a4d.zip"
```

These were the only Azure write commands. No settings, scale, SKU, slot, resource, database, or feature-flag command was run.

## Backend Deployment

- Target: existing `adminiculumbackend-b1-01` in resource group `Adminiculum`.
- Deployment ID: `b8e64588-2ca0-4f97-835c-0d894d831588`.
- Azure status: `RuntimeSuccessful`.
- Active Kudu status: `4`, complete and active.
- Attempts: `1`.

Authenticated production smoke used an Azure CLI delegated token for `api://a1e8b8a0-7690-4d09-9974-e4742d3de4e9/access_as_user`; no token value was printed or stored.

| Check | Result |
| --- | --- |
| `/health` | `200` |
| unauthenticated `/api/v1/tasks` | `401` |
| bogus route | `404` |
| authenticated intake | `200` |
| authenticated agenda | `200` |
| authenticated tasks | `200` |
| authenticated review queue | `200` |
| authenticated cases | `200` |
| authenticated dashboard stats | `200` |
| authenticated communications | `200` |
| link-task unauthenticated | `401` |
| link-task authenticated missing `taskId` | `400 VALIDATION_ERROR`, no write |
| authenticated missing document | `404 NOT_FOUND` |
| contracts gate | `501 CONTRACTS_NOT_ENABLED` |
| Outlook import gate | `501 OUTLOOK_IMPORT_NOT_ENABLED` |
| spoofed Client Portal route | `501 CLIENT_PORTAL_NOT_ENABLED` |

## Frontend Deployment

- Target: existing `adminiculumfrontend-austriaeast-01` in resource group `Adminiculum`.
- Deployment ID: `3785eb06-955b-4d7e-8e43-346e2ed306b3`.
- Attempts: `1`.
- Initial CLI result: `504 GatewayTimeout` while the deployment continued asynchronously.
- Retry: none.
- Final Kudu status: `4`, complete and active.
- Oryx: source ZIP accepted, build executed from `/tmp/zipdeploy/extracted`, `Found 0 issue(s)`, `Errors (0)`, `Warnings (0)`.
- Final Kudu message: `Deployment successful. deployer = OneDeploy deploymentPath = OneDeploy`.

Frontend route smoke returned `200` for `/`, `/cases`, `/tasks`, `/notifications`, `/reviews`, `/deadlines`, and `/time-entries`.

## Authenticated Production Acceptance

The production Microsoft SSO session was used in the in-app browser at `1440x900`.

- Dashboard: colored card grid retained; terracotta primary tile; direct quick actions; user-scoped resume; truthful deadline calendar; no old system/hero/capacity copy.
- Tasks: simplified title, filter grid, separate client column, suggested review wording, no `Blokkol`, no Home Office/foundation copy.
- Communications: one filter area, one list, one detail area, truthful persisted-status limitation, page-size controls, honest zero-result state.
- Review: five attention categories, submitter/assignee/case/client/date/urgency/status controls, honest zero-result state.
- Console warnings/errors: `0`.
- Page-level horizontal overflow: none on all four routes.
- Auth loop, localhost API target, raw technical error, and unexpected `500/501`: none.

Production had zero communications and zero review-status tasks. No production rows were created for acceptance; conditional item actions therefore remain covered by source review, automated tests, local authenticated QA, and authenticated route smoke.

## Rollback And Final State

- Rollback required: no.
- Backend active deployment: `b8e64588-2ca0-4f97-835c-0d894d831588`.
- Frontend active deployment: `3785eb06-955b-4d7e-8e43-346e2ed306b3`.
- Backend and frontend apps: `Running`.
- Production data writes during smoke: none.
- Schema/migration/database operations: none.
- Azure configuration changes: none.

Final classification: `SOL56_UX_PRODUCTION_DEPLOYMENT_SUCCESS`.
