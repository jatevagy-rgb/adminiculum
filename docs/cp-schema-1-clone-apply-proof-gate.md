# CP-SCHEMA-1 Clone Apply Proof Gate

Classification target: `cp_schema1_clone_apply_proof_gate_documented_no_db_change_no_runtime_change`

This document defines the gate for a later clone-only apply proof of CP-SCHEMA-1. It is a planning/control document only: no database connection was opened, no SQL was run, no Prisma migrate command was run, no deployment occurred, and no Client Portal runtime behavior was enabled.

## 1. Executive summary

CP-SCHEMA-1 has progressed through schema candidate, SQL review, migration-file creation, and clone transactional rollback proof. The next safe proof is not production apply; it is a clone-only apply proof against the confirmed non-production production-like clone.

The clone apply proof should demonstrate that `Backend/prisma/migrations/20260702140000_add_client_portal_foundation/migration.sql` can be applied durably to a disposable or explicitly approved clone, that Prisma migration metadata can be recorded correctly, and that the resulting schema shape matches the additive Client Portal foundation without exposing existing client data or enabling runtime access.

Production remains blocked until the clone apply proof is completed, documented, reviewed, and separately approved.

## 2. Current evidence chain

Evidence already available:

- `2985f6d` — CP-SCHEMA-1 implementation preflight documented.
- `6fc5582` — CP-SCHEMA-1 Prisma schema candidate drafted.
- `f5d9fce` — CP-SCHEMA-1 migration SQL draft review documented.
- `1f43dab` — real migration file created at `Backend/prisma/migrations/20260702140000_add_client_portal_foundation/migration.sql`.
- `015f859` — clone transactional rollback proof documented.

Transactional proof result from `docs/cp-schema-1-clone-transactional-proof.md`:

- migration SQL executed successfully inside `BEGIN`;
- 16 Client Portal enum types were created inside the transaction;
- 7 Client Portal tables were created inside the transaction;
- 39 indexes were created inside the transaction;
- 18 foreign keys were created inside the transaction;
- `ROLLBACK` was executed;
- post-rollback Client Portal tables were absent;
- post-rollback Client Portal enum types were absent;
- baseline tables remained present;
- no production database was targeted;
- no persisted database change remained.

## 3. Why production remains blocked

Production remains blocked because transactional execution proves syntax and dependency compatibility only. It does not prove durable migration metadata, post-apply Prisma status behavior, repeated metadata introspection after connection close, or operational readiness for a real migration window.

Production must not be targeted until a clone apply proof confirms:

- the clone identity is non-production and isolated;
- the migration can be applied durably on the clone;
- `_prisma_migrations` records `20260702140000_add_client_portal_foundation` as finished and not rolled back;
- schema objects persist after the apply connection ends;
- no seed data or visibility-changing data is introduced;
- no Client Portal runtime, public route, app setting, or deployment is enabled;
- rollback/abandon expectations are documented for the disposable clone.

## 4. What clone apply proof would test

The later clone apply proof should test the durable apply path only on the confirmed clone:

- apply exactly `20260702140000_add_client_portal_foundation` to the clone;
- create the 16 enum types and 7 tables from the migration file;
- create the expected 39 indexes and 18 FKs;
- record the migration as applied in `_prisma_migrations`;
- confirm existing baseline objects remain present;
- confirm no Client Portal rows are seeded;
- confirm no existing internal objects become client-visible;
- confirm Prisma validation and backend tests still pass from the repo state.

This proof is not a runtime implementation and must not start the Client Portal.

## 5. Required clone identity confirmation

Before any later clone apply proof, the operator must provide a filled confirmation block without placeholders:

```text
Clone confirmation:
- Clone created/selected: yes
- Clone name: adminiculum-bp3-rc1b-clone
- Source: PITR / production-like clone
- Database: adminiculum
- Production DB targeted: no
- App runtime pointed to clone: no
- Credential supplied via local shell env only: yes
- Credential scope: clone-only migration/apply proof
- Secrets committed: no
- Permission to run clone-only apply proof: yes
```

The executor must also parse the supplied connection string locally and print only sanitized proof:

- host equals `adminiculum-bp3-rc1b-clone.postgres.database.azure.com`;
- database equals `adminiculum`;
- connection string value is not printed;
- no `DATABASE_URL` or production host is used.

If any identity check fails or cannot be proven, stop before connecting.

## 6. Required credential handling

Credential requirements for the later proof:

- use a local/session-only environment variable, for example `CLONE_APPLY_PROOF_DATABASE_URL`;
- do not use `DATABASE_URL`;
- do not use `CLONE_DATABASE_URL` unless the prompt explicitly re-confirms and renames it for this proof;
- never print the connection string, password, token, or full URL;
- do not write the credential to `.env`, `.env.local`, shell history docs, scripts, logs, or committed files;
- delete/unset the environment variable after proof if the operator requests cleanup.

## 7. Allowed commands for later proof

Allowed later commands, only after clone identity and env handling pass:

```powershell
[bool]$env:CLONE_APPLY_PROOF_DATABASE_URL
```

Sanitized URL parsing may print host/database only.

Read-only pre-check examples:

```sql
SELECT current_database();
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('clients', 'users', 'cases', 'tasks', 'documents', 'communications', '_prisma_migrations')
ORDER BY table_name;

SELECT migration_name, finished_at, rolled_back_at
FROM "_prisma_migrations"
WHERE migration_name = '20260702140000_add_client_portal_foundation';
```

Apply method may use one of these clone-only approaches, depending on the prompt and operator approval:

1. `prisma migrate deploy` against the clone-only env var, if the later prompt explicitly allows Prisma migrate deploy against clone and the env var is mapped only for that process.
2. A one-shot Node/`pg` script against the clone-only env var that executes only the committed migration SQL and inserts the corresponding `_prisma_migrations` row in the same style previously used for controlled baseline work, if the later prompt chooses manual apply.

In either method, the command must be recorded in sanitized form without secrets.

## 8. Forbidden commands

Forbidden for the later proof unless a future prompt explicitly changes scope:

```powershell
prisma migrate dev
prisma db push
prisma migrate reset
```

Also forbidden:

- any command using production `DATABASE_URL`;
- any command targeting `adminiculum.postgres.database.azure.com`;
- any DML that seeds Client Portal rows;
- any data export of clients, cases, documents, tasks, communications, or users;
- any Azure App Service deployment or setting change;
- any Client Portal route enablement;
- any auth bypass or public-route creation.

## 9. Pre-apply checks

Required before durable clone apply:

- branch is `hotfix/runtime-shape-20260308`;
- HEAD is the intended migration-file commit or a reviewed descendant containing the same migration;
- `git status --short` is understood and no unrelated tracked runtime changes are present;
- migration file path exists: `Backend/prisma/migrations/20260702140000_add_client_portal_foundation/migration.sql`;
- migration file contains only CP-SCHEMA-1 additive objects;
- no `DROP`, `DELETE`, `UPDATE`, or business-data `INSERT` exists in the migration file;
- clone host/database sanitized proof passes;
- baseline tables exist on clone before apply;
- CP-SCHEMA-1 target tables/enums are absent before apply;
- `_prisma_migrations` does not already contain a finished row for `20260702140000_add_client_portal_foundation`.

## 10. Apply method recommendation

Recommended method for the later proof:

1. Use a fresh or disposable production-like clone if available.
2. Use clone-only credentials supplied through `CLONE_APPLY_PROOF_DATABASE_URL`.
3. Prefer the same mechanism intended for production, but only if it can be forced to the clone connection and recorded safely.
4. Apply exactly one migration: `20260702140000_add_client_portal_foundation`.
5. Do not run older pending migrations opportunistically unless the later prompt explicitly reviews and approves them.
6. Do not seed data.
7. Do not start or point any app runtime at the clone.

If Prisma detects unrelated pending migrations or drift, stop and document instead of continuing.

## 11. Post-apply checks

After clone apply, run metadata-only checks:

- 7 CP-SCHEMA-1 tables exist:
  - `client_portal_users`
  - `client_portal_memberships`
  - `client_visible_artifacts`
  - `client_portal_grants`
  - `client_submissions`
  - `client_submission_attachments`
  - `client_portal_audit_events`
