# CP-SCHEMA-1 — Clone `_prisma_migrations` Reconciliation Plan

> Status: **docs-only plan**. No DB connection, no `DATABASE_URL` /
> `CLONE_DATABASE_URL` / `CLONE_APPLY_PROOF_DATABASE_URL` use, no `prisma migrate`
> (deploy/dev/resolve), no `db push`, no SQL, no schema edits, no migration
> creation, no deploy, no Azure, no Client Portal runtime. This document defines a
> **future** reconciliation sequence; it **executes nothing** and **does not**
> unblock CP-SCHEMA-1 or CONNECTOR-SCHEMA-1.
>
> Read alongside:
> - `docs/cp-schema-1-clone-apply-proof-blocked-migration-history.md`
> - `docs/cp-schema-1-clone-apply-proof-gate.md`
> - `docs/cp-schema-1-clone-transactional-proof.md`
> - `docs/cp-schema-1-migration-sql-draft-review.md`
> - `docs/production-like-clone-baseline-schema-snapshot.md`

---

## 1. Executive summary

The CP-SCHEMA-1 migration `20260702140000_add_client_portal_foundation` is
**transactionally proven** (its DDL applies additively and rolls back cleanly
against the real clone schema — 16 enums / 7 tables / 39 indexes / 18 FKs created
then `ROLLBACK`, baseline tables intact). But the **history-recorded apply proof**
is blocked: the clone's `_prisma_migrations` is a **sparse foundation-reconciliation
history**, divergent from the repo, so `prisma migrate deploy` would try to replay
**16 historical migrations whose objects already exist** and would also trip over a
**clone-only record** (`20260302142000_add_kb_learning_escalation`, no repo file,
rolled back).

**Reconciliation goal:** make `20260702140000_add_client_portal_foundation` the
**only genuinely pending** migration on the clone, by (future, separately-authorized)
**read-only object-existence verification** of the 16 historical migrations followed
by `prisma migrate resolve --applied` for those already materialized — mirroring the
established production foundation-reconciliation pattern. This plan **only
specifies** that sequence and its stop/go criteria. Nothing here connects to a DB.

---

## 2. Current evidence chain

