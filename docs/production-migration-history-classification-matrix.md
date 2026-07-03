# Production Migration History Classification Matrix

Classification target: `production_migration_history_classification_matrix_documented_no_db_change_no_runtime_change`

This report is docs-only. It does not connect to any database, touch Azure, run Prisma migrate commands, edit `schema.prisma`, edit migration SQL, deploy, enable Client Portal runtime, or change application behavior.

## 1. Executive summary

A fresh current-production PITR clone confirmed that CP-SCHEMA-1 is not blocked by its own DDL alone. It is blocked because the production `_prisma_migrations` history diverges from the repo after `20260212180000_add_workload_tracking`.

This matrix classifies each repo migration that the fresh clone reported as not applied, plus the DB-recorded local-missing `20260302142000_add_kb_learning_escalation` row. The repo inspection shows three important patterns:

1. Several pending migrations are referenced by current runtime code and therefore cannot be dismissed casually.
2. Several pending migrations are already physically represented or partly represented according to prior clone object checks, so raw `migrate deploy` risks duplicate-object or partial-apply failure.
3. Several pending migrations appear experimental, feature-local, or not confirmed in production, so blanket `migrate resolve --applied` would write untruthful migration history.

Recommendation: keep production apply blocked, classify and remediate the historical chain first, and prefer a production-compatible baseline/reset path after human decisions on feature intent.

## 2. Scope and safety rules

Scope:

- inspect repo migration SQL;
- inspect current Prisma schema;
- search backend/frontend/docs references;
- classify divergence from a product/runtime-risk perspective;
- create a docs-only report.

Safety rules observed:

- no DB connection;
- no Azure access;
- no `prisma migrate deploy`;
- no `prisma migrate resolve`;
- no `prisma migrate dev`;
- no `prisma db push`;
- no schema or migration edit;
- no runtime or Client Portal enablement.

## 3. Source inputs used

Inputs:

- `docs/cp-schema-1-fresh-clone-verification-no-go.md`;
- `docs/production-migration-history-remediation-options.md`;
- `Backend/prisma/migrations/*/migration.sql` for the pending migration folders;
- `Backend/prisma/schema.prisma`;
- `Backend/src`, `Frontend/src`, and `docs` text searches for runtime and planning references.

No live database metadata was queried by this agent.

## 4. Current blocker summary

Fresh clone `prisma migrate status` showed:

- last common migration: `20260212180000_add_workload_tracking`;
- one DB-recorded local-missing migration: `20260302142000_add_kb_learning_escalation`;
- 16 local migrations not recorded as applied, including CP-SCHEMA-1.

Historical object checks from the fresh clone recorded:

- `eligible_candidate`: `20260406120000_add_client_color`, `20260518120000_add_workspace_text`;
- `partial_stop`: `20260331090100_add_anonymous_documents`, `20260408140000_add_case_collaborators`;
- `not_eligible`: `20260330120000_add_generation_drafts`, `20260417100000_add_timesheet_report_instances`, `20260417113000_add_timesheet_report_artifacts`, `20260417123000_add_timesheet_presets`, `20260514201500_add_legal_analyses`, `20260517175500_add_client_house_style_profile`;
- `unknown/not emitted`: `20260331100000_add_rehydration_fields`, `20260402131500_add_client_identity_fields`, `20260405183100_add_case_client_role`, `20260416175000_add_comparison_snapshot_foundation`, `20260517191600_add_client_house_style_header_fields`.

Because CP-SCHEMA-1 is not the sole pending migration, normal `migrate deploy` remains unsafe.

## 5. Classification legend

