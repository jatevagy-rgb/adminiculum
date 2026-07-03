# CP-SCHEMA-1 — Fresh PITR Clone Creation & Handoff Runbook

> Status: **docs-only runbook**. No DB connection, no `DATABASE_URL` / `CLONE_*` use,
> no `prisma migrate`, no SQL, no Azure execution, no schema edits, no migration
> creation, no deploy, no Client Portal runtime. This document specifies **operator/
> DBA steps** for creating a fresh non-production PITR clone; **this agent executes
> none of them.** Client Portal remains future-only / gated.
>
> Read alongside:
> - `docs/cp-schema-1-clone-divergence-robust-recheck.md`
> - `docs/cp-schema-1-clone-historical-migration-object-checks.md`
> - `docs/cp-schema-1-clone-apply-proof-blocked-migration-history.md`
> - `docs/cp-schema-1-clone-transactional-proof.md`
> - `docs/production-like-clone-baseline-schema-snapshot.md`
> - `Backend/prisma/migrations/20260702140000_add_client_portal_foundation/migration.sql`

---

## 1. Executive summary

The existing clone `adminiculum-bp3-rc1b-clone` is **unsuitable** for the CP-SCHEMA-1
apply proof: it is an **older/partial PITR** whose physical schema is missing objects
that current production has (most decisively, the Communication provider enums added
~2026-07-01), so it sits **before** CP-SCHEMA-1's chain position.

This runbook defines how the operator/DBA creates a **fresh PITR clone from current
production** — one that physically contains **all** foundation + historical objects
(incl. `20260701120000_add_outlook_communication_provider_fields`) but has **not**
yet applied `20260702140000_add_client_portal_foundation` — plus the read-only
handoff, SELECT-only verification gates, and go/no-go criteria.

**Important nuance:** a raw PITR inherits production's **sparse
`_prisma_migrations`** (the foundation-reconciliation model), so `prisma migrate
status` on the fresh clone will still report the historical repo migrations as "not
applied" **even though their objects exist**. The fresh clone therefore fixes the
**object-staleness** problem (making a later `migrate resolve --applied`
reconciliation *truthful and safe*), but does **not** by itself make CP-SCHEMA-1 the
sole pending migration — that reconciliation is a **separate, authorized** follow-up.
This runbook covers **clone creation + verification only**; it applies nothing.

---

## 2. Why the old clone is unsuitable

- Operator SELECT-only checks (`bb32d2e`) + robust re-check analysis (`b46b4d1`) show
  the clone's schema is **partial/divergent**.
- Confirmed **true-missing:** `CommunicationDirection` / `CommunicationSource` /
  `CommunicationSyncStatus` enums — the clone PITR **predates** the ~2026-07-01
  production apply of `20260701120000_add_outlook_communication_provider_fields` →
  the clone is **older than current production**.
- Likely parser false-negatives on older schema-qualified objects (`legal_analyses`,
  `timesheet_presets`, timesheet report tables) — but the staleness alone makes it a
  poor apply-proof target regardless.
- Net: **not a faithful copy of current production** → replaced by a fresh PITR.

---

## 3. Fresh clone goal

A fresh, isolated, **non-production** PITR clone of the **current** production
database `adminiculum` such that:
- **all** foundation + historical objects exist physically (incl. outlook provider
  enums/columns);
- `_prisma_migrations` matches current production's recorded set (incl.
  `20260701120000`);
- `20260702140000_add_client_portal_foundation` is **not** applied and its CP
  objects **do not exist**;
- the clone is safe to run read-only SELECT checks and, later (separate task), a
  reconciliation + CP apply proof — **never** touching production.

---

## 4. Required clone properties

| Property | Requirement |
| --- | --- |
| Source | **current** production `adminiculum` (flexible server), after the migrations in §10 |
| Type | PITR / point-in-time restore (physical copy) |
| Classification | **non-production**, isolated, disposable |
| App runtime pointed at it | **no** |
| Access | **read-only** DB user for verification |
| Restore point | **after** `20260701120000_add_outlook_communication_provider_fields` was applied to production, and **before** any CP-SCHEMA-1 apply (which has not happened) — i.e. effectively "now" |
| Network | reachable only from the operator's Cloud Shell / secure admin context; no public app exposure |
| Naming | descriptive non-secret name, e.g. `adminiculum-cpschema1-pitr-<yyyymmdd>` |

---

## 5. Azure operator steps (runbook only — **DBA executes, agent does not**)

> ⚠️ **This agent does not run any of the following.** These are for the operator/DBA.

**(a) Create the fresh PITR clone (flexible-server restore):**
```bash
# DBA/operator only. Adjust names/time. Do NOT run from this agent.
az postgres flexible-server restore \
  --resource-group Adminiculum-RG \
  --name adminiculum-cpschema1-pitr-<yyyymmdd> \
  --source-server adminiculum \
  --restore-time "<ISO8601 UTC restore point — recent, after the 2026-07-01 outlook apply>"
```

