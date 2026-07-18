# Task Lifecycle Transaction Plan

Date: 2026-07-18
Status: design only

## Transaction Standard

- Use Prisma interactive transactions with PostgreSQL `Serializable` isolation for transition operations.
- Retry bounded serialization conflicts and unique revision races; never retry authorization or validation failures.
- Use compare-and-set predicates on current task/submission status.
- Create state mutation, immutable decision/link rows, audit event, and notification in the same transaction.
- Never perform provider calls, SharePoint writes, document-body reads, email sends, AI calls, or external filing inside these transactions.
- Return a safe DTO only after commit.

## Start Task

### Inputs

`taskId`, authenticated actor.

### Transaction

1. Scoped auth-first task lookup.
2. Confirm actor is assigned worker and status is `TODO|PENDING`.
3. Compare-and-set task to `IN_PROGRESS`, `startedAt=now`, `startedById=actor`.
4. Create content-minimal `TASK_STARTED` timeline event.

### Failure Semantics

- No row updated if auth/state fails.
- Concurrent start updates zero rows and returns `409` after reading current safe state.

## Save Leadás Draft

### Create

1. Scoped task lookup; require `IN_PROGRESS`.
2. Check for active draft.
3. Allocate next `revisionNumber` inside serializable transaction; unique `(taskId,revisionNumber)` is the final guard.
4. For correction, verify `supersedesSubmissionId` is the latest returned revision for the same task.
5. Create draft with `preparedById`.
6. Optionally set prior returned revision `supersededAt` without changing its content/status/decision.
7. Create ID-only draft-created audit event if approved.

### Update

1. Require scoped draft write capability and `status=DRAFT`.
2. Validate `expectedUpdatedAt`.
3. Update only mutable draft fields.
4. Never accept status, actor, decision, revision, or lifecycle timestamps.

### Failure Semantics

- Partial active-draft index prevents two drafts.
- Revision conflicts are retried or returned as safe `409`.

## Link Documents

1. Lock/validate scoped draft.
2. Load document through case-scoped authorization.
3. If `documentVersionId` is supplied, prove it belongs to the document.
4. Create/remove only the link row.
5. Never mutate or delete document/version records.

After submission, link rows are immutable and cannot be removed.

## Link And Finalize Time

### Time Creation

1. Scope task and matter.
2. Validate actor, work date, minutes, work type, billable flag, description.
3. Use `(userId,idempotencyKey)` to return the prior identical create result on retry.
4. Create `TimeEntry` with nullable `taskId` set.
5. Update `Matter.totalMinutes` and create content-minimal time audit in one transaction; the current non-atomic behavior should be replaced in its own runtime slice.

### Submission Freeze

1. Validate selected time entries belong to the task, submitting worker, and matter.
2. Ensure each time entry has no existing submission link.
3. Create immutable `TaskSubmissionTimeEntry` rows.
4. If none are selected, require `zeroTimeConfirmedAt/By` according to approved policy.

Submitted-linked time entries cannot be deleted or moved. Corrections use new time entries linked to the new revision.

## Submit Leadás

### Preconditions

- Scoped eligible worker.
- Task `IN_PROGRESS`; submission `DRAFT`.
- Summary and remaining-issues declaration.
- Reviewer note/attention according to policy.
- Valid assigned reviewer if mandatory.
- Result document/version or bounded text outcome.
- Linked time or explicit zero-time confirmation.
- Same task/case/matter invariants.

### Atomic Operation

1. Lock current task/submission state through compare-and-set strategy.
2. Validate required fields and links.
3. Verify `Idempotency-Key`; return prior result for identical completed request.
4. Create/finalize time links and zero-time actor fields.
5. Set submission `SUBMITTED`, `submittedById`, `submittedAt`, reviewer, and idempotency key.
6. Set task `IN_REVIEW` and compatibility `submittedAt` if retained temporarily.
7. Create `REVIEW_REQUESTED` timeline event with IDs/status/attention/minutes only.
8. Create internal review notification without privileged content.
9. Commit.

### Failure Semantics

Any failed prerequisite, time-link conflict, notification insert, audit insert, or task compare-and-set rolls back the entire operation. A retry with the same key does not duplicate time links, timeline events, or notifications.

## Return Review

### Preconditions

- Scoped eligible reviewer, not submitter/assignee under default policy.
- Submission `SUBMITTED`; task `IN_REVIEW`.
- No decision exists.
- Note and requested corrections are non-empty.

### Atomic Operation

1. Create immutable `TaskReviewDecision(RETURNED)`.
2. Set submission `RETURNED` and `returnedAt`.
3. Set task `IN_PROGRESS`; clear no historical timestamps except task completion if an inconsistent prior value is detected through guarded repair policy.
4. Create content-minimal returned audit event.
5. Notify submitter with an internal link only.

The reviewer note remains in the decision row; it is not copied into timeline or notification text.

## Resubmit

Resubmission never reopens or edits the returned row:

1. Create the next `DRAFT` revision with `supersedesSubmissionId` pointing to the returned revision.
2. Optionally copy safe draft fields and document links explicitly; do not copy review decision fields.
3. Do not reuse old time entries. Correction work receives new entries.
4. Submit the new revision through the ordinary submit transaction.

## Approve

### Preconditions

- Scoped eligible reviewer, no self-review.
- Submission `SUBMITTED`; task `IN_REVIEW`.
- No decision exists.

### Atomic Operation

1. Create immutable `TaskReviewDecision(APPROVED)`.
2. Set submission `APPROVED` and `approvedAt`.
3. If `externalActionType=NONE`, set task `DONE` and `completedAt`.
4. Otherwise set task `AWAITING_EXTERNAL_ACTION` and leave `completedAt` null.
5. Create review-completed audit and, when closed, task-completed audit.
6. Notify submitter without reviewer note content.

## External Completion

1. Scope approved submission and eligible actor.
2. Require real external action type and `externalCompletedAt IS NULL`.
3. Set completion actor/time and bounded reference.
4. Set task `DONE` and `completedAt`.
5. Create ID/action/timestamp-only audit event.

The operation records a completed real-world action. It never performs that action.

## Immutability Boundary

After `DRAFT -> SUBMITTED`, runtime may update only materialized transition metadata:

- submission status;
- returned/approved/external-completion timestamps and actors;
- `supersededAt` when a later revision is created.

It may not update summary, remaining issues, reviewer note, text outcome, attention, document/version links, time links, preparer, submitter, revision, or task ownership.

No general-purpose repository update method should accept both content and transition fields.

## Audit Payload Boundary

Allowed:

- task/submission/document/time-entry/user IDs;
- revision number;
- status/decision/attention/action enums;
- aggregate minutes;
- timestamps.

Forbidden:

- document/workspace/email body;
- summary, remaining issues, reviewer notes, requested corrections, text outcome;
- time-entry description;
- raw path/URL, provider data, tokens, secrets.

## Application Rollback

Old runtime ignores the additive tables/nullable columns. If a new runtime fails after writes begin, deploy the prior runtime, disable new write entry points, and preserve all new rows. Never drop submission tables as an operational rollback.

Classification: `TASK_LIFECYCLE_SCHEMA_DESIGN_READY_FOR_HUMAN_APPROVAL`
