# Workflow Core Responsibility / Workload / Time 1

## Goal
Connect case responsibility, staffing, operational workload, and manual time-entry workflows into one internal lawyer workflow loop.

## Implemented Scope
- Case responsibility endpoint: `GET /api/v1/cases/:caseId/responsibility`.
- Workload endpoint: `GET /api/v1/workload?scope=MY_WORK|MY_CASES|TEAM`.
- Case assignment mutation now requires case-manage access.
- Task reassignment now requires task access and a real case-team assignee.
- Time-entry writes use authenticated user ownership and reject unsupported task/document/communication links.
- Frontend adds `/workload` and a compact Case Detail responsibility/time strip.
- Dashboard adds a quiet quick-open link to workload.

## Non-Goals
- No active timers, passive tracking, employee ranking, AI staffing, utilization scoring, external calendar/Teams/email sync, Client Portal exposure, schema change, migration, DB operation, or deployment.

## User Experience
The workflow remains case-centered: Dashboard → Case Detail → Tasks / Workload / Time Entries. The UI presents operational counts and clear links only where existing persisted IDs support them.

## Related: WORKFLOW-CORE-LITIGATION-CASE-LIFECYCLE-1

The litigation & case-lifecycle package builds on this module. It adds the canonical case-lifecycle contract (`GET /cases/:id/lifecycle`, close/reopen/archive) and the read-only litigation dossier (`GET /cases/:id/litigation-dossier`), and reuses this module's contracts rather than duplicating them. See `docs/workflow-core-litigation-case-lifecycle-1.md`.
