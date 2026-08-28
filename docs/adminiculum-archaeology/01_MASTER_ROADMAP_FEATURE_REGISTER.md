# 01 — Master Roadmap Feature Register

> **AUDIT SCOPE:** Forensic reconstruction, no code change. Canonical = `50945ecd309c4c609fc48d07218fe42917ab8e82` (`release/editor-ops-workflow-1`).
> **SOURCE OF RECORD:** `docs/adminiculum-expanded-feature-board-inventory.md` (2026-05-20, MiniMax audit) + `docs/adminiculum-product-readiness-roadmap.md` + the Roadmap phases executed in this workspace (communication Phases 1–5, case-first/client/case-overview context, client-wide summary read model).
> **EVIDENCE RULE:** each row is grounded in exact SHA / branch / file / route / model where possible. Confidence: `PROVEN` / `STRONGLY_INDICATED` / `UNPROVEN`.
> **Confidence for the whole audit's completeness: see `17_EXECUTIVE_FINDINGS.md`.**

A stable audit id (`MR-###`) is assigned to EVERY roadmap capability. The same ids are reused in `02_…LINEAGE.md` and `09_…MATRIX.md`. IDs 001–090 cover the full master roadmap; nothing is left unmapped.

---

## 1. Case domain

| MR | Capability | Canonical state (evidence) | Confidence |
|----|-----------|---------------------------|-----------|
| MR-001 | Case Workspace / case detail cockpit | `CaseDetail.tsx` + `components/cases/CaseWorkspaceOverview.tsx` (`MATTER-OVERVIEW-COCKPIT-1`) + `CaseWorkspaceNav` (6 tabs: overview/documents/communications/…) — live & reachable | PROVEN |
| MR-002 | Case Type | `CaseType` enum + `CaseTypeDefinition` model (`schema.prisma:886`), `matterType` field; work-package `case-types` admin | PROVEN |
| MR-003 | Work Package | `CaseWorkPackage`/`CaseWorkPackageItem`/`WorkPackageTemplate` (`schema.prisma:2911/2934/2954/2976`), `work-package-admin` module, snapshot on case create | PROVEN |
| MR-004 | Workflow engine | DAG engine (`cases/caseWorkflowOrchestration.ts`) + `WorkflowTemplate` + `workflowTemplateService.ts`; admin in Settings; `Task` stamped `workflowInstanceId/…/workflowDependsOnKeys` | PROVEN |
| MR-005 | Tasks (core) | `modules/tasks/*` full CRUD + start/block/reschedule/reassign/attention; `Task` model (`schema.prisma:1549`) | PROVEN |
| MR-006 | Task submission | `TaskSubmission`/`TaskSubmissionDocument`/`TaskSubmissionTimeEntry` + `taskSubmission.service.ts`; `TaskSubmissionWorkspace.tsx` | PROVEN |
| MR-007 | Task review / decision | `TaskReviewDecision` + `taskReviewDecision.service.ts`; `TaskReviewWorkspace.tsx`; `/reviews` queue | PROVEN |
| MR-008 | Case deadlines / agenda | `Case.deadline` + `CaseIntakeDeadline` (typed) + `agenda` module + `getCaseDeadlines`/`extractDeadlines`; `/deadlines` page | PROVEN |
| MR-009 | Case lifecycle (close/reopen/archive) | `cases/lifecycle.ts` + `lifecycleService.ts`; routes `/close|reopen|archive`; forced-close cancels tasks | PROVEN |
| MR-010 | Case intake / matter opening (transactional) | `cases/intakeCreate.service.ts` (`createCaseIntake`, one transaction) + `intakeService.ts` (readiness/opening-tasks/activate/decline) + `modules/intake` queue | PROVEN |
| MR-011 | Case creation paths | ≥4 distinct: legacy `POST /cases`; transactional `POST /cases/intake`; communication `POST /communications/:id/create-case`; portal CP1 intake conversion (`createCaseFromPortalIntakeInTransaction`). Compliance proposal **binds** an existing case (no create) | PROVEN |
| MR-012 | Case-level reviewer assignment | Only downstream in DocumentReview (`DocumentReviewRound`, `ReviewPoint`); **no creation path sets a case reviewer** | PROVEN |
| MR-013 | Case → portal visibility | Portal grant + `clientMatterPublication` only via the CP1 portal-intake conversion path (see `07_…`); internal intake paths create **zero** portal artifacts | PROVEN |

