# Local-Only Baseline Bootstrap Design

Classification target: `local_only_baseline_bootstrap_design_documented_no_runtime_change_no_schema_change_no_db_change`

This is a docs-only design for a future local-only baseline bootstrap flow for disposable Prisma migration proof databases. It does not edit `Backend/prisma/schema.prisma`, create Prisma migrations, edit historical migrations, create executable SQL scripts, run `prisma migrate`, run `prisma db push`, reset any database, connect to production/Azure, deploy, or change runtime behavior.

## 1. Executive summary

Future Client Portal and Connector schema work is blocked because the active Prisma migration chain does not replay from an empty database. The first migration, `20260211153100_baseline`, is intentionally no-op, while the next migration, `20260212180000_add_workload_tracking`, expects baseline tables such as `clients` to already exist.

Recommended approach:

- Keep the active no-op baseline migration unchanged.
- Do not reconstruct production history from the current Prisma schema.
- Design a local-only bootstrap process for disposable proof databases only.
- Use the bootstrap to create the minimum pre-`20260212180000` baseline objects needed for the existing migrations to apply.
- Treat the bootstrap as a proof aid, not production SQL and not a Prisma migration.
- Require a production-like clone/PITR proof before any future deploy-facing schema change.

This task does not unblock `CP-SCHEMA-1` or `CONNECTOR-SCHEMA-1` yet. It only defines the safe design boundaries for a later bootstrap implementation/proof task.

## 2. Current blocker

Known failed proof:

- proof database: `adminiculum_cp_schema_clean`;
- shadow database: `adminiculum_shadow_cp`;
- target: local PostgreSQL only;
- command that failed in the previous proof: `npx.cmd prisma migrate deploy`;
- failed migration: `20260212180000_add_workload_tracking`;
- first missing object: `clients`;
- failure: `ERROR: relation "clients" does not exist`.

Root cause:

- `Backend/prisma/migrations/20260211153100_baseline/migration.sql` is a no-op ending in `SELECT 1`.
- `Backend/prisma/migrations/20260212180000_add_workload_tracking/migration.sql` creates `client_workgroups` with an FK to `"clients"("id")`.
- An empty database has only `_prisma_migrations` after the no-op baseline, so the FK target is missing.

The drifted local `localhost/adminiculum` database must not be used as proof because it may contain objects that do not reflect the active migration chain.

## 3. Safety rules

The future bootstrap must be:

- local-only;
- disposable DB only;
- explicitly labeled as not production SQL;
- explicitly not a Prisma migration;
- not placed in `Backend/prisma/migrations`;
- not run against `localhost/adminiculum`;
- not run against production, Azure, clone/staging, or any shared database;
- free of secrets;
- free of real client/case/document data;
- free of Client Portal and Connector schema objects.

The future bootstrap must not:

- edit `20260211153100_baseline`;
- edit any historical migration;
- run `prisma migrate dev`;
- run `prisma db push`;
- reset existing local or production databases;
- enable runtime features;
- add API/UI/auth behavior.

## 4. Migration chain inspection

Earliest migration chain:

| Migration | Role | Key observation |
| --- | --- | --- |
| `20260211153100_baseline` | No-op baseline | Comments say it establishes an existing initial state; SQL only runs `SELECT 1`. |
| `20260212180000_add_workload_tracking` | First real migration | Creates `client_workgroups` with FK to `clients`; fails on empty DB. |
| `20260330120000_add_generation_drafts` | Creates `generation_drafts` | Uses scalar `caseId`, `createdById`, `lastEditedById`; no FK constraints in SQL. |
| `20260331090100_add_anonymous_documents` | Creates `anonymous_documents` | Uses scalar document/case IDs; no FK constraints in SQL. |
| `20260331100000_add_rehydration_fields` | Alters `anonymous_documents` | Assumes previous migration has created `anonymous_documents`. |
| `20260402131500_add_client_identity_fields` | Alters `clients` | Assumes baseline `clients` table exists. |
| `20260405183100_add_case_client_role` | Alters `cases` | Assumes baseline `cases` table exists. |
| `20260406120000_add_client_color` | Alters `clients` | Assumes baseline `clients` table exists and does not already have `color`. |
| `20260408140000_add_case_collaborators` | Creates join table | Assumes baseline `cases` and `users` exist with compatible `UUID` IDs. |
| `20260416175000_add_comparison_snapshot_foundation` | Alters `contract_generations` | Assumes baseline `contract_generations` table exists. |
| `20260417100000_add_timesheet_report_instances` | Creates timesheet report tables/enums | Does not depend on baseline tables directly. |
| `20260514201500_add_legal_analyses` | Creates legal analyses | Adds FK to `cases`; assumes baseline `cases` exists. |
| `20260628190000_add_communication_baseline` | Creates communication baseline | Adds nullable `tasks.sourceCommunicationId`; assumes baseline `tasks` exists. |
| `20260701120000_add_outlook_communication_provider_fields` | Alters communications | Assumes communication baseline has been applied. |

