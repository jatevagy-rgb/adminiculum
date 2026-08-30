# Verified recovery candidates

Every candidate below was compared with canonical source and exact reachable history. Compatibility means compatibility with the recovery approach, not permission to merge old code.

## RC-01 - Case and Work Package operational runtime

```text
CAPABILITY_ID=RC-01
PRODUCT_AREA=Case / Work Package
HISTORICAL_SHA=9eec7bfb4985578c5e8bb0c1767f3140d8c8764f
HISTORICAL_PR=PR87 lineage; PR53/64/65/66/67/82 also carry related generations
HISTORICAL_FILES=Backend/src/modules/cases/caseWorkPackage.service.ts; Backend/src/modules/cases/caseWorkflowOrchestration.ts; Backend/src/modules/cases/services.ts; Backend/tests/workPackageCaseCreation.integration.test.ts
CURRENT_EQUIVALENT=Canonical snapshot plus PR96 runtime, PR98 compact creation, PR100 Case Workspace
CURRENT_FILES=Backend/src/modules/cases/services.ts; Backend/src/modules/cases/caseWorkPackage.service.ts; PR96 caseWorkPackageOperational.service.ts; PR98 CompactNewCaseDialog.tsx; PR100 CaseWorkPackagePanel.tsx
HISTORICAL_CAPABILITY=Atomic case snapshot and workflow provenance
CURRENT_CAPABILITY=Canonical already snapshots Work Package; active stack adds requiredness, revision guard, responsible user, safe status transitions, explicit task provenance, compact creation, and workspace operation
WHAT_WAS_LOST=Consistent operational runtime and visible case-workspace control, not the snapshot itself
WHAT_CURRENTLY_EXISTS=Current schema, template admin, atomic snapshot, workflow binding, Task.workPackageItemId
USER_VALUE=One coherent case scope with explicit progress and next work
ARCHITECTURE_COMPATIBLE=YES through current service boundaries
SECURITY_COMPATIBLE=CONDITIONAL on canonical case auth and workforce eligibility
PRODUCT_DIRECTION_COMPATIBLE=YES
RECOVERY_MODE=MERGE_CURRENT_RECOVERY
```

Dependency: PR96 -> PR98 -> PR100. PR96's release-data requiredness inventory must close before canonical merge.

## RC-02 - DOCX/PDF structured comparison

```text
CAPABILITY_ID=RC-02
PRODUCT_AREA=Documents
HISTORICAL_SHA=509412dfc87abe35a764533efe6d133a1ba0b079
HISTORICAL_PR=PR94
HISTORICAL_FILES=Backend/src/modules/documents/textExtractor.ts; Backend/src/modules/documents/comparison/versionText.ts; comparisonService.ts; diffEngine.ts; Backend/tests/documentDocxPdfDiff.test.ts
CURRENT_EQUIVALENT=Canonical metadata/structured comparison boundary plus PR94 extraction recovery
CURRENT_FILES=Backend/src/modules/documents/comparison/*; Frontend/src/app/documents/compare/page.tsx; PR94 extractor and focused tests
HISTORICAL_CAPABILITY=Bounded DOCX/PDF extraction and typed diff segments
CURRENT_CAPABILITY=Authorized comparison exists; canonical extraction is weaker than PR94
WHAT_WAS_LOST=Truthful DOCX/PDF text comparison, not version or review persistence
WHAT_CURRENTLY_EXISTS=DocumentVersion, object authorization, comparison persistence, review, annotation, safe storage failures
USER_VALUE=Compare real Word/PDF versions without replacing Word
ARCHITECTURE_COMPATIBLE=YES
SECURITY_COMPATIBLE=YES at PR94 exact head; preserve object auth and storage boundary
PRODUCT_DIRECTION_COMPATIBLE=YES
RECOVERY_MODE=MERGE_CURRENT_RECOVERY
```

