# Client Portal Design Rollup

## Purpose

This document is the final design rollup for a possible future Adminiculum Client Portal V1. It is documentation-only.

This document makes no frontend implementation, no backend implementation, no runtime change, no schema change, no migration, no DB connection, no production apply, no CP-SCHEMA-1 authorization, no Client Portal enablement, no external visibility authorization, no Document/AI enablement, no AI/provider call, and no SharePoint/export/file-processing call.

## Inputs

- `docs/client-portal-product-boundary-design.md`
- `docs/client-portal-current-code-inventory.md`
- `docs/client-portal-v1-data-contract-design.md`
- `docs/client-portal-authz-model-design.md`
- `docs/client-portal-v1-ui-ia-design.md`
- `docs/client-portal-schema-readiness-design.md`
- `docs/client-portal-runtime-skeleton-harden-design.md`
- `docs/client-portal-frontend-shell-design.md`
- `docs/production-compatible-baseline-final-rollup.md`
- `docs/production-apply-no-go-reconfirmation.md`

## Current Status

- Client Portal remains disabled and quarantined.
- Backend skeleton remains disabled and double-gated.
- No Client Portal service module exists.
- No frontend portal exists.
- No approved/applied/runtime grant schema exists.
- No Client Portal schema migration exists.
- All V1 portal work so far is documentation/design only.
- CP-SCHEMA-1 remains blocked.
- Production apply remains NO-GO.
- External visibility remains unauthorized.

## Completed Design Chain

| Package | Commit | Short result | Non-authorizations |
| --- | --- | --- | --- |
| Product boundary | `1c2f8f1` | Defined Client Portal as a future safe external matter-status and client-action surface. | No enablement, schema, runtime, frontend, external visibility, or production apply. |
| Current code inventory | `9dd195e` | Confirmed existing backend route is mounted, auth-first, double-gated, disabled, and not V1-ready. | No route behavior change, no service module, no frontend route, no flag-based enablement. |
| V1 data contract | `5d9899e` | Defined conceptual allow-list DTOs and forbidden global fields. | No API implementation, schema, migration, OpenAPI exposure, or client-visible data. |
| Authorization/grant model | `104e7ee` | Defined portal principal, grants, revocation, non-enumeration, and endpoint-level checks. | No auth change, no grant implementation, no schema, no runtime enablement. |
| UI/IA | `ac5d014` | Defined future client-facing screens and empty/disabled states. | No frontend implementation, no internal component reuse authorization. |
| Schema readiness | `e4c73ca` | Mapped future portal identity, grant, publication, upload, task, message, and audit schema families. | No `schema.prisma` edit, no migration, CP-SCHEMA-1 still blocked. |
| Runtime skeleton boundary | `b8669f0` | Defined future backend module split, gate order, service/mapper/authz/audit boundaries, and tests. | No backend implementation, no service module, no enablement. |
| Frontend shell | `bece82b` | Defined future `/portal` shell, routes, safe components, visual reuse policy, and tests. | No frontend routes/components/API client, no data calls, no external visibility. |

## Product Definition

The Client Portal is a future safe external matter-status and client-action surface.

It is for:

- seeing the client's own granted matters;
- seeing safe client-facing status;
- seeing what requires attention;
- viewing explicitly shared documents;
- responding to upload requests;
- seeing client-visible deadlines;
- reading safe updates;
- viewing responsible lawyer/contact information.

It is not:

- an internal dashboard mirror;
- a document dump;
- an AI/legal-analysis surface;
- an internal workflow surface;
- a raw data exposure layer.

## Current Code Inventory Summary

- Existing route file: `Backend/src/routes/clientPortal.ts`.
- Mounted from `Backend/src/index.ts` under `/api/v1/client-portal`.
- Auth runs before feature checks.
- The route is double-gated and disabled/quarantined.
- Disabled authenticated requests return `501 FEATURE_NOT_AVAILABLE`, reason `CLIENT_PORTAL_NOT_ENABLED`.
- Existing tests prove unauthenticated `401`, authenticated disabled `501`, spoof protection, flag-alone insufficiency, and no Prisma while disabled.
- No `Backend/src/modules/client-portal` service module exists.
- No dedicated frontend portal route/component/API client exists in focused inventory.
- The route must not be enabled by feature flag alone.

