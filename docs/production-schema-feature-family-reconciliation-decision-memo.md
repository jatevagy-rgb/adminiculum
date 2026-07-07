# Production Schema vs Prisma Feature-Family Reconciliation Decision Memo

Classification target: `production_schema_feature_family_reconciliation_decision_memo_documented_no_db_change_no_runtime_change`

This memo is docs-only. It does not connect to any database, touch Azure, run Prisma migration commands, edit `schema.prisma`, edit migration SQL, deploy, enable Client Portal runtime, or change application behavior.

## 1. Executive summary

The current blocker is broader than CP-SCHEMA-1. The operator-run production schema snapshot shows that `Backend/prisma/schema.prisma` contains many feature families that are absent from the actual production database. Production appears to be the practical source of truth for baseline/reset planning, while `schema.prisma` currently represents a superset of production plus future, partial, or experimental product surfaces.

A production-compatible baseline/reset therefore requires human/product decisions per feature family before any schema edit, migration edit, migration resolve, migration deploy, or Client Portal work resumes.

Recommended posture:

- Treat production DB schema as source of truth for baseline planning unless a feature is explicitly approved as production-required.
- Do not blindly bring production forward to match `schema.prisma`.
- Do not blindly delete or quarantine Prisma models yet.
- Decide feature-family status first.
- Then create a production-compatible Prisma schema/baseline proposal.
- Only after that run a fresh clone proof.
- CP-SCHEMA-1 remains future work until baseline is stabilized.

## 2. Safety scope

This task is limited to documentation and repo inspection.

Safety confirmations:

- DB connection used: no.
- Azure touched: no.
- Runtime change: no.
- Schema change: no.
- Migration change: no.
- Production mutation: no.
- Client Portal enablement: no.
- Raw snapshot JSON committed: no.

## 3. Source evidence

Evidence used:

- `docs/production-schema-snapshot-comparison-results.md`
- `docs/production-compatible-prisma-baseline-reset-plan.md`
- `docs/production-migration-history-classification-matrix.md`
- `docs/production-migration-history-remediation-options.md`
- `docs/cp-schema-1-fresh-clone-verification-no-go.md`
- `Backend/prisma/schema.prisma`
- targeted backend/frontend reference searches
- existing migration SQL folders

Established facts:

- Fresh clone SELECT-only snapshot captured 31 public tables, 394 columns, 34 enum types, 202 enum values, 74 indexes, 79 constraints, and 7 migration rows.
- `schema.prisma` parser comparison found 51 mapped models and 67 enums.
- 21 Prisma mapped tables are absent from actual production DB.
- Existing DB tables are missing Prisma fields on `anonymous_documents` and `contract_generations`.
- 33 Prisma enum types are absent from DB.
- `GenerationStatus` in DB is missing `APPROVED` and `REJECTED` compared to Prisma.
- Migration history remains divergent: 16 local migrations not finished in DB, plus DB-only rolled-back `20260302142000_add_kb_learning_escalation`.

## 4. Decision framework

Recommended dispositions:

- `keep-in-prisma-and-bring-production-forward` — keep the feature in product schema and design clone-proven additive production remediation.
- `remove/quarantine-from-production-baseline` — keep historical/future design elsewhere but exclude from the active production baseline until reintroduced as a future migration.
- `already-production-represented` — production physically contains the schema; candidate for baseline inclusion after parser-independent proof.
- `partial/manual-reconciliation-needed` — production contains only part of the expected shape or current evidence is mixed; needs bespoke plan.
- `future-feature-blocked` — keep as future design, not active production baseline now.
- `unknown-human-decision-required` — product/runtime intent cannot be safely inferred from repo inspection alone.

## 5. Feature-family matrix

