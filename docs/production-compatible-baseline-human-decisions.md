# Production-Compatible Baseline Human Decisions

Final classification target: `cases_client_role_authorization_hardened_no_db_change_no_migration_no_azure`

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

### Latest document-editor decision

| Feature family | Current recommendation | Decision needed | Default safe decision | Human decision | Notes |
| --- | --- | --- | --- | --- | --- |
| Document editor review/comments quality hardening | Keep Mode C quality hardening and document-level comments | Delete/anchored comments require future model/policy | `KEEP` document-level comments; `QUARANTINE` delete and anchored comments | `KEEP` Branch A comments without delete | `DOCUMENT-COMMENTS-BACKEND-AND-EDITOR-1` completed with existing `Comment.documentId`; no `schema.prisma` edit, no migration, no manual DB query, no deployment, no editor persistence, no fake anchors, no comment body in audit/notification/activity, no Client Portal, no AI, no n8n. Dependency audit remains four moderate advisories with no force fix. |

### KEEP

- Core baseline.
- Lawyer handoff foundation.
- Communication baseline / Outlook provider fields.
- Client color (`clients.color`) as narrow internal display metadata only.
- Case collaborators (`case_collaborators`) as narrow internal read/create/delete baseline only.

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

- Anonymous documents.
- Rehydration fields.
- Client identity fields (`KEEP — narrow internal baseline`; limited to hardened internal client-route behavior).
- Case client role (`KEEP — narrow internal baseline`; limited to hardened internal matter-party metadata behavior).
- Comparison snapshot.
- Workspace text.
- DB-only rolled-back kb/learning/escalation migration.

## 5. Decision matrix

| Feature family | Current decision | Production/apply posture | Required before any future change |
| --- | --- | --- | --- |
| Core baseline | `KEEP` | Production-present foundations such as clients, users, cases, tasks, documents, and core workflow objects remain the practical baseline. | Confirm production DB remains the source of truth during baseline implementation planning. |
| Lawyer handoff foundation | `KEEP` | Production migration is finished and the deployed foundation is part of the active baseline. | Preserve as production-supported unless a later targeted audit contradicts this. |
| Communication baseline / Outlook provider fields | `KEEP` | Communication baseline and Outlook provider schema are production-applied; Outlook import remains separately gate-off. | Preserve existing gates and do not infer live Outlook/Graph sync. |
| Workload tracking / `workload_records` | `KEEP — narrow internal baseline` | WORKLOAD-RECORDS-INTERNAL-KEEP-DECISION-1 moves only `workload_records` to a narrow internal baseline `KEEP`. Production metadata compare found `workload_records` present-compatible and the repo has active internal workgroup/workload usage. WORKLOAD-RECORDS-HARDEN-1 (`f6836d7`) added conservative `ADMIN` / `PARTNER` authorization for all current workgroup/workload read/write routes. Ordinary authenticated users receive `403 WORKLOAD_ACCESS_FORBIDDEN` before workload DB access. Targeted `workloadRecordsAuthz` tests passed, and full backend validation passed 14 suites / 152 tests. No schema, migration, DB, Azure, frontend, Client Portal, OpenAPI, CORS, or package change is implied. | Keep limited to current internal workgroup/workload routes covered by `f6836d7`. Do not treat as Client Portal, external workload visibility, self-scoped workload views, workgroup membership expansion, export/reporting routes, CP-SCHEMA-1, production apply, DB migration replay, or weakening of the `ADMIN` / `PARTNER` guard. Future external exposure requires a strict internal/external mapper, aggregate-only policy, GDPR/privacy review, and separate tests. |
| Generation drafts | `QUARANTINE` | `generation_drafts` is production-absent and must not be silently included. | Product decision, runtime guard review, and separate clone-proven migration if brought forward. |
| Contracts / generated document templates | `QUARANTINE` | Not read-only; includes template upload, generated document creation/preview, local filesystem storage, `ContractTemplate`/`ContractGeneration` DB reads/writes, persisted `templateData`/file metadata, SharePoint upload, cleanup/delete behavior, and retention/privacy implications. CONTRACTS-HARDEN-1 adds auth-first/default-disabled runtime hardening for contract routes, but this does not enable generation or make the family `KEEP`. | Explicit storage model, SharePoint-only or approved storage policy, retention/delete policy, permission model, audit/privacy review, and targeted route tests for any future enabled behavior. |
| Temporary operational / database administration routes | `QUARANTINE` | Runtime migration/dbcheck/sync endpoints and broadly exposed operational surfaces are not product baseline features. `Backend/src/routes/migrate.ts` and `Backend/src/routes/dbcheck.ts` contain database check/sync and runtime `prisma db push` behavior; current `Backend/src/index.ts` does not register `/api/v1/migrate` or `/api/v1/dbcheck`. TEMP-OPS-HARDEN-1 adds auth-first/default-disabled runtime hardening for these route modules, but this does not make the family `KEEP` or production-ready. Production apply and CP-SCHEMA-1 remain blocked. | Explicit route inventory, full admin-only exposure decision, OpenAPI exposure decision, Azure/prod access review, and separate hardening/removal PR before any future `KEEP`. |
| Client Portal / external client visibility boundary | `QUARANTINE` | `/api/v1/client-portal` is auth-first and remains gate-off with `CLIENT_PORTAL_NOT_ENABLED`; `ENABLE_CLIENT_PORTAL=true` alone is not enough because a separate client-user ownership model is still required. Adjacent matter/time-entry surfaces include clientId/path/query based access and matter/time-entry data that could become externally sensitive if reused for clients. | Explicit client-user identity and ownership model, need-to-know authorization per client/matter/document/time-entry, strict internal/external mapper, no raw internal comments/timeline/audit leakage, feature-flag tests, spoofed clientId/path rejection, OpenAPI exposure decision, and privacy/GDPR review. |
| Document processing / anonymization / rehydration / AI privacy boundary | `QUARANTINE` | Document and AI flows may process privileged legal content and personal data, including upload/download/text extraction, compare/review, anonymization/rehydration, external AI-response import, review-suggestion persistence, legal-analysis text storage, prompts, persisted outputs, timeline logging, and OpenAPI document/anonymization references. DOCUMENT-AI-HARDEN-1 adds auth-first/default-disabled hardening for document processing, anonymization, rehydration, review-suggestion, and legal-analysis routes, but this does not enable document AI or make the family `KEEP`. | Explicit document storage model, approved AI/provider data-processing policy, anonymization and rehydration threat model, no raw privileged/legal/personal content in logs unless approved, retention/delete policy, strict case/document permissions, internal/external field separation, OpenAPI exposure decision, targeted route tests for any future enabled behavior, and GDPR/legal professional secrecy review. |
| Public OpenAPI / Swagger / CORS exposure boundary | `QUARANTINE` | Public unauthenticated API metadata, permissive CORS behavior, or wider-than-runtime/stale OpenAPI paths must not be treated as safe baseline. `Backend/src/index.ts` serves unauthenticated OpenAPI JSON at `/api/v1/openapi.json` and `/openapi.json` and rewrites servers from `WEBSITE_HOSTNAME`; OPENAPI-EXPOSURE-HARDEN-1 sanitizes served API metadata so quarantined/admin/stale operations are not presented as normal production-ready public operations. CORS-EXPOSURE-HARDEN-1 narrows production CORS to explicit configured origins and fail-closed browser behavior while preserving no-Origin server-to-server requests and localhost development origins. Stale Power Apps / connector wording in historical spec artifacts is not current product direction and is not preserved in served public metadata. This does not make the OpenAPI/CORS boundary `KEEP`. Production apply and CP-SCHEMA-1 remain blocked. | Decide final public/internal/admin-only OpenAPI exposure model, prove runtime/spec parity, remove or label any remaining stale/future/ghost paths, confirm final production domain inventory and Azure hostname exposure, confirm production environment settings, and test OpenAPI/CORS exposure before any future `KEEP`. |
| Partial schema drift / code-compatibility leftovers | `QUARANTINE` | Partial/drift schema families and code-compatibility leftovers must not be silently included. PARTIAL-SCHEMA-DRIFT-INVENTORY-1 records a documentation-only inventory in `docs/partial-schema-drift-inventory.md`; PARTIAL-SCHEMA-DRIFT-TRIAGE-1 records documentation-only future work lanes in `docs/partial-schema-drift-triage.md`; PROD-SCHEMA-COMPARE-READONLY-1 records a production metadata-only comparison in `docs/production-schema-readonly-compare.md`; PROD-SCHEMA-COMPARE-TRIAGE-ROLLUP-1 rolls that compare into the triage in `docs/partial-schema-drift-triage.md`. The compare read schema metadata only, read no business data, performed no DB apply/migration, and does not move this family to `KEEP`. Present-compatible metadata does not automatically mean `KEEP`. `GenerationStatus` enum drift is a confirmed CP-SCHEMA-1 blocker because production lacks Prisma `APPROVED` / `REJECTED`. GENERATION-STATUS-ENUM-DRIFT-AUDIT-1 records the docs-only write-path audit in `docs/generation-status-enum-drift-audit.md` and confirms `finalizeContract` is the latent `APPROVED` write path while contracts remain default-disabled/quarantined. GENERATION-STATUS-ENUM-DRIFT-DECISION-1 records the deferred docs-only decision in `docs/generation-status-enum-drift-decision.md`; it does not resolve the drift, authorize implementation, authorize production apply, or authorize CP-SCHEMA-1. Production apply and CP-SCHEMA-1 remain blocked. | Explicit inventory, triage, and production metadata comparison of each partial/drift family, runtime usage review, OpenAPI exposure review where applicable, human decision whether each item is active production/future/dead-code/schema-drift, migration strategy only after baseline stability, targeted tests for kept items, and separate implementation PR for any schema/runtime change. |
| Anonymous documents | `UNKNOWN` | Table exists but Prisma-declared fields are partially absent. | Decide active anonymization persistence scope and required columns. |
| Rehydration fields | `UNKNOWN` | Missing fields on `anonymous_documents`; sensitive workflow. | Decide whether persistent rehydration fields are production-required and prove additive path if brought forward. |
| Client identity fields | `KEEP — narrow internal baseline` | CLIENT-IDENTITY-FIELDS-INTERNAL-KEEP-DECISION-1 moves only the current hardened internal client identity field behavior to narrow internal `KEEP`. Production metadata compare found `clients.taxNumber`, `clients.companyRegistrationNumber`, and `clients.authorizedRepresentative` present-compatible. CLIENT-IDENTITY-FIELDS-HARDEN-1 (`8cea64c`) added authorization/exposure hardening: broad `GET /api/v1/clients` is scoped for non-privileged users to clients linked to cases where they are assigned lawyer, creator, or collaborator; `GET /api/v1/clients/:clientId` requires `ADMIN` / `PARTNER` or related-case access; `POST /api/v1/clients` and `PATCH /api/v1/clients/:clientId` require `ADMIN` / `PARTNER`; Client Portal remains disabled/quarantined. Targeted `clientIdentityFieldsAuthz` tests passed 11/11, and full backend tests passed 16 suites / 172 tests. No schema, migration, DB, Azure, frontend, Client Portal, OpenAPI, CORS, package, or feature-behavior change is implied. `clients.color` KEEP remains separate and does not include identity fields. | KEEP applies only to current internal client routes covered by `8cea64c`. It does not authorize Client Portal, external client identity visibility, future client search/export/report exposure, a broader client ownership model, CP-SCHEMA-1, production apply, schema/migration work, DB migration replay, frontend behavior changes, or weakening related-case read scoping / `ADMIN` / `PARTNER` management guards. Any future external exposure requires a separate internal/external mapper, field allowlist, GDPR/privacy review, and tests. |
| Case client role | `KEEP — narrow internal baseline` | CASES-CLIENT-ROLE-INTERNAL-KEEP-DECISION-1 moves only `cases.clientRole` to narrow internal `KEEP`. Production metadata found `cases.clientRole` present-compatible; CASES-CLIENT-ROLE-SEMANTICS-DECISION-1 selected internal matter-party metadata semantics; CASES-CLIENT-ROLE-INTERNAL-HARDEN-1 (`e2a943a`) added `requireCaseManageAccess`, guarded detail/summary/workflow reads with case-level read access, guarded generic patch/update with case-manager access, removed `clientRole` from the broad case list DTO, and preserved create under existing authenticated create-case rules. Focused authorization/exposure tests exist and full backend validation passed 15 suites / 161 tests. No schema, migration, DB, Azure, frontend, Client Portal, OpenAPI, CORS, package, or feature-behavior change is implied by this decision. | KEEP applies only to current internal `cases.clientRole` behavior covered by `e2a943a`. It does not authorize Client Portal, external visibility, broad list/search/export/report exposure, use as an authorization primitive, CP-SCHEMA-1, production apply, schema/migration work, or weakening `requireCaseManageAccess` / case-level guards. Any future external exposure requires a separate internal/external mapper and GDPR/privacy review. |
| Client color (`clients.color`) | `KEEP` | CLIENTS-COLOR-INTERNAL-KEEP-DECISION-1 moves only `clients.color` to a narrow internal baseline `KEEP`. Production metadata compare found `clients.color` present-compatible; Prisma contains nullable `Client.color`; internal client detail UI edits/displays it as hex visual metadata; case list UI can consume client color metadata for a dot. No Client Portal exposure, external visibility model, sensitive legal/document content, schema migration, DB apply, or production apply is implied. | Keep internal-only. Do not use as Client Portal tenancy, authorization, branding boundary, or external client visibility signal. Future external exposure still requires separate privacy/client-visibility review and DTO tests. |
| Case collaborators | `KEEP — narrow internal baseline` | CASE-COLLABORATORS-INTERNAL-KEEP-DECISION-1 moves only `case_collaborators` to a narrow internal baseline `KEEP`. Production metadata compare found `case_collaborators` present-compatible and the repo has active internal usage. CASE-COLLABORATORS-HARDEN-1 (`7177693`) added case-level authorization for generic collaborator reads, manager-only authorization for create/delete, delete path consistency using path `caseId` plus `collaboratorId`, and targeted tests. CASE-COLLABORATORS-HARDENING-ROLLOUT-1 (`49f2bdc`) documented the hardening closeout. No schema, migration, DB, Azure, frontend, Client Portal, OpenAPI, CORS, or package change is implied. | Keep limited to internal collaborator read/create/delete routes covered by `7177693`. Do not treat as Client Portal, external visibility, CP-SCHEMA-1, production apply, future update/bulk/export routes, authz weakening, or DB migration replay. Future external exposure requires a strict internal/external mapper, GDPR/privacy review, and separate tests. |
| Comparison snapshot | `UNKNOWN` | Missing on `contract_generations`; may be clone-proven additive if kept. | Decide whether comparison snapshots are production-required for current workflows. |
| Timesheet reports / artifacts / presets | `QUARANTINE` | Tables/enums are absent and likely belong to a separate future feature-family migration. | Product approval, privacy/reporting scope, and clone-proven separate migration if brought forward. |
| Legal analyses | `QUARANTINE` | Sensitive work-product tables are absent. | Governance and privacy decision before any bring-forward. |
| Client house style | `QUARANTINE` | Tables/fields are absent; UI references need guard review if quarantined. | Product decision and separate feature migration if approved. |
| Workspace text / `documents.workspaceText` | `SECURITY/PRIVACY BLOCKED` | DOCUMENTS-WORKSPACE-TEXT-PRIVACY-AUDIT-1 created `docs/documents-workspace-text-privacy-audit.md`. Production metadata compare found the field present-compatible, but it stores legal document workspace text for modified working copies. Direct read/write routes are auth-first and default-disabled behind the Document/AI privacy model gate; disabled-route tests prove no service, Prisma write, text extraction, or timeline write while disabled. If enabled, `GET /api/v1/documents/:id/text` can return raw workspace text and `POST /api/v1/documents/:id/save-workspace-version` can persist it. Present-compatible metadata does not make raw legal text `KEEP`. | Keep blocked pending explicit document workspace text privacy model, retention/delete policy, logging redaction, strict case/document permission model, AI/provider rules, Client Portal/public exclusion proof, and targeted route tests before any future enabled behavior. Production apply and CP-SCHEMA-1 remain blocked; Client Portal remains disabled/quarantined. |
| Document review | `QUARANTINE` | Persisted review suggestions are not baseline until explicitly approved; avoid fake automated review or unsupported review persistence claims. | Product/privacy decision and targeted tests before any DB-backed review persistence. |
| Clause library | `QUARANTINE` | `/clause-library` DB-backed production support is not baseline. | Product approval and clean feature migration if approved. |
| Contract assembly | `QUARANTINE` | Depends on clause library baseline and must not be brought forward independently. | Approve clause library first, then separately decide assembly drafts/clauses. |
| CP-SCHEMA-1 / Client Portal foundation | `QUARANTINE` | Future-blocked and excluded from baseline; Client Portal runtime remains off and no existing data becomes client-visible. | Resume only after production-compatible baseline/remediation is stable and a fresh clone proof shows CP as the intentionally next migration. |
| DB-only rolled-back kb/learning/escalation migration | `UNKNOWN` | DB row is rolled back, local migration is missing, and object checks found no active objects. | Decide whether it is abandoned historical state, archived context, or future design work. |