## V1 Data Contract Summary

The V1 data contract is allow-list-only and external-client-specific.

Designed conceptual DTOs:

- `PortalMeDto`
- `PortalMatterListItemDto`
- `PortalMatterDetailDto`
- `PortalDocumentListItemDto`
- `PortalDocumentDetailDto`
- `PortalTaskDto`
- `PortalUploadRequestDto`
- Messages are deferred.

Forbidden global fields and categories:

- `documents.workspaceText`;
- raw extracted text;
- internal notes;
- internal task board;
- workload records;
- collaborators;
- legal analysis;
- AI prompt/output internals;
- audit logs;
- admin/ops data;
- internal communications unless explicitly shared through a later approved model;
- storage paths;
- SharePoint paths.

## Authorization Model Summary

The authorization model is grant-based and separate from internal lawyer authorization.

Designed concepts:

- portal principal independent of internal `UserRole.CLIENT`;
- explicit `PortalMatterAccessGrant`;
- explicit `PortalDocumentShare`;
- explicit `PortalUploadRequest`;
- `PortalClientTask` concept;
- messages deferred;
- no access by id guessing;
- no `clientId`, `caseId`, `matterId`, or `documentId` inference;
- internal roles do not automatically imply portal visibility;
- revoked, suspended, expired, or unverified access denies;
- non-enumerating `404` or equivalent for ungranted resources.

## UI / IA Summary

V1 screen design:

- Home
- Matters
- Matter detail
- Documents
- Uploads / Requests
- Messages deferred
- Profile optional

Home priority:

- needs attention;
- active matters;
- requested uploads;
- upcoming client-visible deadlines;
- recently shared documents;
- latest safe updates;
- responsible lawyer/contact.

The UI is not the internal dashboard, not an internal task board, not litigation workspace, and not raw document text access.

## Schema Readiness Summary

Future schema families likely needed:

- `PortalUser`
- `PortalMatterAccessGrant`
- `PortalMatterPublication`
- `PortalDocumentShare`
- `PortalUploadRequest`
- `PortalUploadedFile`
- `PortalClientTask`
- `PortalMessageThread` / `PortalMessage` deferred
- `PortalAuditEvent`
- external-safe identifiers
- retention and legal hold support

This is schema readiness only. No migration is authorized. CP-SCHEMA-1 remains blocked.

## Runtime Skeleton Boundary Summary

Future backend module boundary:

- `routes`
- `services`
- `authorization`
- `mappers`
- `types`
- `featureGate`
- `audit`
- tests for disabled boundary, authz, mappers, forbidden fields, and no internal leakage

Required gate order:

1. auth;
2. disabled/feature gate;
3. product/privacy gate;
4. resolve portal principal;
5. enforce active user;
6. enforce grant;
7. explicit select allow-list;
8. external mapper;
9. content-free audit/log;
10. response.

The current skeleton remains disabled. `ENABLE_CLIENT_PORTAL` alone must remain insufficient.

## Frontend Shell Summary

Future frontend shell design:

- separate portal layout from the internal app shell;
- conceptual `/portal` route tree;
- client-facing components for attention, matters, documents, uploads, safe updates, deadlines, contact, disabled states, and revoked access;
- visual primitive reuse is allowed only for content-neutral styling, spacing, typography, cards, badges, buttons, empty states, and skeletons;
- direct reuse of internal Dashboard, CaseDetail, task board, litigation workspace, document review/compare/anonymize UI, communication widgets, workload/team views, and admin/settings pages is forbidden;
- mock/static implementation, if later approved before backend enablement, must use synthetic data only;
- disabled and access-revoked states must be non-enumerating and content-free.

## What Remains Blocked

- Client Portal enablement.
- CP-SCHEMA-1.
- Production apply.
- Schema migration.
- Frontend implementation.
- Backend service implementation.
- External visibility.
- Document download implementation.
- Upload implementation.
- Messages.
- Notifications.
- AI summaries.
- SharePoint/export.
- Durable retention/legal hold.
- External auth provider decision.

## Safe Implementation Sequence, If Later Approved

1. `CLIENT-PORTAL-FRONTEND-SHELL-MOCK-IMPLEMENTATION-1`
   - Static/mock frontend shell only.
   - No API calls except possibly disabled-state handling.
   - Synthetic data only.
   - No backend enablement.
   - No schema.

