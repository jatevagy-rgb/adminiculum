# Client Portal v1 Migration History Hygiene Preflight

Classification target: `client_portal_v1_migration_history_hygiene_blocked_no_runtime_change_no_db_change`

Audit date: 2026-07-01

This is a migration-history hygiene preflight before any future Client Portal CP-SCHEMA-1 migration work. It does not create Client Portal tables, edit `Backend/prisma/schema.prisma`, create a new Prisma migration, apply migrations, run `prisma migrate dev`, run `prisma migrate deploy`, run `prisma db push`, change runtime behavior, add routes, change auth, enable the client portal, or deploy.

## 1. Executive summary

The original `P3015` blocker was caused by an empty local filesystem directory:

`Backend/prisma/migrations/20260515190000_add_lawyer_handoff_package`

That empty directory was not tracked by git and contained no files. Removing it locally cleared the direct `P3015` condition, but exposed a deeper migration-history mismatch:

- the local non-production DB has `20260515190000_add_lawyer_handoff_package` recorded as applied;
- the current repo migration history does not contain that migration;
- the current repo instead contains `20260622150000_add_lawyer_handoff_packages_foundation`, which creates the same handoff package foundation objects.

Classification: case **D) Unknown / unsafe**, with evidence of an applied historical migration missing from current repo history.

No repo migration repair was performed because restoring the old SQL would create a duplicate migration path for fresh databases, and deleting/rewriting applied migration history would be unsafe without a dedicated migration-history reconciliation decision.

CP-SCHEMA-1 remains blocked until the migration-history mismatch is deliberately reconciled.

## 2. Original blocker

Previous drift audit found:

- `Backend/prisma/migrations/20260515190000_add_lawyer_handoff_package` existed locally as a migration folder.
- It did not contain `migration.sql`.
- `npx prisma migrate status` failed with `P3015`.

The relevant Prisma error:

`Could not find the migration file at prisma\migrations\20260515190000_add_lawyer_handoff_package\migration.sql. Please delete the directory or restore the migration file.`

## 3. Evidence inspected

Commands/evidence used:

- current branch/status check;
- `Get-ChildItem -Force Backend\prisma\migrations\20260515190000_add_lawyer_handoff_package`;
- `git ls-files Backend/prisma/migrations/20260515190000_add_lawyer_handoff_package`;
- `git log -- Backend/prisma/migrations/20260515190000_add_lawyer_handoff_package`;
- `git show --stat --name-status 778105e`;
- `git show --stat --name-status a5d54f0`;
- `git show 778105e:Backend/prisma/migrations/20260515190000_add_lawyer_handoff_package/migration.sql`;
- `Get-Content Backend/prisma/migrations/20260622150000_add_lawyer_handoff_packages_foundation/migration.sql`;
- read-only query of local `_prisma_migrations` through Prisma.

Findings:

- Commit `778105e` added `Backend/prisma/migrations/20260515190000_add_lawyer_handoff_package/migration.sql`.
- Commit `a5d54f0` deleted that SQL file and added `Backend/prisma/migrations/20260622150000_add_lawyer_handoff_packages_foundation/migration.sql`.
- The deleted 202605 SQL and the current 202606 SQL both create the `LawyerHandoffPackageType`, `LawyerHandoffStatus`, and `LawyerHandoffDecision` enums and the `lawyer_handoff_packages` table.
- The 202606 SQL is not merely a harmless rename marker; it creates the same foundation objects and would conflict if the old 202605 migration were restored and both were applied to a fresh database.
- The empty 202605 directory was not tracked by git in the current tree.

## 4. Local DB read-only check result

DB connection used:

- source: `Backend/.env`
- observed target: local `localhost/adminiculum`
- production DB: not used

Read-only local `_prisma_migrations` result:

- `20260515190000_add_lawyer_handoff_package` is present and finished.
- No similarly named later handoff package migration is present locally.
- Latest applied local migration is `20260518120000_add_workspace_text`.

After the empty local folder was removed, `npx prisma migrate status` no longer failed with `P3015`, but reported:

- 20 local migrations found;
- last common migration: `20260518120000_add_workspace_text`;
- unapplied local migrations:
  - `20260622150000_add_lawyer_handoff_packages_foundation`;
  - `20260628190000_add_communication_baseline`;
  - `20260701120000_add_outlook_communication_provider_fields`;
