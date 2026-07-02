# Client Portal Tenant-Isolated API Contract

Classification target: `client_portal_tenant_isolated_api_contract_documented_no_runtime_change_no_schema_change_no_db_change`

This is a docs-only future API contract for the 2nd-level Client Portal / Megbízói munkatér. It does not edit `Backend/prisma/schema.prisma`, create migrations, add API routes, add frontend UI, change auth, enable the client portal, connect to a database, touch Azure/production, deploy, or change runtime behavior.

## 1. Executive summary

The Client Portal API must be session-derived and membership-scoped. A client portal user must never select from, list, search, or infer all law-firm clients.

The preferred future shape is:

- `/api/v1/client-portal/me/...` for the authenticated user's own portal state;
- workspace selection through active `ClientPortalMembership`, not public `clientId` selection;
- client-safe DTOs only;
- non-enumerating error responses;
- explicit publication/grant checks before any internal case, document, communication, report, or connector-derived item becomes visible.

Current route review found that the existing `/api/v1/client-portal` router is safely gated and inert, while many existing internal routes intentionally use global clients and `clientId` path/query parameters. Those internal routes must not be reused directly for Client Portal users.

## 2. API boundary principle

### Internal Adminiculum API

The internal API may:

- use internal client IDs;
- list clients for authenticated internal users;
- support lawyer/admin workflows;
- expose operational fields needed by internal workspaces;
- use internal case, client, document, communication, workgroup, matter, task, and report service functions.

The internal API must not be directly exposed to client portal users.

### Client Portal API

The future Client Portal API must:

- live under `/api/v1/client-portal/...`;
- remain behind feature gates until portal auth, membership, DTOs, grants/publications, and tests exist;
- derive tenant scope from authenticated client portal identity and active memberships;
- return client-safe DTOs only;
- never return raw Prisma/internal models;
- never list all clients;
- never reveal whether another client, case, document, request, team, connector, message, or report exists;
- enforce explicit visibility/publication state in addition to `clientId` ownership.

## 3. Current route and OpenAPI review

### Existing gated Client Portal route

Current backend mount:

- `Backend/src/index.ts` mounts `Backend/src/routes/clientPortal.ts` at `/api/v1/client-portal`.
- `Backend/src/routes/clientPortal.ts` applies `requireDatabaseFoundation` with feature `CLIENT_PORTAL` and `ENABLE_CLIENT_PORTAL`.
- While disabled, every `/api/v1/client-portal/*` request returns `501 FEATURE_NOT_AVAILABLE`, reason `CLIENT_PORTAL_NOT_ENABLED`.
- No Prisma queries run while the feature is disabled.

This is the correct disabled baseline and should remain closed until implementation exists.

### Internal-only route patterns observed

The following current patterns are internal Adminiculum APIs and must remain internal-only unless a separate portal-safe adapter/DTO layer is built:

| Current pattern | Source | Why not portal-safe directly |
| --- | --- | --- |
| `GET /api/v1/clients` | `Backend/src/modules/clients/routes.ts` and OpenAPI `/clients` | Lists clients globally; portal must not expose global client list. |
| `GET /api/v1/clients/:clientId` | `Backend/src/modules/clients/routes.ts` and OpenAPI `/clients/{id}` | Uses public path ID and returns client object; portal must derive current client from membership. |
| `POST /api/v1/clients`, `PATCH /api/v1/clients/:clientId`, `DELETE /api/v1/clients/:clientId` | `Backend/src/modules/clients/routes.ts` | Internal client administration only. |
| `/api/v1/clients/:clientId/house-style` | `Backend/src/modules/clients/routes.ts` | Internal/law-firm client configuration surface, not portal user contract. |
| `/api/v1/clients/:clientId/workgroups` | `Backend/src/modules/workgroups/routes.ts` | Uses route `clientId`; portal team APIs must be membership-scoped. |
| `/api/v1/clients/:clientId/workload-summary` | `Backend/src/modules/workgroups/routes.ts` | Workload details are internal unless transformed into approved client-safe report snapshots. |
| `GET /api/v1/cases?clientId=...` | `Backend/src/modules/cases/routes.ts` | Internal case filtering; portal requests/cases must require publication/grants and scoped membership. |
| `GET /api/v1/communications?clientId=...` | `Backend/src/modules/communications/routes.ts` | Internal communication list; portal messages must use approved publication/message DTOs. |
| `/api/v1/matters?clientId=...` | `Backend/src/routes/matters.ts` | Matter structure is internal until explicitly exposed through portal-safe request/report DTOs. |
| anonymize redaction profile `/api/v1/clients/:clientId/redaction-profile` | `Backend/src/modules/anonymize/routes.ts` | Internal anonymization configuration, not portal-facing. |