| Family | Apparent purpose | Production presence | Prisma presence | Runtime/code references | Product value | Risk if removed/quarantined | Risk if production brought forward | Recommended disposition | Required human decision | Next evidence before mutation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A. Core baseline | Existing clients, users, cases, tasks, documents, communications. | Present in snapshot. | Present. | Broad backend/frontend dependency. | Core operating product. | Catastrophic; must remain. | Not applicable except alignment/enum drift. | `already-production-represented`. | Accept production core as source of truth? | Robust schema diff for columns/enums/indexes. |
| B. Lawyer handoff foundation | Handoff package workflow foundation. | Present; migration finished. | Present. | Handoff service/tests/docs. | Active/legal workflow support. | Breaks deployed handoff surfaces. | Low if already represented. | `already-production-represented`. | Keep as production baseline? likely yes. | Confirm table/index/FK parity in robust diff. |
| C. Communication baseline / Outlook provider fields | Communications and provider-shaped Outlook metadata. | Present; communication baseline and Outlook provider migrations finished. | Present. | `/communications`, `/notifications`, Outlook import gate-off paths. | Active communication workspace foundation. | Breaks deployed communication workspace/import foundation. | Low; already present. | `already-production-represented`. | Keep as production baseline? yes. | Confirm enum/column/index parity. |
| D. Workload tracking | Workload/time tracking foundation. | Mixed migration metadata: one rolled-back row and later finished row; base objects appear part of production shape. | Present. | Time/workload surfaces and docs. | Productivity/reporting support. | Could break time/workload surfaces. | Risk if replayed due duplicate/rolled-back history. | `partial/manual-reconciliation-needed`. | Treat finished row as baseline truth despite earlier rollback? | Robust object inventory and migration row interpretation. |
| E. Generation drafts | Persist generated contract form state. | `generation_drafts` absent. | Present. | Backend routes and frontend generate page API; feature flag `ENABLE_GENERATION_DRAFT`. | Useful draft persistence, but may be optional. | If quarantined while UI calls route, draft persistence fails or remains gated. | Adds table not in production; may activate unsupported persistence. | `unknown-human-decision-required`; likely `remove/quarantine` unless explicitly production-required. | Should draft persistence exist in production now? Is flag enabled? | App setting/route behavior audit; clone proof if kept. |
| F. Anonymous documents | Stores anonymized documents. | Table exists, but fields/index shape is partial by evidence. | Present. | Anonymize module, CaseDetail, compare/anonymize UI. | Sensitive legal workflow. | Removing would break anonymization if active. | Applying raw migration risks duplicate/partial conflict. | `partial/manual-reconciliation-needed`. | Is anonymization production-required now? | Full table/column/index/FK diff and feature flag status. |
| G. Rehydration fields | Stores AI response and rehydration result fields on anonymous docs. | Missing on existing `anonymous_documents`. | Present. | Rehydrate service/UI references. | Important if rehydration workflow active. | Quarantine may preserve current production but block rehydration persistence. | Requires altering sensitive table; must avoid fake AI/data claims. | `partial/manual-reconciliation-needed`. | Should rehydration persistence be production-supported now? | Column-level proof plus anonymization decision. |
| H. Client identity fields | Legal identity data: tax number, registration number, representative. | Unknown/mixed; comparison did not flag all as absent but migration not finished. | Present. | Clients routes/search/forms. | High value for legal CRM. | Removing fields from Prisma may break active UI/API if production actually has them or code expects them. | Old migration includes DML backfill; unsafe without review. | `partial/manual-reconciliation-needed`. | Are these fields production-required and physically present? Is backfill desired? | Robust column proof; runtime query audit. |
| I. Case client role | Case-side represented role for generation/anonymization. | Unknown; migration not finished. | Present. | Cases services/routes, anonymize service, CaseDetail/CasesList. | Useful matter context. | Removing can break active case update/anonymize behavior. | Additive column likely low risk but cannot be raw deployed in divergent chain. | `partial/manual-reconciliation-needed` leaning `keep-in-prisma-and-bring-production-forward` if absent. | Is `clientRole` active production UI? | Column proof and route smoke against production behavior. |
| J. Client color | Client visual accent. | Physically represented in prior object check. | Present. | Client metadata/UI likely. | Low-risk UX metadata. | Low if present; removing may lose UI hints. | Raw replay may fail if column exists. | `already-production-represented`. | Accept as baseline object? | Parser-independent column proof. |
| K. Case collaborators | Collaborator membership table. | Partial evidence: table may exist, indexes/FKs uncertain. | Present. | Cases routes/services, tasks page, CaseDetail, CasesList. | Useful daily workflow. | Removing/quarantining can break active collaborator UI/API. | Raw apply risks duplicate/partial conflicts. | `partial/manual-reconciliation-needed` leaning `keep-in-prisma-and-bring-production-forward` if incomplete. | Is collaborator workflow production-required? | Table/index/FK proof and route behavior smoke. |
| L. Comparison snapshot | Persisted comparison snapshot on contract generations. | Missing column on `contract_generations`. | Present. | Contracts service reads/writes `comparisonSnapshot`. | Supports document comparison/generation review. | Quarantine may require code/schema adjustment or feature fallback. | Additive column, but should be clone-proven. | `keep-in-prisma-and-bring-production-forward` if current contract comparison is approved. | Is comparison snapshot required in current production? | Column proof and contract workflow smoke. |
| M. Timesheet reports / artifacts / presets | Persist report instances, rendered artifacts, and presets. | Absent tables/enums. | Present. | Backend timesheet-report routes; frontend time entries and presets pages. | Valuable productivity/reporting, but may be partially deployed. | Quarantine can break exposed pages if routes are live. | Adds sizeable feature family and enums; requires product approval. | `unknown-human-decision-required`; likely feature-family decision before baseline. | Are persistent timesheet reports production scope now? | Route/app setting smoke and clone proof if kept. |
| N. Legal analyses | Stores legal analysis records/work product. | Absent table/enums. | Present. | Legal-analyses backend routes and frontend API; docs cite partial feature. | Potentially important legal work product. | Quarantine can break legal analysis UI/API if exposed. | Adds sensitive work-product table; governance/privacy needed. | `unknown-human-decision-required` leaning `future-feature-blocked` unless active. | Should legal analyses be production data now? | Feature flag/route smoke, privacy review, clone proof. |
| O. Client house style | Client drafting style/profile and header branding. | Absent base table/header columns. | Present. | Clients routes, `ClientHouseStylePanel`, docs. | Useful drafting productivity. | Quarantine can break panel/API if visible. | Adds client-specific profile table; should be approved as production feature. | `unknown-human-decision-required`; possibly `future-feature-blocked`. | Is house style production scope now? | Route/UI smoke and clone proof if kept. |
| P. Workspace text | Stores document working-copy text. | Previously found physically represented. | Present. | Document compare/workspace API/docs. | Important document workflow. | Removing risks workspace save/read behavior. | Raw replay may fail if column exists. | `already-production-represented`. | Accept as baseline object? likely yes. | Parser-independent column proof. |
| Q. Document review | Review suggestions and review workspace states. | Absent `document_review_suggestions` and enums. | Present. | Prisma relations; docs warn route risk; review UI exists in adjacent flows. | Potentially important review UX. | Quarantine may require API guards to avoid runtime 500s. | Adds review/work-product tables; needs dedicated rollout. | `future-feature-blocked` or `unknown-human-decision-required`. | Is DB-backed review suggestions production scope now? | Route guard audit and clone proof if kept. |
| R. Clause library | Reusable clauses and lawyer profiles. | Absent clause/profile/preferred clause tables. | Present. | Clause library API/client references and `/clause-library`. | Product-visible productivity feature. | Quarantine may break exposed clause-library route/API. | Adds sizeable feature set; likely should be separate migration family. | `unknown-human-decision-required` leaning `keep-in-prisma-and-bring-production-forward` if route is product-approved. | Is clause library production-approved now? | Route smoke, code audit, clone proof. |
| S. Contract assembly | Assembly drafts and selected clauses. | Absent assembly tables. | Present. | Clause-library assembly API/client references. | Supports clause-based drafting. | Quarantine may require disabling/guarding assembly actions. | Depends on clause library; should not be separate blind apply. | `future-feature-blocked` unless clause library is approved now. | Is contract assembly production scope or later enhancement? | Decide with clause library; clone proof if kept. |
| T. CP-SCHEMA-1 / Client Portal foundation | Tenant-isolated portal identity, artifacts, grants, submissions, audit. | Absent. | Present as candidate. | Docs/schema only; runtime not enabled. | Future strategic product. | No current runtime loss if blocked. | Premature; depends on baseline. | `future-feature-blocked`. | Resume CP only after baseline? yes. | Production-compatible baseline proof first. |
| U. DB-only rolled-back kb/learning/escalation | Unknown historical DB-only migration. | Migration row rolled back; no objects found. | No local migration folder. | Docs only. | Unknown. | Ignoring without documentation leaves history oddity. | Recreating blindly is unsafe. | `unknown-human-decision-required`; document as rolled-back historical artifact. | Should it be archived as failed experiment? | Human decision; no schema mutation. |

