# Client Portal Implementation Checkpoint

## Purpose

This checkpoint records the current Client Portal implementation state after the static/mock frontend shell, frontend-local DTO foundation, disabled backend skeleton hardening, and UX closeouts.

It is documentation-only and authorizes no runtime change, frontend behavior change, backend behavior change, schema change, migration, database connection, production apply, CP-SCHEMA-1, Client Portal enablement, external visibility, Document/AI enablement, AI/provider call, SharePoint/export, or file-processing call.

## Current status

- Client Portal V1 is partially implemented only as a static/mock frontend and disabled backend skeleton.
- It is not live.
- It is not connected to backend APIs.
- It is not connected to a database.
- It is not externally visible.
- It is not production-enabled.
- It is not CP-SCHEMA-1 ready.

## Completed design artifacts

- Product boundary design.
- Current code inventory.
- V1 data contract.
- Authorization and grant model.
- UI/IA design.
- Schema readiness design.
- Runtime skeleton boundary design.
- Frontend shell design.
- Design rollup.

## Completed frontend implementation

Implemented static/mock route tree:

- `/portal`
- `/portal/matters`
- `/portal/matters/[matterId]`
- `/portal/documents`
- `/portal/uploads`

Implemented frontend support files:

- `Frontend/src/app/portal/PortalMockShell.tsx`
- `Frontend/src/app/portal/mockPortalData.ts`
- frontend-local Portal V1 DTO types in `mockPortalData.ts`

Current frontend posture:

- Static/mock only.
- Synthetic data only.
- No API calls.
- No internal API imports.
- No real data.
- No file input.
- No real upload implementation.
- No real download implementation.
- No message implementation.

## Completed backend implementation

Implemented disabled backend skeleton files:

- `Backend/src/modules/client-portal/featureGate.ts`
- `Backend/src/modules/client-portal/routes.ts`
- `Backend/src/modules/client-portal/types.ts`
- compatibility re-export at `Backend/src/routes/clientPortal.ts`

Current backend posture:

- Disabled/quarantined.
- Auth-first.
- Explicit runtime-ready gate required.
- `ENABLE_CLIENT_PORTAL` alone is insufficient.
- `ENABLE_CLIENT_PORTAL_OWNERSHIP_MODEL` is also insufficient without `ENABLE_CLIENT_PORTAL_RUNTIME_READY`.
- No Prisma business access.
- No service layer implementation.
- No live-data DTO mapper implementation.
- No upload implementation.
- No download implementation.
- No message implementation.

## Proven safety boundaries

- No `fetch(` in portal frontend files.
- No `@/lib/api` imports in portal frontend files.
- No `workspaceText` in portal frontend or backend Client Portal module files.
- No file input or form action in portal frontend files.
- No real data markers in portal frontend files.
- No internal Dashboard, CaseDetail, Litigation, Workload, Review, Compare, or Anonymize imports in portal frontend files.
- Unauthenticated backend Client Portal routes remain `401`.
- Authenticated disabled backend Client Portal routes remain `501 CLIENT_PORTAL_NOT_ENABLED`.
- `ENABLE_CLIENT_PORTAL` alone remains insufficient.
- `ENABLE_CLIENT_PORTAL_OWNERSHIP_MODEL` alone, or together with `ENABLE_CLIENT_PORTAL`, remains insufficient without `ENABLE_CLIENT_PORTAL_RUNTIME_READY`.
- Backend validation and tests pass.
- Frontend typecheck and build pass.

## What remains blocked

- Client Portal enablement.
- External visibility.
- CP-SCHEMA-1.
- Production apply.
- Schema migration.
- Database-backed grant model.
- Portal user, grant, share, upload request, and audit schema.
- Live backend services.
- Frontend API integration.
- Auth provider decision.
- Upload implementation.
- Download implementation.
- Messages.
- Notifications.
- Document preview.
- SharePoint/export.
- AI summaries.
- Retention and legal hold.

## No-go statement

