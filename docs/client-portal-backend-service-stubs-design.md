# Client Portal Backend Service Stubs Design

## Purpose

This is a **documentation-only** design of the future Client Portal backend
**service boundary**. It makes:

- no runtime change;
- no service implementation;
- no schema change;
- no migration;
- no DB connection;
- no production apply;
- no CP-SCHEMA-1 authorization;
- no Client Portal enablement;
- no external visibility authorization;
- no frontend API integration;
- no Document/AI enablement;
- no AI/provider call;
- no SharePoint/export/file-processing call.

It describes what a future service layer would look like so a reviewer can reason
about it. It authorizes nothing and creates no code.

## Current status

- Client Portal remains **mock frontend + disabled backend skeleton only**.
- Backend DTOs (`Backend/src/modules/client-portal/types.ts`) and mappers
  (`mappers.ts`) exist but are **disabled-only** and not wired into any route.
- **No service layer exists.**
- No DB-backed portal exists.
- No grant schema exists (as an active runtime-backed model).
- No schema migration exists.
- The active route boundary stops at `401` (unauthenticated) / `501
  CLIENT_PORTAL_NOT_ENABLED` (authenticated, disabled) before anything else.
- CP-SCHEMA-1 remains **blocked**.
- Production apply remains **NO-GO**.

## Service boundary principles

- **Services must be grant-scoped.** Every read/write resolves the portal
  principal and checks an explicit grant before touching data.
- **Services must not return Prisma rows.** They return portal DTOs only.
- **Services must not reuse internal DTOs** (`Case`/`Document`/`Task`/… DTOs).
- **Services must call portal mappers only after explicit authorization.**
- **Services must use explicit `select` allow-lists later** — never broad
  `include` or `...row` spread.
- **Services must never expose raw text.**
- **Services must never expose `documents.workspaceText`.**
- **Services must be content-free in errors/logs** (metadata only).
- **Services must remain unreachable while disabled** (the triple gate stops the
  request before any service call).

## Future service module shape

Conceptual future files (**do not create now**):

- `Backend/src/modules/client-portal/services.ts` — service functions below.
- `Backend/src/modules/client-portal/authorization.ts` — principal resolution and
  grant checks (portal-specific; never reuse internal case/document authz to
  *grant* portal access).
- `Backend/src/modules/client-portal/repositories.ts` or query helpers —
  **deferred**; explicit-`select` query helpers over future portal tables.
- `Backend/src/modules/client-portal/audit.ts` — content-free portal audit events.
- existing `types.ts` — allow-list DTOs (already present).
- existing `mappers.ts` — pure allow-list mappers (already present).
- existing `featureGate.ts` — triple-flag runtime-ready gate (already present).
- existing `routes.ts` — disabled skeleton (already present).

State: **conceptual only; no file is created by this task.**

## Candidate service functions

For each: purpose · required principal/grant · candidate schema dependency ·
mapper dependency · forbidden fields · status.

- **`getPortalMe`** — return the authenticated portal profile + scope summary.
  Principal: resolved active `PortalUser`. Schema: `PortalUser`
  (+ grant counts). Mapper: `toPortalMeDto`. Forbidden: internal `User.id`, auth
  claims/tokens, roles, audit. Status: **blocked** (no `PortalUser` table).
- **`listPortalMatters`** — list matters the principal is granted. Principal:
  active `PortalUser`. Grant: active `PortalMatterAccessGrant` per matter. Schema:
  grant + `PortalMatterPublication`. Mapper: `toPortalMatterListItemDto`.
  Forbidden: internal case status/strategy/collaborators/workload/`clientRole`.
  Status: **blocked**.
- **`getPortalMatterDetail`** — one granted matter's published summary. Grant:
  active grant for the resolved matter. Schema: grant + `PortalMatterPublication`.
  Mapper: `toPortalMatterDetailDto`. Forbidden: internal timeline, legal theory,
  notes, `workspaceText`, AI output. Status: **blocked**.
- **`listPortalMatterDocuments`** — explicitly shared documents for a granted
  matter. Grant: matter grant **plus** `PortalDocumentShare`. Schema:
  `PortalDocumentShare`. Mapper: `toPortalDocumentListItemDto`. Forbidden: raw
  text, storage/SharePoint paths, extraction metadata. Status: **blocked**.
- **`getPortalDocumentDetail`** — shared document metadata (metadata-only). Grant:
  explicit `PortalDocumentShare`. Schema: `PortalDocumentShare`. Mapper:
  `toPortalDocumentDetailDto`. Forbidden: raw content, `workspaceText`, review
  history, storage paths. Status: **blocked**.
- **`listPortalTasks`** — client-facing tasks/requests only. Grant: active
  task/request grant for principal/membership. Schema: `PortalClientTask`. Mapper:
  `toPortalTaskDto`. Forbidden: internal task board, assignees, priority,
  checklists. Status: **blocked**.
- **`completePortalTask`** — mark a client-facing request complete for triage.
  Grant: active client-facing task grant. Schema: `PortalClientTask` (+ triage
  event). Mapper: `toPortalTaskDto` or minimal status DTO. Forbidden: direct
  internal `Task` mutation without a separately-approved bridge. Status:
  **blocked**.
