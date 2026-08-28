# 09 — Master Roadmap × History Matrix

> Core table: every MR (001–090) → current canonical → historical best version → draft branch → lost semantics → reusable foundation → missing connection → true greenfield → **recommended action** (exactly one of: KEEP / FINISH / RECONNECT / REPLAY_OLD_SEMANTICS / MERGE_EXISTING_COMPONENTS / REPLACE_BAD_CURRENT_UI / DEPRECATE_OLD / BUILD_NEW).
> **100% of the master roadmap is mapped.** Evidence/confidence per row: see `01`/`02` and the domain files `03`–`08`.

## Case domain

| MR | Current canonical | Historical best | Draft branch | Lost semantics | Reusable foundation | Missing connection | True greenfield | Action |
|----|------------------|-----------------|--------------|----------------|----------------------|--------------------|------------------|--------|
| MR-001 Case Workspace | cockpit (single overview) | cockpit superseded legacy CaseDetail | — | legacy decorative boxes | CaseWorkspaceOverview, CaseWorkspaceNav | — | no | KEEP |
| MR-002 Case Type | enum + CaseTypeDefinition | — | — | inconsistent caseType across paths | work-package `case-types` | case→type on intake/comm/portal | no | FINISH |
| MR-003 Work Package | snapshot on legacy only | wp1–wp5 (codex) | codex/recovery wp4/wp5a/wp5b (ahead) | case→workpackage broken on modern paths | work-package-admin, caseWorkPackage.service | snapshot in intake/comm/portal | no | RECONNECT |
| MR-004 Workflow engine | DAG engine | V1/V2 engines | — | SP-folder-move automation | DAG engine (E3) | — | no | KEEP |
| MR-005 Tasks | full | — | — | — | tasks/* | — | no | KEEP |
| MR-006 Task submission | full | — | — | — | TaskSubmission | — | no | KEEP |
| MR-007 Task review | full | — | — | — | TaskReviewDecision | — | no | KEEP |
| MR-008 Deadlines | mixed | — | — | intake-typed deadline not mirrored to Case.deadline | agenda, CaseIntakeDeadline | intake→agenda | no | FINISH |
| MR-009 Case lifecycle | full | — | — | — | lifecycle | — | no | KEEP |
| MR-010 Intake | transactional | legacy createCase | — | workpackage/portal missing | createCaseIntake | +workpackage +responsible | no | RECONNECT |
| MR-011 Case creation | ≥4 paths | — | — | no unified path | createCaseIntake (base), create-case | consolidate to one base | no | MERGE_EXISTING_COMPONENTS |
| MR-012 Case reviewer | backend-only (doc review) | — | — | never at case level | DocumentReview | case→reviewer at creation | yes | BUILD_NEW (schema) |
| MR-013 Case→portal | CP1-only | — | — | internal intake never portal-visible | grant + publication + intakeConversion | internal case→portal grant | no | RECONNECT |

## Client / portal / org domain

| MR | Current canonical | Historical best | Draft branch | Lost semantics | Reusable foundation | Missing connection | True greenfield | Action |
|----|------------------|-----------------|--------------|----------------|----------------------|--------------------|------------------|--------|
| MR-014 Client dossier | full | — | — | — | clients/[clientId]/page | — | no | KEEP |
| MR-015 Client admin | full | — | — | — | clients/* | — | no | KEEP |
| MR-016 House style | full | — | — | — | ClientHouseStylePanel | — | no | KEEP |
| MR-017 Workgroups/workload | partial | — | — | — | workgroups, WorkloadRecord | — | no | FINISH |
| MR-018 Client onboarding | full self-service | Gen-1 read-only | claude/next-development (stale mock) | ease (grant→browse) | ClientPortalIdentity + PortalOnboarding | — | no | KEEP |
| MR-019 Membership request | full | — | — | — | client-identity | — | no | KEEP |
| MR-020 Invitations | full | — | — | — | ClientPortalInvitation | — | no | KEEP |
| MR-021 Portal identity | full | — | — | — | clientPortalAuth | — | no | KEEP |
| MR-022 Workspace/membership/grant | full | — | — | — | resolveActiveCustomerGrant | — | no | KEEP |
| MR-023 Individual portal | full | — | — | — | ClientPortalShell | — | no | KEEP |
| MR-024 Organization portal | full | — | — | — | OrganizationPortalViews | — | no | KEEP |
| MR-025 CASE_RELAY | partial | — | — | — | WorkspaceMode.CASE_RELAY | needs an integration source (outlook/portal) | partially | FINISH |
| MR-026 Org persons | full | — | — | — | OrganizationPerson | — | no | KEEP |
| MR-027 Org hierarchy | full | — | — | — | group self-relation.manager/deputy | — | no | KEEP |
| MR-028 Authority/access | full | — | — | — | organizationalAccessPolicy, ClientPortalSummaryScope | — | no | KEEP |
| MR-029 Membership assignment | full | — | — | — | approveMembershipRequest | — | no | KEEP |
| MR-030 Case grant authz | full | — | — | — | resolveActiveCustomerGrant | — | no | KEEP |

## Communication domain

| MR | Current canonical | Historical best | Draft branch | Lost semantics | Reusable foundation | Missing connection | True greenfield | Action |
|----|------------------|-----------------|--------------|----------------|----------------------|--------------------|------------------|--------|
| MR-031 Communication ledger | full | — | — | — | Communication/Attachment | — | no | KEEP |
| MR-032 Outlook graph sync | live inbound, gated OFF | `b88fb84` (canonical) | — | — | outlookGraphLive + syncOutlookMailbox | enable + credentials; delta/subscription | no | FINISH |
| MR-033 Import dry-run / normalize | present (facade) | — | — | — | import-dry-run/import | — | no | DEPRECATE_OLD |
| MR-034 Inbox | two overlapping surfaces | — | — | — | CommunicationsOverview + CommunicationWorkspace | converge to one surface | no | MERGE_EXISTING_COMPONENTS |
| MR-035 Comm→case | full | — | — | — | link-case/create-case | — | no | KEEP |
| MR-036 Comm→client | full | — | — | — | link-client | — | no | KEEP |
| MR-037 Comm attachments | metadata-only | — | — | — | CommunicationAttachment | attach→document | no | FINISH |
| MR-038 Thread model | provider-derived only | — | — | no persisted thread | providerConversationId | persisted thread (schema) | yes (schema) | BUILD_NEW |
| MR-039 Unread/read/reply | none (honest empty) | — | — | — | — | unread/reply model (schema) | yes (schema) | BUILD_NEW |
| MR-040 Outgoing mail | none | — | — | — | — | sendMail (Graph) | yes | BUILD_NEW |
| MR-041 Comm→task | full | — | — | — | extract-task | — | no | KEEP |
| MR-042 Comm→deadline | full | — | — | — | extract-deadline | — | no | KEEP |
| MR-043 Client-wide summary | branch-only | — | peterfi/client-communication-summary-read-model | client scope requires N+1 without it | clientSummary.service (branch) | merge into canonical | no | MERGE_EXISTING_COMPONENTS |
| MR-044 Comm context snapshots | branch-only | — | peterfi/case-first-communication-context etc. | case/client/overview context not canonical | communicationCase-first branch | merge into canonical | no | MERGE_EXISTING_COMPONENTS |

## Document domain

| MR | Current canonical | Historical best | Draft branch | Lost semantics | Reusable foundation | Missing connection | True greenfield | Action |
|----|------------------|-----------------|--------------|----------------|----------------------|--------------------|------------------|--------|
| MR-045 Document workspace | full | — | — | — | documents/*, ledger | — | no | KEEP |
| MR-046 Document versions | backend-only | — | — | version-history UI removed | DocumentVersion endpoints | surface history in docs page | no | FINISH |
| MR-047 Text extraction | backend-only | — | — | — | textExtractor (mammoth/pdf-parse) | wire into compare | no | RECONNECT |
| MR-048 Structured comparison | full | — | — | — | diffEngine + ComparisonWorkspace | — | no | KEEP |
| MR-049 Text-diff (DOCX/PDF) | gated off | extractor exists | — | — | textExtractor | resolver gate → extractor | no (recover) | RECONNECT |
| MR-050 Annotations | full | — | — | — | annotations | — | no | KEEP |
| MR-051 Document review | full | — | — | — | review/* + panel | — | no | KEEP |
| MR-052 Approval/delivery | full | — | — | — | review + contract finalize | — | no | KEEP |
| MR-053 Client explanation/publication | full | — | — | — | publication/* | — | no | KEEP |
| MR-054 Editing | export-only (correct) | browser editor | — | browser save semantics (intentional) | docxInterop/htmlExport | — | no | KEEP |
| MR-055 Anonymization | full | — | — | — | anonymize + AnonymizeModal | — | no | KEEP |
| MR-056 Rehydration | full | — | — | — | RehydrateModal | — | no | KEEP |
| MR-057 Clause library | partial | — | — | no standalone page polish | clause-library | standalone page | no | FINISH |
| MR-058 Prompt/AI catalog | component-only | — | — | no standalone board | legalPromptCatalog/AIPromptPanel | standalone board | no | FINISH |
| MR-059 Contract generation | full | — | — | — | contracts + generation-draft + 22 templates | — | no | KEEP |

## Client-company / risk domain

| MR | Current canonical | Historical best | Draft branch | Lost semantics | Reusable foundation | Missing connection | True greenfield | Action |
|----|------------------|-----------------|--------------|----------------|----------------------|--------------------|------------------|--------|
| MR-060 Company profile | full | — | — | — | client-company | — | no | KEEP |
| MR-061 ClientFact/AnswerState | full | — | — | — | org-client-answerstate | — | no | KEEP |
| MR-062 Compliance engine | full | — | — | — | compliance/* | — | no | KEEP |
| MR-063 Findings | full | — | — | — | AssessmentFinding | — | no | KEEP |
| MR-064 Proposals | full | — | — | — | ComplianceProposal | bindToCase (exists) | no | KEEP |
| MR-065 Initiatives | full | — | — | — | DevelopmentInitiative | — | no | KEEP |
| MR-066 Grow With Us | partial | — | — | — | Initiative/company roadmap | — | partially | FINISH |
| MR-067 Contract library | full | — | — | — | client-contracts | — | no | KEEP |
| MR-068 Obligations | full | — | — | — | ClientObligation | — | no | KEEP |
| MR-069 Entitlements | full | — | — | — | ClientEntitlement | — | no | KEEP |
| MR-070 Change reports | backend-only | — | — | no UI | getChangeReport/generateChangeReport | UI | no (backend) | FINISH |

## Work / billing domain

| MR | Current canonical | Historical best | Draft branch | Lost semantics | Reusable foundation | Missing connection | True greenfield | Action |
|----|------------------|-----------------|--------------|----------------|----------------------|--------------------|------------------|--------|
| MR-071 TimeEntry | full | — | — | — | TimeEntry + timeEntries | — | no | KEEP |
| MR-072 Timesheet reports | full | — | — | — | timesheet-reports | — | no | KEEP |
| MR-073 Matter | full (folded) | — | — | — | Matter model | — | no | KEEP |
| MR-074 Capacity/workload | partial | — | — | — | WorkloadRecord, workgroups | — | partially | FINISH |
| MR-075 Billing foundation | placeholder | — | — | no invoice engine | TimeEntry + Matter | invoice/billing | yes | BUILD_NEW |

## Cross-cutting domain

| MR | Current canonical | Historical best | Draft branch | Lost semantics | Reusable foundation | Missing connection | True greenfield | Action |
|----|------------------|-----------------|--------------|----------------|----------------------|--------------------|------------------|--------|
| MR-076 Dashboard | full | — | — | — | Dashboard | — | no | KEEP |
| MR-077 Agenda/calendar | full | — | — | — | agenda | intake deadlines → agenda | no | FINISH |
| MR-078 Notifications/attention | partial | — | attention-category branches (ahead) | global attention inbox not fully wired | Notification + attentionCategory | wire global attention inbox | no | FINISH |
| MR-079 Unified shell/nav | full | — | — | — | AppShell/Sidebar/AuthenticatedApp | — | no | KEEP |
| MR-080 Settings/UI pack | partial | — | — | no general settings/theme page | uiPack + settings admin | general settings page | no | FINISH |
| MR-081 Storage/SharePoint | partial | — | — | uploads to generated only | sharepoint module | generalized upload | no | FINISH |
| MR-082 Malware/upload security | full | — | — | — | upload-security + SEC-2 | — | no | KEEP |
| MR-083 Authz/privacy | full | — | — | — | client-interaction/base (single source of truth) | — | no | KEEP |
| MR-084 Prod/deploy/runtime | full | — | — | — | workflows + backend PG CI | — | no | KEEP |
| MR-085 Doc search/classification | backend-only | — | — | no UI | searchDocuments/classifyDocument | search UI | no | FINISH |
| MR-086 News feed | full (flag) | — | — | — | news-feed | — | no | KEEP |
| MR-087 Audit log/timeline | full | — | — | — | TimelineEvent | — | no | KEEP |
| MR-088 Legal analysis intake | full | — | — | — | LegalAnalysisIntakePanel | — | no | KEEP |
| MR-089 Handoff package | partial | — | — | no standalone/export | handoff-packages + HandoffPackagePanel | standalone page + export | no | FINISH |
| MR-090 Responsibility/workgroup | full | — | — | — | responsibility + workgroups | — | no | KEEP |

## Matrix summary

- **KEEP (canonical, working):** MR-001,004,005,006,007,009,014-031,035,036,041,042,045,048,050-056,059-069,071-073,076,079,082-084,086,087,088,090
- **FINISH (partial/backend-only, foundations exist):** 002,008,017,025,032,037,046,057,058,066,070,074,077,078,080,081,085,089
- **RECONNECT (foundation exists but connection broken):** 003,010,047,049
- **MERGE_EXISTING_COMPONENTS (duplication/branch consolidation):** 011,034,043,044
- **REPLAY_OLD_SEMANTICS:** none currently (semantics already re-expressed in DAG engine; V2 dead — do not replay)
- **REPLACE_BAD_CURRENT_UI:** 034 (converge two inboxes)
- **DEPRECATE_OLD:** 033 (normalize-only facade)
- **BUILD_NEW (true greenfield):** 012 (case reviewer), 038 (persisted thread), 039 (unread/read/reply), 040 (outgoing mail), 075 (billing)
