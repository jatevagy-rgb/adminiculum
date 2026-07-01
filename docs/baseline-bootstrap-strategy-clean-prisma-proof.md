# Baseline Bootstrap Strategy for Clean Prisma Migration Proof

Classification target: `baseline_bootstrap_strategy_documented_no_runtime_change_no_schema_change_no_db_change`

Strategy date: 2026-07-01

This is a docs-only strategy for proving future Prisma migrations, including Client Portal CP-SCHEMA-1, when the active repository migration chain starts with a no-op baseline. It does not create CP-SCHEMA-1, edit `Backend/prisma/schema.prisma`, create or edit Prisma migration SQL, create baseline SQL, run mutating database commands, touch production/Azure, deploy, or change runtime behavior.

## 1. Executive summary

The active Prisma migration chain cannot currently replay from an empty database. The first migration, `20260211153100_baseline`, is an intentional no-op that records an already-existing historical database state. The next migration, `20260212180000_add_workload_tracking`, assumes the baseline already contains tables such as `clients`.

This is not a Client Portal problem. It is a baseline/bootstrap problem.

Recommended strategy:

1. Do not edit historical migrations now.
2. Do not reconstruct baseline SQL from the current Prisma schema.
3. Do not use `prisma db push` as migration proof.
4. For local CP-SCHEMA-1 work, use a disposable local database initialized by an explicitly documented local-only baseline bootstrap, but only after that bootstrap is separately designed/reviewed.
5. For production deploy confidence, use a production-like clone/PITR target that already has the real historical baseline state and migration metadata, then apply only future reviewed migrations.

CP-SCHEMA-1 remains blocked until one of these proof paths is approved and executed.

## 2. Current blocker

CLIENTPORTAL1G attempted clean local migration-chain proof using:

- `adminiculum_cp_schema_clean`;
- `adminiculum_shadow_cp`;
- temporary shell-level `DATABASE_URL` / `SHADOW_DATABASE_URL`;
- local PostgreSQL only.

`prisma migrate deploy` failed at:

`20260212180000_add_workload_tracking`

Failure:

```text
ERROR: relation "clients" does not exist
```

Why:

- `20260211153100_baseline` is a no-op ending in `SELECT 1`;
- `20260212180000_add_workload_tracking` creates `client_workgroups`;
- that table has `"clientId" ... REFERENCES "clients"("id")`;
- empty DB replay has no `clients` table.

Therefore, clean-from-zero replay is currently unsupported.

## 3. Evidence inspected

Files and evidence inspected:

- `Backend/prisma/migrations`
- `Backend/prisma/migrations/20260211153100_baseline/migration.sql`
- `Backend/prisma/migrations/20260212180000_add_workload_tracking/migration.sql`
- early migration folders through `20260416175000_add_comparison_snapshot_foundation`
- `Backend/prisma/schema.prisma`
- `docs/client-portal-v1-clean-local-migration-chain-proof.md`
- `docs/client-portal-v1-clean-local-migration-target-preflight.md`
- `docs/migration-history-reconciliation-lawyer-handoff-decision.md`
- `docs/PRODUCTION_MIGRATION_RECONCILIATION_RUNBOOK.md`
- `docs/GITHUB_UPLOAD_SAFETY_AUDIT.md` references to archived baseline-adjacent artifacts
- git history for `Backend/prisma/migrations/20260211153100_baseline`

Key evidence:

- `20260211153100_baseline/migration.sql` is 284 bytes and intentionally no-op.
- `docs/PRODUCTION_MIGRATION_RECONCILIATION_RUNBOOK.md` states this no-op artifact was restored because it matches production migration-history evidence and must not be recreated from the current schema.
- The same runbook states `add_contract_tables.sql` was found in archived copies, but is not the checksummed Prisma `migration.sql` and was not restored into the active migration folder.
- The current Prisma schema is a later state, not the historical baseline.

## 4. Why empty DB replay fails

The repo has a baseline-style migration history:

- baseline represents existing database state;
- later migrations modify that state;
- baseline itself does not create the state.

That pattern can be valid for an existing production database, but it cannot bootstrap an empty local database without an external baseline initialization step.

The first failing dependency appears immediately:

- migration: `20260212180000_add_workload_tracking`;
- assumed object: `clients`;
- failing statement: FK from `client_workgroups.clientId` to `clients(id)`;
- consequence: `P3018` / `42P01`, relation `clients` does not exist.

Because this failure happens at the second migration, later migrations cannot be used to prove clean replay either.

## 5. Baseline object requirements

The table below lists early objects that the post-baseline chain expects or soon modifies. This is not a complete baseline SQL specification; it is a dependency map for deciding the bootstrap strategy.

