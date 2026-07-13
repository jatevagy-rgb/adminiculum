# Workflow Core Responsibility / Workload / Time Acceptance

## Acceptance Checks
- Case responsibility endpoint returns safe explicit DTOs and capabilities.
- Case assignment requires case-manage access.
- Collaborator add/remove remains manager-only.
- Task reassignment requires actor access and a real case-team assignee.
- Time entry creation uses authenticated user only.
- Unsupported task/document/communication time context is rejected with an honest future-model message.
- `/workload` renders without fake data, rankings, AI, or passive tracking claims.
- Dashboard and Case Detail link to workload/time where supported.

## Validation Commands
- `git diff --check`
- `cd Backend && npx.cmd prisma validate`
- `cd Backend && npx.cmd tsc --noEmit`
- `cd Backend && npm.cmd test -- --runInBand`
- `cd Frontend && npx.cmd tsc --noEmit`
- `cd Frontend && npm.cmd run build`
- `cd Frontend && npm.cmd run verify:prod-env`

## Route Smoke Targets
- `/`
- `/cases`
- `/cases/smoke-case`
- `/tasks`
- `/deadlines`
- `/workload`
- `/time-entries`
- `/notifications`
- `/documents/compare`
- `/litigation-workspace`
- `/portal`
