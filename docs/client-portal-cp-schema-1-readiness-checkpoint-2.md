# Client Portal CP-SCHEMA-1 Readiness Checkpoint 2

## Purpose

This is a **documentation-only** readiness checkpoint that consolidates all
pre-schema planning for CP-SCHEMA-1 and states whether the project is ready for
actual schema implementation. It makes:

- readiness checkpoint only;
- no schema change;
- no migration;
- no DB connection;
- no migration command;
- no production apply;
- no CP-SCHEMA-1 authorization;
- no Client Portal enablement;
- no runtime/API/frontend change;
- no external visibility authorization.

It authorizes nothing.

## Executive conclusion

- **CP-SCHEMA-1 is better prepared but still blocked.**
- **Schema implementation is not authorized.**
- **Migration creation is not authorized.**
- **Production apply remains NO-GO.**
- **Client Portal remains inert.**

## Completed pre-schema planning

- **Schema candidate design 2** (`docs/client-portal-schema-candidate-design-2.md`) —
  decided the candidate model set and per-model purpose/fields/relationships; did **not**
  authorize schema/migration.
- **Migration plan draft** (`docs/client-portal-cp-schema-1-migration-plan-draft.md`) —
  decided the safe sequencing, clone-rehearsal, rollback strategy, and blockers; did
  **not** authorize any migration or DB command.
- **Model naming decision** (`docs/client-portal-cp-schema-1-model-naming-decision.md`) —
  froze the explicit `ClientPortal*` naming and per-surface semantics; did **not** edit
  `schema.prisma`.
- **Field spec draft** (`docs/client-portal-cp-schema-1-field-spec-draft.md`) — drafted
  per-model field tables, candidate enums, and a forbidden-field list; did **not**
  authorize schema/migration.
- **Enum/ref decision** (`docs/client-portal-cp-schema-1-enum-and-ref-decision.md`) —
  decided per-enum status values and the external-safe `*Ref` strategy; did **not** add
  any enum to schema or implement a ref generator.
- **Relation/index/cascade spec draft**
  (`docs/client-portal-cp-schema-1-relation-and-index-spec-draft.md`) — drafted per-model
  relations, indexes, cascade cautions, and cross-model security invariants; did **not**
  authorize schema/migration.

## Frozen planning decisions

- explicit **`ClientPortal*`** model naming;
- external-safe **`*Ref`** strategy (opaque, non-sequential, prefixed, unique/indexed);
- **model-specific status enums** (not one shared status enum);
- explicit **grant / share / publication / upload-request** semantics;
- **an internal FK is not visibility**;
- **a matter grant is not a document share**;
- **audit is content-free**;
- **no `documents.workspaceText`**.

## Current inert implementation baseline

- **frontend mock route tree** (`/portal*`, static/SSG, synthetic-only, API-free);
- **inert backend route matrix** (`routes.ts`) — auth-first, disabled-gate-first;
- **fail-closed authz stubs** (`authorization.ts`) — principal-not-ready / access-denied;
- **fail-closed service stubs** (`services.ts`) — `CLIENT_PORTAL_SERVICE_NOT_IMPLEMENTED`;
- **backend-local DTO / mappers** (`types.ts`, `mappers.ts`) — allow-list, unwired;
- **`401` / `501 CLIENT_PORTAL_NOT_ENABLED`** runtime boundary (triple runtime-ready gate,
  no flag weakened);
- tests currently **22 suites / 241 tests**.

## Current planned model set

- `ClientPortalUser`
- `ClientPortalMatterGrant`
- `ClientPortalMatterPublication`
- `ClientPortalDocumentShare`
- `ClientPortalUploadRequest`
- `ClientPortalUploadedFile`
- `ClientPortalTask`
- `ClientPortalAuditEvent`

Deferred:

- `ClientPortalMessageThread`
- `ClientPortalMessage`
- `ClientPortalNotificationPreference`

## What remains unresolved

- final field-level review by a human;
- enum value approval;
- external-safe ref generator design;
- relation/index/cascade approval;
- nullable vs required decisions;
- partial index strategy;
- cascade / `onDelete` strategy;
- retention / legal-hold policy;
- external auth provider;
- upload storage and virus scanning;
- message privilege / retention;
- clone rehearsal;
- rollback / forward-fix plan acceptance.

## Schema implementation blockers

- no human CP-SCHEMA-1 approval;
- no final `schema.prisma` patch;
- no migration file;
- no clone rehearsal;
- no rollback rehearsal;
- no security/privacy signoff;
- no production apply approval.

## Migration readiness gates

