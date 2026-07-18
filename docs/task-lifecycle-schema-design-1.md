# Task Lifecycle Additive Schema Design 1

Date: 2026-07-18
Source commit: `9a68c57e1a4daed423420dbbd7946a8a9c6b2e48`
Status: documentation-only; no schema, migration, database, runtime, or deployment change

## Executive Summary

The current schema supports task status changes and a separate case-level `LawyerHandoffPackage`, but it cannot persist a task-owned, revision-safe Leadás workflow. The smallest safe design is Option A: add a new `TaskSubmission` aggregate with document links, one immutable review decision per revision, and immutable time-entry links. Existing `LawyerHandoffPackage` rows remain legacy case-level records and are not inferred or backfilled into tasks.

The initial rollout is additive and inert. Existing tasks, handoff packages, documents, time entries, timeline events, notifications, and client-visible behavior remain unchanged until later runtime slices explicitly adopt the new tables.

## Authoritative Lifecycle

Task state, Leadás state, and review decision remain separate:

1. `Task.status=TODO|PENDING` — Teendő.
2. `Task.status=IN_PROGRESS` — Folyamatban; a mutable Leadás draft may exist.
3. `TaskSubmission.status=SUBMITTED` and `Task.status=IN_REVIEW` — Review alatt.
4. Return creates an immutable `TaskReviewDecision(RETURNED)`, sets the submitted revision to `RETURNED`, and moves the task to `IN_PROGRESS`.
5. Resubmission creates a new `TaskSubmission.revisionNumber`; the returned revision is never overwritten.
6. Approval creates an immutable `TaskReviewDecision(APPROVED)` and sets the revision to `APPROVED`.
7. With no external action, approval sets `Task.status=DONE` and `Task.completedAt`.
8. With an approved external action, the recommended design uses `Task.status=AWAITING_EXTERNAL_ACTION` until completion, then closes the task.

The optional `AWAITING_EXTERNAL_ACTION` enum value requires a separate human decision because PostgreSQL enum additions are operationally difficult to reverse.

## Existing Schema Findings

| Existing object | Exact reusable contract | Limits and risks |
| --- | --- | --- |
| `Task` | `status`, `assignedToId`, `assignedById`, `caseId`, optional `matterId`, scalar `documentId`, `sourceCommunicationId`, `startedAt`, `submittedAt`, `completedAt` | No `startedById`; no submissions relation; `documentId` has no Prisma relation; no external-action state. |
| `TaskStatus` | `PENDING`, `TODO`, `IN_PROGRESS`, `SUBMITTED`, `UNDER_REVIEW`, `IN_REVIEW`, `BLOCKED`, `COMPLETED`, `DONE`, `CANCELLED` | No truthful external-action-pending value. Returned state can be derived from the latest submission while the task resumes `IN_PROGRESS`. |
| `Case` | Owns tasks, documents, timeline events, comments, and case-level handoff packages | `LawyerHandoffPackage` uses `onDelete: Cascade`; this is unsuitable as the default retention rule for task submission history. |
| `Document` | Real case/client ownership and SharePoint metadata; `DocumentVersion` can identify a submitted version | A document ID alone does not freeze the submitted file version. Submitted file outputs should include `documentVersionId` when available. |
| `TimeEntry` | Matter-scoped minutes, user, billable flag, work date, description | No `taskId`, submission link, or idempotency key. Current route rejects task/document/communication context. Delete is currently allowed for the owner/admin. |
| `LawyerHandoffPackage` | Case-level draft/submission/latest review fields | No task relation, revision chain, typed document FKs, user FKs, immutable decision history, requested attention, time link, or external-completion state. |
| `TimelineEvent` | Case-scoped, actor, optional document/time IDs, scalar task ID, content-minimal event types | `taskId` is not a Prisma relation. Add a nullable submission FK and reuse existing event types instead of adding a new audit table. |
| `Comment` | Case/document content | No task relation; must not be overloaded for lifecycle persistence. |
| `Notification` | User-scoped notification with `REVIEW_REQUESTED` and `REVIEW_COMPLETED` types | Reusable without schema change; lifecycle messages must remain content-minimal. |
| `Communication` | Optional case/document links and real `relatedTasks` relation | Existing task-source relation is reusable for display only; communication content must never be copied into submission rows or audit metadata. |
| `User` and roles | Internal actors and task/case relations | No persisted reviewer assignment for submissions. Client Portal roles are not part of this design. |

