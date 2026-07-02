# Baseline Object Inventory for Local-Only Prisma Bootstrap

Classification target: `baseline_object_inventory_documented_no_runtime_change_no_schema_change_no_db_change`

This is a docs-only inventory/audit for a future local-only Prisma bootstrap used only with disposable proof databases. It does not create bootstrap SQL, create standalone `.sql` files, edit `Backend/prisma/schema.prisma`, edit historical migrations, run `prisma migrate`, run `prisma db push`, mutate any database, connect to production/Azure, deploy, or change runtime behavior.

## 1. Executive summary

The active migration chain is not replayable from an empty database because `20260211153100_baseline` is intentionally no-op and the next migration expects baseline objects to already exist.

Inventory result:

- The first required baseline object is `clients`.
- Additional clear baseline objects include `users`, `cases`, `documents`, `tasks`, and `contract_generations`.
- Several current models are later-created objects and must be excluded from a bootstrap, including `client_workgroups`, `workload_records`, `generation_drafts`, `anonymous_documents`, `case_collaborators`, `timesheet_*`, `legal_analyses`, `client_house_style_profiles`, `lawyer_handoff_packages`, `communications`, and `communication_attachments`.
- The inventory is **partially complete**: enough to guide a pseudocode/draft planning pass, but not enough for executable local-only bootstrap SQL.
- `CP-SCHEMA-1` and `CONNECTOR-SCHEMA-1` remain blocked until historical baseline shape is recovered and a disposable local proof succeeds.

Recommended next step: continue with docs-only historical baseline reconstruction, not SQL creation.

## 2. Safety and non-goals

This task used repository file analysis only.

Safety confirmations:

- no DB connection;
- no production/Azure access;
- no existing DB reset;
- no DB mutation;
- no schema edit;
- no migration creation;
- no migration SQL edit;
- no standalone bootstrap SQL file;
- no runtime code change;
- no API/frontend/auth/client portal change;
- no deploy;
- no secrets.

Non-goal:

- This document does not define executable bootstrap SQL. It identifies what future SQL must account for.

## 3. Migration chain structure

Migration folder order:

| Order | Migration folder | Role in chain |
| --- | --- | --- |
| 1 | `20260211153100_baseline` | No-op baseline representing pre-existing DB state |
| 2 | `20260212180000_add_workload_tracking` | First real migration; creates workload tables and assumes `clients` |
| 3 | `20260330120000_add_generation_drafts` | Creates `generation_drafts` |
| 4 | `20260331090100_add_anonymous_documents` | Creates `anonymous_documents` |
| 5 | `20260331100000_add_rehydration_fields` | Alters `anonymous_documents` |
| 6 | `20260402131500_add_client_identity_fields` | Alters/updates `clients` |
| 7 | `20260405183100_add_case_client_role` | Alters `cases` |
| 8 | `20260406120000_add_client_color` | Alters `clients` |
| 9 | `20260408140000_add_case_collaborators` | Creates `case_collaborators`, references `cases` and `users` |
| 10 | `20260416175000_add_comparison_snapshot_foundation` | Alters `contract_generations` |
| 11 | `20260417100000_add_timesheet_report_instances` | Creates timesheet report enums/table |
| 12 | `20260417113000_add_timesheet_report_artifacts` | Creates timesheet artifact enum/table |
| 13 | `20260417123000_add_timesheet_presets` | Creates timesheet preset enum/table |
| 14 | `20260514201500_add_legal_analyses` | Creates legal analysis enums/table, references `cases` |
| 15 | `20260517175500_add_client_house_style_profile` | Creates client house-style table, references `clients` |
| 16 | `20260517191600_add_client_house_style_header_fields` | Alters client house-style table |
| 17 | `20260518120000_add_workspace_text` | Alters `documents` |
| 18 | `20260622150000_add_lawyer_handoff_packages_foundation` | Creates handoff enums/table, references `cases` |
| 19 | `20260628190000_add_communication_baseline` | Creates communication baseline and alters `tasks` |
| 20 | `20260701120000_add_outlook_communication_provider_fields` | Alters communication tables and creates provider enums |

No-op baseline:

- `Backend/prisma/migrations/20260211153100_baseline/migration.sql`
- SQL body: `SELECT 1;`

First failing migration from clean proof:

- `20260212180000_add_workload_tracking`
- first missing object: `clients`

Likely next missing objects if `clients` existed:

- `cases`, when `20260405183100_add_case_client_role` runs;
- `users`, when `20260408140000_add_case_collaborators` adds user FK;
- `contract_generations`, when `20260416175000_add_comparison_snapshot_foundation` alters it;
- `documents`, when `20260518120000_add_workspace_text` alters it;
- `tasks`, when `20260628190000_add_communication_baseline` alters it.

## 4. First failure recap

Known clean proof failure:

```text
Applying migration `20260211153100_baseline`
Applying migration `20260212180000_add_workload_tracking`
ERROR: relation "clients" does not exist
```

Evidence:

- `20260211153100_baseline` does not create `clients`.
- `20260212180000_add_workload_tracking` creates `client_workgroups` with `"clientId" UUID NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE`.

Conclusion:

- `clients` must exist before the first real migration can apply.
- The baseline bootstrap must create the historical shape of `clients`, not the current final schema.

## 5. Baseline object inventory table

| Object name | Object type | First migration that assumes it exists | SQL evidence | Required baseline shape | Current schema presence | Historical baseline SQL available | Future bootstrap inclusion | Risk note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `clients` | table / FK target / ALTER target | `20260212180000_add_workload_tracking` | FK from `client_workgroups.clientId` to `clients(id)`; later `ALTER TABLE "clients"` | Table with `id` compatible with FK; later-added columns excluded | Yes | No/unclear | Yes | ID type mismatch risk: migration uses `UUID`; current Prisma model is `String` without `@db.Uuid` |
| `clients.id` | column / PK | `20260212180000_add_workload_tracking` | `REFERENCES "clients"("id")` | Primary/unique key compatible with `client_workgroups.clientId UUID` | Yes | No/unclear | Yes | Must confirm historical type |
| `users` | table / FK target | `20260408140000_add_case_collaborators` | FK from `case_collaborators.userId` to `users(id)` | Table with `id` compatible with UUID FK | Yes | No/unclear | Yes | Current Prisma model is string ID; historical FK expects UUID |
| `users.id` | column / PK | `20260408140000_add_case_collaborators` | `FOREIGN KEY ("userId") REFERENCES "users"("id")` | Primary/unique key compatible with UUID | Yes | No/unclear | Yes | Must confirm type and baseline enum/text role columns |
| `cases` | table / ALTER target / FK target | `20260405183100_add_case_client_role` | `ALTER TABLE "cases" ADD COLUMN`; collaborator/legal-analysis/handoff FKs | Table with `id`; must not already include `clientRole` | Yes | No/unclear | Yes | ID type conflict: collaborator FK is UUID, later legal/handoff FKs use text-ish columns |
| `cases.id` | column / PK | `20260408140000_add_case_collaborators` | FK to `cases(id)` | Primary/unique key compatible with later FK usage | Yes | No/unclear | Yes | Historical type must be proven |
| `documents` | table / ALTER target | `20260518120000_add_workspace_text` | `ALTER TABLE "documents" ADD COLUMN "workspaceText" TEXT` | Table exists without `workspaceText` | Yes | No/unclear | Yes | If bootstrap includes `workspaceText`, later migration may fail because no `IF NOT EXISTS` |
| `tasks` | table / ALTER target | `20260628190000_add_communication_baseline` | `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "sourceCommunicationId"` | Table exists; may omit `sourceCommunicationId` | Yes | No/unclear | Yes | Later communication migration tolerates column with `IF NOT EXISTS`, but FK shape still matters |
| `contract_generations` | table / ALTER target | `20260416175000_add_comparison_snapshot_foundation` | `ALTER TABLE "contract_generations" ADD COLUMN IF NOT EXISTS "comparisonSnapshot"` | Table exists; may omit `comparisonSnapshot` | Yes | No/unclear | Yes | Must avoid current final columns introduced later if any |
| `anonymous_documents` | table / ALTER target | `20260331100000_add_rehydration_fields` | `ALTER TABLE "anonymous_documents"` | Created by previous migration, not baseline | Yes | Yes, repo migration creates it | No | Duplicate risk if bootstrap creates it |
| `client_workgroups` | table | `20260212180000_add_workload_tracking` | `CREATE TABLE IF NOT EXISTS "client_workgroups"` | Created by migration | Yes | Yes, repo migration creates it | No | Duplicate/noise risk |
| `workload_records` | table | `20260212180000_add_workload_tracking` | `CREATE TABLE IF NOT EXISTS "workload_records"` | Created by migration | Yes | Yes, repo migration creates it | No | Duplicate/noise risk |
| `generation_drafts` | table | `20260330120000_add_generation_drafts` | `CREATE TABLE "generation_drafts"` | Created by migration | Yes | Yes, repo migration creates it | No | Hard duplicate risk because no `IF NOT EXISTS` |
| `case_collaborators` | table | `20260408140000_add_case_collaborators` | `CREATE TABLE "case_collaborators"` | Created by migration | Yes | Yes, repo migration creates it | No | Hard duplicate risk |
| `timesheet_report_instances` | table | `20260417100000_add_timesheet_report_instances` | `CREATE TABLE "timesheet_report_instances"` | Created by migration | Yes | Yes, repo migration creates it | No | Duplicate risk |
| `timesheet_report_artifacts` | table | `20260417113000_add_timesheet_report_artifacts` | `CREATE TABLE "timesheet_report_artifacts"` | Created by migration | Yes | Yes, repo migration creates it | No | Duplicate risk |
| `timesheet_presets` | table | `20260417123000_add_timesheet_presets` | `CREATE TABLE "public"."timesheet_presets"` | Created by migration | Yes | Yes, repo migration creates it | No | Duplicate risk |
| `legal_analyses` | table | `20260514201500_add_legal_analyses` | `CREATE TABLE "public"."legal_analyses"` | Created by migration | Yes | Yes, repo migration creates it | No | Duplicate risk |
| `client_house_style_profiles` | table / FK target later | `20260517175500_add_client_house_style_profile` | `CREATE TABLE "client_house_style_profiles"` | Created by migration | Yes | Yes, repo migration creates it | No | Duplicate risk |
| `lawyer_handoff_packages` | table | `20260622150000_add_lawyer_handoff_packages_foundation` | `CREATE TABLE "lawyer_handoff_packages"` | Created by migration | Yes | Yes, repo migration creates it | No | Duplicate risk |
| `communications` | table / ALTER target later | `20260628190000_add_communication_baseline` | `CREATE TABLE IF NOT EXISTS "communications"` | Created by communication baseline migration | Yes | Yes, repo migration creates it | No | Should not be baseline; later Outlook migration alters it |
| `communication_attachments` | table / ALTER target later | `20260628190000_add_communication_baseline` | `CREATE TABLE IF NOT EXISTS "communication_attachments"` | Created by communication baseline migration | Yes | Yes, repo migration creates it | No | Should not be baseline |
| `CommunicationType` | enum/type | `20260628190000_add_communication_baseline` | `CREATE TYPE "CommunicationType" AS ENUM` | Created by migration | Yes | Yes, repo migration creates it | No | Duplicate type risk |
| `TimesheetReportTemplateFamily` | enum/type | `20260417100000_add_timesheet_report_instances` | `CREATE TYPE "TimesheetReportTemplateFamily"` | Created by migration | Yes | Yes, repo migration creates it | No | Duplicate type risk |
| `TimesheetReportInstanceStatus` | enum/type | `20260417100000_add_timesheet_report_instances` | `CREATE TYPE "TimesheetReportInstanceStatus"` | Created by migration | Yes | Yes, repo migration creates it | No | Duplicate type risk |
| `TimesheetReportArtifactFormat` | enum/type | `20260417113000_add_timesheet_report_artifacts` | `CREATE TYPE "TimesheetReportArtifactFormat"` | Created by migration | Yes | Yes, repo migration creates it | No | Duplicate type risk |
| `TimesheetPresetLayer` | enum/type | `20260417123000_add_timesheet_presets` | `CREATE TYPE "public"."TimesheetPresetLayer"` | Created by migration | Yes | Yes, repo migration creates it | No | Duplicate type risk |
| `LegalAnalysisStatus` | enum/type | `20260514201500_add_legal_analyses` | `CREATE TYPE "public"."LegalAnalysisStatus"` | Created by migration | Yes | Yes, repo migration creates it | No | Duplicate type risk |
| `LegalAnalysisSourceType` | enum/type | `20260514201500_add_legal_analyses` | `CREATE TYPE "public"."LegalAnalysisSourceType"` | Created by migration | Yes | Yes, repo migration creates it | No | Duplicate type risk |
| `LegalAnalysisSourceDocumentType` | enum/type | `20260514201500_add_legal_analyses` | `CREATE TYPE "public"."LegalAnalysisSourceDocumentType"` | Created by migration | Yes | Yes, repo migration creates it | No | Duplicate type risk |
| `LawyerHandoffPackageType` | enum/type | `20260622150000_add_lawyer_handoff_packages_foundation` | `CREATE TYPE "LawyerHandoffPackageType"` | Created by migration | Yes | Yes, repo migration creates it | No | Duplicate type risk |
| `LawyerHandoffStatus` | enum/type | `20260622150000_add_lawyer_handoff_packages_foundation` | `CREATE TYPE "LawyerHandoffStatus"` | Created by migration | Yes | Yes, repo migration creates it | No | Duplicate type risk |
| `LawyerHandoffDecision` | enum/type | `20260622150000_add_lawyer_handoff_packages_foundation` | `CREATE TYPE "LawyerHandoffDecision"` | Created by migration | Yes | Yes, repo migration creates it | No | Duplicate type risk |
| `CommunicationDirection` | enum/type | `20260701120000_add_outlook_communication_provider_fields` | `CREATE TYPE "CommunicationDirection"` | Created by migration | Yes | Yes, repo migration creates it | No | Duplicate type risk |
| `CommunicationSource` | enum/type | `20260701120000_add_outlook_communication_provider_fields` | `CREATE TYPE "CommunicationSource"` | Created by migration | Yes | Yes, repo migration creates it | No | Duplicate type risk |
| `CommunicationSyncStatus` | enum/type | `20260701120000_add_outlook_communication_provider_fields` | `CREATE TYPE "CommunicationSyncStatus"` | Created by migration | Yes | Yes, repo migration creates it | No | Duplicate type risk |
| baseline user/case/task/document enums | enum/type | Baseline tables if enum-typed | Implied by current schema, not directly created before usage | Current schema has many enums | No/unclear | Unclear | Must recover historical enum/text shapes before SQL draft |
| baseline indexes/unique constraints | index/constraint | baseline tables and later FKs | FK targets require unique/PK IDs; app may rely on unique email/case number | Current schema has some | No/unclear | Unclear | Must not over-create current final indexes blindly |

