# Client Portal v1 — CP-SCHEMA-1 Baseline / Proof Unblocking Preflight

> Status: **docs-only preflight / gate**. No implementation, no schema edits, no
> migrations, no DB connection, no Prisma migrate, no deploy. Client Portal remains
> future-only / gated (`ENABLE_CLIENT_PORTAL` off). This document **does not**
> unblock CP-SCHEMA-1 or CONNECTOR-SCHEMA-1 — it defines exactly what must be
> **proven first** and the go/no-go criteria to unblock them later.
>
> Consolidates the baseline/migration blocker with the Client Portal security series
> (`docs/client-portal-v1-security-architecture-consolidation.md` and the CP-*/
> connector docs) and the baseline-proof docs
> (`docs/client-portal-v1-clean-local-migration-chain-proof.md`,
> `docs/production-like-clone-baseline-schema-snapshot-plan.md`,
> `docs/production-like-clone-creation-connection-handoff-runbook.md`,
> `docs/migration-history-reconciliation-lawyer-handoff-decision.md`, et al.).

---

## 1. Executive summary

CP-SCHEMA-1 (the first Client Portal identity/membership schema foundation) **cannot
be implemented** until the Prisma **migration baseline** is proven against a
**confirmed non-production, production-like clone**. The repository uses a **no-op
baseline** migration while later migrations assume baseline tables already exist, so
a clean replay from an **empty** database is invalid and fails early. The local
`localhost/adminiculum` database is **drifted/disposable** and is **not** valid proof.
Repository history evidence is only **partially recoverable**.

Therefore the safe unblocking path is: (1) a human provides an **isolated
production-like/PITR clone**; (2) a **read-only** snapshot of that clone's schema +
`_prisma_migrations` is captured; (3) a **repo-vs-clone drift assessment** is
produced; (4) only if the **go criteria** pass may CP-SCHEMA-1 be authored as an
**additive/inert, default-off** migration and proven against the clone — **never
against production, never as a schema/DB change in this task**.

**This preflight changes nothing.** It is the gate specification.

---

## 2. Current blocker

- **CP-SCHEMA-1 is blocked** until migration proof is resolved; **CONNECTOR-SCHEMA-1**
  is blocked by the **same** baseline/proof work.
- **Empty-DB replay is invalid.** The repo baseline migration
  `20260211153100_baseline/migration.sql` is a **literal no-op**:
  ```sql
  -- No-op: This migration just establishes the baseline for Prisma to track migrations
  SELECT 1;
  ```
  It creates **no tables**, but later migrations assume the baseline objects
  (`clients`, `users`, `cases`, …) already exist.
- **First known empty-DB failure:** `20260212180000_add_workload_tracking` — it
  executes `"clientId" UUID NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE`,
  which fails because `clients` does not exist after the no-op baseline.
- **Local DB is not proof.** `localhost/adminiculum` is drifted/disposable and must
  **not** be used as baseline evidence.
- **Repo history is partially recoverable only** — the pre-baseline object-creation
  DDL is not fully present in the migrations folder.
- **Migration-set observations (evidence for the comparison, not proof):**
  - Repo migrations dir contains 20 migrations from `20260211153100_baseline` …
    `20260701120000_add_outlook_communication_provider_fields`.
  - The repo contains `20260622150000_add_lawyer_handoff_packages_foundation` but
    **does not** contain a `20260515190000_add_lawyer_handoff_package` migration
    (named in some planning notes) — this apparent naming/history discrepancy is
    exactly what the clone comparison must reconcile.
  - Separately-known production evidence (from prior read-only ops work): production
    `_prisma_migrations` uses a **foundation-reconciliation model** recording only a
    subset of migrations, not the full repo chain. **Production is not the proof
    target** — a non-production clone is required; production must not be
    mutated/used for migration proof.
- **Production-like/PITR clone evidence is required** before any deploy-facing
  migration confidence for CP-SCHEMA-1. So far clone snapshot execution has been
  **blocked** because no confirmed clone connection was supplied.

---

## 3. Baseline / proof requirements before CP-SCHEMA-1

### A) Confirmed non-production clone
- Isolated **PITR / production-like** clone of the production database.
- **No app runtime** pointed at the clone; **no external callbacks**.
- **No secrets committed** to the repo; connection supplied **only via local
  shell/session** (e.g. an env var set interactively), never in files or logs.
- Preferably a **read-only DB user** for the first snapshot.
- Explicit human confirmation that the target is **non-production** and disposable.

### B) Read-only clone snapshot (must capture)
- `_prisma_migrations` metadata: migration **names, checksums, finished/rolled-back
  status, applied count**.
- Presence of the **no-op baseline** migration record.
- Presence/state of `20260212180000_add_workload_tracking`,
  `20260622150000_add_lawyer_handoff_packages_foundation` (and reconciliation of any
  `20260515190000_add_lawyer_handoff_package` reference), and the latest applied
  migration.