Important early assumption:

- The active migration chain is not a full create-from-zero chain. It is a baseline-style chain where pre-2026-02-12 objects were expected to exist before Prisma started applying later migrations.

## 5. Minimum baseline object inventory

This inventory is a design dependency map, not executable SQL. The future bootstrap must be derived from historical/clone evidence where available, not blindly from the current schema.

| Object | Type | First migration that assumes it | Why required | Current schema contains it | Active baseline SQL creates it | Safe for local-only bootstrap? |
| --- | --- | --- | --- | --- | --- | --- |
| `clients` | Table | `20260212180000_add_workload_tracking` | FK target for `client_workgroups.clientId`; later altered by client identity/color migrations | Yes, `Client @@map("clients")` | No | Yes, minimum required |
| `users` | Table | `20260408140000_add_case_collaborators` | FK target for `case_collaborators.userId`; internal actor anchor | Yes, `User @@map("users")` | No | Yes, likely required |
| `cases` | Table | `20260405183100_add_case_client_role` | Alter target; FK target for collaborators/legal analyses | Yes, `Case @@map("cases")` | No | Yes, likely required |
| `documents` | Table | `20260518120000_add_workspace_text` and document/review paths | Alter target for `workspaceText`; anchor for document features | Yes, `Document @@map("documents")` | No | Yes, likely required |
| `tasks` | Table | `20260628190000_add_communication_baseline` | Alter target for `sourceCommunicationId` | Yes, `Task @@map("tasks")` | No | Yes, likely required |
| `contract_generations` | Table | `20260416175000_add_comparison_snapshot_foundation` | Alter target for `comparisonSnapshot` | Yes, `ContractGeneration @@map("contract_generations")` | No | Yes, likely required |
| `contract_templates` | Table | Baseline-era generation relationships / current schema | Likely generation anchor; not directly altered in scanned early migrations | Yes, `ContractTemplate @@map("contract_templates")` | No | Likely, confirm from historical baseline evidence |
| `notifications` | Table | Baseline-era app state / current schema | Current app model likely existed before later migrations; not directly altered in scanned migrations | Yes, `Notification @@map("notifications")` | No | Maybe, confirm from historical baseline evidence |
| `comments` | Table | Baseline-era case/document workspace | Current app model likely existed before later migrations; not directly altered in scanned migrations | Yes, `Comment @@map("comments")` | No | Maybe, confirm from historical baseline evidence |
| `timeline_events` | Table | Baseline-era case workspace | Current app model likely existed before later migrations; not directly altered in scanned migrations | Yes, `TimelineEvent @@map("timeline_events")` | No | Maybe, confirm from historical baseline evidence |
| baseline enums for `users` | Enum | Baseline tables | `users.role` / `users.status` require compatible enum or text shape depending on historical schema | Yes, `UserRole`, `UserStatus` | No | Required if historical columns are enum-typed |
| baseline enums for `cases` | Enum | Baseline tables | `cases.caseType`, `cases.status`, `cases.priority` may require enum types | Yes, `CaseType`, `CaseStatus`, `Priority` | No | Required if historical columns are enum-typed |
| baseline enums for `documents` | Enum | Baseline tables | document category/status-like fields may require enum types | Yes, document/review enums | No | Required if historical columns are enum-typed |
| baseline indexes/unique constraints | Index/constraint | Later relations/data assumptions | Required for unique IDs, case numbers, user emails, FK targets | Partly visible in current schema | No | Yes, but exact shape must come from historical evidence |
| baseline FKs | FK target/constraint | Later FK additions and app assumptions | Needed only where historical schema had them; over-adding can duplicate or conflict with later migrations | Partly visible in current schema | No | Only if proven historical |

Objects that should **not** be in local-only baseline bootstrap:

- `client_workgroups` and `workload_records`, because `20260212180000_add_workload_tracking` creates them.
- `generation_drafts`, because `20260330120000_add_generation_drafts` creates it.
- `anonymous_documents`, because `20260331090100_add_anonymous_documents` creates it.
- `case_collaborators`, because `20260408140000_add_case_collaborators` creates it.
- `timesheet_report_instances`, `timesheet_report_artifacts`, and `timesheet_presets`, because April 2026 migrations create them.
- `legal_analyses`, because `20260514201500_add_legal_analyses` creates it.
- `client_house_style_profiles`, because `20260517175500_add_client_house_style_profile` creates it.
- `lawyer_handoff_packages`, because `20260622150000_add_lawyer_handoff_packages_foundation` creates it.
- `communications` and `communication_attachments`, because `20260628190000_add_communication_baseline` creates them.
- any Client Portal tables.
- any Connector tables.

## 6. Why current schema is not automatically the baseline

The current Prisma schema is a later product state. It includes objects and columns added by migrations after the no-op baseline, including:

- workload tracking;
- anonymization/rehydration tables and fields;
- client identity fields;
- case collaborator table;
- timesheet report objects;
- legal analysis objects;
- client house style profile;
- lawyer handoff packages;
- communication baseline and Outlook provider fields.

Generating a bootstrap from the current schema would be unsafe because it could:

- create objects that later migrations also create;
- add columns that later migrations attempt to add;
- create enum types that later migrations expect to create;
- hide broken migration ordering;
- make local proof pass while production-like clone proof fails;
- imply the bootstrap is a production baseline, which it is not.

The bootstrap must represent only the historical pre-`20260212180000` state, and that shape must be recovered from historical evidence or a production-like clone schema inventory.

## 7. Local-only bootstrap approach

Future flow, to be executed only in a separate explicit task:

1. Create a disposable local DB, for example:
   - `adminiculum_baseline_bootstrap_proof`
   - optional shadow DB: `adminiculum_baseline_bootstrap_shadow`
2. Verify target guard:
   - host is local;
   - database name matches the disposable proof name;
   - target is not `localhost/adminiculum`;
   - target is empty except possibly PostgreSQL extensions.
3. Apply local-only baseline bootstrap SQL:
   - not a Prisma migration;
   - not in `Backend/prisma/migrations`;
   - clearly commented as local-only and disposable;
   - creates only the pre-existing baseline objects required before `20260212180000`.
4. Run existing repo migrations in a later explicit execution task:
   - set `DATABASE_URL` only in the shell for the disposable DB;
   - `cd Backend`;
   - `npx.cmd prisma migrate deploy`.
5. Confirm proof:
   - `npx.cmd prisma migrate status`;
   - read-only inspection of `_prisma_migrations`;
   - read-only inspection of expected tables;
   - `npx.cmd prisma validate`;
   - backend typecheck/tests.

Metadata strategy:

- Prefer not to manually write `_prisma_migrations`.
- Because `20260211153100_baseline` exists and is no-op, `prisma migrate deploy` should insert the baseline migration row itself before applying later migrations.
- Manual migration metadata writes should be avoided unless a future proof run demonstrates they are necessary and documents why.

## 8. Bootstrap SQL design principles

Future bootstrap SQL should:

- begin with strong comments: local-only, disposable, not production, not deployable, not a Prisma migration;
- create only baseline objects that existed before `20260212180000_add_workload_tracking`;
- avoid objects created by later repo migrations;
- avoid Client Portal objects;
- avoid Connector objects;
- avoid sample business data;
- avoid secrets;
- avoid current-schema-only columns introduced by later migrations;
- use `IF NOT EXISTS` sparingly, because it can hide ordering mistakes;
- prefer failing loudly when a target is not empty or not disposable;
- include target-check guidance outside SQL before execution;
- include no `DROP DATABASE`, no destructive cleanup, and no reset of existing DBs.

Minimal seed-data rule:

- Do not insert rows by default.
- If a later migration truly requires an FK target row rather than just a table, use clearly fake/disposable rows only after explicit review.
- Current inspected early migrations require missing tables/FK targets, not real business rows.

## 9. Draft SQL appendix decision

Decision: **do not include executable SQL draft in this document**.

Reason:

- The object inventory is not complete enough to safely draft SQL.
- Exact historical column types, enum types, constraints, and FK shapes must be recovered from historical evidence or clone inventory.
- A fenced SQL block could be copied and run prematurely.
- The next safe step is a more precise inventory, not a runnable script.

