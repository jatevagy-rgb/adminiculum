# Task Lifecycle API Contract Plan

Date: 2026-07-18
Status: future explicit contracts; no routes implemented

## Contract Principles

- Internal authenticated API only.
- Nested resources are always resolved through a scoped task.
- Reads return explicit DTOs; Prisma rows are never serialized directly.
- Core submission content is mutable only while `DRAFT`.
- Transitions use dedicated POST endpoints, never a generic status PATCH.
- `Idempotency-Key` is required for submit and task-time creation operations.
- Content-bearing DTOs are excluded from logs, timeline metadata, notifications, and list previews.
- Existing task/handoff routes remain unchanged until a later compatibility plan replaces them.

## Common DTOs

### `TaskWorkflowDto`

```text
task: { id, caseId, matterId, title, status, assignee, supervisor, startedAt, startedBy, completedAt }
latestSubmission: TaskSubmissionSummaryDto | null
activeDraft: TaskSubmissionSummaryDto | null
timeSummary: { totalMinutes, linkedMinutes, zeroTimeConfirmed }
capabilities: { canStart, canEditDraft, canSubmit, canReview, canReturn, canApprove, canRecordExternalCompletion }
nextAction: START | OPEN | CONTINUE_SUBMISSION | VIEW_SUBMISSION | OPEN_REVIEW | CONTINUE_CORRECTION | RECORD_EXTERNAL_COMPLETION | VIEW
```

### `TaskSubmissionSummaryDto`

```text
id, taskId, revisionNumber, status, preparedBy, submittedBy, assignedReviewer,
requestedAttention, submittedAt, returnedAt, approvedAt, externalActionType,
externalCompletedAt, documentCount, linkedMinutes
```

### `TaskSubmissionDetailDto`

Includes summary fields plus bounded `workSummary`, `remainingIssues`, `noteToReviewer`, `textOutcome`, safe document/version metadata, immutable review decision, time-entry summaries, and content-minimal history. It never includes document body, workspace text, raw path, provider metadata, email body, or unrestricted user records.

## Route Plan

### `GET /api/v1/tasks/:taskId/workflow`

- Authorization: any actor with scoped task access; draft content filtered by capability.
- Request: path only.
- Response: `TaskWorkflowDto`.
- Preconditions: none after scoped visibility.
- Idempotency: read-only.
- Transaction: consistent read transaction recommended.
- Audit: no read audit by default; security access logs only.
- Errors: `401`, scoped `404`.

### `POST /api/v1/tasks/:taskId/start`

- Authorization: assigned worker; preserve current self-claim denial.
- Request: empty body.
- Response: updated `TaskWorkflowDto`.
- Preconditions: `Task.status=TODO|PENDING`, assignee equals actor.
- Idempotency: repeated call after successful start returns the current workflow only when actor and resulting state match; otherwise `409`.
- Transaction: task compare-and-set, `startedAt`, `startedById`, timeline event.
- Audit: `TASK_STARTED`, IDs and timestamps only.
- Errors: `TASK_NOT_FOUND`, `TASK_ACTION_FORBIDDEN`, `TASK_TRANSITION_CONFLICT`.

### `GET /api/v1/tasks/:taskId/submissions`

- Authorization: scoped task reader; draft rows filtered to authorized draft readers.
- Query: `limit` default 20/max 50, cursor or `(revisionNumber,id)` pagination, optional safe status filter.
- Response: `{ submissions: TaskSubmissionSummaryDto[], pagination }`.
- Preconditions: none.
- Idempotency: read-only.
- Transaction: none required.
- Audit: none.
- Errors: `TASK_NOT_FOUND`, invalid pagination `400`.

### `POST /api/v1/tasks/:taskId/submissions`

