# Task Attention Migration — Readiness (Phases 4, 14 + summary)

Date: 2026-07-22
Branch: `claude/task-attention-migration-audit-1` (base `115cd01`)

## Outcome

Read-only migration audit and SQL candidate prepared. **Blocked** on the one hard
prerequisite: a live read-only production metadata inspection, for which no
authorized connection was separately available (see production-metadata doc). The
repository cannot substitute — the `tasks` table and its indexes are not in the
committed migration history (broken/incomplete history), so the exact production
state and column-absence cannot be proven from the repo.

## Task table current-state (Phase 4) — expected, UNCONFIRMED

Expected (candidate assumption, requires live confirmation):
- `tasks.attentionCategory` absent; `tasks.estimatedMinutes` absent;
- adding both nullable ⇒ **no backfill**, existing rows remain valid, **no table
  rewrite**, no FK, no uniqueness;
- row count obtainable metadata-safely (`SELECT reltuples FROM pg_class WHERE
  relname='tasks'`) at execution time — not read here.

These cannot be asserted as fact without the live read → blocker.

## Privacy & retention (Phase 14)

- New fields hold only an **enum planning classification** and an **integer
  planning estimate** — no task description, legal analysis, client/document/
  communication content.
- Retention follows the Task lifecycle: deleting a Task removes the fields with
  it; no separate retention store.
- Audit stays content-light (`TASK_ATTENTION_CATEGORY_CHANGED` /
  `TASK_ESTIMATE_CHANGED`: task id, old→new, actor, timestamp).

## DONE-MEANS status

| # | Criterion | Status |
|---|---|---|
| 1 | production metadata inspected read-only | ❌ (no authorized connection) |
| 2 | enum existence + values proven | ⚠️ proven from applied DDL; live confirm pending |
| 3 | current Task columns proven absent | ❌ requires live read |
| 4 | exact SQL candidate prepared | ✅ |
| 5 | index choice justified | ✅ (recommend defer/composite; candidate single-col is provisional) |
| 6 | locking impact assessed | ✅ |
| 7 | rollback SQL prepared | ✅ |
| 8 | partial-application handling defined | ✅ (7 states, fail-fast) |
| 9 | old/new backend compatibility documented | ✅ (B safe, E unsafe) |
| 10 | execution method avoids historical replay | ✅ (reviewed SQL + controlled record; no migrate deploy) |
| 11 | no DB mutation | ✅ (no connection made) |
| 12 | no migration directory created | ✅ |
| 13 | docs-only branch pushed | ✅ |

## Remaining blocker

A separately-provisioned, authorized **read-only production DB connection** to
run the metadata queries in the metadata/enum/partial-application docs. With that,
criteria 1–3 close and the audit advances to
`TASK_ATTENTION_MIGRATION_AUDIT_READY_FOR_EXECUTION_APPROVAL`. A secondary,
metadata-dependent item: finalize the **index strategy** (the single-column
candidate should likely become a composite or be deferred).

## Zero-change confirmation

No runtime change, no schema change, no migration directory, no DB write, no
deployment, no Azure change in this audit.

## Classification

`TASK_ATTENTION_MIGRATION_METADATA_BLOCKER`

## 2026-07-22 temporary firewall retry outcome

Outcome: the audit remained metadata-incomplete, but for a narrower reason than
the earlier network-only attempt.

Precheck succeeded:

- PostgreSQL server Ready;
- `activeDirectoryAuth` Enabled;
- `passwordAuth` Enabled;
- current public egress IP identified as `37.76.6.18`;
- frontend and backend returned HTTP 200;
- temporary firewall rule `metadata-audit-client-20260722` was absent.

Stop condition:

- Azure CLI Entra admin list returned `[]`;
- ARM administrators resource returned `[]`;
- the authorized run required proof that the current user is the Entra
  administrator before opening the firewall and attempting a token connection.

Actions not taken:

- no firewall rule created;
- no token requested;
- no database connection attempted;
- no read-only transaction opened;
- no metadata queries run;
- no migration, schema, runtime, Azure app setting, or deployment change.

Cleanup:

- temporary firewall rule remained absent;
- server remained Ready;
- auth settings remained Enabled/Enabled;
- app health remained HTTP 200.

Updated DONE-MEANS status:

| # | Criterion | Status after retry |
|---|---|---|
| 1 | production metadata inspected read-only | ❌ blocked by Entra admin proof |
| 2 | enum existence + values proven live | ❌ not queried |
| 3 | current Task columns proven absent | ❌ not queried |
| 4 | exact SQL candidate prepared | ✅ still candidate-only |
| 5 | index choice justified from live metadata | ❌ not queried |
| 6 | locking impact assessed from live size | ❌ not queried |
| 11 | no DB mutation | ✅ |
| 12 | no migration directory created | ✅ |

Network/security classification:
`POSTGRES_METADATA_AUTHENTICATION_BLOCKER`

Migration-audit classification:
`TASK_ATTENTION_MIGRATION_METADATA_INCOMPLETE`

## 2026-07-22 successful metadata audit and readiness update

The operator-visible Entra administrator assignment became visible through both
Azure CLI and ARM. The approved temporary-firewall read-only metadata audit then
completed successfully.

Completed proof:

- Entra administrator principal:
  `hubay.gyula@balintfy.onmicrosoft.com`;
- current public egress IP: `37.76.6.18`;
- temporary firewall rule:
  `metadata-audit-client-20260722`;
- rule scope: `37.76.6.18` to `37.76.6.18`;
- read-only session proof: `transaction_read_only = on` before and inside
  `BEGIN READ ONLY`;
- final transaction action: `ROLLBACK`;
- temporary firewall rule removed and verified absent;
- no Task content, legal content, app credential, schema mutation, migration, or
  deployment was used.

Live metadata results:

| Item | Result |
|---|---|
| PostgreSQL version | PostgreSQL 15.18 |
| Database/schema | `adminiculum` / `public` |
| Current user | `hubay.gyula@balintfy.onmicrosoft.com` |
| Migration head | `20260719120000_add_client_color_key` |
| `ReviewAttentionLevel` | present, expected five values |
| `tasks.attentionCategory` | absent |
| `tasks.estimatedMinutes` | absent |
| Task Attention partial state | none detected |
| `tasks` total size | `96 kB` |
| `tasks` table size | `8192 bytes` |
| Existing `tasks` indexes | pkey, complexity/maturity/risk/stuckReason indexes only |

Updated DONE-MEANS status:

| # | Criterion | Status after live audit |
|---|---|---|
| 1 | production metadata inspected read-only | ✅ |
| 2 | enum existence + values proven live | ✅ |
| 3 | current Task columns proven absent | ✅ |
| 4 | exact SQL candidate prepared | ✅, corrected to columns-only |
| 5 | index choice justified from live metadata | ✅, no first-migration index |
| 6 | locking impact assessed from live size | ✅, metadata-only columns |
| 7 | rollback SQL prepared | ✅ |
| 8 | partial-application handling defined | ✅, no partial state observed |
| 11 | no DB mutation | ✅ |
| 12 | no migration directory created | ✅ |

Remaining blocker:

The schema/migration candidate still needs correction because it previously
included `@@index([attentionCategory])` / `tasks_attentionCategory_idx`. The
live metadata supports a columns-only first migration.

Network/security classification:
`POSTGRES_METADATA_TEMP_FIREWALL_CREATED_AND_REMOVED`

Migration-audit classification:
`TASK_ATTENTION_MIGRATION_SCHEMA_CANDIDATE_CORRECTION_REQUIRED`
