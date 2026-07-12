# Client Portal CP-SCHEMA-1 Migration Plan Draft

## Purpose

This is a **documentation-only** draft of how a future Client Portal schema
(CP-SCHEMA-1) could be approached safely. It makes:

- no schema change;
- no migration;
- no DB connection;
- no migration command;
- no production apply;
- no CP-SCHEMA-1 authorization;
- no Client Portal enablement;
- no runtime/API/frontend change;
- no external visibility authorization.

It explains a possible sequence, risks, gates, and blockers so a reviewer can
reason about CP-SCHEMA-1. It authorizes nothing.

## Current no-go posture

- CP-SCHEMA-1 remains **blocked**.
- Production apply remains **NO-GO**.
- The existing Client Portal is **inert only**.
- Authz / services / routes exist only as a **fail-closed / inert shell**.
- **No DB-backed portal exists.**

## Candidate CP-SCHEMA-1 scope

Candidate future schema scope (from `docs/client-portal-schema-candidate-design-2.md`):

- Portal user / external principal;
- matter access grants;
- matter publication;
- document shares;
- upload requests;
- uploaded-file metadata;
- client tasks;
- portal audit events;
- optional/deferred message/notification models.

Candidate model names:

- `PortalUser`
- `PortalMatterAccessGrant`
- `PortalMatterPublication`
- `PortalDocumentShare`
- `PortalUploadRequest`
- `PortalUploadedFile`
- `PortalClientTask`
- `PortalAuditEvent`
- deferred:
  - `PortalMessageThread`
  - `PortalMessage`
  - `PortalNotificationPreference`

Existing inert candidate names already present in `schema.prisma` (inspected for
context only, **not edited**), which a naming decision must reconcile against the
`Portal*` names above:

- `ClientPortalUser`
- `ClientPortalMembership`
- `ClientVisibleArtifact`
- `ClientPortalGrant`
- `ClientSubmission`
- `ClientSubmissionAttachment`
- `ClientPortalAuditEvent`

## Explicit out of scope

- `documents.workspaceText` exposure;
- raw document text;
- AI prompt/output;
- legal analysis;
- internal notes;
- workload records;
- collaborators;
- internal communications by default;
- storage / SharePoint paths in DTOs;
- live upload/download/message implementation;
- frontend API integration;
- runtime enablement;
- production apply.

## Proposed sequencing

A safe future sequence (this task performs **none** of these):

1. final human approval of model names and semantics;
2. schema design freeze;
3. migration generated **locally only**;
4. migration reviewed manually;
5. synthetic seed/fixtures only;
6. clone-database rehearsal;
7. backend tests against clone / synthetic data;
8. rollback rehearsal;
9. security/privacy review;
10. production readiness review;
11. only then a **separate explicit production-apply decision**.

## Model-by-model migration considerations

- **`PortalUser`** — purpose: external principal. Relations: optional
  `linkedClientRef` → `Client`. Uniqueness/index: unique `externalAuthSubject`.
  Nullable/required risk: `linkedClientRef` optionality must have a defined meaning.
  Cascade/delete risk: never cascade-delete internal `Client`. Retention/revocation:
  `status`/`suspendedAt`/`revokedAt`. Rollback: additive table, low risk.
- **`PortalMatterAccessGrant`** — purpose: explicit matter access. Relations:
  `portalUserRef` → `PortalUser`, `caseRef` → `Case`, `grantedBy` → `User`. Index:
  `(portalUserRef, caseRef, status)`. Nullable risk: `expiresAt` semantics. Cascade
  risk: FK to `Case` must not cascade-delete cases. Revocation: `revokedAt` first-class.
  Rollback: additive.
- **`PortalMatterPublication`** — purpose: sanitized client-facing matter status.
  Relations: `caseRef` → `Case`, `publishedBy` → `User`. Index: `(caseRef, status)`.
  Nullable risk: absent publication must mean safe omission. Cascade risk: none into
  internal `Case`. Retention: reversible/auditable. Rollback: additive.
- **`PortalDocumentShare`** — purpose: explicit document visibility. Relations:
  `documentRef` → `Document`, `caseRef` → `Case`, `portalUserRef` → `PortalUser`.
  Index: `(documentRef, status)`, `(portalUserRef, status)`. Nullable risk:
  `expiresAt`. Cascade risk: never cascade internal `Document`. Revocation: `revokedAt`.
  Rollback: additive. **No raw text / storage path columns.**
