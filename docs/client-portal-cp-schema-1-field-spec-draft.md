# Client Portal CP-SCHEMA-1 Field Spec Draft

## Purpose

This is a **documentation-only**, field-level draft for the future CP-SCHEMA-1
models (using the frozen `ClientPortal*` naming). It makes:

- field-level draft only;
- no schema change;
- no migration;
- no DB connection;
- no migration command;
- no production apply;
- no CP-SCHEMA-1 authorization;
- no Client Portal enablement;
- no runtime/API/frontend change;
- no external visibility authorization.

It authorizes nothing and creates no code.

## Current no-go posture

- CP-SCHEMA-1 remains **blocked**.
- Production apply remains **NO-GO**.
- Client Portal remains **inert**.
- **No DB-backed portal exists.**
- The naming direction is frozen **for planning only**.

## Field specification principles

- external-safe `*Ref` values should be **distinct from internal DB IDs**;
- internal FKs (`caseId`, `documentId`, `*ByUserId`) are **not client-facing**;
- status / revocation / expiry fields must be **explicit**;
- audit must be **content-free**;
- **no raw document text**;
- **no `documents.workspaceText`**;
- **no storage / SharePoint paths in DTOs**;
- **no automatic visibility** from internal relations;
- **additive-first** migration posture;
- **nullable-first** where appropriate until semantics are proven.

## Candidate enums

Conceptual only; values unresolved until a separate enum decision.

- **`ClientPortalUserStatus`** — likely `INVITED`, `ACTIVE`, `SUSPENDED`, `REVOKED`.
  Unresolved: is `INVITED` needed pre-first-login?
- **`ClientPortalGrantStatus`** — likely `ACTIVE`, `REVOKED`, `EXPIRED`.
  Unresolved: is `PENDING` needed for approval workflow?
- **`ClientPortalPublicationStatus`** — likely `DRAFT`, `PUBLISHED`, `REVOKED`.
  Unresolved: is a `SCHEDULED` state wanted?
- **`ClientPortalDocumentShareStatus`** — likely `ACTIVE`, `REVOKED`, `EXPIRED`.
  Unresolved: separate `PENDING_APPROVAL`?
- **`ClientPortalUploadRequestStatus`** — likely `OPEN`, `COMPLETED`, `REVOKED`,
  `EXPIRED`. Unresolved: `PARTIALLY_FULFILLED`?
- **`ClientPortalUploadedFileStatus`** — likely `RECEIVED`, `SCANNING`, `ACCEPTED`,
  `REJECTED`, `EXPIRED`. Unresolved: virus-scan states depend on storage design.
- **`ClientPortalTaskStatus`** — likely `OPEN`, `COMPLETED`, `REVOKED`, `EXPIRED`.
  Unresolved: `IN_PROGRESS`?
- **`ClientPortalAuditAction`** — likely `LOGIN`, `VIEW_MATTER`, `VIEW_DOCUMENT`,
  `COMPLETE_TASK`, `SUBMIT_UPLOAD`, `ACCESS_DENIED`. Unresolved: final taxonomy.
- **`ClientPortalAuditResult`** — likely `ALLOWED`, `DENIED`, `ERROR`.
  Unresolved: is `NOT_READY` distinct from `DENIED`?

## ClientPortalUser field draft

| Field | Required? | Kind | Client-facing? | Notes |
| --- | --- | --- | --- | --- |
| `id` | required | internal PK | no | internal id. |
| `portalUserRef` | required | external-safe ref | yes | stable, non-enumerating. |
| `externalAuthSubject` | required | external claim | no | **unique**. |
| `email` | required | value | limited | identity, not access. |
| `displayName` | required | value | yes | |
| `status` | required | enum | no | `ClientPortalUserStatus`. |
| `linkedClientId` | optional | internal FK → `Client` | no | ownership anchor, **not a grant**. |
| `createdAt` | required | timestamp | no | |
| `updatedAt` | required | timestamp | no | |
| `lastLoginAt` | optional | timestamp | no | |
| `suspendedAt` | optional | timestamp | no | |
| `revokedAt` | optional | timestamp | no | |

Discussion: **unique `externalAuthSubject`**; **email is not enough for access**;
`linkedClientId` is optional and **not a grant**; `portalUserRef` is external-safe.

## ClientPortalMatterGrant field draft