PR94 exact-head Node 20 gate and PostgreSQL revision tests are accepted; worker/bootstrap and decompression hardening remain bounded P2 follow-ups.

## RC-03 - Contextual communication read model

```text
CAPABILITY_ID=RC-03
PRODUCT_AREA=Communications
HISTORICAL_SHA=b36113a9bd0c4dad072fa04e421917f86039cfae
HISTORICAL_PR=Peterfi PR83/PR85 lineage; commit has no direct authoritative PR association
HISTORICAL_FILES=Backend/src/modules/communications/clientSummary.service.ts; Backend/tests/clientCommunicationSummary.integration.test.ts; clientCommunicationSummaryRoutes.test.ts
CURRENT_EQUIVALENT=Canonical communication ledger, global inbox, case communication route, PR95 inbound workbench
CURRENT_FILES=Backend/src/modules/communications/routes.ts; outlookImport.service.ts; Frontend/src/app/communications/page.tsx; Frontend/src/components/communications/CommunicationsOverview.tsx
HISTORICAL_CAPABILITY=Fail-closed dual-link client/case projection, effective timestamps, deterministic order, aggregate counts without N+1
CURRENT_CAPABILITY=Global and case surfaces exist, but contextual client/case composition is split
WHAT_WAS_LOST=One safe contextual projection, not the communication ledger
WHAT_CURRENTLY_EXISTS=Communication persistence, case/client links, Outlook import, route authorization
USER_VALUE=Inbox triage with trustworthy client and case context
ARCHITECTURE_COMPATIBLE=YES as a read model
SECURITY_COMPATIBLE=REQUIRES current exact-case authorization and mismatched dual-link rejection
PRODUCT_DIRECTION_COMPATIBLE=YES
RECOVERY_MODE=SECURITY_REWRITE_AND_REPLAY
```

Do not merge the historical route wholesale. Replay projection/query semantics after PR95 has converged on current canonical.

## RC-04 - Communication to canonical case creation

```text
CAPABILITY_ID=RC-04
PRODUCT_AREA=Communications / Case intake
HISTORICAL_SHA=146539d7116ca90b5ce6086cffe6467ececb6ebe
HISTORICAL_PR=PR95
HISTORICAL_FILES=Backend/src/modules/communications/routes.ts; Backend/src/modules/cases/services.ts; Frontend/src/app/notifications/page.tsx; communicationCreateCase.route.test.ts
CURRENT_EQUIVALENT=Canonical POST /communications/:id/create-case plus canonical casesService.createCase
CURRENT_FILES=Backend/src/modules/communications/routes.ts; Backend/src/modules/cases/services.ts
HISTORICAL_CAPABILITY=Server-owned client scope, canonical workforce assignee validation, delegation to canonical case transaction
CURRENT_CAPABILITY=Route exists but canonical currently accepts request client substitution and manually creates Case/Task
WHAT_WAS_LOST=Safe convergence on the canonical case composer
WHAT_CURRENTLY_EXISTS=Communication ownership, atomic route transaction, canonical case snapshot/workflow service
USER_VALUE=Turn inbound communication into a correctly scoped operational case
ARCHITECTURE_COMPATIBLE=YES
SECURITY_COMPATIBLE=NO until PR95 removes mailboxAddress from the sync DTO and preserves server-owned client scope
PRODUCT_DIRECTION_COMPATIBLE=YES
RECOVERY_MODE=SECURITY_REWRITE_AND_REPLAY
```

PR95 remains blocked by its mailbox provider-identifier P1. It also overlaps `cases/services.ts`, so final sync follows the Work Package stack.

## RC-05 - Internal intake to portal grant/publication

