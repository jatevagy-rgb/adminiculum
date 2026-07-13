# Workflow Core Responsibility / Workload / Time Data Source Audit

## Summary
WORKFLOW-CORE-RESPONSIBILITY-WORKLOAD-TIME-1 uses only existing internal persistence. No Prisma schema, migration, DB, Azure, Client Portal, Outlook, AI, n8n, calendar, Teams, or external connector change is part of this pass.

## Existing Sources Used
- `Case.assignedLawyerId`, `Case.createdById`, `Case.matterId`, `Case.deadline` for responsibility and supported case-time availability.
- `CaseCollaborator` for internal case team membership.
- `Task.assignedToId`, `Task.assignedById`, `Task.status`, `Task.dueDate`, `Task.priority` for operational workload counts.
- `TimeEntry.matterId`, `TimeEntry.userId`, `TimeEntry.minutes`, `TimeEntry.workDate` for manual fixed-duration time summaries.
- `Matter.id` only as the persisted bridge between case and time entries.

## Important Limits Found
- Time entries are matter-based, not task/document/communication based.
- There is no active timer model, passive tracking model, or automatic time capture model.
- `CaseCollaborator` has no persisted `addedById`; the UI must not claim added-by audit.
- `WorkloadRecord` is a manual client workgroup aggregate and is not a per-lawyer workload source.
- Team workload is an internal privileged operational view, not a utilization or performance system.

## Safety Notes
- No `documents.workspaceText` or raw document/communication body content is needed.
- No broad Prisma rows or relation-heavy payloads are exposed by the new contracts.
- No Client Portal user, route, or DTO is part of this implementation.
