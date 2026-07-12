# Client Portal CP-SCHEMA-1 Next Gates

## Purpose

This is a **documentation-only** gate plan for how CP-SCHEMA-1 could progress from
the current inert state to (eventually, if ever approved) a production schema. It
makes no schema change, no migration, no DB connection, no production apply, and no
Client Portal enablement. Passing a gate always requires the stated exit criteria —
**no gate is passed by this document itself**.

## Gate 0 — Current state

- **Inert shell only**: mock frontend, inert route matrix, fail-closed authz/service
  stubs, unwired DTO/mappers, `401`/`501` runtime boundary.
- **No DB-backed portal.**
- **No CP-SCHEMA-1.**
- Production apply NO-GO.

## Gate 1 — Human approval packet

Inputs:

- `docs/client-portal-cp-schema-1-human-approval-packet.md` (approval packet);
- `docs/client-portal-cp-schema-1-field-spec-draft.md` (field spec);
- `docs/client-portal-cp-schema-1-enum-and-ref-decision.md` (enum/ref decision);
- `docs/client-portal-cp-schema-1-relation-and-index-spec-draft.md` (relation/index spec);
- `docs/client-portal-cp-schema-1-risk-register.md` (risk register).

Exit criteria: **explicit human approval** of the 12 approval questions (including
the legacy-block collision handling).

## Gate 2 — Non-applied Prisma draft review

Inputs:

- `docs/client-portal-cp-schema-1-prisma-draft-nonapplied.md` (non-applied draft);
- the **actual `schema.prisma` relation names** and legacy candidate block;
- a manual review of collisions, back-relations, `onDelete`, and partial-index
  strategy.

Exit criteria: an **approved schema patch plan** (what changes, what is replaced,
what is renamed, how legacy candidates are handled).

## Gate 3 — Local schema patch

- Only after explicit Gate 1 + Gate 2 approval.
- A `schema.prisma` patch prepared and reviewed **locally**.
- **No production; no DB apply.**

## Gate 4 — Migration generation

- Only after the schema patch is approved.
- Migration generated **locally only** and manually reviewed line by line.

## Gate 5 — Empty DB rehearsal

- Apply the migration to an **empty local/dev database**; verify constraints,
  indexes, and Prisma client generation; run the backend suite.

## Gate 6 — Clone DB rehearsal

- Apply to a **production-like clone only** (never production); verify timing,
  constraints, rollback/forward-fix; run the full suite; document results.

## Gate 7 — Runtime integration planning

- Plan (still without enabling): repositories/explicit selects, wiring authz →
  services → mappers behind the runtime-ready gate, grant-scoping tests,
  non-enumeration policy. **Still not enablement.**

## Gate 8 — Production readiness review

- Security/privacy signoff; retention/legal-hold decision; external auth provider
  decision; upload storage/virus-scanning decision (if uploads in scope); rollback
  acceptance.

## Gate 9 — Separate production apply decision

- A **separate explicit human decision** to lift the production apply NO-GO for
  this migration only, with clone-rehearsal proof attached.

## Gate 10 — External visibility decision

- A separate review before any client can ever see the portal: full authz
  implementation + tests, publication workflows, non-enumeration verification,
  and an explicit external-visibility approval.

## Final statement

**The current task completes none of these gates** — it only prepares the documents
that feed Gate 1 and Gate 2. CP-SCHEMA-1 remains blocked; production apply remains
NO-GO; Client Portal remains inert.

## Update — Gate 1A inserted (collision strategy approval)

- `CLIENT-PORTAL-CP-SCHEMA-1-COLLISION-RESOLUTION-AND-PATCH-STRATEGY-1` added a
  **Gate 1A prerequisite between Gate 1 and Gate 2**: the **collision strategy must be
  approved** (and the legacy tables' production existence/emptiness verified) **before
  the non-applied draft review (Gate 2) or any schema patch (Gate 3)**.
- Gate 1A inputs: `docs/client-portal-cp-schema-1-collision-resolution-and-patch-strategy.md`,
  `docs/client-portal-cp-schema-1-legacy-candidate-block-inventory.md`. Gate 2/3 also
  gain the `docs/client-portal-cp-schema-1-schema-patch-review-checklist.md` as a
  review input. Exit criteria: explicit human approval of the disposition
  (replace / rename-deprecate) for the legacy candidate block.
- No gate is passed by this update. CP-SCHEMA-1 remains blocked; production apply
  remains NO-GO.

## Gate 1B — Legacy table operator verification

- Added by `CLIENT-PORTAL-CP-SCHEMA-1-BLOCK-ENFORCEMENT-AND-APPROVAL-READINESS-1`.
- Before any schema patch, operator verification must record whether legacy ClientPortal tables, enum types, and the `20260702140000_add_client_portal_foundation` migration exist in the target environment and whether any legacy tables contain rows.
- Use `docs/client-portal-cp-schema-1-operator-verification-checklist.md` as the checklist. If verification is blocked or legacy tables contain data, CP-SCHEMA-1 remains blocked pending human data-classification and migration/backfill decisions.
- This gate authorizes no DB access by itself and does not authorize production apply.
