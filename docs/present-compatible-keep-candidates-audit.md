# Present-Compatible KEEP Candidates Audit

## Purpose

This document audits production-present-compatible schema items for runtime and privacy safety.

It is documentation-only. It makes no runtime change, no schema change, no migration, no DB connection, no production apply, and no CP-SCHEMA-1 authorization.

Production metadata compatibility means the physical object was observed as present-compatible in prior read-only metadata comparison. It does not prove route safety, authorization safety, privacy safety, external visibility safety, or readiness for Client Portal work.

## Inputs

- `docs/production-schema-readonly-compare.md`
- `docs/partial-schema-drift-triage.md`
- `docs/partial-schema-drift-inventory.md`
- `docs/production-compatible-baseline-human-decisions.md`
- `Backend/prisma/schema.prisma`
- `Backend/src/index.ts`
- `Backend/src/modules/cases/routes.ts`
- `Backend/src/modules/cases/services.ts`
- `Backend/src/modules/workgroups/routes.ts`
- `Backend/src/modules/workgroups/services.ts`
- `Backend/src/modules/clients/routes.ts`
- `Backend/src/modules/documents/routes.ts`
- `Backend/src/modules/handoff-packages/authorization.ts`
- `Backend/src/openapi/publicSpec.ts`
- `Backend/tests/routeFeatureGuards.test.ts`
- `Frontend/src` references where needed to identify UI exposure

No production DB, clone DB, Kudu, Azure, migration, smoke test, business-data query, AI/provider call, SharePoint call, or file-processing job was used.

## Present-compatible items in scope

- `case_collaborators`
- `workload_records`
- client identity fields: `clients.taxNumber`, `clients.companyRegistrationNumber`, `clients.authorizedRepresentative`
- `cases.clientRole`
- `clients.color`
- `documents.workspaceText`

## Audit table