| Field | Required? | Kind | Client-facing? | Notes |
| --- | --- | --- | --- | --- |
| `id` | required | internal PK | no | |
| `grantRef` | required | external-safe ref | no (internal handle) | |
| `portalUserId` | required | internal FK → `ClientPortalUser` | no | |
| `caseId` | required | internal FK → `Case` | no | no cascade-delete of `Case`. |
| `grantType` | required | enum/value | no | |
| `status` | required | enum | no | `ClientPortalGrantStatus`. |
| `visibilityScope` | optional | enum/value | no | |
| `grantedByUserId` | required | internal FK → `User` | no | |
| `grantedAt` | required | timestamp | no | |
| `revokedAt` | optional | timestamp | no | immediate revocation. |
| `expiresAt` | optional | timestamp | no | |
| `reasonCode` | optional | value | no | |
| `createdAt` | required | timestamp | no | |
| `updatedAt` | required | timestamp | no | |

Discussion: active-grant lookup by `(portalUserId, caseId, status)`; revocation and
expiry are first-class; **matter access does not imply document access**.

## ClientPortalMatterPublication field draft

| Field | Required? | Kind | Client-facing? | Notes |
| --- | --- | --- | --- | --- |
| `id` | required | internal PK | no | |
| `publicationRef` | required | external-safe ref | no | |
| `caseId` | required | internal FK → `Case` | no | |
| `clientFacingDisplayName` | required | value | yes | |
| `clientFacingStatus` | required | value | yes | sanitized, not internal status. |
| `clientFacingSummary` | optional | value | yes | manually safe. |
| `nextClientAction` | optional | value | yes | |
| `nextClientDeadline` | optional | timestamp | yes | |
| `lastClientVisibleUpdateAt` | optional | timestamp | yes | |
| `responsibleLawyerDisplayName` | optional | value | yes | display name only. |
| `publishedByUserId` | required | internal FK → `User` | no | |
| `publishedAt` | required | timestamp | no | |
| `status` | required | enum | no | `ClientPortalPublicationStatus`. |
| `createdAt` | required | timestamp | no | |
| `updatedAt` | required | timestamp | no | |

Discussion: publication controls what the client sees; **internal case status is not
automatically visible**; the summary must be **manually made safe**.

## ClientPortalDocumentShare field draft

| Field | Required? | Kind | Client-facing? | Notes |
| --- | --- | --- | --- | --- |
| `id` | required | internal PK | no | |
| `documentShareRef` | required | external-safe ref | yes | |
| `documentId` | required | internal FK → `Document` | no | no cascade-delete. |
| `caseId` | required | internal FK → `Case` | no | |
| `portalUserId` | optional | internal FK → `ClientPortalUser` | no | per-user or grant-group (open Q). |
| `grantId` | optional | internal FK → `ClientPortalMatterGrant` | no | |
| `displayName` | required | value | yes | |
| `safeDescription` | optional | value | yes | |
| `documentType` | optional | value | yes | |
| `sharedByUserId` | required | internal FK → `User` | no | |
| `sharedAt` | required | timestamp | no | |
| `revokedAt` | optional | timestamp | no | |
| `expiresAt` | optional | timestamp | no | |
| `downloadAllowed` | required | boolean | yes | flag only; no download impl. |
| `versionLabel` | optional | value | yes | |
| `status` | required | enum | no | `ClientPortalDocumentShareStatus`. |
| `createdAt` | required | timestamp | no | |
| `updatedAt` | required | timestamp | no | |

Discussion: **an explicit document share is required** (matter access alone is not
enough); **no `workspaceText`, no raw content, no storage path**; `downloadAllowed`
is a flag and **does not implement download yet**.

## ClientPortalUploadRequest field draft

| Field | Required? | Kind | Client-facing? | Notes |
| --- | --- | --- | --- | --- |
| `id` | required | internal PK | no | |
| `uploadRequestRef` | required | external-safe ref | yes | |
| `caseId` | required | internal FK → `Case` | no | |
| `portalUserId` | optional | internal FK → `ClientPortalUser` | no | per-user or grant-group (open Q). |
| `grantId` | optional | internal FK → `ClientPortalMatterGrant` | no | |
| `title` | required | value | yes | |
| `description` | optional | value | yes | |
| `dueDate` | optional | timestamp | yes | |
| `allowedFileTypes` | optional | value/list | yes | storage shape unresolved. |
| `maxFileSize` | optional | number | yes | |
| `status` | required | enum | no | `ClientPortalUploadRequestStatus`. |
| `requestedByUserId` | required | internal FK → `User` | no | |
| `requestedAt` | required | timestamp | no | |
| `completedAt` | optional | timestamp | no | |
| `revokedAt` | optional | timestamp | no | |
| `retentionPolicyKey` | optional | value | no | |
| `createdAt` | required | timestamp | no | |
| `updatedAt` | required | timestamp | no | |

