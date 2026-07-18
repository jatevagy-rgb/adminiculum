# Task Lifecycle Additive Migration Plan

Date: 2026-07-18
Status: plan only; no migration file created or applied

## Objectives

- Add the task-owned Leadás foundation without modifying existing records.
- Keep old runtime fully functional while new tables are inert.
- Avoid destructive conversion, guessed backfill, or coupling to Client Portal/AI/provider features.
- Require no-apply SQL review and clone verification before any production consideration.

## Preconditions

1. Human decisions in `docs/task-lifecycle-schema-approval.md` are recorded.
2. Option A is explicitly approved.
3. The current production-compatible Prisma baseline and migration history are proven on a fresh production-like clone.
4. A schema candidate is reviewed before migration generation.
5. No other branch is editing `Backend/prisma/schema.prisma` or the same migration chain.

## Recommended Migration Split

### Migration 1A — Core Submission Foundation

Add only:

- enums `TaskSubmissionStatus`, `ReviewAttentionLevel`, `TaskReviewDecisionType`, `TaskSubmissionDocumentRole`, and `ExternalActionType`;
- tables `task_submissions`, `task_submission_documents`, `task_review_decisions`, and `task_submission_time_entries`;
- nullable `tasks.startedById`;
- nullable `time_entries.taskId` and `time_entries.idempotencyKey`;
- nullable `timeline_events.taskSubmissionId`;
- FKs, uniqueness constraints, ordinary indexes, and the guarded partial active-draft index;
- required Prisma back-relations.

Do not add runtime routes, backfill rows, enable a feature flag, or expose the tables to Client Portal.

### Migration 1B — Optional External Task Status

Only if the human owner approves the optional post-approval branch:

```text
ALTER TYPE "TaskStatus" ADD VALUE 'AWAITING_EXTERNAL_ACTION';
```

Keep this separate because PostgreSQL enum values are difficult to remove safely. If not approved, external-action runtime remains blocked and approval closes the task.

### Runtime Phase 1 — Read Models And Authorization

- Add task workflow read DTOs and scoped queries.
- Keep all existing task and legacy handoff endpoints unchanged.
- New tables remain empty unless later write slices are approved.

### Runtime Phase 2 — New Writes

- Create/edit draft revisions.
- Link existing documents/versions and task time entries.
- Submit through an explicit transaction with idempotency.
- Keep legacy case-level handoff read paths intact.

### Runtime Phase 3 — Review And Closure

- Reviewer queue reads submitted revisions.
- Return/approve creates immutable decisions.
- External completion is enabled only if Migration 1B and product policy are approved.

### Cleanup Migration

Not part of the first release. No existing task, handoff, comment, timeline, time-entry, or document field/table is removed.

## SQL Review Outline

A later no-apply SQL review must verify:

- all statements are additive;
- table and enum names do not collide with deployed objects;
- FK names and index names fit PostgreSQL identifier limits;
- no `DROP`, `RENAME`, data update, broad backfill, or default requiring table rewrite;
- all new text/content fields are nullable;
- new enum-backed fields have safe defaults only where semantically valid;
- partial unique index is guarded and exactly targets active drafts;
- nullable unique-key behavior is understood;
- `onDelete` behavior is conservative.

## Constraints

### Prisma-Generated

- PKs and FKs.
- unique task revision.
- unique submission decision.
- unique submission document.
- unique submission time entry.
- ordinary reviewer/task/time/audit indexes.

### Raw SQL Review

Recommended partial uniqueness:

```sql
CREATE UNIQUE INDEX "task_submissions_one_active_draft_per_task"
ON "task_submissions" ("taskId")
WHERE "status" = 'DRAFT';
```

Optional same-row reviewer protection:

```sql
ALTER TABLE "task_submissions"
ADD CONSTRAINT "task_submissions_reviewer_not_submitter_check"
CHECK (
  "assignedReviewerId" IS NULL
  OR "submittedById" IS NULL
  OR "assignedReviewerId" <> "submittedById"
);
```

Actual reviewer-versus-submitter checks remain mandatory in the service because the decision reviewer is stored in another table.

## No-Backfill Policy

- Existing tasks receive no submission rows.
- Existing `Task.submittedAt` remains compatibility data and is not treated as proof of a Leadás.
- Existing `LawyerHandoffPackage` records remain legacy case-level Leadás records.
- No historical handoff is assigned to a task based only on case, document, timestamps, preparer, or title.
- Existing time entries remain matter-only until a user explicitly links them through future authorized runtime.
- Existing timeline events are not retroactively linked.

## Clone Verification Plan

Before any shared or production apply:

1. Confirm clone identity and production-like baseline.
2. Run Prisma validation without mutating a database.
3. Review generated migration SQL.
4. Execute migration in a transaction and roll back; inspect created enums, columns, tables, constraints, and indexes.
5. Apply persistently to a disposable fresh clone only after transactional proof.
6. Verify `prisma migrate status`, migration metadata, schema shape, and zero business rows in new tables.
7. Run old backend runtime against the migrated clone to prove rollback compatibility.
8. Run new read-only backend against the clone before enabling writes.
9. Dispose of the clone and remove temporary access.

## Production Apply Gate

Production remains blocked until:

- clone migration apply is clean;
- application rollback compatibility is proven;
- authorization and migration integration tests pass;
- no unrelated pending migration would be applied with it;
- a narrow deployment plan and human approval exist.

No `prisma migrate resolve`, `migrate dev`, `db push`, or broad migration deployment is authorized by this plan.

## Rollback

### Before Runtime Writes

Application rollback is trivial: old runtime ignores the new nullable columns/tables. Do not drop them in production merely to reverse a deployment.

### After Runtime Writes

New submission/review/time-link records are legal workflow history. Preserve them and roll back application reads/writes only. A destructive down migration is prohibited.

### Practical Irreversibility

- PostgreSQL enum values cannot be safely removed once used.
- Submitted legal workflow records and review decisions must be retained.
- New FKs may prevent deletion that old runtime previously allowed; this is intentional and must be tested before production.

## Stop Conditions

Stop before migration creation or apply if:

- human decisions remain unresolved;
- deployed object names or migration history differ from the reviewed baseline;
- partial index semantics are unclear;
- existing delete operations fail unexpectedly in clone testing;
- old runtime cannot operate against the additive schema;
- any migration statement mutates existing business data.

Classification: `TASK_LIFECYCLE_SCHEMA_DESIGN_READY_FOR_HUMAN_APPROVAL`
