# Client Portal CP-SCHEMA-1 Relation and Index Spec Draft

## Purpose

This is a **documentation-only** relation / index / cascade specification draft
for the future CP-SCHEMA-1 `ClientPortal*` models. It makes:

- relation/index/cascade draft only;
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
- The field spec and enum/ref decisions exist **for planning only**.

## Relation principles

- **an internal FK does not equal portal visibility**;
- explicit **grant / share / publication** controls visibility;
- **a matter grant does not imply a document share**;
- an internal `User` relation is **actor metadata, not portal access**;
- an internal `Client` relation is **linkage metadata, not authorization**;
- **cascade deletes should be avoided or restricted**;
- revocation should be **explicit and auditable**;
- relations should support **non-enumeration**;
- **no `workspaceText` relation or exposure**.

## Candidate relation map

| Model | Required relations | Optional relations | Internal-only? | Notes |
| --- | --- | --- | --- | --- |
| `ClientPortalUser` | — | `linkedClientId` → `Client` | mostly internal; `portalUserRef` external-safe | principal; not internal `User`. |
| `ClientPortalMatterGrant` | `portalUserId` → `ClientPortalUser`, `caseId` → `Case` | `grantedByUserId` → `User` | yes (internal handle) | unlocks matter access. |
| `ClientPortalMatterPublication` | `caseId` → `Case` | `publishedByUserId` → `User` | yes | client-facing status source. |
| `ClientPortalDocumentShare` | `documentId` → `Document`, `caseId` → `Case` | `portalUserId` → `ClientPortalUser`, `grantId` → `ClientPortalMatterGrant`, `sharedByUserId` → `User` | share row internal; `documentShareRef` external-safe | required for document access. |
| `ClientPortalUploadRequest` | `caseId` → `Case` | `portalUserId` → `ClientPortalUser`, `grantId` → `ClientPortalMatterGrant`, `requestedByUserId` → `User` | request row internal; `uploadRequestRef` external-safe | authorizes upload. |
| `ClientPortalUploadedFile` | `uploadRequestId` → `ClientPortalUploadRequest`, `caseId` → `Case`, `uploadedByPortalUserId` → `ClientPortalUser` | `reviewedByUserId` → `User` | yes; `storageRef` internal-only | not an internal `Document`. |
| `ClientPortalTask` | `caseId` → `Case` | `portalUserId` → `ClientPortalUser`, `grantId` → `ClientPortalMatterGrant`, `relatedDocumentShareId` → `ClientPortalDocumentShare`, `createdByUserId` → `User` | task row internal; `taskRef` external-safe | not an internal `Task`. |
| `ClientPortalAuditEvent` | — | `portalUserId` → `ClientPortalUser`, `caseId` → `Case`, `documentId` → `Document` | yes (content-free) | audit only. |

## ClientPortalUser relations

- optional relation to internal `Client` via `linkedClientId`;
- **no automatic relation to internal `User`**;
- `externalAuthSubject` unique;
- portal user `status` controls activity.

Index/constraint candidates: unique `portalUserRef`; unique `externalAuthSubject`;
index `email`; index `status`.

Cascade: **do not cascade-delete portal activity on `Client` deletion** without
legal review; **prefer suspend/revoke over deletion**.

## ClientPortalMatterGrant relations

Relations: required `portalUserId` → `ClientPortalUser`; required `caseId` → `Case`;
optional `grantedByUserId` → internal `User`.

Indexes: unique-or-filtered-active candidate on `(portalUserId, caseId, status)`;
index `(caseId, status)`; index `expiresAt`; unique `grantRef`.

Cascade: no cascade from `Case`/`User` deletion without review; revocation over
deletion.

Security rule: **only an active, unexpired grant can unlock matter-level portal
access.**

## ClientPortalMatterPublication relations

Relations: required `caseId` → `Case`; optional `publishedByUserId` → internal `User`.

Indexes: unique-active-publication-per-case candidate; index `(caseId, status)`;
index `lastClientVisibleUpdateAt`; unique `publicationRef`.

Cascade: **do not auto-publish from `Case` updates**; deletion/archival must
preserve auditability.

Security rule: publication controls the client-facing matter status/summary, **not
authorization alone**.

## ClientPortalDocumentShare relations

Relations: required `documentId` → `Document`; required `caseId` → `Case`; optional
`portalUserId` → `ClientPortalUser`; optional `grantId` → `ClientPortalMatterGrant`;
optional `sharedByUserId` → internal `User`.

Indexes: unique `documentShareRef`; index `(documentId, status)`;
index `(caseId, status)`; index `(portalUserId, status)`; index `(grantId, status)`;
index `expiresAt`.

Cascade: **no automatic document exposure from a `Case` grant**; no cascade delete
without retention/legal review.

Security rule: **document detail requires an active explicit share.**

