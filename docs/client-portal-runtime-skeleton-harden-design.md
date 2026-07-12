# Client Portal Runtime Skeleton Harden Design

## Purpose

This document defines a future runtime skeleton boundary for the Client Portal without implementing it. It is a documentation-only hardening design for the currently disabled `/api/v1/client-portal` surface.

This document does not authorize runtime changes, frontend changes, schema edits, migration creation or application, DB access, production apply, CP-SCHEMA-1, portal enablement, external visibility, Document/AI exposure, AI/provider calls, SharePoint calls, export jobs, or file-processing behavior.

## Inputs

- `docs/client-portal-product-boundary-design.md`
- `docs/client-portal-current-code-inventory.md`
- `docs/client-portal-v1-data-contract-design.md`
- `docs/client-portal-authz-model-design.md`
- `docs/client-portal-v1-ui-ia-design.md`
- `docs/client-portal-schema-readiness-design.md`
- `docs/production-compatible-baseline-human-decisions.md`
- Current disabled route skeleton in `Backend/src/routes/clientPortal.ts`
- Current route mounting in `Backend/src/index.ts`

## Current Status

- Client Portal remains disabled and quarantined.
- The current skeleton is auth-first and double-gated.
- Disabled authenticated requests return `501 FEATURE_NOT_AVAILABLE` with reason `CLIENT_PORTAL_NOT_ENABLED`.
- The current disabled route has no service module, no portal frontend, and no runtime grant-resolution implementation.
- No approved/applied/runtime grant schema exists. A CP-SCHEMA candidate may exist in repository history, but it is not approved, not applied, and not a runtime authorization model.
- No Client Portal implementation is authorized.
- CP-SCHEMA-1 remains blocked.
- Production apply remains NO-GO.
- External client visibility remains unauthorized.

## Existing Skeleton Summary

The existing route skeleton is mounted under `/api/v1/client-portal` and currently acts as a disabled guard surface.

Observed intended properties:

- Authentication runs before Client Portal feature logic.
- Disabled state blocks requests before Prisma/service access.
- `ENABLE_CLIENT_PORTAL=true` alone is insufficient because the ownership model gate is also required.
- Previous placeholder `x-user-id` behavior is not a valid security model and must not return.
- Existing disabled-route tests are the baseline for future skeleton hardening.

Residual risk:

- The skeleton is not a V1 portal implementation.
- The skeleton must not become enabled by setting a feature flag alone.
- Future implementation must not reuse internal DTOs, internal case authorization, dashboard mappers, or broad Prisma rows as client-facing responses.

## Future Module Boundary

If runtime implementation is later authorized, move the portal from a single disabled route file into a separate module boundary:

| Future file | Responsibility |
| --- | --- |
| `Backend/src/modules/client-portal/routes.ts` | Route registration, auth handoff, gate ordering, HTTP status mapping |
| `Backend/src/modules/client-portal/services.ts` | Grant-scoped read services returning portal-safe intermediate objects |
| `Backend/src/modules/client-portal/authorization.ts` | Portal principal resolution and grant checks |
| `Backend/src/modules/client-portal/mappers.ts` | External allow-list DTO mappers |
| `Backend/src/modules/client-portal/types.ts` | Portal DTO and domain-safe types |
| `Backend/src/modules/client-portal/featureGate.ts` | Disabled/default-off gate checks |
| `Backend/src/modules/client-portal/audit.ts` | Content-minimal audit event helpers |

Conceptual future test files:

- `Backend/tests/clientPortalDisabledBoundary.test.ts`
- `Backend/tests/clientPortalAuthz.test.ts`
- `Backend/tests/clientPortalMappers.test.ts`
- `Backend/tests/clientPortalNoInternalFields.test.ts`

These files are design targets only. This task creates none of them.

## Gate Order

Future runtime skeleton must preserve this order:

1. Route is registered but disabled by default.
2. Unauthenticated requests return `401` before portal logic.
3. Portal feature gate returns `501 CLIENT_PORTAL_NOT_ENABLED` before Prisma/service access.
4. Secondary product/privacy readiness gate blocks flag-only enablement.
5. Portal principal is resolved from the external portal auth model.
6. Active portal user and membership are required.
7. Matter, document, task, upload, or publication grant is resolved.
8. Prisma queries use explicit select allow-lists.
9. External mapper creates client-safe DTOs.
10. Content-free audit/log events are recorded.
11. Response is returned.

The disabled gate must prevent Prisma and service reachability. `ENABLE_CLIENT_PORTAL` alone must remain insufficient.

## Disabled Behavior

While disabled, the portal must:

- Return `501 FEATURE_NOT_AVAILABLE` with reason `CLIENT_PORTAL_NOT_ENABLED` for authenticated requests.
- Return `401` for unauthenticated requests.
- Avoid Prisma queries.
- Avoid service and mapper calls.
- Avoid external visibility.
- Avoid fake summaries, exports, task lists, matter lists, and documents.
- Reject spoofed user/client context.
- Return content-free bodies and errors.

