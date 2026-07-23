# Case Workspace Inline Actions - Schema Approval Candidates

This document is an approval candidate only. It does not introduce a Prisma schema change or production migration.

## A. TimeEntry.caseId

- Current model: `TimeEntry` is attributable through `matterId`, optional `taskId`, and optional `userId`; case-level workspace time remains unavailable because matter time cannot honestly be presented as case time.
- Gap: `matterId + taskId` is not enough for legacy matter-direct entries, entries without a task, or future case-scoped work that should aggregate without inferring from a matter.
- Proposed additive field: nullable `caseId String?` on `TimeEntry`, relation to `Case`, and an index on `[caseId, createdAt]`.
- Backfill: populate `caseId` where `taskId` points to a task with a case; for matter-direct rows, backfill only when there is a deterministic one-case mapping, otherwise leave null.
- Future create rule: if `caseId` is supplied with `matterId`, verify the case belongs to the matter; if `taskId` is supplied, verify the task belongs to both supplied `caseId` and `matterId`.
- Aggregation: case workspace sums only rows with exact `caseId`; no fallback to matter-wide totals.
- Authorization: reads follow case read access; writes require the existing time-entry actor rules plus case access verification.
- Migration procedure: additive nullable column, relation, index, backfill in a controlled production-head migration, then API validation release.
- Rollback: stop writing `caseId`, ignore it in projections, and keep/drop the nullable column in a follow-up rollback migration according to production policy.

## B. Document summary/workInstruction

- Current model: document-level `Comment` is for bounded plain-text discussion and resolution state; it is not suitable for a canonical summary or reusable work instruction.
- Proposed additive fields: nullable `summary String?`, `workInstruction String?`, `summaryUpdatedById String?`, `summaryUpdatedAt DateTime?`, `workInstructionUpdatedById String?`, and `workInstructionUpdatedAt DateTime?`.
- Authorization: reads follow document read access; writes require document manage access or an explicit future role rule.
- Audit: create timeline/audit events for field updates without copying sensitive full text into broad activity feeds.
- Retention: summary and instruction live with document metadata and follow document deletion/retention behavior.
- API: expose explicit `PATCH /documents/:id/summary` and `PATCH /documents/:id/work-instruction` endpoints with length limits and plain-text validation.
- UI: surface as document metadata panels, distinct from comments and without pretending selected-text anchoring exists.
- Migration strategy: additive nullable fields first, no destructive backfill, then UI/API rollout.