## ClientPortalUploadRequest relations

Relations: required `caseId` → `Case`; optional `portalUserId` → `ClientPortalUser`;
optional `grantId` → `ClientPortalMatterGrant`; optional `requestedByUserId` →
internal `User`.

Indexes: unique `uploadRequestRef`; index `(caseId, status)`;
index `(portalUserId, status)`; index `(grantId, status)`; index `dueDate`;
index `expiresAt` if used.

Cascade: request revocation over deletion; no file-deletion cascade without a
storage policy.

Security rule: **upload allowed only through an active request.**

## ClientPortalUploadedFile relations

Relations: required `uploadRequestId` → `ClientPortalUploadRequest`; required
`caseId` → `Case`; required `uploadedByPortalUserId` → `ClientPortalUser`; optional
`reviewedByUserId` → internal `User`; **no automatic `Document` relation in V1**
unless separately approved.

Indexes: unique `uploadedFileRef`; index `(uploadRequestId, status)`;
index `(caseId, status)`; index `(uploadedByPortalUserId, uploadedAt)`;
index `reviewedAt`.

Cascade: **no automatic storage deletion** without a storage retention policy;
**no automatic internal `Document` creation**.

Security rule: **uploaded file metadata is not shared document content.**

## ClientPortalTask relations

Relations: required `caseId` → `Case`; optional `portalUserId` → `ClientPortalUser`;
optional `grantId` → `ClientPortalMatterGrant`; optional `relatedDocumentShareId` →
`ClientPortalDocumentShare`; optional `createdByUserId` → internal `User`.

Indexes: unique `taskRef`; index `(portalUserId, caseId, status)`;
index `(grantId, status)`; index `dueDate`; index `relatedDocumentShareId`.

Cascade: task completion **must not mutate an internal `Task`** without a bridge;
revoke/expire over delete.

Security rule: **a portal task is separate from an internal `Task` by default.**

## ClientPortalAuditEvent relations

Relations: optional `portalUserId` → `ClientPortalUser`; optional `caseId` → `Case`;
optional `documentId` → `Document`.

Indexes: unique `auditRef` **only if needed**; index `(portalUserId, occurredAt)`;
index `(caseId, occurredAt)`; index `(action, occurredAt)`;
index `(result, occurredAt)`.

Cascade: **avoid cascade delete**; audit retention / legal hold controls deletion.

Security rule: **audit is content-free and internal-only.**

## Deferred message/notification relations

Conceptual only, **deferred**:

- `ClientPortalMessageThread`;
- `ClientPortalMessage`;
- `ClientPortalNotificationPreference`.

State: deferred pending **privilege, retention, notification, and content-logging**
design.

## Cross-model security invariants

- an internal `Client` link **is not access**;
- an internal `User` actor **is not a client portal principal**;
- a `Case` relation **is not visibility**;
- a `Document` relation **is not a share**;
- a matter grant **is not a document share**;
- an upload request **is not a document share**;
- an uploaded file **is not an internal `Document`**;
- a portal task **is not an internal `Task`**;
- audit **is not content**.

## Index risk and migration caution

- **avoid over-indexing** in the first migration;
- filtered/partial indexes may need a DB-specific decision (e.g. Postgres partial
  index for active-grant uniqueness);
- composite indexes should follow the **query design**, not be added speculatively;
- unique constraints with nullable fields need careful DB semantics;
- enum/index changes may be **hard to roll back**;
- **clone rehearsal required** before any real migration.

## Relation-level open questions

- per-user vs grant-level document share;
- per-user vs grant-level upload request;
- per-user vs grant-level task;
- whether active-grant uniqueness should be enforced by a partial index;
- whether publication is one active per case;
- whether an uploaded file later links to a `Document`;
- whether `auditRef` is needed;
- delete-vs-revoke retention rules;
- nullable FK behavior;
- `onDelete` strategy.

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

`CLIENT-PORTAL-CP-SCHEMA-1-PRISMA-DRAFT-NONAPPLIED-1` — **only if explicitly
approved**, and only as a **non-applied draft file or comment/spec**, not a
migration and not a `schema.prisma` edit.

Safer alternative: `CLIENT-PORTAL-CP-SCHEMA-1-READINESS-CHECKPOINT-2` (docs-only).

**Effective next default: `CLIENT-PORTAL-CP-SCHEMA-1-READINESS-CHECKPOINT-2`.**
Reason: before any Prisma draft, consolidate naming / fields / enums / relations
into a readiness checkpoint.

## Final decision statement

- The relation/index spec is **drafted only**.
- **No schema implementation exists.**
- **No migration exists.**
- **No DB-backed portal exists.**
- Client Portal remains **inert**.
- CP-SCHEMA-1 remains **blocked**.
- Production apply remains **NO-GO**.