2. `CLIENT-PORTAL-RUNTIME-SKELETON-HARDEN-1`
   - Refactor disabled backend skeleton into module boundary.
   - Keep disabled.
   - No schema.
   - No Prisma while disabled.

3. `CLIENT-PORTAL-DTO-TYPES-FOUNDATION-1`
   - TypeScript DTO types only.
   - No live data.
   - No schema.

4. `CLIENT-PORTAL-SCHEMA-CANDIDATE-DESIGN-2`
   - Deeper schema candidate.
   - Still no migration unless separately approved.

5. `CP-SCHEMA-1-READINESS-REVIEW-1`
   - Readiness review only.

6. Later only with explicit human approval:
   - migration candidate;
   - clone rehearsal;
   - runtime service implementation;
   - frontend API integration;
   - enablement readiness.

Safest next package if human approves code changes:

`CLIENT-PORTAL-FRONTEND-SHELL-MOCK-IMPLEMENTATION-1`

If no code should be started yet:

`CLIENT-PORTAL-IMPLEMENTATION-NO-GO-RECONFIRM-1`

## Final Decision Statement

Client Portal V1 is designed, not implemented. Client Portal remains disabled/quarantined. No frontend route/component is implemented. No backend service module is implemented. No schema migration is authorized. CP-SCHEMA-1 remains blocked. Production apply remains NO-GO. External visibility remains unauthorized. `documents.workspaceText` remains forbidden. The existing skeleton must not be enabled by flag alone.

## Follow-up — CLIENT-PORTAL-FRONTEND-SHELL-MOCK-IMPLEMENTATION-1

- `CLIENT-PORTAL-FRONTEND-SHELL-MOCK-IMPLEMENTATION-1` added a static/mock frontend shell at `/portal`.
- The shell uses synthetic data only and does not call backend APIs, internal case/document/task APIs, AI providers, SharePoint/Graph, uploads, downloads, or export jobs.
- The shell does not enable the Client Portal backend, does not authorize external visibility, does not authorize CP-SCHEMA-1, and does not change production apply readiness.
- `documents.workspaceText` remains forbidden and is not exposed by the mock shell.

## Follow-up — CLIENT-PORTAL-FRONTEND-MOCK-SHELL-SAFETY-POLISH-1

- `CLIENT-PORTAL-FRONTEND-MOCK-SHELL-SAFETY-POLISH-1` reviewed and polished the static/mock `/portal` shell.
- The polish keeps the shell frontend-only, synthetic-data-only, and API-free while making the development-preview notice, attention-first hierarchy, inactive upload/download actions, and deferred message/profile states clearer.
- No backend API calls, internal API imports, backend/schema/migration/DB/Azure/auth/OpenAPI/CORS changes, Client Portal backend enablement, external visibility, CP-SCHEMA-1 readiness, or production apply readiness are authorized.

## Follow-up — Client Portal mock subroutes

- Static/mock pages were added for `/portal/matters`, `/portal/matters/[matterId]`, `/portal/documents`, and `/portal/uploads`.
- The subroutes use synthetic mock data only and share the same no-API, no-backend-enable, no-real-data posture as `/portal`.
- They do not authorize backend implementation, schema changes, migrations, CP-SCHEMA-1, production apply, external visibility, real upload/download, or document-content display.

## Follow-up — CLIENT-PORTAL-FRONTEND-MOCK-ROUTES-SAFETY-CLOSEOUT-1

- `CLIENT-PORTAL-FRONTEND-MOCK-ROUTES-SAFETY-CLOSEOUT-1` reviewed the static/mock route tree:
  `/portal`, `/portal/matters`, `/portal/matters/[matterId]`, `/portal/documents`, and `/portal/uploads`.
- The route tree remains frontend-only, synthetic-data-only, API-free, and disconnected from internal case/document/task APIs.
- The closeout confirmed no backend/schema/migration/DB/Azure/auth/OpenAPI/CORS changes, no backend enablement, no external visibility authorization, no CP-SCHEMA-1 readiness, and no production apply readiness.

## Follow-up — CLIENT-PORTAL-RUNTIME-SKELETON-HARDEN-1

- `CLIENT-PORTAL-RUNTIME-SKELETON-HARDEN-1` created the disabled backend module boundary
  for the Client Portal skeleton.
