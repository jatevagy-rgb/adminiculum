# Client Identity and Role Fields Audit

## Purpose

This document audits client identity fields and `cases.clientRole` for runtime exposure, privacy sensitivity, and authorization safety.

This is documentation-only. It makes no runtime change, no schema change, no migration, no DB connection, no production apply, no CP-SCHEMA-1 authorization, and no Client Portal enablement.

## Inputs

- `docs/production-schema-readonly-compare.md`
- `docs/present-compatible-keep-candidates-audit.md`
- `docs/production-compatible-baseline-human-decisions.md`
- `docs/partial-schema-drift-inventory.md`
- `docs/partial-schema-drift-triage.md`
- `Backend/prisma/schema.prisma`
- `Backend/src/index.ts`
- `Backend/src/modules/clients/routes.ts`
- `Backend/src/modules/cases/routes.ts`
- `Backend/src/modules/cases/services.ts`
- `Backend/src/modules/cases/authorization.ts`
- `Backend/src/routes/clientPortal.ts`
- `Backend/src/modules/anonymize/services.ts`
- `Frontend/src/lib/api.ts`
- `Frontend/src/lib/search.ts`
- `Frontend/src/app/clients/page.tsx`

No production DB, clone DB, Kudu, Azure, migration, smoke test, business-data query, file-processing job, AI/provider call, or SharePoint call was used.

## Confirmed baseline facts

- `PROD-SCHEMA-COMPARE-READONLY-1` records client identity fields as present-compatible: `clients.taxNumber`, `clients.companyRegistrationNumber`, `clients.authorizedRepresentative`, and `clients.color`.
- The same compare records `cases.clientRole` as present-compatible and nullable.
- `PRESENT-COMPATIBLE-KEEP-CANDIDATES-AUDIT-1` classified client identity fields and `cases.clientRole` as `KEEP-BUT-HARDEN candidate`, not `KEEP`.
- `CLIENTS-COLOR-INTERNAL-KEEP-DECISION-1` moved only `clients.color` to narrow internal `KEEP`; it did not include legal identity fields.
- Client Portal remains disabled/quarantined. `Backend/src/routes/clientPortal.ts` authenticates first and remains unavailable unless both the portal flag and separate ownership-model flag are enabled.
- Production apply and CP-SCHEMA-1 remain blocked.
- Present-compatible metadata does not automatically promote these fields to `KEEP`.

## Field inventory

| Field / group | Model / table | Production metadata result | Repo/schema evidence | Expected meaning | Sensitivity | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `taxNumber` | `Client` / `clients` | Present-compatible | `Backend/prisma/schema.prisma` defines `Client.taxNumber`; client routes read/write it. | Legal/business tax identifier. | PRIVACY-SENSITIVE | Internal client-management metadata; not a portal identity model. |
| `companyRegistrationNumber` | `Client` / `clients` | Present-compatible | `Backend/prisma/schema.prisma` defines `Client.companyRegistrationNumber`; client routes read/write it. | Company registration identifier. | PRIVACY-SENSITIVE | Can identify business client and link them to matters. |
| `authorizedRepresentative` | `Client` / `clients` | Present-compatible | `Backend/prisma/schema.prisma` defines `Client.authorizedRepresentative`; client routes read/write it. | Person/representative authorized for the client. | PRIVACY-SENSITIVE | May be personal data and client relationship evidence. |
| Nearby client contact fields: `email`, `phone`, `address`, `contactPerson`, `company`, `vatNumber` | `Client` / `clients` | Not the named present-compatible target set in this audit, but present in Prisma | `Backend/prisma/schema.prisma` defines them; client routes and frontend display/edit several of them. | Client contact and business identity details. | PRIVACY-SENSITIVE | Important adjacent exposure context because routes often return whole client records. |
| `color` | `Client` / `clients` | Present-compatible | Separately decided in `CLIENTS-COLOR-INTERNAL-KEEP-DECISION-1`. | Internal visual metadata. | LOW when isolated | Out of scope except to confirm it is not bundled with identity fields. |
| `clientRole` | `Case` / `cases` | Present-compatible | `Backend/prisma/schema.prisma` defines `Case.clientRole`; cases service returns and mutates it; anonymize service uses it. | Case-level client/party role or legal-side context. | PRIVACY-SENSITIVE | Semantics are underdefined; may reveal client/counterparty/legal position. |

## Usage inventory

