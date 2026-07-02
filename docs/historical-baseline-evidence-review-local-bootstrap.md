# Historical Baseline Evidence Review for Local-Only Prisma Bootstrap

Classification target: `historical_baseline_evidence_review_documented_no_runtime_change_no_schema_change_no_db_change`

This is a docs-only evidence review for a future local-only Prisma bootstrap. It does not create bootstrap SQL, create standalone `.sql` files, edit `Backend/prisma/schema.prisma`, edit historical migrations, run `prisma migrate`, run `prisma db push`, mutate any database, connect to production/Azure, deploy, or change runtime behavior.

## 1. Executive summary

Repo/history evidence confirms the active baseline migration is intentionally no-op and does **not** contain the historical schema needed for empty-DB replay.

Recovery classification: **B/D hybrid — partially recoverable from repo/history, but production-like clone evidence is still required**.

Findings:

- The oldest active tracked backend schema snapshots already include post-baseline objects such as `client_workgroups`, `workload_records`, `anonymous_documents`, `case_collaborators`, and `generation_drafts`; they are not clean pre-`20260212180000` baseline snapshots.
- A historical sidecar file named `add_contract_tables.sql` is recoverable from deleted deploy-staging folders in git history. It provides partial evidence for `contract_templates`, `contract_generations`, `TemplateCategory`, `GenerationStatus`, `UserStatus`, and user auth columns.
- The sidecar `add_contract_tables.sql` is explicitly **not** the checksummed Prisma baseline `migration.sql` and must not be restored into the active migration chain.
- No exact historical DDL for core baseline tables `clients`, `users`, `cases`, `documents`, or `tasks` was found in active migration history.
- Exact executable local-only bootstrap SQL is still unsafe.

`CP-SCHEMA-1` and `CONNECTOR-SCHEMA-1` remain blocked.

## 2. Safety and non-goals

Evidence search used repository files and git history only.

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

Non-goals:

- no executable bootstrap SQL;
- no Prisma migration draft;
- no database repair;
- no schema implementation.

## 3. Evidence search method

Commands and evidence classes inspected:

- `git log --all -- Backend/prisma/schema.prisma`
- `git log --all -- Backend/prisma/migrations`
- `git log --all --name-status -- Backend/prisma`
- `git log --all --diff-filter=D --summary -- Backend/prisma`
- `git log --all --name-status -- '*add_contract_tables.sql' '*baseline*' '*migration.sql'`
- `git rev-list --all --objects` filtered for baseline/schema artifacts
- `git grep` over `docs` and `Backend/prisma` for baseline, clone, PITR, no-op, and migration terms
- `git show` for old schema snapshots and archived/deleted baseline-adjacent SQL

No database commands were run.

## 4. Git history findings

### Active `Backend/prisma/schema.prisma`

Relevant commits touching `Backend/prisma/schema.prisma`:

| Commit | Message | Evidence value |
| --- | --- | --- |
| `809d602` | `chore(topology): track boxed Backend and Frontend product tree` | Oldest active tracked backend Prisma schema snapshot found |
| `2570a49` | `Add legal analysis persistence API` | Adds later legal-analysis schema |
| `778105e` | `feat: add lawyer handoff package workflow` | Adds later handoff/package intent |
| `f601c23` | `feat: add client house style profiles for prompt context` | Adds later house-style schema |
| `4068a21` | `fix(document): persist workspace text in modified working copies` | Adds later document field |
| `38ba0a8` | `feat(review): add document review suggestion persistence foundation` | Adds later review-suggestion schema, later superseded |
| `e7488c4` | `fix(db): preserve production clone schema in prisma` | Clone-preservation correction, not baseline DDL |
| `03d0854` | `feat(backend): add outlook communication provider fields` | Later communication provider additions |

The oldest active backend schema snapshot is not a pre-workload baseline. It already contains `ClientWorkgroup`, `WorkloadRecord`, `CaseCollaborator`, `AnonymousDocument`, `GenerationDraft`, `Communication`, and other objects that the active migration chain later creates or alters.

### Active migration history

Relevant migration-history findings:

| Commit | Message | Evidence value |
| --- | --- | --- |
| `80ce4e6` | `chore(prisma): track historical development migrations` | Adds post-baseline development migrations starting at `20260212180000_add_workload_tracking` |
| `d755191` | `docs(db): reconcile migration history for review persistence` | Restores active no-op baseline migration and removes superseded review-suggestion migration |
| `31fbd75` | `chore(prisma): draft communication baseline migration` | Adds later communication baseline migration |
| `03d0854` | `feat(backend): add outlook communication provider fields` | Adds later provider migration |

