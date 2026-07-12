# Client Portal CP-SCHEMA-1 Model Naming Decision

## Purpose

This is a **documentation-only** naming/semantics decision that chooses the
recommended future CP-SCHEMA-1 model naming direction. It makes:

- naming/semantics decision only;
- no schema change;
- no migration;
- no DB connection;
- no migration command;
- no production apply;
- no CP-SCHEMA-1 authorization;
- no Client Portal enablement;
- no runtime/API/frontend change;
- no external visibility authorization.

It freezes naming for **planning purposes only**. It authorizes nothing.

## Current naming problem

- The conceptual `Portal*` names are clear in the product/design docs (data
  contract, schema candidate, authz stub design).
- Inert/current candidate `ClientPortal*` names already exist in the
  `schema.prisma` context (inspected here, **not edited**).
- Some existing names are **ambiguous** (`ClientPortalMembership`,
  `ClientVisibleArtifact`) — they blur matter-specific grants and distinct
  visibility surfaces.
- Schema implementation needs **one frozen naming direction** before any
  migration is generated.

## Decision

Use explicit **`ClientPortal*`** model names for future database models, because
they:

- clarify this is the **external client portal** surface;
- avoid confusion with internal portal/admin concepts;
- align with the existing candidate naming context in `schema.prisma`;
- make the external-surface risk **visible in the schema itself**.

But **refine broad names to explicit semantics** — each model names exactly one
thing: grant, publication, share, upload request, uploaded file, client task,
audit event.

## Final candidate model names

| Conceptual name | Final candidate DB model name | Reason |
| --- | --- | --- |
| `PortalUser` | `ClientPortalUser` | External principal, distinct from internal `User`. |
| `PortalMatterAccessGrant` | `ClientPortalMatterGrant` | Explicit matter grant; shorter but still unambiguous. |
| `PortalMatterPublication` | `ClientPortalMatterPublication` | Sanitized client-facing matter status/summary. |
| `PortalDocumentShare` | `ClientPortalDocumentShare` | Explicit per-document share, not matter-wide. |
| `PortalUploadRequest` | `ClientPortalUploadRequest` | Request that authorizes a client upload. |
| `PortalUploadedFile` | `ClientPortalUploadedFile` | Submitted-file metadata (not an internal document). |
| `PortalClientTask` | `ClientPortalTask` | Client-facing task; "Client" prefix already scopes it. |
| `PortalAuditEvent` | `ClientPortalAuditEvent` | Content-free portal audit. |
| `PortalMessageThread` *(deferred)* | `ClientPortalMessageThread` | Deferred client-visible thread. |
| `PortalMessage` *(deferred)* | `ClientPortalMessage` | Deferred client-visible message. |
| `PortalNotificationPreference` *(deferred)* | `ClientPortalNotificationPreference` | Deferred notification opt-in. |

## Names to avoid

- **`ClientPortalMembership`** — ambiguously implies broad, standing membership
  rather than a matter-specific, revocable grant. Use `ClientPortalMatterGrant`.
- **`ClientVisibleArtifact`** — conflates matter publication, document share,
  upload, task, and message visibility into one polymorphic bag; splitting into
  the explicit models above keeps each visibility surface and its forbidden-field
  rules distinct.
- **Generic `Portal*`** — too broad outside the Client Portal context; may collide
  with internal/admin "portal" concepts.
- **Any name implying automatic access** (e.g. an "access" table keyed only by
  client/case) — access must be an explicit grant, never inferred.
- **Any name implying document content exposure** (e.g. "DocumentContent") — the
  portal shares metadata only.
- **Any name implying internal task reuse** (e.g. reusing `Task`) — portal tasks
  are separate.

## Frozen semantic rules

- a portal user **is not** an internal `User`;
- **email match is not access**;
- matter access requires an **explicit active grant**;
- **matter access does not imply document access**;
- document access requires an **explicit document share**;
- publication controls the client-facing matter status/summary (nothing internal
  is auto-published);
