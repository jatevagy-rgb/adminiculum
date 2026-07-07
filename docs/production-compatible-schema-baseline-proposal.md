# Production-Compatible Schema Baseline Proposal

Final classification target: `production_compatible_schema_baseline_proposal_documented_no_db_change_no_runtime_change`

This proposal is documentation only. It does not connect to any database, touch Azure, run Prisma migration commands, edit `schema.prisma`, edit migration SQL, move/delete/archive migrations, deploy, enable Client Portal runtime, or change application behavior.

## 1. Executive summary

The current blocker is broader than CP-SCHEMA-1. Fresh production-like clone evidence shows that `Backend/prisma/schema.prisma` is not currently production-compatible as an active migration baseline: it contains production-present objects, partially represented objects, and many future/experimental feature families that are absent from the actual production database.

Production should be treated as the practical schema source of truth for baseline planning unless a human/product decision explicitly overrides that for a specific feature family. The safe path is not to blindly apply historical migrations and not to blindly resolve migration history. Instead, Adminiculum needs a production-compatible active baseline that reflects deployed production reality, plus a quarantine/future-feature plan for schema families that should be reintroduced later through clean, clone-proven migrations.

This document is a proposal for that baseline direction. It is not an implementation plan approval, not a schema edit, not a migration edit, and not a production apply plan.

## 2. Safety scope

This task stayed within repo inspection and documentation.

Safety confirmations:

- Runtime change: no.
- Schema change: no.
- Migration change: no.
- DB connection used: no.
- DB mutation: no.
- Azure touched: no.
- Deployment: no.
- Client Portal enabled: no.
- Raw snapshot JSON committed: no.
- Secrets printed: no.

## 3. Evidence base

Primary evidence used:

- `docs/production-schema-snapshot-comparison-results.md`
- `docs/production-schema-feature-family-reconciliation-decision-memo.md`
- `docs/production-compatible-prisma-baseline-reset-plan.md`
- `docs/production-migration-history-classification-matrix.md`
- `docs/production-migration-history-remediation-options.md`
- `docs/cp-schema-1-fresh-clone-verification-no-go.md`
- `Backend/prisma/schema.prisma`
- `Backend/prisma/migrations/`

Key evidence points:

- Fresh clone snapshot found 31 public tables, 394 columns, 34 enum types, 202 enum values, 74 indexes, 79 constraints, and 7 migration rows.
- Local Prisma schema parsing found 51 mapped models and 67 enums.
- 21 Prisma mapped tables are absent from actual production DB.
- Existing production tables are missing Prisma-declared fields on `anonymous_documents` and `contract_generations`.
- 33 Prisma enum types are absent from production DB.
- `GenerationStatus` differs: production lacks Prisma values `APPROVED` and `REJECTED`.
- Production migration history is sparse/divergent and includes a DB-only rolled-back `20260302142000_add_kb_learning_escalation` row.
- CP-SCHEMA-1 objects are absent from production and remain blocked.

## 4. Proposed baseline principle

The active production baseline should model what production actually contains and what runtime actually requires today. Future or experimental product families should not remain inside the active production migration baseline merely because they exist in local Prisma schema.

Recommended principle:

1. Production DB schema is the practical source of truth for baseline/reset planning.
2. Production-required features may be brought forward only through explicit, additive, clone-proven remediation.
3. Production-absent future/experimental families should be quarantined from the active baseline and reintroduced later as clean feature migrations.
4. Historical migrations should not be blindly replayed, resolved, renamed, deleted, or moved until the baseline plan is reviewed.
5. CP-SCHEMA-1 must remain separate from baseline reconciliation.

## 5. Feature-family disposition table

