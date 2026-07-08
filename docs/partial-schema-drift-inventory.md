# Partial Schema Drift Inventory

## Purpose

This inventory records partial schema drift and code-compatibility leftovers that must not be silently treated as production-compatible baseline objects.

It is documentation-only evidence for later human decisions. It does not authorize production DB apply, Prisma migration replay, `prisma migrate resolve`, schema cleanup, runtime deletion, route enablement, Client Portal enablement, or Azure changes.

## Global status

| Area | Status |
| --- | --- |
| Production apply | `BLOCKED` |
| CP-SCHEMA-1 | `BLOCKED` |
| DB apply | Not performed |
| DB connection | Not used |
| Azure touched | No |
| Runtime change | No |
| Schema change | No |
| Migration change | No |

## Evidence sources

- `Backend/prisma/schema.prisma`
- `Backend/src/index.ts`
- `Backend/src/modules/cases/routes.ts`
- `Backend/src/modules/anonymize/routes.ts`
- `Backend/src/modules/anonymize/services.ts`
- `Backend/src/modules/contracts/routes.ts`
- `Backend/src/modules/contracts/services.ts`
- `Backend/src/modules/generation-draft/routes.ts`
- `Backend/src/modules/legal-analyses/routes.ts`
- `Backend/src/modules/clients/routes.ts`
- `Backend/src/modules/clause-library/routes.ts`
- `Backend/src/modules/timesheet-reports/routes.ts`
- `Backend/src/openapi/publicSpec.ts`
- `Backend/tests/routeFeatureGuards.test.ts`
- `Backend/tests/contractsBoundary.test.ts`
- `Backend/tests/documentAiBoundary.test.ts`
- `docs/production-compatible-baseline-human-decisions.md`
- `docs/production-schema-snapshot-comparison-results.md`
- `docs/production-compatible-schema-baseline-proposal.md`
- `docs/production-migration-history-classification-matrix.md`
- `docs/cp-schema-1-fresh-clone-verification-no-go.md`

No production DB, clone DB, Azure resource, provider, file-processing job, or runtime smoke target was used for this inventory.

## Inventory table

