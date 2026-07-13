# Workflow Core Case Center 1

## Purpose

`WORKFLOW-CORE-CASE-CENTER-1` makes Case Detail the first coherent internal workflow center. The goal is for an attorney to understand, within roughly 30 seconds, what the matter is, what happened recently, what needs attention, what deadline is approaching, which work item is blocked or waiting, and which safe document/communication context matters.

## Current implementation

- Backend read-only endpoint: `GET /api/v1/cases/:caseId/workflow-summary`.
- Frontend Case Detail overview includes a compact Case Center V1 panel headed by `Itt folytasd`.
- The feature is internal-only and uses the existing case read-access boundary.
- No Client Portal surface is touched or enabled.

## Backend contract

The endpoint returns an explicit DTO containing:

- case identity/state metadata;
- deterministic `nextAction` or `null`;
- case-level next deadline;
- task stats;
- latest communication preview-only metadata;
- active document-review metadata when safely derivable;
- responsible lawyer and collaborator names;
- source availability flags.

The implementation uses explicit Prisma `select` statements and bounded query sizes. It does not return raw Prisma records.

## Next-action prioritization

The pure next-action engine ranks normalized candidates deterministically:

1. overdue task assigned to current user;
2. overdue case-level task;
3. handoff review candidate if supplied by a future safe source;
4. document review candidate;
5. personal task due within 48 hours;
6. case deadline due within seven days;
7. blocked item requiring internal action;
8. highest-priority open personal task;
9. highest-priority open case task;
10. `null` when no safe candidates exist.

Explanations are fixed Hungarian templates from safe metadata only. No AI, free-text inference, legal-certainty claim, or client/counterparty/authority guessing is used.

## Frontend hierarchy

The Case Detail overview now shows:

- `Itt folytasd` as the strongest operational panel;
- current operational state: status, waiting data availability, next deadline, responsible lawyer, collaborators;
- work in motion: task counts, active review metadata, handoff availability;
- latest communication preview when available;
- graceful fallbacks when optional sources are unavailable.

## Privacy and data minimization

The endpoint and UI do not expose:

- `documents.workspaceText`;
- raw document text or extracted text;
- raw communication body/content;
- AI prompts/outputs;
- broad JSON payloads;
- Client Portal data or external visibility.

Communication preview uses the safe summary/preview boundary. If no safe preview is available, the UI displays metadata-only copy.

## Unsupported/deferred sources

- Handoff summary is marked unavailable in V1 and not queried.
- Workload records are not queried.
- Time entries are not queried.
- Litigation workspace internals are not queried.
- Dedicated deadline extraction records are not queried; V1 uses only `Case.deadline`.

## Validation

Implemented validation includes:

- pure next-action priority tests;
- route tests for `401`, safe `404`, explicit DTO, bounded select-only queries, no handoff querying, and preview-only communication behavior;
- static privacy guard against forbidden workflow-summary fields, broad `include`, and Client Portal imports;
- full backend and frontend type/build validation.

## Remaining workflow-core work

- Add authenticated visual QA on a real production-like case after deployment approval.
- Decide whether handoff package metadata should become production-compatible for the aggregate.
- Decide whether dedicated deadline records should be reconciled into the case-center contract.
- Consider a focused frontend test harness only if the repo adopts one without new package risk.

## Explicit non-actions

- No schema change.
- No migration.
- No manual DB command/query.
- No Client Portal change or enablement.
- No production deploy.
- No external visibility.

## WORKFLOW-CORE-TASKS-HANDOFF-1 note

The task/handoff workflow layer now has a backend-normalized case work-item contract, capability-derived task action buttons, and structured task transitions using existing production-compatible fields only. No schema, migration, DB command, Client Portal change, or external visibility was introduced. Unsupported recipient-specific handoff acceptance and generic waiting state remain deferred rather than simulated.

## WORKFLOW-CORE-DOCUMENTS-COMMUNICATIONS-1 Extension

The case center workflow now has a safe document/communication companion contract documented in `docs/workflow-core-documents-communications-1.md` and `docs/workflow-core-case-activity-contract.md`. This extension preserves the case-centered posture: internal lawyer activity uses metadata-only document and communication sources, with no client portal exposure and no raw document/communication content.

## Deadline and agenda extension

`WORKFLOW-CORE-DEADLINES-AGENDA-NOTIFICATIONS-1` moves deadline/agenda handling into a canonical backend contract documented in `docs/workflow-core-deadline-agenda-contract.md`. Case Center now uses the shared deadline engine for case deadline urgency and Case Detail also shows a case agenda strip backed by `GET /api/v1/agenda`.

The extension still uses existing production-compatible fields only: `Task.dueDate` and `Case.deadline`. It does not add hearings, reminders, recurrence, external calendar sync, AI date extraction, or legal significance inference.

## Responsibility / Workload / Time Follow-up

WORKFLOW-CORE-RESPONSIBILITY-WORKLOAD-TIME-1 adds the canonical case responsibility DTO and workload entry point. Case Center remains the handoff source; workload/time data is operational and internal-only.