| Item / field / table | Production metadata result | Repo/runtime evidence | Route/API exposure | Authorization evidence | Privacy/security sensitivity | Proposed lane | Strict blocker | Required next package |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `case_collaborators` | present-compatible | Active model relation on `Case`; active cases routes read/create/delete collaborators; Case Detail, tasks, reviews, client dossier, and case communications UI call collaborator APIs; handoff authorization uses collaborators as a case-access signal. | `GET /api/v1/cases/:caseId/collaborators`, `POST /api/v1/cases/:caseId/collaborators`, `DELETE /api/v1/cases/:caseId/collaborators/:collaboratorId`; returns internal user id/name/email/role. | Routes require general `authenticate`, but inspected case collaborator routes do not show case-level access checks, privileged-role checks, assigned-lawyer checks, or same-case collaborator checks before read/write/delete. Handoff package routes do contain separate case-access authorization using assigned lawyer, privileged roles, or collaborator membership, and tests cover that separate surface. | Internal team membership and user email/role exposure; cross-case leakage risk if any authenticated user can enumerate or modify collaborators by case id. | KEEP-BUT-HARDEN candidate | Add or prove case-level authorization and role policy for collaborator read/write/delete; targeted tests for unauthenticated, wrong-user, assigned-lawyer, collaborator, and privileged-role paths. | `CASE-COLLABORATORS-AUTHZ-AUDIT-1` |
| `workload_records` | present-compatible | Active workgroup/workload module; frontend client workgroups page records and displays workload records; service upserts workload by `workgroupId` and returns period, hours, note. | `POST /api/v1/workgroups/:id/workload`, `GET /api/v1/workgroups/:id/workload`, `GET /api/v1/clients/:clientId/workload-summary`; public OpenAPI sanitizer quarantines workgroup/workload paths from public metadata. | Routes require general `authenticate`, but inspected routes do not show client/workgroup ownership checks, privileged-role checks, or case/client-scoped authorization beyond path ids. | Internal workload/capacity, period hours, and notes can expose firm capacity or productivity data; prior Client Portal docs forbid internal workload/capacity exposure. | KEEP-BUT-HARDEN candidate | Prove internal-only access model, add/verify role or client/workgroup scoped authorization, and ensure workload remains excluded from Client Portal/public metadata. | `WORKLOAD-RECORDS-INTERNAL-EXPOSURE-AUDIT-1` |
| Client identity fields: `clients.taxNumber`, `clients.companyRegistrationNumber`, `clients.authorizedRepresentative` | present-compatible | Prisma model includes fields; clients list enriches with identity fields; create/update routes write them; frontend clients pages/search display/edit them. | `GET /api/v1/clients`, `GET /api/v1/clients/:clientId`, `POST /api/v1/clients`, `PATCH /api/v1/clients/:clientId`; fields appear in internal frontend client/search surfaces. | Routes require general `authenticate`; no separate client ownership/need-to-know layer was observed in these client routes. | Legal/business identity data; appropriate for internal client management but not automatically client-visible and not a Client Portal identity model. | KEEP-BUT-HARDEN candidate | Confirm internal-only baseline semantics, role/need-to-know expectations, and no Client Portal reuse; targeted tests for auth and DTO boundaries if external surfaces are introduced. | `CLIENT-FIELDS-INTERNAL-BASELINE-DECISION-1` |
| `cases.clientRole` | present-compatible | Prisma model field; cases create/update routes accept it; cases service persists it and logs timeline changes; anonymize service uses it to improve party/redaction targeting. | `POST /api/v1/cases`, `PATCH /api/v1/cases/:caseId`; included in case list/detail DTOs and frontend case workflows. | Routes require general `authenticate`; inspected generic case update path does not show case-level authorization before updating `clientRole`. | Matter-context field that can affect anonymization/redaction semantics and reveal party role information. | KEEP-BUT-HARDEN candidate | Define allowed values/semantics, prove case-level update authorization, and verify anonymization usage remains privacy-safe. | `CLIENT-FIELDS-INTERNAL-BASELINE-DECISION-1` |
| `clients.color` | present-compatible | Prisma model contains nullable `color`; client detail frontend edits/displays a color value; repo docs identify it as visual identity metadata. Backend generic `GET /clients/:clientId` returns full client, and generic update may preserve model field if included by Prisma response, but specific client routes inspected do not separately manage `color` in create/update logic. | Internal client detail/list surfaces may receive it through full-client responses; no dedicated public/client-portal route identified for this field. | General `authenticate` on client routes; low sensitivity metadata, but still inherits the broader client route's lack of fine-grained client ownership scoping. | Low sensitivity visual metadata; must not be treated as a portal branding/tenant boundary. | KEEP candidate | Keep internal-only; do not use as Client Portal tenancy, authorization, or visibility signal. If client routes are hardened broadly, include it in DTO tests. | `CLIENT-FIELDS-INTERNAL-BASELINE-DECISION-1` |
| `documents.workspaceText` | present-compatible | Prisma model stores persistent workspace editor text for `MODIFIED_WORKING_COPY`; document text route returns `workspaceText` when available; save-workspace-version creates new document rows with `workspaceText`; frontend litigation/document compare/anonymize flows use workspace text. | `GET /api/v1/documents/:id/text` can return workspace text; `POST /api/v1/documents/:id/save-workspace-version` can persist it. These routes are `authenticate` plus `requireDocumentProcessingEnabled`; public OpenAPI sanitizer quarantines document paths. | Document text/save routes require general auth plus document/AI privacy feature gates, but inspected route snippets do not show case/document-level authorization before returning or persisting workspace text. | High: legal/document drafting text, privileged content, personal data, possible reidentification/anonymization context. Client Portal docs explicitly forbid `workspaceText` in client-visible DTOs. | SECURITY/PRIVACY BLOCKED | Document content privacy model, case/document-level authorization, logging/audit redaction, retention/delete policy, and tests proving no client/public exposure. | `DOCUMENT-WORKSPACE-TEXT-PRIVACY-AUDIT-1` |

## Subsequent narrow decisions

