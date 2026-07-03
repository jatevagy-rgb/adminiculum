# CP-SCHEMA-1 — Clone Historical Migration Object Checks

> Status: **COMPLETED (operator-run, read-only SELECT-only).** The operator executed
> the object-existence checks from Azure Cloud Shell against the confirmed clone
> `adminiculum-bp3-rc1b-clone` (db `adminiculum`). **This agent made no DB connection**
> and only records the operator's sanitized results. No mutation, no `migrate`, no
> production, no Azure, no secrets.
>
> **Headline result: future clone-only `migrate resolve --applied` is NOT safe.** The
> clone's physical schema is **partial/divergent** relative to the repo migrations —
> multiple historical migration objects are **missing or partial** on the clone — so
> blindly recording all historical migrations as applied would be false. CP-SCHEMA-1
> **cannot** become the sole pending migration via the current simple resolve plan.
> Production apply remains **blocked**.
>
> Read alongside:
> - `docs/cp-schema-1-clone-migration-history-reconciliation-plan.md` (§6 check table)
> - `docs/cp-schema-1-clone-apply-proof-blocked-migration-history.md`
> - `docs/cp-schema-1-clone-transactional-proof.md`
>
> *(This supersedes the earlier "blocked before connection" state of this file: the
> checks have now been run by the operator; this agent still did not connect.)*

---

## 1. Executive summary

The operator ran **SELECT-only** object-existence checks against the confirmed clone.
Baseline core tables are present, but the clone's physical schema **does not** contain
the full set of objects the repo's historical migrations would create — several are
**missing** and two are **partial** (table present, indexes absent). Only **two**
historical migrations show all their checked objects present.

Therefore the reconciliation cannot proceed by "resolve all historical migrations as
applied": that would record migrations as applied whose objects do not exist on the
clone, producing an inconsistent history and an unsafe later apply. **Future
clone-only resolve is not safe now**, CP-SCHEMA-1 cannot be isolated as the sole
pending migration by the simple plan, plain `migrate deploy` remains unsafe, and
**production apply stays blocked**.

An automated parser/checker limitation is noted (it emitted rows for **11 of 16**
migrations and produced `public/public` artifacts for schema-qualified objects), so
some "missing" results may be checker false-negatives; the **5 un-emitted** migrations
remain **unknown**. Regardless of parser perfection, the presence of clear
`not_eligible` / `partial_stop` results is sufficient to make blind resolve unsafe.

---

## 2. Clone identity and safety verification

- **Server (non-secret):** `adminiculum-bp3-rc1b-clone`
- **Database:** `adminiculum`
- **Classification:** PITR / production-like clone, **not production**, isolated.
- **Access:** operator used a **read-only** role from Azure Cloud Shell.

Safety confirmations:
- production DB connection: **no**;
- clone DB connection (operator): **yes — clone only, read-only**;
- clone DB connection (this agent): **no**;
- Azure App Service touched: **no**;
- mutation (DDL/DML, migrate deploy/dev/resolve, db push): **no**;
- connection string / secrets printed or committed: **no**;
- business/client row data exported: **no** (metadata existence checks only).

---

## 3. Connection handling (sanitized)

- The clone connection lives only in the **operator's Azure Cloud Shell session**;
  the operator ran the checks there. This agent's tool processes do **not** inherit
  that session, and confirmed (boolean-only) that `CLONE_DATABASE_URL` /
  `CLONE_APPLY_PROOF_DATABASE_URL` are **not** set in the agent's process — hence the
  agent did not and could not connect. No value was ever printed.

---

## 4. Commands executed (sanitized)

**Operator (Azure Cloud Shell, read-only, clone only):**
- SELECT-only existence checks against `information_schema` / `pg_catalog`
  (`to_regclass(...)` for tables, `information_schema.columns` for columns, `pg_type`
  for enums, `pg_indexes` / constraints), per the §6 plan, plus a
  kb/knowledge/learning/escalation pattern query. **No** `migrate`, **no** `db push`,
  **no** DDL/DML.

**This agent (no DB):**
- Recorded the operator's sanitized results into this doc.
- Read-only repo inspection + repo validation (`git diff --check`, `prisma validate`
  schema-only, `tsc`, tests). No DB connection.

---

## 5. Per-migration object-existence results (operator-run)

**Baseline tables present** (existence check): `_prisma_migrations`, `cases`,
`clients`, `communications`, `documents`, `tasks`, `users` — all present.

