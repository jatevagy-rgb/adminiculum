# Build And Deployment Provenance Hardening

Status: `PROPOSED`
Date: 2026-07-15

## Problem

Current OneDeploy/Kudu records prove active deployment IDs and artifacts, but they do not prove exact git commits. Kudu logs use deployment IDs as “commit id” strings, not repository SHAs. This prevents safe creation of narrow release branches from an authoritative deployed baseline.

## Goal

Future frontend and backend artifacts should carry non-secret provenance metadata that maps an active deployment to an exact source state.

## Proposed Build Metadata

Each deployable artifact should include:

- git commit SHA;
- branch name;
- build timestamp UTC;
- component (`frontend` or `backend`);
- package-lock SHA-256;
- Prisma schema SHA-256 for backend;
- deploy operator or CI workflow identifier;
- safe release identifier;
- artifact ZIP SHA-256 after packaging, where available.

## Possible Surfaces

| Surface | Component | Notes |
|---|---|---|
| `build-info.json` in artifact root | Frontend/backend | Static non-secret file; easy Kudu/VFS read. |
| Backend `/health` metadata | Backend | Expose only SHA/branch/build timestamp; no secrets. |
| Frontend public build info route/file | Frontend | Could be static JSON generated during build. |
| Kudu deployment message | Both | Include SHA in OneDeploy message if deployment command supports it. |
| Artifact filename | Both | Include short SHA and component name. |
| Deployment closeout docs | Both | Human-readable backup, not primary proof. |

## Suggested Metadata Shape

```json
{
  "component": "frontend",
  "gitSha": "<full-sha>",
  "gitBranch": "hotfix/runtime-shape-20260308",
  "builtAtUtc": "2026-07-15T00:00:00Z",
  "packageLockSha256": "<hash>",
  "schemaSha256": null,
  "releaseId": "editor-ops-workflow-1"
}
```

Backend can set `schemaSha256`; frontend should keep it null or omit it.

## Safety Rules

- Do not include secrets.
- Do not include environment variable values beyond non-secret names if needed.
- Do not include access tokens, connection strings, tenant secrets, or client secrets.
- Do not expose DB state or user/client data.
- Do not make provenance metadata an authorization bypass.

## Implementation Recommendation

Implement in a separate, non-emergency hardening ticket:

1. Add a build-time script that writes `build-info.json` from git metadata and lockfile/schema hashes.
2. Include the file in both frontend and backend deployment artifacts.
3. Optionally surface backend build metadata through `/health` under a `build` object.
4. Update deploy scripts/runbooks to fail if build metadata is missing.
5. Update release-readiness docs to require metadata proof before future narrow release reconstruction.

No runtime implementation is included in this task.