- The backend remains auth-first, disabled/quarantined, and unavailable with
  `501 CLIENT_PORTAL_NOT_ENABLED` for authenticated requests before any Prisma or service
  access.
- `ENABLE_CLIENT_PORTAL` alone remains insufficient; ownership-model readiness is also
  not enough without the explicit runtime-readiness gate.
- No frontend API integration, real portal data access, schema/migration/DB changes,
  external visibility, CP-SCHEMA-1 readiness, or production apply readiness is authorized.

## Closeout — CLIENT-PORTAL-RUNTIME-SKELETON-CLOSEOUT-1

- Runtime skeleton hardening implementation completed at commit `28e7c73`.
- This does not change the design posture: Client Portal remains disabled/quarantined.
- `ENABLE_CLIENT_PORTAL_RUNTIME_READY` is documented as the additional runtime-readiness
  gate beyond `ENABLE_CLIENT_PORTAL` and `ENABLE_CLIENT_PORTAL_OWNERSHIP_MODEL`.
- No schema, DB, Prisma business access, frontend API integration, CP-SCHEMA-1,
  production apply, upload/download/message implementation, or external visibility is
  authorized.

## Non-actions

- No runtime changed.
- No schema changed.
- No migration was created.
- No DB connection was used.
- No DB apply was performed.
- No business data was read.
- No Azure deployment or app setting was changed.
- No route behavior changed.
- No OpenAPI/CORS behavior changed.
- No frontend changed.
- No tests changed.
- No Client Portal was enabled.
- No Document/AI flag was enabled.
- No AI/provider call was made.
- No file processing was run.
- No SharePoint/Graph call was made.
- No export or generation job was run.

## Final Classification

`client_portal_design_rollup_documented_no_db_change_no_runtime_change`

## Follow-up — CLIENT-PORTAL-DTO-TYPES-FOUNDATION-1

- Type-only V1 Client Portal DTOs now exist in the frontend mock shell boundary and are used by the synthetic mock data.
- This is contract alignment only: no backend route implementation, no frontend API client, no `fetch`, no real data access, no schema/migration/DB work, and no portal enablement.
- The DTO foundation keeps the same allow-list posture and does not authorize `documents.workspaceText`, internal notes, internal tasks, workload records, collaborators, legal analyses, AI internals, audit logs, storage paths, SharePoint paths, uploads/downloads, or messages.
- Client Portal remains disabled/quarantined; external visibility, CP-SCHEMA-1, and production apply remain blocked.

## Follow-up — CLIENT-PORTAL-FRONTEND-MOCK-UX-POLISH-1

- The static/mock Client Portal route tree was polished for client-facing clarity: shared shell/navigation, active-route affordance, improved responsive card hierarchy, safer unavailable states, and clearer disabled upload/download/message copy.
- It remains frontend-only and synthetic-data-only, and continues to use frontend-local Portal V1 DTO types.
- No backend API implementation, frontend API integration, `fetch`, internal API import, schema/migration/DB change, Prisma business access, upload/download/message implementation, OpenAPI/CORS exposure, Azure change, external visibility, CP-SCHEMA-1 readiness, production apply readiness, or Client Portal enablement is authorized.

## Closeout — CLIENT-PORTAL-FRONTEND-MOCK-UX-CLOSEOUT-1

- The polished static/mock Client Portal route tree was safety-reviewed after `CLIENT-PORTAL-FRONTEND-MOCK-UX-POLISH-1`.
- `/portal`, `/portal/matters`, `/portal/matters/[matterId]`, `/portal/documents`, and `/portal/uploads` remain frontend-only, synthetic-only, DTO-typed, and disconnected from backend/internal APIs.
- No `fetch`, `@/lib/api`, internal app API import, `workspaceText`, file input, real upload/download/message behavior, real data, backend/schema/migration/DB/Azure/OpenAPI/CORS/package change, CP-SCHEMA-1 readiness, production apply readiness, external visibility, or Client Portal enablement is authorized.

## Checkpoint — CLIENT-PORTAL-IMPLEMENTATION-CHECKPOINT-1

