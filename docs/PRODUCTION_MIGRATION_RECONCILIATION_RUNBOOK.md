# Database Migration Reconciliation

This document records Adminiculum migration-history and schema reconciliation.
It does not authorize or perform database migration, schema deployment, backend
persistence, or route enablement.

## Authoritative Evidence Correction (RC1D)

The earlier BP2 conclusion that production contained the handoff package table,
clause/assembly enum families, and related newer foundations is superseded.

The authoritative production-schema evidence is the read-only catalog inventory
from the verified PITR clone:

- server: `adminiculum-bp3-rc1b-clone`;
- database: `adminiculum`;
- source server/database: `adminiculum`;
- restore point requested: `2026-06-21T10:58:16Z`;
- clone created: `2026-06-21T11:00:35Z`;
- purpose tag: `RC1B-migration-diff`;
- disposable tag: `true`.

The clone identity was verified as non-production and the connection selected
the application database rather than the default `postgres` database.

The authoritative clone evidence shows:

- `lawyer_handoff_packages` is absent;
- `document_review_suggestions` is absent;
- clause library, contract assembly, legal analysis, communication, review,
  house-style, generation-draft, and timesheet-report persistence foundations
  represented by the current local Prisma schema are absent;
- the local Prisma schema contains 17 tables absent from the clone;
- the clone contains six automation tables absent from the local Prisma schema;
- shared tables contain bidirectional field, foreign-key, and index drift.

The corrected blocker is:

`blocked_by_unmanaged_schema_drift_and_missing_persistence_foundations`

The current local Prisma schema must not be treated as production truth. BP3 and
RC1C must not proceed until broad reconciliation is complete.

## Historical Baseline

The production `_prisma_migrations` history contains:

`20260211153100_baseline`

The matching historical artifact has been restored at:

`Backend/prisma/migrations/20260211153100_baseline/migration.sql`

Evidence:

- File length: 284 bytes
- SHA-256:
  `5ed4f7d9db1fda4ec3ece38c5d26439790771aa28dffc1a4e96164a22ce679d2`
- The checksum matches the production migration-history evidence recorded
  during BP2.
- Multiple independent archived and deployment-staging copies were found with
  identical bytes and checksum.
- The migration is an intentional no-op ending in `SELECT 1`.

The baseline is already considered applied in the database. It is restored
only so the local migration chain contains the historical artifact represented
in migration history. It must not be recreated from the current schema,
modified, reapplied, resolved, or used to infer the original database schema.

The historical `add_contract_tables.sql` file found beside some archived copies
is not the checksummed Prisma `migration.sql`. It is not restored into the
active migration folder by RC1A.

## Superseded Review-Suggestion Migration

The following migration was local-only and was never applied to production:

`20260610214500_add_document_review_suggestions`

It has been removed from Prisma's active `Backend/prisma/migrations` chain.
Its original SQL intent is preserved for audit/reference at:

`docs/migration-reconciliation/20260610214500_add_document_review_suggestions.superseded.sql`

That archived SQL is:

- superseded;
- local-only;
- never applied to production;
- non-operational documentation;
- not a migration to execute;
- not a migration name to reuse.

Its intended objects were:

- `DocumentReviewWorkspaceSource`;
- `DocumentReviewSuggestionType`;
- `DocumentReviewSuggestionStatus`;
- `document_review_suggestions`;
- related indexes and foreign keys.

BP3A may replace this artifact with a new timestamped, reviewed forward
migration only after RC2A clone-schema preservation, RC2B route guarding, and
the relevant RC2C foundation decisions are complete.

## Corrected Enum Evidence

The clone confirms these production enum values:

- `WorkType.OTHER`;
- `TimelineEventType.CUSTOM`;
- the existing `TaskStatus`, `CaseStatus`, `UserRole`, and `NotificationType`
  values represented in the clone inventory.

The following types and values are local feature intent, not verified production
objects:

