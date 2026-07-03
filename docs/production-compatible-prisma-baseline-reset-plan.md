# Production-Compatible Prisma Baseline / Reset Plan

Classification target: `production_compatible_prisma_baseline_reset_plan_documented_no_db_change_no_runtime_change`

This plan is docs-only. It does not connect to any database, touch Azure, run Prisma migrate commands, edit `schema.prisma`, edit migration SQL, deploy, enable Client Portal runtime, or change application behavior.

## 1. Executive summary

The current blocker is not CP-SCHEMA-1 itself. The blocker is that the repo migration history and production/fresh-clone `_prisma_migrations` state diverge after:

`20260212180000_add_workload_tracking`

CP-SCHEMA-1 has a valid schema candidate, SQL review, migration file, and transactional rollback proof. It remains blocked because normal Prisma deployment cannot isolate it from earlier local migrations that production does not record as applied.

The safest baseline/reset path is to treat production schema as the operational source of truth unless proven otherwise, collect a fresh SELECT-only production-schema snapshot, compare that physical schema to `schema.prisma`, make human decisions per feature family, and only then design a production-compatible migration chain. No old historical migration should be blindly applied or blanket-resolved.

## 2. Current facts established

Established facts from the recent evidence chain:

- A fresh PITR clone was created from current production.
- Verification was SELECT-only.
- The clone was deleted after verification.
- Production remained untouched.
- CP-SCHEMA-1 objects were absent before apply, as expected.
- Outlook/foundation objects were present, including communication provider enums/columns and lawyer handoff foundation objects.
- Prisma migrate status still showed historical divergence after `20260212180000_add_workload_tracking`.
- Production/fresh clone recorded a DB-only local-missing `20260302142000_add_kb_learning_escalation` row.
- Many repo migrations were not recorded as applied in the fresh clone.
- Historical object checks were mixed: some represented, some partial, some not eligible, some unknown.
- Blanket `migrate resolve --applied` is not safe because not all migration effects are physically proven.
- `migrate deploy` is not safe because it would attempt the historical backlog before CP-SCHEMA-1.

## 3. Desired end state

The desired end state is:

- production schema is explicitly accepted as the source of truth, or specific exceptions are documented;
- Prisma's active migration chain becomes production-compatible again;
- future migrations can be clone-proven and deployed safely;
- CP-SCHEMA-1 can resume only after a clean active baseline path exists;
- historical experimental/non-production migrations are not blindly applied to production;
- no existing internal data becomes client-visible;
- Client Portal remains disabled until its runtime/security work is separately approved.

## 4. Baseline/reset strategy options

### Strategy A — New production baseline migration chain

Concept:

- Archive or quarantine old non-production historical migrations outside the active Prisma deploy path.
- Generate or document a new baseline representing current production's physical schema.
- Start future production migrations after that baseline.

Pros:

- Aligns future migration work with real production.
- Avoids replaying stale or experimental historical migrations.
- Produces the cleanest future path if production is the canonical product state.
- Lets CP-SCHEMA-1 become a fresh future migration after the baseline is clean.

Cons / risks:

- Loses old migration granularity in the active deploy chain.
- Requires careful archive/quarantine documentation so historical context is not lost.
- Requires a highly reliable production schema snapshot.
- May require local/dev environment reset instructions.
- If `schema.prisma` currently includes objects absent from production, the team must decide whether to adjust schema or bring production forward.

When appropriate:

- Production is stable and authoritative.
- Most pending historical migrations are obsolete, experimental, or not clearly production-required.
- The team wants predictable future migrations more than historical replay fidelity.

### Strategy B — Shadow baseline with manual `_prisma_migrations` reconciliation

Concept:

- Keep the existing migration files in place.
- For each historical migration, mark only physically represented migrations after clone proof.
- Leave non-represented migrations unresolved or remediate them separately.

Pros:

- Preserves the existing migration folder layout.
- Allows targeted repair for migrations that are genuinely already represented.
- May be less disruptive if most objects are physically present.

Cons / risks:

- Risky because several migrations are partial or `not_eligible`.
- Requires per-migration physical proof with no ambiguity.
- Encourages manual `_prisma_migrations` manipulation or repeated `resolve`, both high-trust operations.
- Can leave the active chain fragile if one historical migration is misclassified.
- DB-only `kb_learning_escalation` still needs a decision.

Why likely not preferred:

The fresh-clone matrix shows partial and missing historical objects. A shadow reconciliation path would be slow and brittle unless the majority of migrations become parser-independently provable.

### Strategy C — Feature-family remediation before baseline

Concept:

- Group missing or partial migrations by product feature family.
- Decide whether each family must exist in production.
- Remediate only production-required missing schema.
- Then create a new baseline from the remediated production-compatible schema.

Pros:

- Avoids blindly applying obsolete features.
- Preserves genuinely needed runtime support.
- Gives human/product owners explicit control over production schema surface.
- Works well when a few missing feature families are truly required.

Cons / risks:

- Requires product decisions before implementation.
- Requires bespoke additive remediation SQL per family.
- Requires fresh clone proof per remediation batch.
- Takes longer than a pure archive/baseline path.

When necessary:

- Runtime code depends on missing schema and the feature is production-required.
- Removing or archiving a migration would break active workflows.
- The production schema needs to be brought forward selectively before baselining.

### Strategy D — Full migration rebuild from current Prisma schema

Concept:

- Reconcile `schema.prisma` to actual production first.
- Create a clean future migration chain from the reconciled schema.
- Treat historical migrations as archived evidence rather than active deploy steps.

Pros:

- Clear future chain if done correctly.
- Forces an explicit schema-vs-production reconciliation.
- Can remove years/months of drift from the active Prisma path.

Cons / risks:

- `schema.prisma` may already include objects not present in production.
- Rebuilding from current schema without production reconciliation can create a false target.
- Requires disciplined environment reset/handoff instructions.
- High review burden because it touches the core migration strategy.

When appropriate:

- Production schema has been accepted as source of truth.
- Current Prisma schema has been compared to actual production and corrected or explicitly justified.
- The team is ready for a formal baseline reset.

## 5. Recommended strategy

Recommended conservative path:

1. Do not blindly apply old historical migrations.
2. Do not blanket resolve historical migrations.
3. Treat current production schema as source of truth unless a feature is proven production-required and missing.
4. In a future operator-run task, create a fresh PITR clone from current production and capture a SELECT-only schema snapshot.
5. Compare current `Backend/prisma/schema.prisma` to the actual production schema.
6. Decide feature-by-feature whether `schema.prisma` should be adjusted to production or production should be brought forward.
7. Use Strategy C only for genuinely production-required missing schema.
8. Then use Strategy A or D to create a production-compatible baseline/reset path.
9. Resume CP-SCHEMA-1 only after a clean baseline path exists and CP is the intentionally next migration.

This means production baseline/reset implementation is not ready yet. The next safe step is evidence gathering, not mutation.

## 6. Required future evidence before any DB mutation

Required evidence before any DB mutation:

- fresh PITR clone from current production;
- operator confirmation that clone is non-production and isolated;
- no App Service runtime pointed at clone;
- SELECT-only schema snapshot from `information_schema` and `pg_catalog`;
- `_prisma_migrations` status snapshot;
- Prisma schema vs DB schema diff;
- per-feature human decision record;
- clone dry-run or apply proof for any chosen remediation;
- rollback/disposal plan for the clone;
- explicit confirmation that Client Portal runtime remains disabled;
- explicit confirmation that no business/client row data is exported.

## 7. Per-feature decision gates

Each feature family below must not be decided automatically. Each needs human/product decision, schema/runtime reference review, and clone proof before any production mutation.

### Generation drafts

- Migration: `20260330120000_add_generation_drafts`.
- Decision gate: is persisted draft state production-required or optional/flagged off?
- Evidence needed: runtime flag state, route usage, UI dependency, fresh clone table/index proof.
- Default posture: do not apply or resolve automatically.

### Anonymized documents

- Migration: `20260331090100_add_anonymous_documents`.
- Decision gate: is anonymization production-required and physically backed already?
- Evidence needed: table, indexes, FKs/relations, anonymize route flag/runtime usage.
- Default posture: partial/manual remediation only after proof.

### Rehydration fields

- Migration: `20260331100000_add_rehydration_fields`.
- Decision gate: are rehydration import/save flows production-required?
- Evidence needed: column/index proof on `anonymous_documents`, dependency on base table.
- Default posture: bundle with anonymized documents; no independent apply.

### Client identity fields

- Migration: `20260402131500_add_client_identity_fields`.
- Decision gate: are `taxNumber`, `companyRegistrationNumber`, and `authorizedRepresentative` required by current clients UI/API?
- Evidence needed: column proof and decision on whether the old `vatNumber` backfill is still desired.
- Default posture: high priority; avoid unreviewed DML backfill.

### Case client role

- Migration: `20260405183100_add_case_client_role`.
- Decision gate: is `cases.clientRole` required by current case/anonymize flows?
- Evidence needed: column proof and runtime usage review.
- Default posture: likely production-required, but still requires proof.

### Client color

