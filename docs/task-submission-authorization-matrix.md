# Task Submission Authorization Matrix

Date: 2026-07-18

## Reused Authorization Boundary

The slice reuses the existing task/case rule: privileged internal role, task assignee, task assigner, case responsible lawyer, case creator, or case collaborator. The helper was extracted to `taskAuthorization.ts` so the same rule can run through a normal Prisma client or the active transaction client.

Write permissions are narrower than read permissions. Collaborator-only access is read-only. Reviewer assignment never grants draft-edit permission, and self-review remains forbidden for all roles, including Admin.

## Matrix

| Actor | Read workflow | Create/edit draft | Attach document | Attach time | Assign reviewer | Submit | Read submitted review |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Task assignee | Allow | Allow | Allow, same case | Allow, owned + same matter/task | Allow eligible non-self | Allow only from `IN_PROGRESS` | Own history only; cannot review self |
| Task assigner/creator | Allow | Allow unless assigned reviewer | Allow, same case | Own entries; privileged may attach scoped entries | Allow eligible non-self | Deny unless also assignee | Allow when assigned/authorized |
| Case responsible lawyer | Allow | Allow unless assigned reviewer | Allow, same case | Own entries; privileged may attach scoped entries | Allow eligible non-self | Deny unless also assignee | Allow when assigned/authorized |
| Case collaborator | Allow | Deny | Deny | Deny | Deny | Deny | Allow submitted metadata only when case access exists; queue requires assignment |
| Assigned reviewer | Allow | Deny worker draft edits | Deny | Deny | Deny | Deny | Allow assigned submitted revision; self-submitted excluded |
| Admin/Partner | Allow | Allow unless assigned reviewer | Allow, same case | Allow scoped same-matter/task entry | Allow eligible non-self | Only if also task assignee | Broader internal queue, never self-review |
| Unrelated authenticated user | Hidden 404 | Hidden 404 | Hidden 404 | Hidden 404 | Hidden 404 | Hidden 404 | Not visible |

## Resource-Specific Rules

- Document lookup is constrained by both `documentId` and the task `caseId`; a cross-case ID is indistinguishable from a missing ID.
- Time entry lookup requires the task matter, matching or null task attribution, and entry ownership unless the actor is privileged.
- A null `TimeEntry.taskId` may be set to the task only through the explicit attach operation.
- Eligible reviewers must be active internal `ADMIN`, `PARTNER`, `LAWYER`, or `COLLAB_LAWYER` users with task/case participation.
- `CLIENT`, `EXTERNAL_REVIEWER`, portal, and connector actors are never eligible.

## Hidden Resource Ordering

Every route authenticates before ID validation/service access. The service then loads the task and evaluates access before loading task-owned submission resources. Missing and unrelated tasks both return `404 TASK_NOT_FOUND`; errors never include Prisma details or stacks.
