# Narrow Release Go / No-Go

Date: 2026-07-15
Branch: `release/editor-ops-workflow-1`
Deployment action: none

## Gate status

| Gate | Status | Evidence |
| --- | --- | --- |
| Backend baseline | PASS | `8ce26c0` accepted as `EXACT_COMMIT_PROVEN_BY_OPERATOR_DEPLOY_RECORD_AND_ARTIFACT`. |
| Frontend baseline | PASS | Human accepted reconstructed `dc0780e` as `UNIQUE_COMMIT_MATCH_HIGH_CONFIDENCE`. |
| Release diff | PASS | Narrow approved-change reconstruction committed as `e321feb`; smoke closeout fixes are narrow runtime-compatibility patches on the same release branch. |
| Schema/migrations | PASS | No diff under `Backend/prisma/schema.prisma` or `Backend/prisma/migrations`. |
| Client Portal/OpenAPI/CORS | PASS | No changed Client Portal, OpenAPI, Swagger, CORS, Azure, deploy, auth, or feature-flag files. |
| Artifacts | PASS | Clean production env frontend build, `npm run verify:prod-env`, and strict artifact URL/API scan passed. |
| Dependencies | REVIEW REQUIRED | Backend audit reports pre-existing 2 low / 9 moderate / 7 high / 1 critical; frontend audit reports 4 moderate. Package files unchanged in this release fix. |
| Runtime compatibility | PASS | Authenticated local smoke found and fixed enum/projection drift in agenda/task/case summary read paths. |
| Authenticated local smoke | PASS | See `docs/narrow-release-authenticated-predeploy-smoke-1.md`; local dev auth reused successfully and smoke matrix passed. |
| Document delete safety | PASS | `DOCUMENT-DELETE-SAFETY-AND-UX-1` passed focused tests, full validation, and authenticated local browser delete smoke with synthetic data. |

## Current posture

Current deployment recommendation: `GO_FOR_EXPLICIT_PRODUCTION_DEPLOYMENT_APPROVAL`.

This is not deployment approval. It means the release branch has passed local authenticated smoke and validation and is ready for a separate explicit production deployment approval prompt.

## Remaining approval items

- Human deployment approval is still required.
- Dependency audit findings require explicit acknowledgement because backend audit still contains high/critical findings that were not introduced by this release.
- No Azure/app settings/database/migration/feature-flag operations are authorized by this document.

## Safety confirmation

- Runtime changes: yes, narrow backend read-path compatibility fixes and authorized document deletion workflow only.
- Schema changes: no.
- Migration changes: no.
- DB changes: no.
- DB connection used: local read-only proof and local app runtime only; production not targeted.
- Azure touched: no.
- Client Portal enabled/exposed: no.
- Deployment performed: no.

## Document deletion blocker follow-up

`DOCUMENT-DELETE-SAFETY-AND-UX-1` adds a narrow authorized document deletion workflow for mistakenly uploaded documents.

- Backend: `DELETE /api/v1/documents/:id` uses existing document manage authorization, dependency preflight, SharePoint storage cleanup where `spItemId` exists, DB transaction cleanup, and content-minimal timeline audit.
- Frontend: case document surfaces show a destructive delete action with explicit confirmation, loading state, safe error handling, and list refresh.
- Safety: no schema/migration/Azure/config/package/OpenAPI/CORS/Client Portal/feature-flag changes.
- Authenticated local browser deletion smoke passed with synthetic local data: delete `204`, former document/detail/editor/comment access `404`, row removed after refresh, and no forbidden content/storage leaks.
- Deployment posture remains `GO_FOR_EXPLICIT_PRODUCTION_DEPLOYMENT_APPROVAL`, subject to separate human deployment approval and acknowledgement of pre-existing dependency audit findings.