- `production-required` — current runtime code appears to depend on the schema capability, so omission can break deployed/near-term product behavior.
- `already-physically-represented` — prior clone object evidence indicates the migration effects exist; case-specific resolve may be possible only after parser-independent proof.
- `partial/manual-remediation-needed` — some objects may exist, some are missing, or the migration depends on earlier uncertain objects; needs bespoke remediation.
- `obsolete-or-non-production-candidate` — likely not required by production, but needs product decision before archive/prune.
- `experimental-feature-candidate` — feature surface exists but appears gated, partial, or non-core; needs product decision and fresh clone proof before production mutation.
- `CP-SCHEMA-1-future-work` — intentionally future Client Portal schema, blocked until baseline/remediation is solved.
- `unknown-needs-human-decision` — repo evidence is insufficient to choose safely.

## 6. Per-migration matrix

| Migration | Apparent feature / purpose | Introduced objects | Repo/runtime references found | Fresh clone object-check status | Risk if ignored | Risk if applied now | Classification | Recommended next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `20260330120000_add_generation_drafts` | Persisted contract-generation draft form state. | `generation_drafts`; indexes on `caseId`, `templateId`. | `Backend/src/modules/generation-draft/*`, `Frontend/src/app/cases/[caseId]/generate/GenerationPageContent.tsx`, `Frontend/src/lib/api.ts`; backend route appears feature-flagged by `ENABLE_GENERATION_DRAFT`. | `not_eligible`; table/indexes reported missing. | If feature flag is enabled or UI calls route, generation draft persistence can fail. | Raw apply may create a feature table that production intentionally lacks; may still be valid only if product wants persisted drafts. | `experimental-feature-candidate` with possible `production-required` if flag is enabled. | Human decision: is generation draft persistence production-required? If yes, design additive remediation; if not, archive/prune from active chain. |
| `20260331090100_add_anonymous_documents` | Base anonymized-document storage. | `anonymous_documents`; indexes on `caseId/createdAt`, `sourceDocId`. | `Backend/src/modules/anonymize/*`, `Frontend/src/components/CaseDetail.tsx`, `RehydrateModal`/anonymization docs; protected sensitive flow. | `partial_stop`; table found in prior docs, index status unclear/missing. | Anonymization/rehydration flows may fail or lose history if the table is absent/partial. | Raw apply risks duplicate table if table exists; partial index/constraint remediation likely needed. | `partial/manual-remediation-needed` and likely `production-required` if anonymization is active. | Perform parser-independent clone proof of table/columns/indexes, then design idempotent remediation or truthful per-object baseline. |
| `20260331100000_add_rehydration_fields` | Adds rehydration result fields to `anonymous_documents`. | `aiResponseText`, `rehydratedContent`, `rehydrationStatus`, `rehydrationWarnings`, `rehydratedAt`; status/original-doc indexes; comments. | Rehydration docs and frontend/backend anonymize flow references. | `unknown/not emitted`; depends on `anonymous_documents`. | Rehydrate/import/save-as-document flow may be degraded or fail if fields are missing. | Raw apply can fail if base table absent or partially altered; comments/indexes may collide. | `partial/manual-remediation-needed`. | Verify column-level state on fresh clone; remediate only after base anonymous-doc status is known. |
| `20260402131500_add_client_identity_fields` | Adds richer client legal identity fields. | `clients.taxNumber`, `clients.companyRegistrationNumber`, `clients.authorizedRepresentative`; backfills `taxNumber` from `vatNumber`. | `Backend/src/modules/clients/routes.ts`, `Frontend/src/lib/search.ts`, `Frontend/src/components/CasesList.tsx`, `ClientHouseStylePanel`; Prisma schema includes fields. | `unknown/not emitted`. | Client search/display/forms can rely on fields; missing columns would break runtime if code selects/writes them. | Contains DML `UPDATE`; raw apply mutates client rows and is not safe without approval. | `production-required` if current clients UI/API is deployed; otherwise `unknown-needs-human-decision` due to DML. | High priority parser-independent column proof; if missing, prepare explicit additive + reviewed backfill remediation. |
| `20260405183100_add_case_client_role` | Adds case-level client role for generation/anonymization targeting. | `cases.clientRole`. | `Backend/src/modules/cases/*`, `Backend/src/modules/anonymize/services.ts`, `Frontend/src/components/CaseDetail.tsx`, `CasesList.tsx`, `Frontend/src/lib/api.ts`. | `unknown/not emitted`. | Case create/update/anonymize logic references `clientRole`; missing column can break active workflows. | Additive `IF NOT EXISTS`, low DDL risk, but still cannot be applied through raw deploy chain. | `production-required` if current case/anonymize flows are live. | Verify physical column; if present, candidate for case-specific truthful resolve after proof; if absent, bespoke additive remediation. |
| `20260406120000_add_client_color` | Client color/accent field. | `clients.color`. | Current schema includes `Client.color`; likely UI/client metadata support. | `eligible_candidate`; physical column found. | Low if already present; if ignored only metadata remains divergent. | Raw apply would fail if column already exists because no `IF NOT EXISTS`. | `already-physically-represented`. | Candidate for targeted resolve only after fresh clone/prod proof confirms column exists and semantics match. |
| `20260408140000_add_case_collaborators` | Case collaborator membership table. | `case_collaborators`; unique `(caseId,userId)`; indexes; FKs to cases/users. | `Backend/src/modules/cases/services.ts`, `routes.ts`; `Frontend/src/components/CaseDetail.tsx`, `CasesList.tsx`, `Frontend/src/app/tasks/page.tsx`. | `partial_stop`; table may exist but indexes/constraints not fully confirmed. | Task/case collaboration UI/API may break if table missing or incomplete. | Raw apply risks duplicate table or partial FK/index errors. | `partial/manual-remediation-needed` and likely `production-required` if collaborator UX is live. | Fresh clone table/index/FK proof, then idempotent remediation for missing indexes/FKs or truthful resolve if complete. |
| `20260416175000_add_comparison_snapshot_foundation` | Stores contract comparison snapshot on generated contracts. | `contract_generations.comparisonSnapshot` JSONB. | `Backend/src/modules/contracts/services.ts` reads/writes `comparisonSnapshot`; current schema includes field. | `unknown/not emitted`. | Contract comparison/review logic may lose persisted snapshot data or fail if column is missing. | Additive `IF NOT EXISTS`, but raw deploy chain remains unsafe. | `production-required` if contract comparison/generation is active. | Verify column; if present, targeted resolve candidate; if absent, additive remediation after clone proof. |
| `20260417100000_add_timesheet_report_instances` | Persisted timesheet report generation instances. | enums `TimesheetReportTemplateFamily`, `TimesheetReportInstanceStatus`; `timesheet_report_instances`; indexes. | `Backend/src/modules/timesheet-reports/routes`, `Frontend/src/app/time-entries/page.tsx`, `/timesheet-presets`, `Frontend/src/lib/api.ts`. | `not_eligible`; objects reported missing. | Timesheet reports routes/UI may fail if active. | Applying creates a sizeable feature surface; could be unused or intentionally absent; enum/table dependency for later artifact/preset migrations. | `experimental-feature-candidate` with `production-required` if timesheet reports are deployed/used. | Product decision: keep/report feature? If yes, feature-batch remediation on clone; if not, archive/prune. |
| `20260417113000_add_timesheet_report_artifacts` | Stores generated report artifacts for timesheet reports. | enum `TimesheetReportArtifactFormat`; `timesheet_report_artifacts`; index; FK to report instances. | Same timesheet-report API/UI references. | `not_eligible`; objects reported missing. | Artifact listing/render history can fail if timesheet reports are active. | Depends on prior report-instance migration; applying alone is invalid. | `experimental-feature-candidate`. | Treat with the timesheet report family; do not remediate independently. |
| `20260417123000_add_timesheet_presets` | Stores report preset configuration. | enum `TimesheetPresetLayer`; `timesheet_presets`; indexes. | `Backend/src/modules/timesheet-reports/*`, `Frontend/src/app/timesheet-presets/page.tsx`, time entries page, sidebar. | `not_eligible`; parser caveat exists for schema-qualified DDL. | Preset UI/API may fail if route is live. | Creates additional feature table/enums; may collide if schema-qualified parser missed objects. | `experimental-feature-candidate`. | Parser-independent proof first; then decide whether timesheet reporting is production-required. |
| `20260514201500_add_legal_analyses` | Stores pasted/manual legal analyses linked to documents/cases. | enums `LegalAnalysisStatus`, `LegalAnalysisSourceType`, `LegalAnalysisSourceDocumentType`; `legal_analyses`; indexes; FK to cases. | `Backend/prisma/schema.prisma`, `Frontend/src/lib/api.ts`, docs/page inventory; likely document analysis UI references. | `not_eligible`; parser caveat exists for schema-qualified DDL. | Legal analysis APIs/UI can fail if active and table is missing. | Adds AI/work-product table surface; may be sensitive and may not be production-approved. | `experimental-feature-candidate` or `production-required` depending live document-analysis usage. | Human product decision plus fresh clone proof; no blind apply. |
| `20260517175500_add_client_house_style_profile` | Client house style/profile table. | `client_house_style_profiles`; unique `clientId`; FK to `clients`. | `Backend/src/modules/clients/routes.ts`, `Frontend/src/components/clients/ClientHouseStylePanel.tsx`, docs; current schema has `ClientHouseStyleProfile`. | `not_eligible`; table/index/FK reported missing. | House-style panel/API may fail if active. | Raw apply creates table tied to clients; could be acceptable but needs proof and product approval. | `experimental-feature-candidate` with possible `production-required` if panel is live. | Verify if production UI/API actually exposes house style; if yes, remediate as a feature batch with header fields. |
| `20260517191600_add_client_house_style_header_fields` | Adds branding/header fields to house style profile. | `headerAssetPath`, `headerDescription`, `brandingNotes` on `client_house_style_profiles`. | `ClientHouseStylePanel`, clients routes, docs. | `unknown/not emitted`; depends on base house-style table. | Branding/header fields fail if table exists without columns. | Cannot apply safely if base table absent; raw migration has `IF NOT EXISTS` columns but depends on table. | `partial/manual-remediation-needed`. | Bundle with house-style base table decision. |
| `20260518120000_add_workspace_text` | Stores document workspace working-copy text. | `documents.workspaceText`. | `Backend/prisma/schema.prisma`, `Frontend/src/lib/api.ts`, document compare/workspace docs. | `eligible_candidate`; physical column found. | Low if already present; document workspace behavior appears to rely on this field. | Raw apply would fail if column already exists because no `IF NOT EXISTS`. | `already-physically-represented` and likely `production-required`. | Candidate for targeted resolve only after proof confirms column exists in production/fresh clone. |
| `20260702140000_add_client_portal_foundation` | Future Client Portal foundation. | 16 Client Portal enums; 7 tables; 39 indexes; 18 FKs. | Schema/docs only; runtime not implemented/enabled. | CP pre-apply absence confirmed; transactional rollback proof succeeded. | No immediate runtime risk if ignored; blocks Client Portal progression. | Applying now impossible through Prisma chain and premature while baseline divergence remains. | `CP-SCHEMA-1-future-work`. | Keep blocked until production-compatible baseline/remediation is accepted and clone-proven. |

