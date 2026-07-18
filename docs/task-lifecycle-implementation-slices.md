# Task Lifecycle Implementation Slices

Date: 2026-07-18
Status: Slice 1 schema candidate and backend draft/submit slice complete; review decisions remain separately gated

## Current Completion State

- Slice 1 schema candidate and one additive migration are implemented.
- Backend workflow read, draft editing, document/time links, reviewer eligibility, readiness, and idempotent submit are implemented on `codex/task-submission-backend-1`.
- Submission-backed review queue reads and optional task-list projection metadata are implemented; approve/return mutations remain absent.
- Disposable localhost migration proof and 18 schema-constraint tests passed.
- No frontend, feature flag, production database, deployment, or Azure change occurred.
- The historical checked-in migration chain still cannot replay from empty; future production-like clone proof remains mandatory before any non-local apply.
- Slice 5 review decision mutations are the earliest possible next backend lifecycle slice and require a new explicit prompt.

## Slice 1 — Schema Candidate And Migration Draft

- Status: **COMPLETE FOR CANDIDATE REVIEW**.
- Files: `Backend/prisma/schema.prisma`, one new migration folder only after approval, migration review docs.
- Scope: new enums/models/nullable relations/indexes; no runtime.
- Tests: Prisma validate, schema diff review, transactional clone proof, fresh-clone apply proof, old-runtime compatibility.
- Rollback: abandon draft before apply; after apply preserve additive objects and use old runtime.
- Acceptance: additive-only SQL, no data mutation/backfill, exact object proof.
- No-go: unresolved human decisions, baseline drift, destructive SQL, unrelated migration coupling.

## Slice 2 — Backend Read Models And Authorization

- Status: **COMPLETE IN BACKEND SLICE 1**.

- Files: new `Backend/src/modules/task-submissions/` read DTO/service/authorization files; narrow task route registration; tests.
- Scope: workflow/submission reads and capabilities only; no writes.
- Tests: auth-first 401/404/403, DTO privacy, pagination, legacy-empty behavior.
- Rollback: remove new read route registration; data unchanged.
- Acceptance: scoped explicit DTOs, task/submission/document IDs cannot leak across cases.
- No-go: Prisma rows serialized directly, Client Portal/OpenAPI exposure, broad role grants.

## Slice 3 — Draft Leadás Creation And Editing

- Status: **COMPLETE IN BACKEND SLICE 1**.

- Files: task-submission draft service/routes/validators; tests.
- Scope: create active draft, update allowed fields, document/version link/unlink.
- Tests: one-active-draft race, revision allocation, optimistic update, same-case document/version checks, immutable non-draft guard.
- Rollback: disable draft routes; preserve drafts.
- Acceptance: only eligible worker edits `DRAFT`; no state-changing generic PATCH.
- No-go: comments/JSON used as persistence, document body/path stored, cross-case link possible.

## Slice 4 — Task Time And Submit Idempotency

- Status: **COMPLETE IN BACKEND SLICE 1** for linking existing time, zero-time confirmation, and atomic submit. New time-entry creation remains unchanged/out of scope.

- Files: narrow `timeEntries` service extraction/update, submission transaction service, tests.
- Scope: nullable task-linked time creation, time idempotency, zero-time declaration, atomic submit.
- Tests: duplicate create/submit, matter mismatch, time ownership, transaction rollback, notification/audit dedupe.
- Rollback: disable submit entry point; keep created drafts/time records.
- Acceptance: task/time/submission/audit/notification commit atomically.
- No-go: duplicate time on retry, delete of submitted-linked time, non-atomic matter totals.

## Slice 5 — Reviewer Queue, Return, And Approve

- Status: **READ INTEGRATION COMPLETE; MUTATIONS BLOCKED FOR NEXT SLICE**.

- Files: task-submission review service/routes/DTOs; review queue query; tests.
- Scope: indexed submitted queue, immutable decision, return/resubmit eligibility, approval/closure.
- Tests: reviewer assignment, self-review denial, one decision, required corrections, task state transaction, query pagination.
- Rollback: disable review mutations; submitted rows remain visible read-only.
- Acceptance: no list-row blind approval; prior returned revision remains unchanged.
- No-go: mutable decision, reviewer note in notification/audit, role ambiguity unresolved.

## Slice 6 — Frontend Task Detail

- Files: task page/detail components and API client types only.
- Scope: separate task/Leadás states, draft prerequisites, documents, time, attention, reviewer, deterministic action.
- Tests: mapper/interaction tests, empty/partial DTO safety, 1366×768 layout.
- Rollback: revert frontend; backend data remains.
- Acceptance: no fake state, no direct submit before prerequisites, refresh persists.
- No-go: frontend-only lifecycle state, raw storage paths, ambiguous combined labels.

## Slice 7 — Frontend Review Detail

- Files: review queue/detail components and API client types.
- Scope: submitted revision detail, immutable output, recorded time, approve/return, history.
- Tests: role-specific actions, return validation, no blind approval, safe empty/error states.
- Rollback: revert frontend; backend remains operational through API.
- Acceptance: reviewer sees exact frozen revision and prior history.
- No-go: derived attention presented as submitter choice, edit of submitted content, confidential note leakage.

## Slice 8 — Local Full Lifecycle QA

- Files: QA documentation only; screenshots remain untracked.
- Scope: complete synthetic local lifecycle including one return/resubmit and optional external action.
- Tests: refresh persistence, duplicate retry, role switching, time list, review queue, audit/notification safety, responsive visual QA.
- Rollback: delete synthetic local data/database only.
- Acceptance: all authoritative states proven at 1366×768 and 1440×900.
- No-go: any fake production data, schema drift, console/network failure, stale actions.

## Slice 9 — Release Integration And Artifacts

- Files: approved release docs/manifests only plus integrated prior commits.
- Scope: integrate validated slices into official release branch, prove ancestry/tree, build backend/frontend artifacts, scan and hash.
- Tests: complete backend/frontend validation, artifact source/env/provenance checks.
- Rollback: abandon release candidate before deployment.
- Acceptance: exact commit provenance and zero protected-area surprise diff.
- No-go: feature-branch artifact, unresolved full-suite failures, missing clone proof, unknown migration state.

## Slice 10 — Production Migration And Deployment

- Files: no new source edits during operator step.
- Scope: separately approved migration apply, backend-first deploy, smoke, frontend deploy, authenticated acceptance.
- Tests: schema proof, health/auth/route guards, read paths, approved synthetic or local-only mutation evidence.
- Rollback: application rollback preserves new data; no destructive down migration.
- Acceptance: migration metadata/schema proof, no partial activation, production smoke green.
- No-go: pending unrelated migrations, auth/health/client-portal regression, unknown artifact activation, any requirement for infrastructure changes.

## Cross-Slice Rules

- One branch/PR per slice after Slice 1.
- No parallel edits to Prisma, task routes, task page, review page, or time-entry routes without coordination.
- No schema/write/UI slice advances if the prior slice lacks tests and rollback evidence.
- Existing case-level handoff remains readable throughout.
- Client Portal, AI/n8n, Outlook/Graph, SharePoint behavior, public OpenAPI, CORS, auth provider config, Azure settings, packages, and infrastructure remain outside scope.

Classification: `TASK_SUBMISSION_BACKEND_READY_FOR_REVIEW_DECISION_SLICE`
