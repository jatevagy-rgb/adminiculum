# Client Portal V1 Data Contract Design

## Purpose

This document defines the conceptual Client Portal V1 data contract before any runtime work. It is documentation-only and does not authorize runtime changes, schema changes, migrations, database access, production apply, CP-SCHEMA-1, Client Portal enablement, external visibility, Document/AI enablement, AI/provider use, SharePoint/Graph use, export jobs, or file processing.

## Inputs

- `docs/client-portal-product-boundary-design.md`
- `docs/client-portal-current-code-inventory.md`
- `docs/production-compatible-baseline-final-rollup.md`
- `docs/production-apply-no-go-reconfirmation.md`
- `docs/production-compatible-baseline-human-decisions.md`
- `docs/documents-workspace-text-privacy-blocked-closeout.md`

## Current status

- Client Portal remains disabled and quarantined.
- The backend has an auth-first, double-gated skeleton mounted at `/api/v1/client-portal`.
- The current skeleton does not provide a service module, frontend portal, external mapper, or approved publication model.
- Existing disabled tests prove unauthenticated requests are rejected before feature checks and authenticated disabled requests return `501 CLIENT_PORTAL_NOT_ENABLED` without Prisma access.
- This data contract does not authorize implementation, enablement, production apply, CP-SCHEMA-1, or external client visibility.
- CP-SCHEMA-1 remains blocked.
- Production apply remains NO-GO.

## Contract principles

- Use explicit allow-list DTOs only.
- Never spread Prisma objects into portal responses.
- Never reuse internal DTOs for external/client-facing responses.
- Never include raw text, internal metadata, internal notes, workload data, collaboration internals, or audit internals.
- Absence of an explicit visibility grant means not visible.
- Client-facing fields must be separately published, sanitized, and reviewed before exposure.
- Scope every endpoint to the authenticated portal user and their resolved grants; never trust global `clientId`, `caseId`, `matterId`, `documentId`, or path parameters alone.
- External-safe identifiers require a separate review before they replace internal IDs.
- Disabled routes must remain safe: no Prisma access and no internal vocabulary leakage while Client Portal is off.

## Forbidden global fields and categories

The following must not appear in any Client Portal V1 DTO unless a later design explicitly creates a sanitized publication artifact and targeted tests:

- `documents.workspaceText`
- raw extracted text, raw OCR text, raw uploaded text, or content previews derived from raw text
- anonymize/rehydrate internals, mappings, prompts, and reidentification data
- AI prompts, AI provider responses, AI review internals, legal analyses, scores, drafts, and model metadata
- internal notes, lawyer strategy, litigation theory, internal timeline comments, and review comments
- internal task board data, internal checklists, internal priorities, workload records, and collaborator lists
- case collaborators, workload records, and operational staffing data
- internal communications unless explicitly published through a future client-visible message model
- audit logs, admin/ops data, internal feature flags, OpenAPI/admin metadata, and runtime diagnostics
- draft legal documents, generated documents, or contract-generation artifacts unless separately shared as a client-visible artifact
- storage paths, local filesystem paths, SharePoint paths, blob keys, signed URLs without scoped publication, and raw file metadata that can leak internal structure
- internal-only fields from `Client`, `Case`, `Task`, `Document`, `Communication`, `WorkloadRecord`, `CaseCollaborator`, and related tables

## Conceptual endpoint list

These endpoints are contract candidates only. They are not implementation approval.

