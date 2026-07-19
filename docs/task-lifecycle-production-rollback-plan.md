# Task Lifecycle Production Rollback Plan

Date: 2026-07-19
Execution status: planning only

## Principle

The migration is additive. Normal rollback preserves the new schema and any lifecycle data, then rolls application versions back to a compatible prior artifact. Dropping populated lifecycle tables or enum types is not a normal rollback.

## Migration Fails Before Completion

1. Stop immediately.
2. Do not deploy backend or frontend.
3. Inspect physical objects and migration metadata read-only.
4. If the transaction rolled back fully, leave production on the old application stack.
5. If state is uncertain or partial, freeze further changes and obtain a database-specific remediation approval.
6. Do not mark the migration resolved or delete objects ad hoc.

## Migration Succeeds, Backend Deploy Fails

- Keep the additive schema.
- Old backend is proven compatible with the new schema.
- If backend activation began, redeploy the prior known-good backend artifact under separate operator approval.
- Do not deploy the new frontend.

## Backend Succeeds, Frontend Deploy Fails

- Keep the new schema and new backend.
- Roll back or retain the prior frontend artifact only.
- Confirm legacy frontend behavior and backend health.

## Lifecycle Defect After Full Deploy

- Stop further rollout and avoid new lifecycle mutations where operationally possible.
- Preserve lifecycle rows, decisions, links, audit events, and notifications for investigation.
- Roll back frontend and backend artifacts only where the compatibility matrix permits.
- Do not drop the new tables, remove enum values, or null/delete workflow records.
- Use PITR only after explicit incident approval when application rollback cannot recover service safely.

## Decision Tree

| State | Preferred response |
| --- | --- |
| SQL not started | Abort; no rollback required |
| SQL transaction failed and fully rolled back | Keep old runtime; investigate |
| Partial/uncertain SQL state | Stop; metadata audit; manual remediation approval |
| Schema new, backend old | Safe temporary state |
| Schema new, backend new, frontend old | Safe temporary state |
| Full release active, frontend defect | Roll back frontend only |
| Full release active, backend defect | Roll back frontend if needed, then backend; retain schema |
| Data-integrity incident | Freeze writes; preserve evidence; incident-specific recovery approval |

## Rollback Preconditions

- Prior artifact IDs and SHA-256 values verified.
- Artifact commit provenance verified.
- Operator approval recorded.
- Current schema/runtime state captured.
- Post-rollback health, auth, legacy route, task, review, and Client Portal guard smoke prepared.

## Prohibited Normal Rollback Actions

- No destructive down migration.
- No dropping lifecycle tables or enums.
- No deleting lifecycle data.
- No force-marking migration history.
- No Azure setting or feature-flag workaround.
- No bypass of authentication or authorization.

Rollback confidence is high for application-only rollback because the old backend was proven against the additive new schema. Database recovery confidence depends on the separately confirmed production PITR/backup posture.
