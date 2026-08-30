# Capability register

## Deep-pass semantic splits

The document/review family is intentionally not one capability:
`DOCUMENT_UPLOAD`, `DOCUMENT_VERSION`, `DOCUMENT_DIFF`, `DOCUMENT_REVIEW`,
`ANNOTATION`, `DECISION`, `APPROVAL`, `PUBLICATION`, and
`CLIENT_EXPLANATION` have different owners, persistence, authorization, and
connectivity breakpoints. The same rule is applied to portal
identity/workspace/grant, communication import/association/case creation, and
Work Package template/snapshot/runtime/task creation.

| Key | Capability | Canonical evidence | Historical/recovery evidence | Status |
|---|---|---|---|---|
| CASE_CREATE | Case creation/intake | `Backend/src/modules/cases/intakeCreate.service.ts`, `cases/routes.ts` | `2729450`, PR98 branch | CANONICAL_CURRENT; ACTIVE_RECOVERY; PARTIALLY_CONNECTED |
| CASE_OVERVIEW | Case overview/cockpit | `Frontend/src/app/cases/[caseId]/page.tsx`, `ad065f5` | `fb8c9bb`, `9db0739` | CANONICAL_CURRENT; FULLY_CONNECTED |
| CASE_ATTENTION | Attention/next action | `Backend/src/modules/cases/attention.service.ts` | `aedf22e`, PR70 | CANONICAL_CURRENT; LIVE_UNPROVEN |
| CASE_TYPE | Case type selection | `Backend/src/modules/cases/services.ts` | PR98 branch | ACTIVE_RECOVERY |
| WORK_PACKAGE_TEMPLATE | Work Package definitions | `Backend/src/modules/work-package-admin/service.ts` | `f8e91d4`, PR82 | CANONICAL_CURRENT; DUPLICATE |
| WORK_PACKAGE_RUNTIME | Operational runtime | `Backend/src/modules/cases/caseWorkPackage.service.ts` | PR96 branch | ACTIVE_RECOVERY; STACKED_RECOVERY |
| DOCUMENT_UPLOAD | Secure document upload | `Backend/src/modules/upload-security/uploadValidationCore.ts`, documents routes | `8f34837`, PR68 | CANONICAL_CURRENT |
| DOCUMENT_VERSION | Immutable versions | `Backend/src/modules/documents`, `DocumentVersion` schema | `ce55a80` | CANONICAL_CURRENT; FULLY_CONNECTED |
| DOCUMENT_COMPARISON | Metadata comparison surface | `Backend/src/modules/documents/comparison/*`, `/documents/compare` | PR94 / `509412d` | CANONICAL_CURRENT; PARTIALLY_CONNECTED |
| DOCX_EXTRACTION | DOCX text extraction | recovery-line extractor | `509412d` | ACTIVE_RECOVERY; BACKEND_ONLY |
| PDF_EXTRACTION | PDF text extraction | recovery-line extractor | PR94 | ACTIVE_RECOVERY; BACKEND_ONLY |
| DOCUMENT_REVIEW | Review lifecycle | `Backend/src/modules/documents/review/*`, review routes | `d1d8fd6`, PR? | CANONICAL_CURRENT |
| ANNOTATION | Anchored annotations | `Backend/src/modules/documents/annotations.*` | `7c9a23e` | CANONICAL_CURRENT |
| CLIENT_PUBLICATION | Customer-safe publication | `Backend/src/modules/client-publication/*` | `2975942`, `cefb906` | CANONICAL_CURRENT |
| INDIVIDUAL_PORTAL | Individual customer portal | `Frontend/src/app/portal/*`, client portal modules | `d72e6ca`, PR92 lineage | CANONICAL_CURRENT |
| ORGANIZATION_PORTAL | Organization portal | `Frontend/src/app/portal/szervezeti-attekintes`, client workspace | PR72/79 lineage | CANONICAL_CURRENT |
| PORTAL_MEMBERSHIP | Identity/membership/grants | `Backend/src/modules/client-identity/*`, portal routes | `9809c4c`, `35ca0e6` | CANONICAL_CURRENT; SECURITY_SENSITIVE |
| COMMUNICATION_INBOX | Workforce communications | `Frontend/src/app/communications`, communications routes | `874933a`, PR80/83/85 | CANONICAL_CURRENT; DUPLICATE |
| OUTLOOK_SYNC | Graph inbound sync | `Backend/src/modules/communications/outlookGraphLive.ts` | PR95/`dbf229e` | CANONICAL_CURRENT; LIVE_UNPROVEN |
| COMMUNICATION_CREATE_CASE | Communication → case | communications routes | PR95 | CANONICAL_CURRENT; PARTIALLY_CONNECTED |
| THREAD_ASSOCIATION | Communication/case linkage | outlook import and communication models | PR95; historical intake | CANONICAL_CURRENT |
| TASK_REVIEW | Task submission/review | `Backend/src/modules/tasks/taskSubmission.*`, review decision | `4cbe4ee`, `3634cb5` | CANONICAL_CURRENT |
| AGENDA | Deadlines/calendar | `Backend/src/modules/agenda/*`, `/calendar`, `/deadlines` | `10e1bd3` | CANONICAL_CURRENT; PARTIALLY_CONNECTED |
| TIME_ENTRY | Time tracking | `Backend/src/modules/timesheet-reports`, `/time-entries` | `d49d410` | CANONICAL_CURRENT |
| WORKLOAD | Workload/capacity | `/workload`, dashboard read models | `5f7ec2c`, capacity branches | CANONICAL_CURRENT; PARTIALLY_CONNECTED |
| COMPLIANCE | Fact→rule→finding→proposal | `Backend/src/modules/compliance/*`, org UI | PR42, PR74, Phase 6/7 branches | CANONICAL_CURRENT |
| ANONYMIZATION | Anonymize/rehydrate | `Backend/src/modules/anonymize/*`, modal components | `b3db2b2`, SEC-0B1 | CANONICAL_CURRENT; SECURITY_SENSITIVE |
| LEGAL_ANALYSIS | Legal analysis intake | `Backend/src/modules/legal-analyses`, document workspace panel | `2570a49` | CANONICAL_CURRENT; BACKEND_ONLY |
| CLAUSE_LIBRARY | Clause catalog/insert | clause routes/service, generation workspace | `e611e55` | CANONICAL_CURRENT; PARTIALLY_CONNECTED |
| HANDOFF_PACKAGE | Lawyer handoff/export | handoff routes/service, case UI | `778105e` | CANONICAL_CURRENT; BACKEND_ONLY |
| SEARCH | Document search/classification | API client and backend services | historical document generations | BACKEND_ONLY; UNREACHABLE_UI |
| BILLING | Billing/export | roadmap references only | no safe implementation proven | TRUE_GREENFIELD; DO_NOT_INVENT |

Status labels are non-exclusive. Exact edge evidence is in `graph/edges.csv`.