| Object | First migration that assumes it | Current schema contains it | Active baseline SQL creates it | Consequence if missing |
| --- | --- | --- | --- | --- |
| `clients` | `20260212180000_add_workload_tracking` | Yes, `Client @@map("clients")` | No | Workload migration fails immediately |
| `users` | `20260408140000_add_case_collaborators` and many relations | Yes, `User @@map("users")` | No | Case collaborator/user FK migrations fail |
| `cases` | `20260405183100_add_case_client_role`, `20260408140000_add_case_collaborators` | Yes, `Case @@map("cases")` | No | Case column/FK migrations fail |
| `documents` | later document/anonymization/review paths | Yes, `Document @@map("documents")` | No | Document-linked foundations cannot be validated |
| `contract_generations` | `20260416175000_add_comparison_snapshot_foundation` | Yes, `ContractGeneration` | No | Comparison snapshot migration fails |
| `anonymous_documents` | `20260331100000_add_rehydration_fields` assumes prior `20260331090100` table | Yes, `AnonymousDocument` | Created post-baseline by repo migration | Works only after earlier migration succeeds |
| `client_workgroups` | `20260212180000_add_workload_tracking` creates it | Yes, `ClientWorkgroup` | No | Created by migration if `clients` exists |
| `workload_records` | `20260212180000_add_workload_tracking` creates it | Yes, `WorkloadRecord` | No | Created by migration if `client_workgroups` succeeds |
| baseline enums (`UserRole`, `CaseStatus`, `CaseType`, `Priority`, document/generation enums) | existing baseline tables and later relations imply them | Yes | No | Current schema cannot be recreated from migrations alone |

The important point is not just that `clients` is missing. The entire pre-202602 baseline state is absent from an empty database because the baseline migration deliberately does not create it.

## 6. Strategy options

### Option A — Restore real baseline migration SQL into the no-op baseline folder

Description: replace or augment the no-op baseline with SQL that builds the original baseline schema.

Assessment: not recommended now.

Safe only if:

- exact historical Prisma `migration.sql` is available;
- its checksum/history relationship is understood;
- it creates only the original baseline objects;
- it does not duplicate later migrations;
- production history implications are reviewed.

Risks:

- current evidence says the checksummed baseline is intentionally no-op;
- archived `add_contract_tables.sql` is not the active Prisma `migration.sql`;
- reconstructing from current schema would include later objects/fields and likely duplicate later migrations;
- editing the active baseline changes fresh-environment behavior and historical meaning.

### Option B — Keep no-op baseline and use local-only baseline bootstrap SQL

Description: create a non-migration bootstrap script that initializes a disposable local DB with the historical baseline schema, then run the active repo migrations after it.

Assessment: recommended for local proof only, after a separate bootstrap design/review.

Pros:

- does not alter Prisma migration history;
- keeps production history untouched;
- can unblock local CP-SCHEMA-1 generation/proof;
- makes the precondition explicit.

Risks:

- bootstrap SQL must be carefully constructed and labeled local-only;
- using current schema as bootstrap would be wrong unless later migration overlap is removed;
- developers could mistake bootstrap for production migration if docs/naming are weak.

Rules:

- bootstrap is not a Prisma migration;
- bootstrap is not deployed;
- bootstrap is only for disposable local proof DBs;
- bootstrap must create only pre-baseline objects;
- bootstrap must not create CP-SCHEMA-1 tables.

### Option C — Use production/PITR clone as migration proof target

Description: test future migrations against a clone that already contains the real historical baseline state.

Assessment: recommended for deploy confidence.

Pros:

- closest to production reality;
- avoids reconstructing baseline locally;
- can reveal drift that a local bootstrap misses.

Risks:

- requires operational access to clone/PITR infrastructure;
- must never point at production;
- clone state may still differ from current Prisma schema and needs read-only inventory first.

### Option D — Use `prisma db push`, then mark migrations resolved

Description: create a schema snapshot in a disposable DB and resolve migrations.

Assessment: reject as migration proof; acceptable only as a local development convenience if explicitly labeled.

Risks:

- bypasses migration SQL;
- hides ordering defects like the current workload failure;
- creates false deploy confidence;
- writes migration metadata if `resolve` is used.

### Option E — Rebuild migration history from scratch

Description: squash/rebaseline the whole migration chain.

Assessment: reject for now.

Risks:

- high operational risk;
- would require production migration-history strategy;
- too broad during Client Portal preparation;
- likely to disrupt ongoing feature work.

### Option F — Continue using drifted `localhost/adminiculum`

Description: generate/test CP-SCHEMA-1 against the current local DB despite known drift.

Assessment: reject.

Risks:

- cannot prove migration safety;
- contains old local handoff migration history not present in repo;
- could produce misleading SQL.

## 7. Recommended strategy

Use a two-track proof strategy:

1. **Local generation/proof track**
   - Keep the active no-op baseline unchanged.
   - Design a local-only bootstrap artifact separately.
   - Bootstrap a disposable local DB to the pre-baseline state.
   - Run the active repo migrations after that bootstrap.
   - Generate/test CP-SCHEMA-1 only after this local chain is green.

2. **Production safety track**
   - Use a production-like clone/PITR target that already has the real baseline state.
   - Read-only inspect the clone first.
   - Apply future CP-SCHEMA-1 only to clone/staging after SQL review.
   - Keep production apply separate and explicitly approved.

Direct answers:

