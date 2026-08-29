# 10 — Connection Graph

> The core issue is broken CONNECTIONS. Each arrow classified: `WORKING_CANONICAL` / `PARTIAL` / `DRAFT_ONLY` / `HISTORICALLY_WORKED` / `BROKEN` / `MISSING` / `NOT_YET_REQUIRED`. Evidence cited.

## Spine: Outlook → Communication → Client → Case → Type → WorkPackage → Workflow → Task → Submission → Review → Document → Version → Prompt/Anonymization → Delivery → Portal → Time → Billing

| Arrow | State | Evidence |
|-------|-------|----------|
| Outlook → Communication | **WORKING_CANONICAL (gated)** | `outlookGraphLive.ts` fetchRecentInbound + `syncOutlookMailbox` (see `04`) |
| Communication → Client | **WORKING_CANONICAL** (direct link) ; **PARTIAL** (client-wide read model branch-only) | `POST /:id/link-client`; `clientSummary.service.ts` on `peterfi/…` branch |
| Communication → Case | **WORKING_CANONICAL** | `POST /:id/link-case`, `/:id/create-case` atomic |
| Client → Case | **WORKING_CANONICAL** | all create paths require existing clientId |
| Case → Work Package | **BROKEN** on modern paths (legacy-only) | `createCaseWorkPackageSnapshot` only in `createCase` (`services.ts:525`) |
| Work Package → Workflow (DAG) | **WORKING_CANONICAL** | `snapshotWorkflowTemplateId` + `instantiateCaseWorkflow` |
| Workflow → Task | **WORKING_CANONICAL** | `instantiateCaseWorkflow` creates BLOCKED/TODO Tasks |
| Task → Submission → Review | **WORKING_CANONICAL** | `TaskSubmission`/`TaskReviewDecision` + workspaces |
| Task → Document (work-context) | **WORKING_CANONICAL** | `workContext.service.ts` two-way links |
| Document → Versions | **WORKING_CANONICAL** (immutable `DocumentVersion` flow: load/upload/download/promote/render history on the case document UI) | `DocumentVersion` endpoints + case documents page; see `06` |
| Document → Comparison (structured) | **WORKING_CANONICAL** | `diffEngine` + `ComparisonWorkspace` |
| Document → Text-diff (DOCX/PDF) | **BROKEN** | `versionText.ts` gates DOCX/PDF as non-text despite `textExtractor.ts` (see `06`) |
| Document → Prompt/Anonymization → Rehydration | **WORKING_CANONICAL** | `AnonymizeModal`/`RehydrateModal` |
| Document → Delivery (review/approve/finalize/publication) | **WORKING_CANONICAL** | review + contract finalize + publication |
| Document → Portal (publication) | **WORKING_CANONICAL** | `client-publication/*`, `MilestonePublicationPanel` |
| Case → Portal (grant/publication) | **BROKEN** for internal intake; **WORKING_CANONICAL** for CP1 conversion | only `createCaseFromPortalIntakeInTransaction` yields grant+publication |
| Task → Time | **WORKING_CANONICAL** | `TaskSubmissionTimeEntry`; `/time-entries` matter prefill |
| Time → Billing | **MISSING** | no invoice/billing engine; placeholder only (MR-075) |
| Communication → Attachment → Document | **MISSING** (attachment metadata only; no attach→document conversion) | `addCommunicationAttachment` links documents; no inverse attach-to-document |
| Communication → Task (extract) | **WORKING_CANONICAL** | `extract-task` |
| Communication → Deadline (extract) | **WORKING_CANONICAL** | `extract-deadline` |

## Client → Organization → Persons → Authority → Portal Membership → Cases → Contracts → Company Facts → Compliance → Findings → Proposals → Initiatives → Work Package → Tasks

| Arrow | State | Evidence |
|-------|-------|----------|
| Client → Organization | **WORKING_CANONICAL** | `client-organization`, `ClientOrganizationGroup` |
| Organization → Persons | **WORKING_CANONICAL** | `OrganizationPerson` (Phase 3) |
| Persons → Authority | **WORKING_CANONICAL** | `managerPersonId`/`deputyPersonId` + `assertInternalCaseAccess` |
| Authority → Portal Membership | **WORKING_CANONICAL** | `ClientPortalWorkspaceMembership` + `approveMembershipRequest` |
| Portal Membership → Cases | **WORKING_CANONICAL (post-approval grant)** | `resolveActiveCustomerGrant` + `/admin/grants` |
| Client → Contracts | **WORKING_CANONICAL** | `client-contracts` |
| Client → Company Facts → AnswerState | **WORKING_CANONICAL** | `client-company`, AnswerState |
| Client/Company → Compliance → Findings → Proposals → Initiatives | **WORKING_CANONICAL** | `compliance/*`, `AssessmentFinding`, `ComplianceProposal`, `DevelopmentInitiative` |
| Initiative → Work Package → Tasks | **PARTIAL** | initiative/roadmap → case binding via `createCase` only (proposals bind, don't create) |

## Attention / notification surface

| Arrow | State | Evidence |
|-------|-------|----------|
| Task → Attention category | **WORKING_CANONICAL** | task-attention, `sharedAttentionCategory` (partly merged) |
| Communication → Dashboard attention | **PARTIAL** | global attention inbox not fully surface-wired; only honest empty states |
| Case → Notification | **WORKING_CANONICAL** | `Notification` model + `modules/notifications` |

## Summary

- **WORKING_CANONICAL (spine intact):** communication→case/client, task lifecycle, document review/compare/anonymize/publication, org/persons/authority/membership/grant, company/compliance/initiatives.
- **BROKEN (recoverable, highest value):** Case→WorkPackage on modern paths; Document→Text-diff (DOCX/PDF); Case→Portal for internal intake.
- **DRAFT_ONLY:** Client-wide communication read model; case-first/client/case-overview communication context.
- **MISSING (true greenfield):** Communication Attachment→Document; Time→Billing; persisted thread/unread/reply; outgoing mail; case-level reviewer.
- **PARTIAL / NOT_YET_REQUIRED:** Outlook→dashboard attention; initiative→workpackage automation.
