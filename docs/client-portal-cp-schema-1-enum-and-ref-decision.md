# Client Portal CP-SCHEMA-1 Enum and Ref Decision

## Purpose

This is a **documentation-only** decision on CP-SCHEMA-1 enum values and the
external-safe reference strategy for the frozen `ClientPortal*` models. It makes:

- enum/ref decision only;
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
- The field spec draft exists **for planning only**.

## External-safe reference principles

- every client-visible entity should have an external-safe `*Ref`;
- **refs are not internal DB IDs**;
- refs should be **opaque, non-sequential, and non-enumerable**;
- refs should be **unique and indexed** where used for lookup;
- refs should be **safe to place in URLs**;
- refs should **not encode** case/client/document identity;
- refs should **not include** raw internal IDs;
- refs should not be meaningful enough to **leak existence or type** beyond a
  short prefix.

Prefix approach (illustrative only, **not implementation**): a short type prefix +
a random opaque suffix.

- `cpu_...` — portal users;
- `cpmg_...` — matter grants;
- `cpmp_...` — matter publications;
- `cpds_...` — document shares;
- `cpur_...` — upload requests;
- `cpuf_...` — uploaded files;
- `cpt_...` — client portal tasks;
- `cpae_...` — audit events.

State: the exact generator implementation is **unresolved**; **no code
implementation now**.

## Ref fields by model

| Model | Ref field | Client-visible? | Lookup use | Notes |
| --- | --- | --- | --- | --- |
| `ClientPortalUser` | `portalUserRef` | yes | principal resolution | unique, indexed. |
| `ClientPortalMatterGrant` | `grantRef` | no (internal handle) | admin/audit lookup | client sees matters, not grants. |
| `ClientPortalMatterPublication` | `publicationRef` | no (internal handle) | publish/revoke lookup | client sees matter, not publication id. |
| `ClientPortalDocumentShare` | `documentShareRef` | yes | document URL param | unique, indexed. |
| `ClientPortalUploadRequest` | `uploadRequestRef` | yes | upload-request URL param | unique, indexed. |
| `ClientPortalUploadedFile` | `uploadedFileRef` | yes | uploaded-file reference | unique, indexed. |
| `ClientPortalTask` | `taskRef` | yes | task URL param | unique, indexed. |
| `ClientPortalAuditEvent` | `auditRef` | no | internal correlation only | may be internal-only. |

- Some refs may be **internal-only even if external-safe** — especially
  `auditRef`, `grantRef`, and `publicationRef`.
- **Client URLs should generally use** `matterRef` / `documentShareRef` /
  `taskRef` / `uploadRequestRef`, **not internal IDs** and not grant/publication
  refs.

## Enum decision overview

- enums should use **narrow, explicit** values;
- **avoid overloading one status enum** across all models;
- avoid values implying **live behavior** before implementation;
- avoid values that **expose internal workflow states**;
- prefer client-facing status **mapping through the publication layer**, not raw
  enum rendering.

## ClientPortalUserStatus

Recommended values: `ACTIVE`, `SUSPENDED`, `REVOKED`.

Discussion: `INVITED` may be added later if a pre-first-login invite flow is
built; **avoid reusing internal user statuses**.

## ClientPortalGrantStatus

Recommended values: `ACTIVE`, `REVOKED`, `EXPIRED`.

Discussion: `PENDING` may be needed for future invite/approval; an **active grant
requires status = `ACTIVE` plus an expiry check**.

## ClientPortalMatterPublicationStatus

Recommended values: `DRAFT`, `PUBLISHED`, `REVOKED`, `ARCHIVED`.

Discussion: **publication status is not internal case status**; the client-facing
matter status should be a safe string or a separate controlled value defined later.

## ClientPortalDocumentShareStatus

Recommended values: `ACTIVE`, `REVOKED`, `EXPIRED`, `ARCHIVED`.

