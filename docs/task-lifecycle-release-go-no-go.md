# Task Lifecycle Release Go / No-Go

Date: 2026-07-19
Official branch: `release/editor-ops-workflow-1`
Runtime integration head: `a2553b56f29ffd2d841cc835611ba5a396f4661e`

## Recommendation

**GO for a separately approved production migration operation and subsequent deployment preparation.**

This is not authorization to apply the migration, run `prisma migrate deploy`, build final artifacts, deploy, restart applications, change Azure configuration, or mutate production data.

## Gate Matrix

| Gate | Result | Evidence |
| --- | --- | --- |
| Ancestry and scope | PASS | 22-commit fast-forward; accepted lineage present; parked `24bc6c5` absent |
| Unexplained diff | PASS | 93 files classified; no protected unrelated runtime area changed |
| Migration SQL | PASS | Additive; 5 enums, 4 tables, nullable column, 17 indexes, 11 checks, 16 FKs |
| Destructive SQL | PASS | Count 0 |
| Production metadata | PASS | Head and absence/collision checks proven read-only |
| Full empty-chain replay | KNOWN BLOCKER TO BLANKET DEPLOY | Historical no-op baseline causes `P3018`/`42P01` before candidate |
| Production-head clone | PASS | Candidate applied in 147 ms; DB-to-schema diff empty |
| Old runtime compatibility | PASS | Old runtime operates against additive new schema |
| Authorization/DTO | PASS | Auth-first, hidden resources, self-review denial, safe projections |
| Transaction/idempotency | PASS | Serializable transitions, locks, retries, fingerprints, no duplicate side effects |
| Frontend/backend contract | PASS | Paths, methods, headers, DTOs, errors, versions, external completion aligned |
| CORS | PASS | Only two required headers added; no wildcard or origin/method change |
| Backend validation | PASS | 48 suites passed, 3 skipped; 467 passed, 47 skipped; build/typecheck green |
| Frontend validation | PASS | 22 focused tests; typecheck/build/env guard green |
| Authenticated local QA | PASS | Ordinary, return/revise, zero-time, external action/completion, refresh, double-click |
| Production apply authorization | BLOCKED | Requires a separate explicit operator ticket |
| Deployment authorization | BLOCKED | Requires migration success, final artifacts, and separate deploy approval |

## Migration Risk

Migration risk is low-to-moderate because the SQL is additive and clone-proven, but production operational risk is not zero. The existing `time_entries` index/FK work can contend with live traffic, production HA/geo-redundancy are disabled, and the repository migration chain cannot safely drive blanket deployment.

## Rollback Confidence

- Application rollback: high, because old runtime compatibility with the new schema was proven.
- Database rollback: conservative; preserve additive objects/data and use transaction/PITR only under explicit incident approval.
- Destructive down migration: not recommended.

## Production Access Assumptions

- The later operator can prove the exact production target without exposing credentials.
- Production migration head remains unchanged.
- Backup/PITR posture is accepted immediately before apply.
- The approved executor runs only the reviewed SQL.
- Migration metadata is recorded only after successful physical apply and verification.

## Remaining Conditions

1. Human production-migration approval naming this migration and target.
2. Maintenance-window and lock-threshold decision.
3. Backup/PITR confirmation.
4. Final migration SQL checksum and source provenance confirmation.
5. Review of the one-shot executor and metadata-recording mechanism.
6. Read-only pre-apply head/collision/lock checks.
7. Successful post-apply schema proof.
8. Final backend/frontend artifact generation from the final official release commit.
9. Separate backend/frontend deployment approval and authenticated production acceptance.
10. Explicit acknowledgement of inherited npm audit findings.

## Exact Next Authorized Action

Create a production migration approval ticket for `20260718120000_add_task_submission_workflow` that follows `docs/task-lifecycle-production-migration-runbook.md`. The ticket may authorize only the reviewed one-shot SQL and metadata record; it must continue to prohibit `prisma migrate deploy` and all unrelated migrations.

## Blockers

- Production migration is not yet approved.
- Final deploy artifacts do not exist for the final release documentation commit.
- Deployment is not authorized.
- The historical full-chain defect remains unresolved and prohibits blanket migration execution.

Final classification: `TASK_LIFECYCLE_RELEASE_INTEGRATED_READY_FOR_PRODUCTION_MIGRATION_APPROVAL`
