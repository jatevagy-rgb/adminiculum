# Client Portal v1 Security / Contract Audit

Classification target: `client_portal_v1_security_contract_audited_no_runtime_change`

## 1. Executive summary

Client Portal v1 should not be built on top of the existing internal Adminiculum API responses. The current codebase is organized around authenticated internal legal workflow users, and several routes return internal operational fields that are useful for lawyers but unsafe for an external client surface.

Current safety posture is good for a disabled feature: `Backend/src/routes/clientPortal.ts` mounts `/api/v1/client-portal/*` behind a hard `ENABLE_CLIENT_PORTAL` database-foundation gate and performs no Prisma queries while disabled. Production smoke history also confirms spoofed summary/export routes return `501 FEATURE_NOT_AVAILABLE` with reason `CLIENT_PORTAL_NOT_ENABLED`.

The main implementation requirement for Client Portal v1 is a separate authorization and DTO boundary:

- Do not reuse internal case/document/communication DTOs for client users.
- Do not allow `UserRole.CLIENT` or any future client role to traverse internal ADM routes by default.
- Add explicit client-account/team membership models before enabling portal visibility.
- Add additive visibility fields only in a future migration pass after this audit.
- Keep all portal routes gated until authentication, authorization, DTOs, ownership filters, tests, and deployment smoke are complete.

## 2. Current state inventory

### Auth and roles

- `Backend/src/middleware/auth.ts` authenticates Bearer tokens through Azure AD first, then local JWT fallback.
- Azure tokens are resolved to a database `User` by email before the request is accepted.
- `UserRole` already contains `CLIENT` and `EXTERNAL_REVIEWER` in `Backend/prisma/schema.prisma`, but these roles are not a complete client-portal identity model.
- `normalizeRole` falls back unknown roles to `LAWYER`, which is acceptable only for internal-token assumptions and should not be used for future external client identity.
- `requireRole` exists, but many internal routes only use `authenticate` and no role or resource-level ownership checks.

### Client portal route state

- `Backend/src/routes/clientPortal.ts` is the correct disabled baseline: feature-off requests return `501 FEATURE_NOT_AVAILABLE`, reason `CLIENT_PORTAL_NOT_ENABLED`.
- The route file explicitly documents that prior `x-user-id` placeholder access was removed and no Prisma queries run while disabled.
- `Backend/src/index.ts` mounts this router at `/api/v1/client-portal`.

### Core schema landmarks

- `User` has internal workflow fields and role/status flags.
- `Client` has cases, documents, departments, matters, workgroups, notes, house-style, and redaction-profile relations.
- `Case` has `clientId`, internal assignment fields, timeline, comments, tasks, review suggestions, legal analyses, and handoff packages.
- `Document` has `caseId`, `clientId`, SharePoint identifiers/URLs, workspace text, review suggestions, comments, and timeline relations.
- `Communication` has optional `caseId`, `clientId`, `documentId`, full `content`, `summary`, provider metadata, recipients, attachments, and related tasks.
- There is no dedicated `ClientPortalUser`, `ClientPortalMembership`, `clientVisible`, `clientPortalEnabled`, `approvedForClient`, or `internalOnly` field in the current schema.

## 3. Proposed client user model

Do not treat the existing internal `User` table as sufficient for external portal access. A future design should add a separate client identity / membership layer.

Recommended actors:

- `client_requester`: can see own requests and explicitly visible cases/documents/messages.
- `client_team_lead`: can see requests and cases for an assigned client team/workgroup.
- `client_manager`: can see multiple teams or reporting scopes for one client account.
- `client_admin`: can manage or request management of client-side users and role membership.
- `internal_lawyer`: internal Adminiculum user; never considered a client-portal actor.
- `internal_admin`: internal Adminiculum administrator; can administer portal configuration, not impersonate silently.

Recommended model concepts for future migration:

- `ClientPortalUser`: external identity, email, status, auth provider, last login.
- `ClientPortalMembership`: maps portal user to `clientId`, optional department/workgroup/team, and role.
- `ClientPortalCaseAccess`: optional explicit case-level grant if client/team scoping is too broad.
- `ClientPortalDocumentPublication`: explicit document publication/approval metadata.
- `ClientPortalAuditEvent`: external user access, upload, message, and admin events.

Security notes:

- A future Azure AD guest/client identity should not be auto-created as internal `User`.
- Unknown roles must fail closed for portal routes.
- Client portal authorization should not depend only on email domain matching.
- External users should receive their own auth contract and claims, separate from internal ADM route access.

