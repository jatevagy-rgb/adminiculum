# Client Portal v1 Clean Local Migration Target Preflight

Classification target: `client_portal_v1_clean_local_migration_target_preflight_documented_no_runtime_change_no_db_change`

Preflight date: 2026-07-01

This document prepares the safe local/shadow database approach for future Client Portal CP-SCHEMA-1 work. It does not create CP-SCHEMA-1, edit `Backend/prisma/schema.prisma`, create Prisma migration files, create Client Portal tables, run mutating database commands, add API routes, add frontend UI, change auth, enable the client portal, or deploy.

## 1. Executive summary

The current local database `localhost/adminiculum` must not be used as proof for future Client Portal migrations. It has known migration-history drift around the lawyer handoff package foundation:

- local `_prisma_migrations` contains `20260515190000_add_lawyer_handoff_package`;
- current repo migration history does not contain that migration;
- current repo contains `20260622150000_add_lawyer_handoff_packages_foundation` instead;
- `prisma migrate status` against the current local DB reports history mismatch.

Recommended approach:

1. Keep `localhost/adminiculum` untouched.
2. Create a separate clean local database for migration-chain proof, for example `adminiculum_cp_schema_clean`.
3. Optionally create a separate shadow database for future `prisma migrate dev` generation, for example `adminiculum_shadow_cp`.
4. Temporarily point `DATABASE_URL` and, if needed, `SHADOW_DATABASE_URL` to those clean local databases for the CP-SCHEMA-1 session only.
5. Prove the current repo migration chain applies cleanly from zero before generating CP-SCHEMA-1.

CP-SCHEMA-1 is not ready to generate in this task. It still requires manual clean-DB proof first.

## 2. Why current local DB is not a safe migration target

Current local target observed from `Backend/.env`:

- host: `localhost`;
- database: `adminiculum`;
- `SHADOW_DATABASE_URL`: not configured.

Known problem:

- The current local DB has real local migration metadata and objects that do not match the active repo migration history.
- The mismatch is already documented in:
  - `docs/client-portal-v1-db-drift-readiness-audit.md`;
  - `docs/client-portal-v1-migration-history-hygiene-preflight.md`;
  - `docs/migration-history-reconciliation-lawyer-handoff-decision.md`.

Why it matters:

- Generating CP-SCHEMA-1 against the drifted DB could produce SQL that depends on local-only history.
- A green result against the drifted DB would not prove that the current repo migration chain works on a clean database.
- A failing result against the drifted DB might be caused by unrelated historical drift rather than by Client Portal schema design.

Conclusion:

- `localhost/adminiculum` is useful as a local development database only.
- It is not a migration-readiness proof target for CP-SCHEMA-1.

## 3. Safety rules

Allowed in this preflight:

- inspect `Backend/.env` without printing secret values;
- inspect env examples;
- inspect Prisma datasource config;
- inspect package scripts;
- inspect migration docs;
- recommend clean local database names;
- document a manual command plan.

Not done:

- no production DB access;
- no Azure DB access;
- no DB writes;
- no database creation;
- no database drop/reset;
- no `prisma migrate deploy`;
- no `prisma migrate dev`;
- no `prisma db push`;
- no schema edit;
- no migration file creation;
- no Client Portal tables;
- no runtime changes;
- no deploy.

## 4. Current local DB configuration review

Prisma datasource:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Package scripts:

- `db:status`: `prisma migrate status`
- `db:deploy`: `prisma migrate deploy`
- `prisma:migrate`: `prisma migrate dev`
- `db:bootstrap`: `prisma db push`
- `db:generate`: `prisma generate`

Environment file findings:

- `Backend/.env` exists and contains `DATABASE_URL` pointing to `localhost/adminiculum`.
- `Backend/.env` does not contain `SHADOW_DATABASE_URL`.
- `Backend/.env.example` contains `DATABASE_URL` pointing to `localhost/adminiculum`.
- `Backend/.env.example` does not contain `SHADOW_DATABASE_URL`.
- `Frontend/.env.example` does not contain database settings.

Implications:

- A clean migration proof session should not edit or commit env files.
- Use a temporary shell-level `DATABASE_URL` override for the clean DB.
- If using `prisma migrate dev` later to generate CP-SCHEMA-1, use a temporary shell-level `SHADOW_DATABASE_URL` override or a separate `.env` copy kept out of git.
- Do not use `db:bootstrap` / `prisma db push` for CP-SCHEMA-1 proof; it bypasses migration history.

## 5. Clean target options

### Option A — New clean local database

Example name: `adminiculum_cp_schema_clean`