- Authorization: task assignee/eligible worker.
- Request: `{ supersedesSubmissionId?: string }`.
- Response: existing active draft or newly created draft detail.
- Preconditions: task is `IN_PROGRESS`; no active draft; superseded revision, when provided, belongs to the task and is `RETURNED`.
- Idempotency: one-active-draft partial unique index; race returns the existing draft.
- Transaction: allocate next revision, create draft, optionally mark prior `supersededAt`, create content-minimal audit.
- Audit: `CUSTOM` with type `TASK_SUBMISSION_DRAFT_CREATED`.
- Errors: `TASK_ACTION_FORBIDDEN`, `SUBMISSION_TRANSITION_CONFLICT`, `SUBMISSION_NOT_FOUND`.

### `GET /api/v1/tasks/:taskId/submissions/:submissionId`

- Authorization: scoped task reader plus draft/submitted content rules.
- Request: path only.
- Response: `TaskSubmissionDetailDto` with role-filtered capabilities.
- Preconditions: submission belongs to task.
- Idempotency: read-only.
- Transaction: consistent read optional.
- Audit: no content audit.
- Errors: scoped `TASK_NOT_FOUND` or `SUBMISSION_NOT_FOUND`.

### `PATCH /api/v1/tasks/:taskId/submissions/:submissionId`

- Authorization: preparer/eligible draft editor.
- Request: `{ workSummary?, remainingIssues?, noteToReviewer?, textOutcome?, requestedAttention?, assignedReviewerId?, externalActionType?, expectedUpdatedAt }`.
- Response: updated draft detail.
- Preconditions: `status=DRAFT`; task remains `IN_PROGRESS`; optimistic timestamp matches.
- Forbidden fields: `status`, actor IDs, revision, timestamps, idempotency key, review decision, external completion.
- Idempotency: optimistic compare-and-set; identical payload may return current row.
- Transaction: scoped draft update and reviewer eligibility check.
- Audit: no content in audit; optional `TASK_SUBMISSION_DRAFT_UPDATED` event only when policy needs it.
- Errors: `SUBMISSION_WRITE_FORBIDDEN`, `SUBMISSION_TRANSITION_CONFLICT`, validation `400`.

### `POST /api/v1/tasks/:taskId/submissions/:submissionId/documents`

- Authorization: eligible draft editor with document access.
- Request: `{ documentId, documentVersionId?, role }`.
- Response: safe document-link DTO.
- Preconditions: draft state; document belongs to task case; version belongs to document.
- Idempotency: unique `(submissionId,documentId)` returns existing identical link; conflicting role/version returns `409`.
- Transaction: scoped document/version lookup then link create.
- Audit: IDs and role only if enabled.
- Errors: scoped `DOCUMENT_NOT_FOUND`, `CROSS_CASE_LINK_FORBIDDEN`, `SUBMISSION_TRANSITION_CONFLICT`.

### `DELETE /api/v1/tasks/:taskId/submissions/:submissionId/documents/:documentId`

- Authorization: eligible draft editor.
- Request: path only.
- Response: `204`.
- Preconditions: submission remains `DRAFT`.
- Idempotency: absent link returns `204` only after scoped task/submission visibility is proven.
- Transaction: explicit link delete; never deletes document/version.
- Audit: optional ID-only draft event.
- Errors: scoped resource errors, state `409`.

### `POST /api/v1/tasks/:taskId/submissions/:submissionId/submit`

- Authorization: eligible worker; normally preparer/assignee.
- Header: required `Idempotency-Key`.
- Request: `{ assignedReviewerId?, confirmZeroTime?: boolean }`.
- Response: frozen submission detail and updated workflow.
- Preconditions: `DRAFT`; summary; remaining-issues declaration; requested attention if mandatory; reviewer if mandatory; result document/version or bounded text outcome; linked time or explicit zero-time confirmation; same-case/matter invariants.
- Idempotency: key stored on submission. Same key and same frozen payload returns the first success; key reuse with different payload returns `409`.
- Transaction: freeze revision, bind time links, set submitter/time/reviewer, task `IN_REVIEW`, timeline event, notification.
- Audit: `REVIEW_REQUESTED` with IDs/status/attention/time total only.
- Errors: `SUBMISSION_PREREQUISITES_MISSING`, `SELF_REVIEW_FORBIDDEN`, `IDEMPOTENCY_KEY_REUSED`, state `409`.

