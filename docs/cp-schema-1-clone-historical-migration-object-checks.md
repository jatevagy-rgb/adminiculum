# CP-SCHEMA-1 — Clone Historical Migration Object Checks

> Status: **BLOCKED before connection — read-only execution could not run.** The
> clone connection is not reachable from this Claude tool process, so **no database
> connection was opened** and no `information_schema` / `pg_catalog` query was run.
> No mutation, no production, no Azure, no secrets. Classification target:
> `cp_schema1_clone_historical_migration_object_checks_completed_readonly_no_db_change_no_runtime_change`
> — **actual outcome: blocked (no DB connection available in the tool process).**
>
> Read alongside:
> - `docs/cp-schema-1-clone-migration-history-reconciliation-plan.md` (§6 check table)
> - `docs/cp-schema-1-clone-apply-proof-blocked-migration-history.md`
> - `docs/cp-schema-1-clone-transactional-proof.md`

---

## 1. Executive summary

The intended read-only object-existence checks for the 16 historical migrations
(per §6 of the reconciliation plan) **could not be executed** in this Claude turn.
The clone connection (`CLONE_DATABASE_URL` / `CLONE_APPLY_PROOF_DATABASE_URL`) is
**not present in the tool process environment**, and no local `psql` client is
available. The clone connection has only ever been set in the **operator's
interactive PowerShell / Azure Cloud Shell session**, which this agent's separate,
freshly-spawned tool processes do **not** inherit (process-scoped env vars are not
shared across windows/sessions). The clone's PostgreSQL endpoint is also likely
firewalled to Azure, not reachable from the local workstation.

Per the stop condition ("if the clone connection is not set, stop and report
blocked"), **no connection was attempted**. All 16 migrations remain **unknown / not
eligible** for a future `migrate resolve --applied`, and the clone apply proof and
production apply stay **blocked**.

---

## 2. Clone identity and safety verification

Intended target (unchanged, operator-confirmed in prior turns):
- **Server (non-secret):** `adminiculum-bp3-rc1b-clone`
- **Database:** `adminiculum`
- **Classification:** PITR / production-like clone, **not production**, isolated.

Safety confirmations for this turn:
- production DB connection: **no**;
- clone DB connection: **no** (env not available to the tool);
- Azure action / App Service touched: **no**;
- connection string printed: **no**;
- mutation (DDL/DML): **no**;
- secrets printed/committed: **no**.

Clone identity could not be re-verified live because no connection was available.

---

## 3. Connection handling (sanitized)

Boolean-only environment checks (values never printed), run in this agent's tool
processes:

| Variable | PowerShell tool process | Bash tool process |
| --- | --- | --- |
| `CLONE_DATABASE_URL` | not set (`False`) | not set (`NO`) |
| `CLONE_APPLY_PROOF_DATABASE_URL` | not set (`False`) | not set (`NO`) |
| `psql` client available | `False` | not available |

**Session-mismatch cause:** the operator set the clone URL via `$env:...` in an
interactive window (and ran `prisma migrate status` from Azure Cloud Shell). Those
values live only in that window/session. This agent's tool commands run in **separate
child processes** that do not receive that process-scoped variable, so the checks
cannot see the clone connection.

No connection string was requested, printed, or committed. No `.env` file was created.

---

## 4. Commands executed (sanitized)

- Boolean env presence checks for `CLONE_DATABASE_URL` and
  `CLONE_APPLY_PROOF_DATABASE_URL` (PowerShell + Bash) — **values not printed**.
- `psql` availability check (metadata only).
- Read-only repository inspection (no DB): confirmed the 16 migration files exist in
  `Backend/prisma/migrations` and the §6 expected objects per migration.
- **No** `psql`, **no** Prisma DB query, **no** `prisma migrate status/resolve/
  deploy/dev`, **no** `db execute`, **no** `information_schema`/`pg_catalog` query was
  run against any database.

---

## 5. Per-migration object-existence results

**Not captured** — no clone connection. Each migration's checks (from §6 of the
reconciliation plan) remain outstanding:

| # | Migration | Expected primary object(s) to confirm | Result |
| --- | --- | --- | --- |
| 1 | `20260330120000_add_generation_drafts` | table `generation_drafts` | **unknown** |
| 2 | `20260331090100_add_anonymous_documents` | table `anonymous_documents` | **unknown** |
| 3 | `20260331100000_add_rehydration_fields` | cols on `anonymous_documents` (`rehydratedContent`, `rehydrationStatus`, `aiResponseText`) | **unknown** |
| 4 | `20260402131500_add_client_identity_fields` | cols on `clients` (`taxNumber`, `companyRegistrationNumber`, `authorizedRepresentative`) | **unknown** |
| 5 | `20260405183100_add_case_client_role` | col `cases.clientRole` | **unknown** |
| 6 | `20260406120000_add_client_color` | col `clients.color` | **unknown** |
| 7 | `20260408140000_add_case_collaborators` | table `case_collaborators` | **unknown** |
| 8 | `20260416175000_add_comparison_snapshot_foundation` | col `contract_generations.comparisonSnapshot` | **unknown** |
| 9 | `20260417100000_add_timesheet_report_instances` | table `timesheet_report_instances` + enums `TimesheetReportTemplateFamily`, `TimesheetReportInstanceStatus` | **unknown** |
| 10 | `20260417113000_add_timesheet_report_artifacts` | table `timesheet_report_artifacts` + enum `TimesheetReportArtifactFormat` | **unknown** |
| 11 | `20260417123000_add_timesheet_presets` | table `timesheet_presets` + enum `TimesheetPresetLayer` | **unknown** |
| 12 | `20260514201500_add_legal_analyses` | table `legal_analyses` + `LegalAnalysis*` enums | **unknown** |
| 13 | `20260517175500_add_client_house_style_profile` | table `client_house_style_profiles` | **unknown** |
| 14 | `20260517191600_add_client_house_style_header_fields` | cols on `client_house_style_profiles` (`headerAssetPath`, `brandingNotes`, …) | **unknown** |
| 15 | `20260518120000_add_workspace_text` | col `documents.workspaceText` | **unknown** |
| 16 | `20260701120000_add_outlook_communication_provider_fields` | cols/enums on `communications` + `communication_attachments` (`externalMessageId`, `direction`, `source`, `syncStatus`, `providerAttachmentId`) | **unknown** |

