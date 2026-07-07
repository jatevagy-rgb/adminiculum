# Production Schema Snapshot Comparison Results

Classification target: `production_schema_snapshot_comparison_results_documented_no_db_change_no_runtime_change`

This document records the operator-run fresh clone schema snapshot and local Prisma-schema comparison. It is evidence documentation only: no database was connected to by this documentation step, no Azure action was performed by this documentation step, no Prisma migration command was run, no schema or migration file was edited, no runtime was changed, and Client Portal remains disabled.

## 1. Executive summary

A fresh PITR clone named `adminiculum-schema-snapshot-20260703` was created from current production, queried for SELECT-only schema metadata, and deleted. Production was not touched and App Service was not pointed at the clone.

The local snapshot artifacts were available and were compared against `Backend/prisma/schema.prisma`. The comparison confirms that production's physical schema is materially smaller than the current Prisma schema and that Prisma migration history remains divergent. CP-SCHEMA-1 remains blocked, and production apply remains blocked.

High-level comparison:

- Actual DB snapshot: 31 public tables, 394 columns, 34 enum types, 202 enum values, 74 indexes, 79 constraints, 7 migration rows.
- Current Prisma schema: 51 mapped models and 67 enums by local parser.
- Prisma mapped tables absent from actual DB: 21.
- Actual DB tables absent from Prisma schema: `_prisma_migrations` only, expected.
- Prisma scalar/model columns absent from actual DB on existing mapped tables: 17.
- Prisma enum types absent from actual DB: 33.
- Migration rows in DB: 7; local migrations not finished in DB: 16.

## 2. Operator-run scope and safety confirmation

Operator snapshot facts:

- Clone created: yes — `adminiculum-schema-snapshot-20260703`.
- Clone deleted: yes — final Azure PostgreSQL list showed only `adminiculum`.
- Production touched: no.
- App Service touched: no.
- DB connection used: clone only.
- SQL type: SELECT-only snapshot; temporary read-only role setup used clone-only DDL.
- Read-only user used: yes — `schema_snapshot_ro`.
- Secrets printed: no.
- Runtime/schema/migration/repo changes during operator run: no.

This documentation step did not connect to any DB and did not touch Azure.

## 3. Clone lifecycle

- Clone name: `adminiculum-schema-snapshot-20260703`.
- Source server: `adminiculum`.
- Database: `adminiculum`.
- Resource group: `Adminiculum-RG`.
- Clone state during snapshot: ready.
- Cleanup: clone deleted after snapshot.
- Final observed Azure PostgreSQL server list: only `adminiculum` remained.

Operational note: the initial restore command using `--location` failed before clone creation because the installed Azure CLI restore command did not support that argument. Restore was retried successfully with the supported syntax.

## 4. Snapshot method

Prepared script:

`docs/sql/production-schema-snapshot-readonly.sql`

Execution method:

- `psql` was unavailable locally.
- The SELECT-only SQL script was executed through the existing Backend `pg` dependency.
- Node emitted an SSL-mode warning only; the snapshot succeeded.
- The read-only role executed only the SELECT metadata statements from the prepared script.

Local snapshot artifacts read for this report:

- `C:\Users\hubay\AppData\Local\Temp\adminiculum-schema-snapshot-20260703.json`
- `C:\Users\hubay\AppData\Local\Temp\adminiculum-schema-snapshot-20260703-summary.json`
- `C:\Users\hubay\AppData\Local\Temp\adminiculum-schema-snapshot-20260703-comparison.json` (local derived comparison, not committed)

Raw snapshot JSON was not committed.

## 5. Snapshot summary counts

| Metric | Count |
| --- | ---: |
| Public tables | 31 |
| Public columns | 394 |
| Enum values | 202 |
| Indexes | 74 |
| PG constraints | 79 |
| Sequences | 0 |
| `_prisma_migrations` rows | 7 |
| CP objects present | 0 |

Local comparison parser counts:

| Metric | Count |
| --- | ---: |
| Prisma mapped models | 51 |
| Prisma scalar/model columns parsed | 669 |
| Prisma enums parsed | 67 |
| Prisma mapped tables absent from DB | 21 |
| DB tables absent from Prisma | 1 (`_prisma_migrations`) |
| Prisma columns absent from DB on existing tables | 17 |
| Prisma enum types absent from DB | 33 |
| Enum value diffs | 1 |

Caveat: the local Prisma comparison is a schema-text/parser comparison, not a Prisma introspection command. It is reliable for broad table/column/enum absence signals, but index/FK and some enum-column mapping should be reviewed with a future robust diff before implementation.

