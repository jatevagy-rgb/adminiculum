# Task Lifecycle Authorization Model

Date: 2026-07-18
Status: design only; authentication implementation unchanged

## Security Objectives

- Every submission is scoped through its task and case/matter.
- Guessed task, submission, document, review, or time-entry IDs do not reveal hidden existence.
- Draft ownership, submission authority, and review authority are separate.
- Self-review is denied by default.
- No Client Portal, external reviewer, public API, Outlook/Graph, AI, or connector actor receives access through this model.
- Content-bearing fields never enter authorization logs or safe error responses.

## Existing Actors

| Actor | Existing evidence | Design interpretation |
| --- | --- | --- |
| Task assignee | `Task.assignedToId` | Worker eligible to start work and prepare/submit the active draft. |
| Task assignment supervisor | `Task.assignedById` | Assignment actor; not automatically the creator and not automatically a reviewer. |
| Case responsible lawyer | `Case.assignedLawyerId` | Primary matter reviewer candidate. |
| Case creator | `Case.createdById` | Case-level participant; not automatically allowed to review every submission. |
| Case collaborator | `CaseCollaborator` | Internal participant; capabilities depend on explicit role/policy, not mere membership. |
| Assigned reviewer | proposed `TaskSubmission.assignedReviewerId` | Reviewer selected for one revision. |
| Admin/partner | `UserRole.ADMIN|PARTNER` | Broad internal administration, subject to self-review and audit policy. |
| Submission preparer | proposed `TaskSubmission.preparedById` | Draft owner. |
| Submitter | proposed `TaskSubmission.submittedById` | Actor freezing the immutable revision. |

`UserRole.CLIENT` is not a Client Portal authorization model and receives no access here.

## Auth-First Lookup Order

1. Authentication middleware validates the internal token. Missing/invalid auth returns `401` before resource queries.
2. Load the task through a scoped query that combines task ID with authorized case/task participation.
3. If no scoped task is found, return `404 TASK_NOT_FOUND`; do not reveal whether the ID exists outside the actor's scope.
4. Load the submission through `(submissionId, taskId)` and the already-scoped task. Missing/mismatched nested resources return `404 SUBMISSION_NOT_FOUND`.
5. Load linked document/version/time entry through the same authorized case/task context. A cross-case or inaccessible ID returns a safe `404` rather than confirming existence.
6. After visibility is established, evaluate operation-specific role/ownership. Return `403` for a visible resource when the actor lacks the action capability.
7. Evaluate transition state and optimistic concurrency last. Return `409` for conflicts.

## Recommended Permission Matrix

Legend: `Y` allowed by default, `C` conditional on explicit assignment/policy, `N` denied.

| Operation | Assignee/preparer | Assignment supervisor | Case responsible lawyer | Collaborator | Assigned reviewer | Admin/partner |
| --- | --- | --- | --- | --- | --- | --- |
| Read task workflow | Y | Y | Y | C: case participant | Y | Y |
| Read mutable draft | Y | C | Y | N by default | C: only after submission | Y |
| Edit draft | Y | N | C: emergency takeover policy | N | N | C: audited override |
| Link document/version | Y | N | C | N | N | C |
| Link own task time entry | Y | N | N | N | N | C |
| Submit revision | Y | N | C: only if also eligible worker | N | N | C: audited override |
| Read submitted revision | Y | Y | Y | C: explicit need-to-know | Y | Y |
| Approve/return | N | C: human decision | Y if eligible | N unless explicit reviewer | Y | Y, except self-review by default |
| Create revised draft | Y | N | C | N | N | C |
| Record external completion | N by default | C | Y | N | C | Y |
| Cancel draft | Y | N | C | N | N | C |
| Delete submitted history | N | N | N | N | N | N |

## Operation Rules

### Start Task

- Assigned worker only by default.
- Unassigned work is not silently self-claimed.
- `startedById` and `startedAt` are written with the task transition and audit event.

### Prepare And Edit Draft

- Only `DRAFT` is mutable.
- The preparer must be the task assignee unless a separately approved takeover policy applies.
- Ordinary collaborators cannot inspect draft text merely because they participate in the case.
- Document links are validated against the task case and the actor's document access.

### Submit

- Submitter must be an eligible worker and normally equals the preparer/assignee.
- Submission freezes work summary, remaining issues, note to reviewer, text outcome, document links, version links, attention, and time links.
- Reviewer assignment is checked for same-case access and reviewer eligibility.
- The assigned reviewer cannot equal the submitter.