- `ClauseKind`, including `SPECIAL`;
- `RepresentedSide`, including `NEUTRAL`;
- `ClauseCategory`, including `SPECIAL`;
- `AssemblyStatus`, including `GENERATED`;
- handoff package enums;
- review-suggestion enums;
- reporting, communication, legal-analysis, and contract-review enums.

Future reconciliation must preserve clone-only enum types and values before
adding any local-only enum family. Any generated SQL proposing enum replacement,
enum-value removal, or destructive recreation remains a no-go.

## Authoritative Schema Drift Matrix

### Local-only tables

| Tables | Classification | Required handling |
| --- | --- | --- |
| `document_review_suggestions` | Future feature foundation; route risk | BP3A only after RC2; keep routes disabled or guarded |
| `lawyer_handoff_packages` | Already-exposed future foundation; route risk | Separate RC2C migration decision; do not bundle into BP3A |
| `clause_library_items`, `lawyer_profiles`, `lawyer_preferred_clauses`, `contract_assembly_drafts`, `contract_assembly_clauses` | Already-exposed feature foundation; high route risk | Reconcile as a separate clause/assembly migration set if product scope remains approved |
| `legal_analyses` | Already-exposed feature foundation; high route risk | Separate migration or explicit feature guard |
| `communications`, `communication_attachments` | Live workflow dependency; high route risk | Deeper audit required before migration because dashboard and case/client surfaces call it |
| `client_house_style_profiles` | Live client workflow dependency; high route risk | Separate migration or immediate 501/empty-state guard |
| `generation_drafts` | Future foundation; currently feature-flagged | Leave disabled until a separate migration is approved |
| `contract_review_records`, `block_review_notes` | Review workflow foundation; high route risk | Separate migration; guard mounted review-note routes |
| `timesheet_report_instances`, `timesheet_report_artifacts`, `timesheet_presets` | Mixed static/runtime reporting foundation | Preserve stateless generation; guard persistence writes; migrate separately if retained |

### Clone-only tables

| Tables | Classification | Required handling |
| --- | --- | --- |
| `automation_execution_logs`, `automation_execution_step_logs` | Must preserve clone first | Add faithful local models or documented preservation SQL before any broad diff |
| `automation_suggestions`, `automation_trigger_events` | Must preserve clone first | Audit columns, constraints, data volume, and backend ownership |
| `user_automation_preferences`, `user_automation_suppressions` | Must preserve clone first | Preserve tables, FKs, indexes, and enum dependencies |

These six tables must never be dropped merely because they are absent from the
current local Prisma schema.

### Shared-table field drift

| Table | Clone-only fields | Local-only fields | Classification |
| --- | --- | --- | --- |
| `documents` | `currentVersionInt` | none | Must preserve clone first |
| `tasks` | `stuckReason`, `maturityStage`, `complexityScore`, `riskScore`, `lastProgressAt`, `stuckSince` | `sourceCommunicationId` | Bidirectional drift; preserve clone fields before considering communication linkage |
| `anonymous_documents` | none | `redactedItems`, `aiTask`, `customPrompt`, `aiResponseText`, `rehydratedContent`, `rehydrationStatus`, `rehydrationWarnings`, `rehydratedAt` | Sensitive workflow drift; separate anonymization audit required |
| `contract_generations` | none | `comparisonSnapshot`, SharePoint revision fields, revision lineage/status fields | Sensitive generation drift; separate contract-generation audit required |

### Enum drift

| Direction | Types | Classification |
| --- | --- | --- |
| Local-only | reporting, review-suggestion, legal-analysis, communication, contract-review, clause/assembly, and handoff enum families | Future foundations; each requires its owning migration |
| Clone-only | ten automation enums plus `TaskMaturityStage` and `TaskStuckReason` | Must preserve clone first |
| Shared type value drift | local `GenerationStatus.APPROVED` and `GenerationStatus.REJECTED` are absent from clone | Separate additive review required; do not infer production support |

### Foreign-key and index drift

The clone contains relations not represented locally:

- `anonymous_documents.sourceDocId` foreign key;
- `timeline_events.documentId` foreign key;
- `timeline_events.timeEntryId` foreign key;
- `comments.documentId` foreign key;
- task maturity/risk indexes;
- clone automation table constraints and indexes.

