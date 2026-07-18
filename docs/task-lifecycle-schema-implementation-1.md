# Task Lifecycle Schema Implementation 1

Date: 2026-07-18
Status: additive schema and migration candidate implemented; no runtime activation

## Executive Summary

The approved task lifecycle foundation is implemented as an additive Prisma schema candidate. It introduces task-owned, versioned Leadás records without changing existing task routes, task services, frontend behavior, `TaskStatus`, legacy `LawyerHandoffPackage`, authentication, Azure configuration, or production data.

The candidate is ready for a later runtime implementation slice. It is not authorization to apply the migration outside a separately approved disposable or production-like verification environment.

## Base And Ancestry

- Design source: `d81a476194f94550ed8c05261a5b69ebca5f22de`.
- Runtime/schema parent: `9a68c57e1a4daed423420dbbd7946a8a9c6b2e48`.
- Official release merge base: `aa5a263721fa7e35e201a4624076c5e545ea296d`.
- Accepted dashboard commit `a607f6e` is an ancestor.
- Parked commit `24bc6c5` is not an ancestor and was not integrated.
- Schema SHA-256 before: `29189294AF55ACD192381D9D1E63EE33CEDA66A93E4F87030F331238D5A0A072`.
- Schema SHA-256 after: `804F30F26DD5E73D9FF26626FB4FBBF2A8BC937F516EFD1EC280BBEA5F868997`.
- Previous migration head: `20260701120000_add_outlook_communication_provider_fields`.

## Existing Compatibility Baseline

- Existing `TaskStatus` values remain exactly: `PENDING`, `IN_PROGRESS`, `SUBMITTED`, `UNDER_REVIEW`, `COMPLETED`, `CANCELLED`, `BLOCKED`, `TODO`, `IN_REVIEW`, `DONE`.
- Existing `Task`, `Document`, `DocumentVersion`, `TimeEntry`, and `LawyerHandoffPackage` rows require no backfill.
- Existing task/review routes and services do not query or expose the new tables.
- Existing case-level `LawyerHandoffPackage` remains a separate model with no inferred task ownership.

## New Models

### `TaskSubmission`

One immutable-capable revision aggregate per task. It persists:

- task ownership and sequential revision number;
- explicit creator, submitter, and assigned reviewer;
- work summary, remaining issues, reviewer-facing note, and requested attention;
- external-action requirement/type and internal completion actor/time;
- zero-time confirmation plus confirming actor/time;
- submit idempotency key;
- self-relation to the prior revision;
- created, submitted, returned, approved, superseded, and external-completion timestamps.

Reviewer assignment is required by the schema. Submission actor, requested attention, and submission time become mandatory through migration checks for non-draft/non-cancelled states.

### `TaskSubmissionDocument`

Typed references to existing `Document` and optional `DocumentVersion` records. It stores no document body, storage path, provider payload, or binary content.

### `TaskReviewDecision`

One final immutable decision per submitted revision. It persists the reviewer, decision, note, requested corrections, full-review flag, correction deadline, and creation time. No update timestamp or mutable latest-state field is introduced.

### `TaskSubmissionTimeEntry`

Freezes existing `TimeEntry` records into one submitted revision. A time entry is unique across submission links, preventing accidental reuse in unrelated revisions.

## Existing Model Changes

- `TimeEntry.taskId` is nullable and indexed.
- `Task` receives only relation backreferences to submissions and time entries.
- `User`, `Document`, and `DocumentVersion` receive relation backreferences.
- No existing field is renamed, removed, made required, or repurposed.

## Enums

- `TaskSubmissionStatus`: `DRAFT`, `SUBMITTED`, `RETURNED`, `APPROVED`, `SUPERSEDED`, `CANCELLED`.
- `ReviewAttentionLevel`: `QUICK_SCAN`, `APPROVAL`, `SIGNATURE`, `EDITING`, `DETAILED_REVIEW`.
- `TaskReviewDecisionType`: `APPROVED`, `RETURNED`.
- `TaskSubmissionDocumentRole`: `PRIMARY_OUTPUT`, `SUPPORTING_DOCUMENT`, `REVIEW_REFERENCE`, `FINAL_OUTPUT`.
- `ExternalActionType`: `CLIENT_SEND`, `SIGNATURE`, `COURT_FILING`, `AUTHORITY_SUBMISSION`, `OTHER`.

Null represents no external action. `AWAITING_EXTERNAL_ACTION` was not added to `TaskStatus`.

## Referential Posture

Every new relation explicitly uses `onDelete: Restrict` and `onUpdate: Cascade`. Legal-history rows therefore block destructive task, document, version, time-entry, or actor deletion rather than disappearing through broad cascades.

## Prisma Formatting Note

Running `prisma format` directly on the repository schema would rewrite substantial pre-existing formatting. The command was therefore executed against an exact temporary copy of the candidate schema. The repository diff remains limited to semantic additions, while `prisma validate` and `prisma generate` ran against the real candidate file.

## Runtime Boundary

No lifecycle service, route, DTO, frontend component, feature flag, OpenAPI path, auth rule, notification behavior, or external integration was added. The new schema is inert until a separately reviewed runtime slice uses it.

## Result

The additive schema candidate is internally consistent, generated-client compatible, and proven on a disposable localhost database. Production migration readiness remains a separate decision.

Classification: `TASK_LIFECYCLE_SCHEMA_CANDIDATE_READY_FOR_RUNTIME_IMPLEMENTATION`