| Item / family | Evidence in repo | Apparent type | Current runtime exposure | Current safety status | Why not production baseline yet | Required next decision |
| --- | --- | --- | --- | --- | --- | --- |
| Case collaborators | `Backend/prisma/schema.prisma`; `Backend/src/modules/cases/routes.ts`; `Backend/src/modules/cases/services.ts`; `Backend/src/modules/handoff-packages/authorization.ts`; `Backend/tests/routeFeatureGuards.test.ts` | schema model | active route | needs production schema comparison | Runtime routes read/write `caseCollaborator`, but prior docs classify the historical object check as partial and table/index/FK completeness is not established by this task. | NEEDS PROD-SCHEMA-COMPARE |
| Anonymous document compatibility fields | `Backend/prisma/schema.prisma`; `Backend/src/modules/anonymize/routes.ts`; `Backend/src/modules/anonymize/services.ts`; `Backend/tests/documentAiBoundary.test.ts` | schema model | guarded/quarantined route | hardened and still QUARANTINE | Anonymization persistence may contain privileged/personal data; prior docs record partial `anonymous_documents` evidence and field/index uncertainty. Current hardening does not prove production physical schema compatibility. | QUARANTINE |
| Rehydration / reidentification fields | `Backend/prisma/schema.prisma`; `Backend/src/modules/anonymize/routes.ts`; `Backend/src/modules/anonymize/services.ts`; `docs/production-schema-snapshot-comparison-results.md` | schema field | guarded/quarantined route | hardened and still QUARANTINE | `aiResponseText`, `rehydratedContent`, `rehydrationStatus`, `rehydrationWarnings`, and `rehydratedAt` support sensitive reidentification flow and require privacy/threat-model approval plus column-level production proof. | QUARANTINE |
| Contract generation field drift | `Backend/prisma/schema.prisma`; `Backend/src/modules/contracts/routes.ts`; `Backend/src/modules/contracts/services.ts`; `Backend/tests/contractsBoundary.test.ts`; `docs/production-schema-snapshot-comparison-results.md` | schema field | guarded/quarantined route | hardened and still QUARANTINE | Contract generation is not read-only and includes template/generation/storage/SharePoint side effects; prior docs record missing or drifted `contract_generations` fields such as snapshot and revision/storage metadata. | QUARANTINE |
| `GenerationStatus` enum drift | `Backend/prisma/schema.prisma`; `Backend/src/modules/contracts/services.ts`; `Backend/src/modules/legal-analyses/service.ts`; `docs/production-schema-snapshot-comparison-results.md` | enum value | guarded/quarantined route | needs production schema comparison | Prior docs record DB enum drift around values such as `APPROVED` and `REJECTED`; enum drift can break writes if runtime reaches the value before additive proof/remediation. | NEEDS PROD-SCHEMA-COMPARE |
| Generation drafts | `Backend/prisma/schema.prisma`; `Backend/src/index.ts`; `Backend/src/modules/generation-draft/routes.ts`; `Backend/src/modules/generation-draft/service.ts`; `docs/production-migration-history-classification-matrix.md` | route/module | guarded/quarantined route | QUARANTINE, not yet hardened | Routes are feature-flagged by `ENABLE_GENERATION_DRAFT`; prior docs classify `generation_drafts` as not eligible for blind baseline replay and not proven production-compatible. | QUARANTINE |
| Legal analyses | `Backend/prisma/schema.prisma`; `Backend/src/index.ts`; `Backend/src/modules/legal-analyses/routes.ts`; `Backend/src/modules/legal-analyses/service.ts`; `Backend/tests/documentAiBoundary.test.ts` | route/module | guarded/quarantined route | hardened and still QUARANTINE | Legal-analysis persistence stores lawyer work product and potentially privileged text; route hardening requires both legal-analysis and document-AI privacy-model gates, but production schema and privacy approval remain unproven. | QUARANTINE |
| Comparison snapshot | `Backend/prisma/schema.prisma`; `Backend/src/modules/contracts/services.ts`; `docs/production-compatible-schema-baseline-proposal.md`; `docs/production-schema-snapshot-comparison-results.md` | schema field | guarded/quarantined route | needs production schema comparison | `contract_generations.comparisonSnapshot` is runtime-referenced by contract comparison/edit logic, but prior docs record it as a missing/drift field requiring additive proof before any bring-forward. | NEEDS PROD-SCHEMA-COMPARE |
| Client house style | `Backend/prisma/schema.prisma`; `Backend/src/modules/clients/routes.ts`; `Backend/tests/routeFeatureGuards.test.ts`; `docs/production-migration-history-classification-matrix.md` | route/module | guarded/quarantined route | QUARANTINE, not yet hardened | Reads degrade to `null` when disabled and writes require `ENABLE_CLIENT_HOUSE_STYLE`; table/header-field production shape is not proven and style data has client-specific privacy/storage implications. | QUARANTINE |
| Clause library | `Backend/prisma/schema.prisma`; `Backend/src/index.ts`; `Backend/src/modules/clause-library/routes.ts`; `Backend/src/modules/clause-library/service.ts`; `Backend/tests/routeFeatureGuards.test.ts`; `Backend/src/openapi/publicSpec.ts` | route/module | guarded/quarantined route | QUARANTINE, not yet hardened | Clause CRUD is DB-backed and excluded from public OpenAPI metadata sanitization; schema objects and product governance are not proven production-compatible. | QUARANTINE |
| Contract assembly | `Backend/prisma/schema.prisma`; `Backend/src/modules/clause-library/routes.ts`; `Backend/src/modules/clause-library/service.ts`; `Backend/src/modules/contracts/services.ts` | route/module | guarded/quarantined route | QUARANTINE, not yet hardened | Assembly drafts depend on clause-library foundation and can feed generation; it should not be brought forward independently of clause governance, storage, and generation side-effect decisions. | QUARANTINE |
| Timesheet reports / artifacts / presets | `Backend/prisma/schema.prisma`; `Backend/src/index.ts`; `Backend/src/modules/timesheet-reports/routes.ts`; `Backend/src/modules/timesheet-reports/service.ts`; `Backend/tests/routeFeatureGuards.test.ts`; `Backend/src/openapi/publicSpec.ts` | route/module | guarded/quarantined route | QUARANTINE, not yet hardened | Some template/resolve/read helpers are exposed while persistence writes require `ENABLE_TIMESHEET_REPORT_PERSISTENCE`; report tables and privacy/reporting scope are not production-proven. | QUARANTINE |
| Workload tracking | `Backend/prisma/schema.prisma`; `docs/production-compatible-baseline-human-decisions.md`; `docs/production-migration-history-classification-matrix.md` | schema model | unknown | UNKNOWN | Migration history contains rolled-back and later finished rows; this task did not compare physical production objects or decide whether workload tracking is active product baseline. | NEEDS PROD-SCHEMA-COMPARE |
| Client identity fields | `Backend/prisma/schema.prisma`; `docs/production-compatible-baseline-human-decisions.md`; `docs/production-schema-feature-family-reconciliation-decision-memo.md` | schema field | unknown | UNKNOWN | Historical migration notes include identity/backfill assumptions; client identity fields need product/legal decision and production physical proof before baseline inclusion. | NEEDS PROD-SCHEMA-COMPARE |
| Case client role | `Backend/prisma/schema.prisma`; `Backend/src/modules/anonymize/services.ts`; `docs/production-compatible-baseline-human-decisions.md` | schema field | active route | UNKNOWN | `Case.clientRole` is referenced by anonymization redaction logic, but production physical presence and product semantics are not established here. | NEEDS PROD-SCHEMA-COMPARE |
| Client color | `Backend/prisma/schema.prisma`; `docs/production-compatible-baseline-human-decisions.md`; `docs/production-schema-feature-family-reconciliation-decision-memo.md` | schema field | unknown | UNKNOWN | Prior docs treat it as requiring final parser-independent proof; this inventory does not connect to production and cannot classify it as active baseline. | NEEDS PROD-SCHEMA-COMPARE |
| Workspace text | `Backend/prisma/schema.prisma`; `Backend/src/modules/documents/routes.ts`; `docs/client-portal-publication-payload-validator-design.md`; `docs/production-compatible-baseline-human-decisions.md` | schema field | guarded/quarantined route | UNKNOWN | `Document.workspaceText` may contain privileged legal drafting content and is explicitly forbidden in client-visible payload designs; physical column proof and privacy/storage decision are required. | NEEDS PROD-SCHEMA-COMPARE |
| Document review suggestions / review persistence | `Backend/prisma/schema.prisma`; `Backend/src/modules/documents/reviewSuggestions.service.ts`; `Backend/tests/documentReviewSuggestions.service.test.ts`; `Backend/tests/documentAiBoundary.test.ts` | service | guarded/quarantined route | hardened and still QUARANTINE | Review suggestions can contain legal work product and are covered by document-AI privacy boundary hardening; production schema and privacy-safe persistence rules remain unresolved. | QUARANTINE |
| DB-only rolled-back kb/learning/escalation migration | `docs/production-migration-history-classification-matrix.md`; `docs/production-compatible-baseline-human-decisions.md`; `docs/production-schema-snapshot-comparison-results.md` | documentation-only | no direct route found | likely dead/stale | Prior docs describe a DB-recorded rolled-back migration missing locally, with no active objects found in object checks; it still needs explicit human decision before removal or archival. | REMOVE |
| CP-SCHEMA-1 / Client Portal foundation | `Backend/prisma/schema.prisma`; `Backend/prisma/migrations/20260702140000_add_client_portal_foundation/migration.sql`; `docs/cp-schema-1-fresh-clone-verification-no-go.md`; `docs/production-compatible-baseline-human-decisions.md` | schema model | schema-only | QUARANTINE, not yet hardened | CP-SCHEMA-1 is future work and remains blocked until production-compatible baseline/migration-history remediation is resolved; no Client Portal runtime enablement is authorized. | QUARANTINE |