The active baseline migration was restored after the later development migrations had already been tracked. Its SQL body remains the historical no-op artifact.

### Deleted/archived baseline-adjacent artifacts

Git history contains deleted deploy-staging copies of:

- `deploy-check/prisma/migrations/20260211153100_baseline/add_contract_tables.sql`
- `deploy-check/prisma/migrations/20260211153100_baseline/migration.sql`
- `deploy-check2/dist/prisma/migrations/20260211153100_baseline/add_contract_tables.sql`
- `dist/prisma/migrations/20260211153100_baseline/add_contract_tables.sql`
- `temp_deploy/prisma/migrations/20260211153100_baseline/add_contract_tables.sql`
- root `prisma/migrations/20260211153100_baseline/add_contract_tables.sql`

The recoverable `migration.sql` in those copies is still the same no-op baseline. The recoverable `add_contract_tables.sql` is a sidecar file, not the Prisma migration file.

## 5. Old schema snapshot review

### `35687fdc:prisma/schema.prisma`

This archived/root schema snapshot includes:

- `User`
- `Client`
- `ClientWorkgroup`
- `WorkloadRecord`
- `Department`
- `Matter`
- `TimeEntry`
- `Case`
- `Document`
- `DocumentVersion`
- `Task`
- `AnonymousDocument`
- `TimelineEvent`
- `Comment`
- `Notification`
- `SystemSetting`
- `ContractTemplate`
- `ContractGeneration`

It is useful as a broad early product schema reference, but it is not a clean pre-`20260212180000` baseline because it already includes workload tracking models.

### `809d602:Backend/prisma/schema.prisma`

This is the oldest active backend schema snapshot found. It includes:

- `User`
- `Client`
- `ClientWorkgroup`
- `WorkloadRecord`
- `Case`
- `CaseCollaborator`
- `Document`
- `Task`
- `AnonymousDocument`
- `Communication`
- `CommunicationAttachment`
- `GenerationDraft`
- `ContractReviewRecord`
- `BlockReviewNote`
- clause/assembly models

It also includes client fields that were later represented in migrations, such as `taxNumber`, `companyRegistrationNumber`, `authorizedRepresentative`, and `color`.

Conclusion:

- Neither old schema snapshot is reliable as exact historical baseline DDL.
- Both are current-ish or boxed-product snapshots that already contain objects and fields added by later migrations.
- They can inform object names and relationships, but not executable bootstrap SQL.

## 6. Deleted/renamed migration evidence

### Active no-op baseline

Path:

- `Backend/prisma/migrations/20260211153100_baseline/migration.sql`

Evidence:

- Added to active Backend migration chain in commit `d755191`.
- File is 284 bytes and ends in `SELECT 1`.
- Production reconciliation docs state the checksum matches production migration-history evidence.

Usefulness:

- High confidence for migration-history identity.
- No usefulness for reconstructing baseline table DDL.

### `add_contract_tables.sql` sidecar

Example recoverable path:

- `35687fdc:prisma/migrations/20260211153100_baseline/add_contract_tables.sql`

Objects/changes contained:

- creates `TemplateCategory`;
- creates `GenerationStatus`;
- creates `UserStatus`;
- adds `passwordHash`, `status`, and `lastLoginAt` to `users`;
- creates `contract_templates`;
- creates `contract_generations`;
- creates indexes for contract template/generation lookup;
- adds comments on contract generation/auth fields.

Usefulness:

- Partial evidence for contract-generation/auth-related baseline-adjacent objects.
- Helpful for `contract_templates`, `contract_generations`, `TemplateCategory`, `GenerationStatus`, and `UserStatus`.

Limits:

- It does not create `clients`, `cases`, `documents`, or `tasks`.
- It assumes `users` already exists.
- It is not the checksummed Prisma `migration.sql`.
- It was kept outside the active migration chain by reconciliation.
- It may represent a deployment adjunct rather than the true original baseline.

Conclusion:

- Use as supporting evidence only.
- Do not restore into `Backend/prisma/migrations`.
- Do not treat as complete baseline SQL.

### Superseded review-suggestion migration

Deleted active migration:

- `Backend/prisma/migrations/20260610214500_add_document_review_suggestions/migration.sql`

Usefulness:

- None for pre-`20260212180000` baseline reconstruction.
- It is a later local-only/superseded feature migration.

## 7. Comparison with baseline object inventory

