# Client Portal v1 Schema Migration Split Plan

Classification target: `client_portal_v1_schema_migration_split_plan_documented_no_runtime_change`

This is a docs-only schema and migration planning document. It does not edit `Backend/prisma/schema.prisma`, create migrations, run Prisma commands, add routes, add UI, modify auth, enable the client portal, seed data, deploy, or change runtime behavior.

## 1. Executive summary

Client Portal v1 needs an additive, default-off database foundation that separates external portal identity, client membership, grants, publications, requests, reports, connector actors, and audit events from internal Adminiculum workflow models.

The safest schema direction is:

- do not expose existing internal models directly to portal users;
- introduce separate portal identity and membership tables first;
- represent visibility with explicit grants/publication records rather than broad client ownership alone;
- add existing-model fields only when they are nullable or default-safe;
- keep all visibility booleans default false;
- make every rollout compatible with `ENABLE_CLIENT_PORTAL=false`;
- avoid required new relations that could break existing production rows;
- prefer revocation/soft state over hard deletion for auditability;
- split connected workflow and integrations into later phases.

The first real schema migration, when approved later, should add inert foundation tables only. No existing case, document, communication, task, report, or client data should become visible to portal users automatically.

## 2. Current schema inventory

### Internal users and roles

Current `User` is an internal workflow user model with role/status, assignments, cases, comments, document versions, review suggestions, notifications, time entries, and automation relations. `UserRole` contains `CLIENT`, but this is not enough for client portal access because it has no client membership, team scope, invitation lifecycle, or resource visibility.

Schema posture:

- internal-only for portal v1;
- may be referenced by future portal records as `invitedByInternalUserId`, `approvedByInternalUserId`, `publishedByInternalUserId`, or `updatedByInternalUserId`;
- should not be reused as the external portal user table.

### Client/account ownership

Current `Client` is the closest account/company owner. It owns cases, documents, departments, matters, workgroups, redaction profiles, and house-style profiles.

Schema posture:

- reliable root for portal membership and account-level settings;
- client fields like `notes`, redaction profile, and house-style internals should remain internal-only unless specifically projected;
- future portal tables should carry `clientId` for fast ownership checks and non-enumerating queries.

### Client workgroups and departments

`ClientWorkgroup`, `Department`, and `Matter` can help model client-side scope, but their current semantics were not created as portal security boundaries.

Schema posture:

- may be reused for pilot team scope if semantics match;
- if external teams differ from internal workgroups/departments, add `ClientPortalTeam`;
- do not assume existing workload records are client-visible.

### Cases

`Case` has reliable `clientId` and optional `matterId`. It also has internal fields and relations: created/assigned users, documents, tasks, timeline events, comments, review suggestions, legal analyses, and handoff packages.

Schema posture:

- good ownership root for portal authorization;
- not safe for direct portal exposure;
- may later need client-visible projection fields, but explicit grants/publication should remain the source of access.

### Documents

`Document` has reliable `caseId` and `clientId`, plus SharePoint identifiers/URLs, workspace text, versions, review suggestions, anonymized documents, comments, and timeline events.

Schema posture:

- good ownership root for document authorization;
- not safe for direct portal exposure because storage/review/workspace fields are internal;
- future visibility should use document publication/grants and optional default-safe fields.

### Communications

`Communication` has optional `caseId`, `clientId`, `documentId`, full content, summary, provider metadata, recipients, attachments, and related tasks. Ownership is present when `clientId`/`caseId` are populated, but not guaranteed for every row.

Schema posture:

- internal communication model;
- do not expose raw threads directly;
- publish selected messages through a portal message/publication layer.

### Tasks

`Task` belongs to a case and may link to a source communication. It includes assignment, skill, complexity, risk, stuck reason, maturity, deadlines, and history.

Schema posture:

- internal-only for portal v1;
- client-facing status or next-step information should be published separately, not by exposing task rows.

### Time entries and reports

`TimeEntry`, `TimesheetReportInstance`, `TimesheetReportArtifact`, and `TimesheetPreset` are internal billing/workload/reporting foundations.

Schema posture:

- internal-only by default;
- monthly client portal reports should be generated as approved snapshots, not live raw time-entry queries.

### Document review, AI, legal analysis, handoff

`DocumentReviewSuggestion`, `AnonymousDocument`, `ClientRedactionProfile`, `GenerationDraft`, `ContractGeneration`, `LegalAnalysis`, `ContractReviewRecord`, `BlockReviewNote`, and `LawyerHandoffPackage` contain lawyer work product, AI/rehydration content, review notes, draft data, and handoff workflow.

Schema posture:

- never directly exposed to client portal users;
- only explicit, approved, sanitized outputs may be copied or referenced into portal publication records.

## 3. Schema design principles