## Exact Existing Contract Inventory

### `Task` And `TaskStatus`

| Field/relation | Current type/nullability | Relation/delete/index behavior | Runtime usage | Truthful reuse |
| --- | --- | --- | --- | --- |
| `Task.id` | `String`, required UUID PK | Primary key | Route/service lookup | Yes, submission owner FK. |
| `Task.status` | `TaskStatus`, required, default `PENDING` | No status index; current indexes cover complexity/maturity/risk/stuck only | Explicit start/submit/approve/return/block transitions | Yes for task state; do not use as Leadás/review decision. |
| `Task.assignedToId` | `String?` | `User?` relation `AssignedTo`; no explicit delete action/index | Worker capability and own-task filters | Yes, worker identity. |
| `Task.assignedById` | `String?` | `User?` relation `AssignedBy`; no explicit delete action/index | Supervisor/assignment actor and access | Yes as assignment supervisor, not a guaranteed creator/reviewer. |
| `Task.caseId` | `String`, required | `Case` FK; no explicit delete action/index | Primary authorization and task list scope | Yes, authoritative matter/case scope. |
| `Task.matterId` | `String?` | Optional `Matter` FK; no explicit delete action/index | Read DTO; task creation does not consistently populate it | Conditional. Time linking must resolve/validate matter safely. |
| `Task.documentId` | `String?` scalar | No Prisma relation, FK, or index | Source-linked task metadata | Display hint only; not safe submitted-output evidence. |
| `Task.sourceCommunicationId` | `String?` | Real optional `CommunicationTasks` relation; no explicit delete action/index | Communication-created tasks and context link | Yes for existing source context, never for copying content. |
| `Task.startedAt` | `DateTime?` | None | Written by start transition | Yes. |
| `Task.submittedAt` | `DateTime?` compatibility field | None | Written by direct task submit transition | Compatibility only; not proof of a Leadás. |
| `Task.completedAt` | `DateTime?` | None | Written by current approval/complete transition | Yes when task closure is committed atomically with approval/external completion. |
| `Task.assignmentHistory` | `TaskAssignmentHistory[]` | Child task FK uses `onDelete: Cascade` | Reassignment history | Reusable for assignment only, not submission/review history. |
| `TaskStatus` | 10 enum values | PostgreSQL enum | Mixed compatibility values | Reuse existing open/review/done values; consider one isolated external-pending addition only. |

### `TimeEntry`

| Field/relation | Current type/nullability | Relation/delete/index behavior | Runtime usage | Truthful reuse |
| --- | --- | --- | --- | --- |
| `id` | `String`, required UUID PK | Primary key | CRUD and timeline link | Yes. |
| `matterId` | `String`, required | `Matter` FK with `onDelete: Cascade`; index `(matterId,workDate)` | Mandatory time scope and matter totals | Yes, but task/matter equality must be validated. |
| `userId` | `String`, required | `User` FK, no explicit delete action/index | Authenticated owner | Yes. |
| `workType` | `WorkType`, required | Enum | Time classification | Yes. |
| `description` | `String`, required | Content field | User-entered client-friendly description | Yes in authorized detail only; never copy to audit/notification. |
| `minutes` | `Int`, required | None | Matter total updates | Yes. |
| `billable` | `Boolean`, required, default `true` | None | Editable time property | Yes. |
| `workDate` | `DateTime`, required, default now | Indexed with matter | Time list/reporting | Yes. |
| `departmentId` | `String?` | Optional Department FK, no explicit delete action | Optional reporting scope | Unchanged. |
| `timelineEvents` | reverse relation | Timeline FK uses `onDelete: SetNull` | Time logged evidence | Reuse content-minimally. |
| task/submission link | Missing | None | Route explicitly rejects `taskId` | Add nullable task FK plus immutable submission join. |
| idempotency | Missing | None | Create and matter-total update can be retried without duplicate guard | Add nullable per-user key. |

Current create/update/delete routes are not one transaction with `Matter.totalMinutes` and timeline writes. The future task-time slice must correct atomicity without changing unrelated time behavior.

### `LawyerHandoffPackage` Legacy Contract