The local schema expects `tasks.sourceCommunicationId`, its communication
relation, and indexes/constraints for local-only foundations that do not exist
in the clone.

All clone-only constraints and indexes are classified as **must preserve clone
first**. Renaming or dropping them is not acceptable incidental migration work.

## Mounted Route Risk Matrix

| Module / route family | Mounted | Frontend usage | Missing clone dependency | Current behavior | Risk | Recommended guard |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/v1/clause-library/*` | Yes | Yes; sidebar and clause-library page | Clause, lawyer-profile, and assembly tables/enums | Direct Prisma calls fail when invoked | High | Feature flag disabled or return 501 until separate RC2C migration |
| `/api/v1/documents/:documentId/review-suggestions/*` | Yes | API client exists; future compare integration risk | `document_review_suggestions` and three enums | Direct Prisma calls return 500 | High | Return 501 feature unavailable until BP3A migration |
| `/api/v1/cases/:caseId/handoff-packages` and `/api/v1/handoff-packages/*` | Yes | Yes; case documents and handoff pages | Handoff table and enums; optional legal-analysis/review dependencies | Lists degrade to empty; reads look like 404; writes return feature unavailable | Medium | Keep explicit unavailable behavior; hide or label frontend persistence controls |
| `/api/v1/communications/*` | Yes | Yes; dashboard, case, client, review, deadlines, and tasks | Communications and attachment tables | List endpoint degrades to an empty list; detail and writes can return 500 | High | Preserve demo-safe empty reads; return 501 for unsupported detail/write actions |
| `/api/v1/documents/:documentId/legal-analyses` and `/api/v1/legal-analyses/*` | Yes | Yes; legal-analysis intake panel and handoff resolution | Legal-analysis table and enums | Direct Prisma calls return 500 | High | Feature flag disabled or return 501 |
| `/api/v1/clients/:clientId/house-style` | Yes | Yes; client detail and case house-style context | `client_house_style_profiles` | GET and PUT return 500 when called | High | GET should return explicit unavailable/empty state; PUT should return 501 |
| `/api/v1/generation-drafts/*` | Yes | API client exists | `generation_drafts` | Guarded by `ENABLE_GENERATION_DRAFT`; returns 501 when disabled | Low while disabled | Leave feature flag disabled |
| `/api/v1/contracts/:generationId/review-notes` | Yes | Yes; document comparison loads review notes and exposes save code | Contract review and block-note tables/enums | Direct Prisma calls return 500; frontend load currently catches failure | High | Return 501 or a truthful unavailable response; prevent save UI when unavailable |
| `/api/v1/timesheet-reports/*` | Yes | Yes; time entries and presets pages | Preset, instance, and artifact tables/enums | Templates and stateless rendering work; reads fall back; persistence writes fail with controlled errors | Medium | Keep stateless features; explicitly disable persistence controls |
| `/api/v1/contracts/*` clause/assembly-assisted paths | Yes | Yes | Generation drafts, assemblies, lawyer profiles, clauses, and local-only revision fields | Core paths may work, but optional advanced branches can fail | High | Audit endpoint-by-endpoint; guard optional persistence branches |
| `/api/v1` legal handoff composition | Yes | Yes | Handoff plus legal-analysis/review-note foundations | Partial graceful degradation, but dependency resolution is inconsistent | Medium | Keep dormant for demo; implement only after separate foundations |

### Runtime safety assessment

An immediate backend safety patch is recommended before enabling or promoting
any of these features. RC2B should be narrowly limited to predictable guards
and truthful `501 FEATURE_UNAVAILABLE` responses; it should not include a
database migration.

Live frontend surfaces are likely to call absent-table endpoints:

- client detail calls house-style and communications endpoints;
- dashboard and case pages call communications;
- document comparison calls review-note endpoints;
- case document and handoff pages call legal-analysis and handoff endpoints;
- `/time-entries` calls timesheet-report endpoints;
- `/clause-library` directly calls clause/assembly endpoints.

The current short internal demo can remain safe without immediate database work
if it stays on the previously rehearsed dashboard/case/document-comparison path,
avoids persistence actions, tolerates existing caught empty/error states, and
does not open clause library, legal-analysis saving, handoff writes, review-note
saving, timesheet-report persistence, or house-style editing.

That demo safety is operational containment, not evidence that the mounted
backend routes are production-safe.

## Forbidden Commands and Actions

Until a separately approved reconciliation and deployment window:

- do not run `prisma migrate deploy`;
- do not run `prisma migrate reset`;
- do not run `prisma db push`;
- do not run `prisma migrate resolve`;
- do not edit `_prisma_migrations`;
- do not mark migrations as applied;
- do not generate migrations against production;
- do not apply archived SQL;
- do not deploy database or backend changes;
- do not enable document-review persistence routes;
- do not implement `DocumentReviewSession` before BP3B.

## Revised Phase Plan

### RC2A — Preserve clone-only schema locally

RC2A starts as documentation and audit, not automatic schema correction.

- model or otherwise preserve all six automation tables;
- preserve their enum families, foreign keys, indexes, and data semantics;
- preserve task maturity/risk fields and indexes;
- preserve `documents.currentVersionInt`;
- preserve clone-only foreign keys;
- audit clone-only data volume and ownership;
- audit anonymization and contract-generation field drift separately;
- produce a reviewed canonical schema proposal before editing Prisma.

Only after that audit is approved should RC2A become an actual schema correction
pass.

### RC2B — Guard mounted routes backed by absent tables

- add no migration;
- prevent predictable runtime 500 responses;
- return truthful `501 FEATURE_UNAVAILABLE` responses for unsupported writes;
- retain safe empty reads only where the UI explicitly presents an unavailable
  or empty state without implying persistence;
- keep `ENABLE_GENERATION_DRAFT` disabled;
- disable persistence controls in affected frontend surfaces where needed;
- do not claim that persistence exists.

RC2B is the recommended next task.

### RC2C — Reconcile already-exposed foundations

RC2C must be split by bounded feature ownership:

1. handoff package foundation;
2. clause library and contract assembly foundation;
3. communications and attachment foundation;
4. legal-analysis foundation;
5. client house-style foundation;
6. contract review notes foundation;
7. timesheet-report persistence foundation.

Each foundation requires an independently reviewed additive migration against
the reconciled clone-preserving schema. Handoff packages must not be bundled
into review-suggestion persistence merely because the UI connects them.

### BP3A — Review suggestion foundation

- create a new timestamped migration;
- add only review-suggestion enums, table, indexes, and foreign keys;
- add explicit feature availability and permission checks;
- test on the retained clone;
- do not create `DocumentReviewSession`.

### BP3B — DocumentReviewSession foundation

- design and migrate session ownership separately;
- add resource-aware authorization;
- keep document content and generated Word files outside session rows;
- use `TimelineEvent.eventType = CUSTOM` with string event types.

### BP4 — Frontend integration

- connect `/documents/compare` only after BP3A/B approval;
- preserve explicit save behavior;
- preserve the local-only fallback until server persistence is verified;
- keep the no-Word-track-changes limitation explicit.

## RC1A Completion Boundary

RC1A is complete when:

- the exact baseline artifact is present locally;
- the local-only review migration is absent from the active Prisma chain;
- its intent remains preserved outside that chain;
- authoritative clone enum and schema evidence is recorded separately from local
  feature intent;
- non-mutating validation succeeds;
- no migration, database write, commit, or deploy has occurred.

## RC1D Completion Boundary

RC1D is documentation and planning only. It is complete when:

- BP2 conclusions are explicitly superseded by BP2R2 clone evidence;
- local-only and clone-only schema objects are classified;
- mounted route risks are documented;
- RC2A, RC2B, RC2C, BP3A, BP3B, and BP4 are separated;
- RC2B is identified as the immediate safety task;
- no migration is generated or applied;
- no database or Azure resource is mutated;
- BP3 implementation has not started.