```text
CAPABILITY_ID=RC-05
PRODUCT_AREA=Portal / Organization / Case
HISTORICAL_SHA=9809c4c1ae1e84c631b7bb57d1688e129d4545f0; 35ca0e6b9bb36a502010ac17fcce807042f1ca82
HISTORICAL_PR=Portal identity and membership lineage
HISTORICAL_FILES=Backend/src/middleware/clientPortalAuth.ts; Backend/src/modules/client-identity/identityService.ts; Backend/src/modules/client-publication/publicationService.ts
CURRENT_EQUIVALENT=Canonical identity, workspace, membership, grants, publication, and PR92 workspace resolution
CURRENT_FILES=Backend/src/routes/clientPortal.ts; Backend/src/modules/client-workspace/workspaceService.ts; Backend/src/modules/client-publication/publicationService.ts
HISTORICAL_CAPABILITY=Explicit customer identity/membership and customer-safe publication
CURRENT_CAPABILITY=Strong grant-scoped reads and publication; case creation does not auto-create grants
WHAT_WAS_LOST=Nothing proven; the missing item is an explicit policy edge
WHAT_CURRENTLY_EXISTS=All primitives needed to implement an intentional grant/publication decision
USER_VALUE=Internally opened matters become visible only when workforce explicitly publishes them
ARCHITECTURE_COMPATIBLE=YES
SECURITY_COMPATIBLE=REQUIRES explicit grant policy; never automatic visibility
PRODUCT_DIRECTION_COMPATIBLE=YES
RECOVERY_MODE=RECONNECT_CURRENT
```

This is not a historical cherry-pick. Define a workforce action and auditable transaction using current identity/grant/publication services after PR92.

## RC-06 - Typed intake deadline to agenda

```text
CAPABILITY_ID=RC-06
PRODUCT_AREA=Case intake / Agenda
HISTORICAL_SHA=272945079da871f905e8b56c07a1a915cfb7e128 (UI lineage); current canonical persistence
HISTORICAL_PR=PR41-era intake lineage
HISTORICAL_FILES=Frontend/src/components/cases/intake/*; Backend/src/modules/cases/intakeCreate.service.ts
CURRENT_EQUIVALENT=CaseIntakeDeadline plus agenda service and /deadlines UI
CURRENT_FILES=Backend/src/modules/cases/intakeCreate.service.ts; Backend/src/modules/agenda/service.ts; Frontend/src/app/deadlines/page.tsx
HISTORICAL_CAPABILITY=Absolute/relative typed deadline capture with responsible user and reminders
CURRENT_CAPABILITY=Typed deadlines persist; agenda only projects Case.deadline and Task.dueDate
WHAT_WAS_LOST=Projection edge from CaseIntakeDeadline to agenda
WHAT_CURRENTLY_EXISTS=Persistence, UI editor, agenda read model, authorization
USER_VALUE=Every intake commitment appears in the lawyer's daily agenda
ARCHITECTURE_COMPATIBLE=YES
SECURITY_COMPATIBLE=YES with current case read scope
PRODUCT_DIRECTION_COMPATIBLE=YES
RECOVERY_MODE=RECONNECT_CURRENT
```

## RC-07 - Task and Work Package time attribution

```text
CAPABILITY_ID=RC-07
PRODUCT_AREA=Time / Tasks / Work Package
HISTORICAL_SHA=52f8fab47d3a5865efae924b173368832a26e4fe; cb29052edfd6f761f562ffe3c24ddea37d29641f
HISTORICAL_PR=Unmerged Time-0 / Time Economics branches
HISTORICAL_FILES=Backend/src/modules/time-attribution/*; Backend/src/modules/time-economics/*; focused attribution tests
CURRENT_EQUIVALENT=TimeEntry.taskId, TaskSubmissionTimeEntry, task/work-package provenance, time routes and UI
CURRENT_FILES=Backend/prisma/schema.prisma; Backend/src/routes/timeEntries.ts; Backend/src/modules/tasks/taskReviewDecision.service.ts; Frontend/src/app/time-entries/page.tsx
HISTORICAL_CAPABILITY=Fail-closed EXACT_CASE/TASK_DERIVED_CASE/MATTER_ONLY/AMBIGUOUS attribution and read summaries
CURRENT_CAPABILITY=Persistence relations exist, but POST /time-entries explicitly rejects taskId
WHAT_WAS_LOST=Safe attribution and ergonomic task-context recording
WHAT_CURRENTLY_EXISTS=Time CRUD/reporting and the required relations
USER_VALUE=Recorded work is attributable to the actual task and package item without invented billing
ARCHITECTURE_COMPATIBLE=YES after Work Package runtime
SECURITY_COMPATIBLE=REQUIRES current task/case authorization and no inference from names/hierarchy
PRODUCT_DIRECTION_COMPATIBLE=YES
RECOVERY_MODE=SEMANTIC_REPLAY
```

