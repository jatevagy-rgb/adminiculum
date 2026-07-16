# Final Narrow Release Deployment Command Preview

Date: 2026-07-16
Deployment action: none
Artifact source commit: `7392a6c`

## Recommended Deployment Order

1. Backend first: deploy API compatibility/document-delete backend changes.
2. Smoke backend health and protected-route auth behavior.
3. Frontend second: deploy UI/editor/workflow pages built against production backend URL.
4. Run full route/API smoke.

No slot swap, traffic change, migration, app setting change, feature flag change, or production restart is authorized by this document.

## Backend Deploy Command Preview

Do not run until explicit deployment approval:

```powershell
az webapp deploy `
  --resource-group Adminiculum `
  --name adminiculumbackend-b1-01 `
  --type zip `
  --src-path "C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\adminiculum-backend-editor-ops-7392a6c.zip"
```

Expected backend artifact SHA-256:

`fb0626cf16a9457f0235dfc19e9eb4b51d30f2f1459c075430ebb95b4c3112c6`

## Frontend Deploy Command Preview

Do not run until explicit deployment approval:

```powershell
az webapp deploy `
  --resource-group Adminiculum `
  --name adminiculumfrontend-austriaeast-01 `
  --type zip `
  --src-path "C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\adminiculum-frontend-editor-ops-7392a6c.zip"
```

Expected frontend artifact SHA-256:

`6939271e34658852dcaab3b46df2d39256350744fb46baadf1f383eaa7d7a5a4`

## Deployment ID Capture

After each approved deploy, capture:

```powershell
az webapp deployment list --resource-group Adminiculum --name <app-name> --query "[0].{id:id,status:status,author:author,deployer:deployer,message:message,start_time:start_time,end_time:end_time}" -o json
```

## Required Between-Component Check

After backend deploy and before frontend deploy:

- `/health` returns `200`;
- unauthenticated protected route returns `401`;
- bogus route returns `404`;
- no app settings changed.

## Post-Deploy Marker Verification

Verify deployed source/bundle markers include artifact source commit `7392a6c` in `release-manifest.json` if accessible, document delete route/service markers in backend, document delete UI text in frontend, and no localhost/dev credential strings in frontend runtime output.

## Post-Deploy Smoke Plan

Run after the approved backend-first, frontend-second deployment sequence:

### Backend/API

- `GET /health` returns `200`.
- Unauthenticated protected API requests return `401`.
- Bogus API route returns `404`.
- Existing communications list contract remains authenticated and safe.
- Agenda/deadline, task, case summary, workload, time-entry, intake, editor metadata, editor comments, and document delete routes do not return unexpected `500`.
- Document delete is only exercised on an approved synthetic/test document; do not delete real client documents during smoke.
- Disabled/quarantined families remain disabled or unavailable as before.

### Frontend

- `/` returns `200` and loads the dashboard.
- `/cases` and a real or smoke case detail route load.
- `/tasks`, `/deadlines`, `/workload`, `/time-entries`, `/intake`, `/litigation-workspace`, `/documents/compare`, `/notifications`, and `/clause-library` return `200`.
- Editor route opens with a smoke document where available and keeps scroll/edit controls usable.
- Document delete UI appears only where authorized and remains explicit/destructive-confirmation based.
- Client Portal mock/shell remains inert and does not become production-visible data.

### Guards

- Frontend network calls use `https://adminiculumbackend-b1-01.azurewebsites.net`, not localhost.
- Client Portal spoofed summary/export remains guarded as previously documented.
- No Azure app settings, feature flags, database state, migrations, or production secrets are changed during smoke.

## Intake Fix Backend-Only Redeployment Preview

Do not run until explicit backend-only redeployment approval:

```powershell
az webapp deploy `
  --resource-group Adminiculum `
  --name adminiculumbackend-b1-01 `
  --type zip `
  --src-path "C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\adminiculum-backend-editor-ops-intake-fix-e4e0c00.zip"
```

Expected replacement backend artifact SHA-256:

`76eacc73a19fa35d0bd092590d45b14d891288ccd37776a58bf44d7a84bea359`

Constraints for this redeployment path:

- Deploy backend only.
- Do not deploy frontend.
- Do not run migrations.
- Do not change Azure app settings or feature flags.
- Do not enable Client Portal, AI/n8n, Outlook import, or contract generation.
- Do not use the failed backend artifact `adminiculum-backend-editor-ops-7392a6c.zip`.

Required post-redeploy smoke:

- `GET /health` returns `200`.
- Unauthenticated protected API request returns `401`.
- Authenticated `GET /api/v1/intake` returns `200` with safe DTO shape and no Prisma enum error.
- Authenticated `GET /api/v1/agenda`, `/api/v1/workload`, `/api/v1/tasks`, and `/api/v1/cases` do not return broad `500`.
- Frontend remains untouched and previously deployed frontend state remains unchanged.
