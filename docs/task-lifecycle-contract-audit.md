# Task Lifecycle Contract Audit

Date: 2026-07-17
Branch: `codex/task-lifecycle-leadas-review-1`

## Conclusion

The current database can persist task transitions and a case-level `LawyerHandoffPackage`, but it cannot truthfully persist the requested task-owned Leadás lifecycle. The full workflow requires an additive schema proposal and clone proof before implementation can continue.

No Prisma schema or migration file was changed during this audit.

## Persisted Contract Matrix

| Required concept | Classification | Current storage | Finding |
| --- | --- | --- | --- |
| Task status | Persisted | `Task.status` / `TaskStatus` | Supports open, in-progress, review, blocked and closed compatibility values. |
| Started time | Persisted | `Task.startedAt` | Written by the explicit start transition. |
| Started by | Missing | None | Timeline actor is available, but there is no durable `startedById` field on the task. |
| Assignee | Persisted | `Task.assignedToId` | Worker identity exists. |
| Leadás draft | Persisted, case-only | `LawyerHandoffPackage.status=DRAFT` | Not linked to a task. |
| Leadás submitted time | Persisted, case-only | `LawyerHandoffPackage.submittedAt` | Not linked to a task or immutable revision. |
| Leadás submitted by | Missing | `preparedById` only | Preparer and submitter are not separate concepts. |
| Submitted output | Partial | `sourceDocumentId`, `generatedContractId` and adjacent IDs | References are case-level strings; there is no task-owned submitted-output contract or text-only outcome field. |
| Work summary | Persisted, case-only | `preparerSummary` | Not task-linked. |
| Remaining issues | Missing | None | Must not be hidden in generic JSON or comments. |
| Recorded time | Persisted, unlinked | `TimeEntry` | Time is matter-scoped; `taskId`, Leadás ID and idempotency key are explicitly unsupported. |
| Requested attention | Missing | None | Current UI attention is derived only and must remain labelled as suggested. |
| Reviewer | Persisted, latest only | `reviewedById` | No requested reviewer or queue assignment exists. |
| Review decision | Persisted, latest only | `reviewDecision` | A later review overwrites the same row. |
| Reviewer note | Persisted, latest only | `reviewComment` | No immutable review revision/history row exists. |
| Returned time | Derivable, ambiguous | `reviewedAt` with rejected decision | No dedicated `returnedAt`; later decisions overwrite it. |
| Approved time | Derivable, ambiguous | `reviewedAt` with approved decision | No dedicated `approvedAt`. |
| Closed time | Persisted | `Task.completedAt` | Written by task approval, but not atomically tied to Leadás approval. |
| External send/submission state | Missing | None | No real sending, filing or signature completion contract exists. |
| Task comments | Missing | `Comment` has no task relation | Generic comments cannot be used as lifecycle persistence. |
| Audit | Partial | `TimelineEvent` | Content-minimal task and handoff events exist, but no immutable task-Leadás revision chain exists. |
| Notifications | Available, unused here | `Notification` | Task/handoff transitions do not create the requested safe notifications. |

## Existing Routes

- `POST /api/v1/tasks/:id/start`
- `POST /api/v1/tasks/:id/submit`
- `POST /api/v1/tasks/:id/complete`
- `GET /api/v1/tasks/review-queue`
- `GET|POST /api/v1/cases/:caseId/handoff-packages`
- `GET|PATCH /api/v1/handoff-packages/:id`
- `POST /api/v1/handoff-packages/:id/review`
- `POST /api/v1/handoff-packages/:id/archive`
- `POST /api/v1/time-entries`

The task submit/complete routes mutate only `Task`; handoff routes mutate only `LawyerHandoffPackage`; time entry creation rejects `taskId`. There is no atomic operation joining these records.

## Minimum Additive Schema Candidate Requiring Approval

The next schema-design prompt should evaluate, not automatically apply:

- nullable `Task.startedById` relation;
- nullable `LawyerHandoffPackage.taskId` relation and task/revision indexes;
- immutable Leadás revisions (`revision`, `supersedesId`) instead of overwriting review results;
- separate `submittedById`, requested `reviewerId`, `remainingIssues`, `requestedAttention`, and optional text-only outcome;
- an explicit submitted-output document relation rather than overloading source fields;
- dedicated returned/approved timestamps;
- optional external-action state only if product-approved;
- nullable `TimeEntry.taskId` and Leadás relation plus an idempotency key or equivalent duplicate guard;
- transaction design for time save + Leadás submit + task review transition + audit.

Existing handoff rows must remain valid through nullable-first additions. No broad backfill assumption is safe.

## Gate

Full implementation, full lifecycle QA, release integration, artifact creation and deployment remain blocked pending explicit schema approval and a separate migration workflow.

Classification: `TASK_LIFECYCLE_SCHEMA_APPROVAL_REQUIRED`