## 6. Minimum baseline shape analysis

The minimum shape below is inferred only from migration SQL assumptions. It is not enough to write executable SQL without historical evidence.

### `clients`

Required before:

- `20260212180000_add_workload_tracking`
- `20260402131500_add_client_identity_fields`
- `20260406120000_add_client_color`
- `20260517175500_add_client_house_style_profile`

Minimum inferred shape:

- table `clients`;
- primary/unique `id` column compatible with `client_workgroups.clientId UUID`;
- any columns required by existing app baseline are unknown from migration SQL alone.

Must not include if historical baseline did not have them:

- `taxNumber`;
- `companyRegistrationNumber`;
- `authorizedRepresentative`;
- `color`.

Risk:

- Current Prisma `Client.id` is `String @id @default(uuid())`, while the first FK declares `clientId UUID`; this must be reconciled from historical DB evidence.

### `users`

Required before:

- `20260408140000_add_case_collaborators`

Minimum inferred shape:

- table `users`;
- primary/unique `id` compatible with `case_collaborators.userId UUID`.

Possible baseline enum/text requirements:

- `UserRole`;
- `UserStatus`.

Risk:

- Current schema uses enums; historical baseline may have enum or text columns. This cannot be safely inferred from later migrations.

### `cases`

Required before:

- `20260405183100_add_case_client_role`;
- `20260408140000_add_case_collaborators`;
- `20260514201500_add_legal_analyses`;
- `20260622150000_add_lawyer_handoff_packages_foundation`.