Discussion: a document share is **required even if a matter grant exists**;
`downloadAllowed` is a **separate** boolean from status.

## ClientPortalUploadRequestStatus

Recommended values: `OPEN`, `COMPLETED`, `REVOKED`, `EXPIRED`.

Discussion: `DRAFT` may be needed if requests are prepared before release;
**completion does not automatically create an internal `Document`**.

## ClientPortalUploadedFileStatus

Recommended values: `RECEIVED`, `UNDER_REVIEW`, `ACCEPTED`, `REJECTED`, `DELETED`.

Discussion: the **virus-scanning state is unresolved** (may need its own field/enum
once storage is designed); **no automatic SharePoint / internal-document conversion**.

## ClientPortalTaskStatus

Recommended values: `OPEN`, `COMPLETED`, `REVOKED`, `EXPIRED`.

Discussion: **not the same as internal task status**; a completion bridge to
internal workflow is **deferred**.

## ClientPortalAuditAction

Draft values: `LOGIN`, `LOGOUT`, `MATTER_LIST_VIEW`, `MATTER_DETAIL_VIEW`,
`DOCUMENT_LIST_VIEW`, `DOCUMENT_DETAIL_VIEW`, `UPLOAD_REQUEST_VIEW`, `TASK_VIEW`,
`TASK_COMPLETE`, `ACCESS_DENIED`, `SYSTEM_DENIED`.

Discussion: **content-free only** — no document content/snippet or action payload.

## ClientPortalAuditResult

Recommended values: `SUCCESS`, `DENIED`, `FAILED`.

Discussion: **avoid recording sensitive reason detail in free text** — use a bounded
`reasonCode`, never a content string.

## Deferred message/notification enums

Conceptual only, **deferred**:

- message status (e.g. draft/visible/withdrawn);
- notification preference status (e.g. opted-in/opted-out);
- delivery result (e.g. sent/failed).

State: deferred until **privilege / retention / notification** design is complete.

## Values to avoid

- internal workflow statuses;
- broad `PENDING` unless its semantics are clear;
- `VISIBLE` (visibility is grant/share-specific, not a status);
- `SHARED` (confusable with active status);
- statuses that **imply download/upload/message functionality exists**;
- statuses that **expose internal litigation/workload states**.

## Client-facing mapping

- DB enum values should **not necessarily be rendered directly** to clients.
- Client-facing labels should be **mapped through the DTO / publication layer**.
- Internal status values remain **internal unless explicitly mapped**.
- **Matter publication status is separate** from the client-facing matter status.

## Open questions

- exact ref generator;
- prefix length and allowed alphabet;
- collision handling;
- whether `auditRef` is needed at all;
- whether user invite states are V1 or deferred;
- whether virus-scan status needs a separate enum;
- whether client-facing matter status should be an enum or safe free text;
- whether `allowedFileTypes` should be an enum, a text array, or JSON;
- enum migration compatibility if values change.

## Non-authorizations

- no enum added to `schema.prisma`;
- no ref generator implemented;
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

`CLIENT-PORTAL-CP-SCHEMA-1-RELATION-AND-INDEX-SPEC-DRAFT-1` — a docs-only
relation/index/cascade draft using the final names, fields, enums, and refs;
**no schema edit; no migration**.

Alternative: `CLIENT-PORTAL-AUTHZ-STUBS-CLOSEOUT-1` (docs-only).

**Effective next default: `CLIENT-PORTAL-CP-SCHEMA-1-RELATION-AND-INDEX-SPEC-DRAFT-1`.**
Reason: after names, fields, enums, and refs, the next safe pre-schema step is
relation / index / cascade specification.

## Final decision statement

- The enum/ref decision is **drafted only**.
- **No schema implementation exists.**
- **No migration exists.**
- **No DB-backed portal exists.**
- Client Portal remains **inert**.
- CP-SCHEMA-1 remains **blocked**.
- Production apply remains **NO-GO**.
