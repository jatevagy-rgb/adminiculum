# Client Portal v1 Clean Local Migration Chain Proof

Classification target: `client_portal_v1_clean_local_migration_chain_blocked_no_runtime_change_no_schema_change_no_prod_change`

Proof date: 2026-07-01

Branch: `hotfix/runtime-shape-20260308`

This document records the attempted clean local migration-chain proof before future Client Portal CP-SCHEMA-1 work. It does not create CP-SCHEMA-1, edit `Backend/prisma/schema.prisma`, create or edit migration files, create Client Portal tables, change runtime behavior, touch production/Azure, or deploy.

## 1. Summary

The clean local migration-chain proof did **not** pass.

Local clean databases were created and verified empty:

- main proof DB: `adminiculum_cp_schema_clean`;
- shadow DB: `adminiculum_shadow_cp`.

The proof used temporary shell-level environment overrides only:

- `DATABASE_URL`: `postgresql://<user>:<redacted>@localhost:5432/adminiculum_cp_schema_clean?schema=public`
- `SHADOW_DATABASE_URL`: `postgresql://<user>:<redacted>@localhost:5432/adminiculum_shadow_cp?schema=public`

`localhost/adminiculum` was not used as a migration target.

`npx.cmd prisma migrate deploy` against `adminiculum_cp_schema_clean` failed at:

`20260212180000_add_workload_tracking`

Failure:

```text
ERROR: relation "clients" does not exist
```

Root cause indicated by the clean proof:

- `20260211153100_baseline` is a no-op baseline ending in `SELECT 1`;
- `20260212180000_add_workload_tracking` assumes the existence of `clients`;
- therefore the active repo migration chain cannot bootstrap from an empty database in its current form.

CP-SCHEMA-1 remains blocked until the baseline/new-environment strategy is decided.

## 2. Target DBs

Created or verified:

| Database | Host | Purpose | Result |
| --- | --- | --- | --- |
| `adminiculum_cp_schema_clean` | `localhost` | clean migration-chain proof | created empty, then mutated only by failed proof |
| `adminiculum_shadow_cp` | `localhost` | future shadow DB | created empty, not used by `migrate deploy` |

Sanitized target pattern:

`postgresql://<user>:<redacted>@localhost:5432/<database>?schema=public`

Explicitly not targeted:

- `localhost/adminiculum`;
- any production database;
- any Azure database;
- any clone/staging database.

## 3. Commands executed

Preparation:

- inspected branch/status;
- inspected `docs/client-portal-v1-clean-local-migration-target-preflight.md`;
- inspected Prisma datasource and migration count;
- created `adminiculum_cp_schema_clean` if missing;
- created `adminiculum_shadow_cp` if missing;
- verified both were empty before migration proof.

Migration proof:

```powershell
cd Backend
npx.cmd prisma validate
npx.cmd prisma migrate deploy
```

`prisma migrate deploy` failed at `20260212180000_add_workload_tracking`, so the following migration-proof commands were not completed as a successful chain:

- `npx.cmd prisma generate`;
- a clean, green `npx.cmd prisma migrate status`.

Read-only follow-up:

- inspected `_prisma_migrations` and public tables in `adminiculum_cp_schema_clean`;
- ran `npx.cmd prisma migrate status` against `adminiculum_cp_schema_clean` to capture blocked state.

Non-mutating validation:

```powershell
cd Backend
npx.cmd prisma validate
npx.cmd tsc --noEmit
npm.cmd test -- --runInBand
git diff --check
```

## 4. Migration deploy result

Result: failed.

Observed output:

```text
Applying migration `20260211153100_baseline`
Applying migration `20260212180000_add_workload_tracking`
Error: P3018

Migration name: 20260212180000_add_workload_tracking
Database error code: 42P01
ERROR: relation "clients" does not exist
```

Relevant migration evidence:

- `20260211153100_baseline/migration.sql` is intentionally a no-op baseline:
  - comments describe it as establishing initial state;
  - SQL ends with `SELECT 1`.
- `20260212180000_add_workload_tracking/migration.sql` creates `client_workgroups` with:
  - `"clientId" UUID NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE`.

Because the clean database has no `clients` table after the no-op baseline, the second migration cannot apply.

## 5. Clean DB read-only inspection after failure

Read-only inspection of `adminiculum_cp_schema_clean` after failure found:

- current database: `adminiculum_cp_schema_clean`;
- `_prisma_migrations` exists;
- public tables: only `_prisma_migrations`;
- finished migration rows:
  - `20260211153100_baseline`;
- failed/unresolved migration rows:
  - `20260212180000_add_workload_tracking` with logs present and `finished_at = null`.

`prisma migrate status` against the clean DB reported 20 migration folders and the remaining migrations as unapplied. This is not a green proof.

## 6. Validation results

Validation that does not depend on the clean migration proof:

- `git diff --check` — passed.
- `cd Backend && npx.cmd prisma validate` — passed.
- `cd Backend && npx.cmd tsc --noEmit` — passed.
- `cd Backend && npm.cmd test -- --runInBand` — passed: 8 suites, 92 tests.

Not completed due to failed migration chain:

- `npx.cmd prisma generate` as part of the proof sequence;
- clean `npx.cmd prisma migrate status`;
- Client Portal object absence proof after a fully migrated clean chain.

## 7. Safety confirmation

- Runtime change: no.
- Schema file change: no.
- Migration file change: no.
- Production/Azure change: no.
- Deploy: no.
- Existing drifted `localhost/adminiculum` migration target touched: no.
- DB connection used: local clean DBs only.
- Secrets printed: no.
- Client Portal enabled: no.
- Client Portal tables created: no.

Local DB changes made:

- created `adminiculum_cp_schema_clean`;
- created `adminiculum_shadow_cp`;
- `adminiculum_cp_schema_clean` now contains `_prisma_migrations` state from the failed proof.

No destructive cleanup was performed. Do not reuse `adminiculum_cp_schema_clean` as a clean target unless it is explicitly dropped/recreated in a later approved local-only task.

## 8. CP-SCHEMA-1 status

CP-SCHEMA-1 is **not ready**.

The blocker is now broader than the prior local `localhost/adminiculum` drift: the active repo migration chain cannot currently build a fresh database from zero because its no-op baseline assumes a pre-existing database shape.

Before CP-SCHEMA-1 generation, the team must decide how new local/shadow migration targets should be initialized:

- use a restored faithful baseline that creates the initial schema;
- use a reviewed schema-only baseline for disposable local proof;
- use a clone/staging target that already has the historical baseline schema;
- or create a documented local-only bootstrap path that is not confused with production migration history.

## 9. Recommended next prompt

Recommended next prompt:

`Adminiculum — baseline bootstrap strategy for clean local Prisma migration proof`

Suggested scope:

- docs/design or explicit local-only operational plan first;
- no production/Azure access;
- no CP-SCHEMA-1 yet;
- decide how to initialize a clean local DB so repo migrations after the no-op baseline can be tested honestly;
- do not edit historical migrations until a strategy is approved.

Final classification:

`client_portal_v1_clean_local_migration_chain_blocked_no_runtime_change_no_schema_change_no_prod_change`