Purpose:

- apply the current repo migration chain from zero;
- verify `prisma migrate status` becomes clean;
- prove there are no missing/duplicate migration artifacts in the active repo chain.

Pros:

- isolates proof from drifted `localhost/adminiculum`;
- no production/Azure risk;
- can be recreated if proof fails;
- directly tests `prisma migrate deploy` against the repo migration chain.

Risks:

- requires local PostgreSQL privileges to create/drop databases;
- mutating commands must point only to the clean database;
- fresh-chain failure would need separate investigation.

Suitability:

- Recommended for CP-SCHEMA-1 readiness.

### Option B — New clean shadow database

Example name: `adminiculum_shadow_cp`

Purpose:

- shadow database for future `prisma migrate dev` migration generation, if used.

Pros:

- separates schema-diff generation from the clean proof database;
- avoids Prisma using the drifted `localhost/adminiculum` as a shadow target;
- supports safer future migration creation.

Risks:

- still requires local PostgreSQL privileges;
- accidentally pointing it to a non-disposable DB would be dangerous;
- only useful for generation, not final migration-chain proof.

Suitability:

- Recommended if CP-SCHEMA-1 is generated with `prisma migrate dev`.

### Option C — Temporary disposable database

Example name: `adminiculum_cp_schema_tmp_YYYYMMDD`

Purpose:

- one-off proof target that can be dropped after validation.

Pros:

- clean and explicit;
- low long-term maintenance;
- useful for repeatable preflight snapshots.

Risks:

- creation/drop commands are destructive if pointed at the wrong database;
- requires strong naming and connection-string checks.

Suitability:

- Good for short-lived migration proof, provided commands are reviewed before execution.

### Option D — Keep using current `localhost/adminiculum`

Assessment: rejected.

Reason:

- it is already known drifted;
- it contains a historical migration row absent from the active repo chain;
- it cannot prove current repo migration-chain health for CP-SCHEMA-1.

## 6. Recommended approach

Recommended path before CP-SCHEMA-1:

1. Leave `Backend/.env` and `localhost/adminiculum` unchanged.
2. Create `adminiculum_cp_schema_clean` manually in local PostgreSQL.
3. Optionally create `adminiculum_shadow_cp` manually for future migration generation.
4. In a temporary shell only, override `DATABASE_URL` to point at `adminiculum_cp_schema_clean`.
5. Run `prisma validate`.
6. Run `prisma migrate deploy` only against `adminiculum_cp_schema_clean`.
7. Run `prisma migrate status` against `adminiculum_cp_schema_clean`.
8. Confirm no `client_portal_*` tables or `ClientPortal*` enums exist before CP-SCHEMA-1.
9. Run backend typecheck/tests.
10. Only then open a separate CP-SCHEMA-1 implementation task.

This keeps database mutation isolated to a new disposable local DB and avoids rewriting migration history.

## 7. Manual clean DB command plan

Do not run this plan against production, Azure, clone/staging, or `localhost/adminiculum`.

### A) Create clean DB manually

Use the local PostgreSQL administration method available on the workstation. Examples:

```powershell
createdb adminiculum_cp_schema_clean
createdb adminiculum_shadow_cp
```

or through `psql`:

```sql
CREATE DATABASE adminiculum_cp_schema_clean;
CREATE DATABASE adminiculum_shadow_cp;
```

Do not include passwords in scripts or docs.

### B) Temporarily set connection strings in shell only

Use the same local credentials style as the existing local setup, but target only the clean databases.

PowerShell pattern:

```powershell
$env:DATABASE_URL = "postgresql://<local-user>:<local-password>@localhost:5432/adminiculum_cp_schema_clean?schema=public"
$env:SHADOW_DATABASE_URL = "postgresql://<local-user>:<local-password>@localhost:5432/adminiculum_shadow_cp?schema=public"
```

Do not edit or commit `Backend/.env`.

### C) Apply current repo migration chain to clean DB

From `Backend/`:

```powershell
npx.cmd prisma validate
npx.cmd prisma migrate deploy
npx.cmd prisma migrate status
```

Expected result:

- `migrate deploy` applies the active repo migration chain to the clean DB;
- `migrate status` reports the database schema is up to date;
- there is no `P3015`;
- there is no missing `20260515190000_add_lawyer_handoff_package` row because the clean DB follows current repo history.

### D) Confirm no Client Portal objects exist yet

Run read-only metadata checks against the clean DB only:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'client_portal_%'
ORDER BY table_name;
```

```sql
SELECT t.typname
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
  AND t.typname LIKE 'ClientPortal%'