- Do not enable the existing Client Portal by flags.
- Do not connect frontend mock routes to internal APIs.
- Do not reuse internal case, document, task, communication, workload, or review DTOs.
- Do not expose `documents.workspaceText`.
- Do not treat the mock portal as production-ready.
- Do not run production apply or CP-SCHEMA-1 without a separate readiness review.

## Safe next candidates

1. `CLIENT-PORTAL-MOCK-FRONTEND-ACCESSIBILITY-PASS-1`
   - Frontend-only polish.
   - No API.
   - No backend.

2. `CLIENT-PORTAL-BACKEND-DISABLED-DTO-STUBS-1`
   - Backend type/mapper stubs only.
   - Still disabled.
   - No Prisma.
   - No schema.

3. `CLIENT-PORTAL-SCHEMA-CANDIDATE-DESIGN-2`
   - Deeper schema candidate.
   - Docs-only.
   - No migration.

Safest recommended default:

`CLIENT-PORTAL-MOCK-FRONTEND-ACCESSIBILITY-PASS-1`

Reason: the portal is still mock and presentation-facing; an accessibility and responsiveness review improves demo quality without API, backend, schema, or DB risk.

## Final decision statement

Client Portal has a mock frontend and disabled backend skeleton. It remains non-live and non-enabled. No DB-backed portal exists. No external visibility is authorized. CP-SCHEMA-1 remains blocked. Production apply remains NO-GO.

## Non-actions

- No runtime changed.
- No frontend behavior changed.
- No backend behavior changed.
- No schema changed.
- No migration was created.
- No DB connection was used.
- No DB apply was performed.
- No business data was read.
- No Azure deployment or app setting changed.
- No OpenAPI/CORS behavior changed.
- No package changed.
- No Client Portal was enabled.
- No AI/provider call was made.
- No file processing was run.
- No SharePoint/Graph call was made.
- No export or generation job was run.

## Final classification

`client_portal_implementation_checkpoint_documented_no_runtime_no_db_no_enablement`

## Follow-up — CLIENT-PORTAL-MOCK-FRONTEND-ACCESSIBILITY-PASS-1

- `CLIENT-PORTAL-MOCK-FRONTEND-ACCESSIBILITY-PASS-1` improved accessibility and responsive review quality of the static/mock Client Portal route tree.
- The pass added clearer skip/content structure, page-level headings, labelled sections, list semantics for card collections, active navigation semantics, and clearer disabled-action affordances.
- The route tree remains frontend-only, synthetic-only, typed against frontend-local Portal V1 DTO types, and API-free.
- No backend API calls, internal API imports, `documents.workspaceText`, file input, real upload/download/message implementation, real data, backend/schema/migration/DB/Azure/OpenAPI/CORS/package change, external visibility, CP-SCHEMA-1 readiness, production apply readiness, or Client Portal backend enablement is authorized.

## Closeout — CLIENT-PORTAL-MOCK-FRONTEND-ACCESSIBILITY-CLOSEOUT-1

- `CLIENT-PORTAL-MOCK-FRONTEND-ACCESSIBILITY-CLOSEOUT-1` records the closeout (docs-only) of the frontend accessibility pass completed in `f8c63de`.
- The portal remains **mock frontend + disabled backend skeleton only** — not live, not API-integrated, not DB-backed, not externally visible, not production-enabled, not CP-SCHEMA-1 ready.
- **No API/DB/schema/enablement.** This closeout made no runtime, frontend behavior, backend behavior, schema, migration, database, Azure, OpenAPI, CORS, auth, package, or API-integration change.
- Safety re-verified: no `fetch(`, no `@/lib/api`, no `documents.workspaceText`, no `type="file"`, no form action, no internal Dashboard/CaseDetail/Litigation/Workload/Review/Compare/Anonymize imports across the portal route tree; no backend runtime, schema, or migration file required changes.
- Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked**.

## Foundation — CLIENT-PORTAL-BACKEND-DISABLED-DTO-STUBS-1

