# Cases Client Role Semantics Decision

## Purpose

This document records the product/data-model meaning of `cases.clientRole`.

This is documentation-only. It makes no runtime change, no schema change, no migration, no DB connection, no production apply, no CP-SCHEMA-1 authorization, and no Client Portal enablement.

## Inputs

- `docs/client-identity-role-fields-audit.md`
- `docs/production-schema-readonly-compare.md`
- `docs/present-compatible-keep-candidates-audit.md`
- `docs/production-compatible-baseline-human-decisions.md`
- `Backend/prisma/schema.prisma`
- `Backend/src/modules/cases/routes.ts`
- `Backend/src/modules/cases/services.ts`
- `Backend/src/modules/anonymize/services.ts`
- `Frontend/src/lib/api.ts`

No production DB, clone DB, Kudu, Azure, migration, smoke test, business-data query, AI/provider call, SharePoint call, or file-processing job was used.

## Current known facts

- `PROD-SCHEMA-COMPARE-READONLY-1` records `cases.clientRole` as present-compatible and nullable.
- `PRESENT-COMPATIBLE-KEEP-CANDIDATES-AUDIT-1` classified `cases.clientRole` as `KEEP-BUT-HARDEN candidate`, not `KEEP`.
- `CLIENT-IDENTITY-AND-ROLE-FIELDS-AUDIT-1` kept `cases.clientRole` as `KEEP-BUT-HARDEN candidate` and also marked it `NEEDS PRODUCT DECISION` because semantics and authorization were not yet decided.
- `Backend/prisma/schema.prisma` defines `Case.clientRole` as a nullable `String?` and comments it as case-level client role for generation/anonymization targeting, with examples such as `CLIENT`, `COUNTERPARTY`, `OPPOSING_COUNSEL`, and `BENEFICIARY`.
- `Backend/src/modules/anonymize/services.ts` uses `caseData.clientRole` and metadata `clientRole` to improve party/redaction targeting, including role-prefixed name patterns such as `Megbízó` and `Ellenérdekű fél`.
- Generic case DTOs and create/update paths include `clientRole`, but the prior audit did not find enough route authorization evidence to move the field to `KEEP`.
- Client Portal remains disabled/quarantined.
- Production apply and CP-SCHEMA-1 remain blocked.
- Present-compatible metadata does not automatically promote this field to `KEEP`.

## Decision options considered

| Option | Meaning | Implications |
| --- | --- | --- |
| Option A — Internal matter-party metadata | `cases.clientRole` describes the represented client or relevant party's role in a matter for internal legal workflow purposes only. | Can remain `KEEP-BUT-HARDEN candidate`; requires internal case-level authorization/hardening before `KEEP`; no Client Portal implication; no external display implication. |
| Option B — Client Portal display field | `cases.clientRole` is intended to be shown to clients in a future portal. | Would remain quarantined/privacy-blocked until external mapper, ownership, need-to-know visibility, and privacy review exist. No evidence supports selecting this now. |
| Option C — Ambiguous / legacy field | The field exists but product meaning is unclear or stale. | Would remain `NEEDS PRODUCT DECISION`; no hardening/KEEP until semantics are decided. |
| Option D — Remove / ignore candidate | The field is not needed for the current internal baseline. | Would remain non-KEEP/future cleanup candidate; no schema/runtime change now. No evidence supports selecting this now. |

## Selected decision

Selected option: **Option A — Internal matter-party metadata**.

`cases.clientRole` is an internal matter-party classification field. It describes the represented client or relevant party's role in the legal matter for internal lawyer workflow, document-generation context, and anonymization/redaction targeting.

Allowed internal interpretations include examples such as:

- claimant / defendant;
- applicant / respondent;
- buyer / seller;
- landlord / tenant;
- employer / employee;
- creditor / debtor;
- beneficiary;
- counterparty / opposing-side context;
- other internal matter-party classification where the meaning is useful for lawyer work.

This decision is intentionally narrow:

- `cases.clientRole` is not a Client Portal identity field.
- `cases.clientRole` is not a tenant boundary.
- `cases.clientRole` is not an authorization primitive.
- `cases.clientRole` is not approved for external/client-facing display.
- `cases.clientRole` is not an enum contract yet; it remains a nullable string until a separate schema/runtime design changes that.

## Decision consequences

- `cases.clientRole` may remain `KEEP-BUT-HARDEN candidate` as internal matter-party metadata.
- `cases.clientRole` no longer needs the generic `NEEDS PRODUCT DECISION` lane for meaning; the meaning is now decided as internal-only.
- It still does not move to `KEEP` because the prior audit found insufficient case-level authorization evidence on generic case read/update paths.
- The next package should be `CASES-CLIENT-ROLE-INTERNAL-HARDEN-1`.
- No Client Portal exposure is authorized.
- No external mapper is authorized.
- No CP-SCHEMA-1 work is authorized.
- No production apply is authorized.
- No DB migration or schema conversion to enum is authorized.

## Explicit non-authorizations

This decision does not authorize:

- Client Portal;
- external visibility;
- production apply;
- CP-SCHEMA-1;
- schema migration;
- route behavior change;
- frontend display change;
- OpenAPI/CORS behavior change;
- use of `cases.clientRole` as a security, tenant, ownership, or access-control boundary;
- use of `cases.clientRole` as a client-facing label without a future external mapper/privacy decision.

## Required next package

Recommended next package: `CASES-CLIENT-ROLE-INTERNAL-HARDEN-1`.

Scope for that future package:

- prove or add case-level authorization for `clientRole` reads on generic case list/detail/summary paths;
- prove or add manager/assigned-lawyer/privileged-role policy for `clientRole` writes on generic case create/update paths;
- add targeted tests for unauthenticated, unauthorized authenticated, assigned/manager, collaborator, admin, and partner paths as appropriate;
- keep Client Portal, external visibility, CP-SCHEMA-1, schema migration, OpenAPI/CORS changes, and production apply out of scope unless separately authorized.

## Follow-up — CASES-CLIENT-ROLE-INTERNAL-HARDEN-1

The internal hardening package adds the missing route boundary for this semantics decision:

- broad `GET /api/v1/cases` no longer returns `clientRole`;
- `GET /api/v1/cases/:caseId`, `GET /api/v1/cases/:caseId/summary`, and `GET /api/v1/cases/:caseId/workflow` require case-level read access before returning case data that can include `clientRole`;
- `PATCH /api/v1/cases/:caseId` requires case-manager access before updating `clientRole`;
- `POST /api/v1/cases` remains governed by the existing authenticated create-case rules;
- targeted backend tests cover unauthenticated, unauthorized, collaborator-read, assigned-lawyer-write, list-omission, workflow-guard, and create-auth cases.

This moves `cases.clientRole` at most to `hardened internal KEEP candidate`. It still does not authorize Client Portal exposure, external mapping, production apply, CP-SCHEMA-1, schema migration, enum conversion, or use as an authorization primitive.

Follow-up classification: `cases_client_role_authorization_hardened_no_db_change_no_migration_no_azure`.

## Non-actions

This decision did not:

- change schema;
- create a migration;
- connect to any DB;
- apply any DB change;
- read business data;
- touch Azure, Kudu, app settings, or deployment;
- change runtime behavior;
- change route behavior;
- change OpenAPI/CORS behavior;
- change frontend behavior;
- change tests;
- enable Client Portal;
- authorize CP-SCHEMA-1;
- authorize production apply.

## Final classification

`cases_client_role_semantics_decision_documented_no_db_change_no_runtime_change`