| Field/relation | Current type/nullability | Relation/delete/index behavior | Runtime usage | Truthful reuse |
| --- | --- | --- | --- | --- |
| `id` | `String`, required UUID PK | Primary key | Legacy route identity | Keep legacy only. |
| `caseId` | `String`, required | Case FK, `onDelete: Cascade`; index with status | Case-level handoff scope | Not safe as task ownership. |
| `status` | `LawyerHandoffStatus`, default `DRAFT` | Index `(caseId,status)` | Mutable case-level lifecycle | Legacy only. |
| `packageType` | required enum, default `STANDARD` | None | Legacy package type | Not needed for task submissions. |
| five artifact IDs | `String?` scalars | No FKs; indexes only source document and legal analysis IDs | Adjacent feature references | Not safe immutable output links. |
| `preparerSummary` | `String?` | Content field | Mutable summary | Semantically similar but legacy case-level. Do not migrate by inference. |
| `preparedById` | `String?` scalar | No user FK/index | Current write authorization | Legacy only; cannot prove submitter. |
| `submittedAt` | `DateTime?` | None | Current submit marker | Legacy only. |
| `reviewedById` | `String?` scalar | No user FK/index | Latest reviewer | Legacy only; no immutable history. |
| `reviewedAt` | `DateTime?` | None | Latest review timestamp | Legacy only. |
| `reviewDecision` | nullable enum | None | Latest mutable decision | Legacy only. |
| `reviewComment` | `String?` | Content field | Latest mutable reviewer note | Legacy only. |

### Supporting Models

| Object | Exact relevant behavior | Reuse decision |
| --- | --- | --- |
| `Case` | Required client, creator; optional responsible lawyer/matter; tasks/documents/timeline/legacy handoffs; legacy handoff child cascades | Use task's case as authorization scope. Do not add duplicate case/client ownership to submissions. |
| `CaseCollaborator` | Unique `(caseId,userId)`, both FKs cascade, role is free-form string | Participation evidence only; reviewer capability needs explicit policy. |
| `Document` | Required case/client FKs without explicit delete action; no task-submission relation | Reuse through restrictive typed link. |
| `DocumentVersion` | Unique `(documentId,version)`; document delete cascades versions | Link optional version; later submission FK must restrict deleting a linked version. |
| `TimelineEvent` | Required case/user optional; document/time FKs `SetNull`; `taskId` and `communicationId` are scalars; index `(caseId,createdAt)` | Add nullable real submission relation/index; keep payload content-minimal. |
| `Comment` | Content plus optional case/document, no task relation | Do not reuse as lifecycle state or review decision. |
| `Notification` | Required user relation, index `(userId,isRead)`, existing review types | Reuse for content-minimal internal links only. |
| `Communication` | Real reverse task relation, optional scalar case/client/document IDs, provider metadata | Reuse existing task source relation only; never copy body/metadata. |
| `UserRole` | Includes internal roles plus `CLIENT` and `EXTERNAL_REVIEWER` | New lifecycle is internal-only; no implicit access for client/external roles. |

## Recommended Additive Model

### New Models

- `TaskSubmission`: one Leadás revision for one task.
- `TaskSubmissionDocument`: typed link to an existing document and optional immutable document version.
- `TaskReviewDecision`: one immutable final decision for one submitted revision.
- `TaskSubmissionTimeEntry`: immutable link between a submitted revision and an existing time entry.

### Existing Model Additions

- `Task.startedById` and relation, nullable.
- `Task.submissions` and `Task.timeEntries` back-relations.
- `TimeEntry.taskId`, nullable.
- `TimeEntry.idempotencyKey`, nullable, unique per user when present.
- `TimelineEvent.taskSubmissionId`, nullable, with an index for content-minimal history lookup.
- Required back-relations on `User`, `Document`, `DocumentVersion`, and `TimelineEvent`.

No existing column or table is renamed, dropped, repurposed, or backfilled.

## Field-Level Draft

### `TaskSubmission`

