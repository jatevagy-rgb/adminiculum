# Active Artifact Git Baseline Forensics 1

Date: 2026-07-15
Source branch: `hotfix/runtime-shape-20260308`
Starting HEAD: `1896840`
Deployment action: none

## Executive Summary

This forensic pass downloaded read-only `wwwroot` ZIP snapshots for the active frontend and backend App Service deployments into a local temp directory outside the repository:

`C:\Users\hubay\AppData\Local\Temp\adminiculum-artifact-forensics`

No production files were modified. No Azure configuration was changed. No app was restarted. No database was queried.

Result:

| Component | Active artifact | Strongest repository mapping | Classification |
|---|---|---|---|
| Frontend | `d21de1cb-46a1-4994-8bcd-45749c42d14e` | Unique deployment-window source tuple match: `dc0780e` | `UNIQUE_COMMIT_MATCH_HIGH_CONFIDENCE` |
| Backend | `f3129580-9574-429a-a1b3-f078b1319cd7` | Runtime-equivalent range including `2cf1594` and `8ce26c0`; exact source commit not unique | `COMMIT_RANGE_NARROWED` |

Overall release-baseline classification: `COMMIT_RANGE_NARROWED`.

## Artifact Acquisition Method

Read-only Kudu and Azure CLI methods were used:

```powershell
az webapp log deployment list --resource-group Adminiculum --name adminiculumfrontend-austriaeast-01
az webapp log deployment list --resource-group Adminiculum --name adminiculumbackend-b1-01
Invoke-WebRequest https://<site>.scm.azurewebsites.net/api/zip/site/wwwroot/
Invoke-RestMethod https://<site>.scm.azurewebsites.net/api/deployments/<deployment-id>
Invoke-RestMethod https://<site>.scm.azurewebsites.net/api/deployments/<deployment-id>/log
```

Kudu authentication used an Azure bearer token. Token values were not printed, written to docs, or committed.

## Active Artifacts

| Component | Active deployment ID | ZIP SHA-256 | ZIP size | File count | Source maps | Deployment status |
|---|---|---:|---:|---:|---:|---|
| Frontend | `d21de1cb-46a1-4994-8bcd-45749c42d14e` | `53081a3cc46dc28e97b12c6f82b403fc2bcfdc304a9b737672c4a560c226e8dc` | 330,015,029 bytes | 4,178 | 0 | Active, complete |
| Backend | `f3129580-9574-429a-a1b3-f078b1319cd7` | `8ece0510ed5546abafc6ec5e001b066bbc98d2f2cd05fa4e3f9b0696d8709949` | 101,260,225 bytes | 505 | 150 | Active, complete |

## Frontend Forensic Result

The frontend deployment timestamp was `2026-06-30T20:41:28Z` received and `2026-06-30T20:52:39Z` completed.

Within the deployment-date commit window, normalized source hashes for these deployed files uniquely matched `dc0780e`:

- `Frontend/src/app/notifications/page.tsx`
- `Frontend/src/components/Dashboard.tsx`
- `Frontend/src/components/CaseDetail.tsx`
- `Frontend/src/app/time-entries/page.tsx`
- `Frontend/src/app/deadlines/page.tsx`
- `Frontend/src/app/clause-library/page.tsx`
- `Frontend/src/app/litigation-workspace/page.tsx`

The package fingerprint also matches the pre-editor-dependency state:

- `next: 15.2.4`
- no `jszip`
- no `@tiptap/extension-table`
- no `/documents/[documentId]/edit` route
- no client-portal frontend source route files

This is not exact proof because no embedded git SHA exists, but it is a unique high-confidence match in the relevant deployment window.

## Backend Forensic Result

The backend deployment timestamp was `2026-07-01T13:12:53Z` received and `2026-07-01T13:16:01Z` completed.

Backend artifact markers prove:

- Outlook Graph adapter skeleton is present.
- Outlook import service extraction is present.
- Outlook provider schema posture is present in packaged `prisma/schema.prisma`.
- July workflow route mounts are absent:
  - no `/api/v1/agenda` mount;
  - no `/api/v1/workload` mount;
  - no `/api/v1/intake` mount.
- Later OpenAPI/CORS hardening markers are absent:
  - no `corsPolicy` import;
  - no `sanitizePublicOpenApiSpec` import.
- Later document editor/comment service files are absent.
- CP-SCHEMA-1 models are absent from packaged Prisma schema.

Within the July 1 to July 2 window, stable backend source hashes narrowed to a runtime-equivalent range. The key lower-bound marker is `2cf1594 feat(backend): add outlook graph adapter skeleton`; later docs-only commits can produce the same backend artifact. `8ce26c0 docs: close out communication outlook intake phase` is timestamp-plausible and backend-runtime-equivalent.

Therefore the backend classification is `COMMIT_RANGE_NARROWED`, not exact and not unique.

## Release Branch Decision

No release branch was created.

Reason: exact commits were not proven for both components and backend did not reach unique high-confidence single-commit status. Per the task, narrow release work must remain blocked until human approval accepts the reconstructed frontend commit and backend range, or until a new known-good deployment baseline with embedded SHA is created.

## Final Component Classifications

| Component | Classification | Rationale |
|---|---|---|
| Frontend | `UNIQUE_COMMIT_MATCH_HIGH_CONFIDENCE` | Unique tuple match to `dc0780e` in deployment-date window, plus package/route marker agreement. |
| Backend | `COMMIT_RANGE_NARROWED` | Runtime markers require `>=2cf1594`; timestamp allows docs-only `8ce26c0`; no embedded SHA and no unique artifact commit. |

## Safety Confirmation

- No deployment.
- No restart.
- No Azure configuration change.
- No production DB query.
- No production file write.
- No release branch or worktree creation.
- No secret values printed or committed.