| # | Migration | checked | found | missing | status | found / missing detail |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `20260330120000_add_generation_drafts` | 3 | 0 | 3 | **not_eligible** | missing: table `generation_drafts`, idx `generation_drafts_caseId_idx`, idx `generation_drafts_templateId_idx` |
| 2 | `20260331090100_add_anonymous_documents` | 3 | 1 | 2 | **partial_stop** | found: table `anonymous_documents`; missing: idx `idx_anonymous_documents_caseId_createdAt`, idx `idx_anonymous_documents_sourceDocId` |
| 3 | `20260331100000_add_rehydration_fields` | — | — | — | **unknown (not emitted)** | checker did not emit a row |
| 4 | `20260402131500_add_client_identity_fields` | — | — | — | **unknown (not emitted)** | checker did not emit a row |
| 5 | `20260405183100_add_case_client_role` | — | — | — | **unknown (not emitted)** | checker did not emit a row |
| 6 | `20260406120000_add_client_color` | 1 | 1 | 0 | **eligible_candidate** | found: column `clients.color` |
| 7 | `20260408140000_add_case_collaborators` | 3 | 1 | 2 | **partial_stop** | found: table `case_collaborators`; missing: idx `case_collaborators_caseId_index`, idx `case_collaborators_userId_index` |
| 8 | `20260416175000_add_comparison_snapshot_foundation` | — | — | — | **unknown (not emitted)** | checker did not emit a row |
| 9 | `20260417100000_add_timesheet_report_instances` | 5 | 0 | 5 | **not_eligible** | missing: table `timesheet_report_instances`, types `TimesheetReportInstanceStatus`/`TimesheetReportTemplateFamily`, idx `…_reportPeriod_idx`/`…_updatedAt_idx` |
| 10 | `20260417113000_add_timesheet_report_artifacts` | 3 | 0 | 3 | **not_eligible** | missing: table `timesheet_report_artifacts`, type `TimesheetReportArtifactFormat`, idx `…_reportInstanceId_createdAt_idx` |
| 11 | `20260417123000_add_timesheet_presets` | 5 | 0 | 5 | **not_eligible** | missing: timesheet preset indexes; parser emitted `public/public` for schema-qualified objects (parser limitation) |
| 12 | `20260514201500_add_legal_analyses` | 4 | 0 | 4 | **not_eligible** | missing: legal-analysis indexes; parser emitted `public/public` for schema-qualified objects (parser limitation) |
| 13 | `20260517175500_add_client_house_style_profile` | 3 | 0 | 3 | **not_eligible** | missing: table `client_house_style_profiles`, idx `…_clientId_key`, constraint `…_clientId_fkey` |
| 14 | `20260517191600_add_client_house_style_header_fields` | — | — | — | **unknown (not emitted)** | checker did not emit a row |
| 15 | `20260518120000_add_workspace_text` | 1 | 1 | 0 | **eligible_candidate** | found: column `documents.workspaceText` |
| 16 | `20260701120000_add_outlook_communication_provider_fields` | 3 | 0 | 3 | **not_eligible** | missing: types `CommunicationDirection`/`CommunicationSource`/`CommunicationSyncStatus` |

**Note on #16 (expected true negative):** the CommunicationDirection/Source/SyncStatus
enums were added to **production** by `20260701120000_add_outlook_communication_provider_fields`
during earlier ops work; if this clone's PITR point **predates** that production
apply, the clone legitimately lacks them. This is a real signal (clone is older than
current production), not merely parser noise.

---

## 6. `kb_learning_escalation` findings

- Pattern query for kb / knowledge / learning / escalation-like table/column/type:
  **0 rows** — no such object observed on the clone.
- Repo-side (read-only): no `20260302142000_add_kb_learning_escalation` migration file
  exists in the repo.
- **Decision (unchanged): do not fabricate a migration file** for
  `20260302142000_add_kb_learning_escalation`. It is a historical DB `_prisma_migrations`
  record (rolled back) with **no corresponding objects** on the clone → treat as a
  **historical DB-only, rolled-back entry** (accept-as-historical), documented, not
  recreated.

---

## 7. Eligibility table for future clone-only `migrate resolve --applied`

| Bucket | Migrations |
| --- | --- |
| **eligible_candidate** (all checked objects found) | `20260406120000_add_client_color`, `20260518120000_add_workspace_text` |
| **partial_stop** (some objects present, some missing) | `20260331090100_add_anonymous_documents`, `20260408140000_add_case_collaborators` |
| **not_eligible** (all checked objects missing) | `20260330120000_add_generation_drafts`, `20260417100000_add_timesheet_report_instances`, `20260417113000_add_timesheet_report_artifacts`, `20260417123000_add_timesheet_presets`, `20260514201500_add_legal_analyses`, `20260517175500_add_client_house_style_profile`, `20260701120000_add_outlook_communication_provider_fields` |
| **unknown / not checked** (checker did not emit; treat as not eligible) | `20260331100000_add_rehydration_fields`, `20260402131500_add_client_identity_fields`, `20260405183100_add_case_client_role`, `20260416175000_add_comparison_snapshot_foundation`, `20260517191600_add_client_house_style_header_fields` |

