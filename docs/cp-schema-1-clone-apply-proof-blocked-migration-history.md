# CP-SCHEMA-1 — Clone Apply Proof Blocked by Migration History Divergence

> Status: **docs-only blocked-proof report**. No DB connection, no `DATABASE_URL`
> use, no `prisma migrate`, no SQL, no deploy, no schema edits, no migration
> creation. Client Portal remains future-only / gated (`ENABLE_CLIENT_PORTAL` off).
> This report records why the CP-SCHEMA-1 **clone apply proof** is blocked; it does
> **not** apply anything and does **not** unblock CP-SCHEMA-1 or CONNECTOR-SCHEMA-1.
>
> This report documents an operator-run, read-only precheck (executed manually from
> Azure Cloud Shell against the confirmed clone). This Claude turn made **no DB
> connection** — it only inspected the repository read-only to corroborate the
> operator's findings.

---

## 1. Executive summary

The CP-SCHEMA-1 identity/membership foundation migration
(`20260702140000_add_client_portal_foundation`) has a committed schema candidate
(`6fc5582`), SQL review (`f5d9fce`), real migration file (`1f43dab`), a **clone
transactional proof** (`015f859`), and an apply-proof gate (`a6e91bb`).

The **clone apply proof** (running `prisma migrate deploy` end-to-end against the
clone and recording it) is **BLOCKED**: an operator precheck shows the repository
migration history and the clone's `_prisma_migrations` are **divergent**. The clone
inherits production's **foundation-reconciliation** `_prisma_migrations` model — a
**sparse** recorded set — so `prisma migrate deploy` would attempt to replay **17
"not yet applied" migrations** whose objects **already exist** in the clone schema,
and it also sees a **DB-only migration with no repo file**
(`20260302142000_add_kb_learning_escalation`).

`migrate deploy` was therefore **correctly not run**. The transactional proof (the
CP-SCHEMA-1 DDL applies additively and rolls back cleanly against the real clone
schema) **remains valid**; only the **history-recorded apply proof** is blocked
pending `_prisma_migrations` reconciliation. **Production apply remains blocked.**

---

## 2. Clone identity

- **Server (non-secret):** `adminiculum-bp3-rc1b-clone`
- **Host:** `adminiculum-bp3-rc1b-clone.postgres.database.azure.com:5432`
- **Database:** `adminiculum`
- **Classification:** operator-confirmed **PITR / production-like clone**,
  **not production**, isolated, no app runtime pointed at it.
- **Access used by operator:** read-only role `adm_snapshot_ro` (SELECT-only).
- **Production DB (`adminiculum`):** **not targeted**.

Connection string / credentials were **never** printed or committed (only the
non-secret host/server/db names above).

---

## 3. Commands run (sanitized)

**Operator (Azure Cloud Shell, read-only, against the clone only):**
- `DATABASE_URL` pointed at the clone (`adminiculum-bp3-rc1b-clone` / db `adminiculum`) **in the shell only** — value not printed.
- `prisma migrate status` (read-only metadata; **no** `migrate deploy`, **no** `migrate dev`, **no** `db push`).
- A manual **SELECT-only** smoke check as `adm_snapshot_ro`:
  ```sql
  SELECT migration_name, finished_at, rolled_back_at
  FROM "_prisma_migrations"
  ORDER BY started_at
  LIMIT 5;
  ```
- **No** DDL/DML, **no** mutation.

**This Claude turn (no DB):**
- Read-only repository inspection only: `ls prisma/migrations` (confirmed 21 repo
  migrations; `20260702140000_add_client_portal_foundation` present;
  `20260302142000_add_kb_learning_escalation` **absent** from repo).
