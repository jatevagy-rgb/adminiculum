# Client Portal Current Code Inventory

## Purpose

This is a documentation-only current-code inventory. It makes no runtime change, no schema
change, no migration, no DB connection, no production apply, no CP-SCHEMA-1 authorization,
no Client Portal enablement, no external visibility authorization, no Document/AI
enablement, no AI/provider call, and no SharePoint/export/file-processing call.

The goal is to map what exists today, not to redesign or implement the Client Portal.

## Inputs

- `docs/client-portal-product-boundary-design.md`
- `docs/production-compatible-baseline-final-rollup.md`
- `docs/production-apply-no-go-reconfirmation.md`
- `docs/production-compatible-baseline-human-decisions.md`
- `Backend/src/routes/clientPortal.ts`
- `Backend/src/index.ts`
- `Backend/src/middleware/featureAvailability.ts`
- `Backend/src/openapi/publicSpec.ts`
- `Backend/tests/routeFeatureGuards.test.ts`
- `Backend/tests/clientIdentityFieldsAuthz.test.ts`

## Current status summary

- Client Portal remains disabled/quarantined.
- This inventory does not authorize enablement.
- CP-SCHEMA-1 remains blocked.
- Production apply remains NO-GO.
- Existing portal skeleton must not be enabled by flag alone.

## Backend inventory

| Item | Path / file | Classification | Current behavior |
| --- | --- | --- | --- |
| Route registration | `Backend/src/index.ts` mounts `clientPortalRoutes` at `/api/v1/client-portal`. | Backend disabled/quarantined route | The route family exists at the Express mount point. |
| Route module | `Backend/src/routes/clientPortal.ts` | Backend disabled/quarantined route; reusable later as auth-first skeleton | `router.use(authenticate)` runs before feature checks. Then `requireDatabaseFoundation` blocks unless both `ENABLE_CLIENT_PORTAL` and `ENABLE_CLIENT_PORTAL_OWNERSHIP_MODEL` are `true`. |
| Client portal services/module | `Backend/src/modules/client-portal` | Unknown / not present | No `Backend/src/modules/client-portal` directory was found in this inventory. |
| Feature gate helper | `Backend/src/middleware/featureAvailability.ts` | Backend flag/gate | `isDatabaseFoundationEnabled()` treats only exact string `true` as enabled; `sendFeatureUnavailable()` returns `501 FEATURE_NOT_AVAILABLE`. |
| Public OpenAPI sanitizer | `Backend/src/openapi/publicSpec.ts` | OpenAPI/public metadata exposure guard | `/api/v1/client-portal` paths are quarantined from served public metadata. |

### Route-level current behavior

The current router defines no concrete `GET`, `POST`, `PATCH`, or `DELETE` handlers after
the auth and feature gates. While disabled, every authenticated path under
`/api/v1/client-portal/*` returns the same controlled unavailable response before Prisma or
service work. If both flags were enabled today, the router would still lack approved v1
handlers/contracts; flags alone therefore do not create a safe or useful portal.