## 6. Highest-risk mismatches

### Prisma models absent from DB but referenced by runtime

High-risk absent or partial families with code references include:

- `GenerationDraft` via generation draft routes and case generation UI.
- `LegalAnalysis` via legal-analysis routes and frontend API.
- Timesheet report/preset models via time entries and timesheet presets UI/API.
- Clause library and contract assembly models via frontend API and docs for `/clause-library`.
- `ClientHouseStyleProfile` via clients routes and `ClientHouseStylePanel`.
- Case collaborators via cases/tasks UI and cases routes/services.
- Document review suggestion models may affect review-related future/guarded routes.

Risk: Prisma Client code can throw at runtime if unguarded routes query absent tables. Feature flags/route guards need audit before any schema baseline reduction.

### Existing DB tables missing Prisma fields

High-risk missing fields:

- `anonymous_documents`: rehydration and AI response fields are absent.
- `contract_generations`: comparison snapshot, SharePoint/final revision, and revision lineage fields are absent.

Risk: active code expecting these fields can fail even when the table exists.

### Enum mismatch

`GenerationStatus` in DB lacks `APPROVED` and `REJECTED` compared to Prisma.

Risk: writing those enum values through Prisma would fail if production DB still lacks them.

### Future migration risk

Future migrations built from current `schema.prisma` may assume production already has tables/enums/columns that it does not. This makes normal Prisma migration generation/deploy unsafe until baseline is reconciled.

