# Client Portal v1 Identity and Authorization Split Plan

Classification target: `client_portal_v1_identity_authorization_plan_documented_no_runtime_change`

This document is a planning artifact only. It does not apply schema changes, create migrations, add routes, change auth behavior, add UI, enable client portal flags, or modify runtime behavior.

## 1. Executive summary

Client Portal v1 must be designed as a separate security boundary from the internal Adminiculum workspace. The portal user is an external actor connected to a client company/account/team and to explicitly visible resources. The internal user is an Adminiculum operator connected to legal workflow, case operations, document review, communications triage, and administrative surfaces.

The safest v1 path is:

- keep existing internal APIs under `/api/v1/...` as internal-only;
- keep future client APIs isolated under `/api/v1/client-portal/...`;
- introduce a separate client portal identity and membership concept;
- authorize every client request through membership plus resource-level visibility checks;
- return client-specific DTOs only;
- fail closed and avoid resource enumeration;
- keep `ENABLE_CLIENT_PORTAL` and subfeature gates off until implementation and tests are complete.

The existing `CLIENT` role in the internal `UserRole` enum should not be treated as the client portal model. It is, at most, a legacy/internal role label until a proper portal identity contract exists.

## 2. Why `CLIENT` role is not enough

A client portal user is not just a `User` with role `CLIENT`.

The portal needs more context than a generic role can carry:

- which client/company/account the user belongs to;
- which team, department, workgroup, or request scope the user may access;
- which role the user has inside that client;
- whether the membership is active, invited, suspended, expired, or revoked;
- whether a specific case/document/message is client-visible;
- whether a resource is visible to the user personally, the user's team, or the whole client;
- whether a lawyer approved a resource for publication.

Using only `User.role = CLIENT` creates several risks:

- a client identity could accidentally satisfy internal route authentication;
- internal route code may not check role at all beyond `authenticate`;
- unknown or missing role handling in internal auth may not be strict enough for external actors;
- client/company membership cannot be represented safely;
- user access cannot be revoked per client/team/resource without deactivating a broader account;
- external users could be confused with internal `User` records in audit logs, assignments, comments, or workflow ownership.

Required principle:

> A client portal user must have explicit portal identity, active client membership, portal role, and resource-level visibility. No portal access should be granted by email domain or `CLIENT` role alone.

## 3. Internal vs client identity model

### Internal Adminiculum user

Internal users are lawyers, assistants, internal admins, partners, office/team users, and system-maintenance users who operate the internal legal workflow.

They:

- authenticate through the current internal auth flow;
- map to internal `User` records;
- may use internal APIs according to internal role and route policy;
- can see legal work product needed for their role;
- can assign tasks, review documents, create communications, and manage cases when authorized;
- must not be silently converted into client portal users.

Examples:

- `internal_lawyer`
- `internal_assistant`
- `internal_admin`
- `system/integration service actor`

### External client portal user

External portal users are employees, representatives, or contacts of a client company/account.

They:

- must authenticate through a client portal auth strategy or portal-specific token/session contract;
- must have active membership to a client/account/company;
- may have team/workgroup/request scoping;
- can access only `/api/v1/client-portal/...` resources;
- must never access internal ADM APIs;
- must never see internal lawyer work product unless explicitly published through a client-safe DTO.

Examples:

- `client_requester`
- `client_team_lead`
- `client_manager`
- `client_admin`

## 4. Recommended v1 identity approach

### Options considered

| Option | Security benefit | Complexity | Migration impact | Accidental internal-access risk | Suitability |
| --- | --- | --- | --- | --- | --- |
| Separate `ClientPortalUser` model | Strong security boundary and explicit portal lifecycle | Medium | Additive new tables | Low if middleware stays separate | Recommended for v1 |
| Shared `User` table with `userType` split | Fewer identity tables | Medium | Changes protected internal user semantics | Medium/high because internal routes already trust `User` | Not preferred |
| Azure B2C / external IdP | Strong external identity management | High | May need app registration and token-audience work | Low if implemented well | Good later or if enterprise requirement |
| Magic-link / invite-based login | Simple external onboarding | Medium | Requires invitation/session tables | Low if portal-only tokens | Good v1 candidate |
| Extend `Client` contact fields into identity | Low initial schema cost | Low/medium | Contact fields become security-critical | High without membership/audit | Not sufficient |
| Hybrid: separate portal identity plus invite-based activation | Good separation and staged rollout | Medium | Additive tables | Low | Preferred v1 |

