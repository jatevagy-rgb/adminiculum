# Production-Like Clone Creation and Connection Handoff Runbook

Classification target: `production_like_clone_creation_connection_handoff_runbook_documented_no_runtime_change_no_schema_change_no_db_change`

This is a docs-only runbook for human operators who can create or select an isolated production-like clone and safely hand off a clone connection to a later read-only Codex snapshot task. It does not run Azure CLI, create a clone, connect to any database, mutate any database, edit `Backend/prisma/schema.prisma`, create migrations, run Prisma migration commands, deploy, change runtime behavior, or handle secrets.

## 1. Current blocker

The previous production-like clone baseline schema snapshot execution was correctly blocked because no clone connection was supplied:

- `CLONE_DATABASE_URL` was not set.
- `DATABASE_URL` was not set.
- no target could be confidently classified as an isolated non-production clone.
- no DB connection was opened.
- no production/Azure resource was touched.
- no secrets were printed.

That was the correct safe behavior. A read-only schema snapshot can run only after a human operator confirms that the target is an isolated non-production clone and supplies the clone connection through a temporary local shell/session, not through committed files.

Why a clone is required:

- the active migration chain cannot replay from an empty database because `20260211153100_baseline` is no-op and `20260212180000_add_workload_tracking` expects `clients`;
- repo/history evidence is only partially recoverable;
- the drifted local `localhost/adminiculum` database is not deploy-facing proof;
- an empty DB is not full proof until a local-only bootstrap exists;
- production must not be queried directly for this work.

## 2. Clone target decision

| Target type | Status | Conditions |
| --- | --- | --- |
| Isolated PITR / production-like clone | Preferred | Created from production or equivalent backup, clearly named non-production, no app traffic, separate credentials, read-only snapshot first |
| Existing staging DB | Conditional | Accept only if proven production-like, current enough, isolated, and migration metadata is verified |
| Local DB | Rejected for deploy-facing evidence | Known local drift or empty state cannot prove production compatibility |
| Production DB | Strictly rejected | Do not query production directly for this snapshot chain |

Valid target acceptance criteria:

- confirmed non-production;
- isolated from application runtime;
- no external callbacks, emails, webhooks, or background jobs;
- connection string never committed;
- credentials separate from production where possible;
- schema expected to closely match production;
- safe for read-only metadata inspection;
- approved by the human operator for read-only schema snapshot only.

## 3. Human operator clone creation checklist

Use this checklist outside Codex if you have Azure/PostgreSQL access. Use placeholders only in any written handoff.

### Identify source

- [ ] Confirm the production-like source server/database.
- [ ] Confirm desired restore point or backup timestamp.
- [ ] Confirm why that restore point is suitable for baseline/schema evidence.
- [ ] Confirm the source is not being modified.

### Create or select clone

- [ ] Create or select an isolated PITR/production-like clone.
- [ ] Name the clone clearly as non-production, for example with `clone`, `pitr`, `snapshot`, `staging`, or date markers.
- [ ] Ensure no production App Service, worker, scheduler, webhook consumer, or background job points to it.
- [ ] Ensure no outbound email/webhook/Graph callback path is active from the clone.
- [ ] Restrict network/firewall access to the minimum operator/Codex workstation path.

### Credentials and permissions

- [ ] Prefer a read-only inspection user.
- [ ] If a read-only user is unavailable, use normal clone credentials only with strict read-only command discipline.
- [ ] Do not grant application runtime credentials unless a separate approved task requires it.
- [ ] Do not store credentials in repo files.
- [ ] Do not paste passwords or tokens into docs.

### Safe metadata record

Record only non-secret metadata:

- [ ] clone display name;
- [ ] clone database name;
- [ ] source type: PITR clone / staging / schema-only source;
- [ ] source restore timestamp;
- [ ] clone created timestamp;
- [ ] operator name/initials if acceptable;
- [ ] confirmation that the target is non-production;
- [ ] confirmation whether a read-only DB user exists;
- [ ] confirmation that no app runtime points to clone.

Do not record:

- passwords;
- tokens;
- full connection strings;
- secrets;
- business/client rows.

## 4. Connection handoff rules

Preferred handoff:

- set `CLONE_DATABASE_URL` only in the local shell/session before the next Codex execution task;
- do not write it to `.env`;
- do not commit it;
- do not print it;
- do not paste it into committed docs.

Acceptable fallback:

- set shell-level `DATABASE_URL` temporarily only if the later tool requires it;
- make clear that it points to the clone;
- clear it after the task.

Forbidden:

- committing `.env`;
- editing project `.env`;
- adding secrets to docs;
- putting connection strings in scripts;
- printing connection strings in logs;
- staging operational files that contain secrets.