- **Tables / columns / enums / indexes / FKs** (from `information_schema` +
  `pg_type`/`pg_enum`/`pg_indexes`/constraints).
- **Baseline-critical objects:** `clients`, `users`, `cases`, `tasks`, `documents`,
  `communications`, workload/time (`workload_records`/`time_entries`), handoff
  package objects, document review/session objects.

### C) Repo-vs-clone comparison (must answer)
- Does the clone contain the baseline objects that are **missing from an empty DB**?
- Does the clone have migrations **missing from the repo**?
- Does the repo have migrations **missing from the clone**?
- Are there any **failed / rolled-back** migrations?
- Is the **lawyer-handoff migration history** understood (the foundation vs the
  planning-named migration)?
- Is the clone **suitable** as an additive-migration proof target?

### D) Additive migration proof target
- **Only after** the read-only snapshot may the clone be used for **additive**
  migration candidate proof.
- **No production deploy** before clone proof.
- **No CP-SCHEMA-1 migration** authored/applied until the go criteria (§6) are met.

---

## 4. Intended CP-SCHEMA-1 scope

CP-SCHEMA-1 must be **additive / inert / default-off** and contain **only** the
identity/membership foundation, e.g.:
- `ClientPortalUser`
- `ClientPortalTeam`
- `ClientPortalMembership`
- `ClientPortalInvitation`
- `ClientPortalFeatureSettings`
- `ClientPortalAuditEvent` *(only if safe as pure foundation audit)*

It must **NOT** yet include: publication artifacts; grants/publications; documents/
uploads; messages; reports; integrations/connectors; outbound sync; API routes; UI;
auth enablement; or any **seed/backfill that makes existing data visible**.

**Invariant:** **no existing internal `Case`/`Task`/`Document`/`Communication` data
becomes client-visible from CP-SCHEMA-1.** It adds empty foundation tables only.

---

## 5. Additive / inert migration criteria

CP-SCHEMA-1's later migration must satisfy **all**:
- **new tables/enums only**;
- **no destructive changes** to existing tables;
- **no required (NOT NULL, no default) fields** added to populated tables;
- **no data backfill** that grants access;
- **no client-visible data publication**;
- **no route/runtime** reads the new tables (portal stays off);
- **portal not enabled** (`ENABLE_CLIENT_PORTAL` unchanged/off);
- **no credentials/secrets**;
- **all defaults safe/off**;
- **no automatic memberships** for existing clients (unless separately approved);
- **no domain-based auto-join**; **no global client list**; **no connector activation**.

It should follow the repo's established **idempotency-aware** additive style
(`CREATE TABLE IF NOT EXISTS`, guarded `CREATE TYPE`, `ADD COLUMN IF NOT EXISTS`,
partial unique indexes) and the foundation-reconciliation recording pattern used for
prior additive migrations.

---

## 6. Go / no-go matrix

| # | Criterion | GO requires | NO-GO if |
| --- | --- | --- | --- |
| 1 | Clone exists | confirmed non-production clone available | no clone connection supplied |
| 2 | Clone identity | confirmed non-production (not prod) | clone cannot be confirmed non-production |
| 3 | Snapshot | read-only clone snapshot completed | snapshot not run / incomplete |
| 4 | Migration metadata | `_prisma_migrations` understood | metadata unreadable/ambiguous |
| 5 | Failed migrations | none unresolved | failed/rolled-back migrations present |
| 6 | Repo↔clone mismatch | documented and accepted | mismatch unexplained |
| 7 | Handoff history | duplicate/missing handoff migration risk resolved | handoff migration ambiguity unresolved |
| 8 | Baseline certainty | baseline objects confirmed in clone | schema baseline still speculative |
| 9 | Additive target | additive migration target accepted | CP-SCHEMA-1 would edit historical migrations |
| 10 | Data exposure | CP-SCHEMA-1 exposes no existing data | CP-SCHEMA-1 would expose existing data |
| 11 | Secrets/env | none committed | any env/secrets would be committed |
| 12 | Prod access | not required | production DB access required |
| 13 | Scope + validation | CP-SCHEMA-1 scope + validation plan approved; prod deploy out of scope | scope/validation not approved |

**GO for CP-SCHEMA-1 implementation only if criteria 1–13 all resolve to the GO
column. Any NO-GO condition blocks.** Current state: **NO-GO** (no confirmed clone;
snapshot not run; mismatch not yet reconciled).

---

## 7. Future execution sequence (safe order)

1. **Human** creates or selects an isolated production-like / PITR clone.
2. **Operator** supplies the filled clone confirmation and sets `CLONE_DATABASE_URL`
   **only in the local shell/session** (never a committed file).
3. Run the **read-only clone baseline schema snapshot** execution.
4. Create the **repo-vs-clone drift/proof assessment**.
5. If suitable, prepare the **CP-SCHEMA-1 implementation prompt**.
6. Implement CP-SCHEMA-1 **only against a local/proof target**, not production.
7. Apply the candidate migration **to the production-like clone**.
8. Run **backend validation**.
9. Only **later** create a production deployment plan.