### Recommended v1 path

Use a separate client portal identity/membership concept:

- `ClientPortalUser` stores external identity and account status.
- `ClientPortalMembership` links the user to `Client`, team/workgroup, and portal role.
- `ClientPortalInvitation` controls activation and onboarding.
- Resource visibility grants/publications determine what the user can see.
- Client portal auth middleware produces a portal principal, not an internal `req.user`.

This approach keeps internal auth stable while allowing the portal security model to mature independently.

## 5. Proposed conceptual data model

Do not edit `Backend/prisma/schema.prisma` in this step. The following is a conceptual model for a future migration plan.

### `ClientPortalUser`

Purpose:

- External human identity for portal access.

Key fields:

- `id`
- `email`
- `displayName`
- `status`: invited / active / suspended / revoked
- `authProvider`: magic_link / azure_b2c / entra_external / other
- `externalSubject`
- `lastLoginAt`
- `createdAt`
- `updatedAt`

Security relevance:

- Separates external identities from internal `User`.
- Supports revocation without touching internal staff accounts.

Relations:

- `ClientPortalMembership[]`
- `ClientPortalInvitation[]`
- `ClientPortalAuditEvent[]`

MVP:

- Required.

### `ClientPortalMembership`

Purpose:

- Links a portal user to a client/company/account and role.

Key fields:

- `id`
- `clientPortalUserId`
- `clientId`
- `teamId` / `workgroupId` / `departmentId`
- `role`
- `status`: active / suspended / revoked / expired
- `startsAt`
- `expiresAt`
- `createdByInternalUserId`
- `revokedByInternalUserId`
- `revokedAt`

Security relevance:

- Primary authorization boundary for case/document/message access.
- Allows per-client and per-team revocation.

Relations:

- Existing `Client`
- Optional `ClientWorkgroup` / future portal team table

MVP:

- Required.

### `ClientPortalTeam`

Purpose:

- Client-side team/department grouping for scoped access.

Key fields:

- `id`
- `clientId`
- `name`
- `externalReference`
- `status`

Security relevance:

- Prevents team lead or requester from seeing all company matters by default.

Relations:

- Existing `Client`
- `ClientPortalMembership`
- future case grants

MVP:

- Optional if existing `ClientWorkgroup` is sufficient; recommended if client-side teams differ from internal workgroups.

### `ClientPortalRole`

Purpose:

- Role taxonomy or enum for portal capabilities.

Key fields:

- `client_requester`
- `client_team_lead`
- `client_manager`
- `client_admin`

Security relevance:

- Drives allowed portal actions, never internal route access.

MVP:

- Required as enum or constrained string.

### `ClientPortalInvitation`

Purpose:

- Controlled invite and activation workflow.

Key fields:

- `id`
- `clientId`
- `email`
- `invitedRole`
- `invitedTeamId`
- `status`: pending / accepted / expired / revoked
- `tokenHash`
- `expiresAt`
- `acceptedAt`
- `invitedByInternalUserId`

Security relevance:

- Prevents self-service portal entry without authorized invitation.
- Supports audit and revocation.

MVP:

- Required unless external IdP provisioning fully replaces invitation.

### `ClientPortalCaseAccess`

Purpose:

- Explicit case-level visibility grant beyond membership defaults.

Key fields:

- `id`
- `caseId`
- `clientId`
- `membershipId` or `teamId`
- `scope`: own / team / company / explicit
- `status`: active / revoked
- `approvedByInternalUserId`
- `publishedAt`
- `revokedAt`

Security relevance:

- Allows sensitive matters to be withheld even inside the same client.

MVP:

- Required if case visibility cannot be represented by a simple future `case.clientPortalEnabled` field.

### `ClientPortalDocumentGrant` / `DocumentVisibility`

Purpose:

- Explicit document publication and access control.

Key fields:

- `id`
- `documentId`
- `caseId`
- `clientId`
- `visibilityScope`
- `publicationState`
- `approvedByInternalUserId`
- `publishedAt`
- `revokedAt`
- `downloadAllowed`

Security relevance:

- Prevents SharePoint, draft, review, AI, or lawyer-only document leakage.

MVP:

- Required for document list/download.

### `ClientPortalMessageVisibility`

Purpose:

- Tracks which communications or portal messages are client-visible.

Key fields:

- `id`
- `communicationId`
- `caseId`
- `clientId`
- `visibilityScope`
- `publicationState`
- `approvedByInternalUserId`
- `publishedAt`
- `revokedAt`

