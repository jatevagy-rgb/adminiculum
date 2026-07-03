# Production Migration History Remediation Options

Classification target: `production_migration_history_remediation_options_documented_no_db_change_no_runtime_change`

This memo is docs-only. It does not connect to any database, touch Azure, run Prisma migrate commands, edit `schema.prisma`, edit migration SQL, deploy, enable Client Portal runtime, or change application behavior.

## 1. Executive summary

CP-SCHEMA-1 is blocked by a production Prisma migration-history divergence, not by the CP-SCHEMA-1 DDL itself. The CP migration file has a successful clone transactional rollback proof, but a fresh current-production PITR clone showed that production's `_prisma_migrations` history diverges from the repo after `20260212180000_add_workload_tracking`.

The fresh clone fixed the older clone-staleness concern: communication baseline, Outlook provider objects, and lawyer handoff foundation objects were present. It did not fix migration-history divergence, because PITR faithfully copied production's sparse `_prisma_migrations` state.

The safest posture is to treat the current production schema as the operational source of truth unless proven otherwise, avoid blanket `migrate resolve --applied`, avoid `migrate deploy`, classify every pending historical migration, and design a production-compatible baseline/reset strategy before returning to CP-SCHEMA-1.

## 2. Current known divergence

Fresh PITR clone verification recorded:

- last common migration: `20260212180000_add_workload_tracking`;
- DB-only migration not found locally: `20260302142000_add_kb_learning_escalation`;
- local migrations not recorded as applied in the fresh clone:
  - `20260330120000_add_generation_drafts`
  - `20260331090100_add_anonymous_documents`
  - `20260331100000_add_rehydration_fields`
  - `20260402131500_add_client_identity_fields`
  - `20260405183100_add_case_client_role`
  - `20260406120000_add_client_color`
  - `20260408140000_add_case_collaborators`
  - `20260416175000_add_comparison_snapshot_foundation`
  - `20260417100000_add_timesheet_report_instances`
  - `20260417113000_add_timesheet_report_artifacts`
  - `20260417123000_add_timesheet_presets`
  - `20260514201500_add_legal_analyses`
  - `20260517175500_add_client_house_style_profile`
  - `20260517191600_add_client_house_style_header_fields`
  - `20260518120000_add_workspace_text`
  - `20260702140000_add_client_portal_foundation`.

Historical object checks were mixed:

- some migrations appear physically represented;
- some are partial;
- several are not physically represented or not safely provable;
- 30 missing historical objects were observed by the generated check;
- parser caveats remain, but they do not make `resolve --applied` truthful.

The important operational conclusion is that CP-SCHEMA-1 is not the only pending migration from Prisma's point of view.

## 3. Why CP-SCHEMA-1 is blocked by this

`20260702140000_add_client_portal_foundation` is a new additive migration, but Prisma's deploy chain is ordered. A normal `prisma migrate deploy` cannot jump directly to CP-SCHEMA-1 while ignoring earlier unapplied migrations.

Because the fresh clone reports many earlier repo migrations as unapplied, applying CP-SCHEMA-1 through normal Prisma deploy would first try to apply or reconcile the historical backlog. That backlog includes migrations whose physical production status is uncertain, partial, or absent.

Therefore CP-SCHEMA-1 remains blocked until the historical chain is reconciled or replaced by an explicitly accepted production-compatible baseline strategy.

## 4. Why blanket `migrate resolve` is unsafe

`prisma migrate resolve --applied <migration>` is truthful only when the target database already physically contains the objects that the migration would have created.

Blanket resolving the pending historical migrations would be unsafe because:

- some historical objects are not physically represented;
- some migrations are partial;
- some checks are inconclusive due to parser limitations;
- a DB-only migration exists with no local migration folder;
- false `_prisma_migrations` rows would corrupt future migration integrity;
- production would appear clean to Prisma while still lacking real schema objects.

Historical resolve is allowed only case-by-case after parser-independent evidence proves that a migration's intended schema effects are already present.

## 5. Why `migrate deploy` is unsafe in current state

`prisma migrate deploy` is unsafe against production or a production-like clone in the current state because it would attempt the local migration chain after the last common migration.

