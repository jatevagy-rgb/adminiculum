# Client Portal Authz Stub Design 2

## Purpose

This is a **documentation-only** design of the future Client Portal
authorization / principal-boundary stub layer. It makes:

- no runtime change;
- no authz implementation;
- no route wiring;
- no service wiring;
- no schema change;
- no migration;
- no DB connection;
- no production apply;
- no CP-SCHEMA-1 authorization;
- no Client Portal enablement;
- no external visibility authorization.

It describes what a future `authorization.ts` module would look like so a
reviewer can reason about the principal/grant boundary. It authorizes nothing
and creates no code.

## Current status

- Client Portal has a frontend mock shell (static/mock, synthetic-only, API-free).
- Backend has an **inert route matrix** (auth-first, disabled-gate-first).
- Backend has **fail-closed service stubs** (`services.ts`), not route-wired.
- Backend has DTO/mappers (`types.ts`, `mappers.ts`), **unwired**.
- **No portal authorization module exists yet.**
- No `PortalUser`/grant schema exists.
- Existing routes stop at `401`/`501 CLIENT_PORTAL_NOT_ENABLED` **before** any
  authz, service, or data access.
- CP-SCHEMA-1 remains **blocked**.
- Production apply remains **NO-GO**.

## Portal principal concept

- `PortalPrincipal` is a future **external/client-facing** principal.
- It is **not** the same as the internal `User`.
- An internal authenticated user/session is **not enough** for portal access.
- **Email match is not enough.**
- **An auth-provider claim is not enough.**
- The principal must resolve to an **active portal user record** once schema
  exists; **suspended/revoked** portal users must **fail closed**.

Candidate conceptual fields (conceptual only; no schema implementation):

- `portalUserRef`
- `externalAuthSubject`
- `email`
- `displayName`
- `status`
- `linkedClientRef`
- `issuedAt`
- `authProvider`
- `sessionRef`

## Future authz module shape

Conceptual future file (**do not create now**):
`Backend/src/modules/client-portal/authorization.ts`.

Conceptual exports:

- `resolvePortalPrincipal`
- `requireActivePortalUser`
- `requirePortalMatterAccess`
- `requirePortalDocumentShare`
- `requirePortalTaskAccess`
- `requirePortalUploadRequestAccess`
- `requirePortalMessageAccess` *(deferred)*
- `assertPortalFeatureReadyForDataAccess`
- `ClientPortalAuthorizationError`
- `ClientPortalAccessDeniedError`
- `ClientPortalPrincipalNotReadyError`

State: this file is **not created by this task**.

## Authorization order

Future request order:

1. Express auth middleware;
2. Client Portal feature/runtime gate;
3. portal principal resolution;
4. active portal user check;
5. explicit matter/document/task/upload grant check;
6. service function;
7. explicit query/select;
8. portal mapper;
9. content-free audit/log;
10. response.

State: the **current runtime stops before step 3** — the feature/runtime gate
(step 2) returns `501` before any principal resolution or grant check exists.

## Grant-check functions

- **`requirePortalMatterAccess`** — purpose: gate matter list/detail. Input:
  `portalUserRef`, `matterRef`. Schema dependency: `PortalMatterAccessGrant`
  (+ `PortalMatterPublication`). Denial: fail closed (access-denied, non-enumerating).
  Forbidden assumption: matter access from internal assignment/collaborator/client
  relation. Status: **blocked until CP-SCHEMA-1**.
- **`requirePortalDocumentShare`** — purpose: gate a shared document. Input:
  `portalUserRef`, `documentRef` (and resolved `matterRef`). Schema dependency:
  `PortalDocumentShare`. Denial: fail closed. Forbidden assumption: **matter access
  alone does not imply document access**. Status: **blocked until CP-SCHEMA-1**.
- **`requirePortalTaskAccess`** — purpose: gate a client-facing task/complete.
  Input: `portalUserRef`, `taskRef`. Schema dependency: `PortalClientTask`. Denial:
  fail closed. Forbidden assumption: internal `Task` visibility/mutation. Status:
  **blocked until CP-SCHEMA-1**.
- **`requirePortalUploadRequestAccess`** — purpose: gate an upload request. Input:
  `portalUserRef`, `uploadRequestRef`. Schema dependency: `PortalUploadRequest`.
  Denial: fail closed. Forbidden assumption: upload without an active request.
  Status: **blocked until CP-SCHEMA-1**.