| Area | File(s) | Field(s) | Read/write | Route/API exposure | Auth evidence | Case/client/role scoping evidence | External exposure risk | Risk level | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Client list | `Backend/src/modules/clients/routes.ts` | `taxNumber`, `companyRegistrationNumber`, `authorizedRepresentative`, `contactPerson`; plus base `email`, `phone`, `address` | Read | `GET /api/v1/clients` | Uses `authenticate`. | No separate client ownership, need-to-know, assigned-lawyer, or role-scope check observed in the route. | Internal route; Client Portal route is separate and gate-off. | MEDIUM + PRIVACY-SENSITIVE | Optional identity enrichment catches schema drift and returns identity fields when present. |
| Client detail | `Backend/src/modules/clients/routes.ts` | Whole `Client` record, including identity/contact fields if present | Read | `GET /api/v1/clients/:clientId` | Uses `authenticate`. | No separate client-level authorization observed. | Internal route; no external mapper observed. | MEDIUM + PRIVACY-SENSITIVE | Whole-record response means adjacent fields may be exposed beyond the named candidate set. |
| Client create | `Backend/src/modules/clients/routes.ts` | `taxNumber`, `companyRegistrationNumber`, `authorizedRepresentative`, `contactPerson`, `email`, `phone`, `address` | Write | `POST /api/v1/clients` | Uses `authenticate`. | No role-scoped create policy observed. | Internal route. | MEDIUM + PRIVACY-SENSITIVE | Mutates legal/client identity fields with general auth only. |
| Client update | `Backend/src/modules/clients/routes.ts` | `taxNumber`, `companyRegistrationNumber`, `authorizedRepresentative`, `contactPerson`, `email`, `phone`, `address` | Write | `PATCH /api/v1/clients/:clientId` | Uses `authenticate`. | No role-scoped update or client ownership check observed. | Internal route. | MEDIUM + PRIVACY-SENSITIVE | Strong candidate for future hardening before KEEP. |
| Client frontend display/edit | `Frontend/src/app/clients/page.tsx`, `Frontend/src/lib/api.ts` | Client identity/contact fields | Read/write via API client | Internal authenticated frontend clients page | Frontend wrapped in authenticated app; backend routes enforce auth. | No frontend-enforced ownership model should be treated as authorization. | Not Client Portal. | MEDIUM + PRIVACY-SENSITIVE | UI displays tax/registration/contact data and edits identity fields. |
| Global frontend search | `Frontend/src/lib/search.ts` | `email`, `taxNumber`, `companyRegistrationNumber` | Read/display | Local search over already-loaded client data | Depends on prior internal client data load. | No extra filtering observed. | Not external by itself. | MEDIUM + PRIVACY-SENSITIVE | Search makes identity fields discoverable to any internal user who can load clients. |
| Case list/detail | `Backend/src/modules/cases/routes.ts`, `Backend/src/modules/cases/services.ts`, `Frontend/src/lib/api.ts` | `clientRole` | Read | `GET /api/v1/cases`, `GET /api/v1/cases/:caseId`, summary DTOs | Uses `authenticate`. | Generic case list/detail routes inspected do not use `requireCaseReadAccess`; collaborator routes do. | Internal route; not Client Portal. | MEDIUM + PRIVACY-SENSITIVE | `clientRole` is included in case DTOs and can reveal party/legal-side context. |
| Case create/update | `Backend/src/modules/cases/routes.ts`, `Backend/src/modules/cases/services.ts`, `Frontend/src/lib/api.ts` | `clientRole` | Write | `POST /api/v1/cases`, `PATCH /api/v1/cases/:caseId` | Uses `authenticate`; create requires `userId`. | Generic update path inspected does not apply case-level manager/read authorization before updating `clientRole`. | Internal route. | MEDIUM + PRIVACY-SENSITIVE | Mutating party-role semantics should have a stronger case-level policy before KEEP. |
| Case timeline side effect | `Backend/src/modules/cases/services.ts` | `clientRole` | Write/read via timeline payload | Created during case update | Same route/auth path as case update. | No additional timeline-specific mapper observed. | Internal route. | MEDIUM + PRIVACY-SENSITIVE | Timeline payload may preserve role-change text. |
| Anonymization targeting | `Backend/src/modules/anonymize/services.ts` | `clientRole`; client contact fields; redaction profile identifiers | Read/use | Internal anonymize service paths | Anonymize routes are in the document/AI privacy boundary and separately hardened/default-disabled. | Route-level case/document authorization is outside this audit; service uses case/client data for candidate building. | Not Client Portal; high privacy context. | PRIVACY-SENSITIVE | `clientRole` affects redaction candidate semantics; wrong values may affect privacy behavior. |
| Client Portal | `Backend/src/routes/clientPortal.ts`, `Backend/src/index.ts` | No direct use found in current route module while disabled | Guarded/quarantined exposure | `/api/v1/client-portal` | `router.use(authenticate)` plus default unavailable feature gate. | Requires separate ownership-model flag; no Prisma queries while disabled according to route comments and code shape. | Guarded/quarantined. | LOW current reachability, HIGH if reused later | Client identity fields must not be reused as the portal security model. |
| Public OpenAPI metadata | `Backend/src/index.ts` and exposure hardening docs | Unknown exact served sanitized shape in this audit | Metadata exposure only | `/api/v1/openapi.json`, `/openapi.json` | OpenAPI JSON is served unauthenticated, but prior hardening sanitizes quarantined/admin/stale operations. | Not a data route. | Metadata-only risk. | UNKNOWN / QUARANTINED BOUNDARY | This audit did not modify or regenerate OpenAPI; final served shape was not smoke-tested. |