- `CLIENT-PORTAL-BACKEND-DISABLED-DTO-STUBS-1` added a **backend-local DTO type + mapper-boundary foundation only** inside `Backend/src/modules/client-portal/`:
  - `types.ts` — explicit allow-list V1 DTO interfaces (`PortalMeDto`, `PortalMatterListItemDto`, `PortalMatterDetailDto`, `PortalDocumentListItemDto`, `PortalDocumentDetailDto`, `PortalTaskDto`, `PortalUploadRequestDto`, deferred `PortalMessageThreadDto`), aligned with `docs/client-portal-v1-data-contract-design.md`.
  - `mappers.ts` — pure, disabled-safe mapper functions from **local explicit source shapes** (not Prisma models, not internal DTOs) to those DTOs; explicit-field returns only (no object spread), no Prisma import, no DB query, no `workspaceText` access.
  - `tests/clientPortalDtoMappers.test.ts` — proves each mapper returns only its allow-list keys, drops forbidden input fields (`workspaceText`/`internalNote`/`storagePath`/`sharePointPath`/`workload`/`collaborator`/`rawText`/`extractedText`/…), the synthetic `workspaceText` marker never survives, and the module source imports no Prisma/DB/services.
- **No API implementation. No Prisma/DB business access. No schema/migration. No frontend API integration.** The mappers are **not wired into any live route**; existing disabled `401`/`501 CLIENT_PORTAL_NOT_ENABLED` behavior and the triple-flag runtime-ready gate are unchanged.
- Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked**.

## Closeout — CLIENT-PORTAL-BACKEND-DTO-STUBS-CLOSEOUT-1

- `CLIENT-PORTAL-BACKEND-DTO-STUBS-CLOSEOUT-1` records (docs-only) the closeout of the backend DTO/mapper foundation (`3bdab60`).
- The backend now has DTO/mapper **stubs** (allow-list `types.ts`, pure `mappers.ts` from local explicit source shapes, no Prisma import/query, not wired into routes), but the portal remains **mock frontend + disabled backend skeleton only** — not live, not API-integrated, not DB-backed, not externally visible, not production-enabled, not CP-SCHEMA-1 ready.
- **No API/DB/schema/enablement.** The active runtime boundary stays `401` (unauthenticated) / `501 CLIENT_PORTAL_NOT_ENABLED` (authenticated, disabled), and the triple runtime-ready gate is unchanged.
- Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked**.

## Design — CLIENT-PORTAL-SCHEMA-CANDIDATE-DESIGN-2

- `CLIENT-PORTAL-SCHEMA-CANDIDATE-DESIGN-2` created `docs/client-portal-schema-candidate-design-2.md`, a docs-only refined schema candidate model.
- A **schema candidate design exists, but no DB-backed portal exists** — no schema change, no migration, no DB connection, no runtime service. The portal remains mock frontend + disabled backend skeleton only.
- Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked**.

## Design — CLIENT-PORTAL-BACKEND-DISABLED-SERVICE-STUBS-DESIGN-1

- `CLIENT-PORTAL-BACKEND-DISABLED-SERVICE-STUBS-DESIGN-1` created `docs/client-portal-backend-service-stubs-design.md`, a docs-only design of the future backend service boundary (conceptual service files/functions, authorization-before-service order, candidate data dependencies, forbidden behavior, and required future tests).
- A **backend service-stubs design exists, but no service implementation or DB-backed portal exists** — no service layer, no schema, no migration, no DB, no runtime/API change. The active route boundary stays `401`/`501 CLIENT_PORTAL_NOT_ENABLED`.
- Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked**.

## Demo review — CLIENT-PORTAL-MOCK-DEMO-REVIEW-PASS-1

- `CLIENT-PORTAL-MOCK-DEMO-REVIEW-PASS-1` reviewed the static/mock Client Portal route tree as a stakeholder demo surface and confirmed it is demo-ready (dev-preview/synthetic notice everywhere, disabled/deferred actions labelled, metadata-only documents, non-functional uploads, non-enumerating unknown-matter state, client-facing Hungarian copy). One small semantic consistency fix (added `aria-disabled="true"` to the two inline disabled buttons on the home page).
- The portal remains **frontend-only, synthetic-only, API-free**; there is **no service implementation and no DB-backed portal**. No backend integration, schema, migration, DB, API integration, external visibility, CP-SCHEMA-1, or production apply was authorized.
- Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked**.

