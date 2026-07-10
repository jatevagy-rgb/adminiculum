# Client Portal Schema Readiness Design

## Purpose

This is a documentation-only schema readiness design for a possible future Client Portal V1. It makes no schema change, no migration, no runtime change, no DB connection, no production apply, no CP-SCHEMA-1 authorization, no Client Portal enablement, no external visibility authorization, no Document/AI enablement, no AI/provider call, and no SharePoint/export/file-processing call.

## Inputs

- `docs/client-portal-product-boundary-design.md`
- `docs/client-portal-current-code-inventory.md`
- `docs/client-portal-v1-data-contract-design.md`
- `docs/client-portal-authz-model-design.md`
- `docs/client-portal-v1-ui-ia-design.md`
- `docs/production-compatible-baseline-final-rollup.md`
- `docs/production-apply-no-go-reconfirmation.md`
- `docs/production-compatible-baseline-human-decisions.md`
- `docs/partial-schema-drift-inventory.md`
- `docs/partial-schema-drift-triage.md`
- `docs/production-schema-readonly-compare.md`
- `Backend/prisma/schema.prisma`, inspected only; not edited.

## Current status

- Client Portal remains disabled/quarantined.
- The backend skeleton remains disabled and double-gated.
- No `Backend/src/modules/client-portal` service module exists.
- No frontend portal exists.
- The data contract, authorization model, and UI/IA are documentation-only.
- `Backend/prisma/schema.prisma` currently contains a CP-SCHEMA-1 candidate block, but that candidate is not production-ready and is not authorized for apply by this document.
- This schema readiness design does not authorize schema implementation.
- CP-SCHEMA-1 remains blocked.
- Production apply remains NO-GO.

## Schema design principles

- Portal visibility must be explicit.
- Internal data is private by default.
- External DTOs need external-safe source fields or sanitized publication records.
- Grants must be first-class, not inferred from internal assignments, internal roles, case collaborators, or client relations.
- Document sharing must be explicit.
- Upload requests must be explicit.
- Client-facing statuses, deadlines, tasks, and timeline updates must be published/sanitized.
- Audit must be content-free.
- Retention and legal hold must be considered before durable portal content or uploaded files are enabled.
- No field should expose `documents.workspaceText`.
- Schema must remain inert/default-off until runtime, feature gates, authz, DTO mappers, tests, and production migration proof are separately approved.

## Existing model reuse assessment

| Existing model/family | Can portal schema reference it? | Can it be exposed directly? | Safe candidate fields | Internal-only fields / risks | Adapter or publication needed |
| --- | --- | --- | --- | --- | --- |
| `Client` | Yes, as tenant/client ownership anchor. | No. | display name only after membership/grant resolution. | identity fields, billing/admin data, internal notes, master data. | Portal membership and safe display mapper. |
| `Case` | Yes, as matter anchor. | No. | id only as internal FK; client-facing display/status via publication. | internal status, priority, description, deadline, `clientRole`, assigned lawyer ids, strategy, timeline. | Matter publication model/artifact and matter access grant. |
| `Document` | Yes, as source for shared artifact references. | No. | id as internal FK; safe display metadata if explicitly shared. | `workspaceText`, raw/extracted text, storage paths, SharePoint metadata, review state. | Document share/publication artifact. |
| `Task` | Yes, as optional source for client-facing request. | No. | id as internal source reference only. | internal task title/description/priority/status/assignee/checklist/workload. | Portal client task or request artifact. |
| `Communication` | Deferred; possible source reference for client-visible message artifact later. | No. | id as internal source reference only if messaging approved. | raw communications, provider metadata, attachments, internal notes, source task counts. | Deferred message/thread publication model. |
| `User` | Yes, for internal actor references such as grantedBy/publishedBy/reviewedBy. | No. | display name if deliberately published. | internal role, id, email, workload, assignment, auth data. | Internal actor display mapper. |
| `case_collaborators` | Internal-only. | No. | none for portal visibility. | collaborator list/staffing/access semantics are internal. | Do not infer portal grants from collaborators. |
| `workload_records` | Internal-only. | No. | none. | workload/capacity/operational data. | No portal adapter in V1. |
| Timeline/audit/document review models | Source only after explicit publication. | No. | content-free event metadata if separately published. | internal timeline, audit, review guidance, AI/document comments. | Safe update publication artifact. |

