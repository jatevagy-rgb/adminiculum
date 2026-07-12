# Client Portal Inert API Shell Checkpoint

## Purpose

This is a **documentation-only** checkpoint of the current inert Client Portal
API shell. It makes:

- no runtime change;
- no frontend change;
- no schema change;
- no migration;
- no DB connection;
- no production apply;
- no CP-SCHEMA-1 authorization;
- no Client Portal enablement;
- no external visibility authorization.

It records the current state so a reviewer can see exactly what exists, what is
inert, and what remains blocked. It authorizes nothing.

## Current shell layers

The Client Portal currently exists as three inert layers with no live data path
between them.

### 1. Frontend mock shell

- static/mock route tree (`/portal`, `/portal/matters`,
  `/portal/matters/[matterId]`, `/portal/documents`, `/portal/uploads`);
- synthetic data only, typed against frontend-local Portal V1 DTO types;
- demo-ready (dev-preview/synthetic notice on every screen, disabled/deferred
  actions labelled, metadata-only documents, non-functional uploads,
  non-enumerating unknown-matter state);
- no API integration — no `fetch`, no `@/lib/api`; `/portal*` builds Static/SSG.

### 2. Backend inert route matrix

- future endpoint paths are explicit in `Backend/src/modules/client-portal/routes.ts`;
- **auth-first** (`authenticate` runs before anything);
- **disabled-gate first** (`requireClientPortalRuntimeReady` returns 501 before any
  handler);
- authenticated disabled requests return `501 CLIENT_PORTAL_NOT_ENABLED`;
- handlers are a shared inert `disabledPortalRoute` fallback — **no service, mapper,
  or Prisma calls**, no synthetic data.

### 3. Backend fail-closed service stubs

- future function names are explicit in
  `Backend/src/modules/client-portal/services.ts`;
- **direct calls fail closed** with `CLIENT_PORTAL_SERVICE_NOT_IMPLEMENTED`
  (status 501, content-free);
- **not route-wired** (`routes.ts` neither imports nor invokes them);
- no Prisma / no DB / no mapper / no internal DTO.

Supporting: backend-local allow-list DTO types (`types.ts`) and pure allow-list
mappers (`mappers.ts`) exist but are **not route-wired**.

## Current V1 route matrix

- `GET /me`
- `GET /matters`
- `GET /matters/:matterRef`
- `GET /matters/:matterRef/documents`
- `GET /documents/:documentRef`
- `GET /tasks`
- `POST /tasks/:taskRef/complete`
- `GET /uploads`
- deferred:
  - `POST /uploads/:uploadRequestRef/files`
  - `GET /messages`
  - `POST /messages/:threadRef/replies`

State:
- these are **placeholders only**;
- they are **not live API implementation**;
- they return `401` (unauthenticated) / `501 CLIENT_PORTAL_NOT_ENABLED`
  (authenticated) via the existing gates.

## Current proof points

- Backend tests are **21 suites / 229 tests** after the route matrix.
- The route-matrix test (`Backend/tests/clientPortalDisabledRouteMatrix.test.ts`)
  proves: `401` unauthenticated; `501 CLIENT_PORTAL_NOT_ENABLED` for every
  authenticated route; flag insufficiency (`ENABLE_CLIENT_PORTAL` alone and
  `+ ownership` without runtime-ready both still 501); `routes.ts` imports no
  services/mappers/Prisma; content-free responses (no data/ref/`workspaceText`
  leakage).
- The service-stub test (`Backend/tests/clientPortalServiceStubs.test.ts`) proves
  every stub fails closed with the content-free 501 and `services.ts` has no
  Prisma/DB/internal imports.
- The DTO-mapper test (`Backend/tests/clientPortalDtoMappers.test.ts`) proves
  allow-list-only mapper output.
- Frontend build remains **Static/SSG** for `/portal*`.

## What is not implemented

- PortalUser persistence;
- grant schema;
- document share schema;
- upload request schema;
- live authorization;
- service data access;
- route-to-service wiring;
- frontend API client;
- upload/download;
- messages;
- notifications;
- document preview;
- AI summaries;
- SharePoint/export;
- external visibility.

## Still blocked

