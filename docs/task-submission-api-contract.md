# Task Submission API Contract

Date: 2026-07-18
Status: internal authenticated contract; not deployed

## Routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/tasks/:taskId/workflow` | Safe task/submission read model |
| `GET` | `/api/v1/tasks/:taskId/eligible-reviewers` | Task-scoped reviewer choices |
| `POST` | `/api/v1/tasks/:taskId/submissions` | Create or return the one active draft |
| `PATCH` | `/api/v1/tasks/:taskId/submissions/:submissionId` | Update explicit draft fields |
| `GET` | `/api/v1/tasks/:taskId/submissions/:submissionId/readiness` | Deterministic readiness codes |
| `POST` | `/api/v1/tasks/:taskId/submissions/:submissionId/documents` | Attach document metadata |
| `DELETE` | `/api/v1/tasks/:taskId/submissions/:submissionId/documents/:documentId` | Detach draft relation only |
| `POST` | `/api/v1/tasks/:taskId/submissions/:submissionId/time-entries` | Attach existing time entry |
| `DELETE` | `/api/v1/tasks/:taskId/submissions/:submissionId/time-entries/:timeEntryId` | Detach draft relation only |
| `POST` | `/api/v1/tasks/:taskId/submissions/:submissionId/submit` | Atomic submit; requires `Idempotency-Key` |

## Draft Inputs

Draft create accepts optional `assignedReviewerId`. When omitted, the service resolves the first eligible persisted reviewer from task assigner, case responsible lawyer, then case creator; it never selects the worker. If none is eligible, creation returns `409 REVIEWER_REQUIRED` because the approved schema requires a reviewer on every draft.

Draft patch accepts only:

- `workSummary`
- `remainingIssues`
- `reviewerNote`
- `requestedAttention`
- `assignedReviewerId`
- `externalActionRequired`
- `externalActionType`
- `zeroTimeConfirmed`

State, ownership, revision, submission timestamps, idempotency, decision, and audit fields are server-controlled.

## Workflow DTO

The workflow response contains safe task/case/client identifiers, safe user summaries, active draft, ordered revisions, latest submitted revision, current reviewer, document metadata, time summaries, readiness codes, and actor-specific permitted actions.

It excludes document bodies, extracted text, `workspaceText`, storage paths, SharePoint/provider identifiers, email bodies, raw audit payloads, and raw Prisma objects.

## Readiness Codes

- `WORK_SUMMARY_REQUIRED`
- `REVIEW_ATTENTION_REQUIRED`
- `REVIEWER_REQUIRED`
- `REVIEWER_INELIGIBLE`
- `SELF_REVIEW_NOT_ALLOWED`
- `OUTPUT_REQUIRED`
- `TIME_ENTRY_OR_ZERO_CONFIRMATION_REQUIRED`
- `TASK_STATE_NOT_SUBMITTABLE`
- `SUBMISSION_NOT_DRAFT`
- `DOCUMENT_SCOPE_INVALID`
- `TIME_ENTRY_SCOPE_INVALID`

`ZERO_TIME_CONFIRMED` is a warning, not a blocker.

## Error Contract

Errors use `{ status, code, message }`. Expected codes include `TASK_NOT_FOUND`, `TASK_SUBMISSION_NOT_FOUND`, `TASK_SUBMISSION_ALREADY_SUBMITTED`, `TASK_SUBMISSION_STATE_CONFLICT`, `TASK_SUBMISSION_SUBMIT_FORBIDDEN`, `REVIEWER_INELIGIBLE`, `SELF_REVIEW_NOT_ALLOWED`, `DOCUMENT_NOT_FOUND`, `TIME_ENTRY_NOT_FOUND`, `TIME_ENTRY_ALREADY_SUBMITTED`, `HANDOFF_NOT_READY`, `IDEMPOTENCY_KEY_REQUIRED`, and `IDEMPOTENCY_KEY_REUSED`.

Unexpected failures map to `500 TASK_SUBMISSION_INTERNAL_ERROR` without stacks or database details. The route log is content-free and does not copy the underlying exception message.
