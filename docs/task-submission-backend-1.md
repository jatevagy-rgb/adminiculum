# Task Submission Backend Slice 1

Date: 2026-07-18
Branch: `codex/task-submission-backend-1`
Base: `7ef3d18`
Status: backend review-decision entry slice implemented; not deployed

## Scope

This slice adds authenticated task-owned Leadás workflow reads and draft/submit mutations over the approved `TaskSubmission` schema candidate. It implements draft creation/editing, reviewer selection, document/time linking, explicit zero-time confirmation, deterministic readiness, atomic idempotent submit, review-queue reads, and optional task-list projection metadata.

It does not implement approve, return, task closure, external completion, frontend UI, public API/OpenAPI publication, production migration, or deployment.

## Runtime Modules

- `taskSubmission.types.ts`: explicit safe DTOs and readiness codes.
- `taskAuthorization.ts`: the existing task/case access rule extracted for transaction-client reuse.
- `taskSubmission.service.ts`: explicit domain operations and serializable transactions.
- `taskSubmission.routes.ts`: authenticated task-scoped routes and bounded error mapping.
- `tasks/services.ts`: submission-backed review queue plus backward-compatible task projections.

## Safety Properties

- Unrelated authenticated actors receive hidden `404 TASK_NOT_FOUND` responses.
- Collaborators can read safe workflow metadata but cannot edit worker drafts.
- Only task assignees can perform the existing `IN_PROGRESS -> IN_REVIEW` submit transition.
- Submitted relations and fields are immutable through this slice.
- Cross-case documents and cross-matter/cross-task time entries are hidden and rejected.
- DTOs omit document text, workspace text, storage/provider metadata, and raw Prisma values.
- Timeline and notification payloads contain only bounded identifiers/counts/status metadata.
- `LawyerHandoffPackage` remains separate and untouched.

## Proven Results

- Route/queue focused tests: 16/16.
- Task/intake/agenda/handoff compatibility tests: 121/121.
- Real PostgreSQL service lifecycle tests: 13/13.
- Full backend suite: 46 passed suites, 2 skipped; 453 passed tests, 31 skipped.
- Candidate migration status: up to date in a localhost disposable database.
- DB-to-schema diff: empty.
- Disposable database deleted after proof.
- `npm audit --json`: 19 inherited findings (1 critical, 7 high, 9 moderate, 2 low); no dependency or lockfile change was made.

## Rollback Posture

No deployment occurred. Before deployment, abandon or revert this branch. After a future deployment, reverting the runtime commits leaves the additive schema and any already-created draft/submitted records intact; no destructive rollback is proposed.

Classification: `TASK_SUBMISSION_BACKEND_READY_FOR_REVIEW_DECISION_SLICE`
