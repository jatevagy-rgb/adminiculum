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

Replacement artifact details:

- Source commit: `e4e0c00`.
- Component: backend only.
- Includes backend `src`, `dist`, `prisma`, `templates`, package files, Docker/Oryx config, and `release-manifest.json`.
- Excludes `Frontend/`, docs, tests, `node_modules`, env files, seed/helper scripts, coverage, Azure audit data, and previous ZIPs.
- `Backend/scripts` excluded intentionally because local helper scripts contain sample credential literals and are not required for the Oryx source artifact.
- Artifact scan found no sample password, local user email literal, AI/n8n endpoints, Client Portal expansion, or env files.
- This artifact supersedes the failed backend artifact `adminiculum-backend-editor-ops-7392a6c.zip` for the intake compatibility redeployment path.
