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

## Final artifact closeout update

`FINAL-NARROW-RELEASE-DIFF-AND-ARTIFACT-1` completed after the document delete blocker.

- Artifact source commit: `7392a6c`.
- Frontend artifact: `C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\adminiculum-frontend-editor-ops-7392a6c.zip`.
- Backend artifact: `C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\adminiculum-backend-editor-ops-7392a6c.zip`.
- Frontend SHA-256: `6939271e34658852dcaab3b46df2d39256350744fb46baadf1f383eaa7d7a5a4`.
- Backend SHA-256: `fb0626cf16a9457f0235dfc19e9eb4b51d30f2f1459c075430ebb95b4c3112c6`.
- Corrective artifact-scan fix: baked local development email/password defaults removed from frontend/backend auth code.
- Zero-diff gates remain green for schema, migrations, Client Portal expansion, OpenAPI/Swagger, CORS, Azure/deploy config, AI/n8n, Outlook/Graph enablement, contract generation enablement, and editor persistence.
- Final posture: `GO_FOR_EXPLICIT_PRODUCTION_DEPLOYMENT` pending separate human deployment approval.

## Production deployment attempt and rollback

`PRODUCTION-DEPLOY-NARROW-EDITOR-OPS-1` was approved and started on 2026-07-16. Backend deployment completed, but backend smoke found a release-blocking regression before any frontend deployment.

- Backend release deployment ID: `24f6a5a5-4004-4b7d-98ba-f91d5737fc52`.
- Failed smoke: authenticated `GET /api/v1/intake` returned `500`.
- Safe root-cause clue: Prisma validation rejected the intake queue `Task.status notIn` values as invalid for deployed `TaskStatus`.
- Frontend release artifact was not deployed.
- Backend rollback completed with prior known-good artifact `backend-wwwroot.zip`.
- Final active backend deployment version after rollback: `48ff2e32-c3af-4463-ad8c-245d0ff6f10d`.
- Post-rollback smoke: `/health` `200`, unauth communications `401`, bogus route `404`, authenticated communications `200`, authenticated intake `404` prior-baseline behavior.
- Final posture: `NO_GO_FOR_THIS_RELEASE_ARTIFACT_UNTIL_INTAKE_ENUM_COMPATIBILITY_FIX`.

The next release attempt must first fix and validate the intake queue production enum compatibility issue on a separate release branch/artifact.

## Intake task status compatibility fix follow-up

A narrow backend fix now aligns intake/lifecycle/agenda task-status filters with the generated Prisma `TaskStatus` enum. The failed release artifact remains blocked.

- Fix area: `Backend/src/modules/tasks/taskStatus.ts`, `Backend/src/modules/cases/intakeService.ts`, `Backend/src/modules/cases/lifecycleService.ts`, `Backend/src/modules/agenda/service.ts`.
- Tests: added task-status compatibility guard and intake queue filter assertions.
- Backend/frontend validation passed.
- No schema, migration, frontend runtime, config, feature flag, package, OpenAPI, CORS, Azure, AI/n8n, or Client Portal change.
- No new backend artifact yet because live local authenticated intake smoke was blocked by missing local DB/auth env.
- Current go/no-go: `NO_GO_LOCAL_COMPATIBILITY_BLOCKER`.