- `CLIENT-PORTAL-IMPLEMENTATION-CHECKPOINT-1` created `docs/client-portal-implementation-checkpoint.md`.
- The checkpoint confirms Client Portal is currently mock frontend plus disabled backend skeleton only.
- No backend API implementation, frontend API integration, schema/migration/DB work, CP-SCHEMA-1 readiness, production apply readiness, external visibility, or Client Portal enablement is authorized.

## Follow-up — CLIENT-PORTAL-MOCK-FRONTEND-ACCESSIBILITY-PASS-1

- The static/mock Client Portal route tree received an accessibility/responsive pass: skip/content structure, page-level headings, labelled sections, card-list semantics, active navigation semantics, and clearer disabled-action affordances.
- It remains frontend-only, synthetic-only, typed against frontend-local Portal V1 DTO types, and API-free.
- No backend API implementation, frontend API integration, internal API import, `workspaceText`, file input, real data, upload/download/message implementation, schema/migration/DB change, Azure/OpenAPI/CORS/package change, external visibility, CP-SCHEMA-1 readiness, production apply readiness, or Client Portal enablement is authorized.

## Closeout — CLIENT-PORTAL-MOCK-FRONTEND-ACCESSIBILITY-CLOSEOUT-1

- The accessibility pass closeout was completed (docs-only) after `f8c63de`.
- **It does not change product posture.** Client Portal remains **non-live, mock-only on the frontend, and disabled on the backend**.
- The static/mock route tree stays frontend-only, synthetic-only, DTO-typed, and API-free; no `fetch`, `@/lib/api`, `workspaceText`, file input, real data, or upload/download/message behavior was introduced, and no backend/schema/migration/DB/Azure/OpenAPI/CORS/package/auth change was made.
- External visibility remains unauthorized; CP-SCHEMA-1 and production apply remain blocked.

## Foundation — CLIENT-PORTAL-BACKEND-DISABLED-DTO-STUBS-1

- `CLIENT-PORTAL-BACKEND-DISABLED-DTO-STUBS-1` added a backend-local Client Portal V1 DTO type + mapper-boundary foundation (`Backend/src/modules/client-portal/types.ts`, `mappers.ts`, `tests/clientPortalDtoMappers.test.ts`).
- DTOs are explicit allow-list only; mappers are pure functions from local explicit source shapes (not Prisma models, not internal DTOs) with explicit-field returns (no spread), no Prisma import, no DB query, and no `workspaceText` access. Tests prove forbidden fields are dropped and no Prisma/DB access exists.
- This is **type/mapper foundation only** — no API implementation, no Prisma/DB business access, no schema/migration, no frontend API integration. Mappers are not wired into any live route; disabled `401`/`501` behavior and the triple-flag runtime-ready gate are unchanged.
- Client Portal remains non-live, mock-only on the frontend and disabled on the backend; external visibility remains unauthorized; CP-SCHEMA-1 and production apply remain blocked.

## Closeout — CLIENT-PORTAL-BACKEND-DTO-STUBS-CLOSEOUT-1

- `CLIENT-PORTAL-BACKEND-DTO-STUBS-CLOSEOUT-1` completed the docs-only closeout of the backend DTO/mapper foundation (`3bdab60`).
- The backend DTO/mapper foundation exists (allow-list `types.ts`, pure `mappers.ts` stubs), but **it does not change product posture**: Client Portal remains non-live, mock-only on the frontend and disabled on the backend.
- The existing runtime remains the `401` (unauthenticated) / `501 CLIENT_PORTAL_NOT_ENABLED` (authenticated, disabled) boundary; mappers are not wired into any route; the triple runtime-ready gate is unchanged (no flag weakened).
- No API implementation, frontend API integration, schema/migration/DB change, external visibility, or enablement is authorized; external visibility remains unauthorized; CP-SCHEMA-1 and production apply remain blocked.

## Design — CLIENT-PORTAL-SCHEMA-CANDIDATE-DESIGN-2

- `CLIENT-PORTAL-SCHEMA-CANDIDATE-DESIGN-2` created `docs/client-portal-schema-candidate-design-2.md`, a docs-only refined schema candidate model (candidate tables, relationships, fields, indexes, revocation/visibility/retention, migration risks, CP-SCHEMA-1 readiness checklist).
- **Schema candidate design 2 exists and does not change the no-go posture.** No `schema.prisma` edit, migration, DB, runtime, or API change was made.
- Client Portal remains non-live, mock-only on the frontend and disabled on the backend; external visibility remains unauthorized; CP-SCHEMA-1 remains blocked; production apply remains NO-GO.

