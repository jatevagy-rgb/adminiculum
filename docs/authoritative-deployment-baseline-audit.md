# Authoritative Deployment Baseline Audit

Date: 2026-07-15
Source branch audited: `hotfix/runtime-shape-20260308`
Source HEAD at start of audit: `cab8a5c`
Deployment action: none

## Executive Summary

This audit used Azure App Service deployment records, Kudu deployment metadata, safe deployed-source markers, and repository history to determine whether the active production frontend and backend can be mapped to exact git commits.

The active production deployments were proven as App Service artifacts, but neither active deployment exposes an exact repository commit SHA. Kudu deployment records show OneDeploy deployment IDs, not git commits. Safe deployed file markers could narrow the candidate set but did not uniquely identify a commit.

Result: **release branch creation is blocked**. The task rule says a narrow release branch may be created only from `PROVEN_EXACT` or an explicitly reconstructed artifact commit with documented proof. That threshold was not met.

## Azure Resources

| Component | Azure resource | Resource group | Host | Slot | Runtime |
|---|---|---|---|---|---|
| Frontend | `adminiculumfrontend-austriaeast-01` | `Adminiculum` | `adminiculumfrontend-austriaeast-01.azurewebsites.net` | production | `NODE|20-lts` |
| Backend | `adminiculumbackend-b1-01` | `Adminiculum` | `adminiculumbackend-b1-01.azurewebsites.net` | production | `NODE|20-lts` |

## Active Deployment Baseline Table

| Component | Azure resource | Active deployment ID | Active timestamp | Deployment source | Exact git commit | Confidence | Evidence |
|---|---|---|---|---|---|---|---|
| Frontend | `adminiculumfrontend-austriaeast-01` | `d21de1cb-46a1-4994-8bcd-45749c42d14e` | Received `2026-06-30T20:41:28Z`, completed `2026-06-30T20:52:39Z` | OneDeploy ZIP/Oryx from `/tmp/zipdeploy/extracted` | Unknown | `PROVEN_ARTIFACT_NO_COMMIT` | Azure deployment log marks it active and complete; Kudu deployment metadata confirms active OneDeploy artifact; no git SHA marker was found. |
| Backend | `adminiculumbackend-b1-01` | `f3129580-9574-429a-a1b3-f078b1319cd7` | Received `2026-07-01T13:12:53Z`, completed `2026-07-01T13:16:01Z` | OneDeploy ZIP/Oryx from `/tmp/zipdeploy/extracted` | Unknown | `PROVEN_ARTIFACT_NO_COMMIT` | Azure deployment log marks it active and complete; Kudu deployment metadata confirms active OneDeploy artifact; no git SHA marker was found. |

## Evidence Commands

Commands were read-only:

```powershell
az webapp list --query "[].{name:name, resourceGroup:resourceGroup, state:state, defaultHostName:defaultHostName, kind:kind}" -o table
az webapp log deployment list --resource-group Adminiculum --name adminiculumfrontend-austriaeast-01 -o json
az webapp log deployment list --resource-group Adminiculum --name adminiculumbackend-b1-01 -o json
az webapp log deployment show --resource-group Adminiculum --name adminiculumfrontend-austriaeast-01 --deployment-id d21de1cb-46a1-4994-8bcd-45749c42d14e -o json
az webapp log deployment show --resource-group Adminiculum --name adminiculumbackend-b1-01 --deployment-id f3129580-9574-429a-a1b3-f078b1319cd7 -o json
az webapp deployment source show --resource-group Adminiculum --name adminiculumfrontend-austriaeast-01 -o json
az webapp deployment source show --resource-group Adminiculum --name adminiculumbackend-b1-01 -o json
```

Kudu was accessed read-only with an Azure bearer token. Token values were not printed or stored.

## Frontend Deployment Record Findings

- Active deployment ID: `d21de1cb-46a1-4994-8bcd-45749c42d14e`.
- Active: `true`.
- Complete: `true`.
- Status: `4`.
- Deployer: `OneDeploy`.
- Message: `OneDeploy`.
- Kudu log: `Preparing deployment for commit id 'd21de1cb-4'`.
- The “commit id” in Kudu is the OneDeploy deployment ID prefix, not a git commit SHA.
- Source control configuration has no repo URL or branch:
  - `repoUrl: null`
  - `branch: null`
  - `isGitHubAction: false`
  - `isManualIntegration: false`

## Backend Deployment Record Findings

- Active deployment ID: `f3129580-9574-429a-a1b3-f078b1319cd7`.
- Active: `true`.
- Complete: `true`.
- Status: `4`.
- Deployer: `OneDeploy`.
- Message: `OneDeploy`.
- Kudu log: `Preparing deployment for commit id 'f3129580-9'`.
- The “commit id” in Kudu is the OneDeploy deployment ID prefix, not a git commit SHA.
- Source control configuration has no repo URL or branch:
  - `repoUrl: null`
  - `branch: null`
  - `isGitHubAction: false`
  - `isManualIntegration: false`

## Deployed Artifact Content Proof

### Frontend

Safe deployed markers inspected:

| Marker | Result |
|---|---|
| `.git/HEAD` | Not found |
| `.git/config` | Not found |
| `REVISION` | Not found |
| `COMMIT_SHA` | Not found |
| `build-info.json` | Not found |
| `version.json` | Not found |
| `package.json` | Present |
| `src/components/AppProviders.tsx` | Present |
| `src/lib/api.ts` | Present |
| `.next/routes-manifest.json` | Present |

Notable deployed frontend markers:

- `Frontend/package.json` equivalent shows `next: 15.2.4`.
- It does **not** include `jszip`.
- It does **not** include `@tiptap/extension-table`.
- It does include `verify:prod-env`.
- `.next/routes-manifest.json` includes portal route entries, proving the active artifact is not simply the old Case Review polish baseline.

Normalized safe-source hash matching was attempted for:

- `Frontend/package.json`
- `Frontend/src/lib/api.ts`
- `Frontend/src/components/AppProviders.tsx`

Result: the tuple matched many commits on the source branch and did not uniquely identify the active artifact. It cannot be treated as an exact reconstructed git commit.

### Backend

Safe deployed markers inspected:

| Marker | Result |
|---|---|
| `.git/HEAD` | Not found |
| `.git/config` | Not found |
| `REVISION` | Not found |
| `COMMIT_SHA` | Not found |
| `build-info.json` | Not found |
| `version.json` | Not found |
| `package.json` | Present |
| `src/index.ts` | Present |
| `dist/index.js` | Present |
| `src/modules/communications/routes.ts` | Present |

Notable deployed backend markers:

- `Backend/package.json` equivalent contains the current backend dependency family.
- `src/index.ts` does **not** show the newer `agenda` and `workload` route mounts from the current workflow branch.
- `src/index.ts` does **not** show the newer `corsPolicy` import from later CORS hardening.
- OpenAPI serving exists, but without the newer `sanitizePublicOpenApiSpec` path from the current branch.

Normalized safe-source hash matching was attempted for:

- `Backend/package.json`
- `Backend/src/index.ts`
- `Backend/src/modules/communications/routes.ts`

Result: the tuple matched many commits on the source branch and did not uniquely identify the active artifact. It cannot be treated as an exact reconstructed git commit.

## Classification Legend Applied

| Classification | Meaning | Applied? |
|---|---|---|
| `PROVEN_EXACT` | Active deployment maps to exact git SHA. | No |
| `PROVEN_ARTIFACT_NO_COMMIT` | Active artifact/deployment ID is proven, but exact git SHA is absent. | Yes, both components |
| `INFERRED_HIGH_CONFIDENCE` | Strong but non-authoritative commit inference. | No |
| `INFERRED_MEDIUM_CONFIDENCE` | Repo docs/history suggest a likely commit. | Prior readiness only; not enough here |
| `UNKNOWN` | Neither artifact nor commit can be proven. | No; artifacts are proven |

## Release Branch Gate Result

Release branch creation is **blocked**.

Reason:

- Frontend active artifact is proven, but exact git commit is not.
- Backend active artifact is proven, but exact git commit is not.
- Kudu deployment logs expose OneDeploy deployment IDs, not git SHAs.
- Safe artifact markers do not uniquely reconstruct a commit.

Per task rule: **do not create a release branch until the active deployed baseline is proven**.

## Forensic Reconstruction Update — 2026-07-15

`ACTIVE-ARTIFACT-GIT-BASELINE-FORENSICS-1` performed a deeper read-only artifact fingerprint pass after this initial audit. It downloaded active `wwwroot` snapshots from Kudu into a local temp directory outside the repo, hashed the ZIPs, inspected safe package/manifest/source markers, and compared normalized deployed source tuples against repository history.

Updated findings:

| Component | Active deployment ID | Updated repository mapping | Updated confidence |
|---|---|---|---|
| Frontend | `d21de1cb-46a1-4994-8bcd-45749c42d14e` | Unique deployment-window source tuple match: `dc0780e` | `UNIQUE_COMMIT_MATCH_HIGH_CONFIDENCE`, not exact |
| Backend | `f3129580-9574-429a-a1b3-f078b1319cd7` | Runtime-equivalent candidate range including `2cf1594` and `8ce26c0` | `COMMIT_RANGE_NARROWED`, not unique |

The frontend is now a high-confidence unique reconstructed match for practical comparison, but no embedded git SHA was present in the artifact. The backend remains a narrowed range because runtime-equivalent docs-only commits can produce indistinguishable backend artifacts.

Overall release-baseline posture after the forensic update: `active_artifact_git_baseline_commit_ranges_narrowed`.

Release branch creation remains **blocked** unless a human explicitly accepts the reconstructed frontend commit and backend candidate range as sufficient for a narrow release baseline, or a stronger deploy provenance artifact is found.

## Required Next Evidence To Unblock

One of the following is needed:

1. A deployment artifact manifest containing exact git SHA for both App Services.
2. A deployment runbook/log outside the repo that maps active OneDeploy IDs to source commits.
3. A reproducible artifact-hash manifest created at deploy time.
4. A human/operator attestation with the original deploy ZIP source commit and matching artifact hashes.

Until then, deployment readiness remains NO-GO.

## Safety Confirmation

- No deployment was performed.
- No App Service restart was performed.
- No production app setting was changed.
- No deployment slot or traffic setting was changed.
- No database was queried.
- No migration was run.
- No secrets were printed.
- No environment files were created or committed.
- No release worktree or branch was created.
