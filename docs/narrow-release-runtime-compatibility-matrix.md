# Narrow Release Runtime Compatibility Matrix

Date: 2026-07-15
Branch: `release/editor-ops-workflow-1`
Deployment action: none

| Area | Frontend dependency | Backend route/service included | Status |
| --- | --- | --- | --- |
| cases | Case Detail, Dashboard, workflow graph/summary | `/api/v1/cases`, workflow summary/work items/activity/lifecycle helpers | Covered |
| tasks | `/tasks`, Case Detail handoff | `/api/v1/tasks`, transition/source-linked task service | Covered |
| work-items | Case Detail next-work panel | case work-items helpers under cases module | Covered |
| activity | Case activity timeline | case activity service | Covered |
| agenda | Dashboard/Case Detail deadline agenda | `/api/v1/agenda` | Covered |
| deadlines | `/deadlines` cleanup | agenda/deadline service | Covered |
| workload | `/workload`, Dashboard workload cues | `/api/v1/workload` responsibility module | Covered |
| time entries | `/time-entries` cleanup | `/api/v1/time-entries` updates | Covered |
| lifecycle | Case Detail/litigation lifecycle controls | case lifecycle service/routes | Covered |
| litigation | `/litigation-workspace` | litigation dossier service | Covered |
| intake | `/intake`, intake readiness panel | `/api/v1/intake`, client lookup/intake services | Covered |
| editor metadata | `/documents/[documentId]/edit`, editor lab | `/api/v1/documents/:id/editor` metadata only | Covered, Mode C only |
| comments | editor document-level comments | `/api/v1/documents/:id/comments` list/create/resolve/reopen | Covered; no anchored comments |
| template capabilities | editor side panel | `/api/v1/contracts/editor-template-capabilities` | Covered; generation remains gated |
| clause-library state | `/clause-library` truthful cleanup | no DB-backed clause library required | Covered by unavailable/empty-state UI |

## Compatibility notes

- Frontend calls introduced by the release have matching backend routes or truthful unavailable states.
- Editor content persistence is not introduced; metadata and comments are separate from editor document JSON persistence.
- Contract generation remains disabled unless future storage/retention gates are explicitly enabled outside this release.
