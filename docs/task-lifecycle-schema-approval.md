# Task Lifecycle Schema Approval Sheet

Date: 2026-07-18
Status: human decision required; this document does not authorize schema editing, migration creation/apply, runtime work, or deployment

## Proposed Decision

Approve Option A: a new task-owned `TaskSubmission` aggregate with sequential immutable revisions. Keep `LawyerHandoffPackage` as a separate legacy case-level model.

## Approval Summary Table

| Area | Proposal | Data impact | Rollback posture | Security impact | Human approval |
| --- | --- | --- | --- | --- | --- |
| Models | Add `TaskSubmission`, `TaskSubmissionDocument`, `TaskReviewDecision`, `TaskSubmissionTimeEntry` | New empty tables; no existing rows changed | Old runtime ignores them | Explicit task/case scoping and immutable history | APPROVE / REJECT / REVISE |
| Task fields | Add nullable `startedById`; relations to submissions/time | Existing tasks remain null/unchanged | Old runtime ignores nullable column | Durable start actor; user deletion restricted/set-null policy | APPROVE / REJECT / REVISE |
| Time fields | Add nullable `taskId`, nullable idempotency key | Existing time remains matter-only | Old runtime remains compatible | Task/matter checks; linked submitted time protected | APPROVE / REJECT / REVISE |
| Audit link | Add nullable `TimelineEvent.taskSubmissionId` | Existing timeline rows unchanged | Old runtime ignores it | Content-minimal submission history | APPROVE / REJECT / REVISE |
| Enums | Add five new submission/review/document/external enums | No existing enum values changed | Unused enums can remain inert | Removes ambiguous strings | APPROVE / REJECT / REVISE |
| TaskStatus | Optional `AWAITING_EXTERNAL_ACTION` in separate migration | Existing rows unchanged | Enum value practically irreversible | Truthful external pending state | APPROVE / REJECT / DEFER |
| Constraints | Unique revisions, decision, links, idempotency; partial active-draft index | Applies only to new/link rows | Preserve constraints after write start | Prevents duplicate/race corruption | APPROVE / REJECT / REVISE |
| Delete behavior | Restrict deletion of task/submission/document/version/time/user history | May block future deletes after links exist | Application rollback only | Preserves legally relevant history | APPROVE / REJECT / REVISE |
| Legacy data | No handoff/task backfill; legacy remains separate | Zero inferred ownership | No conversion to reverse | Avoids cross-matter misclassification | APPROVE / REJECT / REVISE |
| Migration | Additive split, no apply until clone proof | No data mutation/backfill | No destructive down migration | Requires exact clone verification | APPROVE DESIGN / NOT YET |

## Proposed Models

### `TaskSubmission`

Core fields for approval:

- task/revision/status;
- preparer, submitter, assigned reviewer;
- work summary, remaining issues, note to reviewer, bounded text outcome;
- requested attention;
- submission/return/approval/cancel/supersede timestamps;
- sequential self-relation;
- external action type/completion actor/time/reference;
- zero-time confirmation actor/time;
- submit idempotency key.

### `TaskSubmissionDocument`

- submission, document, optional document version, role, timestamp;
- references only; no body/path/storage duplication.

### `TaskReviewDecision`

- unique submission, reviewer, approved/returned decision, note, requested corrections, full-review flag, correction deadline, timestamp;
- immutable; no update timestamp or PATCH route.

### `TaskSubmissionTimeEntry`

- unique time entry linked to one immutable submission revision;
- time entry itself remains a normal matter/task record created before submit.

## Proposed Enums

| Enum | Values | Decision note |
| --- | --- | --- |
| `TaskSubmissionStatus` | `DRAFT`, `SUBMITTED`, `RETURNED`, `APPROVED`, `CANCELLED` | `SUPERSEDED` rejected as status; preserve returned/approved fact. |
| `ReviewAttentionLevel` | `QUICK_SCAN`, `APPROVAL`, `SIGNATURE`, `EDITING`, `DETAILED_REVIEW` | Decide whether mandatory. |
| `TaskReviewDecisionType` | `APPROVED`, `RETURNED` | One final decision per revision. |
| `TaskSubmissionDocumentRole` | `PRIMARY_RESULT`, `SUPPORTING` | Supports multiple documents if approved. |
| `ExternalActionType` | `NONE`, `CLIENT_SEND`, `SIGNATURE`, `COURT_FILING`, `AUTHORITY_SUBMISSION`, `OTHER` | Records required real-world action; performs no integration. |