## Authorization and exposure findings

- General authentication exists on inspected client routes and generic case routes.
- Client routes are broad internal routes: list, detail, create, update, and delete use `authenticate`, but no client ownership, need-to-know, assigned-lawyer, case membership, admin/partner, or manager-only policy was observed in `Backend/src/modules/clients/routes.ts`.
- Generic case list/detail/create/update routes use `authenticate`, but the inspected `clientRole` update path does not apply the existing `requireCaseReadAccess` or collaborator manager middleware.
- Case collaborator routes now have dedicated case-level authorization, but that hardening does not automatically cover generic case list/detail/update or client routes.
- No internal/external mapper was found that strips legal identity fields or `clientRole` for external/client-facing consumers.
- Client Portal routes remain disabled/quarantined and do not currently provide a reachable external path for these fields.
- Tests specifically targeting client identity field authorization or `clientRole` authorization were not identified in this audit.

## Privacy/security findings

- Client identity fields are legal/business identity data and may include personal data through representatives/contact persons.
- These fields can reveal client identity, business identifiers, contact details, and client/matter relationships.
- `cases.clientRole` can reveal the client or party's legal position, such as client/counterparty/opposing-side context. It also influences anonymization/redaction candidate selection.
- Internal-only use may be product-reasonable, but current evidence shows broad authenticated internal reachability rather than a narrow client/case need-to-know model.
- These fields are not safe for Client Portal or external exposure without a strict publication model, DTO mapper, field allowlist, ownership checks, and privacy/GDPR review.
- `clients.color` remains a separate low-sensitivity internal visual metadata decision and does not carry the legal identity fields with it.

## Decision lane

| Item | Decision lane | Rationale |
| --- | --- | --- |
| Client identity fields (`clients.taxNumber`, `clients.companyRegistrationNumber`, `clients.authorizedRepresentative`, plus adjacent contact fields when returned with client DTOs) | `KEEP-BUT-HARDEN candidate` | Production metadata is present-compatible and active internal client-management routes use the fields, but current routes appear broadly authenticated without a dedicated client/case need-to-know or role-scoped authorization policy. Treat as internal-only and privacy-sensitive until hardening/tests prove the intended access boundary. |
| `cases.clientRole` | `KEEP-BUT-HARDEN candidate` + `NEEDS PRODUCT DECISION` | Production metadata is present-compatible and the field is active in case DTOs, create/update flows, timeline payloads, and anonymization targeting. Semantics and allowed values are underdefined, and generic case update does not show a dedicated case manager/role policy for changing it. |

Neither item moves to `KEEP` in this audit.


## Follow-up — CASES-CLIENT-ROLE-SEMANTICS-DECISION-1

`docs/cases-client-role-semantics-decision.md` reviewed the product/data-model meaning of `cases.clientRole` and selected Option A: internal matter-party metadata. The field remains internal-only and remains a `KEEP-BUT-HARDEN candidate`; the semantics decision does not change this audit's authorization/privacy findings, does not move the field to `KEEP`, and does not authorize Client Portal, external visibility, CP-SCHEMA-1, production apply, schema migration, route changes, or frontend changes.

## Required next packages

1. `CLIENT-IDENTITY-FIELDS-HARDEN-1`
   - Add or prove internal client/case-level authorization for client identity field reads/writes.
   - Decide whether client identity create/update requires `ADMIN`, `PARTNER`, assigned lawyer, case collaborator, or another internal role.
   - Verify DTO boundaries for client list/detail/search.
   - Add tests for unauthenticated, ordinary authenticated, unauthorized, and authorized internal users.
   - No schema change unless separately justified.

2. `CASES-CLIENT-ROLE-INTERNAL-HARDEN-1`
   - Use the internal matter-party metadata semantics decided in `docs/cases-client-role-semantics-decision.md`.
   - Add or prove case-level authorization for reading/updating `clientRole` on generic case routes.
   - Verify create/update rules and targeted tests.
   - Keep Client Portal and external exposure out of scope.

Only after those packages should a future `CLIENT-IDENTITY-INTERNAL-KEEP-DECISION-1` or `CASES-CLIENT-ROLE-INTERNAL-KEEP-DECISION-1` be considered.

## Non-actions

This audit did not:

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
- authorize production apply;
- authorize external/client-facing use of client identity fields or `cases.clientRole`.

## Final classification

`client_identity_role_fields_audited_no_db_change_no_runtime_change`