Allowed future appendix style:

- pseudocode only, or
- a non-executable checklist of object families, or
- a separately requested local-only draft SQL file after target guards and historical evidence are reviewed.

No standalone `.sql` file was created in this task.

## 10. Production-like proof requirement

Local bootstrap proof is useful, but not enough for deploy confidence.

Any future Client Portal or Connector schema migration still needs:

- production-like clone or PITR clone proof;
- proof that the clone has the real historical baseline state;
- proof that `_prisma_migrations` matches production expectations;
- read-only drift inspection before applying candidate migrations;
- candidate migration SQL review;
- candidate migration apply to clone/staging before production planning;
- confirmation no destructive statements are present;
- confirmation no runtime feature is enabled by schema alone.

Production apply must remain separate, explicit, and approval-gated.

## 11. Future execution plan

Recommended future sequence:

1. Finalize bootstrap object inventory from historical baseline evidence and/or production-like clone schema inventory.
2. Create a local-only bootstrap SQL draft, clearly not a migration.
3. Create a new disposable local proof DB.
4. Apply bootstrap SQL to the disposable DB only.
5. Run existing repo migrations against the disposable DB.
6. Capture clean migration proof and migration status.
7. Only then implement `CP-SCHEMA-1` or `CONNECTOR-SCHEMA-1` candidate migration.
8. Apply candidate migration to disposable proof DB.
9. Apply candidate migration to production-like clone/staging.
10. Only then consider production migration preflight.

Suggested guard commands for future execution tasks should always print:

- current branch;
- target `DATABASE_URL` host and database name, sanitized;
- current database via `SELECT current_database()`;
- proof that target DB is disposable and not `adminiculum`.

Do not run those DB commands in this design task.

## 12. Risk register

| Risk | Severity | Mitigation | Blocking status |
| --- | --- | --- | --- |
| Bootstrap accidentally used on production | Critical | Do not create standalone SQL yet; future script must include loud comments and target guards | Blocking |
| Bootstrap duplicates later migration objects | High | Inventory must exclude objects created by later migrations | Blocking |
| Bootstrap based on current schema instead of historical baseline | Critical | Use historical/clone evidence; current schema only as a reference | Blocking |
| Missing baseline object causes later migration failure | High | Build object inventory from all later `ALTER TABLE` and FK references | Blocking |
| Wrong FK/index shape causes false confidence | High | Compare against production-like clone before deploy-facing migration | Blocking |
| Manual `_prisma_migrations` metadata causes mismatch | High | Prefer letting `migrate deploy` apply the no-op baseline row | Blocking unless proven necessary |
| Disposable DB confused with real local DB | Critical | Require database-name guard and never target `localhost/adminiculum` | Blocking |
| Local proof passes but production clone fails | High | Require production-like clone proof before production planning | Blocking for deploy confidence |
| Baseline hides real migration-chain defects | High | Keep proof artifacts separate; record exact bootstrap assumptions | Blocking |
| `IF NOT EXISTS` hides ordering errors | Medium | Use sparingly and document why each guard exists | Blocking for SQL draft |
| Fake seed data leaks into real environments | Critical | No seed rows by default; if required, clearly disposable only | Blocking |

## 13. Blocking issues

Still blocking `CP-SCHEMA-1` and `CONNECTOR-SCHEMA-1`:

- no reviewed local-only bootstrap SQL exists;
- no green disposable local migration proof exists;
- no production-like clone proof exists for the future candidate migrations;
- exact historical baseline shape is not yet fully recovered;
- current schema cannot be used as a baseline substitute;
- no standalone bootstrap execution safeguards have been reviewed.

This document improves the path, but it does not unblock schema implementation yet.

## 14. Recommended next prompt

Recommended next prompt:

`Adminiculum — baseline object inventory for local-only Prisma bootstrap docs-only`

That prompt should:

- inspect every existing migration for baseline object assumptions;
- produce a complete baseline object inventory;
- avoid executable SQL;
- avoid DB connections;
- avoid schema/migration/runtime changes;
- identify which objects require historical/clone evidence before SQL can be drafted.

After that, a later prompt can be:

`Adminiculum — local-only baseline bootstrap SQL draft docs-contained no execution`

That later prompt should still avoid running SQL and should keep any draft clearly outside `Backend/prisma/migrations`.
