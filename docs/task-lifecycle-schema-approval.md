# Task Lifecycle Schema Approval

Date: 2026-07-18
Status: product decisions approved; schema candidate and first backend runtime slice locally proven

## Approved Direction

Option A is approved and implemented as a schema candidate: a dedicated task-owned `TaskSubmission` aggregate with typed document links, immutable review decisions, frozen time-entry links, and sequential revision history.

`LawyerHandoffPackage` remains permanently separate. No historical handoff row is inferred, converted, or backfilled.

## Approved Product Decisions

| # | Decision | Approved result | Status |
| ---: | --- | --- | --- |
| 1 | Submitter self-review | Forbidden | APPROVED |
| 2 | Admin review scope | Admin may access internal tasks but may not self-review | APPROVED |
| 3 | Reviewer assignment | Mandatory and explicitly persisted before submission | APPROVED |
| 4 | Reviewer suggestion | Responsible matter lawyer may be suggested; persistence is explicit | APPROVED |
| 5 | Zero-time submission | Allowed only with persisted confirmation, actor, and timestamp | APPROVED |
| 6 | Documents per Leadás | Multiple typed document links allowed | APPROVED |
| 7 | Revision concurrency | Sequential revisions only | APPROVED |
| 8 | Active draft count | At most one `DRAFT` per task | APPROVED |
| 9 | Submitted revision mutability | Submitted, returned, approved, and superseded history is immutable in normal runtime | APPROVED |
| 10 | Correction model | New revision; prior revision never overwritten | APPROVED |
| 11 | Requested attention | Mandatory before submission | APPROVED |
| 12 | Approval outcome | Closes task by default | APPROVED |
| 13 | External completion | Stored as explicit submission data only | APPROVED |
| 14 | External action values | Client send, signature, court filing, authority submission, other | APPROVED |
| 15 | Legacy handoff boundary | Permanently separate | APPROVED |
| 16 | Legacy backfill | Forbidden | APPROVED |
| 17 | Retention expiry | No automatic deletion/expiry in this slice | APPROVED |
| 18 | Time attribution | Nullable `TimeEntry.taskId` | APPROVED |
| 19 | Frozen submitted time | Explicit `TaskSubmissionTimeEntry` relation | APPROVED |
| 20 | Existing task states | Reuse current `TaskStatus` values | APPROVED |
| 21 | New external TaskStatus | `AWAITING_EXTERNAL_ACTION` not added | APPROVED |
| 22 | Review state authority | New submission aggregate, not overloaded `TaskStatus` | APPROVED |

## Implemented Schema Decisions

| Area | Candidate implementation | Status |
| --- | --- | --- |
| Models | Four dedicated task-submission models | IMPLEMENTED |
| Enums | Five bounded enums; no `TaskStatus` change | IMPLEMENTED |
| Reviewer | Required `assignedReviewerId`; actor relations restricted | IMPLEMENTED |
| Revisions | Unique task/revision plus self-relation | IMPLEMENTED |
| Active draft | PostgreSQL partial unique index | IMPLEMENTED |
| Idempotency | Nullable globally unique submission key | IMPLEMENTED |
| Documents | Typed document and optional version relations | IMPLEMENTED |
| Review | Unique immutable decision per revision | IMPLEMENTED |
| Time | Nullable task attribution and unique frozen submission link | IMPLEMENTED |
| Delete behavior | Explicit `Restrict`; no legal-history cascade | IMPLEMENTED |
| Legacy records | No data migration or inferred ownership | IMPLEMENTED |

`SUPERSEDED` exists because the implementation prompt requires the enum value. Runtime must not rewrite returned or approved content merely to use that status; the self-relation remains the authoritative revision chain.

## Runtime Decisions Resolved In Backend Slice 1

- draft creation returns the active draft under retry and allocates revisions in a serializable task lock;
- reviewer selection is explicit, persisted, case/task scoped, and never permits self-review;
- document links require the task case and contain metadata only;
- time links require the task matter/context and existing time-entry ownership or privileged access;
- zero-time confirmation persists actor and timestamp;
- workflow/readiness DTOs are explicit and privacy-bounded;
- submit updates submission/task/audit/notification atomically and is idempotent;
- submission-backed queue rows supersede duplicate legacy task derivation.

## Runtime Decisions Still Deferred

The following are not schema blockers but require separate implementation review:

- frontend draft/reviewer-selection UX;
- admin takeover UX/policy beyond existing internal task access;
- document-version pinning UX and explicit version selection;
- external completion mutation and capability rules;
- review return/approve decision mutations;
- feature activation and rollout sequencing.

These items are deliberately `DEFERRED`, not unresolved product decisions and not authorization for runtime implementation beyond the next approved slice.

## Proof Gate

- additive schema validates and generates;
- destructive SQL count is zero;
- disposable localhost migration succeeds;
- 18/18 constraint tests pass;
- full backend suite passes 46/46 suites and 460/460 tests;
- no production/Azure action occurred.

## Current Authorization

The schema candidate and backend draft/submit slice are ready for review-decision implementation review. Production migration, deployment, feature activation, public API exposure, frontend use, and Client Portal use remain unauthorized.

Classification: `TASK_SUBMISSION_BACKEND_READY_FOR_REVIEW_DECISION_SLICE`
