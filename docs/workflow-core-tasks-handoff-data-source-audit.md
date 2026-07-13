# Workflow Core Tasks and Handoff Data Source Audit

This audit records the repository evidence used for `WORKFLOW-CORE-TASKS-HANDOFF-1`. It is intentionally conservative: only structured, existing, production-compatible fields are used. No schema change, migration, manual DB query, Client Portal change, or external visibility is part of this package.

| Concept | Existing model/route | Structured fields | Mutation support | Production-compatible? | V1 disposition | Notes |
|---|---|---|---|---|---|---|
| task assignment | `Task`, `/api/v1/tasks`, `task_assignment_history` | `assignedToId`, `assignedById`, `caseId` | create/reassign existing; transition auth uses assignee/assigner/case manager/collaborator | yes | `SUPPORTED_NOW` | Frontend no longer decides capabilities for workbench actions. |
| task status | `Task.status` | `PENDING`, `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `SUBMITTED`, `UNDER_REVIEW`, `DONE`, `COMPLETED`, `BLOCKED`, `CANCELLED` | start/submit/approve/return/block/unblock through matrix | yes | `SUPPORTED_NOW` | No arbitrary status assignment from frontend transition routes. |
| priority | `Task.priority` | `LOW`, `MEDIUM`, `HIGH`, `URGENT` | create existing | yes | `READ_ONLY_ONLY` in work-items | Used for display and ordering, not mutated here. |
| due date | `Task.dueDate`, `Case.deadline` | date fields | task deadline route exists separately; case deadline exists | yes | `SUPPORTED_NOW` read | Work-items derive urgency from task due date only. |
| blocker | `Task.status`, `Task.stuckReason`, `Task.stuckSince` | structured enum + timestamp | block/unblock added | yes | `SUPPORTED_NOW` | No free-text blocker persistence; reason is enum-only. |
| waiting state | `TaskStuckReason.CLIENT_WAITING` only | structured stuck reason | via block action reason | partial | `READ_ONLY_ONLY`/limited | General waiting state is not separately modeled; availability says waiting state is unavailable. |
| review request | task status | `IN_REVIEW`, `SUBMITTED`, `UNDER_REVIEW`, `submittedAt` | submit existing/hardened | yes | `SUPPORTED_NOW` | Task review is status-based, not a separate reviewer model. |
| review approval | task status | review-like status -> `DONE` | complete approved | yes | `SUPPORTED_NOW` | Uses existing task state only. |
| review return | task status | review-like status -> `IN_PROGRESS` | complete rejected | yes | `SUPPORTED_NOW` | No internal review notes are exposed. |
| completion | task status | `DONE`/`COMPLETED`, `completedAt` | approve route | yes | `SUPPORTED_NOW` | Completed items no longer receive active capabilities. |
| handoff creation | `LawyerHandoffPackage`, routes | package ids, metadata refs, summary | existing gated create route | conditional | `READ_ONLY_ONLY` in work-items | Workbench links to handoff page; it does not fabricate recipient acceptance. |
| handoff acceptance | `LawyerHandoffPackage` review | `APPROVED` review decision | existing review route | conditional | `DEFERRED` in workbench actions | Current model has package review, not recipient acceptance. |
| handoff return | `LawyerHandoffPackage` review | `REJECTED_*` decisions | existing review route | conditional | `DEFERRED` in workbench actions | No recipient field exists; no fake return-to-recipient flow. |
| handoff completion | `LawyerHandoffPackage.status` | `APPROVED`, `ARCHIVED` | existing review/archive | conditional | `READ_ONLY_ONLY` | Not transformed into assignment transfer. |
| task-to-case relation | `Task.caseId` | FK | existing | yes | `SUPPORTED_NOW` | Work-items are case-scoped and same case-access guarded. |
| task-to-document relation | `Task.documentId` | document id only | existing create/read | yes | `READ_ONLY_ONLY` | Links are metadata-only; no document text. |
| task-to-communication relation | `Task.sourceCommunicationId` | communication id only | existing communications intake | yes | `READ_ONLY_ONLY` | Links to case communication workspace; no body/content returned. |
| audit | `TimelineEvent` | event type, safe payload ids | existing task timeline writes | yes | `SUPPORTED_NOW` | Payload contains ids/status only, not raw content. |
| notifications | existing notification module | separate notification rows | not used here | not required | `DEFERRED` | No new notification side effect added. |

## No-schema conclusion

The V1 implementation is intentionally smaller than the conceptual workflow. It uses existing task status, blocker enum/timestamp, case access, task assignment, and handoff package metadata. Recipient-specific handoff acceptance, generic waiting states, and separate review assignment require future schema/product decisions and are not simulated.