## Route Family Design

| Conceptual route | Future service dependency | Required grant | Forbidden fields | Disabled behavior | CP-SCHEMA dependency |
| --- | --- | --- | --- | --- | --- |
| `GET /api/v1/client-portal/me` | Portal principal and membership lookup | Active portal membership | Internal user roles, Azure claims dump, internal user profile | `501` after auth | Portal user and membership |
| `GET /api/v1/client-portal/matters` | Grant-scoped matter summary service | Active matter/publication grant | Internal case notes, workload, collaborators, strategy, internal status history | `501` after auth | Matter/artifact grants |
| `GET /api/v1/client-portal/matters/:matterId` | Matter detail service | Specific matter grant | Internal timeline, notes, communications, billing internals, private tasks | `501` after auth | Matter grant plus external DTO |
| `GET /api/v1/client-portal/matters/:matterId/documents` | Document share list service | Matter grant and document share | `workspaceText`, raw extracted text, storage refs, internal review notes | `501` after auth | Document share/artifact grants |
| `GET /api/v1/client-portal/documents/:documentId` | Document artifact service | Specific document grant | Raw file path, SharePoint internals, review comments, internal analysis, redacted/original text unless published | `501` after auth | Client-visible artifact grant |
| `GET /api/v1/client-portal/tasks` | Client-facing task/request service | Client task grant | Internal tasks, assignees, workload, internal priority, AI fields | `501` after auth | Client task/request grant |
| `POST /api/v1/client-portal/tasks/:taskId/complete` | Client task submission service | Specific task grant and allowed action | Direct internal task mutation, internal comments, inferred legal approval | `501` after auth | Client submission/task grant |
| `GET /api/v1/client-portal/uploads` | Upload request service | Active upload request grant | Internal document metadata, private folder paths, virus scan internals | `501` after auth | Upload request model |
| `POST /api/v1/client-portal/uploads/:uploadRequestId/files` | Upload metadata and storage boundary service | Active upload request grant | Arbitrary file writes, internal storage refs in response, SharePoint direct exposure | `501` after auth | Upload request and attachment metadata |
| Messages, comments, or communication threads | Deferred message service | Explicit message/thread grant | Raw communications, internal notes, AI drafts, litigation strategy | Deferred/blocked | Future message grant, not V1 default |

## Service Boundary Design

Future services should:

- Query only through grant-scoped methods.
- Use explicit Prisma `select` allow-lists.
- Return domain-safe intermediate objects, not raw Prisma rows.
- Avoid file processing, AI/provider calls, Graph calls, SharePoint calls, and export jobs unless separately approved.
- Avoid calling internal dashboard, case detail, document review, workload, or communication DTO services directly.
- Keep client submission triage separate from internal case/task/document creation.

## Mapper Boundary Design

Future mappers should:

- Use one external mapper per DTO.
- Use allow-lists only.
- Avoid object spread from internal rows.
- Never reuse internal dashboard/case/detail/document DTOs.
- Exclude `workspaceText`, raw extracted text, raw communication bodies, internal notes, internal tasks, workload records, collaborators, audit internals, storage refs, AI drafts, legal strategy, and review comments.
- Have forbidden-field tests for every externally returned DTO.

## Authorization Boundary Design

Future portal authorization must:

- Resolve a portal principal independent of internal `UserRole.CLIENT`.
- Require active portal user and membership status.
- Apply grant checks per matter, document, upload request, task, and future message/thread.
- Keep portal grant checks separate from internal case collaborator/admin/partner authorization.
- Deny revoked, expired, suspended, or unverified access.
- Return non-enumerating `404` for ungranted resources where appropriate.
- Avoid trusting `clientId`, `matterId`, `caseId`, `documentId`, or `taskId` path parameters without grant resolution.

## Audit and Log Boundary

Future audit/log events must be content-minimal:

- Allowed: actor identifier, client identifier, object identifier, action, result, reason code, timestamp.
- Forbidden: document content, `workspaceText`, raw messages, internal notes, AI prompts/responses, upload contents, legal strategy, internal review comments.
- Error responses must not disclose whether another client's matter, document, task, or upload request exists.

## OpenAPI and Public Metadata

Client Portal routes should not be advertised as usable until product, authz, schema, and disabled-state readiness are approved.

Future OpenAPI work requires a separate exposure review:

- Public versus authenticated versus admin-only metadata decision.
- No stale/future paths represented as production-ready.
- No raw text/document/AI endpoints exposed.
- Quarantined families must not appear as client-ready connector operations.

## Test Plan

Future implementation must add tests for:

