# Client Portal Schema Candidate Design 2

## Purpose

This is a **documentation-only** schema candidate design that refines
`docs/client-portal-schema-readiness-design.md` into a more concrete candidate
model. It makes:

- no schema change;
- no migration;
- no DB connection;
- no production apply;
- no CP-SCHEMA-1 authorization;
- no Client Portal enablement;
- no external visibility authorization;
- no runtime/API implementation;
- no frontend API integration;
- no Document/AI enablement;
- no AI/provider call;
- no SharePoint/export/file-processing call.

It exists so a reviewer can reason about a real V1 portal schema and, later,
inform a **still-blocked** CP-SCHEMA-1 decision. It authorizes nothing.

## Current status

- Client Portal remains **mock frontend + disabled backend skeleton only**.
- Backend DTOs (`Backend/src/modules/client-portal/types.ts`) and mappers
  (`mappers.ts`) exist but are **disabled-only** and not wired into any route.
- No DB-backed portal exists.
- No grant schema exists (as an active, runtime-backed model).
- No `PortalUser` runtime schema exists.
- No document share schema exists.
- No upload request schema exists.
- `Backend/prisma/schema.prisma` already contains an inert CP-SCHEMA-1 candidate
  block (`ClientPortalUser`, `ClientPortalMembership`, `ClientVisibleArtifact`,
  `ClientPortalGrant`, `ClientSubmission`, `ClientSubmissionAttachment`,
  `ClientPortalAuditEvent`), inspected here for alignment only — **not edited**.
- CP-SCHEMA-1 remains **blocked**.
- Production apply remains **NO-GO**.

## Candidate schema principles

- **Explicit grants, not inferred access.** No portal visibility is derived from
  internal assignment, `CaseCollaborator`, `UserRole`, or client relation.
- **Internal data private by default.** Nothing is client-facing unless a
  sanitized publication or explicit share exists.
- **Publication model for client-facing status.** Internal `Case.status`,
  deadlines, and timeline are never automatically visible.
- **Explicit document sharing.** Matter access alone never exposes documents.
- **Explicit upload requests.** Uploads exist only against an active request.
- **Content-free audit.** Audit records carry metadata, never content.
- **Retention / legal-hold fields** on any durable portal content and uploads.
- **Revocation is first-class** (a `revokedAt`/`status` on every access record),
  and revocation takes effect immediately.
- **No raw text exposure**, ever.
- **No `documents.workspaceText`** in any portal model or payload.
- **No internal DTO reuse** — portal DTOs map from portal-owned/publication
  sources, not from internal `Case`/`Document`/`Task` DTOs.

## Candidate model overview

| Candidate model | Purpose | Related existing model(s) | Status | Privacy notes |
| --- | --- | --- | --- | --- |
| `PortalUser` | External authenticated principal. | `Client` (optional link) | V1 candidate | Separate from internal `User`; email/claims ≠ access. |
| `PortalMatterAccessGrant` | Explicit matter access. | `Case`, `PortalUser`, `User` (grantedBy) | V1 candidate | Absence = deny; revocation immediate. |
| `PortalMatterPublication` | Sanitized client-facing matter status. | `Case`, `User` (publishedBy) | V1 candidate | Internal status never auto-published. |
| `PortalDocumentShare` | Explicit document visibility. | `Document`, `Case`, `PortalUser`, `User` (sharedBy) | V1 candidate | No raw text / storage / SharePoint paths. |
| `PortalUploadRequest` | Client-facing request to upload. | `Case`, `PortalUser`, `User` (requestedBy) | V1 candidate | Upload only with active request. |
| `PortalUploadedFile` | Metadata for a client-submitted file. | `PortalUploadRequest`, `Case`, `PortalUser` | V1 candidate | `storageRef` never client-facing; scan/review first. |
| `PortalClientTask` | Client-facing action/request. | `Case`, `PortalUser`, `PortalDocumentShare` (optional) | V1 candidate | Not internal `Task`; no direct workflow mutation. |
| `PortalAuditEvent` | Content-free portal access audit. | `PortalUser`, `Case?`, `Document?` | V1 candidate | No content fields at all. |
| `PortalMessageThread` | Client-visible thread. | `Case`, `PortalUser` | **Deferred** | Requires comms/retention/privilege review. |
| `PortalMessage` | Client-visible message. | `PortalMessageThread` | **Deferred** | Internal `Communication` stays hidden. |
| `PortalNotificationPreference` | Portal email/notification opt-in. | `PortalUser` | **Deferred** | Requires notification model approval. |

## PortalUser candidate

Conceptual fields:

- `id`
- `externalAuthSubject`
- `email`
- `displayName`
- `status`
- optional `linkedClientId`
- `createdAt`
- `updatedAt`
- `lastLoginAt`
- `suspendedAt`
- `revokedAt`

Discussion:

- **Email match is not matter access.** A verified email only identifies a
  principal; it grants nothing without a `PortalMatterAccessGrant`.
- **Auth provider claims are not enough.** Claims authenticate; grants authorize.
- **Separate from the internal `User` role model.** Portal principals must never
  reuse internal `User` rows or `UserRole.CLIENT`; conflating them risks
  privilege bleed. `linkedClientId` (if used) is an ownership anchor, not access.