## Implementation — CLIENT-PORTAL-BACKEND-DISABLED-SERVICE-STUBS-1

- `CLIENT-PORTAL-BACKEND-DISABLED-SERVICE-STUBS-1` added **disabled backend service stubs only** (`Backend/src/modules/client-portal/services.ts` + `Backend/tests/clientPortalServiceStubs.test.ts`). This is **not live service implementation**.
- Every stub **fails closed** with `CLIENT_PORTAL_SERVICE_NOT_IMPLEMENTED` (status `501`, content-free message). Stubs import no Prisma, run no DB query, call no mapper, and import no internal case/document/task service or DTO. **Services are not wired into routes.**
- The active runtime remains `401`/`501 CLIENT_PORTAL_NOT_ENABLED`; the triple runtime-ready gate is unchanged (no flag weakened). No schema/migration/DB, no frontend API integration, no upload/download/message implementation.
- Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked**.

## Implementation — CLIENT-PORTAL-BACKEND-DISABLED-ROUTE-MATRIX-1

- `CLIENT-PORTAL-BACKEND-DISABLED-ROUTE-MATRIX-1` added **disabled Client Portal V1 route placeholders only** to `routes.ts` (`/me`, `/matters`, `/matters/:matterRef`, `/matters/:matterRef/documents`, `/documents/:documentRef`, `/tasks`, `/tasks/:taskRef/complete`, `/uploads`; deferred `/uploads/:uploadRequestRef/files`, `/messages`, `/messages/:threadRef/replies`).
- The **route matrix is inert and auth-first**: unauthenticated calls return `401`, and authenticated calls still return `501 CLIENT_PORTAL_NOT_ENABLED` via the runtime-ready gate. Handlers **call no service, no mapper, no Prisma, no DB** and return no synthetic data. Flag insufficiency is unchanged (no flag weakened).
- Tests (`Backend/tests/clientPortalDisabledRouteMatrix.test.ts`) prove the matrix is inert; existing `routeFeatureGuards` tests still pass. No schema/migration, no frontend API integration, no upload/download/message implementation.
- Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked**.

## Checkpoint — CLIENT-PORTAL-INERT-API-SHELL-CHECKPOINT-1

- `CLIENT-PORTAL-INERT-API-SHELL-CHECKPOINT-1` created `docs/client-portal-inert-api-shell-checkpoint.md`, recording the current **inert API shell**.
- The three layers — frontend mock shell, inert backend route matrix, and fail-closed backend service stubs — are all present, with DTO/mappers unwired. **There is no live portal**: routes stay `401`/`501 CLIENT_PORTAL_NOT_ENABLED`, stubs fail closed, and no route calls a service, mapper, or Prisma.
- No runtime/frontend/schema/migration/DB change was made. Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked**.

## Design — CLIENT-PORTAL-AUTHZ-STUB-DESIGN-2

- `CLIENT-PORTAL-AUTHZ-STUB-DESIGN-2` created `docs/client-portal-authz-stub-design-2.md`, an **authz/principal boundary design** for the future `authorization.ts` module (principal concept, module shape, authorization order, grant-check functions, content-free errors, non-enumeration rule, tests).
- **No runtime authz implementation exists** — no `authorization.ts`, no route/service wiring, no schema/migration, no DB. The inert shell is unchanged: routes stay `401`/`501 CLIENT_PORTAL_NOT_ENABLED`.
- Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked**.

## Implementation — CLIENT-PORTAL-AUTHZ-FAIL-CLOSED-STUBS-1