## Cross-cutting blockers

- Production physical schema comparison is required before any item can move from `UNKNOWN` or `NEEDS PROD-SCHEMA-COMPARE` to `KEEP`, `REMOVE`, or `BRING-FORWARD`.
- Runtime usage review is required where active routes reference partial or drift-prone schema objects.
- OpenAPI exposure review is required where a family is or was represented in API metadata, even if public metadata is now sanitized.
- Privacy/security review is required where personal data, privileged legal text, AI output, rehydration, client-visible data, reporting data, or generated documents may be involved.
- Migration strategy is required before any `BRING-FORWARD`; historical migration replay is not assumed safe.
- Targeted tests are required before any `KEEP` or `KEEP-BUT-HARDEN` decision that changes runtime/schema behavior.

## Non-actions

- No schema was changed.
- No migration was created, edited, applied, resolved, moved, or deleted.
- No DB connection was used.
- No DB apply was performed.
- No Azure resource was touched.
- No runtime behavior changed.
- No route, OpenAPI, CORS, auth, frontend, package, test, provider, SharePoint, AI, or file-processing behavior changed.

## Recommended next prompt

`Adminiculum — partial schema drift production physical comparison plan docs-only`

That prompt should remain planning-first and should not connect to production directly. Any future physical comparison should use a fresh production-like clone, SELECT-only metadata, sanitized output, and no runtime/app pointing to the clone.

## Final classification

`partial_schema_drift_inventory_documented_no_db_change_no_runtime_change`