Candidate alignment: `ClientPortalUser` substantially covers this. Open review:
external-auth vs `passwordHash` posture for V1.

## PortalMatterAccessGrant candidate

Conceptual fields:

- `id`
- `portalUserId`
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

Discussion:

- Matter list/detail **requires an active grant**; there is no other path.
- **Revocation is immediate**: a revoked/expired grant disappears from every
  query the same request.
- **No access by `caseId`/`clientId` guessing**, and internal assignment,
  collaborator membership, or client relation never creates a grant.
- Likely indexes on `(portalUserId, caseId, status)` and `(caseId, status)`.

Candidate alignment: `ClientPortalGrant` currently models artifact grants; a
direct matter-grant shape (or a proven artifact-per-matter representation) must
support efficient grant-scoped matter-list queries.

## PortalMatterPublication candidate

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

Discussion:

- **Internal case status is not automatically visible.** Only these sanitized,
  approved fields are client-facing.
- **Absence of publication returns a safe omission or generic state** — never a
  leaked internal status.
- Publication should be auditable and reversible.

Candidate alignment: `ClientVisibleArtifact` can carry status/summary artifacts,
but its `payload Json` needs versioned validators before any runtime use.

## PortalDocumentShare candidate

Conceptual fields:

- `id`
- `documentId`
- `caseId`
- `portalUserId` **or** `grantGroupId`
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
- `createdAt`
- `updatedAt`

Discussion:

- **Matter access alone does not expose documents.**
- **A document must be explicitly shared** through this record.
- **No raw text; no storage paths; no SharePoint paths; no `workspaceText`.**
  Only sanitized display metadata is present.
- Likely indexes on `(documentId, status)`, `(caseId, status)`,
  `(portalUserId, status)`.

Candidate alignment: `ClientVisibleArtifact` (`artifactType = DOCUMENT_VERSION`)
plus `ClientPortalGrant`; scoped file access/download remains unresolved.

## PortalUploadRequest candidate

Conceptual fields:

- `id`
- `caseId`
- `portalUserId` **or** `grantGroupId`
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
- `createdAt`
- `updatedAt`

Discussion:

- **Upload is allowed only with an active request.**
- **No file input / live upload is implemented yet** (frontend has no file input;
  backend has no upload route).
- **No automatic AI/extraction/SharePoint processing** is implied or authorized.

Candidate alignment: `ClientVisibleArtifact` (request) + `ClientSubmission`
(response); request fields must be validated, not hidden in unconstrained JSON.

## PortalUploadedFile candidate

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
- `createdAt`
- `updatedAt`

Discussion:

- **`storageRef` is never client-facing directly** — it is an internal handle.
- **Virus scanning and a storage design are required before implementation.**
- **Intake/review is required before any conversion to an internal `Document`.**

Candidate alignment: `ClientSubmissionAttachment` covers much of this (scan
status, accepted-document reference); storage, retention, and download/preview
policy remain future work.

## PortalClientTask candidate

Conceptual fields:

- `id`
- `caseId`
- `portalUserId` **or** `grantGroupId`
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

Discussion:

- **Not the same as an internal `Task` by default.**
- **Completion must not directly mutate internal legal workflow** without a
  separately designed and approved bridge.

Candidate alignment: `ClientVisibleArtifact` (`TODO`/`REQUEST`) + `ClientSubmission`;
a dedicated portal task table may be clearer if task semantics grow.

## PortalAuditEvent candidate

Conceptual fields:

- `id`
- `portalUserId`
- optional `caseId`
- optional `documentId`
- `action`
- `result`
- `reasonCode`
- `timestamp`
- request/session metadata (IP, user agent) only if a review allows it
- **no content fields**

Forbidden:

- raw text;
- snippets;
- document content;
- message content;
- AI prompt/output;
- `workspaceText`.

Candidate alignment: `ClientPortalAuditEvent` is directionally aligned; its
`metadata Json?` must be constrained to content-free values before runtime use.

## Deferred message/notification candidates

Discussed only as **deferred** (not V1):

- `PortalMessageThread` — client-visible thread (`caseId`, participants,
  visibility status).
- `PortalMessage` — client-visible message under a thread.
- `PortalNotificationPreference` — portal email/notification opt-in per user.

State:

- **No V1 implementation.**
- Requires separate retention, privilege, logging, and visibility review. Internal
  `Communication` data and raw provider metadata remain hidden.

## Existing model relationship assessment

| Existing model | Portal reference allowed? | Direct exposure? | Notes |
| --- | --- | --- | --- |
| `Client` | Internal FK (ownership anchor) only after design. | No. | Display name only after grant resolution. |
| `Case` | Internal FK (matter anchor). | No. | Client-facing status/summary via `PortalMatterPublication` only. |
| `Document` | Internal FK (share source). | No. | Only via `PortalDocumentShare`; never raw text/paths/`workspaceText`. |
| `Task` | Internal source reference only. | No. | Portal tasks are separate; no default workflow coupling. |
| `Communication` | Deferred source reference only. | No. | Only if messaging is later approved. |
| `User` | Internal actor FK (grantedBy/publishedBy/sharedBy/reviewedBy). | No. | Display name only if deliberately published. |
| `CaseCollaborator` | Internal-only. | No. | **Never** infer portal grants from collaborators. |
| `WorkloadRecord` | Internal-only. | No. | No portal adapter in V1. |

