# Client Portal Product Boundary Design

## Purpose

This is a documentation-only product and privacy boundary design for a future Adminiculum Client Portal. It makes no runtime change, no schema change, no migration, no DB connection, no production apply, no CP-SCHEMA-1 authorization, no Client Portal enablement, no external visibility authorization, no Document/AI enablement, no AI/provider call, and no SharePoint/export/file-processing call.

The goal is to define what a safe client-facing portal should be before any route, schema, frontend, or deployment work resumes.

## Inputs

- `docs/production-compatible-baseline-final-rollup.md`
- `docs/production-apply-no-go-reconfirmation.md`
- `docs/production-compatible-baseline-human-decisions.md`
- `docs/present-compatible-keep-candidates-audit.md`
- `docs/documents-workspace-text-privacy-model.md`
- `docs/client-portal-v1-security-architecture-consolidation.md`
- `docs/client-portal-tenant-isolated-api-contract.md`
- `docs/client-portal-publication-payload-validator-design.md`
- `Backend/src/routes/clientPortal.ts`
- `Backend/tests/routeFeatureGuards.test.ts`
- `Backend/src/openapi/publicSpec.ts`

## Current status

- Client Portal is disabled/quarantined.
- CP-SCHEMA-1 is blocked.
- Production apply is NO-GO.
- External visibility is not authorized.
- The narrow internal KEEP baseline does not authorize client-facing exposure.
- Existing portal code must be treated as a disabled skeleton until product, authorization, schema, privacy, and mapper boundaries are redesigned and approved.

## Current inventory

| Surface | Evidence | Classification | Current behavior / risk |
| --- | --- | --- | --- |
| Backend route mount | `Backend/src/index.ts` mounts `/api/v1/client-portal` to `clientPortalRoutes`. | Disabled/quarantined route | Mounted route exists, but behavior is auth-first and feature-gated. |
| Backend route implementation | `Backend/src/routes/clientPortal.ts` requires `authenticate` and then requires both `ENABLE_CLIENT_PORTAL` and `ENABLE_CLIENT_PORTAL_OWNERSHIP_MODEL`. | Disabled/quarantined route | Authenticated requests return `501 FEATURE_NOT_AVAILABLE`, reason `CLIENT_PORTAL_NOT_ENABLED`; no Prisma work while disabled. Unsafe if simply enabled without ownership model. |
| Legacy paths under tests | `Backend/tests/routeFeatureGuards.test.ts` covers `/summary/:clientId`, `/departments/:clientId`, `/departments/:deptId/matters`, `/matters/:matterId`, `/matters/:matterId/time-log`, `/export/:clientId`. | Product placeholder / unsafe if enabled | Path shapes imply clientId/matterId/path-param access and export/time-log visibility; these must not become the v1 contract without redesign. |
| Disabled behavior tests | `routeFeatureGuards` verifies unauthenticated `401`, authenticated disabled `501`, flag-only disabled, spoofed `x-user-id` rejection, and no Prisma data queries while disabled. | Safe documentation/runtime guard evidence | Tests support the current quarantined posture; they do not authorize enablement. |
| OpenAPI public metadata | `Backend/src/openapi/publicSpec.ts` sanitizes `/api/v1/client-portal` paths from served public metadata. | Safe documentation/runtime guard evidence | Public OpenAPI does not present portal operations as production-ready. |
| Frontend portal UI | No dedicated `Frontend/src` portal route/component found in the focused inventory. | Unknown / not implemented | Future UI must be designed separately and must not reuse internal lawyer dashboard assumptions. |
| Client Portal docs | Existing docs define security, tenant isolation, publication artifacts, grant resolution, payload validation, and write-path submission boundaries. | Safe documentation only | Useful source material, but docs do not authorize schema/runtime enablement. |

## Product thesis

The Client Portal is a safe external matter-status and client-action surface. It is not a mirror of the internal lawyer workflow app, not a document dump, not an AI/legal-analysis surface, and not a raw internal-data exposure layer.

Internal Adminiculum remains for lawyers, paralegals, case work, tasks, documents, review, litigation workspace, internal status, internal notes, internal communication, and internal work allocation.

Client Portal is for external clients to understand what is happening, what they need to do, and which documents or updates have been explicitly shared with them.

## V1 user promise

“The client can log in, see the status of their own matters, see what they need to do, access explicitly shared documents, upload requested documents, and read safe client-facing updates.”

## V1 home screen

The first screen after login should be a client portal home, not the internal lawyer dashboard. It should prioritize:

- **Needs your attention** — client tasks, missing data, requested signatures, requested uploads.
- **Active matters** — only matters granted to the client user.
- **Upcoming deadlines** — only deadlines intentionally marked client-visible.
- **Requested uploads** — document requests with clear accepted file expectations.
- **Recently shared documents** — explicitly shared document metadata and files.
- **Latest safe update** — client-facing status message approved for external visibility.

## Client-facing data categories

Allowed candidate categories:

- matter display name;
- client-facing matter status;
- next client action;
- client-visible deadline;
- shared document metadata;
- explicitly shared document file;
- upload request;
- safe update message;
- contact/responsible lawyer display;
- client-facing communication thread, only if separately designed.

Forbidden by default:

- internal notes;
- internal tasks;
- lawyer strategy;
- litigation workspace;
- review comments;
- `documents.workspaceText`;
- raw extracted text;
- anonymization/rehydration internals;
- AI prompt/output internals;
- internal workload records;
- internal collaborators;
- internal communication not explicitly shared;
- internal audit logs;
- generated legal analysis;
- OpenAPI/admin/ops data.

## V1 client actions

Allowed candidate actions:

- view own matters;
- view safe matter status;
- view explicitly shared documents;
- upload requested documents;
- mark a client task/request as done;
- send a message or reply only if the communication model is separately approved;
- update own contact information only if separately approved.

Forbidden for V1:

- create matters;
- see all internal documents;
- see internal task board;
- edit legal documents;
- see internal deadlines not marked client-visible;
- trigger AI;
- trigger exports/generation;
- trigger SharePoint sync;
- access `workspaceText`;
- access raw document text;
- manage collaborators;
- see workload/team board;
- access admin routes.

## Authorization model

Minimum required rules:

- external client identity must be authenticated separately from internal lawyer identity;
- client identity must map to one or more explicit matter access grants;
- matter access must be explicit and revocable;
- no access by guessing `clientId`;
- no access by guessing `caseId` or matter id;
- every portal response must be scoped to granted matters;
- document access requires explicit sharing grant;
- upload access requires explicit request/grant;
- messages require matter access and thread visibility;
- internal users and external users should have distinct authorization paths;
- admin/partner internal role must not automatically imply a client-facing mapper is safe.

## Visibility model

Explicit visibility gates are required for:

- matter visibility;
- status visibility;
- deadline visibility;
- document visibility;
- task/request visibility;
- message visibility;
- export visibility;
- portal user grant.

Absence of a visibility grant means not visible. Internal data is private by default. Client-facing data must be explicitly published, sanitized, and scoped.

## Data contract principles

- External DTOs must be explicit allow-lists.
- Never spread Prisma objects into portal responses.
- Never reuse internal DTOs for portal responses.
- Never include raw text fields.
- Never include internal ids if not needed.
- Stable client-facing identifiers may be needed.
- Every DTO must be reviewed for privacy and wrong-client access behavior.

## UI information architecture

| Route / screen | Purpose | Main components | Forbidden content | Required backend contract |
| --- | --- | --- | --- | --- |
| `/portal` | Client home. | Needs-attention list, active matters, client-visible deadlines, requested uploads, shared docs, latest safe update. | Internal dashboard cards, internal tasks, internal workload, raw notes. | `GET /api/v1/client-portal/me` plus safe home summary DTO. |
| `/portal/matters` | Matter list for granted matters. | Matter cards, client status, next action, responsible contact. | Internal case list fields, strategy, collaborator details, internal deadlines. | `GET /api/v1/client-portal/matters`. |
| `/portal/matters/:matterId` | Safe matter detail. | Client status, next steps, shared docs, upload requests, safe updates. | Internal timeline, notes, task board, litigation workspace, `workspaceText`. | `GET /api/v1/client-portal/matters/:id`. |
| `/portal/documents` | Shared document library. | Shared document metadata, download action for explicitly shared files. | Full internal document list, raw text, generated analysis, review comments. | `GET /api/v1/client-portal/matters/:id/documents` or scoped document list. |
| `/portal/uploads` | Requested uploads. | Upload request list, upload form, status of submitted files. | Arbitrary file dump, SharePoint sync controls, internal storage paths. | `POST /api/v1/client-portal/matters/:id/uploads` plus request list. |
| `/portal/messages` | Optional safe messages. | Matter-scoped client-visible threads. | Internal communication, internal notes, strategy, unapproved replies. | Separate approved communication/thread contract. |
| `/portal/profile` | Optional client profile/contact details. | Own contact details, notification preferences if approved. | Internal client record, tax/company fields unless explicitly approved. | `GET/PATCH /api/v1/client-portal/me` only after approval. |

## UX priorities