- an upload request controls whether a file can be submitted;
- uploaded-file metadata is **not automatically** an internal `Document`;
- a client portal task **is not** an internal `Task` by default;
- audit is **content-free**;
- an internal relation **does not create** external visibility;
- **no `documents.workspaceText` exposure**, ever.

## Deferred names

- `ClientPortalMessageThread`;
- `ClientPortalMessage`;
- `ClientPortalNotificationPreference`.

State: **deferred** until privilege / retention / notification design is complete.
No deferred model is part of CP-SCHEMA-1 V1.

## Impact on existing docs

- future docs should **prefer the final candidate names** above;
- conceptual `Portal*` names may remain as **product shorthand only** if they are
  mapped to the final DB name;
- old ambiguous names (`ClientPortalMembership`, `ClientVisibleArtifact`,
  `ClientPortalGrant`, `ClientSubmission`, `ClientSubmissionAttachment`) should be
  treated as **stale/inert candidates** unless separately approved.

## No-go / non-authorizations

- this decision **does not** edit `schema.prisma`;
- **does not** create a migration;
- **does not** authorize CP-SCHEMA-1;
- **does not** authorize production apply;
- **does not** enable Client Portal;
- **does not** authorize a DB-backed portal;
- **does not** authorize route/service wiring.

## Remaining unresolved items

- final field-level schema;
- enum values;
- index/constraint details;
- cascade/delete behavior;
- retention / legal hold;
- external auth provider;
- upload storage / virus scanning;
- message privilege / retention;
- clone rehearsal;
- rollback plan acceptance;
- human CP-SCHEMA-1 approval.

## Recommended next package

`CLIENT-PORTAL-CP-SCHEMA-1-FIELD-SPEC-DRAFT-1` — a docs-only field-level draft for
the final candidate names; **no `schema.prisma` edit; no migration**.

Alternative: `CLIENT-PORTAL-AUTHZ-STUBS-CLOSEOUT-1` (docs-only).

**Effective next default: `CLIENT-PORTAL-CP-SCHEMA-1-FIELD-SPEC-DRAFT-1`.** Reason:
after naming is frozen, the next safe pre-schema step is field-level specification
before any migration.

## Final decision statement

- The naming direction is **frozen for planning purposes only**.
- **No schema implementation exists.**
- **No migration exists.**
- **No DB-backed portal exists.**
- Client Portal remains **inert**.
- CP-SCHEMA-1 remains **blocked**.
- Production apply remains **NO-GO**.

## Follow-up — CLIENT-PORTAL-CP-SCHEMA-1-FIELD-SPEC-DRAFT-1

- `CLIENT-PORTAL-CP-SCHEMA-1-FIELD-SPEC-DRAFT-1` completed a docs-only **field-level
  spec draft** (`docs/client-portal-cp-schema-1-field-spec-draft.md`) using the final
  candidate `ClientPortal*` names frozen here: per-model field tables (required/optional,
  external-safe ref vs internal FK, client-facing, status/revocation/expiry/retention),
  candidate enums, an index/constraint draft, and a field-level forbidden list.
- **No schema/migration is authorized.** CP-SCHEMA-1 remains blocked; production apply
  remains NO-GO.

## Follow-up — CLIENT-PORTAL-CP-SCHEMA-1-ENUM-AND-REF-DECISION-1

- `CLIENT-PORTAL-CP-SCHEMA-1-ENUM-AND-REF-DECISION-1` **refined these final candidate
  names with their external-safe `*Ref` fields and status enum values**
  (`docs/client-portal-cp-schema-1-enum-and-ref-decision.md`): per-model refs
  (`portalUserRef`, `grantRef`, `documentShareRef`, …), a prefixed opaque ref strategy,
  and recommended status values per enum. No schema/migration authorized; CP-SCHEMA-1
  remains blocked; production apply remains NO-GO.