Discussion: controls whether an upload is allowed; **no live file input / upload
implementation**; `allowedFileTypes` storage shape (array vs delimited) is unresolved.

## ClientPortalUploadedFile field draft

| Field | Required? | Kind | Client-facing? | Notes |
| --- | --- | --- | --- | --- |
| `id` | required | internal PK | no | |
| `uploadedFileRef` | required | external-safe ref | yes | |
| `uploadRequestId` | required | internal FK → `ClientPortalUploadRequest` | no | |
| `caseId` | required | internal FK → `Case` | no | |
| `originalFileName` | optional | value | limited | display only if safe. |
| `safeDisplayName` | required | value | yes | |
| `mimeType` | optional | value | yes | |
| `size` | optional | number | yes | |
| `storageRef` | required | internal handle | **no** | never client-facing. |
| `status` | required | enum | no | `ClientPortalUploadedFileStatus`. |
| `uploadedByPortalUserId` | required | internal FK → `ClientPortalUser` | no | |
| `uploadedAt` | required | timestamp | no | |
| `reviewedByUserId` | optional | internal FK → `User` | no | |
| `reviewedAt` | optional | timestamp | no | |
| `rejectedAt` | optional | timestamp | no | |
| `retentionPolicyKey` | optional | value | no | |
| `createdAt` | required | timestamp | no | |
| `updatedAt` | required | timestamp | no | |

Discussion: **`storageRef` is internal only**; virus scanning is unresolved; an
uploaded file is **not automatically an internal `Document`**; **no SharePoint path
in any DTO**.

## ClientPortalTask field draft

| Field | Required? | Kind | Client-facing? | Notes |
| --- | --- | --- | --- | --- |
| `id` | required | internal PK | no | |
| `taskRef` | required | external-safe ref | yes | |
| `caseId` | required | internal FK → `Case` | no | |
| `portalUserId` | optional | internal FK → `ClientPortalUser` | no | per-user or grant-group (open Q). |
| `grantId` | optional | internal FK → `ClientPortalMatterGrant` | no | |
| `title` | required | value | yes | |
| `description` | optional | value | yes | |
| `dueDate` | optional | timestamp | yes | |
| `status` | required | enum | no | `ClientPortalTaskStatus`. |
| `actionType` | optional | enum/value | yes | values unresolved. |
| `relatedDocumentShareId` | optional | internal FK → `ClientPortalDocumentShare` | no | |
| `completedAt` | optional | timestamp | no | |
| `revokedAt` | optional | timestamp | no | |
| `createdByUserId` | required | internal FK → `User` | no | |
| `createdAt` | required | timestamp | no | |
| `updatedAt` | required | timestamp | no | |

Discussion: **not an internal `Task` by default**; completion **does not mutate
internal workflow** without a separately designed bridge; `actionType` values are
unresolved.

## ClientPortalAuditEvent field draft

| Field | Required? | Kind | Client-facing? | Notes |
| --- | --- | --- | --- | --- |
| `id` | required | internal PK | no | |
| `auditRef` | optional | external-safe ref | no | |
| `portalUserId` | required | internal FK → `ClientPortalUser` | no | |
| `caseId` | optional | internal FK → `Case` | no | |
| `documentId` | optional | internal FK → `Document` | no | id only, never content. |
| `action` | required | enum | no | `ClientPortalAuditAction`. |
| `result` | required | enum | no | `ClientPortalAuditResult`. |
| `reasonCode` | optional | value | no | |
| `occurredAt` | required | timestamp | no | |
| `sessionRef` | optional | value | no | |
| `requestRef` | optional | value | no | |
| `ipHash` | optional | hash | no | hashed, not raw IP. |
| `userAgentHash` | optional | hash | no | hashed. |
| `createdAt` | required | timestamp | no | |