- 16 CP-SCHEMA-1 enum types exist.
- 39 CP-SCHEMA-1 indexes exist.
- 18 CP-SCHEMA-1 foreign keys exist.
- baseline tables still exist:
  - `clients`
  - `users`
  - `cases`
  - `tasks`
  - `documents`
  - `communications`
  - `_prisma_migrations`
- no Client Portal table contains rows unless the migration itself requires metadata rows, which it currently does not.

## 12. Prisma migration metadata checks

Required `_prisma_migrations` checks after clone apply:

```sql
SELECT migration_name, finished_at, rolled_back_at, logs
FROM "_prisma_migrations"
WHERE migration_name = '20260702140000_add_client_portal_foundation';
```

Expected:

- exactly one row for `20260702140000_add_client_portal_foundation`;
- `finished_at` is not null;
- `rolled_back_at` is null;
- no failure log is present.

If a row already exists before apply, or if multiple rows appear after apply, stop and document the clone state.

## 13. No-seed/no-client-visibility checks

The clone apply proof must confirm the migration remains inert:

- `client_portal_users` row count is `0`;
- `client_portal_memberships` row count is `0`;
- `client_visible_artifacts` row count is `0`;
- `client_portal_grants` row count is `0`;
- `client_submissions` row count is `0`;
- `client_submission_attachments` row count is `0`;
- `client_portal_audit_events` row count is `0`.

These row-count checks are acceptable because they query only new CP-SCHEMA-1 tables, not business/client records.

No existing case, task, document, communication, report, review note, internal note, AI draft, or internal communication may become visible through runtime because there is still no enabled Client Portal runtime.

## 14. Cleanup / clone disposal expectation

A clone apply proof creates persistent schema objects on the clone. Cleanup should be explicit:

- preferred cleanup: dispose of or reset the clone after proof if it is a throwaway proof clone;
- acceptable alternative: retain the clone as a marked CP-SCHEMA-1-applied proof clone if the operator wants it for additional non-production validation;
- never repoint production or app runtime to the proof clone;
- never treat the proof clone as production canonical data.

Do not attempt manual down-migration cleanup unless a later prompt explicitly asks for clone cleanup and reviews the SQL.

## 15. Stop conditions

Stop before apply if:

- the clone env var is missing;
- the URL cannot be parsed safely;
- host/database do not match the confirmed clone;
- the host appears to be production;
- `DATABASE_URL` would be used;
- baseline tables are missing;
- target CP tables/enums already exist unexpectedly;
- `_prisma_migrations` already has a finished CP-SCHEMA-1 row;
- Prisma reports unrelated pending migrations or drift that would be applied together;
- the migration SQL contains destructive or data-changing statements;
- the operator confirmation is missing, ambiguous, or contains placeholders.

Stop after apply and do not proceed toward production if:

- the apply fails;
- metadata row is missing, rolled back, duplicated, or has logs indicating failure;
- expected tables/enums/indexes/FKs are missing;
- any new Client Portal table contains seeded rows;
- baseline objects are damaged or missing;
- any route/runtime/client visibility behavior changes unexpectedly.

## 16. Required final report format

A later clone apply proof report should include:

1. Clone identity proof.
2. Credential handling summary without secrets.
3. Pre-apply checks and results.
4. Apply method and sanitized command.
5. Whether apply succeeded.
6. Post-apply table/enum/index/FK proof.
7. `_prisma_migrations` proof.
8. No-seed/no-client-visibility proof.
9. Validation results.
10. Cleanup/disposal status or recommendation.
11. Confirmation production was not touched.
12. Confirmation no runtime/deploy/Azure/auth/client portal changes occurred.
13. Whether production apply remains blocked or can move to production preflight.
14. Final classification.

## 17. Recommended next prompt

Recommended next prompt:

`Adminiculum — CP-SCHEMA-1 clone apply proof no production`

That prompt should provide explicit operator confirmation, the local/session-only clone apply env var name, permission to apply only to the clone, and the chosen apply method.

Expected next-step classification if successful:

`cp_schema1_clone_apply_proof_completed_no_production_no_runtime_change`
