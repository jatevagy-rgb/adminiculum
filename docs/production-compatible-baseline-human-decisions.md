# Production-Compatible Baseline Human Decisions

Final classification target: `privacy_side_effect_hardening_rollup_quarantine_preserved_no_db_change_no_runtime_change`

This is the human/product decision sheet for the production-compatible baseline. It is a decision index only: it is not an implementation plan, migration plan, DB task, Azure task, runtime change, OpenAPI/CORS change, route change, test change, or Client Portal enablement step.

## 1. Purpose

The current repository schema and historical migration chain do not safely represent the active production database as an apply-ready baseline. This sheet records which feature families are currently safe to treat as production-present, which must be quarantined from the production-compatible baseline, and which remain unknown until targeted evidence and human decisions exist.

This document intentionally keeps production apply blocked. It gives humans a concise place to make explicit `KEEP`, `QUARANTINE`, `REMOVE`, `BRING-FORWARD`, or `UNKNOWN` decisions before any future baseline implementation planning.

## 2. Current global status

| Area | Status |
| --- | --- |
| Production apply readiness | `BLOCKED` |
| CP-SCHEMA-1 readiness | `BLOCKED` |
| DB apply performed by this decision series | No |
| Runtime change performed by this decision series | No |
| Schema or migration change authorized by this sheet | No |
| Azure, OpenAPI, CORS, auth, route, frontend, or test behavior change authorized by this sheet | No |

`KEEP` does not mean deploy or apply. It means the family is currently considered part of the intended production-compatible baseline, subject to later implementation planning and clone proof.

`QUARANTINE` means the family is not part of the production-compatible baseline until it receives separate targeted review, human approval, clone proof where relevant, and a separate implementation PR for any runtime, schema, route, OpenAPI, test, Azure, or DB change.

## 3. Decision vocabulary

- `KEEP` — keep as part of the active production-compatible baseline because it is production-present and required.
- `QUARANTINE` — exclude from the active baseline for now; reintroduce only through separate reviewed and clone-proven work if approved.
- `REMOVE` — treat as obsolete and plan separate repo/runtime cleanup; do not use without explicit product/engineering agreement.
- `BRING-FORWARD` — production should be additively remediated to support this family after human approval and fresh clone proof.
- `UNKNOWN` — not enough evidence; requires targeted review before implementation.

## 4. Default safe decisions

### KEEP

- Core baseline.
- Lawyer handoff foundation.
- Communication baseline / Outlook provider fields.

### QUARANTINE

- Generation drafts.
- Contracts / generated document templates.
- Temporary operational / database administration routes.
- Client Portal / external client visibility boundary.
- Document processing / anonymization / rehydration / AI privacy boundary.
- Public OpenAPI / Power Apps connector / CORS exposure boundary.
- Partial schema drift / code-compatibility leftovers.
- Timesheet reports / artifacts / presets.
- Legal analyses.
- Client house style.
- Document review persistence.
- Clause library.
- Contract assembly.
- CP-SCHEMA-1 / Client Portal foundation.

### UNKNOWN

- Workload tracking.
- Anonymous documents.
- Rehydration fields.
- Client identity fields.
- Case client role.
- Client color.
- Case collaborators.
- Comparison snapshot.
- Workspace text.
- DB-only rolled-back kb/learning/escalation migration.

## 5. Decision matrix