Minimum inferred shape:

- table `cases`;
- primary/unique `id` compatible with later FK references;
- no `clientRole` column before `20260405183100`.

Potential conflict:

- `case_collaborators.caseId` is `UUID`;
- `legal_analyses.caseId` is `TEXT`;
- `lawyer_handoff_packages.caseId` appears text-based in its table body, but later references `cases(id)`.

Risk:

- The exact historical `cases.id` type is critical and cannot be guessed from current Prisma schema alone.

### `documents`

Required before:

- `20260518120000_add_workspace_text`.

Minimum inferred shape:

- table `documents`;
- no `workspaceText` column before `20260518120000`.

Risk:

- If a bootstrap copied the current schema and included `workspaceText`, `ALTER TABLE "documents" ADD COLUMN "workspaceText" TEXT` has no `IF NOT EXISTS` and would fail.

### `tasks`

Required before:

- `20260628190000_add_communication_baseline`.

Minimum inferred shape:

- table `tasks`;
- no required assumption about `sourceCommunicationId` because the migration adds it with `IF NOT EXISTS`.

Risk:

- Exact baseline task columns and enum/text status fields are unknown from migration SQL.

### `contract_generations`

Required before:

- `20260416175000_add_comparison_snapshot_foundation`.

Minimum inferred shape:

- table `contract_generations`;
- may omit `comparisonSnapshot` because the migration adds it with `IF NOT EXISTS`.

Risk:

- Generation-related baseline dependencies such as `contract_templates` may exist historically even though the scanned migration only alters `contract_generations`.

### Baseline enums/types

Required before:

- any baseline table that uses enum-typed columns.

Minimum inferred shape:

- unclear from post-baseline migrations alone.

Risk:

- Creating current final enums as baseline can duplicate later `CREATE TYPE` migrations.
- Omitting required historical enums can make baseline table creation impossible if historical columns used enum types.

## 7. Duplicate-risk analysis

Safe baseline objects:

- `clients` — clearly expected before first real migration.
- `users` — clearly expected before `case_collaborators`.
- `cases` — clearly expected before case/client-role and FK migrations.
- `documents` — clearly expected before workspace-text migration.
- `tasks` — clearly expected before communication baseline.
- `contract_generations` — clearly expected before comparison-snapshot migration.

Duplicate-risk objects:

- `client_workgroups`
- `workload_records`
- `generation_drafts`
- `anonymous_documents`
- `case_collaborators`
- `timesheet_report_instances`
- `timesheet_report_artifacts`
- `timesheet_presets`
- `legal_analyses`
- `client_house_style_profiles`
- `lawyer_handoff_packages`
- `communications`
- `communication_attachments`
- all enums explicitly created by migrations after baseline.

Order-sensitive objects:

- `clients`, because later migrations add identity/color columns and update identity defaults.
- `cases`, because later migration adds `clientRole`.
- `documents`, because later migration adds `workspaceText` without `IF NOT EXISTS`.
- `contract_generations`, because later migration adds `comparisonSnapshot`.
- `tasks`, because later migration adds `sourceCommunicationId` and FK.
- `anonymous_documents`, but this is created after baseline and then altered by a later migration.

Unknown objects:

- `contract_templates`
- `notifications`
- `comments`
- `timeline_events`
- `document_versions`
- `departments`
- `matters`
- `time_entries`
- baseline automation/settings tables

These exist in the current schema but were not proven by the scanned migrations as pre-baseline requirements. They may still be needed for a faithful historical baseline, but additional evidence is required.

## 8. Current schema vs historical baseline

The current `Backend/prisma/schema.prisma` is the current end-state, not the historical baseline.

Current models that clearly include post-baseline additions:

- `ClientWorkgroup` and `WorkloadRecord` from `20260212180000_add_workload_tracking`.
- `GenerationDraft` from `20260330120000_add_generation_drafts`.
- `AnonymousDocument` plus rehydration fields from March 2026 migrations.
- `Case.clientRole` from `20260405183100_add_case_client_role`.
- `Client.taxNumber`, `companyRegistrationNumber`, `authorizedRepresentative`, and `color` from April 2026 migrations.
- `CaseCollaborator` from `20260408140000_add_case_collaborators`.
- timesheet report models/enums from April 2026 migrations.
- `LegalAnalysis` and related enums from `20260514201500_add_legal_analyses`.
- `ClientHouseStyleProfile` from May 2026 migrations.
- `Document.workspaceText` from `20260518120000_add_workspace_text`.
- `LawyerHandoffPackage` and related enums from `20260622150000_add_lawyer_handoff_packages_foundation`.
- `Communication`, `CommunicationAttachment`, and provider fields from June/July 2026 migrations.

Current models that likely predate early migrations but still need historical shape proof:

- `Client`
- `User`
- `Case`
- `Document`
- `Task`
- `ContractGeneration`
- likely `ContractTemplate`
- possibly `Notification`, `Comment`, `TimelineEvent`, `DocumentVersion`

Current schema cannot safely reconstruct baseline without migration-order analysis because:

- it contains later-created tables;
- it contains later-added columns;
- it contains later-created enum types;
- it may use current Prisma scalar mappings that differ from historical physical column types.

## 9. Historical baseline reconstruction sources