## 4. Case visibility contract

Client Portal v1 must use a dedicated case mapper, not `casesService.getCaseById`, `getCases`, or `getCaseSummary` directly.

Required conditions for a visible case:

1. Feature gate is enabled for client portal.
2. Caller is an authenticated client portal user.
3. Caller has active membership for the case's `clientId`.
4. Case is explicitly client-visible, e.g. future `clientPortalEnabled=true` or case access grant exists.
5. Team/workgroup filter matches if membership is scoped below the whole client.
6. Case is not archived/internal-only/withheld by policy.

Safe `ClientPortalCaseDTO` should include only:

- `id`
- `caseNumber` or a client-facing reference
- `title` if approved for client display
- `status` mapped to client-friendly labels
- `clientName`
- public/request summary if explicitly approved
- key client-facing dates
- counts of visible documents/messages only

Fields forbidden in portal case DTOs:

- internal `description` unless explicitly sanitized
- `assignedLawyer.email` unless approved as contact
- collaborator list
- internal priority/risk fields
- timeline payloads
- internal workflow graph/history
- legal analyses
- review suggestions
- handoff packages
- comments and internal notes
- SharePoint folder paths/root IDs

Current internal route risk examples:

- `Backend/src/modules/cases/services.ts` returns assigned lawyer email/role in case list and detail.
- `Backend/src/modules/cases/services.ts` returns timeline payloads in case summary.
- `Backend/src/modules/cases/services.ts` returns all documents for a case without client visibility filtering.
- `Backend/src/modules/cases/services.ts` exposes dashboard stats and recent activity globally, which is internal-only.

## 5. Document visibility/upload contract

Client Portal v1 must use a dedicated document mapper and upload intake flow.

Required conditions for visible documents:

1. Document belongs to a visible case for the caller.
2. Document belongs to the same `clientId` scope.
3. Document has explicit future visibility metadata, e.g. `clientVisible=true`.
4. Document is not `internalOnly`, privileged, review-only, draft, rejected, or pending lawyer approval.
5. Document is in an approved/final/published state for client viewing.

Safe `ClientPortalDocumentDTO` should include only:

- `id`
- `caseId`
- `fileName`
- `documentType` mapped to client-friendly label
- `version` if safe
- `publishedAt`
- `uploadedByClient` or source category
- `downloadAvailable`

Fields forbidden in portal document DTOs:

- `spItemId`
- raw `spPath` / `spWebUrl` unless converted to a short-lived backend-mediated download token
- `workspaceText`
- review comments
- AI review output
- internal redline notes
- SharePoint drive/site/folder metadata
- internal version comments
- reviewer chain

Upload contract:

- Client upload endpoint must create inbound/pending-review documents only.
- Uploaded documents must not become client-visible to others by default.
- Upload must require case visibility and membership checks before accepting bytes.
- Upload audit should record external actor, case, filename, size, MIME type, and source IP/user agent as appropriate.
- Lawyer review/publish flow must be required before uploaded material is redistributed or shown broadly.

Current internal route risk examples:

- `Backend/src/modules/documents/services.ts` returns `spItemId` and `spWebUrl`/`spPath` in document DTOs.
- `Backend/src/modules/documents/routes.ts` has download/text routes that authenticate but do not apply client ownership/visibility rules.
- `Backend/src/modules/documents/services.ts` search can find documents by case/client metadata without a client portal ownership boundary.
- Review, approve, reject, and workspace-version routes are internal workflow functions and must never be reachable by client actors.

## 6. Communication visibility contract

Client Portal v1 communication endpoints must be separate from `/api/v1/communications`.

Required conditions for visible communications:

1. Communication belongs to a visible case/request for the caller.
2. Communication belongs to the caller's `clientId` scope.
3. Communication is explicitly approved for client display, e.g. future `clientVisible=true` or `approvedForClient=true`.
4. Communication is not internal, not a raw inbound email under review, and not a full imported provider thread unless lawyer-approved.
5. Attachments follow document visibility rules.

Safe `ClientPortalMessageDTO` should include only:

- `id`
- `caseId`
- `direction` mapped to portal terms
- `subject`
- sanitized preview/body only after approval
- sender display name if safe
- created/sent timestamp
- visible attachment count

Fields forbidden in portal communication DTOs:

- full raw email thread content by default
- internal `summary` if AI/lawyer work-product generated
- `metadata`
- provider IDs
- mailbox address
- raw recipients if not client-visible
- related task details
- createdBy internal IDs
- attachment SharePoint IDs/URLs

Current internal route risk examples:

- `GET /api/v1/communications` is authenticated and ungated, and returns `summary` plus `contentPreview`. It is intentionally an internal read-only workspace contract, not a client portal contract.
- `GET /api/v1/communications/:id` returns the raw communication with attachments and related tasks.
- `GET /api/v1/communications/:id/tasks` returns assigned internal users.
- `GET /api/v1/communications/:id/attachments` includes uploaded-by and document metadata.
- Mutating intake endpoints are internal operational workflows and must not be exposed to clients.

## 7. Never-visible internal data deny-list

Client Portal v1 must deny these fields and concepts by default:

- internal lawyer notes;
- internal case comments;
- internal task records;
- task assignee/assigner/internal comments;
- internal communication;
- full raw imported email thread unless specifically published;
- AI draft;
- AI summary;
- legal analysis;
- risk scoring;
- litigation strategy;
- evidence weighting;
- review comments and reviewer chain;
- clause/review suggestion internals;
- internal deadline/capacity planning;
- other client data;
- other teams' sensitive matters unless explicitly allowed by role scope;
- full internal audit log;
- exact billing/timesheet internals unless separately approved;
- SharePoint IDs, drive IDs, folder paths, raw web URLs;
- provider message IDs, mailbox identifiers, Graph metadata;
- generated-contract template data unless explicitly published;
- anonymization/rehydration workspace internals.

## 8. Feature gate model

Keep portal feature-off behavior as the default until the full contract is implemented and tested.

Recommended future gates:

- `ENABLE_CLIENT_PORTAL=false`
- `ENABLE_CLIENT_PORTAL_PUBLIC_ROUTES=false`
- `ENABLE_CLIENT_PORTAL_UPLOADS=false`
- `ENABLE_CLIENT_PORTAL_MESSAGES=false`
- `ENABLE_CLIENT_PORTAL_REPORTS=false`
- `ENABLE_CLIENT_PORTAL_INTEGRATIONS=false`

Recommended gate behavior:

- Feature off: `501 FEATURE_NOT_AVAILABLE`, feature `CLIENT_PORTAL`, reason `CLIENT_PORTAL_NOT_ENABLED`.
- Unauthenticated while feature on: `401`.
- Authenticated but not a portal client user: `403`.
- Authenticated portal user accessing another client's resource: prefer `404` for non-enumeration, or `403` only where product explicitly accepts existence disclosure.
- Missing visibility/publication: `404`.

Existing gate to preserve:

- `Backend/src/routes/clientPortal.ts` hard-gates `/api/v1/client-portal/*`.
- Do not replace the gate with placeholder `x-user-id` logic.
- Do not enable `ENABLE_CLIENT_PORTAL` until real auth and resource policy exist.

## 9. Role/authorization matrix

| Actor | Endpoint/resource | Allowed action | Required condition | Forbidden data | Expected failure |
| --- | --- | --- | --- | --- | --- |
| Unauthenticated | Any client portal route | None | Valid Bearer token or portal session required | All data | `401` if feature on, `501` if feature off first |
| Authenticated internal user | Internal ADM routes | Existing internal workflow | Existing internal auth and route policy | Client portal impersonation without explicit admin tooling | `403` if portal-only route |
| Authenticated client user | `GET /api/v1/client-portal/me` | Read own portal identity | Active portal user and membership | Internal `User` fields, role hierarchy internals | `401`/`403`/`501` |
| `client_requester` | Own visible cases | List/read | Membership matches `clientId`, case explicitly visible | Internal case workflow data | `404` for non-visible |
| `client_team_lead` | Team visible cases | List/read | Membership matches `clientId` and team/workgroup scope | Other teams, internal data | `404`/`403` |
| `client_manager` | Multi-team visible cases | List/read/report | Membership grants reporting scope | Other clients, internal billing minutiae | `404`/`403` |
| `client_admin` | Client user management | Invite/request/manage | Client admin membership and audited workflow | Internal user management, internal roles | `403` |
| Client user | Case documents | List/download/upload | Case visible, document published or upload allowed | SharePoint IDs/URLs, review internals | `404`/`403` |
| Client user | Case messages | List/send | Case visible, message feature enabled | Internal/raw thread content | `404`/`403` |
| Client user | Other client's case | None | Never allowed | Existence/details | `404` preferred |
| Client user | Internal communications | None | Never allowed | Full content, tasks, attachments | `404` preferred |
| Feature-off caller | Any portal function | None | Gate enabled first | All data | `501 FEATURE_NOT_AVAILABLE` |

## 10. Proposed API contract