## 6. Migration metadata findings

Finished migration rows in DB:

- `20260211153100_baseline`
- `20260622150000_add_lawyer_handoff_packages_foundation`
- `20260628190000_add_communication_baseline`
- `20260701120000_add_outlook_communication_provider_fields`

Rolled-back rows in DB:

- one `20260212180000_add_workload_tracking` row
- `20260302142000_add_kb_learning_escalation`

Additional migration-history observations:

- A later finished `20260212180000_add_workload_tracking` row also exists.
- `20260302142000_add_kb_learning_escalation` is recorded in DB but has no local migration folder.
- 16 local migration folders are not finished in DB.

Local migrations not finished in DB:

- `20260330120000_add_generation_drafts`
- `20260331090100_add_anonymous_documents`
- `20260331100000_add_rehydration_fields`
- `20260402131500_add_client_identity_fields`
- `20260405183100_add_case_client_role`
- `20260406120000_add_client_color`
- `20260408140000_add_case_collaborators`
- `20260416175000_add_comparison_snapshot_foundation`
- `20260417100000_add_timesheet_report_instances`
- `20260417113000_add_timesheet_report_artifacts`
- `20260417123000_add_timesheet_presets`
- `20260514201500_add_legal_analyses`
- `20260517175500_add_client_house_style_profile`
- `20260517191600_add_client_house_style_header_fields`
- `20260518120000_add_workspace_text`
- `20260702140000_add_client_portal_foundation`

## 7. CP object absence result

No CP-SCHEMA-1 objects were present in the clone snapshot.

Absent CP table family:

- `client_portal_users`
- `client_portal_memberships`
- `client_visible_artifacts`
- `client_portal_grants`
- `client_submissions`
- `client_submission_attachments`
- `client_portal_audit_events`

This confirms CP-SCHEMA-1 has not been applied to production and remains future work.

## 8. Production and App Service confirmation

- Production DB mutation: no.
- Production App Service change: no.
- App runtime pointed to clone: no.
- Client Portal enabled: no.
- Existing data made client-visible: no.

## 9. Clone deletion confirmation

The clone was deleted after snapshot capture. Final Azure PostgreSQL list showed only:

- `adminiculum`

No schema snapshot clone remained.

## 10. Prisma migration-history divergence status

Divergence remains confirmed.

The DB/fresh clone has a sparse migration history that does not match the local migration chain. Normal `prisma migrate deploy` remains unsafe because it would attempt many historical migrations before CP-SCHEMA-1. Blanket `prisma migrate resolve --applied` remains unsafe because several migration effects are absent or not proven physically present.

## 11. Schema.prisma vs actual DB comparison summary

### Prisma mapped tables absent from actual DB

The comparison found 21 mapped Prisma model tables absent from the actual DB snapshot:

| Prisma model | Mapped table |
| --- | --- |
| `ClientHouseStyleProfile` | `client_house_style_profiles` |
| `TimesheetReportInstance` | `timesheet_report_instances` |
| `TimesheetReportArtifact` | `timesheet_report_artifacts` |
| `TimesheetPreset` | `timesheet_presets` |
| `DocumentReviewSuggestion` | `document_review_suggestions` |
| `LegalAnalysis` | `legal_analyses` |
| `GenerationDraft` | `generation_drafts` |
| `ContractReviewRecord` | `contract_review_records` |
| `BlockReviewNote` | `block_review_notes` |
| `ClauseLibraryItem` | `clause_library_items` |
| `LawyerProfile` | `lawyer_profiles` |
| `LawyerPreferredClause` | `lawyer_preferred_clauses` |
| `ContractAssemblyDraft` | `contract_assembly_drafts` |
| `ContractAssemblyClause` | `contract_assembly_clauses` |
| `ClientPortalUser` | `client_portal_users` |
| `ClientPortalMembership` | `client_portal_memberships` |
| `ClientVisibleArtifact` | `client_visible_artifacts` |
| `ClientPortalGrant` | `client_portal_grants` |
| `ClientSubmission` | `client_submissions` |
| `ClientSubmissionAttachment` | `client_submission_attachments` |
| `ClientPortalAuditEvent` | `client_portal_audit_events` |

Interpretation: current `schema.prisma` includes significant future/experimental/non-production schema surface that is not present in production. This is the central baseline/reset concern.

### DB tables absent from Prisma schema

Only `_prisma_migrations` appeared as a DB table absent from Prisma models. This is expected because Prisma does not model its migration metadata table as an application model.

