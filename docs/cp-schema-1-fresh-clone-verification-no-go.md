# CP-SCHEMA-1 — Fresh Clone Verification: NO-GO

> Status: **docs-only NO-GO report.** This agent made **no DB connection** and touched
> **no Azure**. It records the operator's SELECT-only verification of a fresh PITR
> clone (created from current production and **deleted after verification**) and the
> resulting **NO-GO** decision. No mutation, no `migrate`, no production, no secrets.
>
> Read alongside:
> - `docs/cp-schema-1-fresh-pitr-clone-handoff-runbook.md`
> - `docs/cp-schema-1-clone-divergence-robust-recheck.md`
> - `docs/cp-schema-1-clone-apply-proof-blocked-migration-history.md`
> - `docs/cp-schema-1-clone-transactional-proof.md`

---

## 1. Executive summary

A **fresh** PITR clone `adminiculum-cp1-fresh-20260703` was created from **current**
production, verified read-only, and then deleted. The fresh clone **fixed the old
clone's object-staleness** problem — the Outlook/communication provider enums and
columns and all foundation objects are present, and the CP-SCHEMA-1 objects are
correctly **absent** (nothing applied yet).

However, the fresh clone **did not fix the Prisma migration-history divergence**.
`prisma migrate status` still reports **16 repo migrations as "not applied"** (the
sparse foundation-reconciliation `_prisma_migrations` inherited from production),
plus a **DB-only migration with no repo file** (`20260302142000_add_kb_learning_escalation`),
and the historical object check found several migrations whose objects are **not
physically represented** (30 missing historical objects observed).

Because the migration history is **not clean** and several historical migrations
cannot be confirmed as fully materialized, it is **not truthful or safe** to run
`migrate resolve --applied` for them, and `migrate deploy` would try to replay
them. **Decision: NO-GO.** CP-SCHEMA-1 clone apply proof remains **blocked** and
production apply remains **blocked**, pending an explicit production
migration-history remediation strategy. **No DB mutation was or will be performed
until that strategy is accepted.**

Key insight: a fresh clone can fix **object staleness**, but it **cannot** fix
**production's recorded migration history** — the divergence is a property of
production's `_prisma_migrations`, which the PITR faithfully copies.

---

## 2. Fresh clone identity and lifecycle

- **Name (non-secret):** `adminiculum-cp1-fresh-20260703`
- **Database:** `adminiculum`
- **Source:** PITR of **current** production server `adminiculum`
- **Target:** fresh clone only — **not** production
- **Lifecycle:** created by operator → verified SELECT-only → **deleted** after
  verification.
- **Final Azure state:** only the production server `adminiculum` remains (both clone
  servers deleted).

---

## 3. Safety scope

- production DB connection: **no**;
- clone DB connection by this agent: **no** (operator ran the checks; agent documents);
- SQL type (operator): **SELECT-only**; read-only user; **no** DDL/DML;
- production DB mutation: **no**;
- Azure touched by this agent: **no**;
- DB env cleared after session; clone deleted;
- secrets printed/committed: **no**; business/client row data exported: **no**.

---

## 4. SELECT-only verification summary

The operator ran read-only existence checks (`to_regclass`, `information_schema`,
`pg_type`, `pg_indexes`, `_prisma_migrations`) against the fresh clone. Results are
grouped below (§5–§8). All checks were **metadata/existence only**.

---

## 5. Successful foundation / Outlook checks (fresh clone — PASS)

- **`_prisma_migrations` finished (recorded):**
  `20260622150000_add_lawyer_handoff_packages_foundation`,
  `20260628190000_add_communication_baseline`,
  `20260701120000_add_outlook_communication_provider_fields`.
- **Baseline tables present:** `_prisma_migrations`, `cases`, `clients`,
  `communications`, `documents`, `tasks`, `users`.