| Object | Inventory status before review | Historical evidence found | Source path / commit | Confidence | Can inform bootstrap? | Risk note |
| --- | --- | --- | --- | --- | --- | --- |
| `clients` | Required baseline object | Old schema snapshots contain model, but no exact DDL | `35687fdc:prisma/schema.prisma`, `809d602:Backend/prisma/schema.prisma` | Low/medium | Yes, names only | ID type and historical columns unresolved |
| `users` | Required baseline object | Old schema snapshots contain model; sidecar SQL assumes table exists and adds auth fields | old schemas; `35687fdc:.../add_contract_tables.sql` | Medium | Partially | Base user table DDL still missing |
| `cases` | Required baseline object | Old schema snapshots contain model, but no exact DDL | old schemas | Low/medium | Yes, names only | UUID/text ID conflict remains unresolved |
| `documents` | Required baseline object | Old schema snapshots contain model, but no exact DDL | old schemas | Low/medium | Yes, names only | Must avoid later `workspaceText` column |
| `tasks` | Required baseline object | Old schema snapshots contain model, but no exact DDL | old schemas | Low/medium | Yes, names only | Later task drift documented in clone runbook |
| `contract_generations` | Required baseline object | Sidecar SQL creates table; old schemas contain model | `add_contract_tables.sql`; old schemas | Medium/high | Yes, partially | Sidecar not active migration; may be deployment adjunct |
| `contract_templates` | Likely baseline/support object | Sidecar SQL creates table; old schemas contain model | `add_contract_tables.sql`; old schemas | Medium/high | Yes, partially | Not enough to prove whole baseline |
| `TemplateCategory` | Likely baseline/support enum | Sidecar SQL creates enum | `add_contract_tables.sql` | Medium/high | Yes | Not the active migration file |
| `GenerationStatus` | Likely baseline/support enum | Sidecar SQL creates enum with six values | `add_contract_tables.sql` | Medium/high | Yes | Production clone docs record later value drift |
| `UserStatus` | Likely baseline/support enum | Sidecar SQL creates enum | `add_contract_tables.sql`; old schemas | Medium | Yes, partially | Base `users` table remains missing |
| `UserRole` | Baseline enum candidate | Old schemas contain enum; clone docs confirm production enum values represented | old schemas; production runbook | Medium | Yes, with clone confirmation | Need exact values from clone/evidence before SQL |
| `CaseStatus`, `CaseType`, `Priority` | Baseline enum candidates | Old schemas contain enums; clone docs confirm existing `CaseStatus` represented | old schemas; production runbook | Medium | Yes, partially | Need exact clone/historical values |
| `client_workgroups` | Later-created object | Migration creates it | `20260212180000_add_workload_tracking` | High | No | Must exclude from bootstrap |
| `workload_records` | Later-created object | Migration creates it | `20260212180000_add_workload_tracking` | High | No | Must exclude from bootstrap |
| `generation_drafts` | Later-created object | Migration creates it | `20260330120000_add_generation_drafts` | High | No | Hard duplicate risk |
| `anonymous_documents` | Later-created object | Migration creates it | `20260331090100_add_anonymous_documents` | High | No | Later altered by rehydration migration |
| `case_collaborators` | Later-created object | Migration creates it | `20260408140000_add_case_collaborators` | High | No | Hard duplicate risk |
| `communications` | Later-created by current chain | Migration creates it | `20260628190000_add_communication_baseline` | High | No | Must not be bootstrap object |
| `communication_attachments` | Later-created by current chain | Migration creates it | `20260628190000_add_communication_baseline` | High | No | Must not be bootstrap object |
| automation tables | Clone-only current production objects | Runbook documents clone-only tables | `docs/PRODUCTION_MIGRATION_RECONCILIATION_RUNBOOK.md` | Medium | No for pre-workload local bootstrap | Must preserve in production reconciliation, not local bootstrap |

## 8. Baseline recoverability classification

Classification: **B/D hybrid — partially recoverable from repo/history, but production-like clone evidence is required**.

Why not A:

- No full historical baseline SQL was found.
- No old schema snapshot exactly before `20260212180000_add_workload_tracking` was found.
- Core baseline DDL for `clients`, `users`, `cases`, `documents`, and `tasks` remains missing.
- ID physical type questions remain unresolved.

Why not pure C:

- Repo/history does provide useful partial evidence:
  - old schema snapshots;
  - active no-op baseline identity;
  - sidecar `add_contract_tables.sql`;
  - production reconciliation docs;
  - migration-order exclusions.

Why D still applies:

- Deploy-facing confidence cannot come from local reconstruction alone.
- A production-like clone/PITR schema inventory is still needed to confirm real baseline shape and current drift.

## 9. Bootstrap SQL draft safety assessment