PRESENT-COMPATIBLE-KEEP-CANDIDATES-AUDIT-1 created `docs/present-compatible-keep-candidates-audit.md`. Present-compatible metadata does not automatically promote items to `KEEP`: the audit classified `clients.color` as an internal `KEEP candidate`, `case_collaborators`, `workload_records`, client identity fields, and `cases.clientRole` as `KEEP-BUT-HARDEN candidate`, and `documents.workspaceText` as `SECURITY/PRIVACY BLOCKED`. CLIENTS-COLOR-INTERNAL-KEEP-DECISION-1 moves only `clients.color` from candidate to narrow internal `KEEP`. CASE-COLLABORATORS-AUTHZ-AUDIT-1 recorded required collaborator authorization hardening, CASE-COLLABORATORS-HARDEN-1 hardened the internal collaborator routes, CASE-COLLABORATORS-HARDENING-ROLLOUT-1 documented that closeout without runtime change, and CASE-COLLABORATORS-INTERNAL-KEEP-DECISION-1 moves only the hardened internal read/create/delete collaborator surface to narrow internal `KEEP`. WORKLOAD-RECORDS-INTERNAL-EXPOSURE-AUDIT-1 created `docs/workload-records-exposure-audit.md`, WORKLOAD-RECORDS-HARDEN-1 moved `workload_records` only to `hardened internal KEEP candidate` after conservative `ADMIN` / `PARTNER` route authorization and targeted tests, WORKLOAD-RECORDS-HARDENING-CLOSEOUT-1 documented that closeout without runtime change, and WORKLOAD-RECORDS-INTERNAL-KEEP-DECISION-1 moves only the hardened internal workgroup/workload surface to narrow internal `KEEP`. CLIENT-IDENTITY-AND-ROLE-FIELDS-AUDIT-1 created `docs/client-identity-role-fields-audit.md`; CLIENT-IDENTITY-FIELDS-HARDEN-1 moved client identity fields to `hardened internal KEEP candidate`, not broad `KEEP`, by scoping non-privileged list/detail reads to related-case access, limiting create/update to `ADMIN` / `PARTNER`, and adding targeted authorization tests. CLIENT-IDENTITY-FIELDS-HARDENING-CLOSEOUT-1 documented that evidence, and CLIENT-IDENTITY-FIELDS-INTERNAL-KEEP-DECISION-1 now moves only the hardened internal client-route behavior to `KEEP — narrow internal baseline`, not broad/external/Client Portal `KEEP`. `cases.clientRole` remained `KEEP-BUT-HARDEN candidate` plus `NEEDS PRODUCT DECISION` until CASES-CLIENT-ROLE-SEMANTICS-DECISION-1 created `docs/cases-client-role-semantics-decision.md` and selected Option A, internal matter-party metadata. CASES-CLIENT-ROLE-INTERNAL-HARDEN-1 (`e2a943a`) then hardened internal route authorization and broad-list exposure, moving only `cases.clientRole` to `hardened internal KEEP candidate`; CASES-CLIENT-ROLE-HARDENING-CLOSEOUT-1 documented the evidence chain; CASES-CLIENT-ROLE-INTERNAL-KEEP-DECISION-1 now moves only the hardened internal matter-party metadata behavior to `KEEP — narrow internal baseline`, not broad/external/Client Portal `KEEP`. DOCUMENTS-WORKSPACE-TEXT-PRIVACY-AUDIT-1 confirms `documents.workspaceText` remains `SECURITY/PRIVACY BLOCKED` because it can contain raw privileged legal text and needs a privacy/storage/retention/access model before any future enabled route behavior. The `clients.color` KEEP decision remains separate and does not expand identity-field visibility. Production apply and CP-SCHEMA-1 remain blocked, Client Portal remains disabled/quarantined, and partial schema drift remains `QUARANTINE` unless separately decided.

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
- Whether any future client identity search/export/report route, external mapper, Client Portal exposure, or broader client ownership model should exist. Current client identity `KEEP` is limited to hardened internal client-route behavior only.
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

`cases_client_role_semantics_decision_documented_no_db_change_no_runtime_change`

## 13. DOCUMENTS-WORKSPACE-TEXT-PRIVACY-MODEL-DESIGN-1

- `DOCUMENTS-WORKSPACE-TEXT-PRIVACY-MODEL-DESIGN-1` created `docs/documents-workspace-text-privacy-model.md`.
- `documents.workspaceText` remains **`SECURITY/PRIVACY BLOCKED`**.
- The privacy model defines **prerequisites only**; it does **not** authorize enablement or KEEP.
- Production apply and CP-SCHEMA-1 remain **blocked**.
- Client Portal remains **disabled/quarantined**.
- Document/AI privacy boundary remains **guarded/default-disabled**.
- Recommended immediate next package: `DOCUMENTS-WORKSPACE-TEXT-AUTHZ-HARDEN-1`
  (the audit found reachable-if-enabled read/write routes + broad-response inclusion risk
  needing document/case-level hardening first).

## 14. DOCUMENTS-WORKSPACE-TEXT-AUTHZ-HARDEN-1

- `DOCUMENTS-WORKSPACE-TEXT-AUTHZ-HARDEN-1` added internal authorization/exposure hardening for `documents.workspaceText`.
- The gated raw-text read (`GET /documents/:id/text`) now requires **document/case read access**; the gated write (`POST /documents/:id/save-workspace-version`) now requires **case manage access**. Both remain auth-first and behind the default-disabled Document/AI gate. Reuses the existing case authorization rules (assigned lawyer / creator / privileged role / collaborator). Broad list/detail/search responses already omit raw text (explicit DTOs); tests confirm.
- This **preserves the `SECURITY/PRIVACY BLOCKED` lane**.
- It does **not** authorize KEEP, CP-SCHEMA-1, production apply, external visibility, AI/provider use, or file processing; it does **not** enable Client Portal; it does **not** resolve retention/logging/AI/export privacy blockers.
- Any move out of blocked status requires separate privacy closeout and human decision.

## 15. DOCUMENTS-WORKSPACE-TEXT-AUTHZ-CLOSEOUT-1