Security relevance:

- Prevents raw imported email/internal thread leakage.

MVP:

- Required before portal messages/communication views.

### `ClientPortalAuditEvent`

Purpose:

- Audit trail for portal access and internal preview/publication.

Key fields:

- `id`
- `actorType`: client_user / internal_user / connector
- `actorId`
- `clientId`
- `resourceType`
- `resourceId`
- `action`
- `result`
- `metadata`
- `createdAt`

Security relevance:

- Required for visibility changes, downloads, uploads, messages, preview/impersonation, and connector actions.

MVP:

- Required.

### `ClientPortalFeatureSettings`

Purpose:

- Client/account-specific feature enablement under global env gates.

Key fields:

- `id`
- `clientId`
- `uploadsEnabled`
- `messagesEnabled`
- `reportsEnabled`
- `integrationsEnabled`
- `previewEnabled`
- `updatedByInternalUserId`

Security relevance:

- Prevents global feature flags from enabling all client accounts at once without per-client approval.

MVP:

- Optional in first private pilot, recommended before broader rollout.

## 6. Client role model

### Client roles

`client_requester`

- Can create a request.
- Can see own requests.
- Can upload documents to own visible requests/cases.
- Can send messages on own visible requests/cases.
- Cannot see team/company-wide matters unless explicitly granted.

`client_team_lead`

- Can see team requests.
- Can create requests for the team.
- Can view team-level status.
- Can upload/send messages for team-visible cases.
- Cannot see other teams unless explicitly granted.

`client_manager`

- Can see multiple teams or company-level reporting.
- Can view monthly summaries if reports are enabled and approved.
- Cannot see internal legal notes, lawyer capacity, litigation strategy, or AI work product.

`client_admin`

- Can manage or request user access changes.
- Can see membership list for the client/account.
- Cannot automatically see all sensitive legal matters unless separately granted.
- Cannot approve legal content for publication.

### Internal roles

`internal_lawyer`

- Owns legal work and may approve client-visible data.

`internal_assistant`

- Supports internal workflow; may prepare data but should not publish sensitive client-visible content unless policy allows.

`internal_admin`

- Manages system configuration and portal settings; should not silently impersonate clients.

`system/integration service actor`

- Performs approved automation or connector work with bounded scopes.

### Role/action matrix

| Action | client_requester | client_team_lead | client_manager | client_admin | internal_lawyer | internal_assistant | internal_admin | connector actor |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| List visible cases | Own only | Team scope | Granted company/team scope | Membership/admin scope, not all legal matters by default | Internal routes | Internal routes | Internal routes | No, unless connector-specific |
| View case detail | Own visible | Team visible | Granted visible | Granted visible | Internal routes | Internal routes | Internal routes | No |
| Create request | Own | Team | Optional by policy | Optional/admin-assisted | Internal routes | Internal routes | Internal routes | Ingest only if configured |
| Upload document | Own visible | Team visible | Granted visible | Granted visible | Internal routes | Internal routes | Internal routes | Ingest only if configured |
| View document | Published own | Published team | Published granted | Published granted | Internal routes | Internal routes | Internal routes | No direct human view |
| Send message | Own visible | Team visible | Granted visible | Granted visible | Internal routes | Internal routes | Internal routes | Send/sync only if approved |
| View monthly report | No by default | Team if enabled | Yes if enabled | Yes if enabled | Internal routes | Internal routes | Internal routes | No |
| Manage client users | No | Request only | Request only | Yes/request workflow | Internal admin tooling | No by default | Yes | No |
| View integration status | No | No | Optional | Yes if enabled | Internal routes | Internal routes | Internal routes | Own connector status only |
| Approve client-visible data | No | No | No | No | Yes | Policy-dependent | Yes by policy | No |
| Send outbound portal message | No | No | No | No | Yes | Draft or send by policy | Yes by policy | Only approved/configured |

## 7. Middleware and route separation

### Route namespaces

- Internal APIs remain under existing `/api/v1/...`.
- Future client portal APIs live only under `/api/v1/client-portal/...`.
- Internal and client portal routes should not share broad route handlers or response mappers.

### Future middleware concepts

`requireInternalAuth`

- Validates current internal auth.
- Produces an internal principal.
- Rejects client portal tokens.
- Used only on internal routes.

`requireClientPortalAuth`

- Validates portal-specific token/session.
- Produces a client portal principal.
- Rejects internal-only tokens unless explicit internal preview mode is being used.
- Used only under `/api/v1/client-portal/...`.