These are not necessarily bugs in the internal product. They are risky only if reused for external Client Portal users.

### OpenAPI implication today

`Backend/src/docs/api/openapi.yaml` currently documents internal `/clients` and `/clients/{id}` style routes. Future portal API documentation should be a separate OpenAPI tag/section and must not reuse internal clients/cases/documents schemas.

## 4. Authentication and membership assumptions

Future Client Portal session assumptions:

- A client portal user logs in with email/password or an invitation-created account.
- The backend resolves a `ClientPortalUser` identity.
- The backend loads active `ClientPortalMembership` records.
- Each active membership determines:
  - `clientId`;
  - workspace/team/workgroup scope;
  - role;
  - permissions;
  - visible grants/publications.

Access must not be granted by:

- email domain alone;
- external workflow requester email alone;
- internal `UserRole.CLIENT` alone;
- connector service actor identity;
- a supplied `clientId` route/query parameter;
- a guessed request/document/message/integration ID.

A connector service actor is not a client portal user. Connector records may power source badges only after portal publication/visibility rules allow them.

## 5. Workspace resolution API

### `GET /api/v1/client-portal/me`

Purpose: return the authenticated portal user's safe session summary.

Allowed roles: any authenticated active portal membership, or authenticated portal user with no active membership for generic access-not-configured state.

Response: `ClientPortalMeDto`.

Visibility rule:

- derive all data from session identity;
- include current workspace only if selected and authorized;
- include active membership count, not global client count.

Non-enumeration rule:

- no active membership returns generic access-not-configured state;
- do not reveal client names that are not active memberships for this user.

### `GET /api/v1/client-portal/me/workspaces`

Purpose: list only workspaces where the authenticated portal user has active membership.

Allowed roles: any authenticated portal user.

Response: `ClientPortalWorkspaceDto[]`.

Visibility rule:

- return only the user's own active memberships;
- if exactly one workspace exists, frontend may auto-enter;
- if multiple exist, frontend may show a workspace switcher with only these memberships.

Forbidden:

- no global clients list;
- no public company lookup;
- no inactive/unauthorized client reveal.

### `POST /api/v1/client-portal/me/workspaces/select`

Purpose: select one current workspace by membership/workspace reference owned by the user.

Allowed roles: any authenticated portal user with at least one active membership.

Request concept:

```json
{
  "workspaceId": "membership-or-workspace-id"
}
```

Response: updated `ClientPortalMeDto` or `ClientPortalWorkspaceDto`.

Visibility rule:

- verify selected workspace belongs to the authenticated user's active memberships;
- do not accept arbitrary `clientId` as proof of scope.

Non-enumeration rule:

- unknown, inactive, or unauthorized workspace selection returns the same generic 404/not-available style response.

### Alternative workspace selection

A URL-safe workspace slug or session claim may be used later, but it must still be validated against active membership on every request.

### Forbidden workspace APIs

Do not create public Client Portal APIs equivalent to:

- `GET /api/v1/clients`
- `GET /api/v1/client-portal/clients`
- public client search;
- public organization lookup;
- endpoint returning all client names or IDs.

## 6. Tenant-isolated endpoint contract

All endpoint groups below are future contracts only. Every handler must run after portal auth and membership scope resolution.

