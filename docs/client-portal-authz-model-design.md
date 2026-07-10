# Client Portal Authorization Model Design

## Purpose

This is a documentation-only authorization and access-control model for a possible future Client Portal V1. It makes no runtime change, no schema change, no migration, no DB connection, no production apply, no CP-SCHEMA-1 authorization, no Client Portal enablement, no external visibility authorization, no Document/AI enablement, no AI/provider call, and no SharePoint/export/file-processing call.

## Inputs

- `docs/client-portal-product-boundary-design.md`
- `docs/client-portal-current-code-inventory.md`
- `docs/client-portal-v1-data-contract-design.md`
- `docs/production-compatible-baseline-final-rollup.md`
- `docs/production-apply-no-go-reconfirmation.md`
- `docs/production-compatible-baseline-human-decisions.md`
- `docs/documents-workspace-text-privacy-model.md`
- `Backend/src/routes/clientPortal.ts`
- Existing internal case/client/document authorization helpers, inspected only for context.
- Current auth middleware patterns, inspected only for context.

## Current status

- Client Portal remains disabled/quarantined.
- The current backend skeleton is mounted at `/api/v1/client-portal`, auth-first, and double-gated.
- The disabled skeleton returns `501 CLIENT_PORTAL_NOT_ENABLED` for authenticated requests while disabled.
- Existing tests prove unauthenticated `401`, authenticated disabled `501`, flag-alone insufficiency, spoof protection, and no Prisma while disabled.
- No `Backend/src/modules/client-portal` service module exists.
- No dedicated frontend portal route/component/API client exists in the focused inventory.
- The V1 data contract exists only as documentation.
- This authorization model does not authorize implementation or enablement.
- CP-SCHEMA-1 remains blocked.
- Production apply remains NO-GO.

## Core authorization principles

- External portal access is grant-based, not role-based alone.
- Internal roles do not automatically define portal visibility.
- Internal case assignment, case collaboration, or privileged internal role can authorize internal work, but it does not make a response safe for client-facing exposure.
- Client and matter access must be explicit.
- Absence of an active grant means deny.
- Every query must be scoped by the resolved portal user and their active grants.
- No access may be granted by guessing `clientId`, `caseId`, `matterId`, `documentId`, `taskId`, message IDs, or upload request IDs.
- Every portal endpoint must be auth-first, feature-gate-first, principal-resolved, grant-scoped, and mapped through external allow-list DTOs.
- Visibility and authorization are separate checks: a user may be authenticated and still see no matters, documents, tasks, uploads, or messages.
- Client-facing fields must be separately published/sanitized before being exposed.
- Disabled routes must keep returning controlled unavailable responses without data access.

## Principal model

Conceptual principals:

| Principal | Meaning | Portal behavior |
| --- | --- | --- |
| Internal user | Lawyer/admin/staff identity used for the internal Adminiculum app. | Does not automatically become a portal actor and does not make internal DTOs safe externally. |
| External portal user | Authenticated external person allowed to use the portal after explicit portal activation. | Must resolve to active portal identity and grants. |
| Organization client contact | Person acting for a company/organization client. | Needs membership/representative relationship plus matter/document/task grants. |
| Individual client | Natural person who is also the represented client. | Needs active portal identity and explicit grants; email match alone is insufficient. |
| Invited representative | Third party authorized to act for a client or matter. | Needs explicit invitation/acceptance, scope, expiry/revocation rules, and grant chain. |
| Revoked/suspended portal user | Former or temporarily blocked external user. | Denied for all portal endpoints regardless of prior grants. |

Internal user identity and portal user identity should be separate authorization contexts. An internal admin or partner role can manage internal work, but it does not imply that any client-facing response is safe, sanitized, or authorized.

## Portal user identity

A portal user must have an authenticated external identity and must resolve to a future `PortalUser` or equivalent record. Authentication claims alone are not enough. Email match alone is not enough for matter access. The portal user must be active, not suspended, not revoked, and linked to one or more active access grants or memberships.

Minimum conceptual checks:

1. Validate authenticated external identity.
2. Resolve portal principal.
3. Confirm portal user status is active.
4. Resolve active memberships/representative relationships.
5. Resolve active grants for the requested resource.
6. Apply external DTO mapper.

