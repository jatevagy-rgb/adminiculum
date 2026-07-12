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
