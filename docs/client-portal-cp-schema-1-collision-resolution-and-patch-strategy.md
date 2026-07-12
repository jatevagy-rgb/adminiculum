# Client Portal CP-SCHEMA-1 Collision Resolution and Patch Strategy

## Purpose

This is a **documentation-only** collision-resolution and schema-patch strategy for
the naming/table collisions between the final CP-SCHEMA-1 plan and the existing
inert legacy candidate block in `Backend/prisma/schema.prisma`. It makes:

- collision strategy only;
- no schema change;
- no migration;
- no DB connection;
- no migration command;
- no production apply;
- no CP-SCHEMA-1 authorization;
- no Client Portal enablement;
- no runtime/API/frontend change;
- no external visibility authorization.

## Background

- The final candidate names were frozen as explicit **`ClientPortal*`**
  (`523ca1d`), refined through field/enum-ref/relation specs (`c7599cb`,
  `9ef6231`, `78c549d`).
- A **non-applied Prisma draft exists only in markdown**
  (`docs/client-portal-cp-schema-1-prisma-draft-nonapplied.md`, `4b124b4`).
- `schema.prisma` **already contains an inert legacy candidate block**
  (7 models, 16 enums, snake_case `@@map` tables) plus a committed legacy
  migration (`20260702140000_add_client_portal_foundation`).
- **Collisions must be resolved before any schema patch** — this is the blocker
  the approval package surfaced.

Companion: `docs/client-portal-cp-schema-1-legacy-candidate-block-inventory.md`
holds the exact inventory this strategy relies on.

## Collision summary

Exact names from `schema.prisma`:

- **Model name collisions (2):** `ClientPortalUser`, `ClientPortalAuditEvent` —
  both exist in the legacy block and in the final plan with **different fields and
  semantics**.
- **Enum name collisions (3):** `ClientPortalUserStatus` (legacy adds `INVITED`),
  `ClientPortalGrantStatus` (values identical — benign), `ClientPortalAuditAction`
  (**disjoint value sets** — legacy artifact/membership-centric vs final
  matter/document/task/upload-centric).
- **`@@map` table-name collisions (2):** `client_portal_users`,
  `client_portal_audit_events` (both used by the legacy block and by the
  non-applied draft).
- **Semantic mismatches (no name collision):** legacy `ClientPortalMembership` /
  `ClientVisibleArtifact` / `ClientPortalGrant` / `ClientSubmission` /
  `ClientSubmissionAttachment` embody the rejected membership/polymorphic-artifact
  model (with `Json` payloads and two cascade deletes) that the frozen plan
  replaces with explicit matter grants, publications, document shares, upload
  requests, uploaded files, and tasks. Legacy `ClientPortalAuditOutcome` is a
  semantic twin of the final `ClientPortalAuditResult` under a different name.

## Strategy options

### A. Reuse legacy candidate block as-is

- **Benefits:** zero schema change; no migration.
- **Risks:** perpetuates rejected semantics (standing memberships, polymorphic
  `Json` artifacts, artifact-level grants, cascade deletes, `metadata Json?`
  audit); violates several frozen privacy rules.
- **Migration implications:** none now, heavy later.
- **Rollback implications:** n/a.
- **Clarity/privacy implications:** poor — grant≠membership and content-free-audit
  rules cannot be expressed.
- **Recommendation status:** **rejected**.

### B. Patch/extend legacy candidate block in place

- **Benefits:** preserves table names/migration history; incremental.
- **Risks:** mixes rejected and final semantics in the same models; field-level
  surgery on `ClientPortalUser`/`ClientPortalAuditEvent` while
  membership/artifact models linger; high confusion risk; enum surgery on
  `ClientPortalAuditAction` (value removal) is migration-sensitive.
- **Migration implications:** many small alterations; hard to review.
- **Rollback implications:** murky — mixed old/new states.
- **Clarity/privacy implications:** medium-poor; stale models remain reachable.
- **Recommendation status:** **not recommended**.

### C. Replace legacy candidate block with the final CP-SCHEMA-1 model set

- **Benefits:** one clean, reviewed model set matching every frozen decision;
  stale semantics removed; content rules expressible; clearest audit trail.
- **Risks:** requires dropping/renaming legacy tables — **must first verify
  whether the legacy tables exist in production and whether they are empty**
  (portal was never enabled, so they should be empty, but the migration-history
  divergence means this needs operator/clone verification); enum replacement for
  `ClientPortalAuditAction` is destructive-in-kind.
- **Migration implications:** one forward migration that drops (or renames away)
  stale objects and creates the final set; needs empty-DB + clone rehearsal.