Expected failure modes:

- duplicate-object failures for migrations whose tables/columns/enums already exist;
- partial mutation for migrations whose objects are absent;
- creation of obsolete or unused feature tables;
- drift between Prisma metadata and actual operational product behavior;
- accidental advancement of historical features that were never accepted for production;
- inability to isolate CP-SCHEMA-1 as the only applied migration.

Until the historical divergence is resolved, `migrate deploy` should be treated as blocked for this production lineage.

## 6. Options analysis

### Option A — Keep production as source of truth and prune/archive non-production historical migrations from the deploy chain

This option treats current production schema and behavior as authoritative. Historical migration folders that represent experiments, abandoned features, local-only work, or non-production-only branches would be removed from the active deploy chain or moved to an archive that Prisma does not execute.

Appropriate when:

- production is stable and legally/operationally canonical;
- absent historical objects correspond to features not used in production;
- runtime code does not require those absent objects;
- future schema work needs a clean deploy path more than historical replay fidelity.

Risks:

- losing the ability to replay old feature history directly from migrations;
- accidentally pruning a migration whose objects are required by runtime code;
- confusing future developers if archive boundaries are not documented clearly;
- needing a careful baseline/squash commit with explicit review.

Required evidence:

- production/current clone physical schema inventory;
- mapping of every pending migration to runtime feature usage;
- confirmation that omitted objects are not required by deployed backend/frontend code;
- clear distinction between archived historical evidence and active Prisma deploy chain.

This likely requires a new baseline/squash strategy. The active chain would represent production reality from a chosen point forward, while older divergent migrations are preserved as historical artifacts outside Prisma's active migration path.

### Option B — Bring production schema forward by intentionally applying missing historical feature migrations

This option accepts the repo migration history as the desired target and intentionally applies missing historical features to production, after feature-by-feature review.

Appropriate when:

- missing objects are required by active or near-term production features;
- the product decision is to support those historical capabilities;
- each migration can be made additive/idempotent and proven on a fresh clone;
- operators accept the additional schema surface.

Risks:

- creating unused tables/columns/enums in production;
- unexpected backend assumptions if partial old features become physically present;
- duplicate-object collisions where objects already exist manually;
- needing custom remediation SQL rather than raw historical migration SQL;
- broadening production schema without immediate product value.

This option must be reviewed feature-by-feature. It requires a fresh clone proof, explicit approval, and post-apply metadata introspection for every remediation batch.

### Option C — Create a new production-compatible Prisma baseline from current production schema

This option creates a new production-compatible baseline from current production's physical schema and starts future migrations from that baseline.

Conceptually:

1. Capture a robust schema-only snapshot from a fresh production PITR clone.
2. Generate or hand-author a baseline representation matching current production schema.
3. Replace or isolate the divergent old deploy chain so Prisma no longer attempts stale historical migrations.
4. Mark the new baseline as the starting point for future production migrations.
5. Reintroduce new additive migrations, including CP-SCHEMA-1, after clone proof against the new baseline.

Appropriate when:

- production is the real source of truth;
- old migration history is too divergent to repair safely in place;
- future development needs a clean, predictable migration chain;
- preserving operational safety matters more than preserving granular historical replay.

Risks:

- losing historical migration granularity in the active chain;
- incorrectly capturing a production schema snapshot;
- needing careful coordination with all environments;
- accidentally stranding local/dev databases that expect old history;
- requiring strong documentation so archived migrations remain discoverable but inactive.

Required safeguards:

- read-only fresh clone inventory;
- schema-diff review between Prisma schema and production physical schema;
- no business data export;
- no runtime deploy during baseline creation;
- clone replay of the new baseline path;
- explicit naming that separates historical archive from active production chain.

This may be the cleanest long-term path if production is accepted as canonical.

### Option D — Split experimental/non-production migrations from production migrations

This option introduces repo hygiene rules so experimental schema work cannot pollute the production deploy chain.

Implementation concepts:

- move abandoned historical migration folders out of `Backend/prisma/migrations` into a documented archive;
- require every production migration to have clone proof before merge/deploy;
- maintain separate docs for local proof-only or experimental schema candidates;
- prohibit `migrate dev` output from being committed as production migrations unless reviewed;
- require migration naming and classification metadata in docs.

