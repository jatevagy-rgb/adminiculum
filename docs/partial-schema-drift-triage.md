# Partial Schema Drift Triage

## Purpose

This document triages the already-inventoried partial schema drift and code-compatibility leftovers into future decision lanes.

It is documentation-only. It makes no runtime change, no schema change, no migration, no DB connection, no production apply, no Azure change, and no CP-SCHEMA-1 authorization.

This triage is not a final implementation decision. It uses candidate language because this task did not query production physical schema and did not run live smoke tests.

## Current global posture

| Area | Status |
| --- | --- |
| Production apply | `BLOCKED` |
| CP-SCHEMA-1 | `BLOCKED` |
| Partial schema drift | `QUARANTINE` |
| Inventory source | `docs/partial-schema-drift-inventory.md` |
| Human decision sheet | `docs/production-compatible-baseline-human-decisions.md` |
| DB connection used | No |
| Runtime/schema/migration change | No |

## Triage categories

1. `REMOVE candidate` — appears stale, ghost, historical, or not aligned with current product direction; still requires human decision before deletion or archival.
2. `BRING-FORWARD candidate` — may be a useful future capability, but requires explicit product decision, schema/runtime migration design, clone proof, tests, and security/privacy review.
3. `KEEP-BUT-HARDEN candidate` — appears currently useful or active, but requires targeted hardening and production physical schema proof before any baseline claim.
4. `QUARANTINE pending production schema comparison` — repo references exist, but production DB compatibility is not established.
5. `NEEDS PRODUCT DECISION` — engineering direction depends on product scope, operating model, or rollout priority.
6. `SECURITY/PRIVACY BLOCKED` — involves client visibility, document content, legal professional secrecy, personal data, AI/provider processing, rehydration, audit/logging, reporting, or document storage.

An item may belong to more than one category. Where multiple categories apply, the strictest blocker is listed first.

## Triage table