| Commit | Artifact |
| --- | --- |
| `6fc5582` | CP-SCHEMA-1 schema candidate (client-portal models in `schema.prisma`) |
| `f5d9fce` | CP-SCHEMA-1 migration SQL draft review |
| `1f43dab` | CP-SCHEMA-1 real migration file `20260702140000_add_client_portal_foundation` |
| `015f859` | CP-SCHEMA-1 clone **transactional proof** (BEGIN → DDL → ROLLBACK, objects absent after rollback, baseline intact) |
| `a6e91bb` | CP-SCHEMA-1 clone apply proof **gate** |
| `0b46fca` | CP-SCHEMA-1 clone apply proof **blocked** report (this plan's input) |

Repo-side facts (read-only, no DB): 21 migrations in `Backend/prisma/migrations`;
`20260702140000_add_client_portal_foundation` present; `20260302142000_add_kb_learning_escalation`
**absent** from the repo.

---

## 3. Divergence summary

- **Last common migration:** `20260212180000_add_workload_tracking`.
- **Repo-present, not recorded on clone (17)** — the 16 historical migrations
  **plus** the CP-SCHEMA-1 target (which is genuinely new):
  `generation_drafts`, `anonymous_documents`, `rehydration_fields`,
  `client_identity_fields`, `case_client_role`, `client_color`, `case_collaborators`,
  `comparison_snapshot_foundation`, `timesheet_report_instances`,
  `timesheet_report_artifacts`, `timesheet_presets`, `legal_analyses`,
  `client_house_style_profile`, `client_house_style_header_fields`, `workspace_text`,
  `outlook_communication_provider_fields`, **`client_portal_foundation`**.
- **Recorded on clone but out of order:** `20260622150000_add_lawyer_handoff_packages_foundation`
  and `20260628190000_add_communication_baseline` **are** recorded (so the "not
  applied" list is non-contiguous → sparse reconciliation, not a linear lag).
- **Clone-only, no repo file:** `20260302142000_add_kb_learning_escalation` (rolled back).
- **Rolled-back rows observed:** on `20260212180000_add_workload_tracking` (rolled-back
  + later finished) and `20260302142000_add_kb_learning_escalation`.

---

## 4. Why plain `migrate deploy` remains unsafe

- It would attempt all **16 historical migrations** in order; their objects **already
  exist** in the clone → **duplicate-object / already-exists failures** and partial
  mutation.
- It is **mutating** (writes `_prisma_migrations`, runs DDL) — out of scope and
  forbidden here.
- It cannot **isolate** the one genuinely-new migration
  (`20260702140000_add_client_portal_foundation`).
- The clone-only `kb_learning_escalation` record (no repo file) makes the history
  additionally non-linear for a clean deploy.

---

## 5. Reconciliation goal

After reconciliation, on the clone:
- All 16 historical repo migrations are **recorded as applied** (their objects exist),
  so Prisma no longer treats them as pending.
- The `kb_learning_escalation` clone-only record is **decided** (§8).
- `prisma migrate status` shows **exactly one** pending migration:
  `20260702140000_add_client_portal_foundation`.
- Then a **clean apply proof** of CP-SCHEMA-1 can run in a separate authorized clone
  task (or the CP-SCHEMA-1 migration is applied via the idempotent-additive + manual
  resolve pattern used for production).

**Invariant:** reconciliation only **records history** (`migrate resolve --applied`)
for migrations whose objects **already exist** — it must **not** run their SQL, must
**not** create/alter objects, and must **not** touch production.

---

## 6. Required future read-only object-existence checks (16 historical migrations)

For each, a **future** read-only `information_schema` / `pg_catalog` query must
confirm the migration's primary objects **already exist** on the clone **before** it
may be `resolve --applied`. (These are the objects extracted read-only from each
migration file; the checks themselves are future, SELECT-only, and out of scope here.)

| # | Migration | Primary object(s) to confirm exist | Check kind |
| --- | --- | --- | --- |
| 1 | `20260330120000_add_generation_drafts` | table `generation_drafts` | `information_schema.tables` |
| 2 | `20260331090100_add_anonymous_documents` | table `anonymous_documents` | tables |
| 3 | `20260331100000_add_rehydration_fields` | columns on `anonymous_documents` (`rehydratedContent`, `rehydrationStatus`, `aiResponseText`, …) | `information_schema.columns` |
| 4 | `20260402131500_add_client_identity_fields` | columns on `clients` (`taxNumber`, `companyRegistrationNumber`, `authorizedRepresentative`) | columns |
| 5 | `20260405183100_add_case_client_role` | column `cases.clientRole` | columns |
| 6 | `20260406120000_add_client_color` | column `clients.color` | columns |
| 7 | `20260408140000_add_case_collaborators` | table `case_collaborators` | tables |
| 8 | `20260416175000_add_comparison_snapshot_foundation` | column `contract_generations.comparisonSnapshot` | columns |
| 9 | `20260417100000_add_timesheet_report_instances` | table `timesheet_report_instances` + enums `TimesheetReportTemplateFamily`, `TimesheetReportInstanceStatus` | tables + `pg_type` |
| 10 | `20260417113000_add_timesheet_report_artifacts` | table `timesheet_report_artifacts` + enum `TimesheetReportArtifactFormat` | tables + `pg_type` |
| 11 | `20260417123000_add_timesheet_presets` | table `timesheet_presets` + enum `TimesheetPresetLayer` | tables + `pg_type` |
| 12 | `20260514201500_add_legal_analyses` | table `legal_analyses` + `LegalAnalysis*` enums | tables + `pg_type` |
| 13 | `20260517175500_add_client_house_style_profile` | table `client_house_style_profiles` | tables |
| 14 | `20260517191600_add_client_house_style_header_fields` | columns on `client_house_style_profiles` (`headerAssetPath`, `brandingNotes`, …) | columns |
| 15 | `20260518120000_add_workspace_text` | column `documents.workspaceText` | columns |
| 16 | `20260701120000_add_outlook_communication_provider_fields` | columns/enums on `communications` + `communication_attachments` (`externalMessageId`, `direction`, `source`, `syncStatus`, `providerAttachmentId`, …) | columns + `pg_type` |

**Rule:** a migration is eligible for `resolve --applied` **only if all** its primary
objects are confirmed present. If a migration's objects are **partially** present
(some yes, some no), that is a **genuine partial-application gap** → **STOP** (§9),
do not resolve, escalate for investigation.

---

## 7. Future clone-only resolve plan (specification only)

Once §6 confirms each historical migration's objects exist, the **future**
(separately-authorized, clone-only) sequence is:

1. For each of the 16 historical migrations (in order) whose objects are fully
   confirmed present → `prisma migrate resolve --applied <migration_name>` **against
   the clone only**. This inserts a recorded/applied row **without running the SQL**.
2. Decide and handle `20260302142000_add_kb_learning_escalation` per §8.
3. Re-run **read-only** `prisma migrate status` against the clone → expect **exactly
   one** pending: `20260702140000_add_client_portal_foundation`.
4. Only then proceed (in a further authorized task) to the CP-SCHEMA-1 **apply
   proof** on the clone.

**This plan does not execute any of the above.** `migrate resolve` is mutating (it
writes `_prisma_migrations`) and is explicitly **forbidden in this docs task**; it
belongs to a separate, explicitly-authorized clone-only execution.

---

## 8. Clone-only `kb_learning_escalation` decision

`20260302142000_add_kb_learning_escalation` is **in the clone `_prisma_migrations`
(rolled back) but has no repo file**. Options:

| Option | Action | Pro | Con | When |
| --- | --- | --- | --- | --- |
| **A — Accept as historical** | leave the rolled-back record as-is; document it as a historical DB-only entry | no fabrication; matches "partially recoverable history" | Prisma `migrate status` keeps flagging "not found locally" | if its objects are **absent** on the clone (consistent with rolled-back) |
| **B — Baseline into repo** | recover/reconstruct the migration file from history and add it to the repo so the record matches | linear, clean `migrate status` | requires accurate historical DDL; risk of guessing | only if the file is truly recoverable |
| **C — Investigate then decide** | future read-only check whether any `kb_learning_escalation` objects exist on the clone; then pick A or B | evidence-driven | extra step | **recommended first** |

**Recommendation:** **Option C first** — future read-only object check. Because the
record is `rolled_back`, its objects are **expected absent**; if confirmed absent,
choose **Option A (accept as historical, documented)**. Only if unexpected objects
exist should Option B / deeper investigation be considered. **No fabricated migration
file is created in this docs task.**

---

## 9. Stop conditions (for the future execution task)

STOP immediately (do not `resolve`, do not proceed) if any of:
- a historical migration's objects are only **partially** present (genuine gap);
- an object exists with an **unexpected shape** (different columns/types than the
  migration would create) — indicates drift, not clean prior application;
- `kb_learning_escalation` objects **exist** unexpectedly on the clone;
- `prisma migrate status` after resolves shows **more than one** pending migration,
  or shows the CP-SCHEMA-1 migration as anything other than the single pending item;
- the target is **not** the confirmed clone (`adminiculum-bp3-rc1b-clone` / db
  `adminiculum`) — never production;
- any command would **mutate** beyond `_prisma_migrations` recording, or would run
  historical SQL;
- `CLONE_DATABASE_URL` / proof URL is unset or ambiguous;
- any secret would be printed or committed.

On any stop: document the finding and re-gate. No partial reconciliation is left
half-done.

---

## 10. Production no-go

- **Production (`adminiculum`) apply of CP-SCHEMA-1 remains BLOCKED.**
- Production uses the **same** foundation-reconciliation `_prisma_migrations` model,
  so `prisma migrate deploy` is not its apply path either; prior additive migrations
  were applied via **idempotent additive SQL + manual `_prisma_migrations` resolve/
  record (correct SHA-256 checksum)** — never `migrate deploy`.
- Production apply may be considered **only after**: (a) clone reconciliation succeeds
  (§7), (b) the clone CP-SCHEMA-1 apply proof succeeds, (c) a production apply plan is
  written, and (d) production apply is **explicitly authorized** as a separate task.
- **No production DB access or mutation** is performed or implied by this plan.

---

## 11. Future command plan — **DO NOT RUN IN THIS DOCS TASK**

> ⚠️ The following are **specifications for a future, separately-authorized,
> clone-only** task. They are **NOT executed here**. This docs task runs no DB
> command, no `DATABASE_URL`, no `migrate`, no SQL.

**(a) Read-only object-existence checks (future, clone-only, SELECT-only):**
```
-- DO NOT RUN HERE. Future clone-only, read-only.
-- Example shape (per §6), against the confirmed clone only:
SELECT to_regclass('public.generation_drafts');                     -- table exists?
SELECT column_name FROM information_schema.columns
  WHERE table_name='clients' AND column_name IN ('taxNumber','color');
SELECT typname FROM pg_type WHERE typname='TimesheetReportArtifactFormat';
-- …one targeted SELECT per row in the §6 table…
```

**(b) Resolve sequence (future, clone-only, mutates `_prisma_migrations` only):**
```
# DO NOT RUN HERE. Future clone-only, explicitly authorized task.
# Only for migrations whose §6 objects are fully confirmed present:
npx prisma migrate resolve --applied 20260330120000_add_generation_drafts
npx prisma migrate resolve --applied 20260331090100_add_anonymous_documents
# … through …
npx prisma migrate resolve --applied 20260701120000_add_outlook_communication_provider_fields
# (kb_learning_escalation handled per §8)
npx prisma migrate status        # expect exactly one pending: 20260702140000_add_client_portal_foundation
```

**(c) Forbidden everywhere in reconciliation:** `migrate deploy`, `migrate dev`,
`db push`, any DDL/DML, running historical migration SQL, any production target.

---

## 12. Recommended next prompt

> **Adminiculum — CP-SCHEMA-1 clone historical migration object checks read-only no mutation.**
> Execute only the §6 **read-only** object-existence checks against the confirmed
> clone `adminiculum-bp3-rc1b-clone` (db `adminiculum`) using the clone connection
> from the local shell only: confirm, per the 16 historical migrations, whether each
> migration's primary objects already exist, and whether any
> `20260302142000_add_kb_learning_escalation` objects exist. **SELECT-only** against
> `information_schema` / `pg_catalog`; **no** `migrate resolve`, **no** `migrate
> deploy`, **no** `db push`, **no** DDL/DML, **no** production, **no** secrets
> printed/committed. Record sanitized results and mark which migrations are eligible
> for a future `resolve --applied`. If the clone connection is not set, stop and
> report blocked.

---

*Docs-only. No DB connection, no runtime, schema, migration, DB, Azure, auth, or
client-portal-enablement change. CP-SCHEMA-1 clone apply proof remains blocked
pending reconciliation; production apply remains blocked; CONNECTOR-SCHEMA-1 remains
blocked.*