---

## 6. `kb_learning_escalation` findings

**Not captured.** Whether any `20260302142000_add_kb_learning_escalation` objects
exist on the clone is **unknown** (no connection). Repo-side fact (read-only,
unchanged): no `20260302142000_add_kb_learning_escalation` migration file exists in
`Backend/prisma/migrations`. The §8 decision (accept-as-historical vs baseline) still
requires the future read-only object check.

---

## 7. Eligibility table for future clone-only `migrate resolve --applied`

| Migration | eligible_for_future_resolve_applied | reason | objects found | missing objects | stop condition |
| --- | --- | --- | --- | --- | --- |
| all 16 historical | **no (unknown)** | no clone connection; objects not verified | none captured | unknown | **yes — connection unavailable** |
| `kb_learning_escalation` | **no (unknown)** | no clone connection; objects not verified | none captured | unknown | **yes — connection unavailable** |

Per the plan rule, **unknown = not eligible**; nothing may be marked eligible until
its objects are confirmed present via the read-only checks.

---

## 8. Stop conditions triggered

- **Clone connection unavailable in the tool process** (`CLONE_DATABASE_URL` and
  `CLONE_APPLY_PROOF_DATABASE_URL` unset in both PowerShell and Bash; no `psql`) →
  **STOP before any connection**. ✔
- No other stop conditions could be evaluated (no data).

---

## 9. Whether CP-SCHEMA-1 can become the sole pending migration after future resolve

**Undetermined.** This depends on the 16 object-existence checks, which have not run.
If (and only if) a future read-only pass confirms **all** primary objects of the 16
historical migrations already exist on the clone, then a subsequent clone-only
`migrate resolve --applied` sequence would leave
`20260702140000_add_client_portal_foundation` as the single pending migration. Until
those checks succeed, this cannot be asserted.

---

## 10. Why no mutation was performed

- The task is read-only; the tool never obtained a clone connection, so **no query of
  any kind ran** against a database.
- No `migrate resolve/deploy/dev`, no `db push`, no DDL/DML, no `INSERT/UPDATE/DELETE/
  ALTER/DROP/TRUNCATE/CREATE`.
- Only boolean env checks, a `psql` availability check, and read-only repo inspection
  were performed. No production/Azure access; no secrets printed.

---

## 11. Production remains blocked

- **Production (`adminiculum`) apply of CP-SCHEMA-1 remains BLOCKED** — unchanged.
- The clone reconciliation prerequisite (§6 checks → conditional resolve → apply
  proof) has not advanced.
- Production apply requires: successful clone object checks, clone reconciliation,
  clone CP-SCHEMA-1 apply proof, a production apply plan, and **explicit separate
  authorization**. None are satisfied.

---

## 12. Recommended next prompt

Because this agent's tool processes cannot see the operator's session-scoped clone
connection, the read-only checks must be run **from the same session that holds the
clone connection** (or driven by an operator-executed runbook whose sanitized results
are pasted back):

> **Adminiculum — CP-SCHEMA-1 clone historical migration object checks: operator-run read-only SQL (Cloud Shell / same PowerShell session).**
> From the same session where the clone `DATABASE_URL`/`CLONE_DATABASE_URL` is set
> (Azure Cloud Shell or the operator's PowerShell window, read-only `adm_snapshot_ro`
> user), run the §6 SELECT-only existence checks against the confirmed clone
> `adminiculum-bp3-rc1b-clone` (db `adminiculum`) — `to_regclass(...)` for each table,
> `information_schema.columns` for each column, `pg_type` for each enum — plus a
> `kb_learning_escalation` object check. Paste back the **sanitized** yes/no results
> (no row data, no connection string). Then a docs update will record eligibility.
> **SELECT-only**; no `migrate resolve/deploy/dev`, no `db push`, no DDL/DML, no
> production, no secrets. If the connection is not set, stop and report blocked.

*(Alternative: the operator sets `CLONE_DATABASE_URL` in the very shell profile /
session that this agent's tools inherit, and installs a `psql` client locally — then
this same task can be re-run to execute the checks directly.)*

---

*BLOCKED before connection. No DB connection, no runtime, schema, migration, DB,
Azure, auth, or client-portal change. No mutation, no secrets. CP-SCHEMA-1 clone
apply proof and production apply remain blocked; CONNECTOR-SCHEMA-1 remains blocked.*