## Current CP-SCHEMA-1 candidate assessment

The current Prisma schema includes a candidate Client Portal foundation block with these families:

- `ClientPortalUser`
- `ClientPortalMembership`
- `ClientVisibleArtifact`
- `ClientPortalGrant`
- `ClientSubmission`
- `ClientSubmissionAttachment`
- `ClientPortalAuditEvent`

This block is useful as a candidate direction because it separates portal users from internal `User`, introduces membership/grant concepts, creates client-visible artifacts, routes inbound submissions through triage, and includes content-minimal audit metadata. However:

- it is still a candidate, not production-ready;
- no production migration apply is authorized;
- CP-SCHEMA-1 remains blocked by production-compatible baseline posture;
- runtime routes remain disabled and have no service module;
- external visibility remains unauthorized;
- additional review is still needed for artifact payload shape, upload storage, message deferral, external-safe IDs, retention, and legal hold.

## Proposed future schema families

### PortalUser

Purpose:

- external authenticated portal principal.

Conceptual fields:

- `id`
- `externalAuthSubject`
- `email`
- `emailNormalized`
- `displayName`
- `status`
- optional `linkedClientId` only if the model chooses one-client users
- `createdAt`
- `updatedAt`
- `lastLoginAt`
- `revokedAt` / `suspendedAt`

Privacy notes:

- auth claims are not enough for access;
- email match alone is not matter access;
- portal identity must remain separate from internal `UserRole.CLIENT` and the internal user role model.

Current candidate alignment:

- `ClientPortalUser` substantially covers this family, but future review should decide password-vs-external-auth posture and whether `passwordHash` is acceptable for V1.

### PortalMatterAccessGrant

Purpose:

- explicit matter access.

Conceptual fields:

- `id`
- `portalUserId` or membership/group reference
- `caseId`
- `grantType`
- `status`
- `grantedByUserId`
- `grantedAt`
- `revokedAt`
- optional `expiresAt`
- `reasonCode`
- `visibilityScope`
- `createdAt`
- `updatedAt`

Rules:

- absence of grant means deny;
- revocation is immediate;
- grant is required for matter list/detail;
- internal case collaborator, assigned lawyer, or client relation does not create portal access.

Current candidate alignment:

- `ClientPortalGrant` models artifact grants rather than direct matter grants. This may be acceptable if every matter view is represented as a `ClientVisibleArtifact`, but the future implementation must prove matter-list queries can be grant-scoped efficiently and clearly.

### PortalMatterPublication

Purpose:

- safe client-facing matter status, summary, next action, and deadline.

Conceptual fields:

- `id`
- `caseId`
- `clientFacingDisplayName`
- `clientFacingStatus`
- `clientFacingSummary`
- `nextClientAction`
- `nextClientDeadline`
- `lastClientVisibleUpdateAt`
- `responsibleLawyerDisplayName`
- `publishedByUserId`
- `publishedAt`
- `status`
- `createdAt`
- `updatedAt`

Rules:

- internal case status is not automatically client-facing;
- absence of publication returns safe omission or generic state;
- publication should be auditable and reversible.

Current candidate alignment:

- `ClientVisibleArtifact` can represent status/deadline/timeline artifacts, but its `payload Json` must be constrained by versioned validators before runtime use.

### PortalDocumentShare

Purpose:

- explicit document visibility.

Conceptual fields:

- `id`
- `documentId`
- `caseId`
- `portalUserId` or grant group/artifact reference
- `displayName`
- `safeDescription`
- `documentType`
- `sharedByUserId`
- `sharedAt`
- `revokedAt`
- optional `expiresAt`
- `downloadAllowed`
- `versionLabel`
- `status`

Rules:

- matter access alone does not reveal all documents;
- document must be explicitly shared;
- no raw text;
- no `workspaceText`;
- no storage paths.

Current candidate alignment:

- `ClientVisibleArtifact` plus `ClientPortalGrant` can model a document share if `artifactType = DOCUMENT_VERSION` and source document fields are used carefully. Download storage and scoped file access remain unresolved.

### PortalUploadRequest

Purpose:

- client-facing request to upload documents.

Conceptual fields:

- `id`
- `caseId`
- `portalUserId` or grant group/artifact reference
- `title`
- `description`
- `dueDate`
- `allowedFileTypes`
- `maxFileSize`
- `status`
- `requestedByUserId`
- `requestedAt`
- `completedAt`
- `revokedAt`
- optional `retentionPolicyKey`

Rules:

- upload is allowed only with active request;
- uploaded file requires intake/review before broad internal visibility;
- no automatic AI, extraction, SharePoint, export, or document generation processing.

Current candidate alignment:

- `ClientVisibleArtifact` can represent a document request and `ClientSubmission` can represent the inbound response. The future design must prove upload request fields are not hidden in unconstrained JSON without validation.

### PortalUploadedFile

Purpose:

- metadata for a file submitted by a client.

Conceptual fields:

- `id`
- `uploadRequestId`
- `caseId`
- `originalFileName`
- `safeDisplayName`
- `mimeType`
- `size`
- `storageRef`
- `status`
- `uploadedByPortalUserId`
- `uploadedAt`
- optional `reviewedByUserId`
- optional `reviewedAt`
- optional `rejectedAt`
- optional `retentionPolicyKey`

Rules:

- storage/security/virus scan future design is required;
- `storageRef` is never client-facing directly;
- review workflow is required before internal document conversion.

Current candidate alignment:

- `ClientSubmissionAttachment` covers much of this metadata, including scan status and accepted-document reference. Storage reference, retention, virus scanning, and download/preview policies remain future work.

### PortalClientTask

Purpose:

- client-facing action/request.

Conceptual fields:

- `id`
- `caseId`
- `portalUserId` or grant group/artifact reference
- `title`
- `description`
- `dueDate`
- `status`
- `actionType`
- optional `relatedDocumentShareId`
- `completedAt`
- `revokedAt`
- `createdByUserId`
- `createdAt`
- `updatedAt`

Rules:

- not the same as internal `Task` by default;
- completion should not directly mutate internal legal workflow unless separately mapped and approved.

Current candidate alignment:

- `ClientVisibleArtifact` type `TODO` or `REQUEST` may represent this, while `ClientSubmission` may represent completion/response. A dedicated portal task table may still be clearer if task semantics become complex.

### PortalMessageThread / PortalMessage, deferred

Purpose:

- optional/deferred client-visible messaging.

State:

- deferred from V1 unless the communication model is approved.

Conceptual fields:

- thread id;
- `caseId`;
- participants;
- visibility status;
- messages;
- content retention;
- attachments.

Rules:

- internal communications remain hidden;
- separate retention/audit is required;
- no raw provider metadata or privileged internal notes.

Current candidate alignment:

- `ClientVisibleArtifact` type `MESSAGE` and `ClientSubmission` type `MESSAGE` may support a minimal future bridge, but a durable thread/message model should be deferred until product and retention rules are approved.

### PortalAuditEvent

Purpose:

- content-free portal access audit.

Conceptual fields:

- `id`
- `portalUserId`
- optional `caseId`
- optional `documentId`
- `action`
- `result`
- `reasonCode`
- `timestamp`
- IP/session metadata only if allowed
- no raw content

Forbidden:

- raw text;
- snippets;
- document content;
- message content;
- AI prompt/output;
- `workspaceText`.

Current candidate alignment:

- `ClientPortalAuditEvent` is directionally aligned. Its `metadata Json?` must be constrained to content-free values only before runtime use.

## External-safe identifiers

The implementation must decide whether portal URLs expose internal IDs or external-safe IDs.

Recommendation:

- Prefer stable external-safe aliases for portal URL parameters if feasible.
- Internal IDs may be acceptable only after explicit review, non-enumeration tests, and logging review.
- Avoid sequential or guessable identifiers.
- Never expose storage references as IDs.

## Visibility publication model

Publication should be explicit, auditable, reversible, and separate from internal models.

Publication families:

- status publication;
- deadline publication;
- document publication;
- task/request publication;
- update/timeline publication.

Rules:

- internal fields are not published by default;
- publication should require internal approval;
- revoked/expired publications disappear from portal views;
- payloads must be versioned and validated;
- broad JSON payloads are acceptable only with strict validators and forbidden-field tests.

## Retention and deletion implications

- Uploaded files require retention, deletion, virus-scan, and legal-hold rules.
- Messages require separate retention and legal-hold rules if implemented.
- Audit has separate content-free retention.
- Document shares may be revoked without deleting the original internal document.
- Matter grant revocation hides access but does not delete internal data.
- GDPR/data subject workflows need future design.
- Legal hold may delay deletion and must be represented explicitly before durable content is enabled.