ORDER BY t.typname;
```

Expected result:

- no rows before CP-SCHEMA-1.

### E) Run backend validation

From `Backend/`:

```powershell
npx.cmd tsc --noEmit
npm.cmd test -- --runInBand
```

### F) Do not keep shell overrides accidentally

After the session:

```powershell
Remove-Item Env:\DATABASE_URL
Remove-Item Env:\SHADOW_DATABASE_URL
```

Then reopen the shell or re-check the target before any future DB command.

## 8. Migration proof criteria

Before CP-SCHEMA-1 can be generated:

- clean DB exists;
- drifted `localhost/adminiculum` is not used;
- current repo migration chain applies from zero;
- `prisma migrate status` is clean on the clean DB;
- no `P3015`;
- no missing migration rows;
- no failed migrations;
- no `client_portal_*` tables;
- no `ClientPortal*` enums;
- `prisma validate` passes;
- backend `tsc --noEmit` passes;
- backend tests pass;
- no production/Azure/clone DB was used;
- no env files were committed;
- Client Portal remains disabled.

## 9. CP-SCHEMA-1 readiness checklist

- [ ] Clean DB selected.
- [ ] Shadow DB selected, if needed.
- [ ] Current drifted DB not used.
- [ ] Temporary connection strings reviewed and point to local clean DBs.
- [ ] Current repo migration chain applied cleanly to clean DB.
- [ ] `prisma migrate status` clean on clean DB.
- [ ] `prisma validate` passes.
- [ ] Backend `tsc --noEmit` passes.
- [ ] Backend tests pass.
- [ ] No production/Azure connection used.
- [ ] No env files committed.
- [ ] No Client Portal runtime enabled.
- [ ] No Client Portal tables exist before CP-SCHEMA-1.

## 10. Risk register

| Risk | Severity | Mitigation | Blocking status |
| --- | --- | --- | --- |
| Accidentally pointing to production or Azure DB | Critical | Use only `localhost`; print sanitized host/database before mutating commands; never paste production URLs | Blocking unless target proof is local |
| Accidentally resetting current `localhost/adminiculum` | High | Do not run reset/drop against current DB; use new DB name with `cp_schema_clean` suffix | Blocking |
| Committing local env changes | High | Use shell overrides only; do not edit `.env` | Blocking |
| Using drifted DB as proof | High | Reject `localhost/adminiculum`; require clean DB status | Blocking |
| Clean DB migration chain fails | High | Stop and audit failing migration; do not proceed to CP-SCHEMA-1 | Blocking |
| Shadow DB unavailable | Medium | Create a separate local shadow DB or avoid `migrate dev` until available | Blocking for generation if `migrate dev` is used |
| Migration chain depends on manual production state | High | Fresh clean DB proof exposes this before Client Portal work | Blocking if encountered |
| CP-SCHEMA-1 generated from wrong DB state | High | Require target banner and `migrate status` proof before generation | Blocking |
| `prisma db push` bypasses migrations | High | Do not use `db:bootstrap` for migration readiness | Blocking |

## 11. Blocking issues

Current blockers before CP-SCHEMA-1:

1. Clean local/shadow DB proof has not been executed yet.
2. Current `localhost/adminiculum` remains unsuitable as migration proof.
3. No clean `prisma migrate status` evidence exists yet for the active repo chain.

Not blockers for this docs-only preflight:

- no schema or migration files changed;
- no DB was mutated;
- no Client Portal runtime work started.

## 12. Validation

Validation run for this docs-only preflight:

- `git diff --check` — passed.
- `cd Backend && npx.cmd prisma validate` — passed.
- `cd Backend && npx.cmd tsc --noEmit` — passed.
- `cd Backend && npm.cmd test -- --runInBand` — passed: 8 suites, 92 tests.

Not run:

- no `prisma migrate deploy`;
- no `prisma migrate dev`;
- no `prisma db push`;
- no clean DB creation;
- no DB reset/drop.

## 13. Recommended next prompt

Recommended next prompt:

`Adminiculum — CLIENTPORTAL1G clean local migration chain proof for CP-SCHEMA-1`

Suggested scope:

- create/select clean local DB only after explicit approval;
- use temporary shell `DATABASE_URL`/`SHADOW_DATABASE_URL`;
- run `prisma migrate deploy` only against the clean local DB;
- prove current repo migration chain is clean;
- confirm no Client Portal objects exist yet;
- do not create CP-SCHEMA-1 until proof is green.

Final classification:

`client_portal_v1_clean_local_migration_target_preflight_documented_no_runtime_change_no_db_change`