## Design — CLIENT-PORTAL-BACKEND-DISABLED-SERVICE-STUBS-DESIGN-1

- `CLIENT-PORTAL-BACKEND-DISABLED-SERVICE-STUBS-DESIGN-1` created `docs/client-portal-backend-service-stubs-design.md`, a docs-only design of the future backend **service boundary** (conceptual service files/functions, grant-checks-before-service order, candidate schema/mapper dependencies, forbidden behavior, and future tests).
- **The service boundary design exists and does not change the no-go posture.** No service implementation, backend code, schema, migration, DB, or API change was made; mappers remain unwired.
- Client Portal remains non-live, mock-only on the frontend and disabled on the backend; external visibility remains unauthorized; CP-SCHEMA-1 remains blocked; production apply remains NO-GO.

## Demo review — CLIENT-PORTAL-MOCK-DEMO-REVIEW-PASS-1

- `CLIENT-PORTAL-MOCK-DEMO-REVIEW-PASS-1` reviewed the static/mock Client Portal route tree as a stakeholder demo surface and confirmed it is demo-ready; only a small semantic consistency fix was applied (added `aria-disabled="true"` to the two inline disabled buttons on the home page).
- **It remains frontend-only, synthetic-only, and API-free.** No backend integration, service implementation, schema, migration, DB, API call, real data, or internal-app component reuse was introduced.
- Client Portal remains non-live, mock-only on the frontend and disabled on the backend; external visibility remains unauthorized; CP-SCHEMA-1 remains blocked; production apply remains NO-GO.

## Implementation — CLIENT-PORTAL-BACKEND-DISABLED-SERVICE-STUBS-1

- `CLIENT-PORTAL-BACKEND-DISABLED-SERVICE-STUBS-1` added **disabled backend service stubs** (`Backend/src/modules/client-portal/services.ts`) that fail closed with `CLIENT_PORTAL_SERVICE_NOT_IMPLEMENTED` (501, content-free) and are **not wired into routes**. This is not live service implementation.
- The stubs import no Prisma, run no DB query, call no mapper, and import no internal case/document/task service or DTO. Existing route behavior stays `401`/`501 CLIENT_PORTAL_NOT_ENABLED`; the triple runtime-ready gate is unchanged.
- Client Portal remains non-live, mock-only on the frontend and disabled on the backend; external visibility remains unauthorized; CP-SCHEMA-1 remains blocked; production apply remains NO-GO.

## Implementation — CLIENT-PORTAL-BACKEND-DISABLED-ROUTE-MATRIX-1

- `CLIENT-PORTAL-BACKEND-DISABLED-ROUTE-MATRIX-1` added the **inert V1 route matrix** to `routes.ts` (me/matters/matter-detail/matter-documents/document-detail/tasks/task-complete/uploads; deferred uploads-files/messages/replies). Every route is auth-first and still returns `401` unauthenticated / `501 CLIENT_PORTAL_NOT_ENABLED` authenticated; handlers call no service, mapper, Prisma, or DB.
- **The route matrix does not change the no-go posture.** Flag insufficiency is unchanged (no flag weakened); a focused test proves the matrix is inert and existing `routeFeatureGuards` tests still pass.
- Client Portal remains non-live, mock-only on the frontend and disabled on the backend; external visibility remains unauthorized; CP-SCHEMA-1 remains blocked; production apply remains NO-GO.

## Checkpoint — CLIENT-PORTAL-INERT-API-SHELL-CHECKPOINT-1

- `CLIENT-PORTAL-INERT-API-SHELL-CHECKPOINT-1` created `docs/client-portal-inert-api-shell-checkpoint.md`, checkpointing the three inert layers (frontend mock shell, inert backend route matrix, fail-closed service stubs; DTO/mappers unwired).
- **The inert API shell exists and does not change the no-go posture.** No runtime/frontend/schema/migration/DB change; routes stay `401`/`501 CLIENT_PORTAL_NOT_ENABLED`.
- Client Portal remains non-live, mock-only on the frontend and disabled on the backend; external visibility remains unauthorized; CP-SCHEMA-1 remains blocked; production apply remains NO-GO.