| Endpoint | Purpose | Required grant | DTO | Forbidden fields | V1 status |
| --- | --- | --- | --- | --- | --- |
| `GET /api/v1/client-portal/me` | Return authenticated portal profile and available scope summary. | Resolved portal identity and active membership. | `PortalMeDto` | auth claims, tokens, internal user role internals, audit | Required concept |
| `GET /api/v1/client-portal/matters` | List matters visible to the portal user. | Active matter grant per matter. | `PortalMatterListItemDto[]` | internal case DTOs, internal status, strategy, collaborators, workload | Required concept |
| `GET /api/v1/client-portal/matters/:matterId` | Show one granted matter with published client-facing summary. | Active grant for resolved matter. | `PortalMatterDetailDto` | internal timeline, raw notes, legal theory, `workspaceText`, AI output | Required concept |
| `GET /api/v1/client-portal/matters/:matterId/documents` | List explicitly shared documents for a granted matter. | Matter grant plus document share grant. | `PortalDocumentListItemDto[]` | raw document text, storage paths, extraction metadata | Required concept |
| `GET /api/v1/client-portal/documents/:documentId` | Return shared document metadata and future safe access instructions. | Explicit document share grant. | `PortalDocumentDetailDto` | raw content, `workspaceText`, internal review history, SharePoint path | Required concept |
| `GET /api/v1/client-portal/tasks` | List client-facing tasks/requests only. | Active task/request grant for portal user or membership. | `PortalTaskDto[]` | internal tasks, internal assignees, internal priority/checklists | Required concept |
| `POST /api/v1/client-portal/tasks/:taskId/complete` | Mark a client-facing request complete for triage. | Active client-facing task grant. | `PortalTaskDto` or minimal status DTO | direct internal task mutation without mapper, internal workflow fields | Required concept |
| `GET /api/v1/client-portal/uploads` | List upload requests addressed to the portal user/client. | Active upload request grant. | `PortalUploadRequestDto[]` | storage destination, reviewer notes, auto-processing status | Required concept |
| `POST /api/v1/client-portal/uploads/:uploadRequestId/files` | Upload to an approved client-facing request. | Active upload request grant. | upload receipt DTO, later defined | raw storage path, SharePoint path, AI/extraction results | Required concept, needs separate storage design |
| `GET /api/v1/client-portal/messages` | List explicitly client-visible message threads. | Explicit message/thread grant. | `PortalMessageThreadDto[]` | internal communications, source task metadata, lawyer notes | Optional later |
| `POST /api/v1/client-portal/messages/:threadId/reply` | Add a client reply to an approved visible thread. | Explicit message/thread grant and reply permission. | message receipt DTO, later defined | internal communication write model, privileged drafts | Optional later |

## DTO definitions

### `PortalMeDto`

Allowed fields:

- `portalUserId` or reviewed external-safe id
- `displayName`
- `email`
- `linkedClientDisplayNames`
- `availableMatterCount`
- safe feature booleans such as `canViewDocuments`, `canUploadFiles`, `canCompleteRequests`

Forbidden fields:

- internal `User.id` unless separately reviewed
- internal role internals, auth claims, tokens, refresh tokens, audit entries, tenant secrets, and feature flags

### `PortalMatterListItemDto`

Allowed fields:

- `matterId` or `externalMatterId`
- `displayName`
- `clientFacingStatus`
- `shortDescription`
- `needsAttention`
- `nextClientAction`
- `nextClientDeadline`
- `lastClientVisibleUpdateAt`
- `responsibleLawyerDisplayName`
- `sharedDocumentCount`
- `openUploadRequestCount`

Forbidden fields:

- internal case status when not deliberately published
- internal notes, internal deadlines, assigned lawyer IDs, collaborators, workload, litigation strategy, and `cases.clientRole` unless mapped to a deliberately safe client-facing label

### `PortalMatterDetailDto`

Allowed fields:

- matter id or external matter id
- `displayName`
- `clientFacingStatus`
- `clientFacingSummary`
- `responsibleLawyerDisplayName`
- safe client-visible timeline updates
- next client actions
- client-visible deadlines
- shared document summary
- upload request summary
- optional client-facing messages summary after separate approval

Forbidden fields:

- internal timeline/story, legal theory, litigation workspace data, internal notes, review guidance, internal tasks, raw document text, `workspaceText`, legal analyses, AI outputs, and audit logs

### `PortalDocumentListItemDto`

Allowed fields:

- `documentId` or `externalDocumentId`
- `matterId` or `externalMatterId`
- `displayName`
- `documentType`
- `sharedAt`
- `sharedByDisplayName`
- `fileSize` if safe
- `mimeType` if safe
- `downloadAvailable`
- `clientActionRequired`
- `versionLabel` if safe

Forbidden fields:

- storage path, blob path, SharePoint path, unsafe internal filename, raw content, content preview from raw text, `workspaceText`, extraction metadata, AI/anonymization metadata, and internal review status unless separately published

### `PortalDocumentDetailDto`

Allowed fields:

- all safe list fields
- safe description
- scoped download token or URL only after separate storage/access design
- client-facing instructions

Forbidden fields:

- raw text, `workspaceText`, extracted text, internal comments, internal version history unless explicitly shared, generated analysis, prompt metadata, and local/SharePoint storage internals

### `PortalTaskDto`

Allowed fields:

- `taskId` or `externalTaskId`
- `matterId`
- `title`
- `clientFacingDescription`
- `dueDate`
- `status`
- `actionType`
- `relatedDocumentId` only if the document is shared
- `completedAt`

Forbidden fields:

- unsafe internal task id, internal assignee, internal priority when not client-facing, internal checklist, internal notes, lawyer-only subtasks, workload records, and case collaborator metadata

### `PortalUploadRequestDto`

Allowed fields:

- `uploadRequestId`
- `matterId`
- `title`
- `description`
- `dueDate`
- `allowedFileTypes`
- `maxFileSize`
- `status`
- `relatedTaskId` if safe

Forbidden fields:

- internal storage destination, SharePoint path, blob key, internal reviewer notes, automatic processing details, AI status, extraction status, anonymization/rehydration status, and malware-scan internals unless separately designed for client display

### `PortalMessageThreadDto` optional/deferred

Allowed fields only after a separate communication visibility design:

- `threadId`
- `matterId`
- `subject`
- `lastMessageAt`
- `unreadCount`
- participant display names
- messages explicitly marked client-visible

Forbidden fields:

- internal communications, `sourceTaskCount`, `attachmentCount` unless safe, internal-only metadata, lawyer notes, privileged drafts, raw Outlook/provider metadata, and non-published attachments

## Visibility and grant model

### Matter visibility

Matter visibility requires an explicit portal matter grant. The backend must resolve the authenticated portal user to active memberships and grants, then scope every matter query through those grants. No route may infer access from a client ID, case ID, matter ID, email address, or path parameter alone.

### Document visibility

Document visibility requires an explicit document share grant. Matter access alone does not expose all documents. Shared document metadata must be separate from internal document metadata. Raw text, `workspaceText`, extracted text, review comments, and storage internals are never shared by default.

### Task and upload visibility

Only client-facing tasks and upload requests are visible. Completing a client-facing request should update the client-facing request state or create a triage event; it must not directly mutate internal task workflow unless a later mapper and authorization model explicitly allows that.

### Message visibility

Message visibility is deferred. If implemented later, it must use an explicit client-visible thread/message model. Internal communications and raw provider data remain hidden.

### Status and deadline publication model

Internal status and internal deadlines are not automatically client-facing. Client-facing statuses, deadlines, next actions, and summaries must be published/sanitized fields. If no published value exists, the portal returns a safe generic state or omits the field rather than leaking internal workflow state.

## Mapper requirements

- One mapper per DTO.
- Each mapper uses explicit `select` allow-lists or prebuilt publication records.
- No `...record`, no broad object spread, and no internal DTO reuse.
- Tests must assert forbidden fields are absent.
- Tests must assert raw markers such as `workspaceText`, `internalNote`, `strategy`, `workload`, `collaborator`, `prompt`, and storage path strings are absent.
- Tests must prove grant scoping for correct user, wrong user, wrong client, guessed matter, guessed document, disabled portal, and unauthenticated access.
- Disabled route tests must continue proving no Prisma queries run while the feature is off.

## Schema implications for future design only

