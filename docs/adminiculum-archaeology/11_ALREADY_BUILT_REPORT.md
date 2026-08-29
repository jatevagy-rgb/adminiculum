# 11 — "We Already Built This" Report

> Capabilities where a substantial implementation already exists somewhere, so the roadmap overstates their greenfield nature. Fields: CAPABILITY / BEST_EXISTING_IMPLEMENTATION / LOCATION / QUALITY / ARCHITECTURE_COMPATIBILITY / REUSE_STRATEGY / EXPECTED_RECOVERY_VALUE.

| CAPABILITY | BEST_EXISTING_IMPLEMENTATION | LOCATION | QUALITY | ARCHITECTURE_COMPATIBILITY | REUSE_STRATEGY | EXPECTED_RECOVERY_VALUE |
|---|---|---|---|---|---|---|
| Communications inbox + triage + create-case | Full inbox (`CommunicationWorkspace`) + triage console | `app/notifications/page.tsx`, `app/communications/page.tsx`, `components/communications/CommunicationsOverview.tsx`, `modules/communications/routes.ts` | High (live, real) | Full (single module) | Canonicalize; merge the two inboxes; add the branch-only client-wide read model + case-first context | HIGH |
| Outlook inbound e-mail ingestion | Live app-only Graph reader | `outlookGraphLive.ts`, `outlookImport.service.ts` | High (real Graph, gated) | Full | Enable + harden credentials/delta | HIGH |
| Case→WorkPackage→workflow→tasks | Work-package snapshot + DAG instantiation | `work-package-admin/*`, `caseWorkPackage.service.ts`, `caseWorkflowOrchestration.ts` | High | Full | Reconnect into intake/comm/portal paths | HIGH |
| Matter intake (transactional, typed deadlines, thread-links) | `createCaseIntake` | `cases/intakeCreate.service.ts` | High | Full | Adopt as the base creation path | HIGH |
| Task submission + review lifecycle | TaskSubmission/TaskReviewDecision + workspaces | `modules/tasks/*`, `components/tasks/*` | High | Full | Extend, don't re-build | HIGH |
| Document review lifecycle | DocumentReview/Round/Point/Decision + panel | `modules/documents/review/*`, `DocumentReviewWorkflowPanel.tsx` | High | Full | Surface from case page | HIGH |
| Structured document comparison (typed segments) | diffEngine + ComparisonWorkspace | `modules/comparison/*`, `ComparisonWorkspace.tsx` | High | Full | Replace legacy `app/documents/compare` | HIGH |
| DOCX/PDF text extraction | mammoth + pdf-parse | `textExtractor.ts` (used by anonymize) | High | Full | Wire into comparison resolver → **text-diff** | HIGH |
| Anonymization + rehydration | AnonymizeModal + RehydrateModal + `modules/anonymize/*` | high | High | Full | Keep; do not break the flow | HIGH |
| Clause library (+ usage analytics) | 14-endpoint clause-library | `modules/clause-library/*`, `app/clause-library` | Med | Full | Add standalone page polish | MED |
| Contract generation from 22 DOCX templates | `modules/contracts/*`, `generation-draft/*` | high | Full | Keep | MED |
| Client self-service onboarding + membership request | PortalOnboarding + client-identity workflow | `app/portal/*`, `modules/client-identity/*` | High | Full (ancestor of canonical) | Keep | HIGH |
| Organization hierarchy + authority/access + CASE_RELAY | OrganizationPerson + organizationalAccessPolicy + WorkspaceMode | `client-organization/*`, `client-workspace/*` | High | Full | Keep; connect integration source | MED |
| Client-wide communication read model (fail-closed, no N+1) | `clientSummary.service.ts` | **branch** `peterfi/client-communication-summary-read-model` | High | Full (seamless) | Merge into canonical | HIGH |
| Case-first / client / case-overview communication context | `communicationContext.ts`, `/clients/[clientId]/communications` | **branches** `peterfi/case-first-communication-context`, `peterfi/case-overview-communication-snapshot` | High | Full | Merge into canonical | HIGH |
| Attention category / task attention | task-attention + sharedAttentionCategory | `modules/tasks/attentionCategory.ts`, `lib/shared-attention-category*` | Med | Full | Wire global attention inbox | MED |
| Change reports (document) | getChangeReport/generateChangeReport | `modules/contracts/*` | Med (backend) | Full | Add UI | MED |

## Headline for the executive

**A large majority of the future roadmap is NOT greenfield.** The client/portal/identity core, the task submission/review core, the document review/compare/anonymize/version core, the work-package/workflow core, and the communication core are all already built and mounted at canonical. What is actually missing is a handful of **connections** (case→workpackage on modern paths, case→portal for internal intake, DOCX text-diff, comm-create-case responsible, intake-deadline→agenda) and a small set of **true greenfield** items (persisted thread/unread/reply, outgoing mail, case-level reviewer, billing). Immutable `DocumentVersion` history already works. This materially shortens the roadmap.
