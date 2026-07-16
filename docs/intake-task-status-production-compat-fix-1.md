# Intake Task Status Production Compatibility Fix 1

Date: 2026-07-16
Release branch: `release/editor-ops-workflow-1`
Starting incident documentation commit: `5f2e7a8`
Deployment action: none

## Summary

The failed backend release deployment `24f6a5a5-4004-4b7d-98ba-f91d5737fc52` exposed a production compatibility bug in authenticated `GET /api/v1/intake`: Prisma rejected `Task.status notIn` values that were not members of the deployed `TaskStatus` enum.

This patch removes invalid task-status assumptions from runtime Prisma filters and centralizes task-status filter values through the generated Prisma enum.

Current classification for this pass:

`intake_task_status_compat_fix_1_no_go_local_compatibility`

The code fix is implemented and automated validation passed, but a live local authenticated backend smoke could not be completed in this Codex session because no local `DATABASE_URL` / auth runtime environment was available and no checked-in local `.env` exists. No backend artifact was generated and no deployment was performed.

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

## Local Authenticated Smoke

Blocked in this Codex session:

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

No backend artifact was generated in this pass because the live local authenticated intake smoke was blocked. The prior failed backend artifact `adminiculum-backend-editor-ops-7392a6c.zip` must not be redeployed.

## Deployment Recommendation

`NO_GO_LOCAL_COMPATIBILITY_BLOCKER`

Next step: rerun this fix in a shell/session with the proven safe local DB/auth environment available, complete live local `/api/v1/intake` smoke, then generate a backend-only artifact and request explicit backend-only redeployment approval.