Future schema work may need separate, additive, inert models or fields such as:

- `ClientPortalUser`
- `ClientPortalMembership`
- `PortalMatterAccessGrant`
- `PortalMatterPublishedStatus` or client-facing matter publication fields
- `PortalDocumentShare`
- `PortalUploadRequest`
- `PortalClientTask`
- optional `PortalMessageThread` and client-visible message records
- `PortalAuditEvent` with content-minimal records
- retention/delete metadata for portal artifacts and uploads
- external-safe IDs or aliases where exposing internal IDs is rejected

No migration is authorized here. CP-SCHEMA-1 remains blocked until production-compatible baseline work is resolved and clone proof is approved.

## Open questions

- Which external auth provider and tenant model will portal users use?
- Are portal users individuals, organizations, or both?
- Can one portal user belong to multiple clients?
- Can one matter be visible to multiple clients or counterparties?
- How are matter/document grants revoked and audited?
- What is the document share lifecycle: draft, approved, published, revoked, expired?
- What upload storage, virus scanning, retention, and deletion model is approved?
- Are portal messages in V1 or deferred?
- Should portal events trigger email notifications?
- Which identifiers are safe to expose externally?
- What is the audit/legal-hold requirement for portal actions?

## Required future tests

- Disabled portal returns `501 CLIENT_PORTAL_NOT_ENABLED` and does not call Prisma.
- Unauthenticated portal requests return `401` before feature checks.
- A portal user sees only granted matters.
- A portal user cannot guess another matter ID, document ID, task ID, upload request ID, or message thread ID.
- Document access requires explicit document share grant.
- Matter access alone does not expose all documents.
- `documents.workspaceText` never appears in any portal response.
- Internal notes, internal tasks, workload records, collaborators, legal analyses, prompts, AI output, audit logs, and storage paths never appear.
- Mapper tests fail if forbidden keys are added.
- Public OpenAPI metadata remains sanitized until an exposure decision is made.
- Upload actions require an upload request grant.
- Message visibility tests are added only if portal messaging is implemented.

## Recommended next package

`CLIENT-PORTAL-AUTHZ-MODEL-DESIGN-1`

That package should define portal identity, memberships, grant resolution, wrong-client/wrong-matter rejection, and disabled behavior before any runtime implementation.

## Follow-up — CLIENT-PORTAL-AUTHZ-MODEL-DESIGN-1

- `CLIENT-PORTAL-AUTHZ-MODEL-DESIGN-1` created
  `docs/client-portal-authz-model-design.md`.
- The authorization model defines conceptual portal principals, matter/document/upload/task/message grants, revocation, non-enumeration, endpoint-level grant checks, and future tests.
- This data contract remains documentation-only. Client Portal remains disabled/quarantined, external visibility remains unauthorized, CP-SCHEMA-1 remains blocked, and production apply remains NO-GO.

## Follow-up — CLIENT-PORTAL-V1-UI-IA-DESIGN-1

- `CLIENT-PORTAL-V1-UI-IA-DESIGN-1` created
  `docs/client-portal-v1-ui-ia-design.md`.
- The UI/IA design maps the conceptual DTOs to client-facing screens, components, empty
  states, disabled states, and privacy checklists.
- This data contract remains documentation-only. No frontend, runtime, schema, migration,
  DB, Azure, OpenAPI/CORS, or Client Portal enablement is authorized.

## Follow-up — CLIENT-PORTAL-SCHEMA-READINESS-DESIGN-1

- `CLIENT-PORTAL-SCHEMA-READINESS-DESIGN-1` created
  `docs/client-portal-schema-readiness-design.md`.
- The schema readiness design maps DTOs to future portal source tables, sanitized
  publication models, grant records, upload/submission metadata, and content-free audit.
- This data contract remains documentation-only. No `schema.prisma` edit, migration,
  DB apply, runtime implementation, or Client Portal enablement is authorized.

## Final decision statement