## Matter access grants

Conceptual grant: `PortalMatterAccessGrant`.

Conceptual fields:

- `grantId`
- `portalUserId` or `portalOrganizationId`
- `matterId` or reviewed `externalMatterId`
- `grantType`
- `status`
- `grantedBy`
- `grantedAt`
- `revokedAt`
- optional `expiresAt`
- `reasonCode`
- `visibilityScope`

Conceptual grant types:

- view matter
- view matter status
- view matter deadlines
- view shared documents
- upload requested documents
- view client tasks
- complete client tasks
- view messages, deferred
- reply to messages, deferred

Rules:

- Matter list returns only matters with active matter view grants.
- Matter detail requires an active matter view grant.
- Status/deadline fields require both matter access and published client-facing status/deadline values.
- Internal case assignment or collaboration does not create a portal grant.
- Client entity relation alone does not create a portal grant unless separately approved.
- Grant revocation takes effect immediately.
- Expired grants are treated as absent.
- Suspended portal user status overrides all grants.

## Document access grants

Conceptual grant: `PortalDocumentShare`.

Rules:

- Matter access alone does not expose all documents.
- Each document must be explicitly shared.
- The document must belong to a matter the portal user can access.
- Revoked document share hides the document immediately.
- Document metadata access requires active matter grant plus active document share.
- Document download requires active matter grant plus active document share plus a separate safe storage/download design.
- Shared metadata must use external allow-list DTOs.
- `documents.workspaceText` is never shareable.
- Raw extracted text is never shareable.
- Internal versions, comments, review state, AI/anonymization metadata, storage paths, and generated analyses are not shareable unless separately published in a future artifact model.

## Upload request grants

Conceptual grant: `PortalUploadRequest`.

Rules:

- Uploads are allowed only when an active upload request exists.
- The upload request must be scoped to a matter the portal user can access.
- The upload request controls file types, maximum size, due date, and status.
- Uploaded files should enter an intake/review workflow before becoming broadly visible internally.
- Upload does not trigger AI, extraction, SharePoint upload, export, or document generation by default.
- Upload storage, virus scanning, retention, and deletion remain future design requirements.
- Revoked or expired upload requests reject upload attempts.

## Client-facing task grants

Internal tasks are never exposed by default. Portal tasks must be separately published or represented as client-facing requests.

Rules:

- A portal task must belong to a matter with an active matter grant.
- The portal user needs an active task view grant to see the task.
- Completion requires an active task completion grant.
- Completion by a client should update only the portal task/request state or create an internal signal for triage.
- Completion must not directly mutate internal legal workflow unless a later approved mapper and authorization model explicitly allows it.
- A related document may be referenced only if that document is also shared with the portal user.
- Internal assignees, internal priority, internal checklists, workload records, lawyer-only subtasks, and internal task board metadata remain hidden.

## Message/thread grants

Messages are deferred for V1 unless separately approved.

Rules if implemented later:

- Only explicitly client-visible threads/messages may appear.
- The portal user needs active matter grant plus active thread/message visibility grant.
- Reply requires thread grant plus matter grant plus reply permission.
- Internal communications remain hidden.
- Internal drafts remain hidden.
- Privileged strategy, lawyer notes, raw provider metadata, and internal attachments remain hidden.
- Message retention, audit, redaction, and legal-hold model must be designed before implementation.

## Status/deadline visibility

- Internal status is not automatically visible.
- Internal deadline is not automatically visible.
- `cases.clientRole` remains an internal narrow KEEP field and does not become client-facing by default.
- Client-facing status must be separately published or mapped to a safe label.
- Client-facing deadline must be separately marked/published.
- Absence of a published value returns a safe generic value or omits the field.
- Never leak internal workflow stage, escalation, litigation strategy, review posture, or staffing through status labels.

## Revocation and suspension

- Portal user suspension blocks all portal access.
- Matter grant revocation hides the matter immediately.
- Document share revocation hides the document immediately.
- Upload request revocation blocks future uploads.
- Task grant revocation hides the task or withdraws completion rights depending on status.
- Message grant revocation hides the thread/messages immediately if messaging is later implemented.
- Audit events should be content-free and record actor, action, resource type, resource id, outcome, timestamp, and reason code only.
- Frontend cached state must be rejected/refreshed by backend authorization after revocation.

