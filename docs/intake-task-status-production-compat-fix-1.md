# Intake Task Status Production Compatibility Fix 1

Date: 2026-07-16
Release branch: `release/editor-ops-workflow-1`
Starting incident documentation commit: `5f2e7a8`
Deployment action: none

## Summary

The failed backend release deployment `24f6a5a5-4004-4b7d-98ba-f91d5737fc52` exposed a production compatibility bug in authenticated `GET /api/v1/intake`: Prisma rejected `Task.status notIn` values that were not members of the deployed `TaskStatus` enum.

This patch removes invalid task-status assumptions from runtime Prisma filters and centralizes task-status filter values through the generated Prisma enum.

Current classification for this pass:

`intake_compat_artifact_1_go_for_backend_only_redeployment`

The code fix is implemented, automated validation passed, live local authenticated intake smoke passed, and a backend-only replacement artifact was generated. No deployment was performed.

## Valid TaskStatus Values

The reconstructed release Prisma schema defines these `TaskStatus` values:

- `PENDING`
- `IN_PROGRESS`
- `SUBMITTED`
- `UNDER_REVIEW`
- `COMPLETED`
- `CANCELLED`
- `BLOCKED`
- `TODO`
- `IN_REVIEW`
- `DONE`

## Invalid Runtime References Removed

Removed from Prisma `Task.status` filters:

- `APPROVED`
- `REJECTED`
- `DECLINED`
- `ARCHIVED`

These values may exist in other domain enums or old in-memory classification helpers, but they are not valid `TaskStatus` values and must not be sent to Prisma as a `Task.status` filter.

## Fix

Added `Backend/src/modules/tasks/taskStatus.ts`:

- imports `TaskStatus` from `@prisma/client`;
- exports `CLOSED_TASK_STATUSES` as `[COMPLETED, CANCELLED, DONE]`;
- exports `REVIEW_TASK_STATUSES` as `[SUBMITTED, UNDER_REVIEW, IN_REVIEW]`;
- derives `OPEN_TASK_STATUSES` from the generated enum;
- provides `isClosedTaskStatus` / `isOpenTaskStatus` helpers.

Updated runtime filters:

- `Backend/src/modules/cases/intakeService.ts`
  - intake readiness open-task count;
  - opening-task dedupe query;
  - activation readiness count;
  - intake queue open-task count.
- `Backend/src/modules/cases/lifecycleService.ts`
  - closure blocker open-task counts;
  - active review count.
- `Backend/src/modules/agenda/service.ts`
  - task deadline open/completed filter now reuses the same valid closed-status list.

## Related Status Audit

Runtime-invalid Prisma `Task.status` filters fixed:

- intake queue/readiness filters;
- lifecycle closure blocker filters.

Related reviewed but not changed:

- `Backend/src/modules/cases/workflowSummary.ts` keeps legacy status names in in-memory categorization only; no Prisma `Task.status` filter sends those values.
- `Backend/src/modules/agenda/deadlineEngine.ts` keeps legacy status names in in-memory deadline classification only.
- `Backend/src/modules/agenda/service.ts` still contains case-status filters with values such as `APPROVED` / `ARCHIVED`; those apply to `Case.status`, not `Task.status`.

## Tests Added / Updated

- `Backend/tests/taskStatusCompatibility.test.ts`
  - pins the generated `TaskStatus` enum values;
  - asserts runtime helper arrays contain only generated enum members;
  - asserts invalid values are absent from closed task filters;
  - verifies open/closed semantics.
- `Backend/tests/intakeQueue.test.ts`
  - verifies intake queue task-count query uses only `CLOSED_TASK_STATUSES`;
  - verifies no broad Prisma `include` is used;
  - verifies empty intake queue returns a successful empty response.

## Validation

Passed:

- `git diff --check`
- `cd Backend && npx.cmd prisma validate` with dummy non-connecting `DATABASE_URL`
- `cd Backend && npx.cmd tsc --noEmit`
- `cd Backend && npm.cmd test -- --runInBand`
  - 42 suites passed
  - 418 tests passed
- `cd Backend && npm.cmd run build`
- `cd Frontend && npx.cmd tsc --noEmit`
- `cd Frontend && npm.cmd run build`
- `cd Frontend && npm.cmd run verify:prod-env`

Known inherited dependency audit summary:

- Backend: 2 low / 9 moderate / 7 high / 1 critical.
- Package files were not changed by this fix.

## Superseded Local Authenticated Smoke Blocker

This earlier blocker has been superseded by the completed process-only local-env smoke below. Earlier blocked state was:

- `[bool]$env:DATABASE_URL` was false.
- `[bool]$env:JWT_SECRET` was false.
- No checked-in `Backend/.env` or `Backend/.env.test` exists.
- Only example env files were present.