Reuse Time-0 classification semantics, not either whole stale branch. This recovery is recorded-work attribution, not billing.

## RC-08 - Handoff package

```text
CAPABILITY_ID=RC-08
PRODUCT_AREA=Case / Documents / Handoff
HISTORICAL_SHA=778105e3d7535dbdb771b8d8d62de50d81a041e4
HISTORICAL_PR=Legacy foundation commit; exact introducing PR not authoritative
HISTORICAL_FILES=Backend/src/modules/handoff-packages/*; Frontend/src/components/handoff/HandoffPackagePanel.tsx
CURRENT_EQUIVALENT=Same canonical modules and current multi-surface links
CURRENT_FILES=Frontend/src/app/cases/[caseId]/handoff/page.tsx; case documents page; documents compare page; CaseDetail.tsx; Backend/src/modules/handoff-packages/*
HISTORICAL_CAPABILITY=Handoff CRUD, readiness, review, archive, export context
CURRENT_CAPABILITY=Already surfaced from Case, Documents, Compare, and Communications
WHAT_WAS_LOST=No material capability proven lost
WHAT_CURRENTLY_EXISTS=Operational route, panel, authorization, tests, entry points
USER_VALUE=Explicit lawyer handoff package
ARCHITECTURE_COMPATIBLE=YES
SECURITY_COMPATIBLE=YES subject to current case/object auth
PRODUCT_DIRECTION_COMPATIBLE=YES
RECOVERY_MODE=KEEP_AS_IS
```

PR99's `NAVIGATION_ORPHANED` label is rejected.

## RC-09 - Legal Analysis surfacing

```text
CAPABILITY_ID=RC-09
PRODUCT_AREA=Documents / Legal Analysis
HISTORICAL_SHA=2570a496d268c5d24457ca6a98160bbf3f1288d1
HISTORICAL_PR=Legacy persistence foundation; SEC-0B1 later hardened DTO/auth semantics
HISTORICAL_FILES=Backend/src/modules/legal-analyses/*; Frontend/src/lib/api.ts
CURRENT_EQUIVALENT=Canonical safe Summary/Working/Sensitive DTOs plus an unmounted intake panel
CURRENT_FILES=Backend/src/modules/legal-analyses/*; Frontend/src/components/documents/LegalAnalysisIntakePanel.tsx; Frontend/src/lib/api.ts
HISTORICAL_CAPABILITY=Persist pasted/manual analysis against exact document source
CURRENT_CAPABILITY=Backend/API/component exist; no current consumer mounts the panel
WHAT_WAS_LOST=Document Workspace entry point
WHAT_CURRENTLY_EXISTS=Secure object resolution, DTO privacy, persistence, lifecycle, UI component
USER_VALUE=Bring lawyer-reviewed external AI analysis into the document workflow
ARCHITECTURE_COMPATIBLE=YES
SECURITY_COMPATIBLE=YES only through current SEC-0B1 routes and DTO levels
PRODUCT_DIRECTION_COMPATIBLE=YES
RECOVERY_MODE=SURFACE_EXISTING
```

Mount one compact Document Workspace action/panel; do not create another analysis service or claim legal certainty.

