# Task Submission Review Queue Integration

Date: 2026-07-18

## Source Precedence

`SUBMITTED` `TaskSubmission` rows are the authoritative new review-queue source. Legacy review-status tasks remain as a backward-compatible fallback only when they have no submitted TaskSubmission.

This prevents the same task appearing once as a submission row and again through legacy task-state derivation.

## Visibility

- Assigned internal reviewer sees their submitted, non-self work.
- Admin/Partner may see the broader internal submission queue, but self-submitted rows remain excluded.
- Legacy queue behavior retains its existing task/case participation rules.
- Reviewer assignment does not expose or permit draft editing.

## Safe Queue DTO

Submission-backed items expose:

- `submissionId`, `revisionNumber`, `taskId`, task title/status;
- safe case/client metadata;
- safe submitter/reviewer summaries;
- `submittedAt`, `requestedAttention`, `externalActionRequired`;
- bounded 180-character `workSummaryPreview`;
- output count and linked-time total;
- deterministic `OPEN_REVIEW` action code.

They omit full notes, remaining issues, document names/content, workspace text, storage/provider metadata, and raw Prisma relations.

## Compatibility Proof

- Queue route/service focused tests pass.
- Submission-backed and legacy records sort together by submission date.
- Real PostgreSQL proof produced exactly one queue row for the successful submitted revision.
- Existing legacy handoff and task-derived queue tests remain green.

Review approve/return mutations are intentionally absent and require the next separately approved slice.