- Simple client-facing language.
- No internal legal jargon unless intentionally client-facing.
- Put “what should I do now?” first.
- Clear status and responsibility.
- Obvious document requests and upload states.
- Avoid overwhelming internal workflow detail.
- Make the difference between “shared with you” and “internal work in progress” impossible to miss.

## Backend contract candidates

Conceptual only; not implemented and not authorized:

- `GET /api/v1/client-portal/me`
- `GET /api/v1/client-portal/matters`
- `GET /api/v1/client-portal/matters/:id`
- `GET /api/v1/client-portal/matters/:id/documents`
- `POST /api/v1/client-portal/matters/:id/uploads`
- `GET /api/v1/client-portal/tasks`
- `POST /api/v1/client-portal/tasks/:id/complete`
- messages only if separately approved.

These route names are design candidates only. The current disabled route skeleton must not be treated as an approved contract.

## Schema implications

Likely future schema needs:

- portal user identity;
- portal access grants;
- matter visibility/public status;
- client-visible deadlines;
- shared document grants;
- upload requests;
- client task/request table;
- message visibility or portal thread model;
- audit events for portal access;
- retention rules for uploads/messages.

CP-SCHEMA-1 remains blocked. No migration is authorized by this design.

## Security and privacy requirements

- authenticated external client identity;
- explicit matter grants;
- explicit document grants;
- upload grants/request scoping;
- rate limiting/session security if later designed;
- content-free audit;
- no raw `workspaceText`;
- no internal notes;
- no internal audit logs;
- no AI/provider;
- no export/generation by default;
- logging guard;
- retention policy;
- client-facing mapper tests for unauthenticated, wrong-client, disabled-portal, and privacy-safe responses.

## Why existing portal code must not simply be enabled

The existing portal route is intentionally quarantined/default-disabled. Feature flags alone are insufficient because the external mapper, client-user identity model, ownership grants, schema model, and privacy boundaries are not approved. Production apply is NO-GO. CP-SCHEMA-1 is blocked. The current legacy path shapes include clientId/matterId/export/time-log concepts that need product and privacy redesign before becoming a v1 contract.

## Recommended package sequence

1. `CLIENT-PORTAL-CURRENT-CODE-INVENTORY-1`
   - Inventory existing routes/tests/frontend/components and disabled behavior.
2. `CLIENT-PORTAL-V1-DATA-CONTRACT-DESIGN-1`
   - Define exact external DTOs and forbidden fields.
3. `CLIENT-PORTAL-AUTHZ-MODEL-DESIGN-1`
   - Design portal identity and matter/document grants.
4. `CLIENT-PORTAL-V1-UI-IA-DESIGN-1`
   - Design actual screens and user flows.
5. `CLIENT-PORTAL-SCHEMA-READINESS-DESIGN-1`
   - Design schema needs only; no migration.
6. `CLIENT-PORTAL-RUNTIME-SKELETON-HARDEN-1`
   - Only after design docs; keep disabled unless separately approved.
7. `CLIENT-PORTAL-FRONTEND-SHELL-1`
   - Only static/safe shell if allowed.
8. `CLIENT-PORTAL-ENABLEMENT-READINESS-1`
   - No enablement; readiness checklist only.

## Final decision statement

This design does not enable Client Portal. Client Portal remains quarantined. CP-SCHEMA-1 remains blocked. Production apply remains NO-GO. External visibility remains unauthorized. This is only the product boundary for future work.

## Follow-up — CLIENT-PORTAL-CURRENT-CODE-INVENTORY-1

- `CLIENT-PORTAL-CURRENT-CODE-INVENTORY-1` created
  `docs/client-portal-current-code-inventory.md`.
- The inventory does not alter this product boundary and does not authorize runtime,
  schema, frontend, OpenAPI, CORS, Azure, DB, or feature behavior changes.
- Client Portal remains disabled/quarantined.
- Next recommended package: `CLIENT-PORTAL-V1-DATA-CONTRACT-DESIGN-1`.

## Follow-up — CLIENT-PORTAL-V1-DATA-CONTRACT-DESIGN-1

- `CLIENT-PORTAL-V1-DATA-CONTRACT-DESIGN-1` created
  `docs/client-portal-v1-data-contract-design.md`.
- The data contract supplements this product boundary with conceptual allow-list DTOs,
  forbidden fields, grant requirements, mapper rules, and future test expectations.
- The product boundary remains unchanged: Client Portal stays disabled/quarantined,
  external visibility remains unauthorized, CP-SCHEMA-1 remains blocked, and production
  apply remains NO-GO.
- Next recommended package: `CLIENT-PORTAL-AUTHZ-MODEL-DESIGN-1`.

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
- No export/generation job was run.

## Final classification

`client_portal_product_boundary_designed_no_db_change_no_runtime_change`
