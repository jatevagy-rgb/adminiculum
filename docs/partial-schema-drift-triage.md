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

## Production metadata result overlay

PROD-SCHEMA-COMPARE-READONLY-1 added the controlling metadata evidence in `docs/production-schema-readonly-compare.md`. That compare used production schema metadata only, read no business data, performed no DB apply/migration, and does not move any family to `KEEP`.

| Metadata result | Items / families |
| --- | --- |
| present-compatible | `case_collaborators`; `workload_records`; client identity fields; `cases.clientRole`; `clients.color`; `documents.workspaceText` |
| present-partial | `anonymous_documents`; `contract_generations` |
| enum-drift | `GenerationStatus`, where production lacks Prisma `APPROVED` / `REJECTED` |
| absent | generation drafts; legal analyses; client house style; clause library / assembly; timesheet persistence; document review suggestions; CP-SCHEMA-1 tables |
| not applicable / historical | DB-only rolled-back kb/learning/escalation migration |

Present-compatible metadata is not a production apply authorization. Present-compatible items still need runtime authorization review, privacy/security review where relevant, and targeted tests before any production-compatible baseline claim.

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

## Updated decision lanes after production metadata compare

| Item / family | Previous lane | Production metadata result | Updated lane | Strict blocker | Next safe package |
| --- | --- | --- | --- | --- | --- |
| Case collaborators | `KEEP-BUT-HARDEN candidate`; `QUARANTINE pending production schema comparison` | present-compatible | `KEEP-BUT-HARDEN candidate` | Confirm runtime usage, case-level authorization, no cross-case collaborator leakage, and targeted tests | `CASE-COLLABORATORS-1 authorization and route safety audit` |
| Workload tracking | `QUARANTINE pending production schema comparison`; `NEEDS PRODUCT DECISION` | present-compatible | `KEEP-BUT-HARDEN candidate` if runtime uses it; otherwise `KEEP candidate` pending runtime review | Confirm current runtime exposure and ensure no internal workload data is externally exposed | `WORKLOAD-TRACKING-1 runtime exposure audit` |
| Client identity fields | `QUARANTINE pending production schema comparison`; `NEEDS PRODUCT DECISION` | present-compatible | `KEEP candidate` for internal baseline only, pending runtime/product review | No Client Portal reliance or external visibility assumption | `CLIENT-IDENTITY-1 internal baseline semantics audit` |
| `cases.clientRole` | `KEEP-BUT-HARDEN candidate`; `QUARANTINE pending production schema comparison` | present-compatible | `KEEP candidate` for internal baseline only, pending privacy semantics | No CP-SCHEMA-1 authorization; define allowed values and anonymization meaning | `CASE-CLIENT-ROLE-1 semantics and anonymization safety audit` |
| `clients.color` | `QUARANTINE pending production schema comparison` | present-compatible | `KEEP candidate` for internal baseline if runtime usage is safe | Confirm UI/runtime usage; no Client Portal assumption | `CLIENT-COLOR-1 runtime usage audit` |
| `documents.workspaceText` | `SECURITY/PRIVACY BLOCKED`; `KEEP-BUT-HARDEN candidate`; `QUARANTINE pending production schema comparison` | present-compatible | `KEEP-BUT-HARDEN candidate`; `SECURITY/PRIVACY BLOCKED` | Document content/privacy review; document/AI hardening remains in force; no raw legal text exposed externally; audit/logging review | `WORKSPACE-TEXT-1 privacy and exposure audit` |
| Anonymous document compatibility fields | `SECURITY/PRIVACY BLOCKED`; `BRING-FORWARD candidate`; `QUARANTINE pending production schema comparison` | present-partial | `QUARANTINE pending production schema reconciliation`; `SECURITY/PRIVACY BLOCKED` | Anonymization/rehydration threat model, field-level mismatch review, retention/delete policy, no rehydration enablement, no CP-SCHEMA-1 | `ANON-PARTIAL-1 field mismatch and privacy design` |
| Rehydration / reidentification fields | `SECURITY/PRIVACY BLOCKED`; `BRING-FORWARD candidate` | absent from `anonymous_documents` | `BRING-FORWARD candidate`; `SECURITY/PRIVACY BLOCKED` | Reidentification threat model and explicit product approval | `REHYDRATION-1 threat model docs-only` |
| Contract generation drift | `SECURITY/PRIVACY BLOCKED`; `BRING-FORWARD candidate`; `QUARANTINE pending production schema comparison` | present-partial | `QUARANTINE pending production schema reconciliation`; `SECURITY/PRIVACY BLOCKED` | Contract storage model, retention/delete policy, SharePoint/approved storage decision, `GenerationStatus` enum drift, no contract generation enablement | `CONTRACT-GENERATION-PARTIAL-1 storage and schema reconciliation design` |
| `GenerationStatus` enum drift | `QUARANTINE pending production schema comparison`; `BRING-FORWARD candidate` | enum-drift; production lacks Prisma `APPROVED` / `REJECTED` | `CP-SCHEMA-1 BLOCKER`; `QUARANTINE` | Decide whether repo enum should be reduced to production values or production later migrated; code writing `APPROVED`/`REJECTED` would fail or be unsafe today | `GENERATION-STATUS-ENUM-DRIFT-AUDIT-1` |
| Generation drafts | `NEEDS PRODUCT DECISION`; `BRING-FORWARD candidate` | absent | `BRING-FORWARD candidate`; `QUARANTINE pending product/security decision` | Product decision before migration design; no runtime enablement relying on absent table | `GENERATION-DRAFTS-1 product decision docs-only` |
| Legal analyses | `SECURITY/PRIVACY BLOCKED`; `BRING-FORWARD candidate` | absent | `BRING-FORWARD candidate`; `SECURITY/PRIVACY BLOCKED`; `QUARANTINE pending product/security decision` | Legal work-product/privacy model before schema design | `LEGAL-ANALYSES-1 privacy/product decision` |
| Client house style | `NEEDS PRODUCT DECISION`; `BRING-FORWARD candidate` | absent | `BRING-FORWARD candidate`; `QUARANTINE pending product/security decision` | Product decision first; no write enablement relying on absent table | `CLIENT-HOUSE-STYLE-1 product decision docs-only` |
| Clause library / contract assembly | `NEEDS PRODUCT DECISION`; `BRING-FORWARD candidate`; `SECURITY/PRIVACY BLOCKED` | absent | `BRING-FORWARD candidate`; `QUARANTINE pending product/security decision` | Clause governance, ownership/versioning, storage/audit model | `CLAUSE-LIBRARY-1 governance decision docs-only` |
| Timesheet reports / artifacts / presets | `NEEDS PRODUCT DECISION`; `BRING-FORWARD candidate` | absent | `BRING-FORWARD candidate`; `QUARANTINE pending product/security decision` | Reporting/privacy scope; no persistence enablement relying on absent tables | `TIMESHEET-REPORTS-1 product/privacy decision` |
| Review persistence | `SECURITY/PRIVACY BLOCKED`; `BRING-FORWARD candidate` | absent | `BRING-FORWARD candidate`; `SECURITY/PRIVACY BLOCKED` | Review-suggestion privacy model and route contract before schema design | `REVIEW-PERSISTENCE-1 privacy decision docs-only` |
| DB-only rollback | `REMOVE candidate` | not applicable / historical | `REMOVE candidate` | Human decision to archive/exclude historical rolled-back migration | `DB-ONLY-ROLLBACK-1 human decision note` |
| CP-SCHEMA-1 | `SECURITY/PRIVACY BLOCKED`; `QUARANTINE` | absent | `CP-SCHEMA-1 BLOCKER` | Not before enum drift, present-partial tables, absent future tables, privacy boundaries, and product decisions are resolved | No CP implementation package yet |

