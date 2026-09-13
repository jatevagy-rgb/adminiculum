# Word reconciliation — exact-base source audit

Base: `55935a187fb51d64248278e79d16e3ea0c77f98f`. Source review only; no live acceptance. The supplied reconciliation brief is the requirements source; the original Word screenshots were not attached to this task. Existing outcomes take precedence over historical layouts.

| Area | Initial classification | Evidence / boundary |
|---|---|---|
| Dashboard | ALREADY_COMPLETE | DashboardFocused: task attention links, recent client communication counts (not unread), dedicated legal news. Preserve truthful wording. |
| Cases | SUPERSEDED_BY_NEW_PRODUCT_DECISION | Case management stays separate from Task attention categories. |
| Communication intake | PARTIALLY_COMPLETE | CommunicationWorkspace uses CompactNewCaseDialog and linkCommunicationToCase. Linked messages promote task actions; clarify case context and keep task capabilities secondary. |
| Case team | ALREADY_COMPLETE_DIFFERENT_IMPLEMENTATION | CaseDetail uses get/add/removeCaseCollaborator and backend responsibility capabilities. No new team model. |
| Reusable task types | BLOCKED | TaskType is an enum; work-package items are case-type/version scoped, not an independent user catalogue. Additive schema work overlaps active Grow PR #213 schema edits; defer this slice. |
| Task roles | BLOCKED | Existing single assignee, submissions and reviewer decisions preserved. Parallel collaborators need an additive relation; same schema conflict as task types. Do not pretend case collaborators are task executors. |
| Attention / estimates | ALREADY_COMPLETE | Task attentionCategory and estimatedMinutes, unclassified fallback and canonical Tasks filters. Type defaults depend on blocked catalogue. |
| Client list | ALREADY_COMPLETE_DIFFERENT_IMPLEMENTATION | Compact cards in clients/page; detailed editing lives in dossier. No client data deletion. |
| Client dossier | ALREADY_COMPLETE | Canonical Client fields, profile editing, house style, connected cases and quick actions. |
| Control center | ALREADY_COMPLETE_DIFFERENT_IMPLEMENTATION | clients/[clientId]/page has scoped calendar/cases/communications/time links. Closed list truthfully says closed, not this month; no unsupported date-count claim. Grow card untouched. |
| Portal admin | PARTIALLY_COMPLETE | ClientPortalMemberAdmin handles membership; portal route preserves status/mode/settings. Save failure currently console-only: add visible feedback without changing authorization/publication. |
| Organization | FRONTEND_GAP | ClientOrganization only edits job title. Existing clientOrganizationApi supports guarded person/group create/update/reparent; service requires ADMIN/PARTNER and validates same-client/cycles. Wire explicit forms, not drag/drop. |
| Calendar | ALREADY_COMPLETE_DIFFERENT_IMPLEMENTATION | Canonical client calendar has day/month/year/five-year views; client-calendar service reads authoritative sources. No duplicate timeline store. |
| Time/billing | ALREADY_COMPLETE_DIFFERENT_IMPLEMENTATION | billing-preparations service uses canonical hourly-rate resolver, snapshots/fingerprints and per-entry review; BillingReviewWorkspace and PDF endpoint exist. Organization-group snapshots are already captured by the service and grouped by billingPreparationPresentation. Preserve them. Accounting invoice issuance is not claimed; existing billing statement/draft remains authoritative. |
| Client visibility | ALREADY_COMPLETE_DIFFERENT_IMPLEMENTATION | MilestonePublicationPanel explicitly publishes immutable approved revisions; publication grants/projections govern visibility. Do not introduce parallel MINIMAL/DETAILED enums or fabricated AI savings. |
| Document workspace | PARTIALLY_COMPLETE | Existing workspace review/local marks/comment panes and DocumentEditorShell. Reconcile layout only, preserve local-vs-persisted distinction and editor contract. |
| AI/anonymization | BLOCKED | Explicit known-party/counterparty input exists; no approved directory-wide transfer scope established. Do not automatically move organization personal data into AI context. Existing human handoff remains. |
| Grow | SUPERSEDED_BY_NEW_PRODUCT_DECISION | Explicitly out of scope; PR #213 owns schema and growth changes. |

