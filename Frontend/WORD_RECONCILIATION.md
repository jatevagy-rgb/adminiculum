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