Discussion: **content-free only** — no document content/snippet, no AI prompt/output,
no `workspaceText`. IP/user-agent are **hashed** (policy unresolved).

## Deferred message/notification fields

Conceptual only, **deferred**:

- `ClientPortalMessageThread` — thread ref, `caseId`, participants, visibility status.
- `ClientPortalMessage` — thread FK, author ref, client-visible body, sent-at.
- `ClientPortalNotificationPreference` — portal-user FK, channel, opt-in flags.

State: deferred until **privilege, retention, notification, and content-logging**
rules are designed. No deferred model is part of CP-SCHEMA-1 V1.

## Index/constraint draft

- unique `portalUserRef`;
- unique `externalAuthSubject`;
- active-grant lookup `(portalUserId, caseId, status)`;
- document-share lookup `(documentId, caseId, portalUserId, status)`;
- upload-request lookup `(portalUserId, caseId, status)`;
- uploaded-file lookup `(uploadRequestId, status)`;
- task lookup `(portalUserId, caseId, status)`;
- audit-event lookup `(portalUserId, occurredAt, action)`;
- expiry/revocation indexes as needed.

State: exact indexes are **unresolved pending query design**; avoid over-indexing in
the first migration.

## Field-level forbidden list

Fields that must **not** be introduced:

- `workspaceText`;
- raw document content;
- raw extracted text;
- legal analysis content;
- AI prompt/output;
- internal notes;
- internal review comments;
- workload content;
- collaborator notes;
- storage path exposed to the client;
- SharePoint path exposed to the client;
- broad JSON payloads without a retention policy and validators.

## Open questions

- exact enum values;
- external-safe ref generation strategy;
- nullable vs required for `grantId` / `portalUserId`;
- upload `allowedFileTypes` storage shape;
- audit IP / user-agent hashing policy;
- retention-policy-key vocabulary;
- cascade / delete behavior;
- whether a document share is per-user or grant-group;
- whether tasks are per-user or grant-group;
- message-model deferral;
- clone-rehearsal timing.

## Non-authorizations

- no `schema.prisma` edit;
- no migration;
- no DB query;
- no migration command;
- no production apply;
- no runtime service;
- no API enablement;
- no frontend integration;
- no external visibility;
- no CP-SCHEMA-1.

## Recommended next package

`CLIENT-PORTAL-CP-SCHEMA-1-ENUM-AND-REF-DECISION-1` — a docs-only decision on enum
values and the external-safe ref generation strategy; **no schema edit; no migration**.

Alternative: `CLIENT-PORTAL-AUTHZ-STUBS-CLOSEOUT-1` (docs-only).

**Effective next default: `CLIENT-PORTAL-CP-SCHEMA-1-ENUM-AND-REF-DECISION-1`.** Reason:
enums and external-safe refs should be frozen before any migration draft.

## Final decision statement

- The field spec is **drafted only**.
- **No schema implementation exists.**
- **No migration exists.**
- **No DB-backed portal exists.**
- Client Portal remains **inert**.
- CP-SCHEMA-1 remains **blocked**.
- Production apply remains **NO-GO**.

## Follow-up — CLIENT-PORTAL-CP-SCHEMA-1-ENUM-AND-REF-DECISION-1

- `CLIENT-PORTAL-CP-SCHEMA-1-ENUM-AND-REF-DECISION-1` completed the enum/ref decision
  (`docs/client-portal-cp-schema-1-enum-and-ref-decision.md`): recommended enum values
  per status enum, the external-safe `*Ref` strategy (opaque, non-sequential,
  prefixed, unique/indexed; not internal DB IDs), which refs are client-visible vs
  internal-only, and a client-facing mapping rule. **No schema/migration is authorized.**
  CP-SCHEMA-1 remains blocked; production apply remains NO-GO.

## Follow-up — CLIENT-PORTAL-CP-SCHEMA-1-RELATION-AND-INDEX-SPEC-DRAFT-1

- `CLIENT-PORTAL-CP-SCHEMA-1-RELATION-AND-INDEX-SPEC-DRAFT-1` **refined these fields with
  relation/index/cascade planning**
  (`docs/client-portal-cp-schema-1-relation-and-index-spec-draft.md`): per-model
  required/optional relations, index/uniqueness candidates, cascade cautions, and
  cross-model security invariants. No schema/migration authorized; CP-SCHEMA-1 remains
  blocked; production apply remains NO-GO.