## 7. DB-recorded local-missing migration: `20260302142000_add_kb_learning_escalation`

Fresh clone evidence records `20260302142000_add_kb_learning_escalation` in the DB history, but no local migration folder exists.

Current known facts:

- recorded in DB but not found locally;
- described in prior docs as rolled back / DB-only;
- DB-only kb/learning/escalation-like object check returned 0 rows;
- repo search finds documentation references, not active source objects.

Classification: `unknown-needs-human-decision`.

Recommended next action: do not recreate or resolve blindly. The remediation plan must decide whether this DB-only row is historical noise to document around, an archived migration to recover, or a failed experiment that should remain rolled back.

## 8. CP-SCHEMA-1 section

`20260702140000_add_client_portal_foundation` should remain blocked.

Reasons:

- Client Portal runtime is not implemented or enabled;
- CP objects are absent in fresh clone, as expected;
- CP migration has a successful transactional rollback proof;
- CP is still behind 15 historical repo migrations in Prisma's active chain;
- applying CP through normal `migrate deploy` would require resolving or applying the historical backlog first.

CP-SCHEMA-1 can resume only after a clean production-compatible migration path exists.

## 9. Recommended production-compatible baseline strategy

Recommended path based on the matrix:

1. Treat current production schema as the operational source of truth until humans decide otherwise.
2. Do not run `migrate deploy` or blanket `migrate resolve`.
3. Split the pending historical migrations into feature families:
   - generation draft;
   - anonymization/rehydration;
   - client/case identity metadata;
   - case collaboration;
   - contract comparison snapshot;
   - timesheet reports/presets;
   - legal analyses;
   - client house style;
   - workspace text;
   - Client Portal.