State: an internal FK relationship **does not create portal visibility**;
existing internal fields are **not client-facing by default**.

## Index and constraint considerations

Likely needs (no concrete migration authorized):

- **unique `externalAuthSubject`** on `PortalUser` (one principal per subject).
- **active-grant lookup** by `(portalUserId, caseId, status)`.
- **document-share lookup** by `(documentId, caseId, portalUserId, status)`.
- **upload-request lookup** by `(portalUserId, caseId, status)`.
- **revocation/expiry filtering** — `status`, `revokedAt`, `expiresAt` must be
  cheap to filter on every query path.
- **audit indexes** on `(portalUserId, timestamp)` and `(action, timestamp)`.
- an **external-safe id strategy** (stable alias vs internal id) decided before
  any URL parameter design; avoid sequential/guessable identifiers; never expose
  `storageRef` as an id.

## Retention and deletion considerations

- **Portal user** suspension/revocation semantics and downstream effects.
- **Matter access** revocation hides access without deleting internal data.
- **Document share** revocation without deleting the internal `Document`.
- **Uploaded file** retention, deletion, and virus-scan lifecycle.
- **Audit** retention (content-free) on its own schedule.
- **Legal hold** may delay deletion and must be explicit before durable content.
- **GDPR / data-subject workflows** need future design.
- **Backups** must be considered in any deletion guarantee.

## Migration risk assessment

- **Production schema change risk** — new tables touch the production schema and
  require production-compatible baseline resolution first.
- **FK/cascade risk** — foreign keys must not cascade-delete internal records.
- **Index/constraint risk** — unique constraints (e.g. `externalAuthSubject`)
  and composite indexes must be right the first time to avoid breaking changes.
- **Enum drift risk** — new status/action enums must align with the existing
  candidate enums to avoid divergence.
- **Nullable semantics risk** — ambiguous optional fields create unclear
  visibility rules; each nullable needs a defined meaning.
- **Upload storage / infra coupling risk** — file storage likely lives outside
  Prisma and couples to infra decisions.
- **Rollback risk** — additive tables still need a rehearsed rollback/abandon plan.
- **Clone rehearsal needed** — a fresh production-like clone apply proof is
  required before any real migration.
- **Production apply remains NO-GO.**

## CP-SCHEMA-1 readiness checklist

Future preconditions (**none authorized now**):

- explicit **human approval**;
- a **finalized schema** (fields, enums, indexes, constraints frozen);
- a **migration generated and reviewed**;
- a **clone rehearsal** (production-like clone apply proof);
- a **rollback/abandon plan**;
- **tests** (grant scoping, revocation, forbidden-field, `workspaceText`-absence,
  content-free audit/log, no raw `storageRef`, non-enumeration);
- **seed/synthetic fixtures** only (no real client/case/document data);
- **no `workspaceText` exposure** anywhere;
- **no external visibility before a full authz model** is implemented and tested;
- a **production apply readiness review** (production apply no longer NO-GO).

State: **none of this is authorized now.**

## Non-authorizations

- no `schema.prisma` edit;
- no migration;
- no DB query;
- no runtime service;
- no API;
- no frontend integration;
- no upload/download/message;
- no external visibility;
- no CP-SCHEMA-1;
- no production apply.

## Recommended next package

`CLIENT-PORTAL-BACKEND-DISABLED-SERVICE-STUBS-DESIGN-1`

This should be **docs-only** by default (code only if explicitly approved). It
would design disabled-safe service interfaces that consume the existing DTO
mappers behind the runtime-ready gate without enabling anything.

Alternative:

`CLIENT-PORTAL-MOCK-DEMO-REVIEW-PASS-1` — a frontend demo-quality review pass on
the static/mock route tree.

## Final decision statement

- This design refines a **schema candidate only**.
- It does **not** authorize schema implementation.
- It does **not** authorize migration.
- CP-SCHEMA-1 remains **blocked**.
- Production apply remains **NO-GO**.
- Client Portal remains **mock frontend + disabled backend skeleton only**.

## Follow-up — CLIENT-PORTAL-CP-SCHEMA-1-MIGRATION-PLAN-DRAFT-1

- `CLIENT-PORTAL-CP-SCHEMA-1-MIGRATION-PLAN-DRAFT-1` created
  `docs/client-portal-cp-schema-1-migration-plan-draft.md`, drafting a safe future
  migration approach (candidate scope, sequencing, model-by-model considerations,
  index/constraint plan, privacy/security gates, clone rehearsal, rollback strategy,
  production-apply blockers) built on this candidate model.
- **No schema or migration is authorized.** No `schema.prisma` edit, no migration, no
  DB. CP-SCHEMA-1 remains blocked; production apply remains NO-GO; Client Portal
  remains inert.