## Required Human Decisions

Record one decision for every row before schema implementation.

| # | Question | Recommended conservative default | Human decision / notes |
| --- | --- | --- | --- |
| 1 | Can task creator/supervisor review their own task? | No when also assignee, preparer, or submitter; otherwise only if explicitly assigned reviewer. | PENDING |
| 2 | Can Admin review any task? | Yes for accessible internal matters, but never their own submitted revision; audit override. | PENDING |
| 3 | Is reviewer assignment mandatory before submission? | Yes for v1; assigned reviewer must have case access. | PENDING |
| 4 | Is zero recorded time allowed? | Yes only with persisted actor/time confirmation and a non-billable explanation policy outside audit. | PENDING |
| 5 | Can one Leadás contain multiple documents? | Yes; one or more typed links, each optionally pinned to `DocumentVersion`. | PENDING |
| 6 | Parallel Leadások or sequential revisions only? | Sequential only; one active draft per task. | PENDING |
| 7 | Does approval normally close the task? | Yes when `externalActionType=NONE`. | PENDING |
| 8 | Which external actions need separate status? | Use the proposed five categories; disable any unapproved category. | PENDING |
| 9 | Can approved submissions ever be edited? | No. Correction requires a new task or explicit exceptional workflow, never mutation. | PENDING |
| 10 | Retention/deletion period for submissions and reviewer notes? | Preserve indefinitely until formal legal/GDPR retention policy approves disposal. | PENDING |
| 11 | Does legacy case-level Leadás remain separate permanently? | Yes by default; no inferred backfill. | PENDING |
| 12 | Is requested attention mandatory? | Yes at submit; no system-derived value stored as user selection. | PENDING |

## Additional Architecture Decisions

| Decision | Recommendation | Human status |
| --- | --- | --- |
| External pending TaskStatus | Add `AWAITING_EXTERNAL_ACTION` only in isolated Migration 1B after approval. | PENDING |
| Draft emergency takeover | Admin/partner only with explicit audit, or defer from v1. | PENDING |
| Assigned reviewer changes after submit | Disallow in v1; return/cancel and create a new revision if assignment is invalid. | PENDING |
| Document version requirement | Require version ID for file outputs where a version exists; otherwise block submit or use bounded text outcome. | PENDING |
| Time correction after submit | New correcting time entry; never mutate or delete linked submitted time. | PENDING |
| Partial unique scope | One active draft per task, not per user. | PENDING |

## Migration Approval Stages

1. Approve domain decisions in this sheet.
2. Approve a Prisma schema candidate without migration.
3. Approve no-apply Prisma/SQL migration draft.
4. Approve transactional proof on disposable clone.
5. Approve persistent fresh-clone apply and old-runtime compatibility proof.
6. Only then consider production migration planning.

Approval at one stage does not authorize the next stage.

## Security Approval Checklist

- [ ] auth-first scoped lookup order accepted;
- [ ] self-review policy accepted;
- [ ] admin override policy accepted;
- [ ] draft visibility accepted;
- [ ] same-case document and same-matter time invariants accepted;
- [ ] no Client Portal/public API exposure accepted;
- [ ] audit/notification content-minimal rules accepted;
- [ ] immutable submitted/decision/time-link policy accepted;
- [ ] retention policy owner identified.

## Current Gate

Schema implementation is not yet authorized because the human decision cells remain pending. The design is precise enough for product/security review and a later explicit approval response.

Recommended next prompt after decisions are filled:

`Adminiculum — TASK-LIFECYCLE-PRISMA-SCHEMA-CANDIDATE-1 no migration no DB`

Classification: `TASK_LIFECYCLE_SCHEMA_DESIGN_READY_FOR_HUMAN_APPROVAL`