4. For each family, make a human/product decision: production-required, obsolete/non-production, or future/experimental.
5. For production-required already-present objects, collect parser-independent fresh-clone proof and consider targeted truthful resolve or new baseline inclusion.
6. For production-required missing/partial objects, prepare bespoke additive remediation SQL and prove on a fresh clone.
7. For obsolete/non-production objects, remove them from the active Prisma deploy chain through an explicit archive/baseline strategy, not by pretending they were applied.
8. Prefer creating a new production-compatible baseline if most old migrations are not intended production history.
9. Return to CP-SCHEMA-1 only after the active deploy chain has one intended next migration.

## 10. Items requiring human/product decision

Highest-priority decisions:

- Is `generation_drafts` required in production, or is draft persistence optional/flagged off?
- Is anonymization/rehydration production-required and currently backed by the physical table/columns?
- Are case collaborators a production feature, given active UI/API references?
- Are timesheet report persistence and presets production features or experimental UI?
- Are legal analyses active legal-work product or future/experimental?
- Is client house style active enough to require schema remediation?
- Is current production schema the canonical source of truth, even if it omits repo migrations?
- Should the team adopt a new production-compatible Prisma baseline/squash?

## 11. Items requiring future fresh-clone proof

Fresh-clone proof is required before any mutation or resolve for:

- `clients.taxNumber`, `companyRegistrationNumber`, `authorizedRepresentative`;
- `cases.clientRole`;
- `contract_generations.comparisonSnapshot`;
- full `anonymous_documents` table/index/rehydration column state;
- full `case_collaborators` table/index/FK/unique state;
- full timesheet report/preset object state;
- full legal analysis object state;
- full client house style object/header field state;
- `documents.workspaceText` confirmation if considering resolve;
- `clients.color` confirmation if considering resolve;
- DB-only `kb_learning_escalation` row interpretation.

Proof must be metadata-only until a remediation plan explicitly permits clone mutation.

## 12. Explicit non-actions

The following remain prohibited:

- no `prisma migrate resolve`;
- no `prisma migrate deploy`;
- no `prisma migrate dev`;
- no `prisma db push`;
- no DB mutation;
- no production apply;
- no Azure/App Service change;
- no Client Portal enablement;
- no route/public portal implementation;
- no business/client row export.

## 13. Proposed next prompt

Recommended next prompt:

`Adminiculum — production migration history feature-family decision memo docs-only`

That prompt should group the pending migrations by feature family, identify deployed runtime dependency for each family, and ask for human/product decisions before any new clone or DB work.

## 14. Final classification

`production_migration_history_classification_matrix_documented_no_db_change_no_runtime_change`