- **Communication provider enums present:** `CommunicationDirection`,
  `CommunicationSource`, `CommunicationSyncStatus`. ✅ (fixes the old clone's true-missing gap)
- **Communication provider columns present:** `communications.direction`,
  `communications.externalMessageId`, `communications.providerConversationId`,
  `communications.source`, `communications.syncStatus`.
- **`lawyer_handoff_packages` table present.**
- **Communication baseline tables present:** `communications`,
  `communication_attachments`.

→ The fresh clone is **current** with respect to the Outlook/foundation objects (the
old clone's staleness is resolved).

---

## 6. CP pre-apply absence result (fresh clone — PASS)

CP-SCHEMA-1 objects are correctly **absent** (nothing applied yet):

- **CP tables — 0 rows (absent):** `client_portal_users`, `client_portal_memberships`,
  `client_visible_artifacts`, `client_portal_grants`, `client_submissions`,
  `client_submission_attachments`, `client_portal_audit_events`.
- **CP enums — 0 rows (absent):** `ClientPortalActorType`, `ClientPortalAuditAction`,
  `ClientPortalAuditOutcome`, `ClientPortalGrantAction`, `ClientPortalGrantScope`,
  `ClientPortalGrantStatus`, `ClientPortalMembershipRole`, `ClientPortalMembershipStatus`,
  `ClientPortalUserStatus`, `ClientSubmissionAttachmentScanStatus`,
  `ClientSubmissionAttachmentStatus`, `ClientSubmissionStatus`, `ClientSubmissionType`,
  `ClientVisibleArtifactStatus`, `ClientVisibleArtifactType`, `ClientVisibleSourceType`.

→ Good for apply-proof isolation of CP itself (`20260702140000_add_client_portal_foundation`
would be genuinely new).

---

## 7. Prisma migrate status result (fresh clone — DIVERGENT)

- **21 local migrations** found in `Backend/prisma/migrations`.
- **Last common migration:** `20260212180000_add_workload_tracking`.
- **Not yet applied per the fresh clone DB (16):**
  `generation_drafts`, `anonymous_documents`, `rehydration_fields`,
  `client_identity_fields`, `case_client_role`, `client_color`, `case_collaborators`,
  `comparison_snapshot_foundation`, `timesheet_report_instances`,
  `timesheet_report_artifacts`, `timesheet_presets`, `legal_analyses`,
  `client_house_style_profile`, `client_house_style_header_fields`, `workspace_text`,
  **`client_portal_foundation`**.
- **Recorded in DB but not found locally:** `20260302142000_add_kb_learning_escalation`.

→ Same **sparse foundation-reconciliation** `_prisma_migrations` as production; the
fresh PITR **inherits** it. CP is **not** the sole pending migration.

---

## 8. Historical object check summary (fresh clone)

| Bucket | Migrations |
| --- | --- |
| **eligible_candidate** (objects found) | `20260406120000_add_client_color`, `20260518120000_add_workspace_text` |
| **partial_stop** (some present, some missing) | `20260331090100_add_anonymous_documents`, `20260408140000_add_case_collaborators` |
| **not_eligible** (objects missing) | `20260330120000_add_generation_drafts`, `20260417100000_add_timesheet_report_instances`, `20260417113000_add_timesheet_report_artifacts`, `20260417123000_add_timesheet_presets`, `20260514201500_add_legal_analyses`, `20260517175500_add_client_house_style_profile` |

- **30 missing historical objects** observed by the generated check.
- DB-only kb/knowledge/learning/escalation-like objects: **0 rows**.
- CP pre-apply absence: **0 rows** (confirmed).
- Baseline tables: **present**.

**Parser caveat (unchanged):** the same generated checker was used, which previously
mis-read schema-qualified DDL (`CREATE TABLE/TYPE "public"."…"`). So some
`not_eligible` results (e.g. `legal_analyses`, `timesheet_presets`) **may** still be
false-negatives. **However**, this does not change the decision: whether those objects
are truly missing **or** the checker cannot prove they exist, they **cannot be
confirmed present**, so they **cannot** be safely `resolve --applied`. And the
`_prisma_migrations` divergence + DB-only migration are real and independent of the
parser question.

---

## 9. Why `migrate resolve --applied` is not allowed

- `migrate resolve --applied <name>` records a migration as applied **without running
  its SQL** — it is only truthful if that migration's objects **already exist**.
- On the fresh clone, only **2** historical migrations are confirmed eligible; **4**
  are partial/blocked and **6** are not_eligible/unconfirmable (+5 not separately
  emitted), plus a DB-only migration with no repo file.
- Resolving migrations whose objects are **not confirmed present** would write **false
  history** into `_prisma_migrations`, corrupting future migration integrity.
- Therefore historical `migrate resolve --applied` is **not allowed** here.

---

## 10. Why `migrate deploy` is not allowed

- `migrate deploy` would attempt all **16 "not applied"** migrations in order; those
  whose objects **do** exist → **duplicate-object failures**; those whose objects
  don't → partial mutation. Either way it corrupts the clone (and would be
  catastrophic on production).
- It cannot isolate the single genuinely-new CP migration.
- It is a **mutating** command — out of scope and forbidden.

---

## 11. CP-SCHEMA-1 current status

- Migration file (`1f43dab`) and **transactional proof** (`015f859`) remain **valid**
  (the CP DDL applies additively and rolls back cleanly).
- **Apply proof:** **BLOCKED** — the fresh clone cannot be brought to a clean
  "CP-as-sole-pending" state without an unsafe historical resolve/deploy.
- **Production apply:** **BLOCKED** — same migration-history divergence; production's
  own `_prisma_migrations` is the root.
- CP-SCHEMA-1 remains **NO-GO**.

---

## 12. Azure cleanup result

- Fresh clone `adminiculum-cp1-fresh-20260703` **deleted** after verification.
- The earlier stale clone `adminiculum-bp3-rc1b-clone` also removed.
- **Final Azure PostgreSQL flexible-server list: only `adminiculum` (production)** remains.
- DB env cleared after the session; no residual clone connection.

---

## 13. Go / no-go conclusion

**NO-GO.**

- ✅ Fresh clone object completeness (foundation/Outlook present; CP absent).
- ❌ Migration history **not clean** (sparse `_prisma_migrations`; 16 repo migrations
  "not applied"; 1 DB-only migration; historical objects unconfirmable/partly missing).
- ❌ Historical `migrate resolve --applied` **not truthful/safe**.
- ❌ `migrate deploy` **unsafe**.

→ CP-SCHEMA-1 clone apply proof and production apply **remain blocked**. **No DB
mutation** may proceed until a production migration-history remediation strategy is
**explicitly accepted**.

---

## 14. Recommended next options

- **A.** **Stop CP-SCHEMA-1 apply work** until a **production migration-history
  strategy** is decided (recommended immediate posture).
- **B.** **Decide** whether the absent historical feature migrations are
  **intentionally not production features** (→ repo/history cleanup to remove/baseline
  those migration files) **or** whether **production is genuinely missing required
  schema** (→ a controlled additive remediation). This requires human/legal-ops +
  engineering judgment, and a **robust, parser-independent** confirmation of which
  objects truly exist in production.
- **C.** **Prepare a separate production migration-history remediation plan**
  (docs-only first): reconcile `_prisma_migrations` to the real physical schema,
  resolve the DB-only `kb_learning_escalation`, and define how CP-SCHEMA-1 (and future
  additive migrations) apply via the established **idempotent-additive + manual
  resolve/record** pattern rather than `migrate deploy`.
- **D.** **Do not perform any DB mutation** until the remediation strategy is
  explicitly accepted.

---

## 15. Final classification

`cp_schema1_fresh_clone_verification_no_go_documented_no_db_change_no_runtime_change`

---

*Docs-only. This agent made no DB connection and touched no Azure. No runtime, schema,
migration, DB, auth, or client-portal change. The fresh clone was created by the
operator, verified SELECT-only, and deleted. Historical `migrate resolve` is not
allowed; clone apply proof and production apply remain blocked; CONNECTOR-SCHEMA-1
remains blocked.*