## Non-enumeration rules

- Unauthorized, expired, revoked, or non-granted matter/document/task/upload/message resources should return a non-enumerating `404` or project-equivalent response.
- Responses must not reveal whether an internal case, document, task, upload request, or message exists.
- Disabled portal route returns `501` before any data check.
- Unauthenticated requests return `401` before feature checks.
- Authorization failures must be content-free and avoid internal IDs, names, statuses, stack traces, Prisma metadata, or route implementation details.

## Endpoint-level grant matrix

| Endpoint | Required principal | Required grant | Denied behavior | Forbidden side effects |
| --- | --- | --- | --- | --- |
| `GET /api/v1/client-portal/me` | Authenticated active portal user. | Active portal user record; membership summary only. | `401`, `501`, or non-enumerating denial for inactive/suspended principal. | No internal user DTO, auth claims, tokens, audit details, or Prisma object spread. |
| `GET /api/v1/client-portal/matters` | Authenticated active portal user. | Active matter view grants. | Return empty list for no grants; deny inactive/suspended. | No internal case list DTO, no ungranted matter lookup, no collaborator/workload/status leak. |
| `GET /api/v1/client-portal/matters/:matterId` | Authenticated active portal user. | Active matter view grant for resolved matter. | Non-enumerating `404` or equivalent if missing/revoked/expired. | No internal timeline, notes, strategy, raw document text, legal analysis, or internal tasks. |
| `GET /api/v1/client-portal/matters/:matterId/documents` | Authenticated active portal user. | Matter view grant plus active document shares. | Non-enumerating denial for matter; list only shared docs. | No unshared documents, no raw text, no storage paths, no review internals. |
| `GET /api/v1/client-portal/documents/:documentId` | Authenticated active portal user. | Active document share plus matter grant. | Non-enumerating `404` or equivalent. | No `workspaceText`, raw extracted text, internal comments, storage paths, AI metadata, or unscoped download. |
| `GET /api/v1/client-portal/tasks` | Authenticated active portal user. | Matter grant plus client-facing task grants. | Empty list for no task grants; non-enumerating matter denial. | No internal task board, workload, assignees, internal priority, or lawyer-only subtasks. |
| `POST /api/v1/client-portal/tasks/:taskId/complete` | Authenticated active portal user. | Active task completion grant. | Non-enumerating denial if absent/revoked/expired. | No direct internal legal workflow mutation without future approved mapper. |
| `GET /api/v1/client-portal/uploads` | Authenticated active portal user. | Matter grant plus active upload request grants. | Empty list or non-enumerating denial for scoped requests. | No storage destinations, internal reviewer notes, AI/extraction status, or SharePoint paths. |
| `POST /api/v1/client-portal/uploads/:uploadRequestId/files` | Authenticated active portal user. | Active upload request grant. | Non-enumerating denial if absent/revoked/expired. | No automatic AI/extraction/SharePoint/export/file processing beyond separately approved upload handling. |
| `GET /api/v1/client-portal/messages` | Deferred. | Matter grant plus explicit thread/message visibility grant. | Deferred; deny unless future model approved. | No internal communications, drafts, provider metadata, strategy, or privileged notes. |
| `POST /api/v1/client-portal/messages/:threadId/reply` | Deferred. | Matter grant plus thread grant plus reply permission. | Deferred; deny unless future model approved. | No direct internal communication mutation without future approved mapper/triage model. |

## Backend enforcement model

Future implementation pattern:

1. Require authentication.
2. Require Client Portal feature gate and ownership-model gate.
3. Resolve portal principal from authenticated identity.
4. Enforce active portal user status.
5. Resolve active memberships and grants.
6. Scope every query by grants before reading resource details.
7. Use explicit Prisma `select` allow-lists or publication tables.
8. Map through external DTO mappers.
9. Return content-free denial/error responses.
10. Write content-free audit events for portal actions.
11. Keep logs content-free.
12. Never reuse internal DTOs or spread Prisma objects.

## Schema implications

Likely future schema needs, for design only:

- `PortalUser`
- `PortalOrganization` or contact relation if organization contacts are supported
- `PortalMatterAccessGrant`
- `PortalDocumentShare`
- `PortalUploadRequest`
- `PortalClientTask`
- deferred `PortalMessageThread` / `PortalMessageVisibility`
- `PortalAuditEvent`
- external-safe IDs or aliases
- grant status, revocation, expiry, and reason fields
- retention/delete fields for shared artifacts and uploads

These are schema implications only. No migration is authorized by this document. CP-SCHEMA-1 remains blocked.

## Required future tests

- Disabled gate returns `501 CLIENT_PORTAL_NOT_ENABLED` and no Prisma is reached.
- Unauthenticated requests return `401` before feature checks.
- Active portal user is required.
- Suspended/revoked portal user is denied.
- Matter list only shows granted matters.
- Matter ID guessing is denied without revealing existence.
- Document access requires both matter grant and document share.
- Revoked matter grant hides matter immediately.
- Revoked document share hides document immediately.
- Upload requires active upload request grant.
- Task completion requires active task completion grant.
- Related document links appear only when the document is shared.
- Internal DTO fields never appear.
- `documents.workspaceText` never appears.
- Internal notes, workload, collaborators, legal analyses, prompts, AI output, audit logs, storage paths, and internal task board fields never appear.
- Object-spread regression tests fail if forbidden keys are added, where practical.
- Errors/logs/audit events are content-free.
- Public OpenAPI metadata remains sanitized until a separate exposure decision is made.

## Open questions

- Which external auth provider and tenant model will portal users use?
- Are portal users individuals, organizations, or both?
- Can one portal user belong to multiple clients?
- Can a matter be visible to multiple client organizations or representatives?
- How are invited representatives approved, expired, and revoked?
- Should grants expire automatically?
- What is the emergency revocation process?
- What is the client-visible status publication workflow?
- What is the document share approval workflow?
- What upload storage, virus scanning, retention, and deletion model is approved?
- Are messages in V1 or deferred?
- What is the content-minimal audit and legal-hold requirement?

## Recommended next package

`CLIENT-PORTAL-V1-UI-IA-DESIGN-1`

The product boundary, current code inventory, data contract, and authorization model now describe what is safe in concept. The next design package should translate that into screens, navigation, and user flows without implementation.

## Follow-up — CLIENT-PORTAL-V1-UI-IA-DESIGN-1

- `CLIENT-PORTAL-V1-UI-IA-DESIGN-1` created
  `docs/client-portal-v1-ui-ia-design.md`.
- The UI/IA design maps grant-scoped portal concepts into Home, Matters, Documents,
  Uploads/Requests, deferred Messages, and optional Profile/Contact screens.
- This authorization model remains documentation-only. Client Portal remains
  disabled/quarantined, external visibility remains unauthorized, CP-SCHEMA-1 remains
  blocked, and production apply remains NO-GO.

## Follow-up — CLIENT-PORTAL-SCHEMA-READINESS-DESIGN-1

- `CLIENT-PORTAL-SCHEMA-READINESS-DESIGN-1` created
  `docs/client-portal-schema-readiness-design.md`.
- The schema readiness design maps portal principals, memberships, grants, document
  shares, upload requests, client-facing tasks, deferred messages, and content-free audit
  into future schema families.
- This authorization model remains documentation-only. CP-SCHEMA-1 remains blocked,
  production apply remains NO-GO, and Client Portal remains disabled/quarantined.

## Final decision statement

This design does not implement authorization. Client Portal remains quarantined. CP-SCHEMA-1 remains blocked. Production apply remains NO-GO. External visibility remains unauthorized. The runtime skeleton remains disabled. No schema migration is authorized.

## Non-actions

- No runtime changed.
- No schema changed.
- No migration was created.
- No DB connection was used.
- No DB apply was performed.
- No business data was read.
- No Azure deployment or app setting was changed.
- No route behavior changed.
- No OpenAPI or CORS behavior changed.
- No frontend changed.
- No tests changed.
- No Client Portal was enabled.
- No Document/AI flag was enabled.
- No AI/provider call was made.
- No file processing was run.
- No SharePoint/Graph call was made.
- No export or generation job was run.

## Final classification

`client_portal_authz_model_designed_no_db_change_no_runtime_change`