## 2. Client / Portal / Organization domain

| MR | Capability | Canonical state (evidence) | Confidence |
|----|-----------|---------------------------|-----------|
| MR-014 | Client dossier | `app/clients/[clientId]/page.tsx` (cases + collaborators + house style + "Kapcsolt kommunikációk" + "Összes kommunikáció →"); Phase-4 contextual entry always available | PROVEN |
| MR-015 | Client admin | `app/clients/page.tsx` (list + new-client modal + per-row actions), `modules/clients/*` | PROVEN |
| MR-016 | Client house style profile | `ClientHouseStylePanel.tsx` (5 groups), `ClientHouseStyleProfile` model, `upsertClientHouseStyle` | PROVEN |
| MR-017 | Client workgroups / workload | `app/clients/[clientId]/workgroups/page.tsx`, `modules/workgroups/*`, `WorkloadRecord` model | PROVEN |
| MR-018 | Client onboarding (self-service) | `portal/register` + `PortalOnboarding.tsx` (INDIVIDUAL/ORGANIZATION modes) + JIT identity upsert — **PROVEN ancestor** of canonical (Gen 4–6, SHAs `9809c4c`,`908b464`,`0d7879d`,`35ca0e6`) | PROVEN |
| MR-019 | Membership request | `client-identity` routes `/me/membership-requests`, `POST` submit → `PENDING_REVIEW`; resolver states `REQUEST_PENDING/REJECTED/INVITATION_PENDING` | PROVEN |
| MR-020 | Invitations | `ClientPortalInvitation` model; acceptance path | PROVEN |
| MR-021 | Portal user / identity | `ClientPortalIdentity` (`clientPortalAuth.ts`, MSAL separated), account type derived | PROVEN |
| MR-022 | Portal workspace / membership / grants | `ClientPortalWorkspace`/`ClientPortalWorkspaceMembership`/`ClientPortalGrant`; `resolveActiveCustomerGrant` single gate | PROVEN |
| MR-023 | Individual portal | `ClientPortalWorkspaceMode.INDIVIDUAL`; `ClientPortalShell.tsx` mode-based dashboards | PROVEN |
| MR-024 | Organization portal | `OrganizationPortalViews` (role/mode based), org access policy | PROVEN |
| MR-025 | CASE_RELAY / integrated portal | `ClientPortalWorkspaceMode.CASE_RELAY`; `connectedSystemState:'CONFIGURATION_REQUIRED'`; `communicationMode:PORTAL_PRIMARY`; not user-requestable (`PUBLIC_REQUEST_MODES`) | PROVEN |
| MR-026 | Organization persons | `OrganizationPerson` (origin `0b2a7d6`, Phase 3) | PROVEN |
| MR-027 | Organization hierarchy | `ClientOrganizationGroup` self-relation + `OrganizationPerson.managerPersonId/deputyPersonId/directReports/isDeputyFor` | PROVEN |
| MR-028 | Authority / access policy / summary scope | `organizationAdminService.ts` + `organizationalAccessPolicy.ts` + `ClientPortalSummaryScope` | PROVEN |
| MR-029 | Membership approval assignment model | `approveMembershipRequest` ($transaction: resolve/create Client + Workspace, EXISTING/NEW_CLIENT, actualMode) — ancestor `35ca0e6` | PROVEN |
| MR-030 | Case grant authorization | `resolveActiveCustomerGrant` (`client-interaction/base.ts`): ACTIVE identity + ACTIVE membership + ACTIVE unexpired grant; perms `MATTER_READ/DOCUMENT_READ/DOCUMENT_DOWNLOAD/ACTION_REQUEST_READ/UPDATE_READ` | PROVEN |