| Feature family | Current decision | Production/apply posture | Required before any future change |
| --- | --- | --- | --- |
| Core baseline | `KEEP` | Production-present foundations such as clients, users, cases, tasks, documents, and core workflow objects remain the practical baseline. | Confirm production DB remains the source of truth during baseline implementation planning. |
| Lawyer handoff foundation | `KEEP` | Production migration is finished and the deployed foundation is part of the active baseline. | Preserve as production-supported unless a later targeted audit contradicts this. |
| Communication baseline / Outlook provider fields | `KEEP` | Communication baseline and Outlook provider schema are production-applied; Outlook import remains separately gate-off. | Preserve existing gates and do not infer live Outlook/Graph sync. |
| Workload tracking | `UNKNOWN` | Migration history has rolled-back and later finished rows; do not replay blindly. | Decide whether finished migration row and physical objects are authoritative. |
| Generation drafts | `QUARANTINE` | `generation_drafts` is production-absent and must not be silently included. | Product decision, runtime guard review, and separate clone-proven migration if brought forward. |
| Contracts / generated document templates | `QUARANTINE` | Not read-only; includes template upload, generated document creation/preview, local filesystem storage, `ContractTemplate`/`ContractGeneration` DB reads/writes, persisted `templateData`/file metadata, SharePoint upload, cleanup/delete behavior, and retention/privacy implications. CONTRACTS-HARDEN-1 adds auth-first/default-disabled runtime hardening for contract routes, but this does not enable generation or make the family `KEEP`. | Explicit storage model, SharePoint-only or approved storage policy, retention/delete policy, permission model, audit/privacy review, and targeted route tests for any future enabled behavior. |
| Temporary operational / database administration routes | `QUARANTINE` | Runtime migration/dbcheck/sync endpoints and broadly exposed operational surfaces are not product baseline features. `Backend/src/routes/migrate.ts` and `Backend/src/routes/dbcheck.ts` contain database check/sync and runtime `prisma db push` behavior; current `Backend/src/index.ts` does not register `/api/v1/migrate` or `/api/v1/dbcheck`. TEMP-OPS-HARDEN-1 adds auth-first/default-disabled runtime hardening for these route modules, but this does not make the family `KEEP` or production-ready. Production apply and CP-SCHEMA-1 remain blocked. | Explicit route inventory, full admin-only exposure decision, OpenAPI exposure decision, Azure/prod access review, and separate hardening/removal PR before any future `KEEP`. |
| Client Portal / external client visibility boundary | `QUARANTINE` | `/api/v1/client-portal` is auth-first and remains gate-off with `CLIENT_PORTAL_NOT_ENABLED`; `ENABLE_CLIENT_PORTAL=true` alone is not enough because a separate client-user ownership model is still required. Adjacent matter/time-entry surfaces include clientId/path/query based access and matter/time-entry data that could become externally sensitive if reused for clients. | Explicit client-user identity and ownership model, need-to-know authorization per client/matter/document/time-entry, strict internal/external mapper, no raw internal comments/timeline/audit leakage, feature-flag tests, spoofed clientId/path rejection, OpenAPI exposure decision, and privacy/GDPR review. |
| Document processing / anonymization / rehydration / AI privacy boundary | `QUARANTINE` | Document and AI flows may process privileged legal content and personal data, including upload/download/text extraction, compare/review, anonymization/rehydration, external AI-response import, review-suggestion persistence, legal-analysis text storage, prompts, persisted outputs, timeline logging, and OpenAPI document/anonymization references. DOCUMENT-AI-HARDEN-1 adds auth-first/default-disabled hardening for document processing, anonymization, rehydration, review-suggestion, and legal-analysis routes, but this does not enable document AI or make the family `KEEP`. | Explicit document storage model, approved AI/provider data-processing policy, anonymization and rehydration threat model, no raw privileged/legal/personal content in logs unless approved, retention/delete policy, strict case/document permissions, internal/external field separation, OpenAPI exposure decision, targeted route tests for any future enabled behavior, and GDPR/legal professional secrecy review. |
| Public OpenAPI / Swagger / CORS exposure boundary | `QUARANTINE` | Public unauthenticated API metadata, permissive CORS behavior, or wider-than-runtime/stale OpenAPI paths must not be treated as safe baseline. `Backend/src/index.ts` serves unauthenticated OpenAPI JSON at `/api/v1/openapi.json` and `/openapi.json` and rewrites servers from `WEBSITE_HOSTNAME`; OPENAPI-EXPOSURE-HARDEN-1 sanitizes served API metadata so quarantined/admin/stale operations are not presented as normal production-ready public operations. CORS-EXPOSURE-HARDEN-1 narrows production CORS to explicit configured origins and fail-closed browser behavior while preserving no-Origin server-to-server requests and localhost development origins. Stale Power Apps / connector wording in historical spec artifacts is not current product direction and is not preserved in served public metadata. This does not make the OpenAPI/CORS boundary `KEEP`. Production apply and CP-SCHEMA-1 remain blocked. | Decide final public/internal/admin-only OpenAPI exposure model, prove runtime/spec parity, remove or label any remaining stale/future/ghost paths, confirm final production domain inventory and Azure hostname exposure, confirm production environment settings, and test OpenAPI/CORS exposure before any future `KEEP`. |
| Partial schema drift / code-compatibility leftovers | `QUARANTINE` | Partial/drift schema families and code-compatibility leftovers must not be silently included. PARTIAL-SCHEMA-DRIFT-INVENTORY-1 records a documentation-only inventory in `docs/partial-schema-drift-inventory.md`; it does not move this family to `KEEP`. Known evidence includes partial `case_collaborators` uncertainty, `anonymous_documents` `redactedItems`/AI/rehydration field uncertainty, `contract_generations` `comparisonSnapshot`/SharePoint/revision field uncertainty, prior-documented `GenerationStatus` enum drift around `APPROVED`/`REJECTED`, and not-proven-production-ready runtime-referenced or future-oriented families. Production apply and CP-SCHEMA-1 remain blocked. | Explicit inventory of each partial/drift family, production physical schema comparison, runtime usage review, OpenAPI exposure review where applicable, human decision whether each item is active production/future/dead-code/schema-drift, migration strategy only after baseline stability, targeted tests for kept items, and separate implementation PR for any schema/runtime change. |
| Anonymous documents | `UNKNOWN` | Table exists but Prisma-declared fields are partially absent. | Decide active anonymization persistence scope and required columns. |
| Rehydration fields | `UNKNOWN` | Missing fields on `anonymous_documents`; sensitive workflow. | Decide whether persistent rehydration fields are production-required and prove additive path if brought forward. |
| Client identity fields | `UNKNOWN` | Historical migration DML/backfill assumptions must not be reused blindly. | Decide exact legal identity fields required in production. |
| Case client role | `UNKNOWN` | Potentially low-risk additive field, but still requires proof. | Decide whether `clientRole` is active production matter context. |
| Client color | `UNKNOWN` | Prior evidence suggested production representation, but final parser-independent proof is still required. | Confirm column presence and runtime need. |
| Case collaborators | `UNKNOWN` | Partial evidence; table/index/FK completeness must be proven. | Decide whether collaborator workflow is production-required. |
| Comparison snapshot | `UNKNOWN` | Missing on `contract_generations`; may be clone-proven additive if kept. | Decide whether comparison snapshots are production-required for current workflows. |
| Timesheet reports / artifacts / presets | `QUARANTINE` | Tables/enums are absent and likely belong to a separate future feature-family migration. | Product approval, privacy/reporting scope, and clone-proven separate migration if brought forward. |
| Legal analyses | `QUARANTINE` | Sensitive work-product tables are absent. | Governance and privacy decision before any bring-forward. |
| Client house style | `QUARANTINE` | Tables/fields are absent; UI references need guard review if quarantined. | Product decision and separate feature migration if approved. |
| Workspace text | `UNKNOWN` | Prior evidence suggested representation; do not replay old migration blindly. | Confirm physical presence and current workflow need. |
| Document review | `QUARANTINE` | Persisted review suggestions are not baseline until explicitly approved; avoid fake automated review or unsupported review persistence claims. | Product/privacy decision and targeted tests before any DB-backed review persistence. |
| Clause library | `QUARANTINE` | `/clause-library` DB-backed production support is not baseline. | Product approval and clean feature migration if approved. |
| Contract assembly | `QUARANTINE` | Depends on clause library baseline and must not be brought forward independently. | Approve clause library first, then separately decide assembly drafts/clauses. |
| CP-SCHEMA-1 / Client Portal foundation | `QUARANTINE` | Future-blocked and excluded from baseline; Client Portal runtime remains off and no existing data becomes client-visible. | Resume only after production-compatible baseline/remediation is stable and a fresh clone proof shows CP as the intentionally next migration. |
| DB-only rolled-back kb/learning/escalation migration | `UNKNOWN` | DB row is rolled back, local migration is missing, and object checks found no active objects. | Decide whether it is abandoned historical state, archived context, or future design work. |