- Migration: `20260406120000_add_client_color`.
- Decision gate: is `clients.color` already present and semantically used?
- Evidence needed: parser-independent column proof.
- Default posture: candidate for baseline inclusion or truthful targeted resolve after proof.

### Case collaborators

- Migration: `20260408140000_add_case_collaborators`.
- Decision gate: are case/task collaborator features production-required?
- Evidence needed: table, unique, index, FK proof and route/UI usage review.
- Default posture: partial/manual remediation; no raw deploy.

### Comparison snapshot

- Migration: `20260416175000_add_comparison_snapshot_foundation`.
- Decision gate: is `contract_generations.comparisonSnapshot` required by current contract comparison/generation behavior?
- Evidence needed: column proof and contract-service runtime usage review.
- Default posture: likely production-required if comparison snapshot is active.

### Timesheet reports/artifacts/presets

- Migrations: `20260417100000_add_timesheet_report_instances`, `20260417113000_add_timesheet_report_artifacts`, `20260417123000_add_timesheet_presets`.
- Decision gate: are persistent timesheet reports and presets production features or experimental UI?
- Evidence needed: feature usage, route exposure, table/enum proof.
- Default posture: experimental-feature candidate until product confirms production requirement.

### Legal analyses

- Migration: `20260514201500_add_legal_analyses`.
- Decision gate: are legal analyses active legal work product or future/experimental?
- Evidence needed: route/UI exposure, table/enum proof, privacy review.
- Default posture: experimental/production-required decision needed.

### Client house style

- Migrations: `20260517175500_add_client_house_style_profile`, `20260517191600_add_client_house_style_header_fields`.
- Decision gate: is house style profile editing production-required?
- Evidence needed: table/column/index/FK proof and clients route/UI review.
- Default posture: decide as one feature family.

### Workspace text

- Migration: `20260518120000_add_workspace_text`.
- Decision gate: is `documents.workspaceText` already present and required by document workspace behavior?
- Evidence needed: column proof.
- Default posture: likely production-required and already represented; still needs proof.

### CP-SCHEMA-1

- Migration: `20260702140000_add_client_portal_foundation`.
- Decision gate: return only after production-compatible baseline/remediation is complete.
- Evidence needed: clean active migration path and fresh clone proof.
- Default posture: blocked.

## 8. Proposed future operator-run task

Draft prompt:

```text
Adminiculum — fresh production clone SELECT-only schema snapshot for baseline reset

Goal:
Create a fresh PITR clone from current production, run SELECT-only metadata capture, compare actual DB schema to Backend/prisma/schema.prisma, then delete or retain the clone according to operator instruction.

Strict rules:
- no production mutation;
- no Prisma migrate deploy/resolve/dev/db push;
- no DDL/DML;
- no business row export;
- no App Service runtime points to clone;
- no Client Portal enablement;
- credentials only through local/session env;
- do not print secrets.

Capture:
- _prisma_migrations status;
- table/column/type/index/FK inventory;
- enum values;
- object presence for every pending historical migration family;
- schema.prisma vs DB schema diff summary;
- clone disposal/cleanup status.

Expected classification:
production_baseline_reset_schema_snapshot_completed_select_only_no_runtime_change
```

## 9. Proposed future implementation task, blocked until evidence exists

Placeholder prompt, explicitly blocked for now:

```text
Adminiculum — production-compatible Prisma baseline reset implementation plan

Preconditions:
- fresh clone SELECT-only schema snapshot completed;
- schema.prisma vs DB diff reviewed;
- per-feature human/product decisions recorded;
- remediation strategy approved;
- no unresolved historical migration ambiguity remains.

Task:
Prepare the concrete baseline/reset implementation plan and clone proof sequence.

Do not execute production mutation until separately approved.
```

This implementation task must not be started until the evidence and human decisions exist.

## 10. Non-actions

Explicit non-actions:

- no `prisma migrate deploy`;
- no `prisma migrate resolve`;
- no `prisma migrate dev`;
- no `prisma db push`;
- no production DB mutation;
- no clone DB mutation in this task;
- no Azure App Service change;
- no schema or migration edits;
- no runtime deploy;
- no Client Portal enablement;
- no public routes;
- no existing data made client-visible.

## 11. Go / no-go conclusion

- Production baseline/reset implementation: **not ready**.
- CP-SCHEMA-1 apply: **blocked**.
- Historical migrate resolve: **not allowed**.
- Normal migrate deploy: **not allowed**.
- Next safe step: **SELECT-only production schema snapshot on a fresh clone**.

## 12. Final classification

`production_compatible_prisma_baseline_reset_plan_documented_no_db_change_no_runtime_change`