- Is CP-SCHEMA-1 blocked by the baseline issue? Yes.
- What unblocks it locally? A reviewed local-only baseline bootstrap or another clean local DB initialized with faithful pre-baseline state.
- What unblocks it for production safety? Clone/staging proof against a production-like database that has the real baseline state.
- Should historical migrations be edited now? No.
- Should current schema be used as historical baseline? No.

## 8. Local-only bootstrap concept

A future local bootstrap artifact should be designed with these properties:

- name makes local-only status obvious, for example `scripts/local-baseline-bootstrap.sql` or `docs/migration-reconciliation/drafts/local_baseline_bootstrap.sql`;
- comments state: not a Prisma migration, not production SQL, not deployable;
- creates only objects that existed before `20260211153100_baseline`;
- excludes objects created by later migrations;
- excludes Client Portal objects;
- is tested only on disposable local DBs;
- is paired with commands that verify target database name before execution.

Candidate bootstrap sources:

- production/PITR clone schema inventory;
- historical archived SQL such as `add_contract_tables.sql`, after careful review;
- local drifted DB schema, only as supporting evidence and never as sole truth;
- current Prisma schema only as a diff aid, not as authoritative historical baseline.

Do not create the bootstrap SQL in this task.

## 9. Production-like clone proof recommendation

Before any future production-facing Client Portal migration:

1. Create or select a production-like clone/PITR database.
2. Verify it is not production.
3. Run read-only introspection for:
   - `_prisma_migrations`;
   - baseline tables such as `clients`, `users`, `cases`, `documents`;
   - drift-prone tables and enums already documented in reconciliation docs.
4. Confirm CP-SCHEMA-1 names do not already exist.
5. Apply CP-SCHEMA-1 only after generated SQL review.
6. Keep client portal feature flags off.

Clone proof is required because local bootstrap can prove SQL mechanics, but only clone/staging can prove target compatibility.

## 10. Future CP-SCHEMA-1 workflow

Proposed safe workflow:

1. Approve baseline bootstrap strategy.
2. Create/recreate disposable local DBs.
3. Apply local-only baseline bootstrap or use production-like clone.
4. Run current repo migrations after baseline.
5. Confirm `prisma migrate status` is clean.
6. Confirm no `client_portal_*` tables or `ClientPortal*` enums exist.
7. Create CP-SCHEMA-1 inert migration candidate.
8. Apply CP-SCHEMA-1 to disposable local DB.
9. Run `prisma validate`, backend `tsc`, backend tests, and SQL review.
10. Test on clone/staging after explicit approval.
11. Do not deploy/apply to production until separately approved.

## 11. Risk register

| Risk | Severity | Mitigation | Blocking status |
| --- | --- | --- | --- |
| Reconstructing wrong baseline SQL | Critical | Do not use current schema as baseline; require historical/clone evidence | Blocking |
| Duplicate table/enum creation | High | Bootstrap must exclude objects created by later migrations | Blocking |
| Hiding production drift | High | Require production-like clone proof before deploy decisions | Blocking |
| Treating local bootstrap as production migration | Critical | Name/comment as local-only; do not place in Prisma migrations | Blocking |
| Using current schema as historical baseline | High | Use only as reference; compare against migration chronology | Blocking |
| Resetting or mutating wrong DB | Critical | Disposable DB names, target guards, no production/Azure | Blocking |
| CP-SCHEMA-1 generated against invalid DB state | High | Require clean status before generation | Blocking |
| Local proof passes but clone fails | High | Clone proof remains mandatory | Blocking before deploy |
| Developers cannot reproduce setup | Medium | Document bootstrap commands and target checks | Blocking until documented |
| `db push` used as proof | High | Reject for migration proof; use only explicit local dev snapshots | Blocking |

## 12. Blocking issues

Blocking CP-SCHEMA-1 now:

- no approved baseline bootstrap exists;
- clean-from-zero replay fails at `20260212180000_add_workload_tracking`;
- no green clean local migration-chain proof exists;
- no current production-like clone proof exists for CP-SCHEMA-1.

Not blocking this docs-only strategy:

- no runtime behavior changed;
- no schema or migration files changed;
- no DB was touched in this task.

## 13. Validation

Validation run for this docs-only strategy:

- `git diff --check` — passed.
- `cd Backend && npx.cmd prisma validate` — passed.
- `cd Backend && npx.cmd tsc --noEmit` — passed.
- `cd Backend && npm.cmd test -- --runInBand` — passed: 8 suites, 92 tests.

Not run:

- no `prisma migrate deploy`;
- no `prisma migrate dev`;
- no `prisma db push`;
- no database reset/drop;
- no production/Azure access.

## 14. Recommended next prompt

Recommended next prompt:

`Adminiculum — local-only baseline bootstrap design for disposable Prisma proof`

Suggested scope:

- docs/design first;
- inspect historical archived baseline-adjacent SQL and clone evidence;
- propose exact local-only bootstrap artifact boundaries;
- do not edit active Prisma migrations;
- do not create CP-SCHEMA-1 yet;
- do not run against production/Azure.

Final classification:

`baseline_bootstrap_strategy_documented_no_runtime_change_no_schema_change_no_db_change`