- **`PortalUploadRequest`** — purpose: client-facing upload request. Relations:
  `caseRef` → `Case`, `requestedBy` → `User`. Index: `(portalUserRef, caseRef, status)`.
  Nullable risk: `dueDate`/`retentionPolicyKey`. Cascade risk: none. Retention:
  `retentionPolicyKey`. Rollback: additive.
- **`PortalUploadedFile`** — purpose: submitted-file metadata. Relations:
  `uploadRequestRef` → `PortalUploadRequest`. Index: `(uploadRequestRef, status)`.
  Nullable risk: `reviewedBy`/`rejectedAt`. Cascade risk: file deletion vs retention.
  Retention: `retentionPolicyKey` + legal hold. Rollback: additive; **storage design
  is a separate prerequisite** (`storageRef` never client-facing).
- **`PortalClientTask`** — purpose: client-facing task/request. Relations:
  `caseRef` → `Case`, optional `relatedDocumentShareRef` → `PortalDocumentShare`.
  Index: `(portalUserRef, caseRef, status)`. Nullable risk: `relatedDocumentShareRef`.
  Cascade risk: never mutate internal `Task`. Rollback: additive.
- **`PortalAuditEvent`** — purpose: content-free audit. Relations: `portalUserRef`,
  optional `caseRef`/`documentRef`. Index: `(portalUserRef, timestamp)`,
  `(action, timestamp)`. Nullable risk: optional refs. Cascade risk: retain audit
  independent of subject deletion. Retention: separate content-free schedule.
  Rollback: additive. **No content columns.**
- **Deferred messages/notifications** (`PortalMessageThread`, `PortalMessage`,
  `PortalNotificationPreference`) — out of CP-SCHEMA-1 V1; require comms/retention/
  privilege review before any table exists.

## Existing model relationship risks

- `Case`, `Client`, `Document`, `User`, `Task`, `Communication`,
  `case_collaborators`, `workload_records` may be referenced by FK **only** after
  design, and never exposed directly.
- **An FK relationship does not create portal visibility.**
- **An internal role or relation does not equal a portal grant.**
- **Matter access does not imply a document share.**

## Index/constraint plan

- unique `externalAuthSubject` on the portal-user table;
- active-grant lookup index `(portalUserRef, caseRef, status)`;
- share lookup `(documentRef, caseRef, portalUserRef, status)`;
- upload-request lookup `(portalUserRef, caseRef, status)`;
- audit indexes `(portalUserRef, timestamp)` and `(action, timestamp)`;
- efficient revoked/expired filtering (`status`, `revokedAt`, `expiresAt`);
- an external-safe reference strategy (stable alias vs internal id) decided first;
- **avoid over-indexing** in the first migration — add only indexes proven by query
  paths.

## Privacy/security gates

- no `documents.workspaceText` exposure;
- no raw document content;
- no internal notes;
- no AI prompt/output;
- content-free audit;
- content-free errors;
- non-enumeration policy finalized;
- revocation behavior defined and immediate;
- retention / legal hold defined;
- data-subject / GDPR workflow defined;
- upload storage / virus scanning designed **before** any live upload.

## Test readiness checklist

- schema validation passes;
- migration applies cleanly to an empty DB;
- migration applies cleanly to a clone;
- rollback or forward-fix documented;
- authz fail-closed tests remain;
- route disabled-matrix tests remain;
- service fail-closed tests remain;
- mapper allow-list tests remain;
- future grant-scoping tests;
- future document-share tests;
- future upload-request tests;
- no-`workspaceText` tests;
- no-Prisma-broad-`include` tests;
- no-internal-DTO-import tests.

## Clone rehearsal plan

- use a **cloned non-production database only**;
- confirm **no production data exposure** in logs;
- run the migration on the clone;
- run the test suite against the clone / synthetic data;
- inspect resulting constraints/indexes;
- verify rollback / forward-fix;
- document timing and risks;
- **no production mutation**.

## Rollback / forward-fix strategy

- **additive migrations preferred**;
- avoid destructive changes;
- **nullable-first** where appropriate;
- **no data backfill** without a separate plan;
- no external enablement until the rollback strategy is accepted;
- **emergency disable remains the feature gate** (the triple runtime-ready flags),
  independent of schema.

## Production apply blockers