## Design — CLIENT-PORTAL-AUTHZ-STUB-DESIGN-2

- `CLIENT-PORTAL-AUTHZ-STUB-DESIGN-2` created `docs/client-portal-authz-stub-design-2.md`, designing the future portal principal/grant-check boundary (conceptual `authorization.ts`, authorization order, grant-check functions, content-free errors, non-enumeration).
- **The authz stub design exists and does not change the no-go posture.** No `authorization.ts`, no route/service wiring, no schema/migration/DB change.
- Client Portal remains non-live, mock-only on the frontend and disabled on the backend; external visibility remains unauthorized; CP-SCHEMA-1 remains blocked; production apply remains NO-GO.

## Implementation — CLIENT-PORTAL-AUTHZ-FAIL-CLOSED-STUBS-1

- `CLIENT-PORTAL-AUTHZ-FAIL-CLOSED-STUBS-1` added the **fail-closed authorization stub module** (`Backend/src/modules/client-portal/authorization.ts`) that fails closed with content-free errors (principal-not-ready 501 / access-denied 403) and is **not wired into routes or services**. This is not live authorization.
- The module imports no Prisma/DB/internal/service/mapper; existing route behavior stays `401`/`501 CLIENT_PORTAL_NOT_ENABLED`; the triple runtime-ready gate is unchanged. A focused test proves the fail-closed boundary; existing route/matrix/service-stub tests still pass.
- Client Portal remains non-live, mock-only on the frontend and disabled on the backend; external visibility remains unauthorized; CP-SCHEMA-1 remains blocked; production apply remains NO-GO.

## Plan — CLIENT-PORTAL-CP-SCHEMA-1-MIGRATION-PLAN-DRAFT-1

- `CLIENT-PORTAL-CP-SCHEMA-1-MIGRATION-PLAN-DRAFT-1` created `docs/client-portal-cp-schema-1-migration-plan-draft.md`, a docs-only migration plan draft (sequencing, model-by-model risks, index/constraint plan, privacy gates, clone rehearsal, rollback, blockers).
- **The migration plan draft exists and does not change the no-go posture.** No `schema.prisma` edit, migration, DB, or migration command.
- Client Portal remains non-live, mock-only on the frontend and disabled on the backend; external visibility remains unauthorized; CP-SCHEMA-1 remains blocked; production apply remains NO-GO.

## Decision — CLIENT-PORTAL-CP-SCHEMA-1-MODEL-NAMING-DECISION-1

- `CLIENT-PORTAL-CP-SCHEMA-1-MODEL-NAMING-DECISION-1` created `docs/client-portal-cp-schema-1-model-naming-decision.md`, freezing the future model naming (explicit `ClientPortal*`, refined semantics) for planning purposes.
- **The model naming decision exists and does not change the no-go posture.** No `schema.prisma` edit, migration, DB, or migration command.
- Client Portal remains non-live, mock-only on the frontend and disabled on the backend; external visibility remains unauthorized; CP-SCHEMA-1 remains blocked; production apply remains NO-GO.

## Plan — CLIENT-PORTAL-CP-SCHEMA-1-FIELD-SPEC-DRAFT-1

- `CLIENT-PORTAL-CP-SCHEMA-1-FIELD-SPEC-DRAFT-1` created `docs/client-portal-cp-schema-1-field-spec-draft.md`, a docs-only field-level spec draft (per-model field tables, candidate enums, index/constraint draft, forbidden-field list).
- **The field spec draft exists and does not change the no-go posture.** No `schema.prisma` edit, migration, DB, or migration command.
- Client Portal remains non-live, mock-only on the frontend and disabled on the backend; external visibility remains unauthorized; CP-SCHEMA-1 remains blocked; production apply remains NO-GO.

## Decision — CLIENT-PORTAL-CP-SCHEMA-1-ENUM-AND-REF-DECISION-1

- `CLIENT-PORTAL-CP-SCHEMA-1-ENUM-AND-REF-DECISION-1` created `docs/client-portal-cp-schema-1-enum-and-ref-decision.md`, deciding CP-SCHEMA-1 enum values and the external-safe ref strategy.
- **The enum/ref decision exists and does not change the no-go posture.** No `schema.prisma` edit, migration, DB, migration command, or ref-generator implementation.
- Client Portal remains non-live, mock-only on the frontend and disabled on the backend; external visibility remains unauthorized; CP-SCHEMA-1 remains blocked; production apply remains NO-GO.