- `documents.workspaceText`: **`SECURITY/PRIVACY BLOCKED`**, **authz-hardened after `d3f6bea`**.
- Production metadata: **present-compatible**.
- Raw-text routes remain **default-disabled behind the Document/AI gate**.
- Read (`GET /documents/:id/text`) and write (`POST /documents/:id/save-workspace-version`)
  now require **document/case read access** and **case manage access** respectively.
- Broad responses **omit** raw text (`getCaseDocuments`, `searchDocuments`, `getDocumentById`, case-detail).
- **Not KEEP.**
- Required before any candidate review: retention design/implementation; logging guard;
  AI/provider gate review; export/SharePoint review; external/Client Portal exclusion;
  explicit human privacy decision.
- **Production apply and CP-SCHEMA-1 remain blocked.**

## 16. DOCUMENTS-WORKSPACE-TEXT-RETENTION-DESIGN-1

- `documents.workspaceText`: **`SECURITY/PRIVACY BLOCKED`**, **authz-hardened and retention-designed**.
- Retention design created (`docs/documents-workspace-text-retention-design.md`), but **not implemented**. Conservative default: raw text stays blocked; future default should be **ephemeral/short-lived, not durable**, unless a separate explicit human decision selects durable storage.
- Remaining blockers:
  - logging guard;
  - retention implementation (only if durable storage is ever allowed);
  - AI/provider gate review;
  - export/SharePoint review;
  - external/Client Portal exclusion;
  - explicit human privacy decision.
- **Not KEEP.**
- **Production apply and CP-SCHEMA-1 remain blocked.**

## 17. DOCUMENTS-WORKSPACE-TEXT-LOGGING-GUARD-DESIGN-1

- `documents.workspaceText`: **`SECURITY/PRIVACY BLOCKED`**, **authz-hardened, retention-designed, logging-guard-designed**.
- Logging guard is **design only** (`docs/documents-workspace-text-logging-guard-design.md`), **not implemented**.
- **Not KEEP.**
- Remaining blockers: logging implementation/proof; AI/provider gate review; export/SharePoint review; external/Client Portal mapper exclusion; explicit human privacy decision; retention implementation (only if durable storage is ever allowed).
- **Production apply and CP-SCHEMA-1 remain blocked.**

## 18. DOCUMENTS-WORKSPACE-TEXT-LOGGING-GUARD-IMPLEMENTATION-1

- `documents.workspaceText`: **`SECURITY/PRIVACY BLOCKED`**, **authz-hardened, retention-designed, logging-guard-designed, and logging-guard-implemented**.
- `DOCUMENTS-WORKSPACE-TEXT-LOGGING-GUARD-IMPLEMENTATION-1` added runtime/test proof for content-free logging/error behavior on the two raw-text routes (`safeWorkspaceTextLogContext`; catch blocks no longer log the raw error object). `documentsWorkspaceTextAuthz` now 13/13.
- **Not KEEP.** This does not authorize CP-SCHEMA-1, production apply, Document/AI enablement, Client Portal, AI/provider use, export, SharePoint, or retention implementation.
- Remaining blockers: AI/provider gate review; export/SharePoint review; external/Client Portal mapper exclusion; explicit human privacy decision; retention implementation (only if durable storage is ever allowed).
- **Production apply and CP-SCHEMA-1 remain blocked.**

## 19. DOCUMENTS-WORKSPACE-TEXT-AI-GATE-REVIEW-1