1. Default off: every new visibility path defaults to non-visible.
2. Additive only: first migrations add tables/nullable/default-safe columns only.
3. No broad backfill: existing data remains internal until manually granted/published.
4. Client ownership first: portal tables should include `clientId` for query-time scoping.
5. Grants over broad ownership: client-owned does not mean client-visible.
6. Publication over raw internal rows: client-safe copies/projections are safer than exposing internal models.
7. Soft revocation: prefer status/revoked fields over hard delete.
8. Audit every sensitive action: invites, membership changes, publication, revocation, downloads, uploads, messages, preview, connector sync.
9. Non-enumerating queries: later route queries should include resource ID + client/membership/grant filters together.
10. Avoid enum churn: use enums only where values are stable; consider constrained strings for rapidly evolving connector/status concepts.

## 4. Proposed portal entities

### `ClientPortalUser`

Purpose:

- External human portal identity, separate from internal `User`.

Proposed fields:

- `id`
- `email`
- `displayName`
- `status`: invited / active / suspended / revoked
- `lastLoginAt`
- `createdAt`
- `updatedAt`
- `deletedAt` or `revokedAt`
- `authProvider`
- `externalSubject`
- `metadata` JSON

Security relevance:

- No access without active membership.
- Supports revocation independent of internal staff accounts.
- Avoids confusing external contacts with internal assignees/authors.

Relations:

- `ClientPortalMembership`
- `ClientPortalInvitation`
- `ClientPortalAuditEvent`
- client-uploaded documents/messages/requests.

MVP:

- Required in CP-SCHEMA-1.

### `ClientPortalMembership`

Purpose:

- Main access gate linking portal user to client/account/company and role/scope.

Proposed fields:

- `id`
- `clientPortalUserId`
- `clientId`
- `role`
- `status`
- `teamId` optional
- `invitedByInternalUserId`
- `approvedByInternalUserId`
- `createdAt`
- `updatedAt`
- `revokedAt`

Security relevance:

- Must be checked before case/document/message/report access.
- Allows a user to belong to multiple clients without broad global access.
- Allows team-scoped access.

Relations:

- `ClientPortalUser`
- `Client`
- optional `ClientPortalTeam` or `ClientWorkgroup`
- internal `User` references for invite/approval metadata.

MVP:

- Required in CP-SCHEMA-1.

### `ClientPortalTeam`

Purpose:

- Client-side department/team scope such as HR, Finance, Sales, Management.

Proposed fields:

- `id`
- `clientId`
- `name`
- `slug` or `code`
- `status`
- `createdAt`
- `updatedAt`

Security relevance:

- Prevents team leads/requesters from seeing all client-company matters.

Relations:

- `Client`
- `ClientPortalMembership`
- `ClientPortalCaseAccess`
- `ClientPortalRequest`

MVP:

- Recommended in CP-SCHEMA-1 if pilot needs team scoping; otherwise can be deferred and use whole-client membership only.

### `ClientPortalInvitation`

Purpose:

- Invite flow for external users.

Proposed fields:

- `id`
- `email`
- `clientId`
- `proposedRole`
- `proposedTeamId`
- `invitedByInternalUserId`
- `tokenHash` or `invitationCodeHash`
- `expiresAt`
- `acceptedAt`
- `revokedAt`
- `status`

Security relevance:

- No domain-only auto-access.
- Token must be stored hashed.
- Acceptance should create/activate a portal user and membership only after validation.

MVP:

- Required unless identity provider provisioning fully replaces invite flow.

### `ClientPortalCaseAccess` / `ClientCaseGrant`

Purpose:

- Explicit grant that a portal user, team, role, or whole client may see a case.

Proposed fields:

- `id`
- `caseId`
- `clientId`
- `grantType`: user / team / role / client
- `granteeUserId` optional
- `granteeTeamId` optional
- `granteeRole` optional
- `visibilityScope`
- `grantedByInternalUserId`
- `approvedAt`
- `revokedAt`
- `createdAt`

Security relevance:

- Case is not visible solely because it belongs to a client unless policy explicitly allows client-wide grants.
- Enables non-enumerating lookup by case/client/grant.

MVP:

- Required before case list/detail routes are enabled.

### Future case client-visible projection fields

Possible future fields on `Case`:

- `clientPortalEnabled` Boolean default false
- `clientVisible` Boolean default false
- `clientVisibleTitle` String nullable
- `clientVisibleSummary` String nullable
- `clientVisibleStatus` String nullable
- `clientVisibleNextStep` String nullable
- `clientVisibleDeadline` DateTime nullable
- `clientPublishedAt` DateTime nullable
- `clientPublishedByUserId` String nullable

Security notes:

- These are projections only, not sufficient authorization by themselves.
- Keep default false/nullable.
- Do not add required fields.

MVP:

- Useful in CP-SCHEMA-2 if case display copy needs to be decoupled from internal titles/statuses.

### `ClientPortalDocumentGrant` / `DocumentPublication`

Purpose:

- Controls which documents are visible/downloadable by portal users.

Proposed fields:

- `id`
- `documentId`
- `caseId` optional but recommended for fast scoping
- `clientId`
- `grantType`: case / user / team / client
- `visibilityStatus`: draft / proposed / approved / published / revoked
- `publishedAt`
- `publishedByInternalUserId`
- `revokedAt`
- `revokedByInternalUserId`
- `downloadAllowed`
- `expiresAt` optional

Security relevance:

- Uploaded documents start inbound/pending, not published.
- Internal/review/privileged documents remain hidden until explicitly published.

MVP:

- Required before document list/download routes are enabled.

### Future document client-portal fields

Possible future fields on `Document`:

- `clientUploaded` Boolean default false
- `uploadedByClientPortalUserId` nullable
- `clientVisible` Boolean default false
- `clientVisibilityStatus` nullable/default hidden
- `internalOnly` Boolean default false
- `reviewOnly` Boolean default false
- `privileged` Boolean default false
- `source`: internal / client_upload / external_connector
- `virusScanStatus` nullable/default pending/not_required
- `approvedForClientAt` nullable
- `approvedForClientByUserId` nullable

Security notes:

- Prefer publication table as source of truth for visibility.
- Fields on `Document` help upload/review workflows but must not replace grant checks.

MVP:

- `clientUploaded`, uploader, and status fields are useful when uploads are introduced.
- `virusScanStatus` may be nullable placeholder until scanning exists.

### `ClientPortalMessage` / `CommunicationPublication`

Purpose:

- Avoid exposing raw `Communication` threads. Publish approved messages to portal.

Option A: separate `ClientPortalMessage`

- Pros: stores client-safe body, clear publication state, no raw provider metadata.
- Cons: duplicates some message content and needs sync/reference logic.

Option B: publication layer over existing `Communication`

- Pros: fewer tables and preserves link to internal communication.
- Cons: higher leak risk if internal fields are accidentally mapped.

Recommendation:

- Use separate `ClientPortalMessage` for v1, with optional `sourceCommunicationId`.

Proposed fields:

- `id`
- `caseId` or `requestId`
- `clientId`
- `direction`: client_to_firm / firm_to_client / system_status
- `sourceCommunicationId` optional
- `body`
- `subject` optional
- `status`: draft / proposed / approved / published / hidden
- `createdByClientPortalUserId` optional
- `createdByInternalUserId` optional
- `approvedByInternalUserId` optional
- `publishedAt`
- `hiddenAt`

Security relevance:

- Internal communication is never exposed by default.
- AI-drafted or raw imported messages are not visible until approved and copied/projection-written.

MVP:

- Required before portal messages are enabled.

### `ClientPortalRequest`

Purpose:

- Client-side legal request object, especially for second-level portal workflows before a matter becomes a full internal case.

Proposed fields:

- `id`
- `clientId`
- `createdByClientPortalUserId`
- `teamId`
- `title`
- `description`
- `category`
- `priority`
- `requestedDeadline`
- `status`
- `linkedCaseId` optional
- `linkedCommunicationId` optional
- `source`: portal / email / external_workflow / internal_created
- `clientVisibleStatus`
- `createdAt`
- `updatedAt`
- `closedAt`

Security relevance:

- Lets portal intake exist without immediately exposing or creating broad internal case state.
- Can later become/link to a `Case` after triage.

MVP:

- Defer unless v1 includes request creation. Required for "workspace" level portal.

### `ClientPortalFeatureSettings`

Purpose:

- Per-client portal level and enabled features under global env gates.

Proposed fields:

- `id`
- `clientId`
- `portalLevel`: off / basic / workspace / connected
- `uploadsEnabled`
- `messagesEnabled`
- `reportsEnabled`
- `integrationsEnabled`
- `monthlyReportEnabled`
- `teamAccessEnabled`
- `clientAdminEnabled`
- `defaultCaseVisibilityPolicy`
- `createdAt`
- `updatedAt`
- `updatedByInternalUserId`

Security relevance:

- Global feature gates remain necessary; per-client settings are not enough.
- Prevents every client from receiving portal features at once.

MVP:

- Required for controlled pilot if more than one client exists in production.

### `ClientPortalAuditEvent`

Purpose:

- Audit all client-visible access and publication actions.

Proposed fields:

- `id`
- `clientId`
- `actorType`: client_user / internal_user / connector / system
- `actorId`
- `action`
- `resourceType`
- `resourceId`
- `caseId` optional
- `documentId` optional
- `communicationId` optional
- `requestId` optional
- `metadata` JSON
- `ipAddress` optional
- `userAgent` optional
- `createdAt`

Events:

- login
- view_case
- upload_document
- download_document
- send_message
- publish_message
- publish_document
- revoke_document
- approve_client_visible_status
- external_sync_inbound
- external_sync_outbound
- membership_invited
- membership_revoked

Security relevance:

- Required for auditability, incident response, and support.

MVP:

- Required in CP-SCHEMA-1.

### `ClientPortalReportSnapshot`

Purpose:

- Monthly report as a safe approved snapshot, not raw internal query exposure.

Proposed fields:

- `id`
- `clientId`
- `month`
- `generatedAt`
- `generatedByInternalUserId` or system actor
- `status`: draft / approved / published / revoked
- `summaryJson`
- `publishedAt`
- `revokedAt`

Security relevance:

- Prevents per-minute internal time-entry exposure unless explicitly approved.
- Supports report revocation.

MVP:

- Defer unless reports are part of the first portal release.

### External connector/workflow entities

Optional later entities:

- `ExternalConnection`
- `ExternalWorkflowQueue`
- `ExternalObjectLink`
- `ExternalWorkflowEvent`
- `ExternalSyncApproval`
- `ExternalSyncLog`

Security relevance:

- Third-level connected portal needs connector actors that are not internal users.
- Outbound sync needs approval and audit.

MVP:

- Deferred beyond Client Portal v1 unless a connected pilot is explicitly selected.

## 5. Existing model future field additions

### `Client`

| Field | Type | Default/nullability | Purpose | Risk | Phase |
| --- | --- | --- | --- | --- | --- |
| `clientPortalEnabled` | Boolean | default false | Account-level portal readiness | Low if default false | CP-SCHEMA-1/2 |
| `clientPortalLevel` | String/enum | default `off` | off/basic/workspace/connected | Medium if enum changes | CP-SCHEMA-1 |
| `clientPortalSettingsId` | String? | nullable | optional settings relation | Low | CP-SCHEMA-1 |

Recommendation: prefer `ClientPortalFeatureSettings` as primary source and keep `Client` fields minimal or avoid them.

### `Case`

| Field | Type | Default/nullability | Purpose | Risk | Phase |
| --- | --- | --- | --- | --- | --- |
| `clientPortalEnabled` | Boolean | default false | Case eligible for portal | Low | CP-SCHEMA-2 |
| `clientVisible` | Boolean | default false | Shortcut for visible projection | Medium if used instead of grant | CP-SCHEMA-2 |
| `clientVisibleTitle` | String? | nullable | Client-safe title | Low | CP-SCHEMA-2 |
| `clientVisibleSummary` | String? | nullable | Client-safe summary | Medium, content approval needed | CP-SCHEMA-2 |
| `clientVisibleStatus` | String? | nullable | Client-friendly status | Low | CP-SCHEMA-2 |
| `clientVisibleNextStep` | String? | nullable | Client-facing next step | Medium, lawyer approval | CP-SCHEMA-2 |
| `clientVisibleDeadline` | DateTime? | nullable | Safe client deadline | Medium | CP-SCHEMA-2 |
| `clientPublishedAt` | DateTime? | nullable | Publication timestamp | Low | CP-SCHEMA-2 |
| `clientPublishedByUserId` | String? | nullable | Internal approver/publisher | Low | CP-SCHEMA-2 |

Recommendation: use `ClientPortalCaseAccess` as authorization source; use case fields only as client-safe projection cache.

### `Document`

| Field | Type | Default/nullability | Purpose | Risk | Phase |
| --- | --- | --- | --- | --- | --- |
| `clientUploaded` | Boolean | default false | Marks inbound portal upload | Low | CP-SCHEMA-3/8 |
| `uploadedByClientPortalUserId` | String? | nullable | External uploader | Low | CP-SCHEMA-3/8 |
| `clientVisible` | Boolean | default false | Shortcut visibility | Medium if used without grants | CP-SCHEMA-2 |
| `clientVisibilityStatus` | String/enum? | nullable/default hidden | Publication workflow | Low/medium | CP-SCHEMA-2 |
| `internalOnly` | Boolean | default false | Explicit internal block | Low | CP-SCHEMA-2 |
| `reviewOnly` | Boolean | default false | Blocks review drafts | Low | CP-SCHEMA-2 |
| `privileged` | Boolean | default false | Blocks privileged material | Low | CP-SCHEMA-2 |
| `source` | String/enum? | nullable/default internal | internal/client_upload/connector | Medium if enum churn | CP-SCHEMA-3 |
| `virusScanStatus` | String? | nullable | future scanning | Low if nullable | CP-SCHEMA-3 |
| `approvedForClientAt` | DateTime? | nullable | approval marker | Low | CP-SCHEMA-2 |
| `approvedForClientByUserId` | String? | nullable | internal approver | Low | CP-SCHEMA-2 |

Recommendation: use document publication table as the authoritative access record.

### `Communication`

| Field | Type | Default/nullability | Purpose | Risk | Phase |
| --- | --- | --- | --- | --- | --- |
| `clientVisible` | Boolean | default false | Shortcut publication flag | Medium/high if raw content exposed | CP-SCHEMA-2 |
| `approvedForClientAt` | DateTime? | nullable | approval marker | Medium | CP-SCHEMA-2 |
| `approvedForClientByUserId` | String? | nullable | internal approver | Low | CP-SCHEMA-2 |
| `clientPortalMessageId` | String? | nullable | link to safe portal message | Low | CP-SCHEMA-2/3 |

Recommendation: do not expose `Communication.content` or `summary`; publish safe copies through `ClientPortalMessage`.

### `Task`

| Field | Type | Default/nullability | Purpose | Risk | Phase |
| --- | --- | --- | --- | --- | --- |
| none for v1 | n/a | n/a | Keep tasks internal | Low | n/a |

Recommendation: do not add client visibility to internal `Task` in v1. Publish client-facing next steps/status instead.

### `User`

| Field | Type | Default/nullability | Purpose | Risk | Phase |
| --- | --- | --- | --- | --- | --- |
| none for v1 | n/a | n/a | Keep internal user model stable | Low | n/a |