**(b) Keep it isolated:**
- Do **not** point any App Service / app runtime at the new server.
- Restrict firewall to the admin/Cloud Shell context only; no broad public access.
- Confirm it is a distinct server (not `adminiculum`, the production one).

**(c) Create a least-privilege read-only user (on the fresh clone only):**
```sql
-- DBA runs on the fresh clone only. Password set via secure channel; never committed.
CREATE ROLE adm_cpschema1_ro LOGIN PASSWORD '<set-securely-not-here>';
GRANT CONNECT ON DATABASE adminiculum TO adm_cpschema1_ro;
GRANT USAGE ON SCHEMA public TO adm_cpschema1_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO adm_cpschema1_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT TO adm_cpschema1_ro;
```
> These are **operator/DBA** setup statements on the **clone**; the agent runs no DDL.
> The read-only role must have **SELECT only** — no INSERT/UPDATE/DELETE/DDL.

---

## 6. Required clone identity confirmation (handoff)

The operator hands off a **sanitized** confirmation (no secrets, no connection
string), filled **without placeholders**:

```
Fresh clone confirmation:
- Clone created: yes
- Clone name: adminiculum-cpschema1-pitr-<yyyymmdd>
- Source: PITR of current production adminiculum
- Restore point: <ISO8601 UTC> (after 20260701120000 outlook apply)
- Production DB: not targeted
- App runtime pointed to clone: no
- Read-only user: adm_cpschema1_ro (SELECT-only)
- Connection supplied via secure channel / local shell only: yes
- Secrets committed: no
- Permission to run read-only metadata/verification SELECTs: yes
```

The connection string is supplied via a secure channel and set into a **session-only**
env var (never committed, never `.env`, never pasted into chat). Note the
session-inheritance caveat: verification SELECTs must run **from the same shell
session** that holds the connection (Cloud Shell), or via a runbook whose sanitized
results are pasted back.

---

## 7. Required read-only user / credential hygiene

- Role: **SELECT-only** (`adm_cpschema1_ro`), no write/DDL privileges.
- Password/connection string: **secure channel only**; never printed, never committed,
  never in a repo `.env`.
- Session-scoped env var for the connection; boolean-checked with `[bool]$env:...`
  (value never echoed).
- Rotate/disable the read-only user when the clone is disposed (§12).

---

## 8. Forbidden actions (during and after clone creation)

- No `prisma migrate deploy` / `dev` / `resolve` / `db push` on the fresh clone in
  **this** runbook's scope (reconciliation + apply proof are **separate authorized
  tasks**).
- No DDL/DML beyond the DBA's read-only-user setup on the clone.
- No production DB access or mutation.
- No app runtime pointed at the clone.
- No secrets printed/committed; no `.env` committed.
- No Client Portal runtime enablement.

---

## 9. Required SELECT-only verification after clone creation

Run the robust queries from `docs/cp-schema-1-clone-divergence-robust-recheck.md` §4,
against the **fresh clone** (read-only), and additionally confirm the CP objects are
**absent**. All SELECT-only.

**(a) Foundation/historical objects PRESENT** (expect all found):
```sql
SELECT
  to_regclass('public.communications')        AS communications,
  to_regclass('public.communication_attachments') AS communication_attachments,
  to_regclass('public.lawyer_handoff_packages') AS lawyer_handoff_packages,
  to_regclass('public.timesheet_report_instances') AS timesheet_report_instances,
  to_regclass('public.legal_analyses')         AS legal_analyses,
  to_regclass('public.client_house_style_profiles') AS client_house_style_profiles;

SELECT typname FROM pg_type
WHERE typname IN ('CommunicationDirection','CommunicationSource','CommunicationSyncStatus')
ORDER BY typname;   -- expect all THREE present on a fresh (post-outlook) clone
```

**(b) CP-SCHEMA-1 objects ABSENT** (expect NONE found — nothing applied yet):
```sql
-- CP tables (7) — expect all NULL (absent):
SELECT
  to_regclass('public.client_portal_users')          AS client_portal_users,
  to_regclass('public.client_portal_memberships')    AS client_portal_memberships,
  to_regclass('public.client_portal_grants')         AS client_portal_grants,
  to_regclass('public.client_portal_audit_events')   AS client_portal_audit_events,
  to_regclass('public.client_submissions')           AS client_submissions,
  to_regclass('public.client_submission_attachments') AS client_submission_attachments,
  to_regclass('public.client_visible_artifacts')     AS client_visible_artifacts;

-- CP enums (16) — expect 0 rows:
SELECT typname FROM pg_type WHERE typname IN (
  'ClientPortalUserStatus','ClientPortalMembershipRole','ClientPortalMembershipStatus',
  'ClientPortalGrantScope','ClientPortalGrantAction','ClientPortalGrantStatus',
  'ClientPortalActorType','ClientPortalAuditAction','ClientPortalAuditOutcome',
  'ClientSubmissionType','ClientSubmissionStatus','ClientSubmissionAttachmentStatus',
  'ClientSubmissionAttachmentScanStatus','ClientVisibleArtifactType',
  'ClientVisibleArtifactStatus','ClientVisibleSourceType'
) ORDER BY typname;
```

