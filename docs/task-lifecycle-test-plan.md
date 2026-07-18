# Task Lifecycle Test Plan

Date: 2026-07-18
Status: future verification plan; no tests changed in this task

## Quality Gates

The lifecycle is not complete until schema constraints, authorization, transactions, DTO privacy, refresh persistence, and rollback compatibility are proven. Static string tests alone are insufficient.

## Unit Tests

### State Machine

- `TODO|PENDING -> IN_PROGRESS` only through start.
- `IN_PROGRESS + DRAFT -> SUBMITTED/IN_REVIEW` only through submit.
- `SUBMITTED -> RETURNED` and task back to `IN_PROGRESS`.
- returned revision remains immutable while next revision is created.
- `SUBMITTED -> APPROVED` and task closes when no external action.
- approved external action enters pending state and closes only after completion.
- invalid transitions return deterministic conflict codes.
- `CANCELLED` draft cannot submit.

### Prerequisites

- summary required.
- remaining-issues declaration required, including explicit none.
- document/version or bounded text outcome required.
- attention required only when approved policy says so.
- reviewer required only when approved policy says so.
- linked time or persisted zero-time confirmation required.
- external action type validated.

### DTO Mappers

- task state, submission state, and review decision remain separate.
- deterministic next action by state and role.
- no Prisma row passthrough.
- no document body, workspace text, email body, provider metadata, raw path, secret, internal role internals, or unrestricted notes in list DTOs.

## Service Tests

### Authorization

- assignee can start/edit/submit own eligible work.
- non-assignee worker cannot edit or submit.
- unassigned task is not silently claimed.
- reviewer eligibility respects task/case scope.
- submitter/assignee self-review denied.
- admin behavior matches approved policy.
- assignment supervisor behavior matches approved policy.
- collaborator without explicit reviewer authority denied.
- cross-case document/time/reviewer links denied.

### Revision History

- first draft gets revision 1.
- concurrent draft creation yields one active draft.
- concurrent revision allocation yields distinct monotonic numbers or safe retry.
- resubmit creates revision 2 and preserves revision 1 content/decision.
- old document/version and time links remain unchanged.
- submitted/returned/approved content update attempts fail.

### Idempotency

- duplicate time create with same user/key/payload returns first record.
- same key with different payload returns `IDEMPOTENCY_KEY_REUSED`.
- duplicate submit returns first result without duplicate decision/time link/audit/notification.
- duplicate return/approve cannot create a second decision.
- duplicate external completion does not create duplicate events.

## Route Tests

For every route:

- unauthenticated request returns `401` before resource access;
- inaccessible guessed task/submission/document/time ID returns safe `404`;
- visible but unauthorized operation returns `403`;
- state conflict returns `409` without partial mutation;
- validation failure returns safe `400` without echoing privileged content;
- unsupported fields are rejected;
- status cannot be changed through generic PATCH;
- response shape is explicit and sanitized;
- pagination limits/defaults are enforced.

Required route groups:

- workflow read and task start;
- submissions list/create/read/draft update;
- document link/unlink;
- task-linked time creation;
- submit;
- return;
- approve;
- external completion.

## Database Integration Tests

Use disposable local PostgreSQL only, never production/shared data.

### Constraints

- unique `(taskId,revisionNumber)`.
- partial unique active draft.
- unique submission decision.
- unique document link.
- unique time-entry submission link.
- unique time idempotency per user.
- submission idempotency uniqueness.
- reviewer/submission same-row check if included.
- FK delete restrictions preserve task/submission/document/time/reviewer history.

### Cross-Resource Service Invariants

- task/document same case.
- document version belongs to document.
- task/time entry same task and matter.
- reviewer has case access.
- submission nested under correct task.

### Atomic Rollback

Inject failures after each transaction stage:

- task update;
- time link insert;
- submission update;
- decision insert;
- audit insert;
- notification insert.

After each failure prove no partial task/submission/decision/time/audit/notification mutation remains.

## Migration Verification

- Prisma schema validates.
- generated SQL is additive only.
- no existing table/column/index/constraint is dropped or renamed.
- transactional clone execution creates expected objects and fully rolls back.
- persistent fresh-clone apply succeeds once.
- migration metadata records only the intended migration.
- new tables contain zero business rows after schema apply.
- old runtime starts and reads existing routes against migrated clone.
- rollback runtime ignores new tables/columns.
- optional TaskStatus enum migration is isolated and explicitly approved.

## Query And Index Verification

On a disposable clone with synthetic metadata-scale data:

- task submission history uses `(taskId,status,createdAt)`.
- reviewer queue uses `(assignedReviewerId,status,submittedAt)`.
- submitter history uses `(submittedById,status,submittedAt)`.
- task time list uses `(taskId,workDate)`.
- submission audit uses `(taskSubmissionId,createdAt)`.
- pagination is stable under equal timestamps through a deterministic tie-breaker.
- query plans do not require broad scans at expected production cardinality.

Do not copy production business rows into test fixtures.

## Privacy Tests

- list DTOs exclude work summary and reviewer notes unless detail access is authorized.
- notifications contain link/status only.
- timeline payloads exclude privileged text and time descriptions.
- logs redact request bodies on submission/review routes.
- cross-case 404 does not distinguish absent from hidden resource.
- Client Portal routes and DTOs expose none of the new models.
- public OpenAPI remains unchanged until separately reviewed.
- no AI/n8n/Graph/provider path can access submission content.

## Legacy Compatibility Tests

- tasks without submissions render honest no-Leadás state.
- legacy `LawyerHandoffPackage` list/read remains unchanged.
- legacy handoff is never auto-linked to a task.
- existing `Task.submittedAt` alone does not produce a submission DTO.
- existing matter-only time entries remain editable/deletable under old rules unless linked later.
- new linked submitted time entries are protected from delete/context change.

## Browser Lifecycle QA

Use authenticated local users and synthetic local data:

1. create and assign task;
2. start task;
3. create Leadás draft;
4. link synthetic document/version or text outcome;
5. create idempotent task time entry or confirm zero according to policy;
6. select attention/reviewer;
7. submit and refresh;
8. verify reviewer queue and role-specific actions;
9. return with corrections and refresh;
10. create revision 2 and confirm revision 1 is unchanged;
11. resubmit and approve;
12. exercise optional external completion if enabled;
13. verify task/time/review/history pages after refresh.

Capture truthful states at 1366×768 and 1440×900. Verify no horizontal overflow, raw errors, duplicate time, stale action, or cross-user data leakage. Do not use real client data.

## Test Classification Matrix

| Area | Unit | Service | Route | DB integration | Migration | Browser |
| --- | --- | --- | --- | --- | --- | --- |
| State transitions | Y | Y | Y | Y | N | Y |
| Authorization | partial | Y | Y | Y | N | Y |
| Revision/idempotency | Y | Y | Y | Y | N | Y |
| FKs/indexes | N | N | N | Y | Y | N |
| Atomic rollback | N | mocked | partial | Y | N | N |
| DTO privacy | Y | Y | Y | N | N | Y |
| Legacy compatibility | Y | Y | Y | Y | Y | Y |
| Application rollback | N | N | smoke | Y | Y | smoke |

## No-Go Conditions

- any self-review or cross-case access path succeeds;
- submitted content can be edited;
- duplicate retry creates time/audit/notification rows;
- return overwrites prior review history;
- task and submission state diverge after injected failure;
- old runtime fails against additive schema;
- DTO or log leaks privileged content;
- full lifecycle cannot survive refresh.

Classification: `TASK_LIFECYCLE_SCHEMA_DESIGN_READY_FOR_HUMAN_APPROVAL`