Appropriate when:

- multiple schema experiments exist;
- production migration discipline needs a reset;
- future Client Portal and connector work will require repeated additive migrations.

Risks:

- process overhead;
- branch coordination complexity;
- needing a clear developer workflow for local schema experiments;
- possible confusion if archived migrations remain near active code.

This option is not sufficient alone; it complements Option A or C.

### Option E — Do nothing

This option leaves the current repo/production divergence unchanged.

Consequences:

- CP-SCHEMA-1 remains blocked;
- CONNECTOR-SCHEMA-1 remains blocked;
- future Prisma migrations remain high-risk;
- every schema change requires bespoke manual workarounds;
- production migration confidence continues to degrade.

This is acceptable only as a temporary freeze while the remediation decision is pending.

## 7. Recommended path

Recommended conservative path:

1. Treat current production schema as the source of truth unless a missing feature is explicitly proven production-required.
2. Do not apply old historical feature migrations blindly.
3. Do not run blanket `migrate resolve --applied`.
4. Classify every pending historical migration into one of four buckets:
   - `production_required` — missing or partial, and active product/runtime needs it;
   - `already_physically_represented` — safely provable by parser-independent schema inventory;
   - `obsolete_non_production` — not needed by production and should leave the active chain;
   - `partial_manual_remediation_needed` — some objects exist but the migration cannot be truthfully resolved as-is.
5. Decide whether the active production migration chain should be repaired feature-by-feature or replaced by a new production-compatible baseline.
6. Prefer a new baseline/squash path if most historical migrations are obsolete or non-production.
7. Return to CP-SCHEMA-1 only after a clean active deploy path exists and a fresh clone proof shows CP as the only intended next migration.

## 8. Required evidence before any DB mutation

Before any DB mutation, collect and review:

- fresh PITR clone identity and lifecycle proof;
- read-only physical schema inventory from `information_schema` and `pg_catalog`;
- `_prisma_migrations` inventory with finished/rolled-back status;
- parser-independent object mapping for each pending historical migration;
- runtime usage audit for each candidate object family;
- list of DB-only objects/migrations and their product relevance;
- explicit decision record for every migration bucket;
- rollback/abandon plan for clone proof;
- production maintenance-window and backup posture, if production work is later approved.

No business/client row data should be exported for this evidence. Metadata and counts are enough.

## 9. Fresh clone proof requirements for the chosen remediation

Any chosen remediation must be proven on a fresh production PITR clone before production consideration.

Minimum clone proof requirements:

- clone is confirmed non-production and isolated;
- app runtime is not pointed at clone;
- credentials are supplied only through local/session env and never printed;
- pre-check confirms baseline objects and divergence state;
- remediation SQL or migration-chain changes are applied only to clone;
- post-check confirms intended objects and `_prisma_migrations` state;
- no unintended runtime data exposure is created;
- no Client Portal tables are seeded unless a future prompt explicitly scopes seed data, which CP-SCHEMA-1 should not;
- clone is disposed of or clearly marked after proof.

## 10. Production safety rules

Production must remain untouched until an explicitly accepted remediation plan exists.

Hard rules:

- no `prisma migrate deploy` against production in the current state;
- no `prisma migrate resolve` without case-by-case physical proof;
- no `migrate dev` or `db push` against production or shared DBs;
- no destructive SQL;
- no schema mutation without fresh clone proof;
- no Client Portal runtime enablement during migration-history remediation;
- no existing internal data becomes client-visible;
- no Azure App Service changes are required for docs/planning work.

## 11. Proposed next prompt

Recommended next prompt:

`Adminiculum — production migration history remediation classification matrix docs-only`

That prompt should classify every pending historical migration as `production_required`, `already_physically_represented`, `obsolete_non_production`, or `partial_manual_remediation_needed`, using only docs, migration SQL, schema, and source-code usage inspection. It should not connect to DB or mutate anything.

## 12. Final classification

`production_migration_history_remediation_options_documented_no_db_change_no_runtime_change`
