# Frontend OneDeploy 400 Root Cause 1

Date: 2026-07-16
Release branch: `release/editor-ops-workflow-1`
Deployment action: none

## Executive Summary

The failed frontend deployment was not a source/runtime regression. Azure OneDeploy accepted and extracted the ZIP, invoked Oryx, reported `Errors (0)` and `Warnings (0)`, then failed deployment activation.

Primary root cause classification:

`ZIP_CONTENT_MODEL_INCOMPATIBLE`

The rejected ZIP was a small local Windows-built `.next` package without source files, without `node_modules`, without `.next/standalone`, and without `server.js`. Its Next `required-server-files.json` still referenced local Windows build paths such as `C:\Users\hubay\Documents\Adminiculum-release-editor-ops\Frontend`. The frontend App Service is configured for Oryx/source deployment and `npm run start`, not for activating this partial prebuilt Windows `.next` package.

## Failed Deployment

- Failed deployment ID: `7d8f083b-ecf9-448c-a9ed-e9a04de34ad0`
- Active frontend deployment after failure: `d21de1cb-46a1-4994-8bcd-45749c42d14e`
- Target app: `adminiculumfrontend-austriaeast-01`
- Resource group: `Adminiculum`
- Deployment message: `OneDeploy`
- Deployment status: inactive / failed (`status: 3`)
- Deployment window: `2026-07-16T09:54:43.8046956Z` to `2026-07-16T09:56:34.2657992Z`

Azure deployment log text available through `az webapp log deployment show`:

```text
Preparing deployment for commit id '7d8f083b-e'.
PreDeployment: context.CleanOutputPath False
PreDeployment: context.OutputPath /home/site/wwwroot
Repository path is /tmp/zipdeploy/extracted
Running oryx build...
Generating summary of Oryx build
Parsing the build logs
Found 0 issue(s)
Build Summary :
Errors (0)
Warnings (0)
Deployment Failed. deployer = OneDeploy deploymentPath = OneDeploy
```

The nested Oryx detail URL returned `401` when fetched with publishing credentials, so no deeper Kudu body was available without additional Azure support/access. No secrets were printed.

## Failed Artifact Structure

- File: `C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\adminiculum-frontend-editor-ops-7392a6c.zip`
- SHA-256: `6939271e34658852dcaab3b46df2d39256350744fb46baadf1f383eaa7d7a5a4`
- Size: `4310822` bytes
- File count: `330`
- Root entries: `.next`, `next.config.mjs`, `package-lock.json`, `package.json`, `public`, `release-manifest.json`, `tsconfig.json`
- No wrapper directory: confirmed
- Duplicate entries: `0`
- Bad absolute/traversal path entries: `0`
- `.next`: present
- `.next/standalone`: absent
- `server.js`: absent
- `node_modules`: absent
- `src`: absent
- `public`: present

Failed artifact Next manifest evidence:

- `.next/required-server-files.json` `appDir`: `C:\Users\hubay\Documents\Adminiculum-release-editor-ops\Frontend`
- `.next/required-server-files.json` `outputFileTracingRoot`: `C:\Users\hubay`

This proves the failed package contained a locally built Windows `.next` output.

## Working Artifact Comparison

Known active frontend rollback artifact:

- File: `C:\Users\hubay\AppData\Local\Temp\adminiculum-artifact-forensics\frontend-wwwroot.zip`
- SHA-256: `53081a3cc46dc28e97b12c6f82b403fc2bcfdc304a9b737672c4a560c226e8dc`
- Size: `330015029` bytes
- File count: `4182`
- Active deployment ID: `d21de1cb-46a1-4994-8bcd-45749c42d14e`

| Aspect | Active working artifact | Failed new artifact | Material difference | Likely relevance |
| --- | --- | --- | --- | --- |
| Deployment model | Oryx-built wwwroot | local `.next` partial | Yes | App Service is source/Oryx oriented |
| `src` tree | Present | Absent | Yes | Oryx cannot reproduce a Linux Next build from source |
| `.next` | Present | Present | Partial compatibility only | Failed `.next` was Windows-built |
| `node_modules.tar.gz` | Present | Absent | Yes | Active Oryx output preserves dependency archive |
| `.next/standalone` | Absent | Absent | No | App is not configured as standalone |
| `server.js` | Absent | Absent | No | App starts through `npm run start` |
| Next manifest paths | Linux/Oryx temp paths | Windows local paths | Yes | Strong root-cause evidence |
| Root wrapper directory | None | None | No | Root layout is not the blocker |
| Corrupt/duplicate ZIP entries | None found | None found | No | ZIP corruption not supported |