## 3. Communication domain

| MR | Capability | Canonical state (evidence) | Confidence |
|----|-----------|---------------------------|-----------|
| MR-031 | Communications ledger | `Communication` + `CommunicationAttachment` (+ enums) `schema.prisma:3120`; scalar `caseId`/`clientId`/`documentId` (no relation) | PROVEN |
| MR-032 | Outlook / Graph sync (inbound) | `outlookGraphLive.ts` (real app-only `client_credentials` token + `GET /users/{mailbox}/messages`), `syncOutlookMailbox`; gated `ENABLE_OUTLOOK_IMPORT='true'` + `OUTLOOK_GRAPH_*` env | PROVEN |
| MR-033 | Outlook import dry-run / normalize-only import | `POST /outlook/import-dry-run` + `POST /outlook/import` — normalize a provider-shaped payload, **no Graph call** | PROVEN |
| MR-034 | Communication inbox (global triage) | `app/communications/page.tsx`→`CommunicationsOverview.tsx` (sync button + triage/assign/ignore) + `app/notifications/page.tsx`→`CommunicationWorkspace` (filters/detail/create-case/tasks) | PROVEN |
| MR-035 | Communication → case association | `POST /communications/:id/link-case`, `/:id/create-case` (atomic, `ab5b96d`); frontend assign/create-case | PROVEN |
| MR-036 | Communication → client association | `POST /communications/:id/link-client` (`linkCommunicationToClient`); client/case-mismatch guard | PROVEN |
| MR-037 | Communication attachments (metadata) | `CommunicationAttachment` metadata-only (`ATTACHMENT_METADATA_FIELDS`, `397b770`); no binaries | PROVEN |
| MR-038 | Thread model | Only `providerConversationId` (Graph conversationId), "provider-derived, not a persisted thread model"; `applySafeConversationLinkage` | PROVEN |
| MR-039 | Unread / read / reply state | **None** for communications (honest empty states: "nincs perzisztált adat"; "válaszállapot csak későbbi modellből") | PROVEN |
| MR-040 | Outgoing mail | **None** — no Graph `sendMail`/draft/send; `OUTBOUND` only a derived flag on manual/imported rows | PROVEN |
| MR-041 | Communication → task extraction | `POST /:id/extract-task` (`extractTaskFromCommunication`), `:id/link-task`; UI button | PROVEN |
| MR-042 | Communication → deadline extraction | `POST /:id/extract-deadline`; UI button | PROVEN |
| MR-043 | Client-wide communication summary read model | **Branch-only (not canonical)**: `peterfi/client-communication-summary-read-model` (`1c301b0`→`b36113a`) — `clientSummary.service.ts` listClientCommunicationSummary; fail-closed dual-link auth, no N+1, effective-timestamp contract | PROVEN (branch) |
| MR-044 | Case/client/case-overview comm context snapshots | **Branch-only**: `peterfi/case-first-communication-context` (`87ebebe`), `peterfi/case-overview-communication-snapshot`, `peterfi/client-overview-communication-snapshot` | PROVEN (branch) |

## 4. Document domain