| Group | Endpoints | Allowed roles | Returned DTO | Visibility rule | Forbidden internal fields |
| --- | --- | --- | --- | --- | --- |
| Dashboard | `GET /api/v1/client-portal/me/summary` | Requester, Team lead, Client manager, Client admin | `ClientPortalSummaryDto` | Current workspace + role/team scope + explicit publications | Internal workload, strategy, raw timesheets, hidden counts |
| Requests | `GET /api/v1/client-portal/me/requests`; `POST /api/v1/client-portal/me/requests`; `GET /api/v1/client-portal/me/requests/:requestId` | Requester scoped to own; Team lead scoped to team; Manager/Admin client-scoped | `ClientPortalRequestDto` | Request belongs to current workspace scope and is client-visible | Internal case ID if unsafe, internal task IDs, legal strategy, AI drafts |
| Documents | `GET /api/v1/client-portal/me/documents`; `POST /api/v1/client-portal/me/documents/upload-request`; `GET /api/v1/client-portal/me/documents/:documentId` | Scope follows request/document grant | `ClientPortalDocumentDto` | Document belongs to current workspace and approved visible version exists | SharePoint raw URLs/IDs, workspace text, review annotations, internal versions |
| Messages | `GET /api/v1/client-portal/me/messages`; `POST /api/v1/client-portal/me/messages`; `GET /api/v1/client-portal/me/requests/:requestId/messages` | Scope follows request/message grant | `ClientPortalMessageDto` | Message is explicitly approved/client-visible | Raw email thread, internal communications, unapproved attachments |
| Deadlines | `GET /api/v1/client-portal/me/deadlines` | All roles, scoped | `ClientPortalDeadlineDto[]` | Derived only from visible requests/doc requests | Internal court/task deadlines unless published |
| Monthly report | `GET /api/v1/client-portal/me/report` | Client manager, Client admin; Team lead for team subset if enabled | `ClientPortalReportDto` | Approved report snapshot for current workspace/team | Per-minute billing, raw timesheets, internal capacity/workload |
| Team/admin | `GET /api/v1/client-portal/me/team`; `POST /api/v1/client-portal/me/invitations`; `PATCH /api/v1/client-portal/me/team/:membershipId` | Client admin; limited read for Team lead if approved | `ClientPortalTeamMemberDto`, invitation DTOs | Own client/workspace only | All Adminiculum users, other client admins, global user search |
| Integrations | `GET /api/v1/client-portal/me/integrations`; `GET /api/v1/client-portal/me/integrations/:integrationId` | Client admin for setup; read roles if configured | `ClientPortalIntegrationDto` | Current workspace connection only | Credentials, webhook payloads, debug logs, other client integrations |

Non-enumeration applies to every endpoint group: unauthorized and missing resources return the same client-safe not-found style response.

## 7. Safe route ID handling

Allowed route IDs for Client Portal endpoints:

- `requestId`;
- `documentId`;
- `messageId`;
- `membershipId`;
- `integrationId`;
- `externalObjectLinkId`, only after the link is already client-visible.

Every ID lookup must include session membership scope and publication/grant filters in the same query/service call.

Example future query rule:

```sql
WHERE id = :requestId
  AND clientId IN (:currentUserMembershipClientIds)
  AND clientVisible = true
```

For team-scoped roles, add team/workgroup constraints. For publication-based records, require active publication/grant state.

If not found or unauthorized:

- return the same generic client-safe 404/not-found style response;
- do not say the resource belongs to another client;
- do not expose hidden counts or alternate client names;
- log denial internally with redacted audit metadata.

Avoid:

- `clientId` route params for portal user APIs;
- guessable raw sequential IDs;
- errors that confirm a resource exists but is forbidden;
- fallbacks from route `clientId` to session `clientId` without strict validation.

## 8. Client-safe DTO boundary

Never expose raw Prisma/internal models to the Client Portal.

### `ClientPortalMeDto`

- `userDisplayName`
- `email`
- `currentWorkspace`
- `roles`
- `permissions`
- `notificationCounts`
- `accessState`

### `ClientPortalWorkspaceDto`

- `workspaceId`
- `organizationDisplayName`
- `role`
- `teamName`
- `isCurrent`

### `ClientPortalSummaryDto`

- `todoCount`
- `activeRequestCount`
- `documentRequestCount`
- `nextDeadline`
- `latestApprovedUpdates`
- `monthlySummaryPreview`

### `ClientPortalRequestDto`

- `requestId`
- `title`
- `clientFriendlyStatus`
- `category`
- `requester`
- `team`
- `deadline`
- `sourceBadge`
- `externalIdChip`, only if visible
- `nextStep`
- `todoForClient`
- `approvedTimelineItems`

### `ClientPortalDocumentDto`

- `documentId`
- `displayName`
- `status`
- `requestedBy`
- `requestedAt`
- `uploadedAt`
- `visibleVersion`
- `allowedActions`

### `ClientPortalMessageDto`