### Prisma model fields whose DB columns are absent

Existing mapped tables with Prisma fields absent from actual DB:

| Table | Missing columns from actual DB |
| --- | --- |
| `anonymous_documents` | `redactedItems`, `aiTask`, `customPrompt`, `aiResponseText`, `rehydratedContent`, `rehydrationStatus`, `rehydrationWarnings`, `rehydratedAt` |
| `contract_generations` | `comparisonSnapshot`, `spItemId`, `spWebUrl`, `isFinalRevision`, `finalizedAt`, `revisionNumber`, `parentRevisionId`, `isCurrentRevision`, `supersededAt` |

Interpretation: anonymization/rehydration and contract-generation revision/comparison fields require human/product decision and a remediation/baseline strategy before any production migration work.

### DB columns absent from Prisma schema

The local parser listed DB columns not represented as parsed Prisma scalar fields. Most are legacy enum/status/category columns on existing tables, including:

- `users.role`, `users.status`
- `matters.matterType`, `matters.status`
- `time_entries.workType`
- automation status/type fields
- `cases.caseType`, `cases.priority`, `cases.status`
- `documents.category`
- task status/type/stuck fields
- notification, template, generation, communication type/source/status fields

Caveat: this bucket is lower confidence because the simple text parser can under-recognize some enum-backed fields or fields represented differently in Prisma. It should be reviewed with a robust Prisma-aware diff before any baseline implementation.

### Enum differences

Prisma enum types absent from actual DB include:

- timesheet report/preset enums;
- document review suggestion/workspace enums;
- legal analysis enums;
- contract review and clause library enums;
- contract assembly enums;
- all CP-SCHEMA-1 enums.

One enum value diff was observed:

- `GenerationStatus` exists in DB but lacks Prisma enum values `APPROVED` and `REJECTED`.

Interpretation: enum drift is significant and must be resolved through baseline decisions, not blind migration.

### Index/constraint/FK differences

The snapshot captured 74 DB indexes and 79 PG constraints. A full expected-index/FK comparison against Prisma schema was not completed in this docs step because the local parser is intentionally lightweight and no Prisma introspection command was run.

This remains a required item for a future robust baseline/reset implementation plan.

## 12. High-risk mismatches found

Highest-risk mismatches:

1. `schema.prisma` contains 21 mapped model tables absent from production.
2. CP-SCHEMA-1 tables and enums are absent, as expected, so CP remains future work.
3. Document review, clause library, contract assembly, legal analysis, timesheet, generation draft, and house-style model families appear in Prisma but are absent from production.
4. Existing production tables lack several Prisma fields on `anonymous_documents` and `contract_generations`.
5. `GenerationStatus` enum values differ (`APPROVED`, `REJECTED` missing in DB).
6. Migration metadata remains sparse/divergent, with 16 local migrations not finished in DB and one DB-only rolled-back migration.

## 13. Baseline/reset implications

Production should be treated as source of truth for the next decision point unless humans explicitly decide to bring production forward for a feature family.

The current Prisma schema cannot be assumed to represent production. A production-compatible baseline/reset plan must decide whether to:

- adjust `schema.prisma` toward actual production;
- bring production forward selectively for production-required features;
- archive/quarantine non-production historical migrations;
- create a new active baseline from actual production schema.

No baseline implementation should proceed until these choices are made.

## 14. CP-SCHEMA-1 implications

CP-SCHEMA-1 remains blocked.

Reasons:

- CP tables/enums are absent from production, which is expected;
- CP migration is still behind unresolved historical migrations in the active repo chain;
- production schema and `schema.prisma` are not aligned;
- normal `migrate deploy` would not safely isolate CP-SCHEMA-1;
- Client Portal runtime remains disabled and must stay disabled.

## 15. Go / no-go conclusion

- Production apply readiness: **blocked**.
- CP-SCHEMA-1 readiness: **blocked**.
- Historical migrate resolve: **not allowed**.
- Normal migrate deploy: **not allowed**.
- Baseline/reset implementation: **not ready**.

Go for next step: **docs-only feature-family decision and schema reconciliation planning**.

## 16. Recommended next step

Recommended next prompt:

`Adminiculum — production schema vs Prisma feature-family reconciliation decision memo docs-only`

That task should decide, per feature family, whether production should remain source of truth and `schema.prisma` should be adjusted, or whether production must be brought forward with clone-proven additive remediation.

## 17. Final classification

`production_schema_snapshot_comparison_results_documented_no_db_change_no_runtime_change`