- **`requirePortalMessageAccess`** *(deferred)* — purpose: gate a client-visible
  thread. Input: `portalUserRef`, `threadRef`. Schema dependency: deferred message
  models. Denial: fail closed. Status: **deferred** (requires comms/retention/privilege
  review).

## Content-free errors

Expected error shape:

- `code`
- `status`
- `message`
- optional `operation`
- optional `reasonCode`

Allowed messages:

- "Client Portal principal is not available."
- "Client Portal access is not authorized."
- "Client Portal authorization is not implemented."

Forbidden in errors:

- case names;
- client names;
- document names;
- document snippets;
- raw text;
- `workspaceText`;
- internal ids;
- storage paths;
- SharePoint paths;
- AI prompt/output;
- whether a guessed matter/document exists.

## Non-enumeration rule

- Wrong, revoked, expired, nonexistent, or unshared resources **must not reveal
  existence**.
- Future route behavior should prefer a safe `404`/`403` strategy **only after a
  final policy decision** (consistent non-enumeration across all resource types).
- The **current disabled route matrix returns `501` before any resource check**,
  so it already reveals nothing.

## Candidate schema dependencies

Authz function → candidate model:

- `resolvePortalPrincipal` / `requireActivePortalUser` → `PortalUser`.
- `requirePortalMatterAccess` → `PortalMatterAccessGrant`, `PortalMatterPublication`.
- `requirePortalDocumentShare` → `PortalDocumentShare`.
- `requirePortalTaskAccess` → `PortalClientTask`.
- `requirePortalUploadRequestAccess` → `PortalUploadRequest`, `PortalUploadedFile`.
- `requirePortalMessageAccess` *(deferred)* → deferred message models.

State: **no schema means no live authz.**

## What authz must not do

- no access inferred from internal `User` role alone;
- no access inferred from client email alone;
- no access inferred from `case.clientRole`;
- no access inferred from `case_collaborators`;
- no access inferred from workload records;
- no document access from matter access alone;
- no internal DTO exposure;
- no raw Prisma row return;
- no broad `include`;
- no `documents.workspaceText`;
- no internal notes / legal analysis / AI output;
- no storage / SharePoint paths.

## Future tests before implementation

- principal unresolved fails closed;
- suspended/revoked portal user denied;
- missing grant denied;
- revoked/expired grant denied;
- matter access does not imply document share;
- document share required for document detail;
- task access requires active task/grant;
- upload request access requires active request;
- no id guessing / resource enumeration;
- content-free errors;
- no `workspaceText`;
- no Prisma row leakage;
- no internal DTO import;
- route order remains `401`/`501` before authz while disabled;
- authz module not route-wired until explicitly approved.

## Implementation blockers

- CP-SCHEMA-1 blocked;
- no `PortalUser` table;
- no grant/share/upload/task schema;
- no external auth provider decision;
- no finalized revocation/expiry policy;
- no finalized retention/legal-hold policy;
- no finalized non-enumeration status policy;
- no production apply readiness.

## Non-authorizations

- no `authorization.ts` implementation;
- no backend code change;
- no route wiring;
- no service wiring;
- no schema/migration;
- no DB query;
- no frontend integration;
- no external visibility;
- no CP-SCHEMA-1;
- no production apply.

## Recommended next package

`CLIENT-PORTAL-AUTHZ-FAIL-CLOSED-STUBS-1` — **only if a human explicitly approves
code**. It would:

- create `authorization.ts`;
- export fail-closed functions only;
- import no Prisma;
- query no DB;
- not wire routes/services;
- add tests proving fail-closed behavior.

Alternative: `CLIENT-PORTAL-CP-SCHEMA-1-MIGRATION-PLAN-DRAFT-1` (docs-only).

**Effective next default: `CLIENT-PORTAL-AUTHZ-FAIL-CLOSED-STUBS-1`.** Reason: it
adds the missing authz module boundary before any route-service or schema
implementation.

## Final decision statement

- The authz/principal boundary is **designed only**.
- **No authorization implementation exists.**
- **No route/service wiring exists.**
- Client Portal remains **inert**.
- CP-SCHEMA-1 remains **blocked**.
- Production apply remains **NO-GO**.