- `messageId`
- `source`
- `senderDisplayName`
- `body`
- `createdAt`
- `attachmentRefs`, only if approved

### `ClientPortalReportDto`

- aggregate counts only;
- approved summary text;
- approved highlights;
- no internal timesheet;
- no per-minute billing;
- no internal workload/capacity.

### Forbidden DTO fields

Client Portal DTOs must not include:

- internal notes;
- raw internal task IDs unless transformed into safe external display IDs;
- internal assignee notes;
- AI drafts;
- AI summaries unless explicitly approved for client publication;
- legal strategy;
- risk scores or fake priority scores;
- raw communication content;
- raw webhook payloads;
- raw email threads;
- review annotations;
- billing internals;
- other client references;
- SharePoint internal IDs/paths/raw URLs unless a safe signed URL/publication pattern is implemented.

## 9. Role-specific API permissions

| Role | Allowed endpoint groups | Scope | Forbidden access |
| --- | --- | --- | --- |
| Requester | `me`, own summary subset, own requests, own documents/uploads, messages on own/assigned requests, own deadlines | Own requests and assigned document requests | Team-wide/client-wide lists, reports, integrations setup, other requesters' items |
| Team lead | Request/team summary, team requests, team documents/statuses, team messages, team deadlines, team report subset if enabled | Own team/workgroup only | Other teams, client admin settings, integration setup unless separately granted |
| Client manager | Client-level overview, all approved client-visible requests, monthly report, approved messages/documents | Current client/workspace | Internal legal workspace, raw timesheets, internal tasks, strategy/review notes |
| Client admin | Team/membership management, invitations, integration settings, client-scoped overview | Own client/workspace only | Global client/user search, other clients, internal Adminiculum users outside scoped invitation model |

Role checks must combine with membership, current workspace, team/workgroup scope, resource grants, publication state, and feature policy.

## 10. Non-enumerating errors

| Context | Future behavior |
| --- | --- |
| Login | Generic invalid credentials for wrong email, wrong password, inactive account, or non-portal identity on public surface. |
| Forgot password | Always show: if this email exists and is eligible, instructions were sent. |
| Workspace | No active membership shows generic access-not-configured state without client names. |
| Resource lookup | Unauthorized and not found return same client-safe 404/not-found style response. |
| Invitation | Invalid, expired, revoked, or used token returns generic safe error. |
| Integration | Disabled/unavailable integration returns generic not available; no other client connector names. |
| Feature gate | Disabled portal remains `501 FEATURE_NOT_AVAILABLE` or equivalent default-off response before implementation. |

API response principles:

- no other client name in errors;
- no message saying resource belongs to another client;
- no count of hidden resources;
- no debug stack;
- no raw provider payload;
- internal logs may carry redacted audit metadata.

## 11. Publication and grant rules

Client Portal visibility requires more than `clientId`.

A future client-visible record must satisfy all applicable conditions:

- authenticated portal user;
- active membership;
- matching current workspace/client/team scope;
- explicit client-visible publication, grant, or state;
- not internal-only;
- not pending lawyer/admin approval;
- allowed by role and feature policy.

Examples:

- An internal `Case` may exist, but no portal request appears until it is published or represented by a client-safe request record.
- An internal `Document` may exist, but only approved/published versions are visible.
- A `Communication` may exist, but only approved client-visible messages are returned.
- A connector intake event may exist, but it remains internal until triaged and published.
- A monthly report must be an approved client-safe snapshot, not a live raw internal workload query.

## 12. Connector relationship

Client Portal may show connector context only after publication/visibility rules allow it:

- source badge: Jira, Teams, Bitrix, Asana, Monday, Email, Portal, or another configured connector;
- external ID chip;
- external URL if configured, safe, and user has permission;
- approved status/comment imported through publication rules.

Client Portal must not show:

- raw webhook event;
- connector credentials;
- adapter debug logs;
- internal sync errors containing sensitive payload;
- unapproved outbound drafts;
- other clients' integrations;
- other clients' selected queues;
- connector actor credentials or tokens.

Integration endpoints must be scoped to the current workspace. Setup/configuration should be client-admin-only and must not expose cross-client connector inventory.

## 13. File/document upload API rules

Future upload endpoints must:

- require authenticated portal membership;
- require a target request/document request in the same workspace scope;
- store uploaded files as pending review by default;
- not automatically publish uploaded documents;
- enforce size and file-type limits;
- preserve audit events;
- virus/malware scan where infrastructure allows;
- avoid exposing storage URLs directly unless a safe signed URL/publication pattern exists;
- keep SharePoint internal metadata out of portal DTOs.

Suggested client-facing document statuses:

- `requested`;
- `uploaded`;
- `under_review`;
- `clarification_needed`;
- `accepted`;
- `final_version`.

These are client-facing states and must be backed by persisted state before UI claims them.

## 14. OpenAPI/Swagger implications

Future OpenAPI work should:

- create a separate Client Portal API section/tag;
- mark the section as gated/future until implemented;
- use `/api/v1/client-portal/me/...` paths;
- avoid `clientId` path parameters for portal user endpoints;
- describe non-enumerating 404/not-found responses;
- describe role/membership requirements per endpoint group;
- document default-off feature gates;
- define portal DTO schemas separately from internal Adminiculum DTOs.

Existing OpenAPI routes using `/clients`, `/clients/{id}`, `/clients/{id}/cases`, or other `clientId`-driven shapes should be treated as internal-only unless separately proven portal-safe through membership checks and client-safe DTOs.

## 15. Security test plan

Future implementation should include tests for:

### Authentication/session

- unauthenticated client portal routes return `401`;
- disabled feature gate returns expected default-off response;
- client portal tokens do not satisfy internal admin/lawyer APIs;
- internal tokens do not automatically satisfy client portal membership.

### Tenant isolation

- one client user cannot access another client's request by guessed ID;
- one client user cannot access another client's document;
- one client user cannot access another client's message/report/integration;
- client user cannot list clients;
- client user cannot query all users;
- multi-membership user sees only own workspaces;
- one-membership user does not see global workspace selector.

### Publication

- internal case is not visible without publication/grant;
- internal document is not visible without approved version/publication;
- internal communication is not visible without approval;
- AI draft is never visible;
- connector intake is not visible until published.

### Errors

- unauthorized vs missing resource returns the same non-enumerating response;
- forgot password response is generic;
- invalid/expired invite response is generic;
- no debug stack appears in client portal errors.

### Integrations

- connector source badge cannot reveal another client;
- integration list is workspace-scoped;
- connector setup requires client-admin role;
- connector credentials and raw webhook payloads never appear in portal DTOs.

### Uploads

- upload requires same-workspace target request/document request;
- upload remains pending review;
- raw storage URLs are not returned;
- audit event is recorded.

## 16. Open questions

- Which auth flow should be canonical for portal v1: password, invitation magic link, external identity provider, or hybrid?
- Should workspace selection be stored in a server session, short-lived token claim, URL-safe slug, or frontend state backed by `/me`?
- Should `ClientPortalTeam` be separate from existing `ClientWorkgroup` and `Department`?
- Which internal user roles may invite the first client admin?
- Does Client Portal v1 expose requests as projections over internal cases/tasks, or as separate `ClientPortalRequest` records?
- What exact status vocabulary should be persisted for client-facing request/document states?
- Should `403` ever be used in portal resource APIs, or should all resource authorization misses use non-enumerating `404`?
- What is the first OpenAPI artifact format for future portal contracts: `openapi.yaml` section, standalone spec, or docs-only draft first?

## 17. Recommended next prompt

`Adminiculum — CLIENTPORTAL1I portal DTO and publication boundary docs-only`

Recommended scope:

- define `ClientPortalRequestDto`, `ClientPortalDocumentDto`, `ClientPortalMessageDto`, and `ClientPortalReportDto` in more detail;
- define publication/grant source of truth per resource type;
- define non-enumerating query patterns;
- keep CP-SCHEMA-1 and CONNECTOR-SCHEMA-1 blocked until baseline/proof work is resolved;
- make no runtime, schema, migration, DB, auth, Azure, frontend UI, or deployment changes.

## 18. Final status

- Runtime change: no.
- Schema/migration change: no.
- DB change: no.
- Auth/client portal runtime change: no.
- CP-SCHEMA-1 unblocked: no.
- CONNECTOR-SCHEMA-1 unblocked: no.
- Final classification: `client_portal_tenant_isolated_api_contract_documented_no_runtime_change_no_schema_change_no_db_change`.
