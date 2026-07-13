# Workflow Core Tasks and Handoff 1

## Purpose

Connect the internal matter workflow from case summary to actionable task work without opening Client Portal, changing schema, or inventing unsupported workflow states.

## Repository findings

Tasks already have structured assignment, status, priority, due date, blocker reason, blocker timestamp, document link, communication link, and case relation fields. Lawyer handoff packages exist as gated package-review records, but they do not model recipient-specific handoff acceptance.

## Unified work-item contract

Added authenticated read-only `GET /api/v1/cases/:caseId/work-items`. The route uses the same case read boundary as Case Detail, bounded explicit `select` queries, and DTO mapping. It returns task and available handoff package metadata as normalized work items with summary counts, urgency, source links, and backend-derived capabilities.

## Supported task transitions

Supported now:

- `TODO`/`PENDING` -> `IN_PROGRESS` via start.
- `IN_PROGRESS` -> `IN_REVIEW` via submit for review.
- `IN_REVIEW`/`SUBMITTED`/`UNDER_REVIEW` -> `DONE` via approve.
- review state -> `IN_PROGRESS` via return for correction.
- `TODO`/`PENDING`/`IN_PROGRESS` -> `BLOCKED` with structured `TaskStuckReason`.
- `BLOCKED` -> `IN_PROGRESS` via unblock.

Unsupported conceptual states are not simulated.

## Capability model

Capabilities are derived in backend pure functions from current user, task assignment/creator, manager role, case access used by the route, and current structured status. The frontend renders workbench actions only from returned capabilities.

## Handoff integration

The work-item endpoint includes handoff package metadata only when `ENABLE_HANDOFF_PACKAGES` and the repository are available. Recipient acceptance/return is deferred because the current schema has no recipient field. Handoff links route to the existing case handoff page.

## Case Workbench

Case Detail now includes a Case Workbench under the Case Center. It shows open/mine/overdue/review/handoff counts, filters, prioritized work items, safe source links, structured blocker labels, and capability-driven action buttons.

## Global task queue

`/tasks` now loads task rows through the normalized case work-item contract where possible and renders actions from backend capabilities instead of status-only frontend guesses.

## Case Center integration

After a supported task mutation, the frontend refreshes tasks, work-items, and the workflow summary. The next-action engine therefore recomputes from current backend state instead of optimistic frontend state.

## Privacy and security

The DTO excludes `workspaceText`, raw document content, raw communication content, audit payloads, SharePoint paths, AI prompts/outputs, broad JSON payloads, and raw Prisma rows. Work-item queries avoid broad relation includes.

## Unsupported or deferred concepts

- Generic waiting state separate from structured blocker reason.
- Recipient-specific handoff offered/accepted/returned flow.
- Assignment transfer on handoff approval.
- Separate reviewer assignment model.
- Notification side effects.

## Validation

Validation for this checkpoint requires backend Prisma validation, backend TypeScript, backend tests, frontend TypeScript, frontend build, `git diff --check`, and local route smoke.

## Remaining workflow work

Future work may add a recipient-aware handoff model, explicit reviewer assignment, richer audit events, and notification side effects only after schema/security review.

## Explicit non-actions

No schema change, migration, manual DB query, Client Portal change, external visibility, Azure change, OpenAPI/CORS change, package change, Outlook import, or production deployment was performed.
