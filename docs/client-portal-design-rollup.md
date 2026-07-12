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