## Regression inventories before implementation

- Communication: list/filter/pagination, selected record, client/case association, explicit case confirmation, canonical dialog, retained task extraction/linking, server authorization and case communications projection.
- Portal: getClient/listAdminWorkspaces, relationshipMode, portalAccessEnabled, connectedSystemState save, status/membership counts, invitations/requests, client accent/tabs; no identity or grant changes.
- Organization: directory loading/search/hierarchy; same-client and manager/deputy/cycle rules; ADMIN/PARTNER edit gate; existing title save; contacts/responsibilities; portal membership stays independent; create/edit errors and keyboard forms.
- Document: versions, text source, editor dirty state, local review marks, comments and decisions, annotation offsets/fingerprints, publication and task/case links. Layout must move existing presentation only.

## Validation

Pending implementation and technical gates. No browser or production testing; final user live acceptance is required.

## Implemented slices

- Communication: case creation/assignment remains explicit; linked records promote the canonical case link, with retained task actions in a secondary disclosure. No route or API change.
- Portal: accessible save status and failure feedback; technical heading replaced with ordinary user wording. Only the old heading assertion was updated; settings regression coverage retained.
- Organization: manager-only person/group forms use existing APIs, including explicit move/manager/deputy fields and contacts; no portal membership input. Backend remains final authorization and cycle authority.
- Documents: existing review JSX moved intact to a left panel in review mode; document remains central; existing comments shown at right. Smaller screens stack the same content. No review handler or document persistence change.

Schema-dependent catalogue/parallel-role slices stay blocked by concurrent Grow schema ownership. No other source area is refactored.

## Continuation review of 07562136 (PR #215)

Prerequisites verified: exact branch/head, clean worktree, existing draft targets master. No rebase. Review is source/automated-test evidence, not LIVE acceptance.

### Four-patch review and regression inventories

- **Communication — FIXED:** Before: case-first actions were correctly wired to CompactNewCaseDialog and linkCommunicationToCase; linked task actions remained under details. Filters, pagination and selection were unchanged. Found response projection gap: assigning a previously clientless communication updated caseId but ignored returned clientId. Apply both returned canonical IDs without replacing other loaded fields. Backend routes update the original communication; case workspace queries the same /communications?caseId collection. Added route tests for creation/assignment, unchanged message identity/content, canonical list projection, and cross-client rejection. Inventory: human confirmation, case/client authorization, same message identity, task actions, loaded metadata and filters.
- **Portal — PASS:** success feedback follows awaited updateClient, failure is generic and remains in a live status region; no provider error exposure. Identity, membership, invitation, publication and workspace resolution unchanged. Inventory: all three settings, failure/success feedback, member controls and admin reachability.
- **Organization — FIXED:** canonical APIs and ADMIN/PARTNER hiding match server requireManager; server independently enforces access and same-client/cycle rules. listPersons includes all editable fields. Form key resets defaults on record/mode change. Found full-row PATCH could overwrite unedited concurrent changes. Send only user-edited fields on updates; creates retain their full payload. Explicit clearing still sends null. Never send membership/status/unrendered fields. Inventory: create/update, record switching, null clearing, preservation of unedited contacts/relations, authorization and hierarchy constraints.
- **Document — FIXED:** review block was moved byte-for-byte, one localReviewMarks list, unchanged decisions/local persistence labels. Found CSS order differed from DOM reading/focus order. Reordered existing siblings to left/document/comments and removed visual reordering; right sticky panel now self-start. No handler/editor/persistence rewrite. Inventory: DOM/focus order, desktop columns/mobile stacking, one copy of review list, editor state, comments and local/persisted distinction.

### Disclosed failure classification (each failing assertion)