| Feature family | Production evidence | Runtime/product signal | Proposed baseline disposition | Human decision needed | Notes |
| --- | --- | --- | --- | --- | --- |
| Core baseline | Present in production snapshot. | Core clients/users/cases/tasks/documents runtime. | Active production baseline. | Low; accept production as source of truth. | Must preserve current deployed behavior. |
| Lawyer handoff | Finished migration row and production representation. | Deployed handoff workflow docs/runtime. | Active production baseline. | Low. | Keep as already-production-represented. |
| Communication / Outlook baseline | Communication baseline and Outlook provider migrations finished. | `/notifications`, read-only communications, gate-off Outlook import foundation. | Active production baseline. | Low. | Keep provider fields; `ENABLE_OUTLOOK_IMPORT` remains separate runtime gate. |
| Workload tracking | One rolled-back row and later finished row; objects appear represented. | Productivity/time workload surfaces. | Active baseline after row/object interpretation. | Confirm finished row is authoritative. | Do not replay historical migration blindly. |
| Generation drafts | `generation_drafts` absent. | Routes/UI references exist; may be feature-gated. | Quarantine or future migration unless product requires now. | Decide whether persistent generation drafts are production scope. | High runtime risk if unguarded routes query absent table. |
| Anonymous documents | Table exists, but Prisma fields are partially absent. | Anonymization workflow is important. | Manual remediation bucket, not blind baseline replay. | Decide exact active anonymization/rehydration persistence scope. | Existing data sensitivity requires careful additive-only plan. |
| Rehydration fields | Missing on existing `anonymous_documents`. | Rehydrate UI/service references. | Manual remediation bucket. | Decide whether persistent rehydration fields are production-required. | Requires clone-proven ALTER plan if kept. |
| Client identity fields | Mixed/uncertain; migration not finished. | Client forms/routes may expect legal identity fields. | Manual remediation bucket. | Decide production-required fields. | Avoid old migration DML/backfill assumptions. |
| Case client role | Mixed/uncertain; migration not finished. | Cases/anonymization context references. | Likely keep and bring forward if absent, but only after proof. | Confirm production scope. | Additive column may be low risk but still needs clone proof. |
| Client color | Previously found physically represented. | UI metadata signal. | Active baseline after column proof. | Low. | Do not replay migration if already present. |
| Case collaborators | Partial/manual evidence. | Cases/tasks collaboration references. | Manual remediation bucket leaning keep if active. | Decide collaborator workflow production status. | Table/index/FK completeness must be proven. |
| Comparison snapshot | Missing on `contract_generations`. | Contract comparison/generation service references. | Keep only if current comparison workflow requires persistence. | Confirm production requirement. | If kept, use additive column remediation, not full historical replay. |
| Timesheet reports/artifacts/presets | Tables/enums absent. | Timesheet API/UI references exist. | Quarantine or future-feature migration unless approved now. | Decide reporting persistence scope. | Larger feature family; avoid accidental activation. |
| Legal analyses | Table/enums absent. | Backend/frontend references exist. | Future-blocked unless explicitly active. | Decide if legal analyses are production work product now. | Sensitive work product; needs governance before baseline inclusion. |
| Client house style | Base table/header fields absent. | UI/API references exist. | Future-blocked or manual keep decision. | Decide production scope. | Could be valuable, but absent production shape suggests not baseline-safe. |
| Workspace text | Previously physically represented. | Document workspace behavior. | Active baseline after proof. | Low. | Keep if production column exists. |
| Document review | `document_review_suggestions` absent. | Case Review UI exists; DB-backed suggestions unclear. | Future-blocked unless DB-backed review is approved. | Decide if review suggestion persistence is production scope. | Do not invent automated review claims. |
| Clause library | Clause/profile tables absent. | `/clause-library` product surface/API references. | Human decision: keep-and-remediate or future-block. | Decide whether route is production-approved. | If kept, should be a clean feature migration family. |
| Contract assembly | Assembly tables absent. | Clause assembly references exist. | Future-blocked unless clause library is approved. | Decide with clause library. | Depends on clause library foundation. |
| CP-SCHEMA-1 | CP tables absent. | Docs/schema candidate only; runtime off. | Future work, excluded from baseline. | Resume only after baseline stable. | No existing data becomes client-visible. |
| DB-only rolled-back kb/learning/escalation | Rolled-back migration row; no local folder; object checks found no objects. | No active known local migration. | Historical artifact, not active baseline. | Decide archive/explanation only. | No recreate or resolve without human decision. |

## 6. Proposed active production baseline contents

The production-compatible active baseline should include only objects that are physically present in production and accepted as active product foundation.

Candidate active baseline contents:

- Core product tables and enums for clients, users, cases, tasks, documents, notes, document metadata, auth-owned references, and current case/task/document workflows.
- Production-present workload/time tracking objects, after confirming the finished migration row and physical object shape.
- Lawyer handoff foundation objects from the finished production migration.
- Communication baseline objects: `communications`, `communication_attachments`, `CommunicationType`, nullable task source communication relation, related indexes/FKs.
- Outlook provider fields already applied in production for provider-shaped metadata and import foundation.
- Production-present UX metadata fields such as client color and workspace text, after parser-independent proof.
- Any physically present collaborator/client identity/case-role objects only after table/column/index/FK proof and explicit product acceptance.
- `_prisma_migrations` as migration metadata, not as an application model.

The baseline should exclude CP-SCHEMA-1, production-absent feature tables, and future/experimental models until they are approved and reintroduced separately.

## 7. Proposed quarantine / future-feature treatment

Quarantine does not mean deletion from product thinking. It means a family should not be part of the active production baseline until it has explicit product approval, route safety, and clone-proven migration shape.

Recommended quarantine or future buckets:

- Generation draft persistence.
- Timesheet report instances, artifacts, and presets.
- Legal analyses.
- Client house style profile and header fields.
- Document review suggestions.
- Clause library lawyer profiles, preferred clauses, and clause items if not production-approved now.
- Contract assembly drafts and clauses.
- CP-SCHEMA-1 Client Portal identity, grants, artifacts, submissions, and audit models.
- DB-only rolled-back kb/learning/escalation artifact.

Recommended treatment:

1. Keep product docs/design references where useful.
2. Do not expose or enable runtime surfaces that query absent tables without guards.
3. Reintroduce approved families through fresh, isolated migrations after baseline stabilization.
4. Prove each reintroduced family on a fresh production-like clone before production apply.

## 8. Runtime risk section

The main risk is not only migration history. It is mismatch between generated Prisma Client expectations, runtime route code, and actual production DB shape.

Known risk classes:

- Routes or services may query Prisma models whose tables are absent in production.
- Routes may select fields absent from existing production tables.
- Prisma enum values may compile locally but fail at runtime if production enum types lack those values.
- Feature families in `schema.prisma` may cause future migration generation to assume objects exist in production when they do not.
- Removing/quarantining models from active schema without route guards could create TypeScript/runtime regressions.
- Bringing production forward blindly could activate unsupported or sensitive work-product storage.

Before implementation, every production-absent family needs one of these decisions:

- runtime is guarded/default-off and model can be quarantined;
- runtime is production-required and DB must be additively remediated;
- runtime is obsolete and code/docs should be removed in a separate product decision;
- status is unknown and production apply remains blocked.

## 9. Baseline/reset implementation shape, conceptually only

A future implementation plan could look like this, but this document does not authorize it:

1. Freeze production migration activity.
2. Create a fresh production PITR clone.
3. Generate a sanitized production schema inventory from the clone.
4. Decide active vs quarantined feature families.
5. Draft a production-compatible Prisma schema that matches active production shape.
6. Preserve historical migrations out of the active deploy path only if reviewed and approved by humans.
7. Create a new baseline/reset migration strategy in a separate planning task.
8. Prove `prisma validate`, backend typecheck/tests, and migration status behavior on a fresh clone.
9. Only then consider production remediation or baseline reset.

This future work must avoid business row export, avoid raw snapshot commits, and keep CP-SCHEMA-1 separate.

## 10. Human decisions checklist

Human/product decisions needed before schema or migration edits:

- Should production schema remain the source of truth for active baseline? Recommended: yes.
- Which absent feature families are production-required now?
- Should generation draft persistence exist in production now?
- What is the supported anonymization/rehydration persistence scope?
- Are client identity fields, case client role, and collaborators active production requirements?
- Is comparison snapshot persistence required for current document/generation workflows?
- Are timesheet reports/presets production scope or future scope?
- Are legal analyses production work product or future-blocked?
- Is client house style profile production scope?
- Is clause library production-approved now, and is contract assembly in scope?
- Should DB-backed document review suggestions exist now?
- Should the rolled-back DB-only kb/learning/escalation row be documented as abandoned historical state?
- When baseline is stable, should CP-SCHEMA-1 resume as a separate feature migration chain?

## 11. Future task entry point

Recommended future task title:

`Adminiculum — production-compatible schema baseline implementation planning`

That task should remain blocked until:

- human feature-family decisions are recorded;
- production-active objects are proven with a fresh clone snapshot;
- runtime route guards are reviewed for every quarantined family;
- migration-history reset mechanics are reviewed by a human operator;
- CP-SCHEMA-1 is explicitly kept separate from baseline reconciliation.

## 12. Explicit non-actions

This proposal does not perform and does not recommend immediate execution of:

- no `prisma migrate deploy`;
- no `prisma migrate resolve`;
- no `prisma migrate dev`;
- no `prisma db push`;
- no DB connection;
- no DB mutation;
- no Azure action;
- no schema edit;
- no migration SQL edit;
- no migration move/delete/rename/archive;
- no runtime code change;
- no deploy;
- no Client Portal enablement;
- no public routes;
- no raw snapshot JSON commit.

## 13. Go / no-go conclusion

Current go/no-go status:

- Production apply readiness: no-go.
- CP-SCHEMA-1 readiness: no-go.
- Historical migrate resolve readiness: no-go.
- Schema baseline implementation readiness: blocked pending human feature-family decisions and a formal implementation plan.
- Docs-only baseline proposal readiness: complete.

The safest next posture is to keep production stable, treat production schema as the active baseline source of truth, and separate future feature families into explicit, reviewed migrations after baseline stabilization.

## 14. Final classification

`production_compatible_schema_baseline_proposal_documented_no_db_change_no_runtime_change`
