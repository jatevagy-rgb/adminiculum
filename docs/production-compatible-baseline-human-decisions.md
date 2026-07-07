# Production-Compatible Baseline Human Decisions

Final classification target: `production_compatible_baseline_human_decisions_documented_no_db_change_no_runtime_change`

This is a short human/product decision sheet for the production-compatible schema baseline. It is not an implementation plan, migration plan, DB task, Azure task, runtime change, or Client Portal enablement step.

## 1. Executive summary

Production-compatible baseline work is blocked until feature-family decisions are recorded. The safest default is to keep production-present foundations, quarantine production-absent experimental/future families, and mark partial/drift families as unknown until targeted review proves whether they should be brought forward or quarantined.

Production remains the practical source of truth for the active baseline unless humans explicitly decide that a feature family must be brought forward into production.

## 2. How to use this decision sheet

For each row, choose exactly one human decision:

- `KEEP` — keep as part of the active production-compatible baseline because it is production-present and required.
- `QUARANTINE` — exclude from the active baseline for now; reintroduce later through a clean, clone-proven migration if approved.
- `REMOVE` — treat as obsolete and plan a separate repo/runtime cleanup. Do not use this unless product/engineering agrees.
- `BRING-FORWARD` — production should be additively remediated to support this family, after fresh clone proof.
- `UNKNOWN` — not enough evidence; requires targeted review before implementation.

Do not use this sheet to authorize DB mutation. It only records decisions needed before implementation planning.

## 3. Default conservative decision set

Default safe decisions if no human override is supplied:

- `KEEP`: core baseline, lawyer handoff foundation, communication baseline / Outlook provider fields.
- `UNKNOWN`: workload tracking, anonymous documents, rehydration fields, client identity fields, case client role, case collaborators, comparison snapshot, client color, workspace text.
- `QUARANTINE`: generation drafts, contracts / generated document templates, temporary operational / database administration routes, timesheet reports/artifacts/presets, legal analyses, client house style, document review, clause library, contract assembly.
- `QUARANTINE` / future-blocked: CP-SCHEMA-1 / Client Portal foundation.
- `UNKNOWN`: DB-only rolled-back kb/learning/escalation migration.

## 4. Feature-family decision table