Is exact evidence sufficient to draft local-only executable bootstrap SQL?

- No.

What is missing:

- exact `clients` DDL;
- exact `users` DDL before auth sidecar additions;
- exact `cases` DDL and `id` physical type;
- exact `documents` DDL before later workspace fields;
- exact `tasks` DDL and task enum/type shape;
- exact baseline enum values and schema qualification;
- exact baseline FK/index constraints;
- confirmation whether old schema `String @default(uuid())` mapped to physical `uuid` or text in the target historical DB;
- authoritative clone/schema evidence for core shared tables.

Safe next artifact:

- docs-only evidence addendum or pseudocode checklist.

Unsafe next artifact:

- executable SQL file.

Recommendation:

- Do not draft executable bootstrap SQL yet.
- Next task should be production-like clone baseline snapshot planning, or a docs-only focused review of archived/deploy artifacts plus runbook evidence if clone access is not yet available.

## 10. Production-like clone evidence path

Future path, not executed here:

1. Create or use a PITR/production-like clone.
2. Verify clone is not production.
3. Use read-only schema introspection only.
4. Export/schema-summarize only object metadata, not business rows.
5. Capture:
   - tables;
   - columns and physical types;
   - enum values;
   - primary keys;
   - foreign keys;
   - indexes;
   - `_prisma_migrations` rows and checksums, names only where possible.
6. Compare clone schema to:
   - active migration chain;
   - `docs/baseline-object-inventory-local-bootstrap.md`;
   - current `schema.prisma`;
   - sidecar `add_contract_tables.sql`.
7. Use clone evidence to decide whether a local-only bootstrap can be made faithful enough for disposable proof.

Why this matters:

- A clone likely contains the real historical baseline state plus production drift.
- Local reconstruction can prove mechanics, but it can also create false confidence.
- Production-facing schema work ultimately needs clone/staging proof regardless.

## 11. Risk register

| Risk | Severity | Mitigation | Blocking status |
| --- | --- | --- | --- |
| Old schema snapshot is not exact baseline | High | Treat old schemas as object-name/reference evidence only | Blocking executable SQL |
| Deleted sidecar SQL conflicts with active migration history | High | Do not restore sidecar; use as supporting evidence only | Blocking if treated as migration |
| Recovered SQL includes objects later migrations create | High | Cross-check every object against migration-order inventory | Blocking |
| Baseline reconstruction omits constraints/indexes | High | Require clone/historical evidence for PK/FK/index shape | Blocking |
| History search misses files | Medium | Use clone evidence and archived artifact review before SQL | Blocking for certainty |
| Current schema mistaken for baseline | Critical | Keep current schema classified as end-state | Blocking |
| Local bootstrap creates false confidence | High | Require production-like clone proof before deploy-facing migrations | Blocking deploy confidence |
| Clone differs from production | Medium/high | Use verified PITR/production-like clone with identity checks | Blocking until verified |
| Secrets accidentally printed from old env/dumps | Critical | Do not inspect `.env`; avoid dumps with data; schema-only evidence | Blocking if source contains secrets |
| UUID/text ID mismatch hidden by assumptions | Critical | Resolve physical types from clone/historical DDL | Blocking executable SQL |

## 12. Blocking issues

Still blocking executable local-only bootstrap SQL:

- no exact core baseline DDL for `clients`, `users`, `cases`, `documents`, and `tasks`;
- no resolved physical ID type story for UUID vs text/string;
- no exact baseline enum/type inventory;
- no exact baseline FK/index inventory;
- no clone-backed schema snapshot for core baseline objects;
- sidecar `add_contract_tables.sql` is partial and not the Prisma baseline migration.

Still blocking `CP-SCHEMA-1` and `CONNECTOR-SCHEMA-1`:

- no local bootstrap SQL;
- no disposable DB proof;
- no production-like clone proof for the future candidate migrations;
- no reviewed candidate schema migration after proof.

## 13. Recommended next prompt

Recommended next prompt:

`Adminiculum — production-like clone baseline schema snapshot plan docs-only`

That prompt should:

- avoid production access and Azure changes unless explicitly approved in a later ops task;
- define the read-only introspection queries needed for a clone;
- specify target identity checks;
- specify redaction/no-business-data rules;
- compare expected clone output to this evidence review and the baseline object inventory;
- still avoid creating bootstrap SQL.

Alternative if clone access is not available:

`Adminiculum — archived baseline sidecar SQL comparison docs-only`

That prompt should compare `add_contract_tables.sql` and old schema snapshots in more detail, still without producing executable bootstrap SQL.