| MR | Capability | Canonical state (evidence) | Confidence |
|----|-----------|---------------------------|-----------|
| MR-045 | Document Workspace (ledger/upload/download) | `app/cases/[caseId]/documents/page.tsx` (3-category ledger), `modules/documents/*`, `uploadCaseDocument`/`downloadDocument` | PROVEN |
| MR-046 | Document versions | `DocumentVersion` model + list/get/promote-current/download (routes 475/490/612/630/658); version-history UI disconnected (see `06_…`) | PROVEN |
| MR-047 | Document text extraction (DOCX/PDF) | `textExtractor.ts` (mammoth + pdf-parse) used by anonymization; NOT wired into compare | PROVEN |
| MR-048 | Document comparison (structured) | `diffEngine` (`adaa1af`) + `comparison.routes.ts` typed segments (ChangeType/SegmentCategory/ReviewState) + `ComparisonWorkspace.tsx` | PROVEN |
| MR-049 | Text-diff (DOCX/PDF) | Comparison resolver gates DOCX/PDF as `FORMAT_NOT_TEXT_EXTRACTABLE` (`versionText.ts:30-36`) **despite** `textExtractor.ts` — the largest disconnected/recoverable gap | PROVEN |
| MR-050 | Annotations | `annotations.service.ts` (`7c9a23e`) anchored comment threads | PROVEN |
| MR-051 | Document review workflow | `modules/documents/review/*` (`d1d8fd6`) `DocumentReview`/`Round`/`ReviewPoint`/`ReviewDecision`; `DocumentReviewWorkflowPanel.tsx` | PROVEN |
| MR-052 | Approval / delivery | review `APPROVED` + `ready-for-client`/`published`; contract `finalize`/`reject-approval`/`back-to-review`/`create-revision` | PROVEN |
| MR-053 | Client explanation / publication | `client-publication/*` + `MilestonePublicationPanel`/`ClientPublicationPanel` | PROVEN |
| MR-054 | Editing (Word-primary, export-only) | `DOCUMENT-EDITOR-PRO-CONTRACT-WORKBENCH-1`: export-only TipTap workbench; guards forbid workspaceText/autosave/track-changes; `docxInterop.ts`/`htmlExport.ts`/`plainTextExport.ts` | PROVEN |
| MR-055 | Anonymization | `modules/anonymize/*` + `AnonymizeModal.tsx` (fullscreen) + PII boundary (`b3db2b2`) | PROVEN |
| MR-056 | Rehydration | `RehydrateModal.tsx` + `saveRehydratedResultAsDocument`; import AI response → token resolve | PROVEN |
| MR-057 | Clause Library | `modules/clause-library/*` (14 endpoints) + `app/clause-library` + assembly `generate/assembly` | PROVEN |
| MR-058 | Prompt System / legal prompt catalog / AI | `legalPromptCatalog.ts` (20+), `AIPromptPanel.tsx`; AI prompt copy buttons (clipboard); analysis intake | PROVEN |
| MR-059 | Contract generation (templates, draft) | `modules/contracts/*` + `generation-draft/*` + `Backend/templates/*.docx` (22 tracked); `app/cases/[caseId]/generate*` | PROVEN |

## 5. Client-company / risk domain

| MR | Capability | Canonical state | Confidence |
|----|-----------|----------------|-----------|
| MR-060 | Company profile | `modules/client-company/*` (`getOperatingProfile`/`upsert`), `ClientOperatingProfile` model (origin `1ae6b9b`) | PROVEN |
| MR-061 | ClientFact / AnswerState | `ClientFact` + AnswerState (Phase `codex/org-client-answerstate-discovery` merged) | PROVEN |
| MR-062 | Compliance engine | `modules/compliance*` + `compliance-foundation`; applicability/requirements | PROVEN |
| MR-063 | Findings | `AssessmentFinding` + `phase7-slice-7a` (merged) | PROVEN |
| MR-064 | Proposals | `ComplianceProposal` (`phase7b` merged), `bindProposalToCase` | PROVEN |
| MR-065 | Initiatives | `DevelopmentInitiative` (`phase7cb` merged) | PROVEN |
| MR-066 | Grow With Us | Iniative/company roadmap surfaces (Phase 7C family) | STRONGLY_INDICATED |
| MR-067 | Contract Library | `modules/client-contracts/*` (`ClientContractRecord`), `app/clients/[clientId]` contracts | PROVEN |
| MR-068 | Obligations | `ClientObligation` (`client-contracts/service.ts`) | PROVEN |
| MR-069 | Entitlements | `ClientEntitlement` (`client-contracts`) | PROVEN |
| MR-070 | Change reports | `getChangeReport`/`generateChangeReport` backend, **no UI** | PROVEN |

