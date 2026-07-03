# CP-SCHEMA-1 — Clone Divergence Investigation & Robust Re-check

> Status: **docs-only — robust re-check queries prepared + analysis.** This agent
> made **no DB connection**. The explicit SELECT-only queries below are prepared for
> the **operator** to run in Azure Cloud Shell against the confirmed clone
> `adminiculum-bp3-rc1b-clone` (db `adminiculum`); definitive per-object results are
> **pending operator execution**. No mutation, no `migrate`, no production, no Azure,
> no secrets.
>
> **Provisional conclusion (does not require a new DB run): the clone is genuinely
> older than current production, and the earlier "missing" results are a mix of
> likely parser false-negatives and at least one confirmed true-missing group.**
> A **fresh PITR clone closer to current production is recommended** before any
> CP-SCHEMA-1 apply proof. Future `migrate resolve --applied` remains **unsafe**;
> production apply remains **blocked**.
>
> Read alongside:
> - `docs/cp-schema-1-clone-historical-migration-object-checks.md` (prior parser-based run)
> - `docs/cp-schema-1-clone-migration-history-reconciliation-plan.md`
> - `docs/cp-schema-1-clone-apply-proof-blocked-migration-history.md`
> - `docs/production-like-clone-baseline-schema-snapshot.md`

---

## 1. Executive summary

The prior object-existence run used an automated parser that (a) emitted rows for
only **11 of 16** migrations and (b) produced `public/public` artifacts for
schema-qualified DDL — so several "missing" results are suspect. This re-check
replaces parser inference with **explicit, by-name SELECT-only** queries
(`to_regclass`, `information_schema.columns`, `pg_type`, `pg_indexes`,
`pg_constraint`) for every object.

Two things can already be stated **without** a new DB run:
1. **Confirmed parser artifact:** the repo `legal_analyses` and `timesheet_presets`
   migrations use `CREATE TABLE "public"."…"` / `CREATE TYPE "public"."…"`
   (schema-qualified). The earlier checker mis-read the object name as `public` →
   those groups' "missing" results are **likely false-negatives**.
2. **Confirmed true-missing group:** the Communication provider enums
   (`CommunicationDirection`/`CommunicationSource`/`CommunicationSyncStatus`) were
   added to **production** by `20260701120000_add_outlook_communication_provider_fields`
   during earlier ops work (applied ~2026-07-01). If this clone's PITR point predates
   that apply, the enums are **genuinely absent** on the clone → **the clone is older
   than current production.**

Because the clone is provably at least partially stale (point (2)) and sits
**before** the CP-SCHEMA-1 migration in the chain, it is a poor apply-proof target
even in the best case. The robust queries below will confirm the false-negative vs
true-missing split, but the recommendation already leans to **a fresh PITR clone**.

---

## 2. Why a robust re-check was needed

- The prior run's parser only produced **11/16** result rows (5 migrations unknown).
- It emitted `public/public` for schema-qualified objects → **name-detection failure**.
- Index-name detection differed from actual index names in some migrations.
- Conclusion: prior "missing" results are **not reliable as final proof**; explicit
  by-name existence queries are required.

---

## 3. Clone identity and safety verification

- **Server (non-secret):** `adminiculum-bp3-rc1b-clone`
- **Database:** `adminiculum`
- **Classification:** PITR / production-like clone, **not production**, isolated.
- **Access:** operator to use a **read-only** role from Azure Cloud Shell.

Safety confirmations (this turn):
- production DB connection: **no**;
- clone DB connection by this agent: **no**;
- Azure App Service touched: **no**;
- mutation / migrate / db push: **no**;
- secrets printed/committed: **no**;
- business/client row data exported: **no**.

---

## 4. Commands / queries (sanitized) — **operator SELECT-only, ready to run**

> ⚠️ SELECT-only. Run against the **confirmed clone only** (read-only user). Paste
> sanitized `exists`/`count` outputs back — **no row data, no connection string.**
> This agent did **not** run these.

**(a) Migration metadata (context):**
```sql
SELECT migration_name, (finished_at IS NOT NULL) AS finished, (rolled_back_at IS NOT NULL) AS rolled_back
FROM "_prisma_migrations" ORDER BY started_at;
```

**(b) Tables — by explicit name:**
```sql
SELECT
  to_regclass('public.generation_drafts')            AS generation_drafts,
  to_regclass('public.anonymous_documents')          AS anonymous_documents,
  to_regclass('public.case_collaborators')           AS case_collaborators,
  to_regclass('public.timesheet_report_instances')   AS timesheet_report_instances,
  to_regclass('public.timesheet_report_artifacts')   AS timesheet_report_artifacts,
  to_regclass('public.timesheet_presets')            AS timesheet_presets,
  to_regclass('public.legal_analyses')               AS legal_analyses,
  to_regclass('public.client_house_style_profiles')  AS client_house_style_profiles,
  to_regclass('public.contract_generations')         AS contract_generations;
```