- CP-SCHEMA-1;
- production apply;
- schema migration;
- DB-backed grant model;
- external auth provider decision;
- retention / legal-hold decision;
- upload storage / virus scanning;
- message privilege / retention;
- runtime enablement review;
- external visibility review.

## No-go statement

- **Do not enable the portal by flags.**
- **Do not connect frontend mock routes to internal APIs.**
- **Do not connect routes to services before schema/authz readiness.**
- **Do not use internal case/document/task DTOs** for portal responses.
- **Do not expose `documents.workspaceText`.**
- **Do not treat the inert shell as a live portal.**

## Safe next directions

1. `CLIENT-PORTAL-DISABLED-ROUTE-MATRIX-CLOSEOUT-1` — docs-only closeout of the
   route matrix.
2. `CLIENT-PORTAL-AUTHZ-STUB-DESIGN-2` — docs-only, or code only if explicitly
   approved; designs portal principal/grant-check function signatures without DB.
3. `CLIENT-PORTAL-CP-SCHEMA-1-MIGRATION-PLAN-DRAFT-1` — docs-only; no migration;
   a migration sequencing / rollback / clone-rehearsal plan.

**Most effective next default: `CLIENT-PORTAL-AUTHZ-STUB-DESIGN-2`.** Reason:
before any service route wiring or schema work, the portal needs a precise
authz/principal boundary design that can later sit between routes and services.

## Final decision statement

- The Client Portal now has an **inert API shell**.
- It is **not live**.
- It is **not DB-backed**.
- It is **not frontend-integrated**.
- It is **not externally visible**.
- CP-SCHEMA-1 remains **blocked**.
- Production apply remains **NO-GO**.

## Follow-up — CLIENT-PORTAL-AUTHZ-STUB-DESIGN-2

- `CLIENT-PORTAL-AUTHZ-STUB-DESIGN-2` created `docs/client-portal-authz-stub-design-2.md`,
  designing the future portal principal/grant boundary. **The authz stub design exists,
  but there is still no authz module** (`authorization.ts` was not created) and no
  route/service wiring. The inert shell is unchanged: routes stay `401`/`501
  CLIENT_PORTAL_NOT_ENABLED`. CP-SCHEMA-1 remains blocked; production apply remains NO-GO.

## Follow-up — CLIENT-PORTAL-AUTHZ-FAIL-CLOSED-STUBS-1

- `CLIENT-PORTAL-AUTHZ-FAIL-CLOSED-STUBS-1` added the **fail-closed authorization stub
  module** (`Backend/src/modules/client-portal/authorization.ts`) + tests. Every stub
  fails closed with a content-free error (principal-not-ready 501 / access-denied 403).
  The module imports no Prisma/DB/internal/service/mapper and is **not imported by
  `routes.ts` or `services.ts`** — the inert shell is unchanged (routes stay `401`/`501
  CLIENT_PORTAL_NOT_ENABLED`). This is not live authorization; CP-SCHEMA-1 remains
  blocked; production apply remains NO-GO.

## Follow-up — CLIENT-PORTAL-CP-SCHEMA-1-MIGRATION-PLAN-DRAFT-1

- `CLIENT-PORTAL-CP-SCHEMA-1-MIGRATION-PLAN-DRAFT-1` created
  `docs/client-portal-cp-schema-1-migration-plan-draft.md`, a docs-only migration plan
  draft. **The migration plan draft exists; the inert shell remains non-DB-backed** —
  no schema/migration/DB, routes still `401`/`501 CLIENT_PORTAL_NOT_ENABLED`.
  CP-SCHEMA-1 remains blocked; production apply remains NO-GO.

## Follow-up — CLIENT-PORTAL-CP-SCHEMA-1-MODEL-NAMING-DECISION-1

- `CLIENT-PORTAL-CP-SCHEMA-1-MODEL-NAMING-DECISION-1` froze the future CP-SCHEMA-1
  model naming (explicit `ClientPortal*`) in
  `docs/client-portal-cp-schema-1-model-naming-decision.md`. **The model naming decision
  exists; the inert shell remains non-DB-backed** — no schema/migration/DB. CP-SCHEMA-1
  remains blocked; production apply remains NO-GO.