### Review

- Reviewer must be the assigned reviewer when assignment is mandatory.
- Without mandatory assignment, the case responsible lawyer or approved reviewer-role participant may claim/open review according to product policy.
- Reviewer must have matter access independently of the submission ID.
- Submitter/preparer cannot review the same revision.
- Task assignee cannot review their own revision even if their global role is lawyer/admin.

### Return

- Requires reviewer note and requested corrections.
- Only the reviewer decision row receives review content.
- Prior revision remains readable and immutable.
- The submitter receives an internal content-minimal notification with a link, not the correction text.

### Approve

- Requires review-detail context and an eligible reviewer.
- Approval from a task-list row is not supported.
- Approval either closes the task or sets the approved external-action branch according to the approved policy.

### External Completion

- Allowed only for an approved submission with `externalActionType != NONE` and no existing completion timestamp.
- Default actors: case responsible lawyer or admin/partner; assigned reviewer may be allowed by human decision.
- Store only actor, timestamp, action type, and bounded external reference.
- This route records an already completed real-world action; it does not send email, file electronically, sign, or call providers.

## Cross-Resource Invariants

- `TaskSubmission.taskId` determines the case/matter scope.
- Linked `Document.caseId` must equal `Task.caseId`.
- `DocumentVersion.documentId` must equal the linked document.
- Linked `TimeEntry.taskId` must equal the submission task.
- If both task and case have `matterId`, `TimeEntry.matterId` must match it.
- A task without a usable `matterId` cannot accept task-linked time until a safe matter resolution rule is approved.
- Communication links remain those already present on the task; no communication body is copied.

These invariants require transactional service checks and database integration tests. Guessed IDs are never validated with an unscoped `findUnique` followed by a revealing error.

## Safe Errors

| HTTP | Code | Meaning |
| --- | --- | --- |
| 401 | `NOT_AUTHENTICATED` | Internal auth missing/invalid. |
| 404 | `TASK_NOT_FOUND` | Task absent or outside visible scope. |
| 404 | `SUBMISSION_NOT_FOUND` | Submission absent, mismatched, or hidden. |
| 404 | `DOCUMENT_NOT_FOUND` | Document/version absent or inaccessible. |
| 404 | `TIME_ENTRY_NOT_FOUND` | Time entry absent or inaccessible. |
| 403 | `TASK_ACTION_FORBIDDEN` | Visible task, forbidden action. |
| 403 | `SUBMISSION_WRITE_FORBIDDEN` | Draft write not allowed. |
| 403 | `REVIEW_FORBIDDEN` | Actor not an eligible reviewer. |
| 403 | `SELF_REVIEW_FORBIDDEN` | Reviewer equals submitter/assignee under policy. |
| 409 | `TASK_TRANSITION_CONFLICT` | Task state changed or incompatible. |
| 409 | `SUBMISSION_TRANSITION_CONFLICT` | Revision state changed or incompatible. |
| 409 | `SUBMISSION_ALREADY_DECIDED` | Immutable final decision exists. |
| 409 | `IDEMPOTENCY_KEY_REUSED` | Key belongs to a different operation/payload. |
| 400 | `SUBMISSION_PREREQUISITES_MISSING` | Required Leadás inputs are incomplete. |
| 400 | `CROSS_CASE_LINK_FORBIDDEN` | Safe generic validation failure after scoped checks. |

## Content And Logging Rules

Authorization and error logs may include only:

- actor ID;
- task/submission/document/time-entry IDs;
- route/action;
- allow/deny result;
- safe error code;
- status enum and timestamp.

Never log work summary, remaining issues, note to reviewer, reviewer note, requested corrections, text outcome, time description, document body, email body, workspace text, path, token, or secret.

## Human Policy Decisions

- Whether `assignedById` may review when not the preparer/assignee.
- Whether admin may review any non-self revision.
- Whether reviewer assignment is mandatory before submit.
- Whether case collaborators can receive an explicit reviewer capability.
- Whether emergency draft takeover is permitted and how it is audited.
- Who may record external completion.

Until decided, use the conservative matrix above and keep runtime disabled.

Classification: `TASK_LIFECYCLE_SCHEMA_DESIGN_READY_FOR_HUMAN_APPROVAL`