- **Rollback implications:** manageable if legacy tables are verified empty
  (drop/create is reversible by re-running the legacy migration definition);
  documented forward-fix otherwise.
- **Clarity/privacy implications:** **best**.
- **Recommendation status:** **recommended, subject to human approval and clone
  verification**.

### D. Rename final models to avoid collision and keep legacy block

- **Benefits:** no legacy object touched; purely additive migration.
- **Risks:** two parallel portal schemas forever (`ClientPortalUser` vs a renamed
  `PortalAccountUser`?); naming decision would be re-broken; stale models with
  `Json` payloads and cascades stay in the schema indefinitely; future
  cleanup migration still needed.
- **Migration implications:** additive now, but debt compounds.
- **Rollback implications:** easy now, painful later.
- **Clarity/privacy implications:** poor — ambiguity institutionalized.
- **Recommendation status:** **not recommended** (fallback only if legacy tables
  are unexpectedly found populated in production).

## Recommended strategy

**Do not reuse the legacy block as-is.** Prefer a **human-approved
replacement/normalization strategy** (Option C) that either:

- **replaces** the stale/inert candidate definitions with the final reviewed
  CP-SCHEMA-1 definitions in one reviewed patch, or
- **explicitly renames/deprecates** the stale models (e.g. a `Legacy*` rename or
  documented deprecation) before introducing the final models, if verification
  shows the legacy tables cannot be dropped immediately.

**The exact approach requires human approval and clone rehearsal.** The single
hard precondition discovered here: **verify whether the legacy tables exist in
production and whether they are empty** before choosing drop-and-replace vs
rename-and-deprecate.

## Patch strategy outline

High-level only (nothing here is performed by this task):

1. freeze final model names (done — naming decision);
2. mark the legacy candidate block as **stale/inert in docs** (done — inventory);
3. prepare the `schema.prisma` patch draft **out-of-band**;
4. compare table mappings and the **existing migration history**
   (`20260702140000_add_client_portal_foundation`; production `_prisma_migrations`
   divergence noted in prior docs);
5. generate the migration **locally only after approval**;
6. rehearse on an **empty DB**;
7. rehearse on a **clone DB**;
8. verify **rollback / forward-fix**;
9. **keep the portal disabled** (triple gate unchanged);
10. require a **separate production apply decision**.

## Do-not-do list

- do **not** blindly copy the non-applied draft into `schema.prisma`;
- do **not** duplicate model names (two `ClientPortalUser` definitions cannot
  coexist — Prisma will not even validate);
- do **not** leave ambiguous `ClientVisibleArtifact` / `ClientPortalMembership`
  semantics in place alongside the final models;
- do **not** apply any migration before clone rehearsal;
- do **not** enable the portal just because schema exists;
- do **not** expose `documents.workspaceText`;
- do **not** connect the frontend.

## Decision matrix

| Option | Clarity | Migration risk | Privacy risk | Rollback risk | Recommended? |
| --- | --- | --- | --- | --- | --- |
| A. Reuse as-is | Poor | None now / high later | **High** (Json payloads, membership access, cascade deletes) | n/a | **No** |
| B. Patch in place | Medium-poor | High (many small, entangled changes) | Medium | High (mixed states) | **No** |
| C. Replace with final set | **Best** | Medium (drop/create; needs emptiness verification + rehearsals) | **Lowest** | Medium (manageable if tables empty) | **Yes — subject to human approval + clone verification** |
| D. Rename final models | Poor (two parallel schemas) | Low now / compounding | Medium (stale models persist) | Low now / high later | **No (fallback only)** |

## Open questions

- are any legacy candidate tables **already present in production**?
- if present, **empty or used**? (portal was never enabled — expected empty, but
  must be verified given the migration-history divergence);
- should table names be **preserved with `@@map`** (`client_portal_users`,
  `client_portal_audit_events`) or given fresh names to avoid drop-order issues?
- should stale models be **renamed or removed**?
- **enum rename strategy** — replace `ClientPortalAuditAction` values wholesale vs
  introduce a new enum name; reuse `ClientPortalGrantStatus` (identical values)?
  rename `ClientPortalAuditOutcome` → `ClientPortalAuditResult` or keep the legacy
  name?
- whether any **data backfill** is needed (expected: none, if tables are empty);
- whether the **legacy migrations already created the tables** in each environment
  (dev/clone/production may differ);
- **production clone verification required** before any drop decision.

## Final statement

- The collision strategy is **documented only**.
- **No schema implementation.**
- **No migration.**
- **CP-SCHEMA-1 remains blocked.**
- **Production apply remains NO-GO.**