**(c) Enums — by explicit `typname` (case-sensitive):**
```sql
SELECT typname FROM pg_type
WHERE typname IN (
  'TimesheetReportInstanceStatus','TimesheetReportTemplateFamily','TimesheetReportArtifactFormat',
  'TimesheetPresetLayer','LegalAnalysisStatus','LegalAnalysisSourceType','LegalAnalysisSourceDocumentType',
  'CommunicationDirection','CommunicationSource','CommunicationSyncStatus'
) ORDER BY typname;
```

**(d) Columns — for the 5 previously-unknown migrations + outlook:**
```sql
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema='public' AND (
  (table_name='anonymous_documents' AND column_name IN ('aiResponseText','rehydratedContent','rehydrationStatus','rehydratedAt','rehydrationWarnings')) OR
  (table_name='clients' AND column_name IN ('taxNumber','companyRegistrationNumber','authorizedRepresentative','color')) OR
  (table_name='cases' AND column_name='clientRole') OR
  (table_name='contract_generations' AND column_name='comparisonSnapshot') OR
  (table_name='client_house_style_profiles' AND column_name IN ('headerAssetPath','brandingNotes','headerDescription')) OR
  (table_name='documents' AND column_name='workspaceText') OR
  (table_name='communications' AND column_name IN ('externalMessageId','providerConversationId','mailboxAddress','direction','source','syncStatus','receivedAt','sentAt','importedAt','metadata','recipients')) OR
  (table_name='communication_attachments' AND column_name IN ('providerAttachmentId','sizeBytes'))
) ORDER BY table_name, column_name;
```

**(e) Indexes — by explicit name:**
```sql
SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN (
  'generation_drafts_caseId_idx','generation_drafts_templateId_idx',
  'idx_anonymous_documents_caseId_createdAt','idx_anonymous_documents_sourceDocId',
  'case_collaborators_caseId_index','case_collaborators_userId_index',
  'timesheet_report_instances_reportPeriod_idx','timesheet_report_instances_updatedAt_idx',
  'timesheet_report_artifacts_reportInstanceId_createdAt_idx',
  'client_house_style_profiles_clientId_key'
) ORDER BY indexname;
```

**(f) Constraints — by explicit name:**
```sql
SELECT conname FROM pg_constraint
WHERE conname IN ('client_house_style_profiles_clientId_fkey') ORDER BY conname;
```

---

## 5. Results for the 5 previously-unknown migrations

**RESULTS: pending operator execution** (queries §4d/§4e/§4f). Expected objects:

| Migration | Explicit objects to confirm | Result |
| --- | --- | --- |
| `20260331100000_add_rehydration_fields` | `anonymous_documents` cols: `aiResponseText`, `rehydratedContent`, `rehydrationStatus`, `rehydratedAt`, `rehydrationWarnings` | pending |
| `20260402131500_add_client_identity_fields` | `clients` cols: `taxNumber`, `companyRegistrationNumber`, `authorizedRepresentative` | pending |
| `20260405183100_add_case_client_role` | `cases.clientRole` | pending |
| `20260416175000_add_comparison_snapshot_foundation` | `contract_generations.comparisonSnapshot` | pending |
| `20260517191600_add_client_house_style_header_fields` | `client_house_style_profiles` cols: `headerAssetPath`, `brandingNotes`, `headerDescription` | pending |

*(Note: these depend on their parent tables/columns; e.g. the house-style header
columns require `client_house_style_profiles` to exist — see §6.)*

---

## 6. Results for prior not_eligible / partial migrations

**RESULTS: pending operator execution** (queries §4b/§4c/§4e).

| Migration | Explicit objects | Prior parser status | Likely on robust re-check |
| --- | --- | --- | --- |
| `20260330120000_add_generation_drafts` | table `generation_drafts` + 2 idx | not_eligible | **verify** (table by `to_regclass`) |
| `20260331090100_add_anonymous_documents` | table (found) + 2 idx (missing) | partial_stop | verify indexes by name |
| `20260408140000_add_case_collaborators` | table (found) + 2 idx (missing) | partial_stop | verify indexes by name |
| `20260417100000_add_timesheet_report_instances` | table + 2 enums + 2 idx | not_eligible | **likely false-negative** (verify) |
| `20260417113000_add_timesheet_report_artifacts` | table + enum + idx | not_eligible | **likely false-negative** (verify) |
| `20260417123000_add_timesheet_presets` | table + enum `TimesheetPresetLayer` + idx | not_eligible (`public/public`) | **likely false-negative** (schema-qualified DDL) |
| `20260514201500_add_legal_analyses` | table + `LegalAnalysis*` enums + idx | not_eligible (`public/public`) | **likely false-negative** (schema-qualified DDL) |
| `20260517175500_add_client_house_style_profile` | table + unique idx + fkey | not_eligible | verify (table/idx/constraint by name) |
| `20260701120000_add_outlook_communication_provider_fields` | enums `CommunicationDirection/Source/SyncStatus` + cols | not_eligible | **likely true-missing** (clone predates 2026-07-01 prod apply) |

---

## 7. Parser false-negative vs true-missing assessment