| Test assertion | Classification | Narrow action |
|---|---|---|
| link-task validates taskId before all DB reads | STALE_TEST | Resource authorization now precedes payload validation. Assert auth read occurs but no task read/write occurs. |
| link-task missing/cross-case records | HARNESS/MOCK_DEFECT | Add real case-authorization query mocks; retain all rejection assertions. |
| link-task idempotence/conflicting source | HARNESS/MOCK_DEFECT | Same harness repair; preserve both conflict and idempotence checks. |
| link-task denied task access | HARNESS/MOCK_DEFECT | Same harness repair; preserve TASK_LINK_FORBIDDEN and no-write checks. |
| link-task successful association | HARNESS/MOCK_DEFECT | Same harness repair; preserve exact update assertion. |
| preview effect dependency-string assertion | STALE_TEST | Assert current versionTextPlan/document/version dependencies, preserving no retry loop and provider-error protections. |

Additional negative test proves denied communication access prevents task reads/authorization/writes. No production backend logic changed to satisfy tests. These are not classified as unexplained unrelated failures.

### Revalidated remaining areas

| Area | Evidence and decision |
|---|---|
| Dashboard | DashboardFocused task links use attentionCategory; TasksPageContent reads and applies that query. Client summaries link with clientId, CommunicationWorkspace initializes and forwards it server-side. Dedicated news and truthful recent counts retained; no historical duplicate panels restored. |
| Cases / team | CasesList filters matter status/client/priority; CaseDetail loads/adds/removes collaborators and uses responsibility capabilities. No case attention-category classification or new team model. |
| Estimates | Existing attentionCategory/estimatedMinutes fields and category ranges retained; no invented estimate for unclassified tasks. Catalogue defaults deferred below. |
| Client list / dossier | Compact navigation, canonical profile/house-style editors, connected records and quick actions retained. |
| Control center | Overview links carry clientId and ACTIVE/CLOSED scope. CasesList has no completion-date window contract; do not label the closed list as this month. Calendar/time/billing/organization/portal routes exist. Grow card untouched. |
| Portal administration | ClientPortalMemberAdmin shows membership/invitations; global client-portal-admin manages requests/grants, with technical IDs already in explicit details/audit sections. Publication remains case-scoped. No duplicated control plane. |
| Organization | Existing groups/persons include hierarchy, manager/deputy, contacts, responsibility summary. New forms cover these APIs; explicit moves retained, no drag/drop. |
| Calendar | client-calendar/service reads signature/effective/expiry/nextCriticalDate, obligations, entitlements, company milestones, case/task/intake deadlines. No synthesized renewals. day/month/year/five-year views already exist. |
| Billing | hourly-rates resolver selects CASE then CLIENT at work date; billing-preparations snapshots rates/requester organization, review overrides and source fingerprints. BillingReviewWorkspace groups snapshots and existing PDF/invoice-draft flows remain. No accounting integration claim or frontend rate calculation. |
| Visibility | MilestonePublicationPanel has draft/preview/explicit publish, immutable public revisions and safe projection; internal data is not automatically mirrored. |
| Document | Existing review/editor semantics retained, with DOM-order repair described above. |

### Deferred exact task catalogue design (not executed)

PR #213 is OPEN on antigravity/grow-with-us-t2b-observation-snapshot and changes Backend/prisma/schema.prisma. Its schema ownership blocks competing schema edits here.

Current TaskType is a machine enum. WorkPackageTemplateItem belongs to a versioned case-type package, with moduleKey/config and per-case snapshots; it is not an independent reusable task catalogue. Do not overload it or the legacy Task.type compatibility field.

Proposed additive schema:

```prisma
model TaskTypeDefinition {
  id String @id @default(uuid())
  key String @unique
  name String
  description String?
  machineType TaskType
  defaultAttentionCategory ReviewAttentionLevel?
  defaultEstimatedMinutes Int?
  archivedAt DateTime?
  createdById String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  createdBy User @relation("TaskTypeDefinitionCreator", fields: [createdById], references: [id], onDelete: Restrict)
  tasks Task[]
  @@index([archivedAt, name])
  @@map("task_type_definitions")
}
// Add to Task, nullable for all existing rows:
// taskTypeDefinitionId String?
// taskTypeDefinition TaskTypeDefinition? @relation(fields: [taskTypeDefinitionId], references: [id], onDelete: Restrict)
// taskTypeLabel String? (snapshot/free-entry label, not machine enum replacement)
// @@index([taskTypeDefinitionId])
// Add to User: createdTaskTypeDefinitions TaskTypeDefinition[] @relation("TaskTypeDefinitionCreator")
```