These endpoints are audit-level proposals only. Do not implement until model, auth, and tests are approved.

### `GET /api/v1/client-portal/me`

- Caller: authenticated portal user.
- Scope: active portal session / token, no internal ADM fallback.
- DB filter: portal user by external identity, active memberships only.
- DTO: user id, display name, email, memberships, client roles, enabled portal capabilities.
- Forbidden: internal `User` role hierarchy, internal user IDs unless mapped, auth provider secrets.
- Errors: `501`, `401`, `403`.

### `GET /api/v1/client-portal/cases`

- Caller: portal user with active membership.
- Scope: `client_requester`, `client_team_lead`, `client_manager`, `client_admin`.
- DB filter: `case.clientId in memberships`, team/workgroup filters, explicit client-visible flag/grant.
- DTO: `ClientPortalCaseListItem`.
- Forbidden: internal assignment, internal priority/risk, timeline payloads, comments.
- Errors: `501`, `401`, `403`.

### `GET /api/v1/client-portal/cases/:caseId`

- Caller: portal user.
- Scope: membership must match the case.
- DB filter: `id`, `clientId`, client-visible flag/grant, team scope.
- DTO: `ClientPortalCaseDTO`.
- Forbidden: internal workflow graph/history, legal analysis, review comments, SharePoint paths.
- Errors: `501`, `401`, `404` for not-owned/not-visible.

### `GET /api/v1/client-portal/cases/:caseId/documents`

- Caller: portal user.
- Scope: case visibility plus document visibility.
- DB filter: case ownership/visibility, document `clientVisible=true`, not internal-only, approved/published.
- DTO: `ClientPortalDocumentDTO`.
- Forbidden: `spItemId`, `spPath`, review metadata, workspace text.
- Errors: `501`, `401`, `404`.

### `POST /api/v1/client-portal/cases/:caseId/documents/upload`

- Caller: portal user with upload feature enabled.
- Scope: `ENABLE_CLIENT_PORTAL_UPLOADS=true`; membership can upload to the case.
- DB filter: case ownership/visibility.
- DTO: upload receipt only; document remains inbound/pending review.
- Forbidden: direct SharePoint write credentials, auto-published status.
- Errors: `501`, `401`, `403`, `404`, `413`, `415`.

### `GET /api/v1/client-portal/cases/:caseId/messages`

- Caller: portal user with messages feature enabled.
- Scope: `ENABLE_CLIENT_PORTAL_MESSAGES=true`; case visible.
- DB filter: case/client ownership, `clientVisible` or `approvedForClient`, non-internal.
- DTO: `ClientPortalMessageDTO`.
- Forbidden: raw internal communication, AI/internal summary, provider metadata.
- Errors: `501`, `401`, `404`.

### `POST /api/v1/client-portal/cases/:caseId/messages`

- Caller: portal user with messages feature enabled.
- Scope: visible case, allowed membership.
- DB filter: case ownership/visibility.
- DTO: message receipt; internal Adminiculum receives inbound portal communication.
- Forbidden: spoofed sender, direct assignment to internal tasks without review.
- Errors: `501`, `401`, `403`, `404`, `400`.

### `GET /api/v1/client-portal/reports/monthly`

- Caller: `client_manager` or `client_admin`.
- Scope: `ENABLE_CLIENT_PORTAL_REPORTS=true`.
- DB filter: client/account/team scope.
- DTO: approved report aggregates only.
- Forbidden: exact internal timesheet lines/minute-level billing unless published.
- Errors: `501`, `401`, `403`.

### `GET /api/v1/client-portal/integrations/status`

- Caller: `client_admin`.
- Scope: `ENABLE_CLIENT_PORTAL_INTEGRATIONS=true`.
- DB filter: client account.
- DTO: high-level enabled/disabled statuses.
- Forbidden: secrets, tokens, mailbox IDs, provider internals.
- Errors: `501`, `401`, `403`.

## 11. Risks found in current code

No production behavior change was made. These are implementation risks if future portal routes reuse internal services directly.

### Critical risks

- Existing internal case/document/communication routes are authenticated internal routes, not client-owned routes; they should not be exposed to `CLIENT` users without separate authorization.
- `UserRole.CLIENT` exists, but route-level policy does not consistently exclude that role from internal routes.
- Unknown auth roles normalize to `LAWYER`; future client auth must fail closed instead of defaulting into an internal role.
- There is no persisted portal membership model tying a user to `clientId`, team, or case.
- There are no explicit `clientVisible`, `approvedForClient`, or `internalOnly` flags on case/document/communication baseline models.