- database migration not found locally:
  - `20260515190000_add_lawyer_handoff_package`.

No database writes were performed.

## 5. Classification

Chosen classification: **D) Unknown / unsafe**.

Why not A, unapplied orphan folder:

- the migration name is present in local `_prisma_migrations`;
- it was historically a real migration file, not merely an accidental empty folder.

Why not C, duplicate/renamed artifact with safe deletion:

- a later similarly named migration exists, but it creates the same database objects rather than simply replacing an unapplied empty artifact;
- local DB history confirms the older migration was applied locally.

Why not restore immediately as case B:

- the exact old SQL can be reconstructed from git history, but restoring it into current repo history would make the current chain contain two migrations that create the same enums/table;
- a fresh database applying both `20260515190000_add_lawyer_handoff_package` and `20260622150000_add_lawyer_handoff_packages_foundation` would be expected to fail on duplicate type/table creation unless one migration were edited, which is outside this preflight and would alter migration history.

## 6. Repair performed

Performed:

- removed the empty untracked local directory `Backend/prisma/migrations/20260515190000_add_lawyer_handoff_package`;
- added this docs-only hygiene note.

Not performed:

- no historical SQL restored;
- no current migration SQL edited;
- no migration folder committed or deleted;
- no `schema.prisma` change;
- no `prisma migrate resolve`;
- no migration apply;
- no DB write;
- no runtime code change.

The local empty directory removal was not a repo change because git does not track empty directories.

## 7. Validation results

Validation run:

- `git diff --check` — passed.
- `cd Backend && npx.cmd prisma validate` — passed.
- `cd Backend && npx.cmd prisma migrate status` — no longer failed with `P3015`, but reported migration-history mismatch between local DB and repo.
- `cd Backend && npx.cmd tsc --noEmit` — passed.
- `cd Backend && npm.cmd test -- --runInBand` — passed: 8 suites, 92 tests.

Expected remaining non-green command:

- `prisma migrate status` is still not green against the local DB because `_prisma_migrations` contains `20260515190000_add_lawyer_handoff_package`, while current repo migrations do not.

## 8. Remaining risks

| Risk | Severity | Evidence | Mitigation |
| --- | --- | --- | --- |
| Local DB has applied migration missing from repo | High | `_prisma_migrations` contains `20260515190000_add_lawyer_handoff_package`; current repo does not | Dedicated migration-history reconciliation task before CP-SCHEMA-1 |
| Restoring deleted SQL creates duplicate fresh-DB path | High | 202605 and 202606 migrations both create lawyer handoff package enums/table | Do not restore without deciding whether to remove/replace/reconcile the later migration |
| Local DB is behind current repo migrations | Medium | Latest applied local migration is `20260518120000_add_workspace_text` | Use clone/staging or clean local DB for future migration proof |
| Production/clone migration state unknown for Client Portal work | High | This preflight used only local DB | Run read-only target introspection before real CP-SCHEMA-1 |
| Future CP-SCHEMA-1 generated from dirty history | High | `migrate status` remains non-green | Block CP-SCHEMA-1 until history is reconciled |

## 9. Readiness for CP-SCHEMA-1

CP-SCHEMA-1 is **not yet unblocked**.

The immediate `P3015` symptom is removed locally, but the underlying migration-history mismatch remains unresolved. A future Client Portal migration candidate should not be created until one of these paths is selected:

1. Keep the current repo migration chain and use a clean local/clone DB that has not applied the deleted `20260515190000_add_lawyer_handoff_package` migration.
2. Restore the historical 202605 migration and remove or rewrite the duplicate 202606 handoff migration through a dedicated migration-history reconciliation task.
3. Document production/clone as canonical and create a controlled reconcile plan that does not rewrite applied production history or break fresh database setup.

Do not proceed by adding a fake empty `migration.sql`; that would hide the problem and make future drift harder to reason about.

## 10. Recommended next prompt

Recommended next prompt:

`Adminiculum — migration history reconciliation decision for lawyer handoff package foundation`

Suggested scope:

- inspect production/clone `_prisma_migrations` read-only;
- decide whether current repo history or applied DB history is canonical for `lawyer_handoff_packages`;
- do not create Client Portal tables;
- do not apply migrations;
- produce a reconciliation plan before any SQL or schema changes.

Final classification:

`client_portal_v1_migration_history_hygiene_blocked_no_runtime_change_no_db_change`