**Rule enforced:** only `eligible_candidate` (all objects confirmed present) may ever
be a future `resolve --applied` target. `partial_stop`, `not_eligible`, and
`unknown` must **not** be resolved. Even the 2 eligible candidates are **not**
sufficient on their own — resolving only 2 of 16 does not make CP-SCHEMA-1 the sole
pending migration.

---

## 8. Stop conditions triggered

- **`partial_stop`** on `anonymous_documents` and `case_collaborators` (table present,
  indexes missing) → genuine partial-application gaps → **STOP** for those migrations.
- **`not_eligible`** on 7 migrations (objects absent) → cannot resolve.
- **`unknown`** on 5 migrations (checker did not emit) → not eligible until re-checked.
- **Overall STOP:** the clone's physical schema is materially incomplete vs. the repo
  chain → the simple "resolve all as applied" reconciliation is **unsafe** and is
  halted.

---

## 9. Whether CP-SCHEMA-1 can become the sole pending migration after future resolve

**No — not via the current simple resolve plan.** Because most historical migrations
are `partial_stop` / `not_eligible` / `unknown`, resolving them as applied would be
false (their objects don't exist on the clone). CP-SCHEMA-1
(`20260702140000_add_client_portal_foundation`) therefore **cannot** be cleanly
isolated as the single pending migration by simply resolving the historical set.

This also surfaces a **deeper divergence question** that must be answered before any
reconciliation: *why does a PITR clone of production physically lack objects like
`timesheet_report_instances`, `legal_analyses`, `client_house_style_profiles`?* Either
(a) the checker under-reported (parser limitation on schema-qualified / index objects),
or (b) the clone genuinely lacks them (older PITR point, or production built via a
different path than the repo migration chain). This is a prerequisite investigation,
not a blind resolve.

---

## 10. Why no mutation was performed

- Operator checks were **SELECT-only** (`information_schema` / `pg_catalog` existence
  + a pattern query); no rows of business data were exported.
- No `migrate resolve/deploy/dev`, no `db push`, no DDL/DML, no
  `INSERT/UPDATE/DELETE/ALTER/DROP/TRUNCATE/CREATE`.
- This agent made **no** DB connection; it only recorded sanitized results and ran
  repo validation.
- No production/Azure access; no secrets printed/committed.

---

## 11. Production remains blocked

- **Production (`adminiculum`) apply of CP-SCHEMA-1 remains BLOCKED** — unchanged.
- The clone reconciliation prerequisite failed the safety bar (partial/missing
  objects), so the apply-proof path is not open.
- Production apply requires (in order): resolve the clone divergence question (§9),
  re-verify object existence robustly (fix parser gaps + check the 5 un-emitted),
  achieve a safe reconciliation, pass a clone CP-SCHEMA-1 apply proof, write a
  production apply plan, and obtain **explicit separate authorization**. None are met.

---

## 12. Recommended next prompt

> **Adminiculum — CP-SCHEMA-1 clone divergence investigation & robust re-check (operator-run read-only).**
> Investigate why the PITR clone `adminiculum-bp3-rc1b-clone` (db `adminiculum`)
> physically lacks objects from historical migrations (e.g. `timesheet_report_instances`,
> `legal_analyses`, `client_house_style_profiles`, communication provider enums), and
> re-run a **robust** SELECT-only existence check that (a) does not depend on the
> earlier parser (query `to_regclass`, `information_schema.columns`, `pg_type`,
> `pg_indexes`, `information_schema.table_constraints` by explicit name), and (b)
> covers the **5 un-emitted** migrations (`rehydration_fields`, `client_identity_fields`,
> `case_client_role`, `comparison_snapshot_foundation`, `client_house_style_header_fields`).
> Determine whether the gaps are parser false-negatives or a genuinely older/partial
> clone, and whether a **fresh PITR clone** (closer to current production) is required
> before reconciliation. **SELECT-only**; no `migrate resolve/deploy/dev`, no `db push`,
> no DDL/DML, no production, no secrets. Docs-only output; update
> `docs/cp-schema-1-clone-historical-migration-object-checks.md` or a new investigation
> doc. Do not enable Client Portal.

---

*Read-only object checks completed by operator (clone only, SELECT-only). This agent
made no DB connection. No runtime, schema, migration, DB, Azure, auth, or
client-portal change. Future clone-only resolve is NOT safe; CP-SCHEMA-1 clone apply
proof and production apply remain blocked; CONNECTOR-SCHEMA-1 remains blocked.*