- `documents.workspaceText`: **`SECURITY/PRIVACY BLOCKED`**, **authz-hardened, retention-designed, logging-guard-implemented, and AI/provider-gate-reviewed**.
- `DOCUMENTS-WORKSPACE-TEXT-AI-GATE-REVIEW-1` reviewed and regression-proofed the AI/provider/prompt gate boundary. **No AI/provider call was made; no provider credential added; no feature flag enabled.**
- **Finding:** the backend has **no in-code AI provider client**; the only prompt-construction path (`anonymizeDocument`'s `aiReadyPrompt`) is fed only anonymized/redacted content and is gated by `ENABLE_AI_ANONYMIZATION && ENABLE_DOCUMENT_AI_PRIVACY_MODEL`. Raw `workspaceText` is read only in the two gated document routes (`ENABLE_DOCUMENT_PROCESSING && ENABLE_DOCUMENT_AI_PRIVACY_MODEL`, auth-first then authz) and is wired to **no** prompt/provider path — no runtime hardening was required. Added `Backend/tests/documentsWorkspaceTextAiGate.test.ts` as regression proof (gate-off, legacy-flags-only, fully-enabled non-forwarding, static no-provider-import).
- **Not KEEP.** This does not authorize CP-SCHEMA-1, production apply, Document/AI enablement, Client Portal, AI/provider use, export, SharePoint, or retention implementation.
- Remaining blockers: export/SharePoint review; external/Client Portal mapper exclusion; explicit human privacy decision; retention implementation (only if durable storage is ever allowed); and — before any AI use — an explicit privacy decision, anonymization/redaction rule, and provider DPA/region/retention model.
- **Production apply and CP-SCHEMA-1 remain blocked.**

## 20. DOCUMENTS-WORKSPACE-TEXT-EXPORT-SHAREPOINT-REVIEW-1

- `documents.workspaceText`: **`SECURITY/PRIVACY BLOCKED`**, **authz-hardened, retention-designed, logging-guard-implemented, AI/provider-gate-reviewed, and export/SharePoint/generated-document-boundary-reviewed**.
- `DOCUMENTS-WORKSPACE-TEXT-EXPORT-SHAREPOINT-REVIEW-1` reviewed export/download, SharePoint/upload, generated-document, contract, anonymize/rehydrate artifact, legal-analysis, public metadata, and Client Portal boundaries. **No SharePoint/Graph call, upload, download, export, file processing, document generation, AI/provider call, DB query, migration, deploy, or Azure action was made.**
- **Finding:** raw `workspaceText` remains read/persisted only by the two gated document workspace routes (`GET /documents/:id/text`, `POST /documents/:id/save-workspace-version`). Document download/version/upload paths use explicit file buffers or SharePoint item IDs; contracts use template data and generated local files; anonymize/rehydrate save paths use redacted/rehydrated artifact content; public metadata and Client Portal remain sanitized/blocked. No inspected export/download/SharePoint/generated-document path silently consumes raw `workspaceText`, so no runtime hardening was required.
- **Not KEEP.** This does not authorize CP-SCHEMA-1, production apply, Document/AI enablement, Client Portal, SharePoint/Graph/file-processing/export enablement, or generated-document use of raw workspace text.
- Remaining blockers: external/Client Portal mapper exclusion; explicit human privacy decision; retention implementation (only if durable storage is ever allowed); and any future export/SharePoint/generated-document use requires a sanitized artifact boundary, explicit authorization, feature/privacy gate, logging guard, retention/delete rules, and targeted tests.
- **Production apply and CP-SCHEMA-1 remain blocked.**

## 21. DOCUMENTS-WORKSPACE-TEXT-EXTERNAL-MAPPER-REVIEW-1

- `documents.workspaceText`: **`SECURITY/PRIVACY BLOCKED`**, **authz-hardened,
  retention-designed, logging-guard-implemented, AI/provider-gate-reviewed,
  export/SharePoint/generated-document-boundary-reviewed, and external/client/public
  mapper-reviewed**.
- `DOCUMENTS-WORKSPACE-TEXT-EXTERNAL-MAPPER-REVIEW-1` reviewed external/API, Client
  Portal, public OpenAPI, communications, contracts, case summary/workflow, and document
  metadata mapper boundaries. **No Client Portal/public API enablement, DB query, file
  processing, AI/provider call, SharePoint/Graph call, migration, deploy, or Azure action
  was made.**
- **Finding:** no inspected external/client/public mapper silently includes raw
  `workspaceText`. The raw field remains isolated to the two gated workspace routes;
  broad document list/detail/search DTOs, case document/summary/workflow DTOs,
  communication rows, contract-generation metadata, and public OpenAPI metadata use
  explicit allow-lists, IDs, or artifact metadata instead of raw workspace text. Client
  Portal remains disabled before mapper/Prisma work.
- **Not KEEP.** This does not authorize CP-SCHEMA-1, production apply, Document/AI
  enablement, Client Portal enablement, external/public API exposure, export,
  SharePoint/Graph use, or generated-document use of raw workspace text.
- Remaining blockers: explicit human privacy decision; retention implementation only if
  durable storage is ever allowed; and any future Client Portal/external/public/export use
  requires a sanitized publication/artifact boundary, explicit field allow-list mapper,
  ownership/need-to-know authorization, feature/privacy gate, logging guard,
  retention/delete rules, and targeted tests.
- **Production apply and CP-SCHEMA-1 remain blocked.**

## 22. Final blocked closeout — DOCUMENTS-WORKSPACE-TEXT-PRIVACY-BLOCKED-CLOSEOUT-1

- **Commit chain:** `cf61011`, `4110b1f`, `d3f6bea`, `f4e60aa`, `c136a34`,
  `5c9b3ca`, `52fe3d6`, `cee359f`, `7133d2c`, and `f19c9fe`.
- `documents.workspaceText` remains **`SECURITY/PRIVACY BLOCKED`**. It is now reviewed
  and/or hardened across authorization, logging, AI/provider, export/SharePoint/generated
  document, and external/client/public mapper boundaries, but this does **not** make it
  `KEEP`, `KEEP-BUT-HARDEN`, production-ready, or safe for enablement.
- The only raw-text routes remain `GET /documents/:id/text` and
  `POST /documents/:id/save-workspace-version`; both are auth-first, behind the
  default-disabled Document/AI gate, and require document/case read access or case manage
  access respectively.
- Broad internal DTOs omit `workspaceText`; external/client/public mappers were reviewed
  with no silent exposure; Client Portal remains disabled/quarantined and must not reuse
  raw internal text without a future sanitized publication/artifact model.
- AI/provider use, SharePoint/Graph/export/generated-document use, durable retention, and
  Document/AI flag enablement are **not authorized**. Retention is designed only; there is
  no retention implementation, legal-hold workflow, or human legal/privacy decision for
  durable storage.
- `documents.workspaceText` remains outside the narrow internal KEEP baseline
  (`clients.color`, `case_collaborators`, `workload_records`, `cases.clientRole`, and
  client identity fields).
- **Production apply and CP-SCHEMA-1 remain blocked.** Any future move requires a separate
  human decision and likely a separate implementation package.

## 23. Production-compatible baseline final rollup

- `PRODUCTION-COMPATIBLE-BASELINE-FINAL-ROLLUP-1` created
  `docs/production-compatible-baseline-final-rollup.md`.
- The final narrow internal KEEP baseline remains limited to `clients.color`,
  `case_collaborators`, `workload_records`, `cases.clientRole`, and client identity
  fields, each only within its documented internal boundary.
- `documents.workspaceText` remains **`SECURITY/PRIVACY BLOCKED`** and outside the narrow
  internal KEEP baseline.
- Quarantined families remain quarantined, including Client Portal / external visibility,
  Document/AI privacy boundary, contracts / generated documents, temporary ops / DB admin
  routes, OpenAPI / CORS exposure boundary, partial schema drift leftovers, CP-SCHEMA-1,
  and production apply.
- **Production apply and CP-SCHEMA-1 remain blocked.** This rollup does not authorize DB
  apply, migration creation/application, Client Portal, Document/AI, AI/provider use,
  SharePoint/export, external visibility, or Azure/deployment work.

## 24. Production apply NO-GO reconfirmation

- `PRODUCTION-APPLY-NO-GO-RECONFIRM-1` created
  `docs/production-apply-no-go-reconfirmation.md`.
- Production apply remains **NO-GO**.
- No production database mutation, schema migration, DB push, DB metadata refresh, Azure
  deployment, or Azure app setting change is authorized.
- CP-SCHEMA-1 remains **blocked** and is not authorized by the narrow internal KEEP
  baseline, the final rollup, or this NO-GO reconfirmation.

## 25. Client Portal product boundary design

- `CLIENT-PORTAL-PRODUCT-BOUNDARY-DESIGN-1` created
  `docs/client-portal-product-boundary-design.md`.
- The document defines product and privacy boundaries for a future Client Portal only.
- Client Portal remains **disabled/quarantined**.
- CP-SCHEMA-1 and production apply remain **blocked**.
- No external visibility, Client Portal runtime, schema migration, DB apply, Azure
  deployment, Document/AI enablement, AI/provider use, SharePoint/export use, or
  `documents.workspaceText` exposure is authorized.

## 26. Client Portal current code inventory

- `CLIENT-PORTAL-CURRENT-CODE-INVENTORY-1` created
  `docs/client-portal-current-code-inventory.md`.
- Current backend code is a mounted, auth-first, disabled/quarantined skeleton under
  `/api/v1/client-portal`; no `Backend/src/modules/client-portal` service module or
  dedicated frontend portal route was found in the focused inventory.
- Existing tests prove unauthenticated requests return `401`, authenticated disabled
  requests return `501 CLIENT_PORTAL_NOT_ENABLED`, `ENABLE_CLIENT_PORTAL=true` alone is
  insufficient, spoofed user/client context remains blocked, and Prisma is not reached
  while disabled.
- No enablement is authorized. CP-SCHEMA-1 and production apply remain **blocked**.

## 27. Client Portal V1 data contract design

- `CLIENT-PORTAL-V1-DATA-CONTRACT-DESIGN-1` created
  `docs/client-portal-v1-data-contract-design.md`.
- The design defines conceptual allow-list DTOs, forbidden fields, grant boundaries,
  mapper requirements, and future tests for a possible V1 Client Portal contract.
- It is documentation-only and does **not** authorize runtime implementation, schema
  change, migration creation/application, CP-SCHEMA-1, production apply, OpenAPI/CORS
  exposure, Azure changes, frontend work, file processing, SharePoint/Graph calls,
  AI/provider use, or Client Portal enablement.
- External visibility remains unauthorized; the current Client Portal remains
  disabled/quarantined; CP-SCHEMA-1 and production apply remain **blocked**.

## 28. Client Portal authorization model design

- `CLIENT-PORTAL-AUTHZ-MODEL-DESIGN-1` created
  `docs/client-portal-authz-model-design.md`.
- The design defines conceptual external portal principals, active portal-user checks,
  matter grants, document shares, upload request grants, client-facing task grants,
  deferred message/thread grants, revocation, non-enumeration, and future tests.
- It is documentation-only and does **not** authorize runtime implementation, schema
  change, migration creation/application, CP-SCHEMA-1, production apply, OpenAPI/CORS
  exposure, Azure changes, frontend work, file processing, SharePoint/Graph calls,
  AI/provider use, auth changes, or Client Portal enablement.
- External visibility remains unauthorized; the current Client Portal remains
  disabled/quarantined; CP-SCHEMA-1 and production apply remain **blocked**.

## 29. Client Portal V1 UI/IA design

- `CLIENT-PORTAL-V1-UI-IA-DESIGN-1` created
  `docs/client-portal-v1-ui-ia-design.md`.
- The design defines a future client-facing information architecture for Home, Matters,
  Documents, Uploads/Requests, deferred Messages, and optional Profile/Contact screens,
  with DTO dependencies, forbidden content, empty states, disabled states, and privacy
  checklists.
- It is documentation-only and does **not** authorize frontend implementation, runtime
  implementation, schema change, migration creation/application, CP-SCHEMA-1, production
  apply, OpenAPI/CORS exposure, Azure changes, file processing, SharePoint/Graph calls,
  AI/provider use, auth changes, or Client Portal enablement.
- External visibility remains unauthorized; the current Client Portal remains
  disabled/quarantined; CP-SCHEMA-1 and production apply remain **blocked**.

## 30. Client Portal schema readiness design

- `CLIENT-PORTAL-SCHEMA-READINESS-DESIGN-1` created
  `docs/client-portal-schema-readiness-design.md`.
- The design maps future portal identity, memberships, grants, sanitized publications,
  document shares, upload requests, uploaded-file metadata, client-facing tasks, deferred
  messages, external-safe identifiers, retention, and content-free audit into schema
  readiness requirements.
- It is documentation-only and does **not** authorize `schema.prisma` edits, migration
  creation/application, CP-SCHEMA-1, production apply, runtime implementation, frontend
  implementation, OpenAPI/CORS exposure, Azure changes, file processing, SharePoint/Graph
  calls, AI/provider use, auth changes, or Client Portal enablement.
- External visibility remains unauthorized; the current Client Portal remains
  disabled/quarantined; CP-SCHEMA-1 and production apply remain **blocked**.

## 31. Client Portal runtime skeleton harden design

- `CLIENT-PORTAL-RUNTIME-SKELETON-HARDEN-DESIGN-1` created
  `docs/client-portal-runtime-skeleton-harden-design.md`.
- The design defines future Client Portal runtime skeleton boundaries for disabled gate
  order, route/module split, service access, portal authorization, external mappers,
  content-free audit/logging, OpenAPI posture, and tests.
- It is documentation-only and does **not** authorize runtime implementation, frontend
  implementation, schema change, migration creation/application, CP-SCHEMA-1, production
  apply, OpenAPI/CORS exposure, Azure changes, file processing, SharePoint/Graph calls,
  AI/provider use, auth changes, or Client Portal enablement.
- External visibility remains unauthorized; the current Client Portal remains
  disabled/quarantined; CP-SCHEMA-1 and production apply remain **blocked**.

## 32. Client Portal frontend shell design

- `CLIENT-PORTAL-FRONTEND-SHELL-DESIGN-1` created
  `docs/client-portal-frontend-shell-design.md`.
- The design defines future `/portal` route structure, a separate client-facing shell,
  safe components, visual reuse policy, mock/static data rules, disabled/unavailable
  states, conceptual API-client rules, accessibility/tone guidance, and future frontend
  tests.
- It is documentation-only and does **not** authorize frontend implementation, runtime
  implementation, schema change, migration creation/application, CP-SCHEMA-1, production
  apply, OpenAPI/CORS exposure, Azure changes, file processing, SharePoint/Graph calls,
  AI/provider use, auth changes, or Client Portal enablement.
- External visibility remains unauthorized; the current Client Portal remains
  disabled/quarantined; CP-SCHEMA-1 and production apply remain **blocked**.

## 33. Client Portal design rollup

- `CLIENT-PORTAL-DESIGN-ROLLUP-1` created `docs/client-portal-design-rollup.md`.
- The rollup consolidates the Client Portal product boundary, current code inventory,
  V1 data contract, authorization/grant model, UI/IA, schema readiness, runtime skeleton
  boundary, and frontend shell.
- It is documentation-only and does **not** authorize frontend implementation, backend
  implementation, runtime changes, schema changes, migration creation/application,
  CP-SCHEMA-1, production apply, OpenAPI/CORS exposure, Azure changes, file processing,
  SharePoint/Graph calls, AI/provider use, auth changes, or Client Portal enablement.
- External visibility remains unauthorized; the current Client Portal remains
  disabled/quarantined; CP-SCHEMA-1 and production apply remain **blocked**.
- Safe next implementation candidate, if a human explicitly approves code changes, is
  `CLIENT-PORTAL-FRONTEND-SHELL-MOCK-IMPLEMENTATION-1` with synthetic/mock data only and
  no backend/schema enablement.

## 34. Client Portal frontend mock shell implementation

- `CLIENT-PORTAL-FRONTEND-SHELL-MOCK-IMPLEMENTATION-1` added a static/mock frontend shell
  at `/portal` using synthetic data only.
- The shell demonstrates a client-facing home, matter cards, safe next actions, shared
  document metadata, upload request cards, responsible lawyer display, deferred states,
  and disabled mock actions.
- It does **not** call backend APIs, does **not** import internal case/document/task API
  functions, does **not** use real client/case/document data, and does **not** expose
  `documents.workspaceText`.
- It does **not** authorize backend implementation, backend enablement, external
  visibility, schema changes, migration creation/application, CP-SCHEMA-1, production
  apply, OpenAPI/CORS exposure, Azure changes, SharePoint/Graph calls, AI/provider use,
  auth changes, real upload/download, or Client Portal enablement.
- External visibility remains unauthorized; the current Client Portal backend remains
  disabled/quarantined; CP-SCHEMA-1 and production apply remain **blocked**.

## 35. Client Portal frontend mock shell safety polish

- `CLIENT-PORTAL-FRONTEND-MOCK-SHELL-SAFETY-POLISH-1` reviewed and polished the static/mock
  `/portal` shell.
- The polish keeps the shell frontend-only, synthetic-data-only, and API-free while making
  the development-preview notice, "Figyelmet igényel" hierarchy, metadata-only document
  display, inactive upload/download actions, and deferred messages/profile states clearer.
- It does **not** call backend APIs, does **not** import internal case/document/task API
  functions, does **not** use real client/case/document data, and does **not** expose
  `documents.workspaceText`.
- It does **not** authorize backend implementation, backend enablement, external visibility,
  schema changes, migration creation/application, CP-SCHEMA-1, production apply,
  OpenAPI/CORS exposure, Azure changes, SharePoint/Graph calls, AI/provider use, auth
  changes, real upload/download, or Client Portal enablement.
- External visibility remains unauthorized; the current Client Portal backend remains
  disabled/quarantined; CP-SCHEMA-1 and production apply remain **blocked**.

## 36. Client Portal frontend mock subroutes

- Static/mock frontend subroutes were added for `/portal/matters`,
  `/portal/matters/[matterId]`, `/portal/documents`, and `/portal/uploads`.
- They use synthetic mock data only and remain API-free, with no internal API imports and
  no backend Client Portal calls.
- They do **not** authorize backend implementation, backend enablement, external
  visibility, schema changes, migration creation/application, CP-SCHEMA-1, production
  apply, OpenAPI/CORS exposure, Azure changes, SharePoint/Graph calls, AI/provider use,
  auth changes, real upload/download, message implementation, or Client Portal enablement.
- External visibility remains unauthorized; the current Client Portal backend remains
  disabled/quarantined; CP-SCHEMA-1 and production apply remain **blocked**.

## 37. Client Portal frontend mock routes safety closeout

- `CLIENT-PORTAL-FRONTEND-MOCK-ROUTES-SAFETY-CLOSEOUT-1` reviewed the static/mock Client
  Portal route tree: `/portal`, `/portal/matters`, `/portal/matters/[matterId]`,
  `/portal/documents`, and `/portal/uploads`.
- The route tree remains frontend-only and synthetic-only, with no backend API calls,
  no internal API imports, no `workspaceText`, no real client/case/document data, no file
  input, no real form submission, no active upload/download/message behavior, and no
  internal app navigation links.
- No backend/schema/migration/DB/Azure/auth/OpenAPI/CORS changes were made or authorized.
- Client Portal backend remains disabled/quarantined; external visibility remains
  unauthorized; CP-SCHEMA-1 and production apply remain **blocked**.

## 38. Client Portal runtime skeleton hardening

- `CLIENT-PORTAL-RUNTIME-SKELETON-HARDEN-1` created a disabled-only backend module
  boundary under `Backend/src/modules/client-portal`.
- The backend remains disabled/quarantined and auth-first. Authenticated requests still
  return `501 CLIENT_PORTAL_NOT_ENABLED` before Prisma/service access.
- `ENABLE_CLIENT_PORTAL` alone remains insufficient, and the ownership-model flag alone
  is not enough without the explicit runtime-readiness gate.
- No schema, migration, DB, Prisma business access, frontend API integration, external
  visibility, OpenAPI/CORS exposure, Azure change, CP-SCHEMA-1 readiness, production
  apply readiness, upload/download, or message implementation is authorized.

## 39. Client Portal runtime skeleton closeout

- `CLIENT-PORTAL-RUNTIME-SKELETON-CLOSEOUT-1` documented the post-hardening backend
  skeleton state.
- Backend module boundary exists under `Backend/src/modules/client-portal`, while
  `Backend/src/routes/clientPortal.ts` remains a compatibility re-export.
- `ENABLE_CLIENT_PORTAL_RUNTIME_READY` is the additional runtime-readiness gate; neither
  `ENABLE_CLIENT_PORTAL` alone nor `ENABLE_CLIENT_PORTAL_OWNERSHIP_MODEL` is sufficient
  to make the backend live.
- No enablement, schema change, migration, DB access, Prisma business access, frontend API
  integration, external visibility, OpenAPI/CORS exposure, Azure change, upload/download,
  message implementation, CP-SCHEMA-1 readiness, or production apply readiness is
  authorized.
- Client Portal backend remains disabled/quarantined; external visibility remains
  unauthorized; CP-SCHEMA-1 and production apply remain **blocked**.

## 40. Client Portal DTO types foundation

- `CLIENT-PORTAL-DTO-TYPES-FOUNDATION-1` added frontend-local, type-only V1 DTOs for the static/mock Client Portal shell and aligned the existing synthetic mock data to those DTOs.
- This does **not** add backend API implementation, frontend API integration, live fetches, real client/case/document data, schema/migration/DB changes, Prisma business access, OpenAPI/CORS exposure, Azure changes, upload/download/message implementation, or Client Portal enablement.
- The DTOs remain allow-list only and do not authorize `documents.workspaceText`, internal notes, internal task board data, workload records, collaborators, legal analyses, AI prompt/output internals, audit logs, admin/ops data, internal communications, storage paths, SharePoint paths, internal review comments, or raw document content.
- Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; CP-SCHEMA-1 and production apply remain **blocked**.

## 41. Client Portal frontend mock UX polish

- `CLIENT-PORTAL-FRONTEND-MOCK-UX-POLISH-1` polished the static/mock Client Portal route tree while preserving the disabled, synthetic-only posture.
- The route tree remains frontend-only, synthetic-data-only, typed against frontend-local Portal V1 DTO types, and API-free, with no backend API calls, internal API imports, file input, form submission, upload/download/message implementation, or real client/case/document data.
- No backend/schema/migration/DB/Prisma business access, OpenAPI/CORS exposure, Azure change, external visibility, CP-SCHEMA-1 readiness, production apply readiness, or Client Portal backend enablement is authorized.
- Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; CP-SCHEMA-1 and production apply remain **blocked**.

## 42. Client Portal frontend mock UX closeout

- `CLIENT-PORTAL-FRONTEND-MOCK-UX-CLOSEOUT-1` reviewed the polished static/mock Client Portal route tree.
- The route tree remains frontend-only, synthetic-only, typed against frontend-local Portal V1 DTO types, and API-free.
- No backend API calls, internal API imports, `documents.workspaceText`, file input, real form action, active upload/download/message implementation, real client/case/document data, backend/schema/migration/DB/Prisma business access, Azure change, OpenAPI/CORS change, package change, auth change, or production behavior change was made.
- Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; CP-SCHEMA-1 and production apply remain **blocked**.

## 43. Client Portal implementation checkpoint

- `CLIENT-PORTAL-IMPLEMENTATION-CHECKPOINT-1` created `docs/client-portal-implementation-checkpoint.md`.
- The checkpoint confirms Client Portal remains mock frontend plus disabled backend skeleton only; it is not live, not DB-backed, not externally visible, not API-integrated, not production-enabled, and not CP-SCHEMA-1 ready.
- No enablement, schema change, migration, DB access, Prisma business access, frontend API integration, backend API implementation, external visibility, OpenAPI/CORS exposure, Azure change, upload/download/message implementation, CP-SCHEMA-1 readiness, or production apply readiness is authorized.
- Safest next candidate, if work continues, is `CLIENT-PORTAL-MOCK-FRONTEND-ACCESSIBILITY-PASS-1` because it remains frontend-only and avoids API/schema risk.

## 44. Client Portal mock frontend accessibility pass

- `CLIENT-PORTAL-MOCK-FRONTEND-ACCESSIBILITY-PASS-1` improved accessibility and responsive review quality of the static/mock Client Portal route tree.
- It remains frontend-only, synthetic-only, typed against frontend-local Portal V1 DTO types, and API-free.
- No backend API calls, internal API imports, `documents.workspaceText`, file input, real form action, active upload/download/message implementation, real client/case/document data, backend/schema/migration/DB/Prisma business access, Azure change, OpenAPI/CORS change, package change, auth change, or production behavior change was made.
- Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; CP-SCHEMA-1 and production apply remain **blocked**.

## 45. Client Portal mock frontend accessibility closeout

- `CLIENT-PORTAL-MOCK-FRONTEND-ACCESSIBILITY-CLOSEOUT-1` completed the docs-only closeout of the frontend accessibility pass (`f8c63de`) for the static/mock Client Portal route tree.
- **No runtime, backend, schema, migration, DB, Azure, OpenAPI, CORS, auth, package, API-integration, or external-visibility change was authorized or made.** The closeout is documentation-only.
- Safety re-verified across the portal route tree: no `fetch(`, `@/lib/api`, `documents.workspaceText`, `type="file"`, form action, or internal app-module imports; no backend/schema/migration file required changes.
- Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked**.

## 46. Client Portal backend disabled DTO/mapper stubs

- `CLIENT-PORTAL-BACKEND-DISABLED-DTO-STUBS-1` added a **backend-local DTO/mapper-boundary foundation only** in `Backend/src/modules/client-portal/` (`types.ts` allow-list V1 DTO interfaces; `mappers.ts` pure disabled-safe mappers; `tests/clientPortalDtoMappers.test.ts`).
- DTOs are explicit allow-list only (no `workspaceText`, raw/extracted text, storage/SharePoint paths, internal notes, workload, collaborators, AI/analysis internals, or audit data). Mappers take local explicit source shapes (not Prisma models, not internal DTOs), return explicit fields only (no spread), import no Prisma, run no DB query, and access no `workspaceText`. Tests prove forbidden fields are dropped and no Prisma/DB access exists.
- **No API implementation, no Prisma/DB business access, no schema/migration, no frontend API integration.** Mappers are not wired into any live route; existing disabled `401`/`501 CLIENT_PORTAL_NOT_ENABLED` behavior and the `ENABLE_CLIENT_PORTAL` + `ENABLE_CLIENT_PORTAL_OWNERSHIP_MODEL` + `ENABLE_CLIENT_PORTAL_RUNTIME_READY` triple gate are unchanged (no flag weakened).
- Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked**.

## 47. Client Portal backend DTO stubs closeout

- `CLIENT-PORTAL-BACKEND-DTO-STUBS-CLOSEOUT-1` completed the docs-only closeout of the backend DTO/mapper foundation (`3bdab60`).
- Confirmed: backend-local allow-list DTO types and pure mapper stubs exist; mappers use local explicit source shapes, import no Prisma, run no DB query, access no `workspaceText`, and are not wired into any live route. The active runtime remains the `401`/`501 CLIENT_PORTAL_NOT_ENABLED` disabled boundary, and the triple runtime-ready gate is unchanged.
- **No runtime enablement, schema, migration, DB, frontend API integration, external visibility, CP-SCHEMA-1, or production apply is authorized.** Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked**.

## 48. Client Portal schema candidate design 2

- `CLIENT-PORTAL-SCHEMA-CANDIDATE-DESIGN-2` completed a docs-only refined schema candidate model (`docs/client-portal-schema-candidate-design-2.md`): candidate portal tables, existing-model relationships, fields/indexes/constraints, revocation/visibility/retention fields, migration risks, and a CP-SCHEMA-1 readiness checklist.
- **No `schema.prisma` edit, migration, DB, CP-SCHEMA-1, production apply, runtime API, or external visibility is authorized.** `schema.prisma` was inspected for alignment only (the inert CP-SCHEMA-1 candidate block); it was not edited.
- Client Portal remains mock frontend + disabled backend skeleton only; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked (NO-GO)**.

## 49. Client Portal backend service stubs design

- `CLIENT-PORTAL-BACKEND-DISABLED-SERVICE-STUBS-DESIGN-1` completed a docs-only design of the future backend service boundary (`docs/client-portal-backend-service-stubs-design.md`): conceptual service files/functions, the authorization-before-service order (auth → feature gate → runtime-ready gate → principal resolution → active-user check → explicit grant check → query → explicit select → mapper → content-free audit), candidate data dependencies, forbidden service behavior, and required future tests.
- **No backend service implementation, schema, migration, DB, runtime API, frontend API integration, external visibility, CP-SCHEMA-1, or production apply is authorized.** No backend runtime code was created or changed; DTO mappers remain unwired; the route boundary stays `401`/`501 CLIENT_PORTAL_NOT_ENABLED` and the triple runtime-ready gate is unchanged (no flag weakened).
- Client Portal remains mock frontend + disabled backend skeleton only; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked (NO-GO)**.

## 50. Client Portal mock demo review pass

- `CLIENT-PORTAL-MOCK-DEMO-REVIEW-PASS-1` reviewed the static/mock Client Portal route tree as a stakeholder demo surface and confirmed it is demo-ready (dev-preview/synthetic notice on every screen, disabled/deferred actions labelled, metadata-only documents, non-functional uploads, non-enumerating unknown-matter state, client-facing Hungarian copy, navigation separate from the internal app). One small frontend semantic consistency fix: added `aria-disabled="true"` (+ disabled cursor/opacity) to the two inline disabled buttons on the portal home page.
- **The review remained frontend-only and synthetic-only.** No backend service implementation, schema, migration, DB, API integration, external visibility, CP-SCHEMA-1, or production apply was authorized; no `fetch`/`@/lib/api`/file input/form/upload/download/message/internal-app-component reuse was introduced.
- Client Portal remains mock frontend + disabled backend skeleton only; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked (NO-GO)**.

## 51. Client Portal backend disabled service stubs

- `CLIENT-PORTAL-BACKEND-DISABLED-SERVICE-STUBS-1` added **disabled backend service stubs only** (`Backend/src/modules/client-portal/services.ts` + `Backend/tests/clientPortalServiceStubs.test.ts`). Every stub **fails closed** with `CLIENT_PORTAL_SERVICE_NOT_IMPLEMENTED` (status `501`, content-free message); the optional operation name carries no user data/content.
- **Services are not wired into routes.** `routes.ts` neither imports nor invokes the stubs; the runtime remains `401`/`501 CLIENT_PORTAL_NOT_ENABLED` and the `ENABLE_CLIENT_PORTAL` + `ENABLE_CLIENT_PORTAL_OWNERSHIP_MODEL` + `ENABLE_CLIENT_PORTAL_RUNTIME_READY` triple gate is unchanged (no flag weakened). Stubs import no Prisma/`@prisma/client`, run no DB query, call no mapper, and import no internal case/document/task service or DTO.
- **No Prisma/DB access, no schema/migration, no frontend API integration, no upload/download/message implementation.** Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked (NO-GO)**.

## 52. Client Portal backend disabled route matrix

- `CLIENT-PORTAL-BACKEND-DISABLED-ROUTE-MATRIX-1` added **disabled Client Portal V1 route placeholders only** to `Backend/src/modules/client-portal/routes.ts` (`/me`, `/matters`, `/matters/:matterRef`, `/matters/:matterRef/documents`, `/documents/:documentRef`, `/tasks`, `/tasks/:taskRef/complete`, `/uploads`; deferred `/uploads/:uploadRequestRef/files`, `/messages`, `/messages/:threadRef/replies`).
- **The route matrix is inert and auth-first.** Authenticated route calls still return `501 CLIENT_PORTAL_NOT_ENABLED` (unauthenticated `401`); handlers call **no service, mapper, Prisma, or DB** and return no synthetic data. Flag insufficiency is unchanged — `ENABLE_CLIENT_PORTAL` + `ENABLE_CLIENT_PORTAL_OWNERSHIP_MODEL` + `ENABLE_CLIENT_PORTAL_RUNTIME_READY` triple gate unchanged (no flag weakened). Tests (`Backend/tests/clientPortalDisabledRouteMatrix.test.ts`) prove the matrix is inert; existing `routeFeatureGuards` tests still pass.
- **No schema/migration, no frontend API integration, no upload/download/message implementation.** Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked (NO-GO)**.

## 53. Client Portal inert API shell checkpoint

- `CLIENT-PORTAL-INERT-API-SHELL-CHECKPOINT-1` completed a docs-only checkpoint (`docs/client-portal-inert-api-shell-checkpoint.md`) of the current inert Client Portal API shell: frontend mock shell + inert backend route matrix + fail-closed service stubs (DTO/mappers unwired). Backend tests are 21 suites / 229 tests.
- **The shell is not a live portal.** Routes remain `401`/`501 CLIENT_PORTAL_NOT_ENABLED`; service stubs fail closed; no route calls a service, mapper, or Prisma; DTOs/mappers are not route-wired.
- **No runtime enablement, schema, migration, DB, frontend API integration, external visibility, CP-SCHEMA-1, or production apply is authorized.** Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked (NO-GO)**.

## 54. Client Portal authz stub design 2

- `CLIENT-PORTAL-AUTHZ-STUB-DESIGN-2` completed a docs-only design of the future Client Portal authorization/principal boundary (`docs/client-portal-authz-stub-design-2.md`): the `PortalPrincipal` concept, the conceptual `authorization.ts` module shape (`resolvePortalPrincipal`, `requireActivePortalUser`, `requirePortal*Access`, fail-closed error types), the authorization order, grant-check functions, content-free errors, the non-enumeration rule, candidate schema dependencies, and required future tests.
- **No authorization implementation, route wiring, service wiring, schema, migration, DB, frontend API integration, external visibility, CP-SCHEMA-1, or production apply is authorized.** No `authorization.ts` was created; the inert shell is unchanged (routes stay `401`/`501 CLIENT_PORTAL_NOT_ENABLED`; the triple runtime-ready gate is unchanged).
- Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked (NO-GO)**.

## 55. Client Portal authz fail-closed stubs

- `CLIENT-PORTAL-AUTHZ-FAIL-CLOSED-STUBS-1` added **fail-closed backend authorization stubs only** (`Backend/src/modules/client-portal/authorization.ts` + `Backend/tests/clientPortalAuthorizationStubs.test.ts`). Every stub **fails closed** with a content-free error: principal resolution/readiness throws `ClientPortalPrincipalNotReadyError` (`CLIENT_PORTAL_PRINCIPAL_NOT_READY`, 501); grant checks throw `ClientPortalAccessDeniedError` (`CLIENT_PORTAL_ACCESS_DENIED`, 403). Input refs never leak into the error surface.
- **Not wired anywhere.** `authorization.ts` imports no Prisma/`@prisma/client`, runs no DB query, imports no internal case/document/task/communication module, and imports no portal service or mapper. `routes.ts` and `services.ts` do **not** import it; the runtime stays `401`/`501 CLIENT_PORTAL_NOT_ENABLED` and the triple runtime-ready gate is unchanged (no flag weakened).
- **This is not live authorization. No Prisma/DB access, no schema/migration, no frontend API integration, no upload/download/message implementation.** Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked (NO-GO)**.

## 56. Client Portal CP-SCHEMA-1 migration plan draft

- `CLIENT-PORTAL-CP-SCHEMA-1-MIGRATION-PLAN-DRAFT-1` completed a docs-only CP-SCHEMA-1 migration plan draft (`docs/client-portal-cp-schema-1-migration-plan-draft.md`): candidate scope (the `Portal*` candidate models plus the existing inert `ClientPortal*` names to reconcile), explicit out-of-scope list, proposed 11-step sequencing, model-by-model migration considerations, existing-model relationship risks, index/constraint plan, privacy/security gates, test readiness checklist, clone rehearsal plan, rollback/forward-fix strategy, and production-apply blockers.
- **No `schema.prisma` edit, migration, DB query, migration command, production apply, runtime API, frontend API integration, external visibility, or Client Portal enablement is authorized.** `schema.prisma` was inspected for context only; it was not edited.
- Client Portal remains inert (routes `401`/`501 CLIENT_PORTAL_NOT_ENABLED`); external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked (NO-GO)**.

## 57. Client Portal CP-SCHEMA-1 model naming decision

- `CLIENT-PORTAL-CP-SCHEMA-1-MODEL-NAMING-DECISION-1` completed a docs-only naming/semantics decision (`docs/client-portal-cp-schema-1-model-naming-decision.md`): future CP-SCHEMA-1 DB models use **explicit `ClientPortal*` names** — `ClientPortalUser`, `ClientPortalMatterGrant`, `ClientPortalMatterPublication`, `ClientPortalDocumentShare`, `ClientPortalUploadRequest`, `ClientPortalUploadedFile`, `ClientPortalTask`, `ClientPortalAuditEvent` (deferred `ClientPortalMessageThread`, `ClientPortalMessage`, `ClientPortalNotificationPreference`) — avoiding ambiguous `ClientPortalMembership`/`ClientVisibleArtifact`, with frozen per-surface semantics (grant ≠ membership; matter access ≠ document access; audit content-free; no `workspaceText`).
- **No `schema.prisma` edit, migration, DB query, migration command, production apply, runtime API, frontend API integration, external visibility, or Client Portal enablement is authorized.** `schema.prisma` was inspected for context only; it was not edited. Naming is frozen for planning purposes only.
- Client Portal remains inert (routes `401`/`501 CLIENT_PORTAL_NOT_ENABLED`); external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked (NO-GO)**.

## 58. Client Portal CP-SCHEMA-1 field spec draft

- `CLIENT-PORTAL-CP-SCHEMA-1-FIELD-SPEC-DRAFT-1` completed a docs-only field-level spec draft (`docs/client-portal-cp-schema-1-field-spec-draft.md`) for the frozen `ClientPortal*` models: per-model field tables (required/optional, external-safe ref vs internal FK, client-facing flag, status/revocation/expiry/retention), candidate enums (`ClientPortalUserStatus`, `ClientPortalGrantStatus`, …, `ClientPortalAuditAction`/`Result`), an index/constraint draft, a field-level forbidden list (no `workspaceText`/raw content/storage-SharePoint paths/AI output/internal notes), and open questions.
- **No `schema.prisma` edit, migration, DB query, migration command, production apply, runtime API, frontend API integration, external visibility, or Client Portal enablement is authorized.** `schema.prisma` and the runtime client-portal module were inspected for context only; nothing was edited.
- Client Portal remains inert (routes `401`/`501 CLIENT_PORTAL_NOT_ENABLED`); external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked (NO-GO)**.

## 59. Client Portal CP-SCHEMA-1 enum and ref decision

- `CLIENT-PORTAL-CP-SCHEMA-1-ENUM-AND-REF-DECISION-1` completed a docs-only enum/ref decision (`docs/client-portal-cp-schema-1-enum-and-ref-decision.md`): recommended values for each status enum (`ClientPortalUserStatus`, `ClientPortalGrantStatus`, `ClientPortalMatterPublicationStatus`, `ClientPortalDocumentShareStatus`, `ClientPortalUploadRequestStatus`, `ClientPortalUploadedFileStatus`, `ClientPortalTaskStatus`, `ClientPortalAuditAction`, `ClientPortalAuditResult`), values to avoid, and the external-safe `*Ref` strategy (opaque, non-sequential, prefixed, unique/indexed; distinct from internal DB IDs; not encoding case/client/document identity), plus which refs are client-visible vs internal-only and a client-facing mapping rule.
- **No enum added to `schema.prisma`, no ref generator implemented, no migration, no DB query, no migration command, no production apply, no runtime API, no frontend API integration, no external visibility, or Client Portal enablement is authorized.** `schema.prisma` and the runtime client-portal module were inspected for context only; nothing was edited.
- Client Portal remains inert (routes `401`/`501 CLIENT_PORTAL_NOT_ENABLED`); external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked (NO-GO)**.

## 60. Client Portal CP-SCHEMA-1 relation and index spec draft

- `CLIENT-PORTAL-CP-SCHEMA-1-RELATION-AND-INDEX-SPEC-DRAFT-1` completed a docs-only relation/index/cascade spec draft (`docs/client-portal-cp-schema-1-relation-and-index-spec-draft.md`): a candidate relation map, per-model required/optional relations to existing internal models (`Case`/`Client`/`Document`/`User`), index/uniqueness candidates (unique `*Ref`/`externalAuthSubject`; composite active-grant/share/upload/task/audit lookups; revocation/expiry indexes), cascade cautions (avoid cascade-delete; revoke over delete; no auto-`Document` creation), per-model security rules, and cross-model security invariants (internal FK ≠ visibility; matter grant ≠ document share; uploaded file ≠ internal `Document`; portal task ≠ internal `Task`; audit is content-free).
- **No `schema.prisma` edit, migration, DB query, migration command, production apply, runtime API, frontend API integration, external visibility, or Client Portal enablement is authorized.** `schema.prisma` was inspected for context only; nothing was edited.
- Client Portal remains inert (routes `401`/`501 CLIENT_PORTAL_NOT_ENABLED`); external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked (NO-GO)**.

## 61. Client Portal CP-SCHEMA-1 readiness checkpoint 2

- `CLIENT-PORTAL-CP-SCHEMA-1-READINESS-CHECKPOINT-2` completed a docs-only readiness checkpoint (`docs/client-portal-cp-schema-1-readiness-checkpoint-2.md`) consolidating all pre-schema planning: completed decisions (schema candidate design 2, migration plan draft, model naming decision, field spec draft, enum/ref decision, relation/index spec draft), frozen planning decisions, the inert implementation baseline (frontend mock + inert routes + fail-closed authz/service stubs + DTO/mappers; 22 suites / 241 tests), the planned model set, unresolved items, schema-implementation blockers, the 11 migration readiness gates, and production-apply blockers. **Executive conclusion: better prepared, but CP-SCHEMA-1 is still NOT authorized and production apply remains NO-GO.**
- **No `schema.prisma` edit, migration, DB query, migration command, production apply, runtime API, frontend API integration, external visibility, or Client Portal enablement is authorized.** `schema.prisma` and the runtime client-portal module were inspected for context only; nothing was edited.
- Client Portal remains inert (routes `401`/`501 CLIENT_PORTAL_NOT_ENABLED`); external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked (NO-GO)**.

## 62. Client Portal CP-SCHEMA-1 approval and non-applied Prisma draft package

- `CLIENT-PORTAL-CP-SCHEMA-1-APPROVAL-AND-NONAPPLIED-PRISMA-DRAFT-1` completed the docs-only approval package: the **human approval packet** (`docs/client-portal-cp-schema-1-human-approval-packet.md`, 12 approval questions + GO/NO-GO/BLOCKED matrix), the **non-applied Prisma draft** (`docs/client-portal-cp-schema-1-prisma-draft-nonapplied.md` — markdown-only draft of the 9 enums and 8 `ClientPortal*` models, with legacy-block collisions, `onDelete`/partial-index items, and unresolved questions marked in comments; not `schema.prisma`, not a migration), the **risk register** (`docs/client-portal-cp-schema-1-risk-register.md`, 22 risks + top-10 mitigations + residual NO-GO items), and the **next-gates plan** (`docs/client-portal-cp-schema-1-next-gates.md`, Gate 0–10).
- **No `schema.prisma` edit, migration, DB query, migration command, production apply, runtime API, frontend API integration, external visibility, or Client Portal enablement is authorized.** The Prisma-like draft exists only inside a markdown document; no generated Prisma client or migration artifact was created. The packet requests future human approval only and does not grant it.
- Client Portal remains inert (routes `401`/`501 CLIENT_PORTAL_NOT_ENABLED`); external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked (NO-GO)**.

## 63. Client Portal CP-SCHEMA-1 collision resolution and patch strategy

- `CLIENT-PORTAL-CP-SCHEMA-1-COLLISION-RESOLUTION-AND-PATCH-STRATEGY-1` completed the docs-only collision package: the **collision-resolution and patch strategy** (`docs/client-portal-cp-schema-1-collision-resolution-and-patch-strategy.md` — exact collision summary: 2 model names, 3 enum names, 2 `@@map` table names, plus semantic mismatches; four options compared A–D with a decision matrix; **recommended: Option C — human-approved replacement/normalization**, hard precondition: verify legacy tables' production existence/emptiness), the **legacy candidate block inventory** (`docs/client-portal-cp-schema-1-legacy-candidate-block-inventory.md` — all 7 legacy models and 16 enums with `@@map` names, values, cascade/Json findings, and dispositions), and the **schema patch review checklist** (`docs/client-portal-cp-schema-1-schema-patch-review-checklist.md`). The next-gates plan gained a **Gate 1A** (collision strategy approval) prerequisite.
- **No `schema.prisma` edit, migration, DB query, migration command, production apply, runtime API, frontend API integration, external visibility, or Client Portal enablement is authorized.** `schema.prisma` was inspected for the inventory only; nothing was edited. The strategy requires human approval and clone verification before any patch.
- Client Portal remains inert (routes `401`/`501 CLIENT_PORTAL_NOT_ENABLED`); external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked (NO-GO)**.

## 64. Client Portal inert shell static guards

- `CLIENT-PORTAL-INERT-SHELL-STATIC-GUARDS-1` added a consolidated static guard suite (`Backend/tests/clientPortalInertShellStaticGuards.test.ts`) proving the current inert shell stays unwired: routes do not import authz/services/mappers/Prisma, authz/services/mappers stay isolated from Prisma/internal modules, and frontend `/portal*` remains synthetic/static with no API calls, `@/lib/api`, file input/form behavior, `workspaceText`, or internal app component reuse.
- The guard also checks required fail-closed/runtime markers (`authenticate`, `requireClientPortalRuntimeReady`, `CLIENT_PORTAL_NOT_ENABLED`, authz/service error constants) and mapper allow-list safety (`...source` is not used). It is a test-only safety net; it authorizes no live portal behavior.
- **No `schema.prisma` edit, migration, DB query, migration command, production apply, runtime API, frontend API integration, external visibility, OpenAPI/CORS, Azure, package, or Client Portal enablement is authorized.** Client Portal remains inert; **CP-SCHEMA-1 and production apply remain blocked (NO-GO)**.

## 65. Client Portal CP-SCHEMA-1 block enforcement and approval readiness

- `CLIENT-PORTAL-CP-SCHEMA-1-BLOCK-ENFORCEMENT-AND-APPROVAL-READINESS-1` added `Backend/tests/clientPortalCpSchemaBlockGuards.test.ts`, static tests that keep the legacy ClientPortal collision block visible, prevent final-only CP-SCHEMA-1 models from appearing in `schema.prisma`, prevent new CP-SCHEMA-1 migration-folder movement, and prove the non-applied Prisma draft remains markdown-only.
- Added approval-readiness and operator-verification docs: `docs/client-portal-cp-schema-1-approval-readiness-summary.md` and `docs/client-portal-cp-schema-1-operator-verification-checklist.md`. Operator verification of legacy ClientPortal tables/enums/migration state is now an explicit prerequisite before schema patch approval.
- **No `schema.prisma` edit, migration, DB query, migration command, production apply, runtime API, frontend API integration, external visibility, OpenAPI/CORS, Azure, package, or Client Portal enablement is authorized.** Client Portal remains inert; **CP-SCHEMA-1 and production apply remain blocked (NO-GO)**.

## 66. Workflow Core Case Center 1

- `WORKFLOW-CORE-CASE-CENTER-1` implemented an internal case-centered workflow summary using existing production-compatible data only: case metadata, task status/deadline stats, case deadline, communication preview metadata, document/review metadata, responsible lawyer, and collaborators.
- Added `GET /api/v1/cases/:caseId/workflow-summary`, deterministic next-action prioritization, a Case Detail `Itt folytasd` operational panel, source audit docs, implementation checkpoint docs, and acceptance checklist docs.
- **No `schema.prisma` edit, migration, DB command/query, production apply, Client Portal enablement, external visibility, raw document text, `documents.workspaceText`, raw communication body/content, Azure/OpenAPI/CORS/package change, or production deployment is authorized.**

## WORKFLOW-CORE-TASKS-HANDOFF-1 decision

Decision: internal KEEP candidate for the production-compatible baseline, limited to existing task, blocker, case-access, and handoff-package metadata fields. Implemented without `schema.prisma` edits, migrations, manual DB queries, production deployment, Client Portal changes, workspace text/raw document/raw communication exposure, or arbitrary frontend status assignment. Unsupported waiting and recipient-specific handoff states were not simulated.

## WORKFLOW-CORE-DOCUMENTS-COMMUNICATIONS-1 Decision Note

The internal lawyer workflow gained safe document/communication metadata handoff surfaces and source-linked task creation. This does not change the production-compatible baseline decision posture: Client Portal and external visibility remain blocked, and document/communication metadata reuse outside internal authenticated case workflows requires a separate privacy/security decision.

## Workflow deadline/agenda decision note

`WORKFLOW-CORE-DEADLINES-AGENDA-NOTIFICATIONS-1` adds an internal backend-owned deadline/agenda workflow using existing production-compatible fields only (`tasks.dueDate`, `cases.deadline`, and existing notification/timeline tables). This is not a schema baseline change, migration authorization, Client Portal deadline publication, external calendar integration, AI deadline extraction, n8n automation, or legal-significance inference. Production apply readiness and CP-SCHEMA-1 readiness remain blocked.

## Workflow Core Responsibility / Workload / Time Note

Internal responsibility, workload and manual time-entry coordination is treated as KEEP-compatible only for the currently supported internal case/task/matter/time-entry surfaces. This does not authorize schema baseline apply, CP-SCHEMA-1, employee performance scoring, passive tracking, AI staffing, or external connector automation.

- Production apply readiness: still blocked by baseline posture.
- CP-SCHEMA-1 readiness: still blocked.
- Future schema/runtime changes require separate proof and PR.

## WORKFLOW-CORE-LITIGATION-CASE-LIFECYCLE-1 Decision Note

`WORKFLOW-CORE-LITIGATION-CASE-LIFECYCLE-1` connects the legal-work layer to the operational workflow using **existing production-compatible data only**: a canonical case-lifecycle contract (`GET /cases/:id/lifecycle`) and safe close/reopen/archive transitions built on the existing `CaseStatus` enum + `completedAt` column, plus a read-only litigation dossier (`GET /cases/:id/litigation-dossier`) aggregating documents by `DocumentCategory` (EVIDENCE/COURT_FILING), tasks, and the canonical deadline engine.

- Implemented **without** `schema.prisma` edit, migration, `prisma migrate`/`db push`, or manual DB query.
- **No** production deployment; **no** Client Portal change; **no** AI API/SDK; **no** n8n; **no** external filing/court integration; **no** Outlook/Graph enablement; **no** OpenAPI/CORS/Azure/package/lock change.
- **No** automatic legal conclusions and **no** automatic case status/closure/reopen/pleading-filing from document/task events; lifecycle transitions are explicit, authorized actions only.
- **No** raw `documents.workspaceText`, raw document/extracted text, or raw communication body/content exposure; metadata-only DTOs with explicit `select` and bounded queries.
- Unsupported litigation/lifecycle concepts were **not simulated**: structured legal issues/claims/allegations/defences, evidence items & evidence↔issue relations and relation classification, pleading filing status/supersede, hearing/procedural-event typing, opposing party, court/authority reference, legal significance, burden of proof, and a dedicated `CLOSING`/`closedAt`/`archivedAt` schema are marked unavailable/deferred (`availability` flags) with the exact blocker documented in `docs/workflow-core-litigation-case-lifecycle-data-source-audit.md`.
- Validation: backend `prisma validate` + `tsc --noEmit` + `jest` (33 suites / 344 tests, up from 30 / 305); frontend `tsc --noEmit` + build + `verify:prod-env`.
- Production apply readiness: still blocked by baseline posture. CP-SCHEMA-1 readiness: still blocked. Future structured litigation models require a separate schema change, proof, and PR.

## WORKFLOW-CORE-INTAKE-MATTER-OPENING-1 Decision Note

`WORKFLOW-CORE-INTAKE-MATTER-OPENING-1` adds the internal intake and matter-opening workflow
using **existing production-compatible data only**: a canonical intake-readiness contract
(`GET /cases/:id/intake-readiness`), a bounded duplicate-safety client lookup
(`GET /clients/lookup`), an explicit user-confirmed opening task bundle
(`POST /cases/:id/opening-tasks`, existing `Task` model + `type` code convention), explicit
activation/decline on the real `CaseStatus` enum (`CLIENT_INPUT → DRAFT` / `CLIENT_INPUT →
CANCELLED`), and a bounded intake queue (`GET /api/v1/intake`).

- Implemented **without** `schema.prisma` edit, migration, `prisma migrate`/`db push`, or manual DB query.
- **No** production deployment; **no** Client Portal change (the portal is not an onboarding channel); **no** AI API/SDK; **no** n8n; **no** external CRM/identity-verification/sanctions-PEP integration; **no** client communication; **no** OpenAPI/CORS/Azure/package/lock change.
- **No automatic conflict clearance** — conflict review has no persistence and is exposed as
  UNAVAILABLE, never simulated in descriptions/JSON, with no clearance checkbox anywhere.
- **No client merging** — lookup match signals are human-review hints (`REVIEW_REQUIRED`), never
  duplicate confirmations; unique-field collision returns 409.
- **No automatic activation, responsible-lawyer assignment, or task creation** — every mutation is
  an explicit, authorized human action; opening tasks require explicit selection.
- **No** raw `workspaceText`/document/communication content exposure; explicit `select`, bounded
  queries, and content-minimized audit events only; no sensitive identity numbers in readiness or
  queue DTOs.
- Unsupported intake/compliance concepts (prospective-client state, person/org type, verified
  identity, parties/opposing parties, conflict-review persistence, engagement state, decline
  reason codes, client merge, task templates) were **not simulated**; blockers documented in
  `docs/workflow-core-intake-matter-opening-data-source-audit.md`.
- Production-env verification recorded honestly: local build with `.env.local` correctly fails the
  guard; the documented non-destructive clean procedure (process-env override with a non-routable
  `.invalid` placeholder, fresh `.next`) passes `verify:prod-env` without editing `.env.local` or
  weakening the script (`docs/frontend-production-deploy-env-guard.md`).
- Validation: backend `prisma validate` + `tsc --noEmit` + Jest **38 suites / 408 tests** (up from
  33/344); frontend `tsc --noEmit` + build + clean-env `verify:prod-env`.
- Production apply readiness: still blocked by baseline posture. CP-SCHEMA-1 readiness: still
  blocked. Structured conflict-review/engagement/party models require a separate schema change,
  proof, and PR.

## DOCUMENT-EDITOR-PRO-CONTRACT-WORKBENCH-1 (2026-07-14)

**Decision**: The professional contract editor was implemented using existing
production-compatible capabilities only, in **persistence mode C — explicit export-only
working session** (`docs/document-editor-pro-data-source-and-persistence-audit.md`).

- Canonical route `/documents/[documentId]/edit` (the `/editor-lab` sandbox now redirects to a
  blank working draft); the compare/litigation embedded review-suggestion workspace remains a
  separate, unchanged surface.
- Selected persistence mode C because every server content route is 501-gated behind
  `ENABLE_DOCUMENT_PROCESSING` + `ENABLE_DOCUMENT_AI_PRIVACY_MODEL` (off in the production
  posture) and writes to the forbidden `documents.workspaceText`; no dedicated editor-content
  model exists. The UI states "Nincs szerverre mentve", warns before unload, and offers
  truthful exports only (browser print/PDF, sanitized HTML, TXT).
- Implemented **without** `schema.prisma` edit, migration, or manual DB query; **no**
  deployment; **no** Client Portal change; **no** AI API; **no** n8n; **no** external
  conversion service, e-signature, or court filing.
- **No fake autosave** and **no fake track changes** — compare (`/documents/compare`) is the
  truthful redline; comments are truthfully unavailable (the `Comment` model has no routes).
- **No** `workspaceText` usage and **no** editor content stored in unrelated fields
  (`templateData`, `variables`, `SystemSetting`, descriptions, timeline metadata, browser
  storage) — all static-guarded.
- One package addition (allowed by package policy, explained): official
  `@tiptap/extension-table@3.26.0`, matching the installed Tiptap 3.26 line (+15 lockfile
  lines).
- Unsupported import/export/realtime features were **not simulated**: DOCX import/export,
  server save/versioning, page numbers, headers/footers, anchored comments, live track
  changes and realtime collaboration are absent and documented, not faked.
- Validation: backend `prisma validate` + `tsc --noEmit` + Jest **43 suites / 468 tests**
  (up from 38/408); frontend `tsc --noEmit` + production build + clean-env
  `verify:prod-env` with the documented non-routable placeholder.

## Document editor persistence/versioning readiness decision

| Feature family | Current recommendation | Decision needed | Default safe decision | Human decision: KEEP / QUARANTINE / REMOVE / BRING-FORWARD / UNKNOWN | Notes |
|---|---|---|---|---|---|
| Document editor persistence / versioning readiness | QUARANTINE for server persistence; KEEP only export-only editor and metadata/capability readiness | Approve a real storage model, version identity, retention/delete/archive policy, and concurrency token before any save route | QUARANTINE | UNKNOWN | DOCUMENT-EDITOR-PERSISTENCE-VERSIONING-READINESS-1 completed in Mode C: no `schema.prisma` edit, no migration, no DB query, no deployment, no Client Portal change, no AI API, no n8n, no `workspaceText`, no unrelated-field storage, no fake autosave, no fake versions, no silent stale overwrite. Backend validator and metadata/capability endpoint are readiness-only. |

## Document editor DOCX interoperability decision

| Feature family | Current recommendation | Decision needed | Default safe decision | Human decision: KEEP / QUARANTINE / REMOVE / BRING-FORWARD / UNKNOWN | Notes |
|---|---|---|---|---|---|
| Document editor DOCX interoperability / template bridge | KEEP local subset import/export; QUARANTINE automatic template bridge and Word-perfect claims | Decide whether richer Word features, images, template bridge, or server-mediated conversion are product scope | KEEP local subset only | UNKNOWN | DOCUMENT-EDITOR-DOCX-INTEROPERABILITY-TEMPLATE-BRIDGE-1 completed with local browser DOCX import/export using `jszip`; no schema edit, migration, DB query, deployment, server editor persistence, fake save/autosave/version, Client Portal change, AI, n8n, or external conversion service. Unsupported Word features are not simulated. |

## Document editor template assembly decision

| Feature family | Current recommendation | Decision needed | Default safe decision | Human decision: KEEP / QUARANTINE / REMOVE / BRING-FORWARD / UNKNOWN | Notes |
|---|---|---|---|---|---|
| Document editor template assembly / clause catalog | KEEP capability/readiness contract only; QUARANTINE runtime catalog, automatic generation/import bridge, and dynamic clause catalog | Approve contracts storage/retention/delete policy, permission model, audit minimization, schema/enum remediation, DTO allow-lists, enabled-route tests, and clause governance before runtime bridge | QUARANTINE runtime bridge | UNKNOWN | DOCUMENT-EDITOR-TEMPLATE-ASSEMBLY-CLAUSE-CATALOG-1 completed Branch C approval readiness. Added authenticated capability endpoint and disabled editor panel. No `schema.prisma` edit, migration, DB query, deployment, editor server persistence, Client Portal change, AI, n8n, automatic legal-clause selection, unapproved hardcoded substantive clause library, external converter, or automatic import. Dependency audit remediated critical Next advisories via safe minor update; four moderate advisories remain explicitly documented. |

## DOCUMENT-EDITOR-WORKBENCH-UX-LAYOUT-OVERHAUL-1 (2026-07-15)

**Decision**: The professional editor was converted into a viewport-bound
workbench with persistent chrome and internal scrolling; persistence semantics
were not touched.

- **Root cause fixed**: the application shell's `min-h-screen` +
  unconstrained `flex-1 overflow-y-auto` main meant the editor's `h-full`
  resolved to auto — the page/body was the document scroll surface and the
  header/toolbar scrolled away. A route-scoped `fullViewport` shell mode
  (`h-dvh min-h-0 overflow-hidden`, non-scrolling `<main>`, footer yielded)
  now binds the height chain; only the editor route opts in — every other
  route keeps the historical page-scrolling shell.
- Persistent workbench header (compact) and formatting toolbar; document
  viewport is the single document scroll region; outline (240 px) and side
  panel (340 px) scroll independently and collapse with responsive defaults
  (≥1440 both open; 1280–1439 outline collapsed; <1280 both collapsed);
  status bar hosts counts, comment/review/dirty truth and zoom; focus mode
  restores the previous arrangement and exits on Escape.
- Canvas zoom switched from `transform: scale` to layout-affecting CSS `zoom`
  (correct scroll height at every level); page breaks render as visible
  workspace bands while remaining real print breaks; the A4 paper gained
  border/shadow contrast on a calmer workspace background.
- The permanently large template banner moved into the side panel "Sablon"
  tab; DOCX import/export moved into the header "Export / Import" menu; the
  side panel Export tab's stale "DOCX unavailable" copy was corrected.
- **No** `schema.prisma` edit; **no** migration; **no** DB query; **no**
  deployment; **no** editor persistence (Mode C intact: no save, no autosave,
  no versions, no browser durable storage — layout state is session memory);
  **no** Client Portal change; **no** AI; **no** n8n; **no** package changes.
- Tests: backend **52 suites / 544 tests** (from 50/515; new pure
  layout-state suite + scroll-architecture guards; one template-assembly
  assertion re-pointed to the banner's new side-panel home — intent
  preserved). Frontend `tsc` + build + clean `verify:prod-env`
  (`https://prod-env-verify.invalid`) all pass.

## AUTHENTICATED-VISUAL-QA-AND-EDITOR-SCROLL-FIX-1 (2026-07-15)

- Authenticated local browser QA verified `/documents/new/edit`, `/time-entries`, `/deadlines`, and `/clause-library`.
- The editor scroll defect did not reproduce: browser scroll remained stationary, the central document viewport owned scrolling, and header/toolbar/status/right panel stayed visible at top, middle, and bottom at `1366×768`, with a second check at `1440×900`.
- `/time-entries` kept entries/recording primary and reports secondary; `/deadlines` used compact operational hierarchy; `/clause-library` rendered the concise unavailable state when `ENABLE_CLAUSE_LIBRARY=false`.
- No code/runtime/schema/migration/DB/Azure/OpenAPI/CORS/package/Client Portal/editor persistence/AI/n8n/Outlook change was made.

## RELEASE-READINESS-EDITOR-OPS-WORKFLOW-1 (2026-07-15)

**Decision**: NO-GO for deployment until the exact active frontend/backend production baselines are proven and the accumulated branch is split or explicitly approved.

- Readiness package created for the accumulated editor, workflow, operational pages, and visual-QA work.
- Current branch contains protected schema/migration/package changes in the candidate range, including CP-SCHEMA-1 artifacts, so it must not be treated as a simple editor/ops/workflow release branch.
- Production apply readiness remains **blocked**; CP-SCHEMA-1 remains **blocked**; no DB apply, runtime change, deployment, Azure change, or feature enablement was authorized by this readiness decision.
- Required before future GO: authoritative deployed frontend/backend commit proof, security acceptance/remediation for audit findings, explicit environment/feature-flag confirmation, and a narrowed or separately approved release branch.

## ACTIVE-ARTIFACT-GIT-BASELINE-FORENSICS-1 — 2026-07-15

- Active artifact forensic reconstruction downloaded read-only Kudu `wwwroot` snapshots for active frontend deployment `d21de1cb-46a1-4994-8bcd-45749c42d14e` and backend deployment `f3129580-9574-429a-a1b3-f078b1319cd7` into a local temp directory outside the repo.
- Frontend baseline evidence is now `UNIQUE_COMMIT_MATCH_HIGH_CONFIDENCE` for `dc0780e`, but not exact because the artifact contains no embedded git SHA.
- Backend baseline evidence is `COMMIT_RANGE_NARROWED`, with runtime-equivalent candidates including `2cf1594` and `8ce26c0`; no unique backend source commit is proven.
- Decision: **no release branch yet** unless a human explicitly accepts the reconstructed frontend commit and backend range, or stronger provenance is found.
- Provenance hardening is required for future deploys: embed build metadata with git SHA, source branch, package-lock hash, artifact hash, build timestamp, and deployment ID.
- No deployment, restart, Azure config change, DB query, migration, runtime change, schema change, release branch, or worktree creation occurred.

## BASELINE-EVIDENCE-RECONCILIATION-AND-NARROW-RELEASE-1 — 2026-07-15

- `docs/deployment-baseline-evidence-reconciliation.md` reconciles the active artifact forensics with the operator-provided backend deployment record.
- Backend baseline is classified as `EXACT_COMMIT_PROVEN_BY_OPERATOR_DEPLOY_RECORD_AND_ARTIFACT` for `8ce26c0`, conditional on accepting the operator record tying deployment ID `f3129580-9574-429a-a1b3-f078b1319cd7` to that commit.
- Frontend baseline remains `UNIQUE_COMMIT_MATCH_HIGH_CONFIDENCE` for `dc0780e`, not exact.
- Human decision required: explicitly accept or reject frontend reconstructed baseline `dc0780e` before creating `release/editor-ops-workflow-1`.
- Decision: **no release branch/worktree created**; release remains `NO_GO_FRONTEND_BASELINE_HUMAN_ACCEPTANCE_REQUIRED`.
- No deployment, Azure change, DB query, migration, schema/runtime/package/auth/Client Portal/OpenAPI/CORS change, release branch, or release worktree creation occurred.