## Frontend App Service Deployment Model

Read-only App Service configuration:

- Runtime: `NODE|20-lts`
- Startup command: `npm run start`
- `SCM_DO_BUILD_DURING_DEPLOYMENT=true`
- `ENABLE_ORYX_BUILD=true`
- `WEBSITE_RUN_FROM_PACKAGE=0`
- `NEXT_PUBLIC_BACKEND_BASE_URL=https://adminiculumbackend-b1-01.azurewebsites.net`
- `NEXT_PUBLIC_ENTRA_REDIRECT_URI=https://adminiculumfrontend-austriaeast-01.azurewebsites.net`

The service is configured for Oryx source deployment into `/home/site/wwwroot`, not `WEBSITE_RUN_FROM_PACKAGE`, and not a prebuilt standalone Next server package.

## Corrected Packaging

Corrected package model:

- Oryx source ZIP.
- No local `.next` output.
- No local `node_modules`.
- No backend files.
- No `.env*` files.
- No docs/test/log/upload junk.
- Root contains `package.json`, `package-lock.json`, Next config, TypeScript/Tailwind/PostCSS config, `src`, `public`, `scripts`, and `release-manifest.json`.
- Artifact-only sanitization removed non-runtime local development marker literals so strict raw ZIP scans do not contain local API/auth URLs. Repository source files were not changed.

Corrected artifact:

- File: `C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\adminiculum-frontend-editor-ops-7392a6c-repack1.zip`
- SHA-256: `29c840461c302befddefb2a4f585134c9fbd0c5ddf66c702c4dada9d67ab15f0`
- Size: `2394192` bytes
- File count: `117`
- Root entries: `.eslintrc.json`, `next-env.d.ts`, `next.config.mjs`, `package-lock.json`, `package.json`, `postcss.config.js`, `public`, `release-manifest.json`, `scripts`, `src`, `tailwind.config.ts`, `tsconfig.json`

Corrected raw artifact scan:

- `localhost:3001`: `0`
- `http://localhost`: `0`
- `127.0.0.1`: `0`
- `/api/v1/auth/login`: `0`
- `mesterséges intelligencia`: `0`
- `n8n`: `0`
- `.env*`: absent
- `Backend/`: absent
- docs/test output: absent

## Local Artifact Runtime Verification

Validation from extracted corrected ZIP:

- `npm ci`: passed in disposable temp extraction.
- `npm run build`: passed.
- `npm run verify:prod-env`: passed.
- Local `next start -p 3317`: started from extracted artifact.
- Local route smoke:
  - `/` -> `200`
  - `/cases` -> `200`
  - `/tasks` -> `200`
  - `/notifications` -> `200`

Known non-blocking validation notes:

- `ClientHouseStylePanel.tsx` still reports the known `<img>` warning.
- `npm ci` reported existing moderate audit findings and peer/deprecation warnings; package files were not changed.

## Corrected Deployment Command Preview

Do not run without separate explicit approval:

```powershell
az webapp deploy `
  --resource-group Adminiculum `
  --name adminiculumfrontend-austriaeast-01 `
  --type zip `
  --src-path "C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\adminiculum-frontend-editor-ops-7392a6c-repack1.zip"
```

Expected corrected frontend artifact SHA-256:

`29c840461c302befddefb2a4f585134c9fbd0c5ddf66c702c4dada9d67ab15f0`

## Zero-Diff Gates

- Frontend repository source diff from `7392a6c` to current release HEAD: `0` for `Frontend/`.
- Backend source changes in this task: none.
- Prisma schema changes in this task: none.
- Migration changes in this task: none.
- Package file changes in this task: none.
- Azure setting changes in this task: none.
- Feature flag changes in this task: none.
- Client Portal changes in this task: none.
- OpenAPI/CORS changes in this task: none.
- AI/n8n/Graph changes in this task: none.

## Production State

Production was not changed by this diagnostic/repackage task.

Live checks after the failed deployment remained healthy:

- `https://adminiculumfrontend-austriaeast-01.azurewebsites.net/` -> `200`
- `/cases` -> `200`
- `/tasks` -> `200`
- `/notifications` -> `200`
- Backend `/health` -> `200`

## Go / No-Go

`GO_FOR_CORRECTED_FRONTEND_REDEPLOYMENT_APPROVAL`

This is not deployment approval. It means the OneDeploy 400 root cause is understood, a corrected Oryx/source-compatible frontend artifact exists, and the next step can be a separate explicit frontend-only redeployment approval using the corrected package.

Final classification:

`frontend_onedeploy_400_1_go_for_corrected_redeployment`