- **`listPortalUploadRequests`** — upload requests addressed to the principal.
  Grant: active `PortalUploadRequest` grant. Schema: `PortalUploadRequest`.
  Mapper: `toPortalUploadRequestDto`. Forbidden: storage destination, reviewer
  notes, auto-processing/AI/extraction status. Status: **blocked**.
- **`createPortalUploadedFile`** *(deferred)* — accept a file against an active
  request. Requires a separate upload storage + virus-scan + retention design; no
  file input exists. Status: **deferred**.
- **`listPortalMessageThreads`** *(deferred)* — list client-visible threads.
  Requires an approved communication visibility/retention model. Status:
  **deferred**.
- **`replyToPortalMessageThread`** *(deferred)* — add a client reply to an
  approved thread. Same deferral. Status: **deferred**.

## Authorization-before-service rule

Before any service access, in order:

1. **auth** (authenticate);
2. **feature gate** (`ENABLE_CLIENT_PORTAL`);
3. **runtime-ready gate** (all three flags via `requireClientPortalRuntimeReady`);
4. **portal principal resolution** (resolve the request to a `PortalUser`);
5. **active portal user check** (not suspended/revoked);
6. **explicit matter/document/task/upload grant check** (deny on absence);
7. **only then service query**;
8. **explicit `select`** (allow-list; no broad include/spread);
9. **portal mapper** (`toPortal*Dto`);
10. **content-free audit/log**.

State: the **existing runtime still stops at `401`/`501` before this flow ever
begins** — steps 4–10 do not exist yet and are not reachable.

## Candidate data dependencies

Service → future candidate model dependency:

- `getPortalMe` → `PortalUser`.
- `listPortalMatters` / `getPortalMatterDetail` → `PortalMatterAccessGrant`,
  `PortalMatterPublication`.
- `listPortalMatterDocuments` / `getPortalDocumentDetail` → `PortalDocumentShare`.
- `listPortalTasks` / `completePortalTask` → `PortalClientTask`.
- `listPortalUploadRequests` / `createPortalUploadedFile` → `PortalUploadRequest`,
  `PortalUploadedFile`.
- all reads/writes → `PortalAuditEvent` (content-free).
- deferred messaging → deferred message models.

Existing internal models that may be **referenced later by FK only**: `Case`,
`Client`, `Document`, `User`, `Task`, `Communication`.

State:
- **internal relations do not create portal visibility;**
- **a foreign-key relationship does not equal authorization.**

## Forbidden service behavior

- no broad Prisma `include`;
- no raw Prisma row return;
- no internal DTO reuse;
- no internal task board exposure;
- no workload/collaborators exposure;
- no internal notes;
- no legal analysis;
- no AI prompt/output;
- no raw extracted text;
- no `documents.workspaceText`;
- no storage path / SharePoint path in any DTO;
- no upload/download/message until separately designed;
- no external visibility before an enablement review.

## Disabled-state behavior

- Current routes remain **`401`/`501`**.
- **No service is currently called** (none exists).
- Future service stubs, if later added, **must remain unreachable while disabled**
  (guarded behind the runtime-ready gate).
- **`ENABLE_CLIENT_PORTAL` alone remains insufficient.**
- **`ENABLE_CLIENT_PORTAL_OWNERSHIP_MODEL` remains insufficient.**
- **`ENABLE_CLIENT_PORTAL_RUNTIME_READY` remains required** but is still **not
  enough** for schema/live data without further approval (schema, authz, tests,
  production apply readiness).

## Future tests before implementation

- disabled routes do not call services;
- services are not imported/reached while disabled;
- grant-scoped access (correct principal only);
- no id guessing (wrong user/client/matter/document/task/upload);
- revoked/expired grants denied;
- mapper allow-list preserved;
- no Prisma row leakage;
- no forbidden fields;
- no `workspaceText`;
- content-free errors/logs;
- no internal DTO imports;
- no broad relation `include`;
- route order `401`/`501` before any service.

## Implementation blockers

- CP-SCHEMA-1 blocked;
- no schema migration;
- no `PortalUser` table;
- no grant/share/upload/task tables;
- no external auth provider decision;
- no final retention/legal-hold decision;
- no upload storage / virus-scan design;
- no message privilege/retention design;
- no production apply readiness (production apply is NO-GO).

## Non-authorizations

- this document does **not** authorize service implementation;
- no backend code change;
- no schema change;
- no migration;
- no DB query;
- no API;
- no frontend integration;
- no external visibility;
- no CP-SCHEMA-1;
- no production apply.

## Recommended next package

- `CLIENT-PORTAL-BACKEND-DISABLED-SERVICE-STUBS-1` — **only if a human explicitly
  approves code** (disabled, unreachable service stubs).
- Safer defaults: `CLIENT-PORTAL-SERVICE-STUBS-NO-GO-CLOSEOUT-1` or
  `CLIENT-PORTAL-MOCK-DEMO-REVIEW-PASS-1`.

**Safest default recommendation: `CLIENT-PORTAL-MOCK-DEMO-REVIEW-PASS-1`.**
Reason: frontend demo quality can improve without any schema/API/DB risk.

## Final decision statement

- The service boundary is **designed only**.
- **No service implementation exists.**
- Client Portal remains **mock frontend + disabled backend skeleton only**.
- CP-SCHEMA-1 remains **blocked**.
- Production apply remains **NO-GO**.