Each step gates the next; steps 1–2 are human/operator prerequisites this preflight
cannot satisfy on its own.

---

## 8. Allowed future commands after clone handoff

**Allowed (read-only) after a confirmed clone handoff:**
- `cd Backend`
- `npx.cmd prisma validate`
- `npx.cmd prisma migrate status`
- **SELECT-only** metadata queries against the clone for:
  - `_prisma_migrations`
  - `information_schema.tables`
  - `information_schema.columns`
  - `pg_type` / `pg_enum`
  - `pg_indexes`
  - constraints / foreign keys

**Forbidden even after clone handoff** (unless a separate later task explicitly
permits):
- `prisma migrate deploy`; `prisma migrate dev`; `prisma db push`;
- `RESET` / `DROP` / `TRUNCATE` / `UPDATE` / `INSERT` / `DELETE` / `ALTER`;
- app runtime startup against the clone;
- external API / webhook calls.

**Forbidden now (this task):** all DB connections and all of the above — this preflight
runs only non-mutating repo/docs inspection + local `prisma validate` / `tsc` / tests.

---

## 9. Future CP-SCHEMA-1 validation plan (not run now)

When CP-SCHEMA-1 is later authored (against the proof target, not production):
- `git diff --check`;
- `npx prisma validate`;
- `npx prisma generate` (if schema changed);
- `npx tsc --noEmit`;
- backend tests (`npm test -- --runInBand`);
- migration **applies to the proof DB**;
- migration **applies to the production-like clone**;
- `prisma migrate status` **clean** on the proof target;
- **no runtime route behavior changed**;
- **unauthenticated portal routes remain gated/off**;
- **no client data visible**;
- **no existing data backfilled** into portal visibility.

---

## 10. Risk register

| Risk | Severity | Mitigation | Blocking? |
| --- | --- | --- | --- |
| Implementing CP-SCHEMA-1 before clone proof | High | Enforce §6 go/no-go; no migration until GO | **Blocking** |
| Using drifted local DB as proof | High | Local DB explicitly disallowed as evidence | **Blocking** |
| Wrong clone / accidental production target | Critical | Human confirmation of non-production; read-only user; no prod URL | **Blocking** |
| Secrets committed (clone URL) | High | `CLONE_DATABASE_URL` only in shell/session; never files/logs | **Blocking** |
| Repo-vs-clone migration mismatch | High | §3C comparison must document & accept before GO | **Blocking** |
| Lawyer-handoff migration ambiguity (`_foundation` vs planning-named) | Medium | Reconcile in clone comparison; document decision | **Blocking until reconciled** |
| No-op baseline hides real state | Medium | Snapshot actual objects from clone, not from migrations | Mitigated by snapshot |
| CP-SCHEMA-1 accidentally exposes client data | High | Additive/inert criteria §5; no backfill; portal off | **Blocking** |
| Domain-based auto-membership introduced | High | Invitation-only; no auto-join; explicit test | **Blocking** |
| Feature gates misconfigured (portal on) | High | `ENABLE_CLIENT_PORTAL` stays off; verify post-migration | **Blocking** |
| Migration passes locally but fails on clone | Medium | Require apply-to-clone proof before prod plan | **Blocking for prod** |

---

## 11. Blocking issues (current)

1. **No confirmed non-production clone connection** supplied → snapshot cannot run.
2. **Read-only clone snapshot not yet executed** → baseline objects unproven.
3. **Repo-vs-clone drift assessment not produced** → mismatch/handoff-history
   ambiguity unresolved (incl. the missing `20260515190000_add_lawyer_handoff_package`
   vs present `_foundation` migration).
4. **Empty-DB replay invalid** (no-op baseline + `workload_tracking` needs `clients`)
   → cannot self-prove locally.
5. **Local DB is drifted/disposable** → not usable as evidence.

Until 1–5 are resolved, **CP-SCHEMA-1 stays NO-GO** and **CONNECTOR-SCHEMA-1**
(sharing the same baseline dependency) stays blocked.

---

## 12. Recommended next prompt

> **Adminiculum — Production-like clone read-only baseline snapshot execution (operator-gated).**
> Only after a human supplies a confirmed **non-production** clone and sets
> `CLONE_DATABASE_URL` in the local shell: run the **read-only** schema +
> `_prisma_migrations` snapshot per
> `docs/production-like-clone-baseline-schema-snapshot-plan.md`, capturing
> tables/columns/enums/indexes/FKs and migration metadata, and write the results
> doc. **SELECT-only**; no `migrate`/`db push`/DDL/DML; no app runtime; no
> production access; no secrets committed. If no confirmed clone is supplied, stop
> and report blocked (no changes). Do not implement CP-SCHEMA-1.

---

*Docs-only. No runtime, schema, migration, DB, auth, or client-portal-enablement
change. CP-SCHEMA-1 and CONNECTOR-SCHEMA-1 remain blocked.*