`requireClientPortalMembership`

- Loads active memberships for the portal principal.
- Enforces client/account/team scope.
- Fails closed for revoked, expired, suspended, or missing membership.

`requireClientCaseAccess`

- Checks case `clientId`.
- Checks case visibility/grant/publication.
- Applies team/own/company scope.
- Returns non-enumerating `404` for inaccessible case resources.

`requireClientDocumentAccess`

- Checks case access.
- Checks document belongs to visible case/client.
- Checks document publication/grant and not internal-only/review-only/privileged.

`requireClientMessageAccess`

- Checks case access.
- Checks communication/message visibility and publication state.
- Blocks internal/raw/provider messages by default.

`requireClientPortalFeatureGate`

- Checks global env gate and optional per-client settings.
- Supports subfeatures: uploads, messages, reports, integrations, preview.

### Internal preview mode

Internal users may preview client portal data only through explicit internal tooling:

- no client session creation;
- no client token minted;
- client-safe DTOs only;
- prominent "client preview" display in future UI;
- audit event for sensitive previews;
- no access to internal-only fields through preview response.

## 8. Token/session/claim contract

Future client portal token/session may contain:

- `sub` / `clientPortalUserId`
- `email`
- `authType=client_portal`
- `aud` specific to client portal
- `sessionId`
- `clientMembershipIds`
- `activeClientId`
- `activeTeamIds`
- `clientRoles`
- `invitationActivated=true`
- `iat`
- `exp`

Do not trust token claims alone for resource authorization.

The backend must verify against DB policy for:

- case access;
- document access;
- message visibility;
- report visibility;
- integration status/action access;
- membership active/revoked state;
- publication state;
- per-client feature settings.

Token guidance:

- Use short-lived access tokens or sessions.
- Support revocation through DB membership/session status.
- Do not include broad case/document/message IDs in long-lived claims.
- Do not include internal role names or internal user permissions in portal tokens.
- Do not allow portal tokens to satisfy `requireInternalAuth`.

## 9. Case authorization contract

A client user may see a case only if all conditions are true:

1. `ENABLE_CLIENT_PORTAL` and route subfeature gate allow access.
2. User has an active portal identity.
3. User has active membership for the case's `clientId`.
4. Case is marked client-visible or has an explicit access grant.
5. User role and team scope allow the requested visibility.
6. Response uses `ClientPortalCaseDTO` only.

Possible visibility scopes:

- own requests only;
- team cases;
- company cases;
- explicit case grant;
- report-only aggregated visibility.

Forbidden case data:

- internal notes;
- internal task list;
- internal assignees unless explicitly client-facing;
- collaborator list;
- internal workflow state;
- legal analyses;
- litigation strategy;
- AI summaries;
- review comments;
- capacity/planning fields;
- SharePoint root/folder metadata.

## 10. Document authorization contract

### Client upload

Client may upload only if:

- upload feature is enabled;
- target case/request is visible to that user;
- membership permits upload;
- file type and size policy pass;
- future virus/scanning pipeline can accept the object;
- upload is audit logged.

Upload default state:

- inbound;
- pending internal review;
- not approved;
- not broadly visible;
- not attached to other client/team scopes.

### Client view/download

Client may view/download only if:

- document is attached to a visible case/request;
- document belongs to the same `clientId`;
- document has an explicit visibility grant/publication;
- document is not internal-only/review-only/privileged;
- document is served through a client-safe route.

Forbidden document data:

- SharePoint IDs/URLs/paths;
- review comments;
- redline internal notes;
- AI review output;
- lawyer-only annotations;
- draft strategy documents;
- workspace text;
- internal version comments.

## 11. Communication authorization contract

Client may see:

- approved outbound lawyer messages;
- the client's own submitted portal messages;
- client-visible status updates;
- approved document request messages.

Client may not see:

- internal communication;
- raw imported email threads unless explicitly approved;
- internal discussion;
- AI-drafted response before lawyer approval;
- internal classification notes;
- provider metadata;
- mailbox identifiers;
- related task assignment details.

Portal messages from clients should enter internal Adminiculum as inbound communication/request items and remain subject to triage. They should not bypass lawyer review, create internal tasks automatically, or become visible to other clients without explicit policy.

## 12. Approval/publication model

Future client-visible data should move through explicit states:

1. `internal_draft`
2. `proposed_client_visible`
3. `approved_for_client`
4. `published_to_client`
5. `revoked_hidden`