## RC-10 - Search and classification

```text
CAPABILITY_ID=RC-10
PRODUCT_AREA=Global search / Documents
HISTORICAL_SHA=NONE_REQUIRED
HISTORICAL_PR=NONE_REQUIRED
HISTORICAL_FILES=NONE_REQUIRED
CURRENT_EQUIVALENT=Canonical search route and surface
CURRENT_FILES=Frontend/src/app/search/page.tsx; Frontend/src/components/TopBar.tsx; Frontend/src/lib/api.ts; Backend/src/modules/documents/routes.ts; Backend/src/modules/documents/services.ts
HISTORICAL_CAPABILITY=Search/classification generations
CURRENT_CAPABILITY=/search is reachable from TopBar and calls authorized GET /documents/search; classification APIs also exist
WHAT_WAS_LOST=No search capability proven lost; classification UX depth remains a separate product question
WHAT_CURRENTLY_EXISTS=Real route, UI, API client, bounded query, case-read scope
USER_VALUE=Find cases, clients, tasks, and documents
ARCHITECTURE_COMPATIBLE=YES
SECURITY_COMPATIBLE=YES at current route boundary; continue adversarial scope tests
PRODUCT_DIRECTION_COMPATIBLE=YES
RECOVERY_MODE=KEEP_AS_IS
```

PR99's `BACKEND_NOT_SURFACED` search claim is rejected.

## RC-11 - Outlook inbound runtime

```text
CAPABILITY_ID=RC-11
PRODUCT_AREA=Communications / Outlook
HISTORICAL_SHA=146539d7116ca90b5ce6086cffe6467ececb6ebe
HISTORICAL_PR=PR95
HISTORICAL_FILES=Backend/src/modules/communications/outlookGraphLive.ts; outlookImport.service.ts; routes.ts; Frontend communications/notifications surfaces
CURRENT_EQUIVALENT=Canonical inbound adapter plus PR95 workbench/status/create-case improvements
CURRENT_FILES=Backend/src/modules/communications/*; Frontend/src/components/communications/CommunicationsOverview.tsx; Frontend/src/app/notifications/page.tsx
HISTORICAL_CAPABILITY=Provider-gated inbound read/import with safe counts and case action
CURRENT_CAPABILITY=Inbound code exists; provider runtime is not live-accepted
WHAT_WAS_LOST=Nothing proven; active recovery closes product and authorization gaps
WHAT_CURRENTLY_EXISTS=Graph reader, import normalization, dedupe, conversation grouping, dry run
USER_VALUE=Inbox work starts from real Outlook messages
ARCHITECTURE_COMPATIBLE=YES
SECURITY_COMPATIBLE=NO until mailboxAddress is removed from customer-facing sync DTO
PRODUCT_DIRECTION_COMPATIBLE=YES
RECOVERY_MODE=MERGE_CURRENT_RECOVERY
```

Live Graph configuration and acceptance remain separate after merge.

## RC-12 - Production malware scanner

```text
CAPABILITY_ID=RC-12
PRODUCT_AREA=Upload security / Infrastructure
HISTORICAL_SHA=a851f9e04021049bd3df8a6c6fb231d07b2b752b; 116f0c868c4f07df2a1a436dd6cd3e31001ca357
HISTORICAL_PR=PR93 backend adapter; PR97 scanner service
HISTORICAL_FILES=Backend/src/modules/upload-security/*; services/malware-scanner/*; malware-scanner workflows
CURRENT_EQUIVALENT=Canonical fail-closed unconfigured scanner
CURRENT_FILES=Backend/src/modules/upload-security/scannerAdapter.ts; Backend/src/modules/documents/routes.ts
HISTORICAL_CAPABILITY=Authenticated HTTP scanner adapter and deployable ClamAV gateway/service
CURRENT_CAPABILITY=Fail-closed scanning contract exists but production provider is not configured
WHAT_WAS_LOST=No capability loss; production provider integration is active recovery
WHAT_CURRENTLY_EXISTS=Authorization-before-validation-before-storage composition and fail-closed verdict contract
USER_VALUE=Valid uploads work while infected/failed scans remain blocked
ARCHITECTURE_COMPATIBLE=YES in PR93 -> PR97 order
SECURITY_COMPATIBLE=YES if only CLEAN proceeds and provider details stay internal
PRODUCT_DIRECTION_COMPATIBLE=YES
RECOVERY_MODE=MERGE_CURRENT_RECOVERY
```