- `CLIENT-PORTAL-AUTHZ-FAIL-CLOSED-STUBS-1` added **fail-closed backend authorization stubs only** (`Backend/src/modules/client-portal/authorization.ts` + `Backend/tests/clientPortalAuthorizationStubs.test.ts`). This is **not live authorization**.
- Every stub **fails closed** with a content-free error (`CLIENT_PORTAL_PRINCIPAL_NOT_READY` 501 / `CLIENT_PORTAL_ACCESS_DENIED` 403); input refs never leak. The module imports no Prisma/DB/internal/service/mapper and is **not wired into routes or services**; the runtime stays `401`/`501 CLIENT_PORTAL_NOT_ENABLED`.
- No schema/migration, no DB, no frontend API integration, no upload/download/message implementation. Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked**.

## Plan — CLIENT-PORTAL-CP-SCHEMA-1-MIGRATION-PLAN-DRAFT-1

- `CLIENT-PORTAL-CP-SCHEMA-1-MIGRATION-PLAN-DRAFT-1` created `docs/client-portal-cp-schema-1-migration-plan-draft.md`, a docs-only CP-SCHEMA-1 migration plan draft (candidate scope, sequencing, model-by-model risks, index/constraint plan, privacy gates, clone rehearsal, rollback strategy, blockers).
- **A CP-SCHEMA-1 migration plan draft exists; there is still no DB-backed portal** — no `schema.prisma` edit, no migration, no DB, no migration command. The inert shell is unchanged (routes stay `401`/`501 CLIENT_PORTAL_NOT_ENABLED`).
- Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked**.

## Decision — CLIENT-PORTAL-CP-SCHEMA-1-MODEL-NAMING-DECISION-1

- `CLIENT-PORTAL-CP-SCHEMA-1-MODEL-NAMING-DECISION-1` created `docs/client-portal-cp-schema-1-model-naming-decision.md`, freezing the future CP-SCHEMA-1 model naming to explicit `ClientPortal*` names (with refined per-surface semantics; ambiguous `ClientPortalMembership`/`ClientVisibleArtifact` avoided).
- **A CP-SCHEMA-1 naming decision exists; there is still no DB-backed portal** — no `schema.prisma` edit, no migration, no DB. The inert shell is unchanged.
- Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked**.

## Plan — CLIENT-PORTAL-CP-SCHEMA-1-FIELD-SPEC-DRAFT-1

- `CLIENT-PORTAL-CP-SCHEMA-1-FIELD-SPEC-DRAFT-1` created `docs/client-portal-cp-schema-1-field-spec-draft.md`, a docs-only field-level spec draft for the frozen `ClientPortal*` models (per-model field tables, candidate enums, index/constraint draft, forbidden-field list).
- **A CP-SCHEMA-1 field spec draft exists; there is still no DB-backed portal** — no `schema.prisma` edit, no migration, no DB. The inert shell is unchanged.
- Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked**.

## Decision — CLIENT-PORTAL-CP-SCHEMA-1-ENUM-AND-REF-DECISION-1

- `CLIENT-PORTAL-CP-SCHEMA-1-ENUM-AND-REF-DECISION-1` created `docs/client-portal-cp-schema-1-enum-and-ref-decision.md`, deciding CP-SCHEMA-1 enum values and the external-safe ref strategy (opaque, prefixed, unique/indexed refs distinct from internal IDs; per-status enum values; client-facing mapping rule).
- **A CP-SCHEMA-1 enum/ref decision exists; there is still no DB-backed portal** — no `schema.prisma` edit, no migration, no DB, no ref generator implemented. The inert shell is unchanged.
- Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked**.

## Plan — CLIENT-PORTAL-CP-SCHEMA-1-RELATION-AND-INDEX-SPEC-DRAFT-1

- `CLIENT-PORTAL-CP-SCHEMA-1-RELATION-AND-INDEX-SPEC-DRAFT-1` created `docs/client-portal-cp-schema-1-relation-and-index-spec-draft.md`, a docs-only relation/index/cascade spec draft (candidate relation map, per-model relations/indexes/cascades, cross-model security invariants).
- **A CP-SCHEMA-1 relation/index spec draft exists; there is still no DB-backed portal** — no `schema.prisma` edit, no migration, no DB. The inert shell is unchanged.
- Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked**.