## 6. Current blockers

- Production apply remains blocked.
- CP-SCHEMA-1 remains blocked.
- Normal `prisma migrate deploy` remains unsafe while production migration history diverges from local migration history.
- Blanket `prisma migrate resolve --applied` remains unsafe because several local migration effects are absent, partial, or not proven physically present.
- Quarantined families must not be treated as production-ready by schema, runtime, OpenAPI, docs, or deployment workflows.
- Unknown families require targeted evidence and human decisions before implementation planning.

## 7. Completed exposure hardening while quarantine preserved

These hardenings reduce exposure risk but do not authorize production apply, do not unblock CP-SCHEMA-1, and do not move any quarantined family to `KEEP`.

| Hardening | Result | Remaining posture |
| --- | --- | --- |
| TEMP-OPS-HARDEN-1 (`a9c1a98`) | `migrate`/`dbcheck` route modules are auth-first, default-disabled, production-blocked even if `ENABLE_RUNTIME_ADMIN_ROUTES=true`, and tests prove `execSync` / default `prisma db push` is not reached. | Temporary operational / database administration routes remain `QUARANTINE` until a final decision exists to delete them, keep them internal-only, or replace them with a proper admin-only mechanism. |
| OPENAPI-EXPOSURE-HARDEN-1 (`9c13114`) | `/openapi.json` and `/api/v1/openapi.json` still return JSON, but served public metadata is sanitized so quarantined, stale, admin, contracts, Client Portal, document/AI, and migrate/dbcheck paths are removed if present. Stale Power Apps / connector wording is not preserved in served public metadata and is not current scope. | OpenAPI exposure remains `QUARANTINE` until final public/internal/admin-only API metadata decision, stale/ghost route review, and runtime/spec parity review are complete. |
| CORS-EXPOSURE-HARDEN-1 (`0e5c681`) | Production CORS allows only explicit configured origins from `CORS_ALLOWED_ORIGINS`, `CORS_ORIGIN`, `FRONTEND_ORIGIN`, or `FRONTEND_URL`; missing production allowlist fails closed for browser origins; arbitrary HTTPS/Azure origins are rejected; no-Origin server-to-server requests and localhost development origins remain supported. | CORS exposure remains `QUARANTINE` until final domain inventory, Azure hostname review, production environment setting review, and public/internal OpenAPI decision are complete. |

