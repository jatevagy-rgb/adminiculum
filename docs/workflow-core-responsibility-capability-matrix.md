# Workflow Core Responsibility Capability Matrix

| Capability | Source | Allowed Actors | Notes |
| --- | --- | --- | --- |
| Read case responsibility | existing case read access | admin, partner, responsible lawyer, creator, collaborator | Uses existing case access middleware. |
| Change responsible lawyer | `Case.assignedLawyerId` | admin, partner, current responsible lawyer, creator | Requires case-manage access. |
| Add/remove collaborator | `CaseCollaborator` | same case managers | No role-change endpoint added. |
| Assign/reassign work | `Task.assignedToId` | task actor / case manager / case collaborator, plus role checks | Assignee must already belong to the case team or be privileged. |
| Record time | `TimeEntry` via `Matter` | authenticated case participant with matter-backed case | Manual fixed-duration only. |
| View team workload | workload DTO | admin, partner | Operational view, not performance ranking. |

## Explicitly Unsupported
- Client Portal actors.
- Passive tracking.
- Automatic reassignment.
- AI recommendations or performance scoring.
- External queue/calendar/team signals.
