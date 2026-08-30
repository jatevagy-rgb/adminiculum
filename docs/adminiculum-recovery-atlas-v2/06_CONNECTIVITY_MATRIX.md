# Connectivity matrix

| Capability | Navigation | UI route/component | API client | HTTP route/auth | Service/domain | Persistence/DTO | Result | Classification |
|---|---|---|---|---|---|---|---|---|
| CASE_OVERVIEW | primary nav → cases | `/cases/[caseId]` | cases API | cases routes + case auth | workspace/cockpit | Case + related reads | rendered cockpit | CONNECTED_END_TO_END |
| CASE_CREATE | cases primary action | `/cases` modal | cases create API | intake/case auth | createCase | Case | new case | PARTIALLY_CONNECTED |
| WORK_PACKAGE_RUNTIME | case workspace context | route exists on recovery | recovery client | PR96 routes | operational service | CaseWorkPackage/Task | not canonical | CONNECTED_CODE_ONLY |
| DOCUMENT_UPLOAD | case documents | `/cases/[caseId]/documents` | document upload | upload security + object auth | storage service | Document/Version | status/list | CONNECTED_END_TO_END |
| DOCUMENT_COMPARISON | documents workspace | `/documents/compare` | comparison client | comparison auth | comparison service | comparison DTO | metadata comparison | PARTIALLY_CONNECTED |
| DOCUMENT_REVIEW | case review | `/cases/[caseId]/review/[documentId]`, `/reviews` | review APIs | review/object auth | review workflow | review entities | review state | CONNECTED_END_TO_END |
| COMMUNICATION_INBOX | primary nav | `/communications` | communications API | workforce + communication auth | communication routes | Communication | list/detail | CONNECTED_END_TO_END |
| OUTLOOK_SYNC | status/sync CTA | communications component | outlook API | Graph gate/config | live adapter | Communication | configured-only status | LIVE_UNPROVEN |
| PORTAL_MEMBERSHIP | portal/admin nav | portal onboarding/admin | identity/grant APIs | portal boundary | membership services | identity/grant | onboarding/grant | CONNECTED_CODE_ONLY |
| COMPLIANCE | organization workspace | client/company routes | compliance APIs | organization scope | evaluator/projections | facts/rules/findings | overview | CONNECTED_END_TO_END |
| SEARCH | search nav/API | `/search` | search method | route evidence | search service | document search | runtime consumer uncertain | BACKEND_NOT_SURFACED |
| HANDOFF_PACKAGE | case/doc context | handoff route/panel | handoff API | case/object auth | handoff service | package entity | download/export | BACKEND_NOT_SURFACED |
| TIME_ENTRY | time nav/case query | `/time-entries` | time APIs | workforce auth | timesheet service | TimeEntry | table/report | PARTIALLY_CONNECTED |

Breakpoints are recorded as graph edges with `ORPHANED_FROM` or `NO_LONGER_REACHABLE_FROM`.