Temporary Ops, OpenAPI/CORS, and partial schema drift/code-compatibility leftovers remain governed by their existing `QUARANTINE` decisions.

## 8. Completed privacy and side-effect hardening while quarantine preserved

These hardenings reduce side-effect and privacy risk only. They do not authorize production apply, do not authorize CP-SCHEMA-1, and do not move Client Portal, contracts, or document/AI from `QUARANTINE` to `KEEP`.

| Hardening | Result | Remaining posture |
| --- | --- | --- |
| CLIENT-PORTAL-HARDEN-1 (`7925c0b`) | Client Portal routes are auth-first and remain disabled. `ENABLE_CLIENT_PORTAL=true` alone is insufficient and still returns `501` / `CLIENT_PORTAL_NOT_ENABLED`; no external client data exposure is enabled. | Client Portal remains `QUARANTINE` pending explicit client-user identity model, ownership/need-to-know authorization, internal/external mapper, spoofing tests for any future enabled behavior, OpenAPI exposure review, and GDPR/privacy review. |
| CONTRACTS-HARDEN-1 (`2310b03`) | Contract routes are auth-first/default-disabled. Authenticated requests return `FEATURE_NOT_AVAILABLE` / `CONTRACTS_NOT_ENABLED`; `ENABLE_CONTRACT_GENERATION=true` alone is insufficient and a separate storage-model gate is required. Disabled routes do not reach multer upload handling, generation services, Prisma writes, local file operations, SharePoint upload, cleanup/delete, or timeline writes. | Contracts / generated document templates remain `QUARANTINE` pending explicit storage model, retention/delete policy, SharePoint or approved storage decision, permission model, audit/privacy review, and targeted route tests for any future enabled behavior. |
| DOCUMENT-AI-HARDEN-1 (`c5a9bfc`) | Document processing, anonymization, rehydration, review-suggestion, and legal-analysis routes are auth-first/default-disabled. Authenticated disabled routes return `FEATURE_NOT_AVAILABLE` / `DOCUMENT_AI_NOT_ENABLED`; legacy flags alone are insufficient and `ENABLE_DOCUMENT_AI_PRIVACY_MODEL` is also required. Disabled routes do not reach service execution, Prisma writes, text extraction, file decoding/download, prompt construction, redacted/rehydrated content persistence, AI/provider calls, or timeline writes. | Document processing / anonymization / rehydration / AI privacy boundary remains `QUARANTINE` pending approved document storage model, AI/provider data-processing policy, anonymization/rehydration threat model, retention/delete policy, strict case/document permission model, privacy-safe audit/logging policy, targeted route tests for any future enabled behavior, and GDPR/legal professional secrecy review. |