- `git diff --check`, `prisma validate` (schema-file only), `tsc --noEmit`, tests.
- **No** DB connection; `CLONE_DATABASE_URL`/`DATABASE_URL` **not** used by this turn
  (a prior boolean check showed the variable is not present in this Claude process —
  it lives only in the operator's interactive PowerShell/Cloud Shell session).

---

## 4. Prisma migrate status findings (from the operator precheck)

- **21 migrations** found in `prisma/migrations` (matches the repo, confirmed here).
- Datasource target: the **clone** (`adminiculum-bp3-rc1b-clone…:5432`).
- Prisma reported: **local migration history and the DB `_prisma_migrations` are
  different.**
- **Last common migration:** `20260212180000_add_workload_tracking`.
- **Local (repo) migrations reported "not yet applied" per the clone (17):**
  `20260330120000_add_generation_drafts`,
  `20260331090100_add_anonymous_documents`,
  `20260331100000_add_rehydration_fields`,
  `20260402131500_add_client_identity_fields`,
  `20260405183100_add_case_client_role`,
  `20260406120000_add_client_color`,
  `20260408140000_add_case_collaborators`,
  `20260416175000_add_comparison_snapshot_foundation`,
  `20260417100000_add_timesheet_report_instances`,
  `20260417113000_add_timesheet_report_artifacts`,
  `20260417123000_add_timesheet_presets`,
  `20260514201500_add_legal_analyses`,
  `20260517175500_add_client_house_style_profile`,
  `20260517191600_add_client_house_style_header_fields`,
  `20260518120000_add_workspace_text`,
  `20260701120000_add_outlook_communication_provider_fields`,
  `20260702140000_add_client_portal_foundation`.
- **DB migration not found locally (in clone `_prisma_migrations`, no repo file):**
  `20260302142000_add_kb_learning_escalation`.

**Key interpretation:** the "not yet applied" list is **not contiguous** — the repo
migrations `20260622150000_add_lawyer_handoff_packages_foundation` and
`20260628190000_add_communication_baseline` are **absent** from that list, i.e. the
clone **does** record them as applied while the intervening ones
(`generation_drafts` … `workspace_text`) are **not** recorded. This confirms a
**sparse, reconciled `_prisma_migrations`** (foundation-reconciliation model), **not**
a simple "clone is behind by N migrations." The additional smoke check observed
`rolled_back_at` rows for `20260212180000_add_workload_tracking` (a rolled-back row
plus a later finished row) and `20260302142000_add_kb_learning_escalation`
(rolled-back), reinforcing that the clone history is reconciled/edited, not a clean
linear replay.

---

## 5. Why `migrate deploy` was correctly not run

- Prisma `migrate deploy` would attempt to **apply all 17 "not yet applied"
  migrations in order**.
- In the clone, the **objects created by most of those 17 already exist** (the
  production/clone schema was built via reconciliation / `db push` / partial
  application, not the full ordered chain). Replaying them would raise **duplicate
  object / already-exists errors** and could partially mutate the clone.
- `migrate deploy` is a **mutating** command (it records rows in `_prisma_migrations`
  and executes DDL) — explicitly out of scope for a read-only proof and forbidden by
  the task rules.
- Running it would also not isolate the **one genuinely new** migration
  (`20260702140000_add_client_portal_foundation`) from the 16 historical ones.

Therefore stopping before `migrate deploy` was the **correct, safe** outcome.

---

## 6. Migration history divergence table

| Category | Migration(s) | In repo file? | In clone `_prisma_migrations`? | Meaning |
| --- | --- | --- | --- | --- |
| Last common | `20260212180000_add_workload_tracking` | Yes | Yes (with a rolled-back + later finished row) | shared boundary |
| Recorded foundation (later, out of order) | `20260622150000_add_lawyer_handoff_packages_foundation`, `20260628190000_add_communication_baseline` | Yes | **Yes** | sparse reconciliation records these but skips earlier ones |
| Repo-present, not recorded in clone (17) | `20260330120000_add_generation_drafts` … `20260518120000_add_workspace_text`, `20260701120000_add_outlook_communication_provider_fields`, **`20260702140000_add_client_portal_foundation`** | Yes | No | "not yet applied" per Prisma; **objects mostly already exist** in clone (except CP-SCHEMA-1's) |
| Clone-only, no repo file | `20260302142000_add_kb_learning_escalation` | **No** | Yes (rolled-back) | historical DB record with no current repo migration |
| The CP-SCHEMA-1 target | `20260702140000_add_client_portal_foundation` | Yes | No | the **only genuinely new** additive migration to prove |

---

## 7. Impact on CP-SCHEMA-1

- CP-SCHEMA-1's migration file exists (`1f43dab`) and its DDL is transactionally
  proven additive/inert against the clone (`015f859`).
- However, an **end-to-end `migrate deploy` apply proof cannot run** on the clone
  until the `_prisma_migrations` divergence is reconciled — otherwise deploy would
  fail on the 16 historical migrations before ever reaching CP-SCHEMA-1.
- CP-SCHEMA-1 therefore stays **NO-GO for apply proof** (and consequently for any
  production apply). The **transactional** proof is unaffected (§8).
- CONNECTOR-SCHEMA-1 (same baseline dependency) remains blocked.

---

## 8. Why the transactional proof remains valid but the apply proof is blocked

- **Transactional proof (valid):** the CP-SCHEMA-1 DDL was executed inside a
  transaction against the **real clone schema** and **rolled back** — proving the SQL
  is syntactically valid, additive, and non-conflicting with the clone's *actual
  materialized objects*. This does **not** touch `_prisma_migrations` and does not
  depend on migration-history linearity, so the divergence does not invalidate it.
- **Apply proof (blocked):** the apply proof requires the **history-recorded** path
  (`prisma migrate deploy` applies + records the migration), which **does** depend on
  a reconcilable `_prisma_migrations`. Because the clone history is sparse/divergent
  (17 "unapplied" whose objects exist + 1 clone-only record), deploy cannot cleanly
  reach and record only CP-SCHEMA-1. Hence: **SQL correctness proven; history-apply
  proof blocked.**

---

## 9. Required reconciliation before any clone apply proof

Before a clone apply proof of CP-SCHEMA-1 can run, the clone's `_prisma_migrations`
must be reconciled so that **only** `20260702140000_add_client_portal_foundation` is
genuinely new. Options (all read/decision work; no mutation in this report):

1. **Mark already-materialized migrations as applied** on the clone via
   `prisma migrate resolve --applied <name>` for each of the 16 historical repo
   migrations whose objects already exist (turning them into recorded/no-op history)
   — mirroring the established production foundation-reconciliation pattern.
2. **Resolve the clone-only record** `20260302142000_add_kb_learning_escalation`
   (no repo file): decide whether to (a) restore/baseline the missing migration file
   into the repo, or (b) accept it as a historical DB-only entry and document it.
3. **Confirm object existence** per migration (read-only `information_schema`) so the
   `migrate resolve --applied` set is accurate and safe.
4. After reconciliation, `prisma migrate status` should show **only** CP-SCHEMA-1 as
   pending; then a clone apply proof (or the idempotent-additive + manual resolve
   pattern) can validate it end-to-end.

Note: this reconciliation is itself a **mutating** operation (it writes
`_prisma_migrations` rows) and is **out of scope** here — it requires a separate,
explicitly-authorized clone task and must never target production.

---

## 10. Production apply remains blocked

- Production (`adminiculum`) uses the **same** foundation-reconciliation
  `_prisma_migrations` model, so `prisma migrate deploy` is **not** the production
  apply path either. Prior additive migrations were applied to production via the
  **idempotent additive SQL + manual `_prisma_migrations` resolve/record** pattern
  (with a correct SHA-256 checksum), not `migrate deploy`.
- CP-SCHEMA-1 production apply stays **blocked** until: (a) the clone apply/reconcile
  proof succeeds, (b) the reconciliation approach is validated on the clone, and
  (c) production apply is **explicitly authorized** as a separate task. **No
  production DB access or mutation occurred or is implied by this report.**

---

## 11. Recommended next prompt

> **Adminiculum — CP-SCHEMA-1 clone `_prisma_migrations` reconciliation plan (docs-only).**
> Using the divergence recorded in
> `docs/cp-schema-1-clone-apply-proof-blocked-migration-history.md`, define the exact
> reconciliation sequence to make `20260702140000_add_client_portal_foundation` the
> only pending migration on the clone: the read-only object-existence checks per the
> 16 historical migrations, the `prisma migrate resolve --applied` list, the decision
> for the clone-only `20260302142000_add_kb_learning_escalation` (baseline-into-repo
> vs accept-as-historical), and the go/no-go criteria — **without** running any
> mutation, `migrate deploy`, or DB write in the planning task. Docs-only; no schema
> edits, no migrations created, no DB mutation; do not touch production; do not
> enable client portal.

---

*Docs-only. No DB connection, no runtime, schema, migration, DB, Azure, auth, or
client-portal-enablement change. CP-SCHEMA-1 clone apply proof is blocked by
migration-history divergence; CP-SCHEMA-1 and CONNECTOR-SCHEMA-1 remain blocked.*