| Feature family | Current recommendation | Decision needed | Default safe decision | Human decision: KEEP / QUARANTINE / REMOVE / BRING-FORWARD / UNKNOWN | Notes |
| --- | --- | --- | --- | --- | --- |
| Core baseline | Keep in active baseline. | Confirm production DB remains source of truth for core product objects. | `KEEP` |  | Clients, users, cases, tasks, documents, and current core workflow objects are production-present and required. |
| Lawyer handoff foundation | Keep in active baseline. | Confirm handoff foundation remains production-supported. | `KEEP` |  | Production migration is finished and feature has deployed foundation. |
| Communication baseline / Outlook provider fields | Keep in active baseline. | Confirm communications and provider metadata remain production-supported. | `KEEP` |  | Communication baseline and Outlook provider schema are production-applied; Outlook import remains separately gate-off. |
| Workload tracking | Manual reconciliation. | Decide whether finished workload migration row and physical objects are authoritative. | `UNKNOWN` |  | Migration history has rolled-back and later finished rows; do not replay blindly. |
| Generation drafts | Quarantine unless product requires now. | Decide whether persistent generation drafts are production scope. | `QUARANTINE` |  | `generation_drafts` absent from production; route/UI references need guard review if quarantined. |
| Contracts / generated document templates | Quarantine from production-compatible baseline. | Decide only after storage, retention, permission, audit, and privacy model are explicitly approved. | `QUARANTINE` | `QUARANTINE` | Not read-only: includes template upload, generated document creation/preview, local filesystem storage, `ContractTemplate`/`ContractGeneration` DB writes/reads, persisted `templateData`/file metadata, SharePoint upload, cleanup/delete behavior, and retention/privacy implications. Production apply readiness: blocked. CP-SCHEMA-1 readiness: blocked. Required before future `KEEP`: explicit storage model, SharePoint-only or approved storage policy, retention/delete policy, permission model, audit/privacy review, and targeted route tests. |
| Temporary operational / database administration routes | Quarantine from production-compatible baseline. | Decide only after explicit admin-only hardening or removal plan. | `QUARANTINE` | `QUARANTINE` | `Backend/src/routes/migrate.ts` and `Backend/src/routes/dbcheck.ts` contain database check/sync and runtime `prisma db push` behavior; current `Backend/src/index.ts` does not register `/api/v1/migrate` or `/api/v1/dbcheck`, and `Backend/swagger.yaml` is absent. Production-compatible baseline must not depend on runtime migration/dbcheck/sync endpoints or broadly exposed temporary operational surfaces. Production apply readiness: blocked. CP-SCHEMA-1 readiness: blocked. Required before future `KEEP` or removal decision: explicit route inventory, admin-only auth/authorization decision, feature-flag or internal-only exposure decision, OpenAPI exposure decision, Azure/prod access model review, targeted route tests proving unauthenticated access is rejected, and separate runtime hardening PR if kept at all. |
| Anonymous documents | Manual reconciliation. | Decide active anonymization persistence scope and required columns. | `UNKNOWN` |  | Table exists but Prisma-declared fields are partially absent. |
| Rehydration fields | Manual reconciliation. | Decide whether persistent rehydration fields are production-required. | `UNKNOWN` |  | Missing fields on `anonymous_documents`; sensitive workflow, additive-only if brought forward. |
| Client identity fields | Manual reconciliation. | Decide exact legal identity fields required in production. | `UNKNOWN` |  | Avoid historical migration DML/backfill assumptions. |
| Case client role | Manual reconciliation, likely bring forward if active. | Decide whether `clientRole` is active production matter context. | `UNKNOWN` |  | Potentially low-risk additive field, but still requires proof. |
| Client color | Keep if physical proof is confirmed. | Confirm column presence and runtime need. | `UNKNOWN` |  | Prior evidence suggested production representation; needs final parser-independent proof. |
| Case collaborators | Manual reconciliation, likely keep if active. | Decide whether collaborator workflow is production-required. | `UNKNOWN` |  | Partial evidence; table/index/FK completeness must be proven. |
| Comparison snapshot | Bring forward only if current workflow requires it. | Decide whether comparison snapshots are production-required. | `UNKNOWN` |  | Missing on `contract_generations`; clone-proven additive column if kept. |
| Timesheet reports / artifacts / presets | Quarantine unless explicitly approved now. | Decide whether persistent timesheet reports are production scope. | `QUARANTINE` |  | Tables/enums absent; likely separate future feature-family migration. |
| Legal analyses | Quarantine unless explicitly active. | Decide whether legal analyses are production work product now. | `QUARANTINE` |  | Sensitive work-product tables absent; governance needed before bring-forward. |
| Client house style | Quarantine unless explicitly production scope. | Decide whether house style profiles are production-supported now. | `QUARANTINE` |  | Tables/fields absent; UI references need guard review if quarantined. |
| Workspace text | Keep if physical proof is confirmed. | Confirm column/object presence and current workflow need. | `UNKNOWN` |  | Prior evidence suggested representation; do not replay old migration blindly. |
| Document review | Quarantine unless DB-backed review suggestions are approved. | Decide whether persisted review suggestions are production scope. | `QUARANTINE` |  | Avoid fake automated review or unsupported review persistence claims. |
| Clause library | Quarantine unless product-approved now. | Decide whether `/clause-library` requires DB-backed production support. | `QUARANTINE` |  | If approved, reintroduce through clean feature migration. |
| Contract assembly | Quarantine unless clause library is approved. | Decide whether assembly drafts/clauses are production scope. | `QUARANTINE` |  | Depends on clause library baseline; do not bring forward independently. |
| CP-SCHEMA-1 / Client Portal foundation | Future-blocked, exclude from baseline. | Decide only after baseline is stable. | `QUARANTINE` |  | No existing data becomes client-visible; Client Portal runtime remains off. |
| DB-only rolled-back kb/learning/escalation migration | Treat as historical artifact unless product says otherwise. | Decide whether it is abandoned, archived, or needs future design. | `UNKNOWN` |  | DB row is rolled back, local migration is missing, and object checks found no active objects. |

## 5. Items that must not be decided automatically

These require explicit human/product decision before any implementation planning:

- Whether production schema remains the active baseline source of truth.
- Whether generation drafts are production-required.
- Whether contracts/generated document templates may be kept only after explicit storage, retention/delete, permission, audit/privacy, SharePoint/local-storage, and route-test decisions.
- Whether temporary operational/database administration routes should be removed or kept only after admin-only hardening, internal-only exposure, OpenAPI, Azure/prod access, and unauthenticated-rejection test decisions.
- Whether anonymization and rehydration persistence should be remediated now.
- Whether client identity, case client role, client color, workspace text, and collaborators are production-required and physically present.
- Whether comparison snapshot persistence is required for current contract/document workflows.
- Whether timesheet reports, legal analyses, client house style, clause library, contract assembly, or document review suggestions are active product commitments.
- Whether the rolled-back DB-only kb/learning/escalation migration is abandoned historical state.
- When CP-SCHEMA-1 may resume as a separate future migration chain.

## 6. Explicit non-actions

This decision sheet does not authorize:

- DB connection or DB mutation;
- Azure access or Azure configuration change;
- `prisma migrate deploy`, `prisma migrate dev`, `prisma migrate resolve`, or `prisma db push`;
- schema edits;
- migration file edits, moves, deletes, renames, or archives;
- runtime code changes;
- deployment;
- Client Portal enablement;
- public route creation;
- exposing existing data to clients;
- committing raw snapshot artifacts or secrets.

## 7. Next step after human decisions

After the human decision column is filled, the next recommended task is:

`Adminiculum — production-compatible schema baseline implementation planning`

That task should still be docs/planning-first and should remain blocked from DB mutation until:

- feature-family decisions are recorded;
- quarantined runtime surfaces have a guard/reduction plan;
- production-active objects are proven on a fresh clone;
- the proposed baseline implementation shape is reviewed;
- clone proof succeeds without data exposure or Client Portal enablement.

## 8. Final classification

`production_compatible_baseline_human_decisions_documented_no_db_change_no_runtime_change`