Apply this model to:

- case status and next-step copy;
- documents;
- messages;
- monthly reports;
- integration outbound status.

Approvers:

- `internal_lawyer`: primary approver for legal content;
- `internal_admin`: system/configuration approver, and content approver only if policy permits;
- responsible lawyer only, if future policy requires matter ownership.

Publication rules:

- A draft is never client-visible.
- Proposed content is not client-visible.
- Approval must record approver, timestamp, and scope.
- Revocation hides future access and should be auditable.
- Published DTOs must still apply client membership and resource checks.

## 13. Feature gate relationship

Recommended gates:

| Gate | Controls | Safe default | Failure behavior | Required tests |
| --- | --- | --- | --- | --- |
| `ENABLE_CLIENT_PORTAL` | All portal route execution | Off | `501 FEATURE_NOT_AVAILABLE`, `CLIENT_PORTAL_NOT_ENABLED` | All portal routes fail closed |
| `ENABLE_CLIENT_PORTAL_PUBLIC_ROUTES` | Public-facing route availability | Off | `501` or `404` by deployment policy | No unauth data |
| `ENABLE_CLIENT_PORTAL_UPLOADS` | Client uploads | Off | `501` | Upload endpoints no-op |
| `ENABLE_CLIENT_PORTAL_MESSAGES` | Portal messages | Off | `501` | Message endpoints no-op |
| `ENABLE_CLIENT_PORTAL_REPORTS` | Client reports | Off | `501` | Report endpoints no-op |
| `ENABLE_CLIENT_PORTAL_INTEGRATIONS` | Jira/Bitrix/Teams/Asana/Monday status/actions | Off | `501` | Integration routes no-op |
| `ENABLE_CLIENT_PORTAL_IMPERSONATION_PREVIEW` | Internal preview tooling | Off | `501`/`403` | Preview cannot run silently |

Global gates should be combined with per-client settings before broader rollout.

## 14. Internal preview/impersonation rules

Internal preview is useful for support and legal review, but it must not become silent impersonation.

Rules:

- Preview must not mint or reuse a real client session.
- Preview must use the same client-safe DTO mappers as actual portal routes.
- Preview must show clear "client preview" labeling in future UI.
- Preview must require internal authorization.
- Sensitive preview actions must be audit logged.
- Preview must not expose internal-only fields, even to internal users through the portal endpoint.
- Preview must not allow client-side actions such as upload, send message, or accept invitation.

If true impersonation is ever required, it should be a separate audited support workflow with explicit reason, time limit, and approval policy.

## 15. Connector/service actor rules

Future integrations may involve Jira, Bitrix, Teams, Asana, Monday, or similar systems. Connector actors are not human client users.

Actor types:

- client portal human user;
- internal Adminiculum user;
- connector service account;
- external workflow system actor.

Rules:

- Connector actor may ingest external tasks only from configured legal queue/project.
- Connector actor must not gain internal user privileges.
- Connector actor must have a dedicated scope and token/audit identity.
- Connector writes must be bounded to the configured client/account/project.
- Outbound sync must require approval unless explicitly configured otherwise.
- Connector events must be audit logged.
- Connector payloads must be normalized and sanitized before becoming client-visible.
- Integration status shown to clients must not include secrets, tokens, mailbox IDs, internal project URLs, or provider admin metadata.

## 16. Error and non-enumeration behavior

| Actor / situation | Expected status | Reason | Data leakage risk |
| --- | --- | --- | --- |
| Feature disabled | `501` | `FEATURE_NOT_AVAILABLE`, `CLIENT_PORTAL_NOT_ENABLED` | Low; no Prisma data query |
| No token/session while feature enabled | `401` | Authentication required | Low |
| Internal token on client-only route | `403` unless explicit preview route | Wrong actor type | Low |
| Client token on internal route | `403` or `401` depending middleware | Wrong actor type | Critical if allowed |
| Client user with no membership | `403` for `/me`, `404` for resources | No active scope | Medium if resource existence disclosed |
| Client requests another client's case | `404` preferred | Non-enumerating resource denial | High if `403` confirms existence |
| Client requests invisible case in own client | `404` preferred | Not published/granted | High if status leaks |
| Client requests internal document | `404` | Not visible/published | High |
| Client requests internal communication | `404` | Not visible/published | High |
| Client upload to invisible case | `404` | Not accessible | Medium/high |
| Client report without role | `403` | Authenticated but insufficient portal role | Medium |
| Disabled upload/messages/report subfeature | `501` | Subfeature not available | Low |
| Expired/revoked membership | `403` or forced logout | Access revoked | Medium |