## Migration risk assessment

- Adding portal tables touches production schema and therefore requires production-compatible baseline resolution first.
- CP-SCHEMA-1 cannot be applied while production apply remains NO-GO.
- External identifiers and unique constraints need careful design to avoid future breaking changes.
- Grant lookup indexes must support every portal query path.
- Revocation/expiry predicates must be efficient and consistently applied.
- Foreign keys should avoid accidental cascading deletion of internal records.
- Nullable/optional fields need disciplined semantics to avoid ambiguous visibility rules.
- Broad JSON payloads can hide privacy risk unless validators and tests are mandatory.
- Upload storage may require additional infrastructure outside Prisma.
- A future production apply requires fresh clone proof, migration review, rollback/abandon plan, and human approval.

## Privacy risk assessment

- Reusing internal `Case`, `Document`, `Task`, `Communication`, or `User` DTOs can leak privileged legal data.
- `documents.workspaceText` must remain globally forbidden.
- Internal notes, workload, collaborators, legal analysis, AI outputs, prompts, raw extracted text, audit logs, and admin/ops data must not be embedded in publication payloads.
- Artifact payloads must not become a dumping ground for internal JSON.
- `storageRef`, SharePoint paths, local paths, and internal filenames must not be client-facing.
- Content-free audit and content-free logging are required before runtime implementation.

## CP-SCHEMA-1 posture

- CP-SCHEMA-1 remains blocked.
- This document is readiness design only.
- No migration file should be created by this task.
- No `schema.prisma` edit should be made by this task.
- The current CP-SCHEMA-1 candidate in `schema.prisma` remains a candidate only.
- Future CP-SCHEMA-1 reconsideration requires human decision, production-compatible baseline resolution, clone proof, payload validation review, authz test plan, and explicit no-exposure confirmation.

## Required future tests

- Prisma schema validation tests after future implementation.
- Grant scoping tests for correct user, wrong user, wrong client, guessed matter, guessed document, guessed upload request, and guessed task.
- Revoked/expired grant tests.
- Document share tests requiring both matter grant and document share.
- Upload request tests requiring active request and safe file metadata.
- Client-facing task completion tests proving no direct internal workflow mutation unless explicitly mapped.
- Forbidden field DTO tests.
- `workspaceText` absence tests.
- Content-free audit tests.
- Content-free error/log tests.
- No raw `storageRef` in client DTO tests.
- No accidental cascade deletion tests if DB-layer tests are available.
- Payload validator tests for every `ClientVisibleArtifactType` used by runtime.

## Open questions

- Which external auth provider and subject format should be used?
- Are portal users individuals, organization contacts, or both?
- How should multi-contact matters be represented?
- How should representative/delegate access work?
- Should grants be per-user, per-membership, per-role, team-scoped, or artifact-scoped?
- Should matter visibility be a direct grant or an artifact grant?
- What external-safe ID strategy is acceptable?
- What upload storage and virus scanning model is approved?
- What message model, if any, is in V1?
- What notification/email model is allowed?
- What retention/legal hold model is required?
- What internal admin UI is needed for publishing, approval, revocation, and audit?
- What production migration strategy can be used once production apply is no longer NO-GO?

## Recommended next package

`CLIENT-PORTAL-RUNTIME-SKELETON-HARDEN-DESIGN-1`

Before implementation, define how the existing disabled route skeleton should evolve into a safe module boundary while still remaining disabled. That design should cover module boundaries, feature gates, route families, service interfaces, no-Prisma-while-disabled tests, and public metadata posture without enabling runtime behavior or schema.

Alternative if product/UI planning should continue first:

`CLIENT-PORTAL-FRONTEND-SHELL-DESIGN-1`

Use the runtime skeleton hardening design first if the team wants to reduce backend exposure risk before any frontend shell planning.

## Final decision statement

This design does not implement schema. This design does not authorize CP-SCHEMA-1. This design does not authorize production apply. This design does not enable Client Portal. External visibility remains unauthorized. The runtime skeleton remains disabled. No schema migration is authorized.

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

`client_portal_schema_readiness_designed_no_db_change_no_runtime_change`