Required **future** gates (none performed in this task):

1. human approval of naming/fields/enums/relations;
2. Prisma draft reviewed out-of-band;
3. `schema.prisma` patch generated;
4. migration generated **locally only**;
5. migration manually reviewed;
6. empty-DB rehearsal;
7. clone-DB rehearsal;
8. rollback / forward-fix documented;
9. full backend/frontend validation;
10. privacy/security signoff;
11. a **separate production-apply decision**.

## Production apply blockers

- production apply **NO-GO remains active**;
- CP-SCHEMA-1 blocked;
- no approved migration;
- no clone rehearsal;
- no rollback acceptance;
- no external auth decision;
- no retention / legal-hold decision;
- no upload storage / virus-scanning decision;
- no external visibility review.

## No-go statement

- **do not** treat planning docs as migration authorization;
- **do not** edit `schema.prisma`;
- **do not** create migrations;
- **do not** run DB commands;
- **do not** enable the portal by flags;
- **do not** connect the frontend to backend APIs;
- **do not** wire routes to authz/services for live behavior;
- **do not** expose `documents.workspaceText`.

## Recommended next package

`CLIENT-PORTAL-CP-SCHEMA-1-PRISMA-DRAFT-NONAPPLIED-1` — **only** as a non-applied
draft file (not `schema.prisma`, not a migration), and only if explicitly approved.

Safer alternative: `CLIENT-PORTAL-CP-SCHEMA-1-HUMAN-APPROVAL-PACKET-1` (docs-only).

**Effective next default: `CLIENT-PORTAL-CP-SCHEMA-1-HUMAN-APPROVAL-PACKET-1`.**
Reason: before any Prisma draft, a human-readable approval packet should summarize the
exact decisions and no-go gates for a human decision.

## Final decision statement

- The readiness checkpoint is **completed**.
- CP-SCHEMA-1 remains **blocked**.
- **No schema implementation exists.**
- **No migration exists.**
- **No DB-backed portal exists.**
- Client Portal remains **inert**.
- Production apply remains **NO-GO**.

## Follow-up — CLIENT-PORTAL-CP-SCHEMA-1-APPROVAL-AND-NONAPPLIED-PRISMA-DRAFT-1

- `CLIENT-PORTAL-CP-SCHEMA-1-APPROVAL-AND-NONAPPLIED-PRISMA-DRAFT-1` created the Gate 1/2
  materials: the **human approval packet**
  (`docs/client-portal-cp-schema-1-human-approval-packet.md`), the **non-applied Prisma
  draft** (`docs/client-portal-cp-schema-1-prisma-draft-nonapplied.md`, markdown-only,
  not `schema.prisma`, not a migration), the **risk register**
  (`docs/client-portal-cp-schema-1-risk-register.md`), and the **gate plan**
  (`docs/client-portal-cp-schema-1-next-gates.md`).
- **No schema/migration is authorized.** The draft flags the legacy candidate block
  name collisions (`ClientPortalUser`/`ClientPortalAuditEvent` and three enums) as a
  required pre-patch human decision. CP-SCHEMA-1 remains blocked; production apply
  remains NO-GO.

## Follow-up — CLIENT-PORTAL-CP-SCHEMA-1-COLLISION-RESOLUTION-AND-PATCH-STRATEGY-1

- The **collision strategy package now exists**: strategy
  (`docs/client-portal-cp-schema-1-collision-resolution-and-patch-strategy.md`,
  recommended Option C — replacement/normalization), exact legacy inventory
  (`docs/client-portal-cp-schema-1-legacy-candidate-block-inventory.md`), and the
  schema patch review checklist
  (`docs/client-portal-cp-schema-1-schema-patch-review-checklist.md`).
- **Readiness is still blocked** pending human approval (Gate 1 + new Gate 1A) and
  clone/production verification of the legacy tables' existence and emptiness.
  No schema/migration authorized; production apply remains NO-GO.

## Follow-up — CLIENT-PORTAL-CP-SCHEMA-1-BLOCK-ENFORCEMENT-AND-APPROVAL-READINESS-1

- Added CP-SCHEMA-1 block-enforcement guards (`Backend/tests/clientPortalCpSchemaBlockGuards.test.ts`) plus approval-readiness/operator-verification docs.
- The readiness position is unchanged: the planning package is stronger, but schema work remains blocked until human approval, collision strategy acceptance, and operator verification of legacy ClientPortal table/enums/migration state.
- No `schema.prisma` edit, migration, DB query, migration command, runtime API, frontend API integration, or Client Portal enablement is authorized.
