# Final Narrow Release Artifact Manifest

Date: 2026-07-16
Artifact output root: `C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts`
Artifact source commit: `7392a6c`
Release branch: `release/editor-ops-workflow-1`

## Artifacts

| Component | File | Size bytes | File count | SHA-256 |
| --- | --- | ---: | ---: | --- |
| Frontend | `C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\adminiculum-frontend-editor-ops-7392a6c.zip` | 4310822 | 330 | `6939271e34658852dcaab3b46df2d39256350744fb46baadf1f383eaa7d7a5a4` |
| Backend | `C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\adminiculum-backend-editor-ops-7392a6c.zip` | 979182 | 159 | `fb0626cf16a9457f0235dfc19e9eb4b51d30f2f1459c075430ebb95b4c3112c6` |

## Included Provenance Manifest

Each ZIP includes `release-manifest.json` with release identifier, component name, branch, artifact source commit, UTC build timestamp, package-lock SHA-256, schema SHA-256, and artifact hash marked as externally computed after packaging.

## Frontend Build Public Variables Used

These are public build-time values, not secrets:

- `NEXT_PUBLIC_BACKEND_BASE_URL=https://adminiculumbackend-b1-01.azurewebsites.net`
- `NEXT_PUBLIC_ENTRA_CLIENT_ID=aeb0281a-fae5-41e1-9d2b-e3738f4e3796`
- `NEXT_PUBLIC_ENTRA_TENANT_ID=18b56834-dfea-4931-bdf8-e5ebb0cb4e0f`
- `NEXT_PUBLIC_ENTRA_REDIRECT_URI=https://adminiculumfrontend-austriaeast-01.azurewebsites.net`
- `NEXT_PUBLIC_ENTRA_POST_LOGOUT_REDIRECT_URI=https://adminiculumfrontend-austriaeast-01.azurewebsites.net`
- `NEXT_PUBLIC_ADMINICULUM_API_SCOPE=api://a1e8b8a0-7690-4d09-9974-e4742d3de4e9/access_as_user`
- `NEXT_PUBLIC_ENABLE_LOCAL_DEV_AUTH=false`

## Artifact Content Scan

| Component | Pattern | Count |
| --- | --- | ---: |
| frontend | `http://localhost` | 0 |
| frontend | `https://localhost` | 0 |
| frontend | `127.0.0.1` | 0 |
| frontend | `localhost:3001` | 0 |
| frontend | `/api/v1/auth/login` | 0 |
| frontend | `Password123!` | 0 |
| frontend | `hubay.mate@balintfy.onmicrosoft.hu` | 0 |
| frontend | `graph.microsoft.com` | 0 |
| frontend | `sharepoint.com` | 0 |
| frontend | `api.openai.com` | 0 |
| frontend | `api.anthropic.com` | 0 |
| frontend | `generativelanguage.googleapis.com` | 0 |
| frontend | `N8N_` | 0 |
| frontend | `n8n.io` | 0 |
| frontend | `/n8n` | 0 |
| backend | `Frontend/` | 0 |
| backend | `frontend_deploy` | 0 |
| backend | `azure-cost-audit` | 0 |
| backend | `api.openai.com` | 0 |
| backend | `api.anthropic.com` | 0 |
| backend | `generativelanguage.googleapis.com` | 0 |
| backend | `N8N_` | 0 |
| backend | `n8n.io` | 0 |
| backend | `/n8n` | 0 |
| backend | `Password123!` | 0 |
| backend | `hubay.mate@balintfy.onmicrosoft.hu` | 0 |
| both | `env-file-name` | 0 |

All blocking scan counts are `0`.

## Inventories Outside Repo

- `C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\analysis\frontend-zip-inventory.csv`
- `C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\analysis\backend-zip-inventory.csv`
- `C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\analysis\artifact-forbidden-scan.csv`

## Artifact Scope

Frontend ZIP contains runtime/build-focused Next output, public assets, package/config files, and release manifest. It excludes source tree, `.env*`, `.next/cache`, and local dev files.

Backend ZIP contains backend source expected by the Oryx source-deploy path, package files, Prisma schema/migrations unchanged from baseline, templates, and release manifest. It excludes frontend, tests, docs, `.env*`, `.git`, local artifacts, coverage, and audit dumps.

## Intake Fix Backend Replacement Artifact

| Component | File | Size bytes | File count | SHA-256 |
| --- | --- | ---: | ---: | --- |
| Backend intake fix | `C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\adminiculum-backend-editor-ops-intake-fix-e4e0c00.zip` | 1495221 | 551 | `76eacc73a19fa35d0bd092590d45b14d891288ccd37776a58bf44d7a84bea359` |

## Frontend OneDeploy Repackaged Artifact

`FRONTEND-ONEDEPLOY-400-ROOT-CAUSE-AND-REPACKAGE-1` diagnosed the rejected frontend artifact as `ZIP_CONTENT_MODEL_INCOMPATIBLE`: the original frontend ZIP was a local Windows-built partial `.next` package, while the frontend App Service is configured for Oryx/source deployment.

| Component | File | Size bytes | File count | SHA-256 |
| --- | --- | ---: | ---: | --- |
| Frontend repack1 | `C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\adminiculum-frontend-editor-ops-7392a6c-repack1.zip` | 2394192 | 117 | `29c840461c302befddefb2a4f585134c9fbd0c5ddf66c702c4dada9d67ab15f0` |

Repack1 is an Oryx source ZIP: it contains source/config/public/scripts and `release-manifest.json`; it excludes local `.next`, `node_modules`, `.env*`, backend files, docs, test output, logs, uploads, and local artifact junk. The repository source was not changed.

Raw corrected artifact scan:

- `localhost:3001`: `0`
- `http://localhost`: `0`
- `127.0.0.1`: `0`
- `/api/v1/auth/login`: `0`
- `mesterséges intelligencia`: `0`
- `n8n`: `0`

Local extraction/build/start verification passed from the corrected ZIP: `npm ci`, `npm run build`, `npm run verify:prod-env`, `next start -p 3317`, and local route smoke for `/`, `/cases`, `/tasks`, and `/notifications`.

Deployment result:

- Frontend deployment ID: `9650525c-d465-468d-8171-f830128b9e7b`.
- Final Azure status: active success.
- Initial CLI result: `504 GatewayTimeout`, later completed in Kudu/OneDeploy.
- Oryx build summary: `Errors (0)`, `Warnings (0)`.
- This artifact is now the active production frontend baseline.

Replacement artifact details:

- Source commit: `e4e0c00`.
- Component: backend only.
- Includes backend `src`, `dist`, `prisma`, `templates`, package files, Docker/Oryx config, and `release-manifest.json`.
- Excludes `Frontend/`, docs, tests, `node_modules`, env files, seed/helper scripts, coverage, Azure audit data, and previous ZIPs.
- `Backend/scripts` excluded intentionally because local helper scripts contain sample credential literals and are not required for the Oryx source artifact.
- Artifact scan found no sample password, local user email literal, AI/n8n endpoints, Client Portal expansion, or env files.
- This artifact supersedes the failed backend artifact `adminiculum-backend-editor-ops-7392a6c.zip` for the intake compatibility redeployment path.


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
