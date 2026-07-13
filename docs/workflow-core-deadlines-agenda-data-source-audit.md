# Workflow Core Deadlines Agenda Data Source Audit

## Purpose

`WORKFLOW-CORE-DEADLINES-AGENDA-NOTIFICATIONS-1` adds an internal deadline/agenda workflow using only production-compatible existing schema fields. This audit records which sources are canonical now and which sources remain unavailable.

## Canonical Sources

| Source | Existing field/table | Used now | Notes |
| --- | --- | --- | --- |
| Task due date | `tasks.dueDate` | Yes | Primary deadline source for assigned work and case agenda items. |
| Task status | `tasks.status` | Yes | Determines open/completed/cancelled deadline status. |
| Task assignment | `tasks.assignedToId`, `tasks.assignedById`, case manager/collaborator access | Yes | Used for capabilities and permissions; no team-wide agenda scope. |
| Case deadline | `cases.deadline` | Yes | Case-scope and my-cases agenda source; not shown in `MY_WORK` unless represented by a task. |
| Case completion/status | `cases.completedAt`, `cases.status` | Yes | Determines case deadline open/completed/cancelled state. |
| Notifications | `notifications` | Read/mark-read only | Explicit DTO mapping; deadline notifications are preview-only in this pass. |
| Timeline | `timeline_events` | Minimal mutation event | Task reschedule writes a content-minimal `DEADLINE_SET` event. |

## Explicitly Not Used

- no dedicated hearing/court-event table;
- no structured reminder table;
- no recurrence model;
- no Outlook, Teams, Microsoft Graph, email, or external calendar sync;
- no AI/provider date extraction;
- no free-text deadline inference;
- no legal significance inference;
- no broad JSON payload exposure;
- no `documents.workspaceText`, raw document text, raw communication body, or AI output.

## Readiness

The agenda can safely support internal lawyer workflow for task due dates and case deadlines. It cannot yet support hearings, reminders, recurrence, court-service semantics, or external calendar notification delivery without a later schema/security design.