## Immediate blockers confirmed by production metadata

- `GenerationStatus` enum drift is confirmed: production lacks Prisma `APPROVED` / `REJECTED`.
- `anonymous_documents` is present-partial and missing sensitive Prisma-declared anonymization/rehydration fields.
- `contract_generations` is present-partial and missing comparison/sharepoint/revision-lineage fields.
- CP-SCHEMA-1 tables and enums are absent.
- Future feature tables are absent for generation drafts, legal analyses, client house style, clause library / assembly, timesheet persistence, and review suggestions.
- Document/privacy-sensitive fields remain blocked even where metadata is present-compatible, especially `documents.workspaceText`.

## Suggested sequencing

1. **GENERATION-STATUS-ENUM-DRIFT-AUDIT-1** — docs/code audit only; find runtime references to `APPROVED` / `REJECTED`; no schema change.
2. **PRESENT-COMPATIBLE-KEEP-CANDIDATES-AUDIT-1** — review case collaborators, workload tracking, client fields, `cases.clientRole`, `clients.color`, and `documents.workspaceText` for runtime/authorization/privacy safety; no schema change.
3. **PRESENT-PARTIAL-RECONCILIATION-DESIGN-1** — design only for `anonymous_documents` and `contract_generations`; no migration.
4. **Product decision package for absent future tables** — decide generation drafts, legal analyses, client house style, clause library/assembly, timesheet reports, and review persistence before migration design.
5. **Security/privacy model packages** — resolve document/AI, anonymization, rehydration, contracts, workspace text, and client-visible boundaries before enablement or bring-forward.
6. **Migration design only after product/security decisions** — split by feature family, docs-only first, then clone-proofed migration candidates.
7. **CP-SCHEMA-1 last** — resume only after enum drift, present-partial tables, absent future tables, privacy boundaries, and product decisions are resolved.

## Non-actions

- No schema changed.
- No migration was created, edited, applied, resolved, moved, or deleted.
- No DB connection was used in this rollup task.
- No DB apply was performed.
- No Azure deployment or Azure configuration change occurred.
- No runtime behavior changed.
- No route behavior changed.
- No OpenAPI or CORS behavior changed.
- No frontend changed.
- No tests changed.
- No production smoke, AI/provider call, SharePoint call, or file-processing job was run.

## Recommended next prompt

`Adminiculum — GENERATION-STATUS-ENUM-DRIFT-AUDIT-1`

That next task should be docs/code-audit-only: find runtime references to `GenerationStatus.APPROVED` / `GenerationStatus.REJECTED`, determine whether repo enum or future production enum should change, and avoid schema changes, DB connections, migrations, deploys, and CP-SCHEMA-1.

## Final classification

`production_schema_compare_rolled_into_drift_triage_no_db_change_no_runtime_change`