## 7. Recommended conservative path

Recommended path:

1. Treat production DB schema as source of truth for baseline planning unless a feature is explicitly approved as production-required.
2. Do not blindly bring production forward to match `schema.prisma`.
3. Do not blindly delete or quarantine Prisma models yet.
4. Decide feature-family status with human/product input.
5. Audit runtime route guards for feature families absent from production.
6. Create a production-compatible Prisma schema/baseline proposal after decisions.
7. Prove the proposed baseline/reset on a fresh clone.
8. Resume CP-SCHEMA-1 only after baseline is stable.

## 8. Human/product decision checklist

For each feature family, answer yes/no:

- Should this feature exist in production now?
- Is this feature currently visible in UI or callable through API?
- Is it guarded by a feature flag or hard runtime gate?
- Is data loss possible if removed/quarantined from the active production baseline?
- Is the feature experimental/internal-only?
- Is the feature required before CP-SCHEMA-1?
- Should the feature stay as future roadmap outside the active production migration baseline?
- If production must be brought forward, can it be done additively and clone-proven?
- If `schema.prisma` must be aligned down, what runtime code must be guarded or adjusted first?

## 9. Proposed baseline implications

Possible implications:

- `schema.prisma` may need to be aligned down to actual production for the active baseline.
- Absent feature families may need to move into future migrations instead of remaining in the active production baseline.
- Old migrations may need archival/quarantine outside Prisma's active deploy path.
- Production-required missing families may need explicit additive remediation before baseline.
- A new production-compatible baseline may be needed.
- The baseline reset must be clone-proven before any production change.

## 10. Explicit non-actions

The following remain prohibited:

- no `prisma migrate deploy`;
- no `prisma migrate resolve`;
- no `prisma migrate dev`;
- no `prisma db push`;
- no schema edit yet;
- no migration edit yet;
- no production mutation;
- no Azure App Service change;
- no Client Portal enablement;
- no raw snapshot commit;
- no business/client row export.

## 11. Recommended next task

Recommended next task:

`Adminiculum — production-compatible schema/baseline proposal docs-only`

Scope for that task:

- docs-only;
- no DB/Azure/mutation;
- propose which feature families belong in the production-compatible baseline;
- propose which Prisma models/enums should be baseline-active, future-quarantined, or remediated;
- propose route guard/schema adjustment prerequisites;
- do not edit `schema.prisma` yet.

## 12. Final classification

`production_schema_feature_family_reconciliation_decision_memo_documented_no_db_change_no_runtime_change`