## Checkpoint — CLIENT-PORTAL-CP-SCHEMA-1-READINESS-CHECKPOINT-2

- `CLIENT-PORTAL-CP-SCHEMA-1-READINESS-CHECKPOINT-2` created `docs/client-portal-cp-schema-1-readiness-checkpoint-2.md`, consolidating all pre-schema planning (completed decisions, frozen naming/fields/enums/refs/relations, inert baseline, unresolved items, migration readiness gates, production-apply blockers). Conclusion: better prepared, **but CP-SCHEMA-1 still not authorized**.
- **A CP-SCHEMA-1 readiness checkpoint exists; there is still no DB-backed portal** — no `schema.prisma` edit, no migration, no DB. The inert shell is unchanged.
- Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked**.

## Package — CLIENT-PORTAL-CP-SCHEMA-1-APPROVAL-AND-NONAPPLIED-PRISMA-DRAFT-1

- `CLIENT-PORTAL-CP-SCHEMA-1-APPROVAL-AND-NONAPPLIED-PRISMA-DRAFT-1` created the CP-SCHEMA-1 approval package: **human approval packet, non-applied Prisma draft (markdown-only), risk register, and next-gates plan**.
- **The approval packet / non-applied draft / risk register / gates exist; there is still no DB-backed portal** — no `schema.prisma` edit, no migration, no DB, no generated Prisma artifact. The inert shell is unchanged.
- Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked**.

## Strategy — CLIENT-PORTAL-CP-SCHEMA-1-COLLISION-RESOLUTION-AND-PATCH-STRATEGY-1

- `CLIENT-PORTAL-CP-SCHEMA-1-COLLISION-RESOLUTION-AND-PATCH-STRATEGY-1` created the docs-only collision package: **collision-resolution and patch strategy** (recommended Option C — replacement/normalization, human approval + clone verification required), the **exact legacy candidate block inventory** (7 models, 16 enums, `@@map` tables, cascade/Json findings), and the **schema patch review checklist**.
- **A collision strategy exists; there is still no DB-backed portal** — no `schema.prisma` edit, no migration, no DB. The inert shell is unchanged.
- Client Portal backend remains disabled/quarantined; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked**.

## Guard — CLIENT-PORTAL-INERT-SHELL-STATIC-GUARDS-1

- `CLIENT-PORTAL-INERT-SHELL-STATIC-GUARDS-1` added `Backend/tests/clientPortalInertShellStaticGuards.test.ts`, a consolidated static guard suite for the disabled Client Portal shell.
- The test suite checks that routes stay auth-first/gate-first and unwired from authz/services/mappers/Prisma; service/authz/mapper stubs stay isolated from internal modules and Prisma; frontend `/portal*` stays synthetic/static with no API calls, `@/lib/api`, file input, form behavior, `workspaceText`, or internal app component reuse.
- This is a safety guard only. It does not enable runtime behavior, connect frontend to backend, add schema/migration/DB access, or authorize CP-SCHEMA-1.
- Client Portal remains mock frontend + disabled backend skeleton only; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked**.

## Guard — CLIENT-PORTAL-CP-SCHEMA-1-BLOCK-ENFORCEMENT-AND-APPROVAL-READINESS-1

- `CLIENT-PORTAL-CP-SCHEMA-1-BLOCK-ENFORCEMENT-AND-APPROVAL-READINESS-1` added static schema-block guards proving CP-SCHEMA-1 remains blocked: the legacy collision block is still visible, final-only models are absent from `schema.prisma`, no new CP-SCHEMA-1 migration folder exists, and the non-applied Prisma draft stays markdown-only.
- It also added approval readiness and operator verification docs for a future human/clone evidence step. This does not create a DB-backed portal.
- Client Portal remains mock frontend + disabled backend skeleton only; external visibility remains unauthorized; **CP-SCHEMA-1 and production apply remain blocked**.