**(c) Migration metadata** (context):
```sql
SELECT migration_name, (finished_at IS NOT NULL) AS finished, (rolled_back_at IS NOT NULL) AS rolled_back
FROM "_prisma_migrations" ORDER BY started_at;
-- expect 20260701120000_add_outlook_communication_provider_fields recorded/finished;
-- expect 20260702140000_add_client_portal_foundation NOT present.
```

---

## 10. Required Prisma migrate status expectation

- The fresh clone must physically contain objects from at least:
  - `20260622150000_add_lawyer_handoff_packages_foundation`,
  - `20260628190000_add_communication_baseline`,
  - `20260701120000_add_outlook_communication_provider_fields`.
- `20260702140000_add_client_portal_foundation` must **not** be applied (CP objects
  absent per §9b).
- **Realistic caveat:** because the fresh PITR inherits production's **sparse
  `_prisma_migrations`**, `prisma migrate status` will likely still list the older
  historical repo migrations as "not applied" (their rows aren't recorded) even
  though their objects exist. This is **expected** and is **not** a blocker for the
  fresh clone itself — it is resolved in a **separate authorized reconciliation task**
  by `migrate resolve --applied` for the historical migrations (now safe, because
  §9a confirms their objects are physically present). The **ideal end-state** (CP as
  the sole pending migration) is achieved **after** that reconciliation, not by the
  raw PITR.

---

## 11. Go / no-go criteria (for accepting the fresh clone)

**GO** (fresh clone accepted as apply-proof target candidate) if **all**:
- clone confirmed **non-production**, isolated, no app runtime;
- read-only user (`SELECT`-only) available; connection via secure/session-only channel;
- §9a foundation/historical objects **present** (incl. the 3 Communication provider enums);
- §9b CP tables (7) and CP enums (16) **absent**;
- §9c `_prisma_migrations` shows outlook recorded and CP **not** present;
- no secrets committed.

**NO-GO** if any of:
- clone cannot be confirmed non-production, or is the production server;
- any CP object already exists (clone not "before CP");
- Communication provider enums **absent** (clone still too old / wrong restore point);
- read-only user not available or over-privileged;
- connection/secret would be committed or printed;
- any mutation would be required to verify.

Until GO, **clone apply proof stays blocked**.

---

## 12. Cleanup / disposal expectation

- The fresh clone is **disposable**: delete the flexible server after the apply proof
  work concludes (or when superseded), to avoid cost and reduce data exposure.
- Drop/disable the read-only user on disposal.
- Confirm no residual secrets remain in any shell history / notes.
- Disposal is an **operator/DBA** action (Azure), not this agent.

---

## 13. Security notes

- The clone contains **real production data** (PITR copy) → treat as sensitive:
  read-only user, isolated network, disposable, no app exposure, no data export.
- **No business/client row data** is queried by verification (existence/metadata only).
- Connection strings/passwords: **secure channel only**, never committed/printed.
- No Client Portal runtime is enabled; no existing data becomes client-visible.
- Production is **never** the target of clone or apply-proof operations.

---

## 14. Recommended next prompt

> **Adminiculum — CP-SCHEMA-1 fresh clone verification & reconciliation gate (operator-run read-only).**
> After the DBA creates the fresh PITR clone per
> `docs/cp-schema-1-fresh-pitr-clone-handoff-runbook.md` and hands off a sanitized
> confirmation + read-only connection: run the §9 SELECT-only verification (foundation
> objects present incl. the 3 Communication provider enums; CP 7 tables + 16 enums
> absent; `_prisma_migrations` shows outlook recorded, CP not present). Record
> sanitized results and evaluate the §11 go/no-go. If GO, define the clone-only
> `migrate resolve --applied` reconciliation list for the historical migrations (now
> object-confirmed) so CP becomes the sole pending migration — as a **plan only**, no
> mutation. **SELECT-only**; no `migrate resolve/deploy/dev`, no `db push`, no DDL/DML,
> no production, no secrets. Docs-only output; do not enable Client Portal.

---

*Docs-only. No DB connection, no runtime, schema, migration, DB, Azure, auth, or
client-portal change. Fresh PITR clone creation is an operator/DBA action; this
runbook executes nothing. Clone apply proof and production apply remain blocked until
a suitable fresh clone exists and is verified; CONNECTOR-SCHEMA-1 remains blocked.*
