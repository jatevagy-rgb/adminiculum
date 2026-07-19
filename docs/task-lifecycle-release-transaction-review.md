# Task Lifecycle Release Transaction Review

Date: 2026-07-19

## Reviewed Transitions

- draft creation and update;
- document and time-entry linking;
- submit;
- return;
- revise and resubmit;
- approve;
- external-action completion.

## Atomicity

Multi-record state changes run within serializable transactions. Submission/task state, review decisions, links, timeline/audit events, and notifications commit together. A failed transition does not intentionally leave a partial business state.

Review decisions are immutable. Returned revisions remain historical records; revision creates a new draft rather than mutating the submitted snapshot. Approval closes ordinary and zero-time tasks. Approval of an external-action submission keeps the task open until explicit completion metadata is recorded.

## Concurrency And Retry

- Serializable conflicts handle Prisma `P2034` and PostgreSQL `40001` surfaced through `P2010`.
- Row locking protects authoritative transition reads.
- Revision allocation and active-draft uniqueness are reinforced by database constraints.
- Optimistic `reviewVersion` checks reject stale reviewer actions.

## Idempotency

- Receipts and request fingerprints bind operation, task, submission, actor, and payload.
- Deterministic replay returns the prior result without duplicating side effects.
- Reusing a key for a different operation, actor, resource, or payload is rejected.
- Database uniqueness preserves replay behavior across process restarts.

## Browser And Database Proof

Authenticated local double-click tests covered submit, approval, and external completion. Sanitized database verification found exactly one expected timeline event and no duplicate decision/link side effect per operation.

- Ordinary flow: revision 1 returned, revision 2 approved, task completed.
- Zero-time flow: explicit zero-time confirmation approved, task completed.
- External flow: approval left task awaiting external action; explicit completion then closed it.
- Expected notifications were emitted once per revision/decision/completion.

## Decision

No release-blocking transaction or idempotency inconsistency was found. No production write occurred.

Classification: `TASK_LIFECYCLE_RELEASE_INTEGRATED_READY_FOR_PRODUCTION_MIGRATION_APPROVAL`