- Unauthenticated requests return `401`.
- Disabled authenticated requests return `501 CLIENT_PORTAL_NOT_ENABLED`.
- `ENABLE_CLIENT_PORTAL=true` alone remains insufficient.
- Prisma and service functions are not reached while disabled.
- Active portal user and active membership are required.
- Suspended, revoked, expired, or unverified access is denied.
- Matter grants scope matter list and matter detail.
- Document share grants scope document list and detail.
- Upload request grants scope uploads.
- Client-facing task grants scope task views and completion actions.
- Revoked grants stop access.
- Internal fields never appear in client DTOs.
- `workspaceText` never appears.
- Raw extracted text never appears.
- Mappers do not use object spread.
- Logs and errors are content-free.
- OpenAPI exposure remains safe.
- Production defaults do not enable the portal.

## Dependencies Before Implementation

Before any runtime skeleton implementation, the team needs:

- Human decision to implement a disabled runtime skeleton.
- CP-SCHEMA-1 decision or a mock-only/no-DB skeleton decision.
- Production-compatible baseline resolution.
- Final external DTO/data contract approval.
- External portal auth provider and principal model decision.
- Frontend shell decision.
- Test fixture strategy that does not expose business data.

## Recommended Next Package

Preferred:

`CLIENT-PORTAL-FRONTEND-SHELL-DESIGN-1`

Reason: the backend skeleton boundary is now defined. A frontend shell can be designed next with static/mock contract references only, without enabling backend runtime behavior or external visibility.

Alternative:

`CLIENT-PORTAL-RUNTIME-SKELETON-HARDEN-1`

Use this only if a human explicitly authorizes code changes while the portal remains disabled.

## Follow-up — CLIENT-PORTAL-FRONTEND-SHELL-DESIGN-1

- `CLIENT-PORTAL-FRONTEND-SHELL-DESIGN-1` created
  `docs/client-portal-frontend-shell-design.md`.
- The frontend shell design defines future `/portal` routes, portal-specific layout,
  safe components, visual reuse limits, disabled states, mock/static data strategy,
  conceptual API client rules, and frontend tests.
- This runtime skeleton boundary remains documentation-only. The backend skeleton remains
  disabled/quarantined. No runtime, frontend, schema, migration, DB, Azure, OpenAPI/CORS,
  auth, or Client Portal enablement is authorized.

## Follow-up — CLIENT-PORTAL-RUNTIME-SKELETON-HARDEN-1

- `CLIENT-PORTAL-RUNTIME-SKELETON-HARDEN-1` implemented a disabled-only backend module
  boundary under `Backend/src/modules/client-portal`.
- The legacy `Backend/src/routes/clientPortal.ts` remains as a compatibility re-export.
- The backend remains disabled/quarantined. `ENABLE_CLIENT_PORTAL=true` alone remains
  insufficient, and `ENABLE_CLIENT_PORTAL_OWNERSHIP_MODEL=true` also remains insufficient
  without an explicit runtime-readiness gate.
- No schema, migration, DB, Prisma business access, frontend API integration, OpenAPI/CORS
  exposure, upload/download/message implementation, external visibility, CP-SCHEMA-1
  readiness, or production apply readiness is authorized.

## Closeout — CLIENT-PORTAL-RUNTIME-SKELETON-CLOSEOUT-1

- The hardened backend skeleton state was reviewed and documented.
- Unauthenticated requests remain `401` before feature checks.
- Authenticated disabled requests remain `501 CLIENT_PORTAL_NOT_ENABLED`.
- `ENABLE_CLIENT_PORTAL` and `ENABLE_CLIENT_PORTAL_OWNERSHIP_MODEL` are insufficient
  without `ENABLE_CLIENT_PORTAL_RUNTIME_READY`.
- The module contains no Prisma business query path, schema dependency, upload/download
  implementation, message implementation, frontend API integration, OpenAPI/CORS exposure,
  CP-SCHEMA-1 readiness, production apply readiness, or external visibility authorization.

## Final Decision Statement

No runtime skeleton changes are made or authorized by this document. Client Portal is not enabled. Client Portal remains quarantined. CP-SCHEMA-1 remains blocked. Production apply remains NO-GO. External visibility remains unauthorized. The runtime skeleton remains disabled. No schema migration is authorized.

## Non-actions

- No runtime changed.
- No frontend changed.
- No schema changed.
- No migration was created.
- No migration was applied.
- No DB connection was used.
- No DB data was read.
- No production apply was authorized.
- No Azure setting changed.
- No route behavior changed.
- No OpenAPI/CORS behavior changed.
- No auth behavior changed.
- No Client Portal was enabled.
- No external client visibility was created.
- No AI/provider call was made.
- No Graph/SharePoint call was made.
- No file processing, export, or generation job was run.

## Final Classification

`client_portal_runtime_skeleton_boundary_designed_no_db_change_no_runtime_change`