## 9. Future decision requirements

These items must not be decided automatically:

- Whether production schema remains the active baseline source of truth.
- Whether generation drafts are production-required.
- Whether contracts/generated document templates may be kept only after explicit storage, retention/delete, permission, audit/privacy, SharePoint/local-storage, and route-test decisions.
- Whether temporary operational/database administration routes should be removed or kept only after admin-only hardening, internal-only exposure, OpenAPI, Azure/prod access, and unauthenticated-rejection test decisions.
- Whether Client Portal/external visibility can ever reuse internal matter/time-entry/document/task/timeline surfaces, or must use dedicated client-owned publication artifacts and strict external mappers only.
- Whether document processing, anonymization, rehydration, AI-assisted review/generation, text extraction, prompts, provider responses, and persisted document outputs may be kept only after explicit privacy/storage/retention/permission/provider review.
- Whether public OpenAPI JSON, Swagger metadata, and CORS behavior should be public, authenticated, admin-only, disabled, or narrowed before any production-compatible baseline `KEEP` decision.
- Whether each partial/drift/code-compatibility leftover is active production, future feature, dead code, or schema drift before any `KEEP`, `REMOVE`, or `BRING-FORWARD` decision.
- Whether anonymization and rehydration persistence should be remediated now.
- Whether client identity, case client role, client color, workspace text, and collaborators are production-required and physically present.
- Whether comparison snapshot persistence is required for current contract/document workflows.
- Whether timesheet reports, legal analyses, client house style, clause library, contract assembly, or document review suggestions are active product commitments.
- Whether the rolled-back DB-only kb/learning/escalation migration is abandoned historical state.
- When CP-SCHEMA-1 may resume as a separate future migration chain.

## 10. Explicit non-actions

This decision sheet does not authorize:

- DB connection or DB mutation;
- Azure access or Azure configuration change;
- `prisma migrate deploy`, `prisma migrate dev`, `prisma migrate resolve`, or `prisma db push`;
- schema edits;
- migration file edits, moves, deletes, renames, or archives;
- runtime code changes;
- route behavior changes;
- OpenAPI or CORS behavior changes;
- auth changes;
- frontend changes;
- test behavior changes;
- deployment;
- Client Portal enablement;
- public route creation;
- exposing existing data to clients;
- committing raw snapshot artifacts or secrets.

Any future `KEEP`, `REMOVE`, or `BRING-FORWARD` decision that changes runtime, schema, routes, OpenAPI, tests, Azure, or DB state requires a separate implementation PR.

## 11. Next step after human decisions

After human decisions are filled for the remaining `UNKNOWN` and quarantined high-risk families, the next recommended task is:

`Adminiculum — production-compatible schema baseline implementation planning`

That task should still be docs/planning-first and remain blocked from DB mutation until:

- feature-family decisions are recorded;
- quarantined runtime surfaces have a guard/reduction plan;
- production-active objects are proven on a fresh clone;
- the proposed baseline implementation shape is reviewed;
- clone proof succeeds without data exposure or Client Portal enablement.

## 12. Final classification

`privacy_side_effect_hardening_rollup_quarantine_preserved_no_db_change_no_runtime_change`