Recommendation: do not add portal identity fields to internal `User` unless a later migration explicitly introduces optional cross-linking.

## 6. Enum strategy

Enums improve consistency but are expensive to change in PostgreSQL/Prisma. Use enums where values are stable and central to authorization. Consider strings for rapidly evolving connector/provider states.

### Recommended v1 enums

`ClientPortalUserStatus`

- `INVITED`
- `ACTIVE`
- `SUSPENDED`
- `REVOKED`

Needed: v1.

`ClientPortalMembershipStatus`

- `ACTIVE`
- `SUSPENDED`
- `REVOKED`
- `EXPIRED`

Needed: v1.

`ClientPortalRole`

- `CLIENT_REQUESTER`
- `CLIENT_TEAM_LEAD`
- `CLIENT_MANAGER`
- `CLIENT_ADMIN`

Needed: v1.

`ClientPortalLevel`

- `OFF`
- `BASIC`
- `WORKSPACE`
- `CONNECTED`

Needed: v1 if per-client settings are introduced.

`ClientPortalVisibilityStatus`

- `DRAFT`
- `PROPOSED`
- `APPROVED`
- `PUBLISHED`
- `REVOKED`

Needed: v1 for document/message/report publication.

`ClientPortalGrantType`

- `USER`
- `TEAM`
- `ROLE`
- `CLIENT`
- `CASE`

Needed: v1.

`ClientPortalVisibilityScope`

- `OWN`
- `TEAM`
- `COMPANY`
- `EXPLICIT`
- `REPORT_ONLY`

Needed: v1 if grants support multiple scopes.

`ClientPortalActorType`

- `CLIENT_USER`
- `INTERNAL_USER`
- `CONNECTOR`
- `SYSTEM`

Needed: v1 audit.

### Potential v1/later enums

`ClientPortalRequestStatus`

- `NEW`
- `TRIAGED`
- `IN_PROGRESS`
- `WAITING_FOR_CLIENT`
- `CLOSED`
- `CANCELLED`

Needed: CP-SCHEMA-3.

`ClientPortalRequestSource`

- `PORTAL`
- `EMAIL`
- `EXTERNAL_WORKFLOW`
- `INTERNAL_CREATED`

Needed: CP-SCHEMA-3.

`ClientPortalAuditAction`

- Could be enum for strictness, but may churn quickly.
- Prefer string plus tested constants in application code for first implementation.

Needed: v1 audit, but string may be safer initially.

`ExternalConnectionStatus`

- `CONFIGURED`
- `ACTIVE`
- `PAUSED`
- `ERROR`
- `REVOKED`

Needed: later.

`ExternalIntegrationLevel`

- `READ_ONLY`
- `INBOUND_ONLY`
- `BIDIRECTIONAL_APPROVAL_REQUIRED`
- `BIDIRECTIONAL_AUTOMATED`

Needed: later.

## 7. Index and constraint strategy

### Identity and invitation

- `ClientPortalUser.email`: unique if email is the only identity provider in v1.
- Prefer `(authProvider, externalSubject)` unique if external identity providers are used.
- Consider case-insensitive email storage/normalization.
- `ClientPortalInvitation.tokenHash`: unique index; never store raw token.
- `ClientPortalInvitation.email + clientId + status`: index for pending invite lookup.

Avoid:

- assuming email is globally sufficient forever if SSO/B2C is introduced.

### Membership

- index `ClientPortalMembership.clientPortalUserId`
- index `ClientPortalMembership.clientId`
- index `ClientPortalMembership.teamId`
- index `(clientPortalUserId, clientId, status)`
- unique active membership should be carefully designed; avoid blocking multiple roles/teams for one user.

Possible constraint:

- unique `(clientPortalUserId, clientId, teamId, role)` for non-revoked memberships if partial unique indexes are available in SQL migration.

Avoid:

- overly strict global uniqueness that prevents a user having roles in multiple clients.

### Case grants

- index `ClientPortalCaseAccess.caseId`
- index `ClientPortalCaseAccess.clientId`
- index `(caseId, clientId, revokedAt)`
- index `(clientId, grantType, granteeTeamId)`
- index `(clientId, grantType, granteeUserId)`
- index `(clientId, grantType, granteeRole)`

### Document publication

- index `DocumentPublication.documentId`
- index `DocumentPublication.caseId`
- index `DocumentPublication.clientId`
- index `(clientId, caseId, visibilityStatus)`
- index `(documentId, visibilityStatus)`

### Portal messages

- index `ClientPortalMessage.clientId`
- index `ClientPortalMessage.caseId`
- index `ClientPortalMessage.requestId`
- index `ClientPortalMessage.sourceCommunicationId`
- index `(clientId, caseId, status, publishedAt)`

### Requests

- index `ClientPortalRequest.clientId`
- index `ClientPortalRequest.teamId`
- index `ClientPortalRequest.createdByClientPortalUserId`
- index `ClientPortalRequest.linkedCaseId`
- index `(clientId, status, createdAt)`

### Audit