### `POST /api/v1/tasks/:taskId/submissions/:submissionId/return`

- Authorization: assigned/eligible reviewer; never submitter/assignee under default policy.
- Request: `{ note, requestedCorrections, requiresFullReview, correctionDeadline? }`.
- Response: immutable decision and updated workflow.
- Preconditions: submission `SUBMITTED`, task `IN_REVIEW`, no decision exists.
- Idempotency: unique decision row; same reviewer and identical decision payload may return first result, otherwise `SUBMISSION_ALREADY_DECIDED`.
- Transaction: decision create, submission `RETURNED`/`returnedAt`, task `IN_PROGRESS`, timeline event, notification.
- Audit: `REVIEW_COMPLETED`, type `TASK_SUBMISSION_RETURNED`, IDs/status only.
- Errors: `REVIEW_FORBIDDEN`, `SELF_REVIEW_FORBIDDEN`, `SUBMISSION_ALREADY_DECIDED`, validation `400`, state `409`.

### `POST /api/v1/tasks/:taskId/submissions/:submissionId/approve`

- Authorization: assigned/eligible reviewer; review detail must be loaded through scoped contract.
- Request: `{ note?, externalActionType?: ExternalActionType }`.
- Response: immutable decision and updated workflow.
- Preconditions: submission `SUBMITTED`, task `IN_REVIEW`, no decision exists.
- Idempotency: unique decision row as above.
- Transaction: decision create, submission `APPROVED`/`approvedAt`, task `DONE` or `AWAITING_EXTERNAL_ACTION`, task completion timestamp when closed, timeline event, notification.
- Audit: `REVIEW_COMPLETED`; also `TASK_COMPLETED` when closed.
- Errors: reviewer/security errors, already-decided `409`, unsupported external action `400`.

### `POST /api/v1/tasks/:taskId/submissions/:submissionId/external-completion`

- Authorization: case responsible lawyer/admin by default; policy may include assigned reviewer.
- Request: `{ externalReference? }`.
- Response: updated approved submission and task workflow.
- Preconditions: submission `APPROVED`, external type not `NONE`, task `AWAITING_EXTERNAL_ACTION`, no completion timestamp.
- Idempotency: repeated identical completion returns existing result; conflicting second completion returns `409`.
- Transaction: completion actor/time/reference, task `DONE`/`completedAt`, timeline event.
- Audit: `CUSTOM` type `TASK_EXTERNAL_COMPLETED`, IDs/action/timestamp only.
- Errors: `EXTERNAL_ACTION_NOT_REQUIRED`, `EXTERNAL_ACTION_ALREADY_COMPLETED`, state/security errors.

## Time Entry Compatibility Contract

Existing `POST /api/v1/time-entries` may later accept:

```text
taskId: string
idempotencyKey: string
billable: boolean
```

Rules:

- authenticated user remains authoritative;
- task is scoped before time creation;
- task matter must equal `matterId`;
- `(userId,idempotencyKey)` prevents duplicate creation;
- submission ID is not accepted on ordinary time creation;
- a submission freezes selected task time through `TaskSubmissionTimeEntry` during submit;
- linked submitted time entries cannot be deleted or context-reassigned.

## Compatibility And Deprecation

- Existing `/tasks/:id/submit` and `/tasks/:id/complete` must not be treated as the new lifecycle contract.
- They remain compatibility routes until a later runtime slice introduces a controlled deprecation plan.
- Existing handoff package routes remain case-level legacy routes.
- No route is public, client-facing, or added to OpenAPI until a separate exposure review.

Classification: `TASK_LIFECYCLE_SCHEMA_DESIGN_READY_FOR_HUMAN_APPROVAL`