## Plan — CLIENT-PORTAL-CP-SCHEMA-1-RELATION-AND-INDEX-SPEC-DRAFT-1

- `CLIENT-PORTAL-CP-SCHEMA-1-RELATION-AND-INDEX-SPEC-DRAFT-1` created `docs/client-portal-cp-schema-1-relation-and-index-spec-draft.md`, a docs-only relation/index/cascade spec draft (per-model relations, index/uniqueness candidates, cascade cautions, cross-model security invariants).
- **The relation/index spec draft exists and does not change the no-go posture.** No `schema.prisma` edit, migration, DB, or migration command.
- Client Portal remains non-live, mock-only on the frontend and disabled on the backend; external visibility remains unauthorized; CP-SCHEMA-1 remains blocked; production apply remains NO-GO.

## Checkpoint — CLIENT-PORTAL-CP-SCHEMA-1-READINESS-CHECKPOINT-2

- `CLIENT-PORTAL-CP-SCHEMA-1-READINESS-CHECKPOINT-2` created `docs/client-portal-cp-schema-1-readiness-checkpoint-2.md`, consolidating all pre-schema planning and stating the project is better prepared but CP-SCHEMA-1 is still blocked.
- **The readiness checkpoint exists and does not change the no-go posture.** No `schema.prisma` edit, migration, DB, or migration command.
- Client Portal remains non-live, mock-only on the frontend and disabled on the backend; external visibility remains unauthorized; CP-SCHEMA-1 remains blocked; production apply remains NO-GO.

## Package — CLIENT-PORTAL-CP-SCHEMA-1-APPROVAL-AND-NONAPPLIED-PRISMA-DRAFT-1

- `CLIENT-PORTAL-CP-SCHEMA-1-APPROVAL-AND-NONAPPLIED-PRISMA-DRAFT-1` created the **CP-SCHEMA-1 approval package** (human approval packet, non-applied markdown-only Prisma draft, risk register, next-gates plan).
- **The approval package exists; the no-go posture is unchanged.** No `schema.prisma` edit, migration, DB, migration command, or generated Prisma artifact.
- Client Portal remains non-live, mock-only on the frontend and disabled on the backend; external visibility remains unauthorized; CP-SCHEMA-1 remains blocked; production apply remains NO-GO.

## Strategy — CLIENT-PORTAL-CP-SCHEMA-1-COLLISION-RESOLUTION-AND-PATCH-STRATEGY-1

- `CLIENT-PORTAL-CP-SCHEMA-1-COLLISION-RESOLUTION-AND-PATCH-STRATEGY-1` created the docs-only **collision-resolution and patch-strategy package** (strategy + legacy inventory + patch review checklist), resolving on paper how the legacy candidate block should be handled (recommended Option C — replacement/normalization, pending human approval and clone verification).
- **The collision strategy exists and does not change the no-go posture.** No `schema.prisma` edit, migration, DB, or migration command.
- Client Portal remains non-live, mock-only on the frontend and disabled on the backend; external visibility remains unauthorized; CP-SCHEMA-1 remains blocked; production apply remains NO-GO.

## Guard — CLIENT-PORTAL-INERT-SHELL-STATIC-GUARDS-1

- `CLIENT-PORTAL-INERT-SHELL-STATIC-GUARDS-1` added a consolidated static guard suite (`Backend/tests/clientPortalInertShellStaticGuards.test.ts`) around the current Client Portal mock frontend + inert backend shell.
- The guard covers backend route unwiring, authz/service/mapper isolation, absence of Prisma access, frontend API-free/static behavior, no upload/form behavior, no internal component reuse, no executable `workspaceText` references, and no mapper `...source` DTO spreading.
- **The guard strengthens the no-go posture without changing product behavior.** No schema/migration/DB, route/service/authz wiring, frontend API integration, OpenAPI/CORS, Azure, package, or runtime enablement was introduced.
- Client Portal remains non-live, mock-only on the frontend and disabled on the backend; external visibility remains unauthorized; CP-SCHEMA-1 remains blocked; production apply remains NO-GO.