| Field | Type / nullability | Purpose |
| --- | --- | --- |
| `id` | `String`, UUID, required | Stable revision identifier. |
| `taskId` | `String`, required FK | Owning task. |
| `revisionNumber` | `Int`, required | Monotonic revision within the task. |
| `status` | `TaskSubmissionStatus`, default `DRAFT` | Leadás revision state. |
| `preparedById` | `String`, required FK | Draft owner/preparer. |
| `submittedById` | `String?`, FK | Actor who froze/submitted the revision. |
| `assignedReviewerId` | `String?`, FK | Explicit reviewer assignment if product policy requires it. |
| `supersedesSubmissionId` | `String?`, unique self-FK | Previous returned revision, for sequential history. |
| `workSummary` | `String?` | Short description of completed work; required by submit service. |
| `remainingIssues` | `String?` | Open issues; may explicitly state none. |
| `noteToReviewer` | `String?` | Submitter note, separate from reviewer decision notes. |
| `textOutcome` | `String?` | Bounded text-only result when no file output exists; never a document body. |
| `requestedAttention` | `ReviewAttentionLevel?` | Submitter-selected attention; required at submit if approved by policy. |
| `externalActionType` | `ExternalActionType`, default `NONE` | Approved outbound action category. |
| `externalReference` | `String?` | Bounded receipt/reference only; not a raw storage path or secret. |
| `createdAt`, `updatedAt` | timestamps | Draft lifecycle timestamps. |
| `submittedAt` | `DateTime?` | Freeze time. |
| `returnedAt` | `DateTime?` | Materialized query timestamp for returned decision. |
| `approvedAt` | `DateTime?` | Materialized query timestamp for approval. |
| `cancelledAt` | `DateTime?` | Draft cancellation timestamp. |
| `supersededAt` | `DateTime?` | Set when a later revision is created; prior content remains immutable. |
| `externalCompletedAt` | `DateTime?` | External action completion time. |
| `externalCompletedById` | `String?`, FK | Internal actor recording external completion. |
| `zeroTimeConfirmedAt` | `DateTime?` | Explicit zero-time declaration. |
| `zeroTimeConfirmedById` | `String?`, FK | Actor making the zero-time declaration. |
| `idempotencyKey` | `String?`, unique | Protects the submit operation from retries. |

### `TaskSubmissionDocument`

| Field | Type / nullability | Purpose |
| --- | --- | --- |
| `id` | `String`, UUID, required | Link identifier. |
| `submissionId` | `String`, required FK | Owning Leadás revision. |
| `documentId` | `String`, required FK | Existing document. |
| `documentVersionId` | `String?`, FK | Frozen submitted version where available. |
| `role` | `TaskSubmissionDocumentRole` | `PRIMARY_RESULT` or `SUPPORTING`. |
| `createdAt` | timestamp | Link creation time. |

The submit service must require either at least one valid result document/version or a bounded `textOutcome`.

### `TaskReviewDecision`

| Field | Type / nullability | Purpose |
| --- | --- | --- |
| `id` | `String`, UUID, required | Immutable decision identifier. |
| `submissionId` | `String`, required, unique FK | Exactly one final decision per revision. |
| `reviewerId` | `String`, required FK | Actual reviewing actor. |
| `decision` | `TaskReviewDecisionType` | `APPROVED` or `RETURNED`. |
| `note` | `String?` | Optional approval note; required on return. |
| `requestedCorrections` | `String?` | Required on return; separate from submitter fields. |
| `requiresFullReview` | `Boolean`, default `true` | Whether revised work requires full review. |
| `correctionDeadline` | `DateTime?` | Optional correction deadline. |
| `createdAt` | timestamp | Immutable decision time. |

There is no `updatedAt`; decision rows are append-only and never patched.

### `TaskSubmissionTimeEntry`

| Field | Type / nullability | Purpose |
| --- | --- | --- |
| `id` | `String`, UUID, required | Link identifier. |
| `submissionId` | `String`, required FK | Submitted revision. |
| `timeEntryId` | `String`, required, unique FK | A time entry can be frozen into only one revision. |
| `createdAt` | timestamp | Link creation time. |

## Proposed Enums

```text
TaskSubmissionStatus = DRAFT | SUBMITTED | RETURNED | APPROVED | CANCELLED
ReviewAttentionLevel = QUICK_SCAN | APPROVAL | SIGNATURE | EDITING | DETAILED_REVIEW
TaskReviewDecisionType = APPROVED | RETURNED
TaskSubmissionDocumentRole = PRIMARY_RESULT | SUPPORTING
ExternalActionType = NONE | CLIENT_SEND | SIGNATURE | COURT_FILING | AUTHORITY_SUBMISSION | OTHER
```

`SUPERSEDED` is intentionally not a submission status. A returned revision keeps its returned status and immutable decision; the next revision points to it through `supersedesSubmissionId`, and `supersededAt` is query metadata.

## Relations And Delete Behavior

