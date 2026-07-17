# Operational UX Final Deployment Preview

## Status

Commands only. No command in this document was executed during release integration.

The approved production execution on 2026-07-17 stopped before the backend command because both embedded manifests identified `d6070fa` as `officialReleaseCommit`, while the execution authorization required `94e4c44`.

Current decision:

`DEPLOYMENT_BLOCKED_ARTIFACT_PROVENANCE`

The deployment commands below remain previews only and must not be run until a separate explicit provenance resolution and approval is recorded.

Prior release-candidate decision:

`GO_FOR_OPERATIONAL_UX_PRODUCTION_DEPLOYMENT_APPROVAL`

## Mandatory Order

1. Reconfirm the release branch and both artifact hashes.
2. Deploy backend artifact.
3. Verify backend deployment completion.
4. Run backend authenticated smoke.
5. Deploy frontend artifact.
6. Verify Oryx/OneDeploy completion.
7. Run authenticated browser acceptance.
8. Decide whether rollback is required.

## Backend Command Preview

```powershell
az webapp deploy `
  --resource-group Adminiculum `
  --name adminiculumbackend-b1-01 `
  --type zip `
  --src-path "C:\Users\hubay\AppData\Local\Temp\adminiculum-operational-ux-final-release\adminiculum-backend-operational-ux-final-d6070fa.zip"
```

Expected SHA-256:

`b62028f4bd8b64089a82ce891b343af4ab4b9d4f7cd4b4b6347d7e7775f4bbba`

Required backend smoke before frontend deployment:

- `/health` -> `200`;
- unauth communications -> `401`;
- bogus route -> `404`;
- authenticated intake, agenda, cases, communications -> `200`;
- safe missing document -> `404`;
- Client Portal and Outlook gates remain closed;
- no raw internal error.

## Frontend Command Preview

Only after backend smoke succeeds:

```powershell
az webapp deploy `
  --resource-group Adminiculum `
  --name adminiculumfrontend-austriaeast-01 `
  --type zip `
  --src-path "C:\Users\hubay\AppData\Local\Temp\adminiculum-operational-ux-final-release\adminiculum-frontend-operational-ux-final-d6070fa.zip"
```

Expected SHA-256:

`4202d9c41b6ed13517cc57714bd47ac6ac19178411ef483bc03c336d7f8d1060`

The existing production public env must be available to Oryx:

```text
NEXT_PUBLIC_BACKEND_BASE_URL=https://adminiculumbackend-b1-01.azurewebsites.net
NEXT_PUBLIC_ENABLE_LOCAL_DEV_AUTH=false
NEXT_PUBLIC_ENTRA_REDIRECT_URI=https://adminiculumfrontend-austriaeast-01.azurewebsites.net
NEXT_PUBLIC_ENTRA_POST_LOGOUT_REDIRECT_URI=https://adminiculumfrontend-austriaeast-01.azurewebsites.net
```

Do not build from `.env.local` and do not upload a local Windows `.next` package.

## Completion Verification Preview

```powershell
az webapp deployment list `
  --resource-group Adminiculum `
  --name <app-name> `
  --query "[0].{id:id,status:status,message:message,start_time:start_time,end_time:end_time}" `
  -o json
```

If the CLI returns a timeout, inspect Kudu/OneDeploy completion and live smoke before retrying or rolling back.

## Rollback Preview

Current active rollback candidates were re-hashed and must not be overwritten.

Backend:

```powershell
az webapp deploy --resource-group Adminiculum --name adminiculumbackend-b1-01 --type zip --src-path "C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\adminiculum-backend-editor-ops-intake-fix-e4e0c00.zip"
```

SHA-256:

`76eacc73a19fa35d0bd092590d45b14d891288ccd37776a58bf44d7a84bea359`

Frontend:

```powershell
az webapp deploy --resource-group Adminiculum --name adminiculumfrontend-austriaeast-01 --type zip --src-path "C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\adminiculum-frontend-editor-ops-7392a6c-repack1.zip"
```

SHA-256:

`29c840461c302befddefb2a4f585134c9fbd0c5ddf66c702c4dada9d67ab15f0`

Current deployment references:

- backend `1a976a8f-ecbb-4d15-a899-339b9d7444bf`;
- frontend `9650525c-d465-468d-8171-f830128b9e7b`.

No deployment or rollback is authorized by this document.