| Current tested path shape | Method | Gate | Auth order | Disabled response | Prisma/service reachability while disabled | Likely future role | Current lane |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/v1/client-portal/summary/:clientId` | `GET` | `ENABLE_CLIENT_PORTAL && ENABLE_CLIENT_PORTAL_OWNERSHIP_MODEL` | Auth first | `501 FEATURE_NOT_AVAILABLE`, reason `CLIENT_PORTAL_NOT_ENABLED` | Not reached | Future summary/home only after `/me`-scoped redesign | Unsafe if enabled without redesign |
| `/api/v1/client-portal/departments/:clientId` | `GET` | Same | Auth first | Same | Not reached | Unknown / old placeholder shape | Unsafe if enabled without redesign |
| `/api/v1/client-portal/departments/:deptId/matters` | `GET` | Same | Auth first | Same | Not reached | Matter list only after grant model | Unsafe if enabled without redesign |
| `/api/v1/client-portal/matters/:matterId` | `GET` | Same | Auth first | Same | Not reached | Matter detail only after explicit grants/DTOs | Unsafe if enabled without redesign |
| `/api/v1/client-portal/matters/:matterId/time-log` | `GET` | Same | Auth first | Same | Not reached | Likely not v1; time visibility needs separate product/privacy decision | Unsafe if enabled without redesign |
| `/api/v1/client-portal/export/:clientId` | `GET` | Same | Auth first | Same | Not reached | Likely not v1; export must remain separately designed | Unsafe if enabled without redesign |

## Frontend inventory

Focused searches under `Frontend/src/app`, `Frontend/src/components`, and
`Frontend/src/lib/api.ts` did not find a dedicated Client Portal route, component, or API
client. Current frontend references to “external” are internal workflow/UI concepts such as
communications, anonymization copy-paste guidance, or document prompt helpers, not a
Client Portal shell.

| Item | Classification | Current posture |
| --- | --- | --- |
| Dedicated `/portal` route | Frontend route not wired | Not found in focused inventory. |
| Dedicated Client Portal components | Frontend route/component not wired | Not found in focused inventory. |
| Portal API client methods | Frontend route/API not wired | Not found in `Frontend/src/lib/api.ts`. |
| Internal components with “external” language | Frontend internal-only component naming | Not portal UI; must not be reused as client-facing portal proof. |

## Tests inventory

| Test file | Coverage | Classification |
| --- | --- | --- |
| `Backend/tests/routeFeatureGuards.test.ts` | Proves unauthenticated portal paths return `401` before feature checks; authenticated disabled paths return `501`; `ENABLE_CLIENT_PORTAL=true` alone is insufficient; spoofed `x-user-id` cannot bypass authentication; authenticated spoofed client context remains blocked; no Prisma mocks are called while disabled. | Test proving disabled behavior. |
| `Backend/tests/clientIdentityFieldsAuthz.test.ts` | Proves client identity fields are not exposed through the disabled client portal summary path and `prisma.client.findUnique` is not called. | Test proving disabled behavior and identity-field non-exposure. |

No new tests were added by this inventory.

## Feature flag / config inventory

| Flag | Current meaning | Behavior |
| --- | --- | --- |
| `ENABLE_CLIENT_PORTAL` | First-level portal flag. | Alone is intentionally insufficient. Tests prove authenticated requests still receive `501 CLIENT_PORTAL_NOT_ENABLED` when only this flag is true. |
| `ENABLE_CLIENT_PORTAL_OWNERSHIP_MODEL` | Second-level ownership-model flag. | Required together with `ENABLE_CLIENT_PORTAL`; intended to prevent portal enablement without a client-user ownership/access model. |

Flag alone must not enable external data exposure. Any future enablement needs a separate
runtime implementation, DTO contract, authorization model, schema readiness, and approval.

## OpenAPI / public metadata inventory

`Backend/src/openapi/publicSpec.ts` includes `/api/v1/client-portal` in
`QUARANTINED_PUBLIC_PATH_PATTERNS`, so served public OpenAPI metadata should exclude Client
Portal paths. This inventory did not edit OpenAPI behavior.

## Data reachability analysis

Current disabled behavior blocks service/Prisma reachability before data access. The legacy
tested path shapes indicate potentially sensitive future domains if redesigned incorrectly:

| Data family | Current reachability while disabled | Risk if enabled without redesign |
| --- | --- | --- |
| Cases / matters | Blocked before Prisma. | Client could infer or access matters by guessed ids unless explicit grants and opaque ids exist. |
| Clients | Blocked before Prisma. | `clientId` path/query access could expose wrong-client data. |
| Documents | No portal document route found; blocked by product boundary. | Raw/internal document lists, storage ids, or `documents.workspaceText` must never leak. |
| Summaries | Disabled tested path only. | Summary could expose internal timeline, notes, strategy, tasks, or status if internal DTOs are reused. |
| Exports | Disabled tested path only. | Export could leak internal/client-wide data without publication artifacts and approval. |
| Communications | No portal communication route found. | Internal communications must not become client-visible unless separately approved. |
| Tasks | No portal task route found. | Internal task board must not be exposed; only client-facing requests/todos may be published. |
| `documents.workspaceText` | No portal reachability found. | Explicitly forbidden; remains `SECURITY/PRIVACY BLOCKED`. |
| Internal notes / audit logs | No portal reachability found. | Must remain internal-only. |
| Workload / collaborators | No portal reachability found. | Internal workload and collaborator data must not be client-facing. |

## Reusable pieces

- Route mount namespace `/api/v1/client-portal`.
- Auth-first route pattern.
- Double-gate pattern requiring both portal flag and ownership-model flag.
- Controlled `501 FEATURE_NOT_AVAILABLE` response shape.
- Existing disabled-behavior test patterns.
- Public OpenAPI sanitizer pattern that excludes quarantined portal paths.

## Unsafe-to-enable pieces

- Any summary/export route shape without a `/me`-scoped identity and grant model.
- Any route using internal DTOs or spreading Prisma objects.
- Any route without explicit portal matter/document grants.
- Any route that could expose internal status, documents, notes, deadlines, time entries,
  collaborators, workload records, communications, or audit logs.
- Any portal UI that mirrors the internal case/dashboard/task/document workflow.
- Any feature relying only on `ENABLE_CLIENT_PORTAL`.
- Any use of `documents.workspaceText`, raw extracted text, AI outputs, or internal review
  comments.

## Gaps before implementation

- Portal identity model.
- Matter access grants.
- Client-visible matter status.
- Client-visible document grants.
- Upload request model.
- Client-facing task/request model.
- Explicit external DTOs and forbidden-field tests.
- Portal audit model.
- Upload/message retention model.
- External logging/privacy rules.
- CP-SCHEMA-1 or alternative schema readiness.
- Production apply plan remains absent and NO-GO.

## Recommended next package

`CLIENT-PORTAL-V1-DATA-CONTRACT-DESIGN-1`

This should define exact external DTOs and forbidden fields before authz, schema, frontend,
or runtime implementation.

## Final decision statement

This inventory does not enable Client Portal. Client Portal remains quarantined. Existing
code must remain disabled. CP-SCHEMA-1 remains blocked. Production apply remains NO-GO.
External visibility remains unauthorized.

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

`client_portal_current_code_inventory_documented_no_db_change_no_runtime_change`