- index `ClientPortalAuditEvent.clientId`
- index `ClientPortalAuditEvent.actorType, actorId`
- index `ClientPortalAuditEvent.resourceType, resourceId`
- index `ClientPortalAuditEvent.caseId`
- index `ClientPortalAuditEvent.documentId`
- index `ClientPortalAuditEvent.createdAt`

### Reports

- unique `(clientId, month)` may be too strict if drafts/revisions are needed.
- Prefer index `(clientId, month, status)` and optional `revision`.

## 8. Migration split plan

### CP-SCHEMA-0 — docs and contract only

Purpose:

- Current step; no schema changes.

Tables/fields:

- None.

Risk:

- None runtime.

Tests:

- `git diff --check`; backend validation if practical.

Rollback:

- Revert docs commit only.

Deploy compatibility:

- No deploy needed.

### CP-SCHEMA-1 — foundation tables, no runtime use

Purpose:

- Add inert portal identity, membership, invitation, settings, and audit tables.

Tables:

- `ClientPortalUser`
- `ClientPortalTeam`
- `ClientPortalMembership`
- `ClientPortalInvitation`
- `ClientPortalFeatureSettings`
- `ClientPortalAuditEvent`

Fields on existing models:

- Avoid if possible; optionally add `Client.clientPortalLevel` or rely only on settings table.

Risk:

- Low if additive/inert and feature gate remains off.
- Main risk is enum/casing/index mistakes.

Tests:

- Prisma validate/typecheck.
- Migration SQL review.
- DB drift audit before apply.
- Post-apply introspection.
- Existing client portal guard still `501`.

Rollback/abandon:

- Since runtime does not use tables, abandon by leaving inert tables or dropping only after explicit DBA review.

Deploy compatibility:

- Can be deployed/applied while feature gate remains off, after clone/staging proof.

### CP-SCHEMA-2 — visibility/publication layer

Purpose:

- Add resource access controls and publication state.

Tables/fields:

- `ClientPortalCaseAccess`
- `DocumentPublication` / `ClientPortalDocumentGrant`
- `ClientPortalMessage` or `CommunicationPublication`
- optional case client-visible projection fields.
- optional document client portal flags.

Risk:

- Medium: this is the layer that prevents leaks. Schema must support restrictive queries.

Tests:

- grant required;
- no existing case/document/communication visible by default;
- revoked grants hidden;
- non-enumerating query patterns.

Rollback/abandon:

- Leave inert tables if no runtime use; if runtime use begins, disable gate first.

Deploy compatibility:

- Safe with gate off; do not enable routes until DTO tests pass.

### CP-SCHEMA-3 — request/workspace layer

Purpose:

- Add client-side request intake and request-case/message/document relationships.

Tables/fields:

- `ClientPortalRequest`
- optional request attachments table if not using `Document` plus upload metadata.
- request-case link fields.
- upload status fields if client uploads start here.

Risk:

- Medium: client-generated content enters internal workflow.

Tests:

- request ownership;
- client upload pending state;
- linked case not auto-visible;
- inbound messages/request triage.

Rollback/abandon:

- Disable request/upload gates; preserve audit and inbound records.

Deploy compatibility:

- Gate off until endpoint tests and storage/security review pass.

### CP-SCHEMA-4 — reports

Purpose:

- Add approved monthly report snapshots.

Tables:

- `ClientPortalReportSnapshot`

Risk:

- Medium/high if report snapshot accidentally includes raw internal billing/time data.

Tests:

- report must be approved/published;
- draft not visible;
- revoked not visible;
- DTO excludes raw time entries unless explicitly approved.

Rollback/abandon:

- Disable reports gate; leave snapshots for audit if created.

Deploy compatibility:

- Gate off by default.

### CP-SCHEMA-5 — connected workflow foundation

Purpose:

- Add foundation for Jira/Bitrix/Teams/Asana/Monday and external workflow sync.

Tables:

- `ExternalConnection`
- `ExternalWorkflowQueue`
- `ExternalObjectLink`
- `ExternalWorkflowEvent`
- `ExternalSyncApproval`
- `ExternalSyncLog`

Risk:

- High: external systems can create or sync sensitive work.

Tests:

- connector actor isolation;
- configured queue/project only;
- outbound approval required;
- audit events for every sync;
- no connector internal-user privilege.

Rollback/abandon:

- Disable integrations gate; revoke connector credentials/settings; preserve audit logs.

Deploy compatibility:

- Separate migration/ticket; not part of Client Portal v1 MVP unless explicitly approved.

## 9. Backfill and default-off strategy

Principles:

- No existing `Case` becomes client-visible automatically.
- No existing `Document` becomes client-visible automatically.
- No existing `Communication` becomes client-visible automatically.
- Default portal level is off.
- Membership must be explicit.
- Publication must be explicit.
- Feature gates remain off until route and DTO implementation is complete.

Possible future backfill scripts:

- create `ClientPortalFeatureSettings` with `portalLevel=OFF` for all clients;
- create `ClientPortalTeam` manually for a pilot client;
- create invitations only for explicitly approved external contacts;
- create no case grants unless selected by an internal lawyer/admin;
- create no document grants automatically;
- create no communication publications automatically.