- human approval missing;
- final schema not approved;
- migration not generated/reviewed;
- clone rehearsal not done;
- rollback not rehearsed;
- retention / legal hold unresolved;
- external auth provider unresolved;
- upload storage unresolved;
- message privilege/retention unresolved;
- **production apply NO-GO still active.**

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

`CLIENT-PORTAL-CP-SCHEMA-1-MODEL-NAMING-DECISION-1` — docs-only human decision on
whether to use the conceptual `Portal*` names or the existing inert `ClientPortal*`
candidate names; no schema change.

Alternative: `CLIENT-PORTAL-AUTHZ-STUBS-CLOSEOUT-1` (docs-only).

**Effective next default: `CLIENT-PORTAL-CP-SCHEMA-1-MODEL-NAMING-DECISION-1`.**
Reason: before any schema implementation, model naming/semantics must be frozen.

## Final decision statement

- The CP-SCHEMA-1 migration plan is **drafted only**.
- **No schema implementation exists.**
- **No migration exists.**
- **No DB-backed portal exists.**
- Client Portal remains **inert**.
- CP-SCHEMA-1 remains **blocked**.
- Production apply remains **NO-GO**.

## Follow-up — CLIENT-PORTAL-CP-SCHEMA-1-MODEL-NAMING-DECISION-1

- `CLIENT-PORTAL-CP-SCHEMA-1-MODEL-NAMING-DECISION-1` completed the model naming/
  semantics decision (`docs/client-portal-cp-schema-1-model-naming-decision.md`). The
  **final candidate DB names use explicit `ClientPortal*` naming**
  (`ClientPortalUser`, `ClientPortalMatterGrant`, `ClientPortalMatterPublication`,
  `ClientPortalDocumentShare`, `ClientPortalUploadRequest`, `ClientPortalUploadedFile`,
  `ClientPortalTask`, `ClientPortalAuditEvent`; deferred `ClientPortalMessageThread`,
  `ClientPortalMessage`, `ClientPortalNotificationPreference`), avoiding ambiguous
  `ClientPortalMembership`/`ClientVisibleArtifact`.
- **No schema/migration is authorized.** CP-SCHEMA-1 remains blocked; production apply
  remains NO-GO.

## Follow-up — CLIENT-PORTAL-CP-SCHEMA-1-FIELD-SPEC-DRAFT-1

- `CLIENT-PORTAL-CP-SCHEMA-1-FIELD-SPEC-DRAFT-1` created
  `docs/client-portal-cp-schema-1-field-spec-draft.md`, a docs-only field-level draft
  (per-model field tables, candidate enums, index/constraint draft, forbidden-field
  list) for the frozen `ClientPortal*` models. **The field spec draft exists; no
  schema/migration is authorized.** CP-SCHEMA-1 remains blocked; production apply remains
  NO-GO.

## Follow-up — CLIENT-PORTAL-CP-SCHEMA-1-ENUM-AND-REF-DECISION-1

- `CLIENT-PORTAL-CP-SCHEMA-1-ENUM-AND-REF-DECISION-1` created
  `docs/client-portal-cp-schema-1-enum-and-ref-decision.md`, deciding the CP-SCHEMA-1
  enum values and external-safe ref strategy. **The enum/ref decision exists; no
  schema/migration is authorized.** CP-SCHEMA-1 remains blocked; production apply remains
  NO-GO.

## Follow-up — CLIENT-PORTAL-CP-SCHEMA-1-RELATION-AND-INDEX-SPEC-DRAFT-1

- `CLIENT-PORTAL-CP-SCHEMA-1-RELATION-AND-INDEX-SPEC-DRAFT-1` created
  `docs/client-portal-cp-schema-1-relation-and-index-spec-draft.md`, drafting per-model
  relations, index/uniqueness candidates, cascade cautions, and cross-model security
  invariants. **The relation/index spec draft exists; no schema/migration is
  authorized.** CP-SCHEMA-1 remains blocked; production apply remains NO-GO.

## Follow-up — CLIENT-PORTAL-CP-SCHEMA-1-READINESS-CHECKPOINT-2

- `CLIENT-PORTAL-CP-SCHEMA-1-READINESS-CHECKPOINT-2` **consolidates this and all other
  schema planning** into `docs/client-portal-cp-schema-1-readiness-checkpoint-2.md`
  (completed planning, frozen decisions, inert baseline, unresolved items, migration
  readiness gates, production-apply blockers). Conclusion: better prepared but
  **CP-SCHEMA-1 still blocked**; **no schema/migration authorized**; production apply
  remains NO-GO.