| Item / family | Inventory evidence | Proposed lane | Reasoning | Strict blocker | Required next step | Suggested first implementation package, if any |
| --- | --- | --- | --- | --- | --- | --- |
| Case collaborators | `Backend/prisma/schema.prisma`; `Backend/src/modules/cases/routes.ts`; `Backend/src/modules/cases/services.ts`; `Backend/src/modules/handoff-packages/authorization.ts`; `Backend/tests/routeFeatureGuards.test.ts` | `KEEP-BUT-HARDEN candidate`; `QUARANTINE pending production schema comparison` | Active case routes and handoff authorization reference collaborators, so this may be current workflow infrastructure rather than a future-only feature. The production table/index/FK shape is not established here. | Production physical schema comparison | Prove table, unique constraint, indexes, FKs, and route behavior on a fresh clone before deciding `KEEP-BUT-HARDEN`. | `CASE-COLLABORATORS-1 read-only schema proof + route hardening plan` |
| Anonymous document compatibility fields | `Backend/prisma/schema.prisma`; `Backend/src/modules/anonymize/routes.ts`; `Backend/src/modules/anonymize/services.ts`; `Backend/tests/documentAiBoundary.test.ts` | `SECURITY/PRIVACY BLOCKED`; `BRING-FORWARD candidate`; `QUARANTINE pending production schema comparison` | Anonymization is a sensitive legal-document workflow and current routes are hardened/default-disabled. Persistence may be valuable, but must not be silently included. | Privacy/security model and production physical schema comparison | Decide whether anonymization persistence is production scope, then prove physical table/column/index state and document retention/logging rules. | `ANON-PERSISTENCE-1 privacy model + clone metadata proof` |
| Rehydration / reidentification fields | `Backend/prisma/schema.prisma`; `Backend/src/modules/anonymize/routes.ts`; `Backend/src/modules/anonymize/services.ts`; `docs/production-schema-snapshot-comparison-results.md` | `SECURITY/PRIVACY BLOCKED`; `BRING-FORWARD candidate` | Rehydration restores identities and can persist AI response and reidentified content. It requires a stronger threat model than ordinary document metadata. | Reidentification threat model | Define allowed persistence, audit/log redaction, retention/delete, and permission rules before any schema bring-forward. | `REHYDRATION-1 privacy threat model docs-only` |
| Contract generation drift | `Backend/prisma/schema.prisma`; `Backend/src/modules/contracts/routes.ts`; `Backend/src/modules/contracts/services.ts`; `Backend/tests/contractsBoundary.test.ts`; `docs/production-schema-snapshot-comparison-results.md` | `SECURITY/PRIVACY BLOCKED`; `BRING-FORWARD candidate`; `QUARANTINE pending production schema comparison` | Contract generation includes storage, SharePoint, local file handling, generated content, and metadata drift. It remains hardened/default-disabled and is not read-only. | Storage/retention/security model | Decide approved storage model and prove exact `contract_generations` field set before any migration or route enablement. | `CONTRACTS-GENERATION-2 storage model + schema proof` |
| `GenerationStatus` enum drift | `Backend/prisma/schema.prisma`; `Backend/src/modules/contracts/services.ts`; `Backend/src/modules/legal-analyses/service.ts`; `docs/production-schema-snapshot-comparison-results.md` | `QUARANTINE pending production schema comparison`; `BRING-FORWARD candidate` | Enum values can fail at write time if runtime reaches unproven values such as `APPROVED` or `REJECTED`. This should be handled as additive enum remediation only after route/product decisions. | Production enum value proof | Compare enum values on a fresh clone and map which runtime paths can write each value. | `GENERATION-STATUS-1 enum proof and write-path audit` |
| Generation drafts | `Backend/prisma/schema.prisma`; `Backend/src/modules/generation-draft/routes.ts`; `Backend/src/modules/generation-draft/service.ts`; `docs/production-migration-history-classification-matrix.md` | `NEEDS PRODUCT DECISION`; `BRING-FORWARD candidate` | Persisted draft forms can improve productivity but are feature-flagged and not proven production baseline. Product must decide if persistent drafts are needed now. | Product scope decision | Decide whether draft persistence is part of the near-term product. If yes, design a separate additive migration and tests. | `GENERATION-DRAFTS-1 product decision + schema plan docs-only` |
| Legal analyses | `Backend/prisma/schema.prisma`; `Backend/src/modules/legal-analyses/routes.ts`; `Backend/src/modules/legal-analyses/service.ts`; `Backend/tests/documentAiBoundary.test.ts` | `SECURITY/PRIVACY BLOCKED`; `BRING-FORWARD candidate` | Legal analyses store lawyer work product and may include external AI output or privileged legal text. Routes are hardened/default-disabled and still quarantine. | Legal work-product/privacy model | Define provider/data-processing policy, persistence scope, audit redaction, and access model before migration design. | `LEGAL-ANALYSES-1 privacy and persistence design` |
| Comparison snapshot | `Backend/prisma/schema.prisma`; `Backend/src/modules/contracts/services.ts`; `docs/production-compatible-schema-baseline-proposal.md`; `docs/production-schema-snapshot-comparison-results.md` | `KEEP-BUT-HARDEN candidate`; `QUARANTINE pending production schema comparison` | Runtime contract comparison/edit logic references snapshots, but current contracts family is quarantined. If comparison is a live workflow, this may need targeted additive remediation. | Product decision and column proof | Decide whether snapshot persistence is required for current production comparison/edit flow; then prove/add only the column if approved. | `COMPARISON-SNAPSHOT-1 requirement decision + clone proof` |
| Client house style | `Backend/prisma/schema.prisma`; `Backend/src/modules/clients/routes.ts`; `Backend/tests/routeFeatureGuards.test.ts` | `NEEDS PRODUCT DECISION`; `BRING-FORWARD candidate` | Reads safely degrade while disabled and writes are guarded. House style is useful but client-specific and not proven production-compatible. | Product scope and privacy/storage review | Decide if house-style persistence is near-term; if yes, prove schema and add targeted route tests around disabled/enabled behavior. | `CLIENT-HOUSE-STYLE-1 product and schema proof` |
| Clause library / contract assembly | `Backend/prisma/schema.prisma`; `Backend/src/modules/clause-library/routes.ts`; `Backend/src/modules/clause-library/service.ts`; `Backend/src/modules/contracts/services.ts`; `Backend/src/openapi/publicSpec.ts` | `NEEDS PRODUCT DECISION`; `BRING-FORWARD candidate`; `SECURITY/PRIVACY BLOCKED` | Clause CRUD and assembly drafts are DB-backed, connected to generation, and potentially involve reusable legal drafting content. Assembly should not move independently of clause governance. | Product governance and storage/audit model | Decide whether standalone clause library and assembly drafts are product commitments; define ownership/versioning/audit before schema work. | `CLAUSE-LIBRARY-1 governance + migration split plan` |
| Timesheet reports / artifacts / presets | `Backend/prisma/schema.prisma`; `Backend/src/modules/timesheet-reports/routes.ts`; `Backend/src/modules/timesheet-reports/service.ts`; `Backend/tests/routeFeatureGuards.test.ts` | `NEEDS PRODUCT DECISION`; `BRING-FORWARD candidate` | Some report generation helpers are available while persistence is guarded. Persisted reports/artifacts may contain client billing/work detail and require reporting/privacy policy. | Product/reporting scope decision | Decide if persisted report history is required; if yes, define privacy, retention, and clone-proven additive schema. | `TIMESHEET-REPORTS-1 product decision + privacy model` |
| Workload tracking | `Backend/prisma/schema.prisma`; `docs/production-compatible-baseline-human-decisions.md`; `docs/production-migration-history-classification-matrix.md` | `QUARANTINE pending production schema comparison`; `NEEDS PRODUCT DECISION` | Migration history contains ambiguous rolled-back/later-finished state. Runtime exposure is unclear from this triage. | Migration-history and physical schema proof | Determine whether physical objects exist and whether workload tracking is an active product surface. | `WORKLOAD-TRACKING-1 metadata proof docs-only` |
| Client identity fields | `Backend/prisma/schema.prisma`; `docs/production-compatible-baseline-human-decisions.md`; `docs/production-schema-feature-family-reconciliation-decision-memo.md` | `QUARANTINE pending production schema comparison`; `NEEDS PRODUCT DECISION` | Legal identity fields can affect client records and may have backfill/quality implications. No production physical proof was obtained in this task. | Product/legal data model decision | Decide canonical client identity fields and prove current production column state before any remediation. | `CLIENT-IDENTITY-1 field ownership decision` |
| Case client role | `Backend/prisma/schema.prisma`; `Backend/src/modules/anonymize/services.ts`; `docs/production-compatible-baseline-human-decisions.md` | `KEEP-BUT-HARDEN candidate`; `QUARANTINE pending production schema comparison` | Runtime anonymization logic references `case.clientRole`, so the field may affect active privacy behavior. Physical presence and semantics still need proof. | Production column proof and privacy semantics | Prove column state and define allowed values/meaning before treating it as baseline. | `CASE-CLIENT-ROLE-1 column proof + semantics` |
| Client color | `Backend/prisma/schema.prisma`; `docs/production-compatible-baseline-human-decisions.md`; `docs/production-schema-feature-family-reconciliation-decision-memo.md` | `QUARANTINE pending production schema comparison` | This appears low-risk visually, but production physical proof and runtime need are still unresolved. | Production column proof | Verify whether column exists and whether UI/runtime uses it before deciding keep/remove. | `CLIENT-COLOR-1 column proof` |
| Workspace text | `Backend/prisma/schema.prisma`; `Backend/src/modules/documents/routes.ts`; `docs/client-portal-publication-payload-validator-design.md`; `docs/production-compatible-baseline-human-decisions.md` | `SECURITY/PRIVACY BLOCKED`; `KEEP-BUT-HARDEN candidate`; `QUARANTINE pending production schema comparison` | Workspace text can store privileged legal drafting content and is explicitly forbidden in client-visible payload design. It may support real document workspace flows, but must be handled with strict privacy rules. | Privacy/storage/retention model and column proof | Prove physical column state and define retention, access, logging, and client-portal exclusion rules. | `WORKSPACE-TEXT-1 privacy model + column proof` |
| Review persistence | `Backend/prisma/schema.prisma`; `Backend/src/modules/documents/reviewSuggestions.service.ts`; `Backend/tests/documentReviewSuggestions.service.test.ts`; `Backend/tests/documentAiBoundary.test.ts` | `SECURITY/PRIVACY BLOCKED`; `BRING-FORWARD candidate` | Review suggestions may contain legal work product and selected text previews. They remain within document-AI privacy quarantine. | Document-review privacy model | Define review suggestion storage, access, audit, retention, and disabled-feature behavior before enabling persistence. | `REVIEW-PERSISTENCE-1 privacy and route contract design` |
| DB-only rollback | `docs/production-migration-history-classification-matrix.md`; `docs/production-compatible-baseline-human-decisions.md`; `docs/production-schema-snapshot-comparison-results.md` | `REMOVE candidate` | Prior docs describe a DB-recorded rolled-back migration missing locally with no active objects found. It looks like historical state, but should not be erased from narrative without human confirmation. | Human remediation decision | Decide whether to archive as historical-only and exclude from future migration planning. | `DB-ONLY-ROLLBACK-1 human decision note` |
| CP-SCHEMA-1 | `Backend/prisma/schema.prisma`; `Backend/prisma/migrations/20260702140000_add_client_portal_foundation/migration.sql`; `docs/cp-schema-1-fresh-clone-verification-no-go.md`; `docs/production-compatible-baseline-human-decisions.md` | `SECURITY/PRIVACY BLOCKED`; `QUARANTINE` | Client Portal foundation remains blocked until production-compatible baseline and migration-history remediation are resolved. It must not be mixed into partial-drift remediation. | Baseline remediation first | Keep CP-SCHEMA-1 out of implementation until baseline blockers and client identity/security model are resolved. | No CP package yet; resume only after baseline remediation |