This document does not implement the Client Portal V1 data contract. It does not authorize schema changes, migrations, DB apply, production apply, frontend work, OpenAPI exposure, CORS changes, auth changes, Azure changes, file processing, SharePoint/Graph calls, AI/provider calls, or Client Portal enablement. Client Portal remains disabled/quarantined. CP-SCHEMA-1 remains blocked. Production apply remains NO-GO. External visibility remains unauthorized.

## Non-actions

- No runtime changed.
- No schema changed.
- No migration was created or applied.
- No DB connection was used.
- No DB apply was performed.
- No production or Azure resource was touched.
- No route behavior changed.
- No OpenAPI or CORS behavior changed.
- No frontend changed.
- No tests changed.
- No Client Portal was enabled.
- No Document/AI feature was enabled.
- No AI/provider call was made.
- No SharePoint/Graph call was made.
- No export, generation, upload, download, or file processing job was run.

## Final classification

`client_portal_v1_data_contract_designed_no_db_change_no_runtime_change`

## Follow-up — CLIENT-PORTAL-DTO-TYPES-FOUNDATION-1

- `CLIENT-PORTAL-DTO-TYPES-FOUNDATION-1` added a type-only V1 DTO foundation for the static/mock Client Portal shell.
- The DTOs are allow-list frontend-local TypeScript types aligned with this data contract: `PortalMeDto`, `PortalMatterListItemDto`, `PortalMatterDetailDto`, `PortalDocumentListItemDto`, `PortalDocumentDetailDto`, `PortalTaskDto`, `PortalUploadRequestDto`, and deferred `PortalMessageThreadDto`.
- Existing synthetic frontend mock data is typed with these DTOs using TypeScript compile-time checks only.
- No backend API implementation, frontend API integration, schema/migration/DB change, Prisma business access, upload/download/message implementation, OpenAPI/CORS exposure, Azure change, or Client Portal enablement is authorized.
- Client Portal backend remains disabled/quarantined, external visibility remains unauthorized, CP-SCHEMA-1 remains blocked, and production apply remains NO-GO.

## Follow-up — CLIENT-PORTAL-BACKEND-DISABLED-DTO-STUBS-1

- `CLIENT-PORTAL-BACKEND-DISABLED-DTO-STUBS-1` added a **backend-local** (not frontend, not shared-package) implementation of this contract's DTOs and the mapper boundary, in `Backend/src/modules/client-portal/`:
  - `types.ts` — explicit allow-list interfaces `PortalMeDto`, `PortalMatterListItemDto`, `PortalMatterDetailDto`, `PortalDocumentListItemDto`, `PortalDocumentDetailDto`, `PortalTaskDto`, `PortalUploadRequestDto`, and deferred `PortalMessageThreadDto`, using external-safe `*Ref` identifiers.
  - `mappers.ts` — one pure mapper per DTO (`toPortal*Dto`) from **local explicit source shapes** (not Prisma models, not internal DTOs), returning explicit fields only (no `...source` spread), per the "Mapper requirements" section above. No Prisma import, no DB query, no `workspaceText` access.
  - `tests/clientPortalDtoMappers.test.ts` — asserts allow-list-only output, forbidden-field drop (`workspaceText`, `internalNote`, `storagePath`, `sharePointPath`, `workload`, `collaborator`, `rawText`, `extractedText`, …), and that the module source imports no Prisma/DB/services.
- This is **type/mapper foundation only.** The mappers are not wired into any live route; the disabled-route tests (`401` before feature checks, `501 CLIENT_PORTAL_NOT_ENABLED` without Prisma) and the triple-flag runtime-ready gate remain unchanged.
- No backend API implementation, frontend API integration, schema/migration/DB change, Prisma business access, upload/download/message implementation, OpenAPI/CORS exposure, Azure change, or Client Portal enablement is authorized. Client Portal backend remains disabled/quarantined, external visibility remains unauthorized, CP-SCHEMA-1 remains blocked, and production apply remains NO-GO.