Non-enumeration rule:

- Use `404` when the caller is asking for a specific case/document/message they cannot see.
- Use `403` when the caller is authenticated, the feature exists, but the action is generally not allowed for their role and no specific resource existence is disclosed.

## 17. Required future tests

Auth separation:

- internal token cannot satisfy `requireClientPortalAuth`;
- client portal token cannot satisfy `requireInternalAuth`;
- unknown portal role fails closed;
- inactive/revoked portal user cannot authenticate successfully.

Membership and ownership:

- client cannot access another client's case;
- client cannot access same-client case without explicit visibility/grant;
- team-scoped user cannot access another team's case;
- client admin cannot automatically see all sensitive legal matters.

DTO leak prevention:

- case DTO excludes internal notes, internal assignees, timeline payloads, review data, AI/legal analyses;
- document DTO excludes SharePoint IDs/URLs, workspace text, review comments, AI review;
- communication DTO excludes raw thread content, provider metadata, internal summaries, task details.

Feature gates:

- feature-off returns `501`;
- upload/messages/reports/integrations gates independently return `501`;
- feature-off performs no Prisma resource query.

Document and upload:

- client upload starts pending review and not client-visible;
- client cannot download internal/review-only/privileged document;
- revoked document publication returns `404`.

Communication:

- client cannot see internal communication;
- raw imported email is hidden unless published;
- client-submitted message enters internal inbound/triage state.

Preview and connectors:

- client preview uses client DTO only;
- preview audit event is created when enabled;
- connector actor cannot call internal APIs;
- outbound connector sync requires approval unless explicitly configured.

Regression:

- existing client portal spoofed summary/export stays `501 CLIENT_PORTAL_NOT_ENABLED` until replaced;
- existing internal APIs remain available to internal users;
- no client portal route exposes Outlook import, Graph adapter, AI, anonymization, generation, or handoff internals.

## 18. Implementation phases

Phase 1 — docs/design only:

- finalize identity and authorization split plan;
- draft schema/migration plan separately;
- keep portal disabled.

Phase 2 — migration draft only:

- draft additive portal identity/membership/publication schema;
- no production apply until drift audit and review.

Phase 3 — auth and policy skeleton:

- add portal auth middleware behind feature-off tests;
- add policy helpers and DTO mappers;
- no public route enablement.

Phase 4 — `/me` and membership read contract:

- implement `GET /api/v1/client-portal/me`;
- return only portal identity and active membership summary;
- keep feature gate off until tests pass.

Phase 5 — read-only cases:

- implement case list/detail DTOs;
- enforce ownership, visibility, team scope, and non-enumerating failures.

Phase 6 — read-only published documents:

- implement document list and mediated download for published documents only.

Phase 7 — portal messages:

- implement client message submission and approved message reads;
- route inbound messages into internal triage.

Phase 8 — uploads:

- implement upload as inbound/pending review only;
- add audit and scanning-compatible workflow.

Phase 9 — reports/integrations:

- implement only after separate audit and approvals.

## 19. Open questions

- Should v1 use magic-link invite login, Azure B2C, Entra external identities, or another provider?
- Should portal users belong to a separate table only, or should there be an optional link to internal `User` for contacts who are also staff?
- Is `ClientWorkgroup` sufficient for team scoping, or does portal need a separate `ClientPortalTeam`?
- Should case visibility be a direct field on `Case`, a grant table, or both?
- Should document visibility be direct fields, a publication table, or both?
- Which internal role may approve client-visible publication: responsible lawyer only, any lawyer, partner, or admin?
- Should client admins see all membership users but not all legal matters by default?
- What are retention and audit-log requirements for portal downloads/messages?
- Should client portal support external IdP SSO in v1 or after private pilot?
- What is the preferred non-enumerating policy: always `404` for resource misses, or `403` for same-client but unauthorized role?

## Plan conclusion

Client Portal v1 should begin with an explicit identity and authorization split before any route or UI work. The recommended v1 approach is a separate portal identity/membership model, portal-only middleware, route namespace isolation, client-safe DTOs, resource-level publication/grant checks, non-enumerating errors, and feature gates that remain off until each contract is proven by tests.

Final classification: `client_portal_v1_identity_authorization_plan_documented_no_runtime_change`