## Suggested sequencing

1. **Production schema comparison package, read-only, no apply** — collect fresh clone metadata for the currently ambiguous partial/drift objects and enum values.
2. **Clearly stale ghost decision package** — decide whether the DB-only rolled-back kb/learning/escalation migration is historical-only and should be excluded from future baseline work.
3. **Active low-risk `KEEP-BUT-HARDEN` candidates** — prioritize case collaborators, case client role, comparison snapshot, and workspace text only after schema proof and privacy/product semantics are clear.
4. **Product decision package for future features** — decide generation drafts, client house style, clause library/assembly, timesheet reports, and legal analyses before migration design.
5. **Security/privacy model packages** — resolve document/AI, anonymization, rehydration, review persistence, contracts, and client-visible boundaries before enablement or bring-forward.
6. **BRING-FORWARD schema migration design** — only after product/security decisions, split by feature family, docs-only first, then clone-proofed migration candidates.
7. **CP-SCHEMA-1** — resume only after production-compatible baseline blockers are resolved and the Client Portal identity/security boundary is confirmed.

## Non-actions

- No schema changed.
- No migration was created, edited, applied, resolved, moved, or deleted.
- No DB connection was used.
- No DB apply was performed.
- No Azure deployment or Azure configuration change occurred.
- No runtime behavior changed.
- No route behavior changed.
- No OpenAPI or CORS behavior changed.
- No frontend changed.
- No tests changed.
- No production smoke, AI/provider call, SharePoint call, or file-processing job was run.

## Recommended next prompt

`Adminiculum — partial schema drift production comparison plan docs-only`

That next task should define a fresh-clone, SELECT-only metadata comparison plan. It should still not connect to production directly, mutate DB state, deploy, or authorize CP-SCHEMA-1.

## Final classification

`partial_schema_drift_triage_documented_no_db_change_no_runtime_change`