Backfill safety:

- Run in clone/staging first.
- Make scripts idempotent.
- Log counts only; do not log sensitive row contents.
- Require explicit allowlist of pilot client IDs.

## 10. Revocation and audit strategy

Prefer status/revocation fields over hard deletes.

Revoked client user:

- set `ClientPortalUser.status=REVOKED` or `SUSPENDED`;
- preserve memberships/audit events;
- invalidate sessions/tokens in runtime implementation.

Deleted/deactivated membership:

- set membership `status=REVOKED`;
- set `revokedAt`, `revokedByInternalUserId`;
- future queries filter active memberships only.

Employee leaving client company:

- revoke all memberships;
- preserve audit history.

Document publication revoked:

- set publication status `REVOKED`;
- set `revokedAt`, `revokedByInternalUserId`;
- keep original document unchanged.

Message hidden:

- set `ClientPortalMessage.status=HIDDEN` or `REVOKED`;
- preserve source communication and audit.

Case access revoked:

- set grant `revokedAt`;
- future list/detail queries omit it.

Report snapshot revoked:

- set status `REVOKED`;
- preserve snapshot for audit unless retention policy requires deletion.

Audit:

- audit membership invitation/revocation, publication/revocation, downloads, uploads, messages, login, preview, connector events.
- audit metadata must avoid storing secrets or unnecessary full document/message bodies.

## 11. Upload schema considerations

Future client uploads need schema support for:

- uploader portal user ID;
- original filename;
- storage key or SharePoint item reference;
- upload status;
- pending internal review status;
- virus scan status placeholder;
- linked visible request/case;
- publication grant only after approval;
- file size and MIME type;
- checksum if useful;
- audit event.

Recommended states:

- `UPLOADED`
- `SCAN_PENDING`
- `SCAN_CLEAN`
- `SCAN_BLOCKED`
- `PENDING_INTERNAL_REVIEW`
- `APPROVED_FOR_CLIENT`
- `REJECTED`

Security notes:

- Client upload does not mean published to all client users.
- Upload may be visible to uploader as "submitted" before it is published more broadly.
- Internal review and publication are separate steps.

## 12. Approval/publication schema

Minimum publication fields:

- `proposedBy`
- `proposedAt`
- `approvedBy`
- `approvedAt`
- `publishedAt`
- `revokedAt`
- `revokedBy`
- `visibilityStatus`
- optional `version` or `revision`

Apply to:

- case status and next-step publication;
- document publication;
- message publication;
- monthly report publication;
- outbound integration status.

Recommendation:

- use a common visibility enum/status values across case/document/message/report where possible;
- keep content-specific fields in their own tables;
- avoid marking internal source rows as client-visible without a publication record.

## 13. Non-enumeration support

Schema must support ownership checks without fetching raw internal rows first.

Required query support:

- `clientId` on portal objects;
- `caseId` relation with client ownership;
- grant tables with active status/revocation;
- active membership filters;
- team filters;
- published/approved visibility status filters.

Future route query pattern:

- do not fetch by `id` first and then check ownership;
- query using `id + clientId + active membership + grant/publication condition` together;
- return `404` when no row matches;
- use `403` only when no specific resource existence is disclosed and role/action is generally forbidden.

Example conceptual filter:

- `case.id = :caseId`
- `case.clientId IN activeMembership.clientIds`
- active grant exists for user/team/role/client
- grant not revoked
- case not archived/withheld

## 14. DTO implications

### `ClientPortalMeDTO`

Allowed:

- portal user id, email, display name;
- active memberships;
- portal roles;
- enabled feature summary.

Forbidden:

- internal `User` role hierarchy;
- internal user IDs unless explicitly mapped;
- auth secrets/provider internals.

### `ClientPortalCaseListItemDTO`

Allowed:

- client-safe case reference/title/status;
- visible next step;
- visible deadline;
- visible document/message counts.

Forbidden:

- internal assignees/collaborators;
- internal task list;
- timeline payloads;
- risk/AI/legal analysis fields.

### `ClientPortalCaseDetailDTO`

Allowed:

- client-safe details and published status/next-step;
- visible documents/messages/request links.

Forbidden:

- comments, legal analyses, handoff packages, review suggestions, workflow graph/history.

### `ClientPortalDocumentDTO`

Allowed:

- document id, file name, type, version, published timestamp, download flag.

Forbidden:

- `spItemId`, `spPath`, `spWebUrl`, workspace text, review comments, AI review output, SharePoint drive IDs.

### `ClientPortalMessageDTO`

Allowed:

- subject, safe body/preview, direction, timestamp, published attachments metadata.

Forbidden:

- raw internal communication content, provider metadata, internal summary, task details, mailbox IDs.

### `ClientPortalRequestDTO`

Allowed:

- request title/description/status/category/deadline and visible links.

Forbidden:

- internal triage notes, internal tasks, lawyer strategy, hidden communications.

### `ClientPortalMonthlyReportDTO`

Allowed:

- approved summary snapshot.

Forbidden:

- raw time-entry detail, capacity planning, per-minute internal billing unless approved.

### `ClientPortalIntegrationStatusDTO`

Allowed:

- high-level connected/paused/error status.

Forbidden:

- secrets, tokens, provider admin URLs, mailbox/project internal identifiers unless approved.

### `ClientPortalAuditEventDTO`

Allowed:

- user-facing event history if product requires it.

Forbidden:

- internal security metadata, IP/user agent unless policy permits, internal actor details beyond safe display.

## 15. Risk register

| Risk | Severity | Mitigation | Phase affected |
| --- | --- | --- | --- |
| `CLIENT` role confused with portal identity | Critical | Separate `ClientPortalUser` and portal middleware | CP-SCHEMA-1/runtime |
| Portal table missing `clientId` | Critical | Require `clientId` on portal access/publication/audit tables | All phases |
| Documents become auto-visible | Critical | Default false, publication table required, no backfill | CP-SCHEMA-2 |
| Raw `Communication` reused | Critical | Use `ClientPortalMessage` safe copy/projection | CP-SCHEMA-2/3 |
| Internal `Task` exposed | High | Keep tasks internal; publish next-step/status only | CP-SCHEMA-2 |
| Broad company-level access by default | High | Require grants and role/team scopes | CP-SCHEMA-2 |
| Revocation missing | High | Add status/revoked fields and active filters | CP-SCHEMA-1/2 |
| Audit missing | High | Add `ClientPortalAuditEvent` in foundation | CP-SCHEMA-1 |
| Connector treated as internal user | High | Separate connector actor tables/scopes | CP-SCHEMA-5 |
| Migration adds required fields | High | Nullable/default-safe additive fields only | All phases |
| Enum design too rigid | Medium | Use enums for stable statuses; strings for churn-heavy connector actions | All phases |
| Invitation token stored raw | Critical | Store only hash, index hash | CP-SCHEMA-1 |
| Backfill accidentally publishes data | Critical | No automatic grants/publications; pilot allowlist only | CP-SCHEMA-1/2 |
| Non-enumeration impossible due to schema | High | Include `clientId`, grants, active status indexes | CP-SCHEMA-2 |

## 16. Required future tests

Schema-backed future implementation test groups:

- membership required for every portal resource;
- portal feature off returns `501`;
- case access grant required;
- team-scoped visibility works;
- document publication required;
- upload starts pending review and not broadly visible;
- communication publication required;
- revoked membership loses access;
- revoked case grant loses access;
- revoked document publication loses access;
- monthly report visible only if published;
- non-enumerating `404` for unauthorized resource IDs;
- connector actor cannot access client-user routes;
- connector actor cannot access internal APIs;
- internal preview uses client DTO only;
- internal preview creates audit event;
- no portal DTO includes internal task, review, AI, SharePoint, provider, or raw communication fields.

Migration test expectations:

- Prisma validate passes.
- Migration applies to clone/staging.
- Post-apply introspection proves expected tables, indexes, FKs.
- Existing backend tests still pass with feature gate off.
- Client portal guard remains `501 CLIENT_PORTAL_NOT_ENABLED`.
- No existing rows become visible after migration.

## 17. Recommended implementation order

1. Keep current portal gate closed.
2. Review this schema split plan with product/security.
3. Create `CLIENTPORTAL1C` docs-only migration draft review.
4. Run read-only DB drift audit before any schema file change.
5. Draft CP-SCHEMA-1 migration only.
6. Apply CP-SCHEMA-1 to clone/staging only.
7. Verify introspection and no runtime behavior change.
8. Apply CP-SCHEMA-1 to production only after explicit approval.
9. Add portal auth/policy skeleton with gate off.
10. Add `/api/v1/client-portal/me` only after auth split is proven.
11. Add case grants and read-only case DTOs.
12. Add document publication and mediated download.
13. Add portal requests/messages/uploads.
14. Add reports and integrations only after separate audits.

## 18. Open questions

- Should portal identity use invite/magic-link first, Azure B2C, Entra external identities, or another provider?
- Should `ClientPortalUser.email` be globally unique or scoped by auth provider?
- Should `ClientPortalTeam` reuse `ClientWorkgroup`, or should portal teams be separate?
- Should case visibility require grants only, or also use direct `Case.clientPortalEnabled`?
- Should document visibility require publication rows only, or also use document flags?
- Should `ClientPortalMessage` store a copied safe body or a pointer plus approved projection?
- Should audit actions be enum or string constants?
- Should report snapshots support multiple revisions per client/month?
- What retention policy applies to revoked portal users, downloads, uploads, and messages?
- Which internal role is allowed to publish client-visible content?
- Should connector foundation be planned before or after basic portal MVP?

## Plan conclusion

Client Portal v1 schema work should start with inert, additive identity/membership/settings/audit tables and proceed only after drift review and clone/staging proof. Visibility must be represented through explicit grants and publication records. Existing internal models remain internal by default, and no current case, document, communication, task, review, AI output, report, or connector data becomes client-visible without explicit future authorization and publication.

Final classification: `client_portal_v1_schema_migration_split_plan_documented_no_runtime_change`