Proposed API: GET /task-types (active catalogue); POST /task-types and PATCH /task-types/:id (existing internal configuration-manager policy; archive instead of delete). Existing task-create accepts optional taskTypeDefinitionId/taskTypeLabel. Free text without save stays on the task. Saving reusable definitions is a separate explicit action. Reuse CaseTypeDefinition workforce-configuration scope; do not introduce customer-visible/global-tenant access. Confirm catalogue editing policy before execution.

On creation, validate active definition and snapshot its label; retain existing Task.taskType machine enum. Explicit task attentionCategory/estimatedMinutes overrides win; otherwise copy type defaults; absent exact estimate retains category range. Later catalogue edits must not rewrite existing tasks. Migration only adds table/index/FK/nullable columns, no backfill, no row rewrite. Required replay/PG tests: old task validity, create with/without type, archived selection rejection, override precedence, unchanged task after catalogue edit, authorization and explicit-save behavior.

### Deferred exact work-role design (not executed)

Keep Task.assignedToId as executor/maker. Keep TaskSubmission, TaskReviewDecision, current revision and lifecycle state machine. Do not interpret CaseCollaborator as a Task collaborator.

Add nullable Task.reviewAssignedToId -> User with named relation (designation only; does not grant access), plus:

```prisma
model TaskCollaborator {
  id String @id @default(uuid())
  taskId String
  userId String
  addedById String
  createdAt DateTime @default(now())
  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  user User @relation("TaskCollaboratorUser", fields: [userId], references: [id], onDelete: Restrict)
  addedBy User @relation("TaskCollaboratorCreator", fields: [addedById], references: [id], onDelete: Restrict)
  @@unique([taskId, userId])
  @@index([userId])
  @@map("task_collaborators")
}
// Add to Task: collaborators TaskCollaborator[]
// Add to Task: reviewAssignedToId String?
// Add to Task: reviewAssignedTo User? @relation("TaskPlannedReviewer", fields: [reviewAssignedToId], references: [id], onDelete: Restrict)
// Add to Task: @@index([reviewAssignedToId])
// Add to User: taskCollaborations TaskCollaborator[] @relation("TaskCollaboratorUser")
// Add to User: addedTaskCollaborations TaskCollaborator[] @relation("TaskCollaboratorCreator")
// Add to User: tasksToReview Task[] @relation("TaskPlannedReviewer")
```

Use existing task assignment command for maker. Proposed PATCH /tasks/:id/reviewer and POST/DELETE /tasks/:id/collaborators/:userId use canonical task/case management authorization and active-workforce eligibility. These designations never grant case access. Reviewer actions remain unavailable before an actual submitted revision and still pass existing review authorization; final designation-vs-review-authority policy must be reviewed before implementation. Single-executor tasks retain null reviewer/no collaborator rows. No new review statuses, no duplicate submissions, no automatic completion. Required PG tests cover unauthorized/cross-case assignment, inactive users, pre-submission review rejection, return/resubmit, parallel contributors and legacy tasks. Additive migration only; deferred due to shared schema ownership.

### Explicit AI mapping design (not executed)

Safe candidate: inside AnonymizeModal, explicit "Select a known person" action resolves the current case's authorized client and lists that client's OrganizationPerson records. User chooses one person, explicitly chooses legal role, and explicitly chooses name/email/phone fields to copy into existing editable knownParty fields. No job-title-based legal role, no bulk directory transfer, no automatic AI call. Cancel transfers nothing; existing final anonymization/handoff confirmation still applies. No grants/memberships copied. This is a proposed mapping, not a claim that every employee is a legal party. The legal-role confirmation and overwrite consent contract must be accepted before wiring sensitive data; current manual context remains available.