PowerShell handoff pattern, placeholder only:

```powershell
# Future execution task only. Do not commit this value.
$env:CLONE_DATABASE_URL = "<clone connection string>"
```

Optional cleanup after the snapshot task:

```powershell
Remove-Item Env:\CLONE_DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
```

## 5. Read-only user recommendation

Preferred credential model:

- read-only database user;
- allowed to `SELECT` metadata from `_prisma_migrations`, `information_schema`, and `pg_catalog`;
- allowed to inspect table/column/index/FK/enum metadata;
- no `CREATE`, `ALTER`, `DROP`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `GRANT`, or `REVOKE`.

Fallback model:

- normal clone credentials may be used only if read-only credentials are unavailable;
- command discipline must still prohibit all writes;
- no `prisma migrate deploy`;
- no `prisma migrate dev`;
- no `prisma db push`;
- no app runtime against clone.

Even clone writes are disallowed in the first snapshot phase.

## 6. Later snapshot execution command contract

The later read-only execution task may proceed only after all are true:

- clone exists;
- `CLONE_DATABASE_URL` is available in the local shell/session;
- clone is confirmed non-production;
- operator confirms production is not targeted;
- operator confirms no app runtime points at clone;
- operator confirms read-only schema metadata queries are authorized.

Allowed later commands:

- `cd Backend`
- `npx.cmd prisma validate`
- `npx.cmd prisma migrate status`
- read-only SQL `SELECT` queries over:
  - `_prisma_migrations`
  - `information_schema.tables`
  - `information_schema.columns`
  - `pg_type` / `pg_enum`
  - `pg_indexes`
  - `information_schema.table_constraints`
  - `information_schema.key_column_usage`
  - `information_schema.constraint_column_usage`

Forbidden later commands:

- `npx.cmd prisma migrate deploy`
- `npx.cmd prisma migrate dev`
- `npx.cmd prisma db push`
- reset/drop/truncate/update/insert/delete/alter commands;
- app runtime startup against clone;
- external API/webhook/Graph calls;
- business data exports;
- full data dumps.

## 7. Sanitized evidence output contract

Allowed in committed snapshot docs:

- migration names;
- migration status summary;
- checksums if already in `_prisma_migrations` metadata and not secret;
- table names;
- column names/types/nullability/defaults if safe;
- enum names and values;
- index names and definitions;
- constraint names;
- FK metadata;
- drift/mismatch summaries;
- clone suitability classification.

Forbidden in committed docs:

- connection strings;
- passwords;
- tokens;
- usernames if sensitive;
- client/business data rows;
- personal data rows;
- raw payloads;
- document contents;
- full data dumps;
- secrets from env/app settings.

## 8. Operator confirmation template

The human operator may paste this before the next read-only execution prompt. Replace placeholders, but do not include secrets.

```text
Clone handoff confirmation:

- Clone exists: yes
- Clone type: <PITR clone / production-like clone / staging>
- Clone display name: <non-secret clone name>
- Clone database name: <non-secret DB name>
- Clone host classification: non-production
- Source restore timestamp: <timestamp or n/a>
- Clone created timestamp: <timestamp or n/a>
- Production DB is not targeted: confirmed
- No production app/runtime points to clone: confirmed
- No external callbacks/emails/webhooks/Graph jobs enabled from clone: confirmed
- Read-only DB user available: <yes/no>
- Connection supplied via local shell/session only: confirmed
- Variable set for Codex task: CLONE_DATABASE_URL
- Full connection string is not included in this prompt/docs: confirmed
- Authorized commands: prisma validate, prisma migrate status, read-only metadata SELECTs
- Forbidden commands remain forbidden: migrate deploy/dev/db push, DDL/DML, app runtime, external calls
```

If any line cannot be confirmed, do not run the snapshot execution task.

## 9. Next execution prompt

Recommended next prompt after the operator completes the handoff:

`Adminiculum — production-like clone baseline schema snapshot read-only execution with clone connection`

The next task should:

- verify `CLONE_DATABASE_URL` is present without printing it;
- parse only sanitized host/database classification;
- stop if the target is production-like without clone/staging markers;
- run read-only metadata inspection only after target confirmation;
- produce `docs/production-like-clone-baseline-schema-snapshot.md`;
- keep `CP-SCHEMA-1` and `CONNECTOR-SCHEMA-1` blocked unless clone suitability is proven.

## 10. Final safety classification

This runbook does not unblock schema work by itself.

Still blocked:

- `CP-SCHEMA-1`;
- `CONNECTOR-SCHEMA-1`;
- executable local-only bootstrap SQL.

Unblocks only:

- a human/operator handoff path for a later read-only clone snapshot task.