Backend integration (PR93) and scanner service (PR97) are both required. Deployment and private-network acceptance are not merge evidence.

## RC-13 - Case-level reviewer assignment

```text
CAPABILITY_ID=RC-13
PRODUCT_AREA=Case / Review
HISTORICAL_SHA=NONE_PROVEN
HISTORICAL_PR=NONE_PROVEN
HISTORICAL_FILES=NONE_PROVEN
CURRENT_EQUIVALENT=Document reviewer, Task review decision, assigned lawyer, collaborators
CURRENT_FILES=Backend/src/modules/documents/review/*; Backend/src/modules/tasks/taskReviewDecision.*; Backend/prisma/schema.prisma
HISTORICAL_CAPABILITY=Adjacent review semantics only
CURRENT_CAPABILITY=No durable Case reviewer role/assignment contract
WHAT_WAS_LOST=Nothing proven
WHAT_CURRENTLY_EXISTS=Object-level reviewers and case access primitives
USER_VALUE=One accountable secondary reviewer at case level
ARCHITECTURE_COMPATIBLE=UNDECIDED
SECURITY_COMPATIBLE=REQUIRES new exact role/eligibility/audit contract
PRODUCT_DIRECTION_COMPATIBLE=YES
RECOVERY_MODE=TRUE_GREENFIELD
```

Do not overload `assignedLawyerId`, document reviewer, or hierarchy metadata.

## RC-14 - Persisted Outlook thread/read/unread/reply

```text
CAPABILITY_ID=RC-14
PRODUCT_AREA=Communications
HISTORICAL_SHA=NONE_PROVEN_FOR_OUTLOOK_STATE
HISTORICAL_PR=NONE_PROVEN
HISTORICAL_FILES=Adjacent providerConversationId and client-interaction thread models only
CURRENT_EQUIVALENT=Communication.providerConversationId grouping; ClientQuestionThread participant/read state in a separate portal domain
CURRENT_FILES=Backend/prisma/schema.prisma; Backend/src/modules/communications/*; Backend/src/modules/client-interaction/*
HISTORICAL_CAPABILITY=Provider conversation grouping and separate portal thread semantics
CURRENT_CAPABILITY=No persisted workforce Outlook unread/reply state machine
WHAT_WAS_LOST=Nothing proven
WHAT_CURRENTLY_EXISTS=Inbound ledger grouping and a non-interchangeable portal thread model
USER_VALUE=Reliable inbox state and reply workflow
ARCHITECTURE_COMPATIBLE=REQUIRES new domain contract
SECURITY_COMPATIBLE=REQUIRES mailbox/object/case scope and provider-safe DTO design
PRODUCT_DIRECTION_COMPATIBLE=YES
RECOVERY_MODE=TRUE_GREENFIELD
```

Reuse concepts and tests, not the portal tables as an Outlook model.

## RC-15 - Outgoing mail