- `TaskSubmission.task`: `onDelete: Restrict`, `onUpdate: Cascade`.
- All submission actor relations: `onDelete: Restrict`; deactivate users instead of deleting legal-history actors.
- Revision self-relation: `onDelete: Restrict`.
- Submission documents: `onDelete: Restrict` to both submission and document/version.
- Review decision: `onDelete: Restrict` to submission and reviewer.
- Submission time links: `onDelete: Restrict` to both submission and time entry.
- `TimeEntry.task`: `onDelete: Restrict` once task-linked time exists.
- `TimelineEvent.taskSubmission`: `onDelete: Restrict` so audited submissions cannot be removed.
- Existing case-level `LawyerHandoffPackage` cascade behavior is not copied into the new model.

Submitted, returned, and approved revisions are never physically deleted by normal runtime. A draft is cancelled rather than deleted once it has audit history.

## Constraints And Indexes

Prisma-expressible:

- unique `(taskId, revisionNumber)`;
- unique `TaskSubmission.idempotencyKey` when non-null;
- unique `TaskReviewDecision.submissionId`;
- unique `(submissionId, documentId)`;
- unique `TaskSubmissionTimeEntry.timeEntryId`;
- unique `(userId, TimeEntry.idempotencyKey)` when non-null;
- indexes `(taskId, status, createdAt)`, `(assignedReviewerId, status, submittedAt)`, `(submittedById, status, submittedAt)`, `(preparedById, status, updatedAt)`, `(taskId, workDate)`, and `(taskSubmissionId, createdAt)`.

Raw SQL or service enforcement:

- PostgreSQL partial unique index for one active `DRAFT` per task;
- optional same-row check preventing `assignedReviewerId = submittedById`;
- revision allocation concurrency through serializable transaction/retry;
- document/version and task case equality;
- task, time-entry matter, and submission equality;
- immutable submitted content;
- required fields by transition state.

Cross-table matter checks cannot be expressed as ordinary Prisma `CHECK` constraints. They belong in auth-first service transactions with database integration tests; a trigger is not recommended in the first migration.

## Task Status Strategy

| UI task state | `Task.status` | Latest submission state |
| --- | --- | --- |
| Teendő | `TODO` or compatibility `PENDING` | none |
| Folyamatban | `IN_PROGRESS` | none, `DRAFT`, or latest `RETURNED` |
| Review alatt | `IN_REVIEW` | `SUBMITTED` |
| Jóváhagyva / Lezárva | `DONE` | `APPROVED`, external type `NONE` |
| Kiküldésre vár | proposed `AWAITING_EXTERNAL_ACTION` | `APPROVED`, external type not `NONE`, no completion timestamp |
| Lezárva external action után | `DONE` | `APPROVED`, external completion timestamp present |

No `RETURNED` or `APPROVED` TaskStatus is proposed. Those are Leadás/review facts. Only `AWAITING_EXTERNAL_ACTION` is a credible TaskStatus addition, and it must be approved separately.

## Audit And Notification Reuse

Reuse `TimelineEvent` and `Notification` rather than creating duplicate infrastructure:

- add nullable `TimelineEvent.taskSubmissionId`;
- use existing `TASK_STARTED`, `REVIEW_REQUESTED`, `REVIEW_COMPLETED`, `TASK_COMPLETED`, and `CUSTOM` event types;
- use a safe `type` discriminator such as `TASK_SUBMISSION_RETURNED` while metadata contains only IDs, statuses, attention enum, duration totals, and timestamps;
- never include work summary, remaining issues, reviewer notes, text outcome, document body, email body, workspace text, raw path, or secrets in audit/notification content;
- reuse `REVIEW_REQUESTED` and `REVIEW_COMPLETED` notification types with internal links.

## Privacy Boundary

- Submission and review text is privileged, matter-scoped content.
- Document output is referenced by IDs and immutable version ID; no file body or storage path is copied.
- `textOutcome` is bounded and cannot contain a full document body.
- Communication content and AI output are never copied.
- No Client Portal, AI/n8n, Outlook/Graph, public OpenAPI, or external connector exposure is part of this design.
- Retention defaults to preserve submitted revisions and decisions; exact retention requires human/legal approval.

## Recommendation

Approve Option A for a later schema-candidate pass, subject to the human decisions in `docs/task-lifecycle-schema-approval.md`. Do not create a migration until those decisions are recorded and a no-apply Prisma/SQL draft has been reviewed.

Classification: `TASK_LIFECYCLE_SCHEMA_DESIGN_READY_FOR_HUMAN_APPROVAL`