## 6. Work / billing domain

| MR | Capability | Canonical state | Confidence |
|----|-----------|----------------|-----------|
| MR-071 | TimeEntry | `TimeEntry` model + `src/routes/timeEntries.ts` + `app/time-entries/page.tsx` (case-aware, matter prefill) | PROVEN |
| MR-072 | Timesheet reports | `modules/timesheet-reports/*` + DOCX render; presets + report instances | PROVEN |
| MR-073 | Matter | `Matter` model (`Case.matterId`), `src/routes/matters.ts`; `/matters` demoted → redirect `/cases` | PROVEN |
| MR-074 | Capacity / workload / workgroups | `WorkloadRecord`, workgroup workload panels, `app/workload/`, `family` workloads | PROVEN |
| MR-075 | Billing foundation | TimeEntry/matter present; **billing/export is placeholder-only** (no invoice engine) | PROVEN (placeholder) |

## 7. Cross-cutting domain

| MR | Capability | Canonical state | Confidence |
|----|-----------|----------------|-----------|
| MR-076 | Dashboard | `app/page.tsx` → `Dashboard.tsx` (two UI modes) + operational-case + workload cards + resilience | PROVEN |
| MR-077 | Agenda / calendar | `modules/agenda/*` + `/deadlines` agenda + dashboard right-panel | PROVEN |
| MR-078 | Notifications / attention | `Notification` model (`isRead`), `modules/notifications/*`, shared `attentionCategory` (task-attention); global attention inbox not fully surface-wired | PROVEN |
| MR-079 | Unified shell / navigation | `app/layout.tsx`, `AppShell.tsx`, `AuthenticatedApp.tsx`, `Sidebar.tsx` (6 primary items), `navigation.ts` registry | PROVEN |
| MR-080 | Settings / UI pack | `app/settings/*` (workflows + work-packages admin) + `uiPack.ts` (`useUiPack`, `signal_tiles_console`); no general settings/theme page | PROVEN |
| MR-081 | Storage / SharePoint | `modules/sharepoint/*`, `uploadGeneratedContractToSharePoint` (generated only), Graph drive service; no generalized upper-level upload persistence | PROVEN |
| MR-082 | Malware scanning / upload security | `upload-security` module + SEC-2 upload validation (`8f34837`) | PROVEN |
| MR-083 | Authorization / privacy | `client-interaction/base.ts` single source-of-truth (assertClientReadAccess / assertInternalCaseAccess / internalCaseScope / resolveActiveCustomerGrant) | PROVEN |
| MR-084 | Production / deploy / runtime | `.github/workflows/{deploy,backend-postgresql-integration,preflight,prisma-migration-replayability,upgrade-safety-gate, presentation-demo}` | PROVEN |
| MR-085 | Document search / classification | `searchDocuments`/`classifyDocument` API — **no UI** | PROVEN |
| MR-086 | News feed | `modules/news-feed/*` (feature-flag `ENABLE_NEWS_FEED`) | PROVEN |
| MR-087 | Audit log / timeline | `TimelineEvent` model + case timeline/day-grouped; `timelineEventing` | PROVEN |
| MR-088 | Legal analysis intake | `LegalAnalysisIntakePanel.tsx` + `modules/legal-analyses/*` | PROVEN |
| MR-089 | Handoff package (leadási csomag) | `modules/handoff-packages/*` + `HandoffPackagePanel.tsx` (sidebar); no standalone page/export | PROVEN |
| MR-090 | Responsibility / munkacsoport | `modules/responsibility/*` + workgroup member responsibility; `getCaseResponsibility` | PROVEN |

> **Coverage declaration:** MR-001…MR-090 cover every capability enumerated in the master roadmap + the board inventory. No roadmap item is left unmapped in `09_…MATRIX.md`. Where a roadmap capability is only partially evidenced, its confidence is marked and its action reflects that.