| Group | Assessment | Evidence |
| --- | --- | --- |
| `legal_analyses`, `timesheet_presets` | **Likely false-negative** | migration DDL is `CREATE TABLE/TYPE "public"."…"` (schema-qualified); the checker emitted `public/public` → name mis-detected, not object-absent |
| `timesheet_report_instances`, `timesheet_report_artifacts` | **Likely false-negative** (verify) | live production features; enum/index name detection likely failed in the parser |
| `generation_drafts`, `client_house_style_profiles` | **Verify** | table `to_regclass` needed; could be either |
| index-only "missing" (`anonymous_documents`, `case_collaborators`) | **Verify** | tables present; index-name detection likely differed |
| Communication provider enums (`outlook`) | **Likely TRUE-missing** | added to production ~2026-07-01; a PITR predating that genuinely lacks them → **clone is older than current production** |

**Net:** the divergence is **not** "clone is a faithful copy missing random objects."
It is most consistent with **a stale PITR clone** (older than current production, so it
truly lacks the newest migration's objects) **plus parser false-negatives** on older,
schema-qualified objects that almost certainly do exist. The robust queries confirm
which is which, but the staleness alone is decisive for suitability.

---

## 8. Fresh clone recommendation

**Recommendation: Option A — obtain a fresh PITR clone taken from *current*
production** (which now contains all foundation migrations **plus**
`20260701120000_add_outlook_communication_provider_fields`), then re-run the robust
checks against it.

Rationale:
- The current clone is provably **older than production** (outlook enums absent), so
  it sits **before** the CP-SCHEMA-1 migration's chain position and is not a clean
  apply-proof target regardless of the false-negative outcome.
- A fresh PITR minimizes divergence: its `_prisma_migrations` and physical schema
  match current production, so the only genuinely-new migration is CP-SCHEMA-1
  (`20260702140000_add_client_portal_foundation`).

Interim / fallback:
- **Option C (keep transactional proof as standing evidence):** the CP-SCHEMA-1
  transactional proof (`015f859`) already demonstrates the DDL is valid/additive and
  rolls back cleanly — this remains the strongest available correctness evidence and
  is unaffected by the history divergence.
- **Option B (declare this clone unsuitable):** appropriate if a fresh PITR is
  produced (this clone is superseded).
- **Option D (complex historical reconciliation on this clone):** **not recommended** —
  only viable if *all* physical objects are proven present *and* the outlook gap is
  accepted, which is more fragile than a fresh clone.

**Fresh clone needed: yes (recommended).**

---

## 9. Impact on CP-SCHEMA-1

- CP-SCHEMA-1's migration and **transactional proof remain valid**; the **apply
  proof** stays blocked (this clone is stale/divergent; the fresh-clone path is
  preferred).
- CP-SCHEMA-1 **cannot** be isolated as the sole pending migration on *this* clone via
  a simple resolve; a fresh PITR would make it the single pending migration cleanly.
- CP-SCHEMA-1 remains **NO-GO** for apply/production.

## 10. Impact on CONNECTOR-SCHEMA-1

- Unchanged — **blocked** by the same baseline/proof dependency. It benefits from the
  same fresh-clone remedy once CP-SCHEMA-1's apply path is proven.

## 11. Why `migrate resolve` remains unsafe

- On this clone, most historical migrations are `partial_stop` / `not_eligible` /
  `unknown` (and at least one group genuinely missing) → recording them as applied
  would be **false**, corrupting `_prisma_migrations` and any later apply.
- `migrate resolve --applied` may only ever target migrations whose objects are
  **fully confirmed present** — not satisfied here. **Do not resolve.**

## 12. Why production apply remains blocked

- Production (`adminiculum`) apply of CP-SCHEMA-1 requires: a suitable (fresh) clone,
  robust object confirmation, a safe reconciliation or clean single-pending state, a
  passing clone apply proof, a production apply plan, and **explicit separate
  authorization**. None are met. **No production access occurred.**

---

## 13. Recommended next prompt

> **Adminiculum — CP-SCHEMA-1 fresh PITR clone creation & handoff (operator/DBA-gated).**
> Create a **fresh** isolated non-production PITR clone from **current** production
> (must include `20260701120000_add_outlook_communication_provider_fields` and all
> foundation migrations), with a **read-only** user, and hand off a **sanitized**
> confirmation (non-secret clone name) + connection via secure channel. Then re-run
> the §4 robust SELECT-only checks against the fresh clone and confirm that
> `20260702140000_add_client_portal_foundation` is the **only** genuinely-new
> migration. **SELECT-only**; no `migrate resolve/deploy/dev`, no `db push`, no
> DDL/DML, no production mutation, no secrets committed. Docs-only output; do not
> enable Client Portal. If no fresh clone is supplied, stop and report blocked.

---

*Docs-only. This agent made no DB connection. No runtime, schema, migration, DB,
Azure, auth, or client-portal change. Robust re-check queries prepared for operator
execution; the clone is provably older/divergent; a fresh PITR clone is recommended.
Future clone-only resolve is NOT safe; CP-SCHEMA-1 apply and production apply remain
blocked; CONNECTOR-SCHEMA-1 remains blocked.*