Therefore a live local backend process could not be started against a real local database/auth setup without inventing credentials or printing/storing secrets. The authenticated route behavior was covered by route tests with mocked auth and mocked Prisma, but live local smoke remains required before producing a deployable backend artifact.

## Zero-Diff Gates

Relative to `5f2e7a8`:

- Frontend runtime diff: `0`
- Prisma schema diff: `0`
- Migrations diff: `0`
- Client Portal diff: `0`
- OpenAPI/Swagger diff: `0`
- CORS diff: `0`
- Azure/deploy config diff: `0`
- Feature flags: `0`
- Packages: `0`
- AI/n8n: `0`

## Artifact Status

A replacement backend-only artifact was generated after successful authenticated local smoke.

- Artifact: `C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\adminiculum-backend-editor-ops-intake-fix-e4e0c00.zip`
- SHA-256: `76eacc73a19fa35d0bd092590d45b14d891288ccd37776a58bf44d7a84bea359`
- Source commit: `e4e0c00`

The prior failed backend artifact `adminiculum-backend-editor-ops-7392a6c.zip` must not be redeployed.

## Deployment Recommendation

`BACKEND_ONLY_REDEPLOYMENT_SUCCESS`

Backend-only redeployment approval was granted, the replacement artifact was deployed successfully, and post-deploy smoke passed. No frontend deploy, migration, app setting change, or feature flag change occurred.


## Intake Compatibility Completion Smoke And Artifact

`COMPLETE-INTAKE-COMPAT-SMOKE-AND-BACKEND-ARTIFACT-1` completed on 2026-07-16 with no additional runtime code changes.

Reused local environment safely:

- Primary worktree local env sources were read process-only from `C:\Users\hubay\Documents\Adminiculum`.
- No env files were copied into the release worktree.
- Secrets and token values were not printed.
- Local DB target was verified as `localhost:5432/adminiculum` before runtime smoke.
- A local JWT was generated from the existing active local ADMIN user for smoke only; the token was not persisted or printed.

Authenticated backend smoke:

| Check | Result |
| --- | --- |
| `GET /health` | `200` |
| unauthenticated `GET /api/v1/intake` | `401` |
| authenticated `GET /api/v1/intake` | `200` |
| intake DTO | `generatedAt`, `summary`, `items`, `pagination`, `availability` |
| item count | `0` |
| pagination | `limit=50`, `offset=0`, `hasMore=false` |
| Prisma enum error | none |
| schema mismatch / migration request | none |

Related read smoke:

| Check | Result |
| --- | --- |
| authenticated `GET /api/v1/agenda` | `200`, bounded pagination |
| authenticated `GET /api/v1/workload` | `200` |
| authenticated `GET /api/v1/tasks` | `200` |
| authenticated `GET /api/v1/cases` | `200` |
| authenticated `GET /api/v1/cases/smoke-case/lifecycle` | `404 CASE_NOT_FOUND`, safe missing state, no enum/runtime `500` |

Frontend compatibility smoke:

- Unchanged release frontend was run locally against the fixed backend.
- `/intake` loaded under an authenticated local session.
- Frontend called `GET /api/v1/intake?scope=MY_INTAKES&status=ALL&limit=50` and received `200`.
- Auth bootstrap called `GET /api/v1/auth/me` and received `200`.
- No auth error, redirect loop, request failure, or console-blocking error was observed.
- No frontend runtime code change was required.

Backend artifact:

- Path: `C:\Users\hubay\AppData\Local\Temp\adminiculum-narrow-release-artifacts\adminiculum-backend-editor-ops-intake-fix-e4e0c00.zip`
- SHA-256: `76eacc73a19fa35d0bd092590d45b14d891288ccd37776a58bf44d7a84bea359`
- Size bytes: `1495221`
- File count: `551`
- Source commit: `e4e0c00`
- Component: backend only
- `Backend/scripts` intentionally excluded because it contains local seed/helper sample credentials and is not required for the Oryx source artifact.

Artifact scan:

- Contains `src/modules/tasks/taskStatus.ts`, `src/modules/cases/intakeService.ts`, `src/modules/cases/lifecycleService.ts`, and `src/modules/agenda/service.ts`.
- Contains `package.json`, `package-lock.json`, `prisma/schema.prisma`, `prisma/migrations`, `templates`, `dist`, and `release-manifest.json`.
- Contains no `Frontend/`, `docs/`, `tests/`, `node_modules/`, env files, seed/helper scripts, sample passwords, local user email literals, AI/n8n provider endpoints, Azure audit data, or Client Portal expansion.
- Literal `.env.local` scan hits are only `.dockerignore` and `process.env.LOCAL_DEV_*` source references; no `.env*` file is present in the ZIP.

Final posture for this completion step:

`BACKEND_ONLY_REDEPLOYMENT_SUCCESS`


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
