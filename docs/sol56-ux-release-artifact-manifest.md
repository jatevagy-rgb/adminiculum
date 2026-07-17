# SOL56 UX Release Artifact Manifest

## Provenance

| Item | Value |
| --- | --- |
| Official release artifact checkpoint | `1033a4dcf1ceeeb70bb6ff22d2963a172d776986` |
| Runtime source commit | `1033a4dcf1ceeeb70bb6ff22d2963a172d776986` |
| Branch | `release/editor-ops-workflow-1` |
| Release ID | `sol56-ux-completion-1` |
| Build timestamp | `2026-07-17T10:05:17.9899617Z` |
| Packaging model | Oryx/source ZIP |

The final documentation commit is a docs-only descendant. The deployed `Frontend` and `Backend` runtime trees remain the exact artifact-checkpoint trees.

## Artifacts

| Component | Path | Files | Bytes | SHA-256 |
| --- | --- | ---: | ---: | --- |
| Backend | `C:\Users\hubay\AppData\Local\Temp\adminiculum-sol56-ux-release\adminiculum-backend-sol56-ux-1033a4d.zip` | 142 | 952,654 | `87ab53eee0004190788068bc00b289cb24208f39859121f08ca89135d690d794` |
| Frontend | `C:\Users\hubay\AppData\Local\Temp\adminiculum-sol56-ux-release\adminiculum-frontend-sol56-ux-1033a4d.zip` | 117 | 2,403,293 | `68ec4754616a1b61dfa8aefdb28790605afc7333f2a2d5d3f7cfdb45ee746ae5` |

## Embedded Manifest Hashes

- Frontend package lock: `da0040801cfaef5f766043ab5c83e4294b6ca1755f8070e02b6dc391d4ed74f5`.
- Backend package lock: `f72c420bd17e17c8a2f4626ceb374d822d7f033beecb837c237633a5e67a412b`.
- Backend Prisma schema: `29189294af55acd192381d9d1e63ee33ceda66a93e4f87030f331238d5a0a072`.

## Content Model

Frontend includes package/config files, `src`, `public`, the production env guard, and `release-manifest.json`. It excludes local `.next`, `node_modules`, env files, Docker files, tests, docs, screenshots, audit output, ZIPs, and backend content.

Backend includes package/config files, `src`, Prisma schema and unchanged migration history, tracked templates, runtime OpenAPI content, and `release-manifest.json`. It excludes `node_modules`, env files, tests, Jest config, helper scripts, seed files, docs, coverage/audit output, ZIPs, and frontend content.

Artifact-only local-development marker sanitization is semantically equivalent and did not change repository source. Text-source scans returned zero hits for:

- `localhost` and `127.0.0.1`;
- `/api/v1/auth/login`;
- local Windows paths and local database URLs;
- env files, private-key/sample-secret markers;
- AI-provider endpoints and n8n markers;
- opposite component, docs, tests, `.next`, or `node_modules`.

Protected runtime delta from the accepted release base is zero for Prisma schema/migrations, package files, auth, Client Portal, OpenAPI, CORS, Azure configuration, and GitHub deployment workflows.

## Clean Extraction Validation

- Frontend `npm ci`: passed.
- Frontend production build: passed.
- Frontend production env guard: passed.
- Backend `npm ci`: passed.
- Backend build: passed.
- Extracted backend `/health`: `200`.
- Extracted backend unauthenticated tasks: `401`.
- Extracted frontend `/`, `/tasks`, `/notifications`, and `/reviews`: `200`.
- Temporary smoke ports were confirmed closed after validation.

Machine-readable evidence remains outside the repository under:

`C:\Users\hubay\AppData\Local\Temp\adminiculum-sol56-ux-release`
