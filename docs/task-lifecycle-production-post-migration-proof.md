# Task Lifecycle Production Post-Migration Proof

Date: 2026-07-19
Migration head: `20260718120000_add_task_submission_workflow`

## Physical Schema Proof

Read-only PostgreSQL metadata inspection immediately after commit proved:

- tables: `task_submissions`, `task_submission_documents`, `task_review_decisions`, `task_submission_time_entries`;
- enums: `TaskSubmissionStatus`, `ReviewAttentionLevel`, `TaskReviewDecisionType`, `TaskSubmissionDocumentRole`, `ExternalActionType`;
- nullable `time_entries.taskId`;
- 17 expected indexes, including `task_submissions_one_active_draft_per_task_key`;
- 11 expected check constraints;
- 16 expected foreign keys;
- foreign-key actions: `ON DELETE RESTRICT`, `ON UPDATE CASCADE`;
- no unexpected candidate object;
- one successful migration history record with the approved checksum;
- no unfinished migration record.

## Existing Data Compatibility

- Checked row counts for tasks, time entries, and lawyer handoff packages remained unchanged across apply.
- The previously deployed backend stayed healthy and its authenticated read paths remained compatible before the new backend deployment.
- No business content, document body, communication body, client name, matter description, reviewer note, or work summary was queried.
- No seed or synthetic production row was created.

## Schema Diff Limitation

The physical metadata proof above passed. A later read-only `prisma migrate diff` attempt did not execute because the Kudu command environment could not resolve the deployed local Prisma CLI and `npx` rejected a transient Prisma 7 resolution under Node 18. The command exited before connecting through Prisma or producing a diff; no SQL or database mutation occurred. No package or lockfile in the deployed application was changed. A clean DB-to-datamodel diff therefore remains unproven in this ticket.

## Runtime Proof After Backend Deployment

- `/health`: `200`.
- Unauthenticated task and communication reads: `401`.
- Authenticated tasks, review queue, dashboard statistics, cases, agenda, intake, communications, and time entries: `200`.
- Fake task workflow target: safe `404`.
- CORS preflight: `204`, production origin echoed, `Idempotency-Key` and `If-Match` allowed.
- Client Portal: `501 CLIENT_PORTAL_NOT_ENABLED`.
- Outlook import: `501 OUTLOOK_IMPORT_NOT_ENABLED`.
- Contracts: `501 CONTRACTS_NOT_ENABLED`.
- Recent backend container logs contained no matching missing-table, Prisma, unhandled, connection-refused, or CORS-error marker.

The additive production schema remains in place after the later frontend rollback; no destructive database rollback was attempted or required.
