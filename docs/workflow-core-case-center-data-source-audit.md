# Workflow Core Case Center Data Source Audit

## Purpose

This audit records which existing internal workflow sources are safe to use for `WORKFLOW-CORE-CASE-CENTER-1`. It is implementation documentation only: no schema change, migration, manual DB query, production deploy, Client Portal change, or external visibility is authorized.

## Source matrix

| Source area | Current route/service/model | Safe fields available | Production-compatible? | Used in V1? | Reason |
| --- | --- | --- | --- | --- | --- |
| Case core metadata | `GET /api/v1/cases/:caseId`; `Case` model; `casesService.getCaseById` | `id`, `caseNumber`, `title`, `status`, `clientRole`, `deadline`, `updatedAt`, assigned lawyer id/name | Yes, internal case detail already production-used and guarded by `requireCaseReadAccess` | Yes | Gives matter identity, case state, next case deadline, and responsible lawyer without content exposure. |
| Tasks | `GET /api/v1/tasks?caseId=...`; `Task` model | `id`, `title`, `status`, `priority`, `assignedToId`, `dueDate`, timestamps, `documentId`, stuck metadata | Yes for internal workflow; no Client Portal exposure | Yes | Needed for deterministic next action, task stats, blockers, due-soon/overdue. Description is deliberately not selected. |
| Deadlines | `Case.deadline`; deadline extraction routes exist separately | Case-level `deadline` | Partially production-compatible | Yes, case-level only | Dedicated deadline extraction/data is not used; V1 uses only the already exposed case deadline field. |
| Communications | `GET /api/v1/communications`; `Communication` model | `id`, `subject`, `summary`, `direction`, `createdAt`, attachment/task counts | Yes for authenticated internal read-only baseline | Yes, preview-only | V1 does not select full communication text. `summary` is used as the safest available preview; if absent the UI shows metadata-only copy. |
| Document/review metadata | `GET /api/v1/cases/:caseId/documents`; `Document` model | `id`, `name`, `fileName`, `documentType`, `folder`, `updatedAt` | Metadata is production-used; document text is privacy-sensitive | Yes, metadata-only | V1 uses folder/status as a conservative active-review hint and never selects `workspaceText` or extracted/raw document text. |
| Collaborators | `/cases/:caseId/collaborators`; `CaseCollaborator` model | collaborator id, role, user id/name | Yes after internal authz hardening | Yes | Used only for compact internal responsibility context. |
| Workload | `WorkloadRecord` / workgroup docs and authz tests | workload period/hours/note | Internal but not case-centered for this endpoint | No | Not queried because it is workgroup-oriented and would add noisy aggregation risk to the first case-center V1. |
| Lawyer handoff | `LawyerHandoffPackage` and handoff routes | status, source refs, preparer/reviewer refs | Partially available but adjacent feature gates and migration-history context remain nuanced | No | V1 marks `availability.handoff=false` and does not query handoff packages. This avoids implying handoff is active in the summary. |
| Time entries | `/api/v1/time-entries`; `TimeEntry` model | high-level work descriptions, minutes, dates | Present, but matter/workgroup-oriented | No | Deferred to avoid mixing billing/time reporting with the 30-second operational matter summary. |
| Litigation workspace | Frontend route `/litigation-workspace` | route context from case/document ids | UI route exists; no separate safe aggregate source | No backend query | V1 links only through existing document/case navigation; no litigation internals are queried. |

## Excluded sensitive fields

The workflow summary deliberately does not select or return:

- `documents.workspaceText`;
- raw document text, extracted text, prompts, AI outputs, review comments, or storage paths;
- full communication message text;
- internal notes or broad JSON payloads;
- raw Prisma rows or broad relation trees.

## No-schema conclusion

The Case Center V1 uses existing internal, production-compatible fields only. It adds a read-only aggregate endpoint and frontend summary UI, with no Prisma schema edit, no migration, no manual database command, no Client Portal change, no external visibility, and no production deploy.