```text
CAPABILITY_ID=RC-15
PRODUCT_AREA=Communications / Outlook
HISTORICAL_SHA=NONE_PROVEN
HISTORICAL_PR=NONE_PROVEN
HISTORICAL_FILES=NONE_PROVEN
CURRENT_EQUIVALENT=Inbound-only Graph reader/import; portal question answer notification is a different channel
CURRENT_FILES=Backend/src/modules/communications/outlookGraphLive.ts; Backend/src/modules/client-interaction/*
HISTORICAL_CAPABILITY=None for workforce Graph send
CURRENT_CAPABILITY=No sendMail/provider delivery path
WHAT_WAS_LOST=Nothing proven
WHAT_CURRENTLY_EXISTS=Inbound provider identity and safe error patterns
USER_VALUE=Send and track case communication from the workbench
ARCHITECTURE_COMPATIBLE=REQUIRES new command/outbox/idempotency contract
SECURITY_COMPATIBLE=REQUIRES recipient, attachment, case, audit, and provider-error policy
PRODUCT_DIRECTION_COMPATIBLE=YES
RECOVERY_MODE=TRUE_GREENFIELD
```

## RC-16 - Billing

```text
CAPABILITY_ID=RC-16
PRODUCT_AREA=Time / Economics
HISTORICAL_SHA=cb29052edfd6f761f562ffe3c24ddea37d29641f; 52f8fab47d3a5865efae924b173368832a26e4fe
HISTORICAL_PR=Unmerged Time Economics / Time-0 branches
HISTORICAL_FILES=Backend/src/modules/time-economics/*; Backend/src/modules/time-attribution/*
CURRENT_EQUIVALENT=TimeEntry, billable flag, timesheet reports, client-safe recorded-work summary
CURRENT_FILES=Backend/src/routes/timeEntries.ts; Backend/src/modules/timesheet-reports/*; Backend/src/modules/client-workspace/workSummaryService.ts
HISTORICAL_CAPABILITY=Minute aggregation and safe attribution, not rates, invoices, tax, or accounting
CURRENT_CAPABILITY=Recorded time and reporting only
WHAT_WAS_LOST=Nothing proven in billing
WHAT_CURRENTLY_EXISTS=Inputs that may later feed billing, with no billing engine
USER_VALUE=Future invoices/economic control
ARCHITECTURE_COMPATIBLE=UNDECIDED
SECURITY_COMPATIBLE=REQUIRES strict internal/customer DTO split
PRODUCT_DIRECTION_COMPATIBLE=DEFERRED
RECOVERY_MODE=TRUE_GREENFIELD
```

Billing stays outside recovery waves. Recover time attribution first; never infer prices or invoices from the billable flag.

## RC-17 - Synthetic mock portal

```text
CAPABILITY_ID=RC-17
PRODUCT_AREA=Portal
HISTORICAL_SHA=0f5d923 lineage (atlas reference)
HISTORICAL_PR=Stale mock-portal branches
HISTORICAL_FILES=Deleted Frontend/src/lib/mockData.ts and synthetic portal generations
CURRENT_EQUIVALENT=Real clientPortalAuth, identity, workspace, grants, and truthful unavailable states
CURRENT_FILES=Backend/src/middleware/clientPortalAuth.ts; Backend/src/modules/client-identity/*; Backend/src/routes/clientPortal.ts; Frontend/src/app/portal/*
HISTORICAL_CAPABILITY=Synthetic identity and fake data for presentation
CURRENT_CAPABILITY=Server-derived identity and real customer-safe projections
WHAT_WAS_LOST=Only unsafe demo convenience
WHAT_CURRENTLY_EXISTS=Correct product architecture
USER_VALUE=Negative; recovery would destroy trust
ARCHITECTURE_COMPATIBLE=NO
SECURITY_COMPATIBLE=NO
PRODUCT_DIRECTION_COMPATIBLE=NO
RECOVERY_MODE=DO_NOT_RECOVER
```

## Candidate totals

- Reviewed: 17.
- Confirmed as recovery/reconnect/surface/active-merge work: 10 (`RC-01` through `RC-07`, `RC-09`, `RC-11`, `RC-12`).
- Removed from the recovery queue: 7 (`RC-08`, `RC-10` already current; `RC-13` through `RC-16` greenfield/deferred; `RC-17` prohibited).