| Source | Availability | Reliability | Risk | Recommendation |
| --- | --- | --- | --- | --- |
| Active migration SQL | Available | High for post-baseline changes | Does not define no-op baseline shape | Use for exclusions and assumptions |
| Current `schema.prisma` | Available | Medium for current end-state | Dangerous as historical baseline | Use only as reference, not source of truth |
| Existing docs | Available | Medium | Summaries may omit column types | Use to guide safe workflow |
| Git history | Available locally | Potentially high | May contain superseded/drifted artifacts | Inspect before drafting SQL |
| Archived old SQL/docs | Possibly available | Unclear | May not match production checksum/history | Use only as evidence after review |
| Drifted local `localhost/adminiculum` | Available only if connected separately | Low/medium | Known drift; false confidence | Do not use as proof; read-only evidence only if separately approved |
| Production/PITR clone schema | Not accessed here | High for production compatibility | Requires ops access and target guards | Required before deploy-facing schema work |
| Production DB | Not allowed | High factual value | Unsafe for this task | Do not touch |

## 10. Bootstrap readiness classification

Classification: **B) Partially complete**.

Reason:

- Enough objects are identified to explain why empty replay fails and to outline likely bootstrap families.
- Duplicate-risk objects are reasonably clear from `CREATE TABLE` / `CREATE TYPE` migrations.
- Minimum shapes for core baseline tables are not complete enough for executable SQL.
- Critical ID-type and enum-shape questions remain unresolved.
- Historical baseline SQL is not available in the active migration folder.

Future bootstrap SQL draft safety:

- Safe to draft pseudocode/checklist next.
- Not safe to draft executable SQL yet.

## 11. Future bootstrap SQL implications

A future bootstrap SQL draft would need:

- baseline table definitions for at least `clients`, `users`, `cases`, `documents`, `tasks`, and `contract_generations`;
- any proven historical baseline enums/types required by those tables;
- PK/unique constraints required for later FK targets;
- baseline indexes only where historically required or needed by FK/uniqueness;
- no rows unless a future migration explicitly requires existing business rows;
- loud local-only comments;
- target guard instructions outside the SQL;
- no Client Portal tables;
- no Connector tables;
- no objects created by later migrations;
- no manual `_prisma_migrations` writes unless later proof shows unavoidable.

Manual `_prisma_migrations` handling:

- Prefer avoiding manual writes.
- Let `prisma migrate deploy` apply `20260211153100_baseline` itself after the local-only bootstrap has created the pre-baseline schema.

## 12. Risk register

| Risk | Severity | Mitigation | Blocking status |
| --- | --- | --- | --- |
| Incomplete baseline object inventory | High | Continue docs-only inventory with git/history evidence | Blocking executable SQL |
| Current schema mistaken for historical baseline | Critical | Treat current schema as end-state only | Blocking |
| Duplicate table/type creation | High | Exclude all objects created by later `CREATE TABLE` / `CREATE TYPE` migrations | Blocking |
| Missing required FK target | High | Scan all later FK references before SQL draft | Blocking |
| Wrong PK/ID type | Critical | Resolve UUID vs text/string physical type from historical/clone evidence | Blocking |
| Wrong enum values/types | High | Recover historical enum/text shapes before SQL draft | Blocking |
| Later migration fails further down chain | Medium | Prove full chain on disposable DB after bootstrap | Blocking proof |
| Local bootstrap gives false confidence | High | Require production-like clone proof before deploy planning | Blocking deploy confidence |
| Production-like clone differs from local bootstrap | High | Treat clone proof as required for production-facing migration | Blocking deploy confidence |
| Accidental use on real DB | Critical | Do not create standalone SQL yet; future script must include target guards | Blocking |
| Manual `_prisma_migrations` mismatch | High | Avoid manual metadata writes unless separately proven necessary | Blocking if proposed |

## 13. Blocking issues

Still blocking local-only executable bootstrap SQL:

- exact historical baseline DDL is not recovered;
- baseline `id` column physical types are unresolved for `clients`, `users`, and `cases`;
- baseline enum/text shapes are unresolved;
- unknown current models may or may not be historical baseline objects;
- no production-like clone inventory has been used;
- no disposable DB proof has passed.

Still blocking `CP-SCHEMA-1` / `CONNECTOR-SCHEMA-1`:

- no green local baseline bootstrap proof;
- no green production-like clone proof;
- no reviewed candidate schema migration after bootstrap.

## 14. Recommended next prompt

Recommended next prompt:

`Adminiculum — historical baseline evidence review for local-only Prisma bootstrap docs-only`

That prompt should:

- inspect git history and archived baseline-adjacent artifacts;
- look for historical DDL for `clients`, `users`, `cases`, `documents`, `tasks`, and `contract_generations`;
- avoid DB connections;
- avoid executable SQL;
- avoid schema/migration/runtime changes;
- update the inventory with proven column/type/enum evidence.

Only after that should a later task consider:

`Adminiculum — local-only baseline bootstrap SQL draft docs-contained no execution`