### High risks

- Case summaries include timeline payloads and all case documents.
- Document DTOs expose SharePoint identifiers/paths and download routes use internal assumptions.
- Communication list exposes `summary` and `contentPreview`; detail route returns raw communication plus attachments and related tasks.
- Communication task/attachment routes include internal assignee/uploader/document metadata.
- Document search can locate documents across cases by metadata and must remain internal only.
- Case collaborators expose internal user names/emails/roles.

### Medium risks

- Dashboard stats and recent activity are global/internal and unsuitable for client users.
- Workgroup, matters, timesheet, legal-analysis, handoff, anonymization, generation, review-note, and clause-library routes are internal product areas and need explicit portal denial.
- Existing frontend mock data contains AI/risk-like examples and must not be reused for portal routes or portal demos.

## 12. Required backend changes for future implementation

1. Add a portal-specific auth middleware or strategy that cannot silently fall through to internal `authenticate`.
2. Add portal identity/membership schema in a separate migration.
3. Add additive visibility/publication fields for cases/documents/communications, or separate publication tables.
4. Add `ClientPortalPolicy` helpers for:
   - active portal user,
   - membership by `clientId`,
   - team/workgroup scope,
   - resource visibility,
   - non-enumerating not-found responses.
5. Add dedicated DTO mappers:
   - `ClientPortalCaseDTO`,
   - `ClientPortalDocumentDTO`,
   - `ClientPortalMessageDTO`,
   - `ClientPortalReportDTO`.
6. Add route handlers only under `/api/v1/client-portal`.
7. Keep internal ADM APIs unchanged and unavailable to external client users unless explicitly proven safe.
8. Add audit logging for client portal access, upload, message send, and admin actions.
9. Add download mediation for published documents instead of leaking SharePoint identifiers or raw URLs.
10. Keep feature flags off until each surface has tests and smoke.

## 13. Required tests for future implementation

Feature gate tests:

- Feature off returns `501 FEATURE_NOT_AVAILABLE`, reason `CLIENT_PORTAL_NOT_ENABLED`.
- Upload/messages/reports/integrations subflags return `501` independently.

Auth tests:

- No token returns `401`.
- Internal token cannot call portal-only user routes unless explicitly allowed.
- Client token cannot call internal ADM routes.
- Unknown/unsupported role fails closed.

Authorization tests:

- Client can list own visible cases only.
- Client cannot infer another client's case: `404` preferred.
- Team-scoped user cannot see another team's case.
- Inactive membership returns `403`.
- Feature-off response performs no Prisma data query.

DTO leak tests:

- Case DTO excludes internal assignment, collaborators, timeline payload, comments, legal analyses, review data.
- Document DTO excludes `spItemId`, `spPath`, `spWebUrl`, workspace text, review suggestions.
- Communication DTO excludes raw internal content, provider metadata, task details, attachment storage metadata.

Upload/message tests:

- Client upload creates pending/inbound/not-public document record only.
- Client message creates inbound portal communication but does not create task/case automatically.
- Attachments are metadata-scanned and not published until approved.

Regression tests:

- Existing internal routes remain authenticated for internal users.
- Existing client portal spoofed summary/export stays closed until replaced.
- Client portal cannot access communications import, Outlook, Graph, AI, generation, anonymization, handoff, or legal-analysis routes.

## 14. Recommended implementation order

1. Keep current client portal gate closed.
2. Create `CLIENTPORTAL1A` docs-only model and authorization split plan.
3. Create a migration draft for portal identity/membership and visibility/publication fields; do not apply immediately.
4. Run DB drift/introspection before any migration.
5. Add portal auth/authorization middleware behind tests, still feature-off.
6. Add `GET /api/v1/client-portal/me` behind gate as first contract endpoint.
7. Add read-only case list/detail DTOs with strict ownership/visibility filters.
8. Add read-only document list/download mediation for explicitly published documents.
9. Add client portal messages only after communication publication rules exist.
10. Add uploads last among v1 core flows, with pending-review default.
11. Keep reports/integrations out of v1 unless separately audited.
12. Enable one subflag at a time only after production smoke confirms no internal leak.

## Audit conclusion

Client Portal v1 is feasible, but only with a separate client identity/membership boundary, additive visibility/publication fields, dedicated DTO mappers, and strict feature gates. The current disabled route is safe and should remain closed. The current internal APIs must be treated as unsafe for external client use until a separate portal contract is implemented and tested.

Final classification: `client_portal_v1_security_contract_audited_no_runtime_change`