- CLIENTS-COLOR-INTERNAL-KEEP-DECISION-1 moved only `clients.color` from internal `KEEP candidate` to narrow internal `KEEP`.
- CASE-COLLABORATORS-INTERNAL-KEEP-DECISION-1 moved only `case_collaborators` from `KEEP-BUT-HARDEN` / `hardened internal KEEP candidate` to `KEEP — narrow internal baseline` after CASE-COLLABORATORS-HARDEN-1 (`7177693`) and CASE-COLLABORATORS-HARDENING-ROLLOUT-1 (`49f2bdc`).
- WORKLOAD-RECORDS-HARDEN-1 moved only `workload_records` from `KEEP-BUT-HARDEN candidate` to `hardened internal KEEP candidate` after conservative `ADMIN` / `PARTNER` route authorization and targeted tests.
- This does not move client identity fields, `cases.clientRole`, Client Portal, external client visibility, or `documents.workspaceText` out of their prior lanes.
- The `clients.color` decision does not authorize schema changes, migration creation/application, production apply, CP-SCHEMA-1, route behavior changes, frontend changes, OpenAPI/CORS changes, or external/client-portal exposure.
- The `case_collaborators` decision does not authorize schema changes, migration creation/application, production apply, CP-SCHEMA-1, future collaborator update/bulk/export routes, authz weakening, OpenAPI/CORS changes, or external/client-portal exposure.
- The `workload_records` hardening does not authorize full `KEEP`, schema changes, migration creation/application, production apply, CP-SCHEMA-1, self-scoped lawyer/team access, future export/reporting routes, OpenAPI/CORS changes, or external/client-portal exposure.

## Cross-cutting findings

- General authentication is not the same as case-level, client-level, document-level, or need-to-know authorization.
- Production schema presence is not enough to authorize production apply, external exposure, Client Portal exposure, or a `KEEP` decision.
- Client Portal remains disabled/quarantined; none of these items may be reused as a portal security boundary without a separate portal identity and publication model.
- Document/AI hardening remains active. `documents.workspaceText` is especially sensitive because it may contain privileged legal drafting text or personal data.
- Public OpenAPI hardening removes/quarantines workgroup/workload, documents, Client Portal, contracts, and other risky paths from served public metadata; this reduces metadata exposure but does not prove runtime authorization safety.
- Existing handoff package authorization shows a stronger case-access pattern using privileged roles, assigned lawyer, or collaborator membership, but that pattern was not observed on the generic case collaborator routes themselves.
- No present-compatible item authorizes CP-SCHEMA-1.

## Recommended next packages

1. `CASE-COLLABORATORS-AUTHZ-AUDIT-1`
   - Documentation/code audit only.
   - Verify whether collaborator read/write/delete should require privileged role, assigned lawyer, or same-case collaborator access.
   - No runtime change.

2. `WORKLOAD-RECORDS-INTERNAL-EXPOSURE-AUDIT-1`
   - Verify workload data remains internal-only.
   - Confirm no external/client portal exposure and define role/client/workgroup access expectations.
   - No runtime change.

3. `DOCUMENT-WORKSPACE-TEXT-PRIVACY-AUDIT-1`
   - Audit document text exposure, logging, retention, and case/document authorization.
   - Treat as privacy/security blocked until proven safe.
   - No runtime change.

4. `CLIENT-FIELDS-INTERNAL-BASELINE-DECISION-1`
   - Decide whether client identity fields, `cases.clientRole`, and `clients.color` can be internal baseline items.
   - Explicitly state they do not enable Client Portal or external visibility.
   - No runtime change.

## Non-actions

This audit did not:

- change schema;
- create, edit, apply, resolve, move, or delete migrations;
- connect to any database;
- apply any DB change;
- read business data;
- touch Azure, Kudu, app settings, or deployment;
- change runtime behavior;
- change route behavior;
- change OpenAPI or CORS behavior;
- change frontend behavior;
- change tests;
- run production smoke tests;
- run AI/provider calls;
- run SharePoint calls;
- run file-processing jobs;
- authorize CP-SCHEMA-1.

## Final classification

`present_compatible_keep_candidates_audited_no_db_change_no_runtime_change`
