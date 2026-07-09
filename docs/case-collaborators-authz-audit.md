# Case Collaborators Authorization Audit

## Purpose

This document audits `case_collaborators` for runtime exposure and authorization safety.

It is documentation-only. It makes no runtime change, no schema change, no migration, no DB connection, no production apply, and no CP-SCHEMA-1 authorization.

## Inputs

- `docs/production-schema-readonly-compare.md`
- `docs/present-compatible-keep-candidates-audit.md`
- `docs/production-compatible-baseline-human-decisions.md`
- `Backend/prisma/schema.prisma`
- `Backend/src/index.ts`
- `Backend/src/modules/cases/routes.ts`
- `Backend/src/modules/cases/services.ts`
- `Backend/src/modules/handoff-packages/authorization.ts`
- `Backend/src/openapi/publicSpec.ts`
- `Backend/tests/routeFeatureGuards.test.ts`
- `Frontend/src/lib/api.ts`
- `Frontend/src/components/CaseDetail.tsx`
- `Frontend/src/app/tasks/page.tsx`
- `Frontend/src/app/reviews/page.tsx`
- `Frontend/src/app/clients/[clientId]/page.tsx`
- `Frontend/src/app/cases/[caseId]/communications/CommunicationsPageContent.tsx`
- `Frontend/src/app/cases/[caseId]/review/[documentId]/ReviewPageContent.tsx`

No production DB, clone DB, Kudu, Azure, migration, smoke test, business-data query, AI/provider call, SharePoint call, or file-processing job was used.

## Confirmed baseline facts

- Production metadata result: `case_collaborators` is present-compatible in `docs/production-schema-readonly-compare.md`.
- Previous lane: `KEEP-BUT-HARDEN candidate` in `docs/present-compatible-keep-candidates-audit.md`.
- Present-compatible metadata does not automatically promote `case_collaborators` to `KEEP`.
- Client Portal remains disabled/quarantined and has no approved external mapper for collaborator/team data.
- Production apply and CP-SCHEMA-1 remain blocked.

## Schema and model evidence

`Backend/prisma/schema.prisma` defines `CaseCollaborator` mapped to `case_collaborators`.

Key fields:

- `id` — UUID primary key.
- `caseId` — required relation to `Case`.
- `userId` — required relation to `User`.
- `role` — string with default `COLLABORATOR`.
- `addedAt` — timestamp.

Relationship and index shape:

- `Case.collaborators` relates one case to many collaborator records.
- `User.caseCollaborations` relates one user to many collaborator records.
- Case/user foreign keys use cascade delete.
- Unique constraint exists on `[caseId, userId]`.
- Indexes exist on `caseId` and `userId`.

## Usage inventory

| Area | File(s) | Read/write | Route/API exposure | Auth evidence | Case-level authorization evidence | External exposure risk | Risk level | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Collaborator list route | `Backend/src/modules/cases/routes.ts`; `Backend/src/modules/cases/services.ts` | Read | `GET /api/v1/cases/:caseId/collaborators`; returns collaborator id, userId, role, addedAt, and user id/name/email/role. | Uses `authenticate`. | No route-local assigned-lawyer, privileged-role, same-case collaborator, or current-user membership check observed before `casesService.getCaseCollaborators(caseId)`. | Internal API only, but cross-case enumeration risk if any authenticated user can guess/obtain a `caseId`. | `MEDIUM` | Knowing a `caseId` appears sufficient after general auth. |
| Collaborator create route | `Backend/src/modules/cases/routes.ts`; `Backend/src/modules/cases/services.ts` | Write | `POST /api/v1/cases/:caseId/collaborators`; creates a collaborator and returns user id/name/email/role. | Uses `authenticate`. | No route-local manage-collaborator permission, assigned-lawyer check, privileged-role check, or same-case check observed. | Internal API only, but can alter internal team membership if generally authenticated. | `MEDIUM` | Duplicate user/case is handled by DB uniqueness, not authorization. |
| Collaborator delete route | `Backend/src/modules/cases/routes.ts`; `Backend/src/modules/cases/services.ts` | Write | `DELETE /api/v1/cases/:caseId/collaborators/:collaboratorId`; deletes by collaborator id. | Uses `authenticate`. | No route-local check that `collaboratorId` belongs to `caseId`; no manage permission observed. | Internal API only, but wrong-case deletion risk exists if a collaborator id is known. | `MEDIUM` | The path has `caseId`, but service deletes by collaborator id only. |
| Case list/detail services | `Backend/src/modules/cases/services.ts` | Read | `GET /api/v1/cases` includes `collaboratorCount: 0`; `GET /api/v1/cases/:caseId` includes assigned lawyer but not collaborator relation. | Routes use `authenticate`. | No collaborator-specific exposure in these response bodies beyond the hardcoded count. | Low for collaborator data, because detailed collaborator rows are not included. | `LOW` | Case list count currently does not query `case_collaborators`. |
| Handoff package authorization | `Backend/src/modules/handoff-packages/authorization.ts`; `Backend/tests/routeFeatureGuards.test.ts` | Read as auth signal | Handoff package routes use collaborator membership as one allowed case-access signal. | Handoff routes require auth and feature gates. | Explicit helper allows privileged roles, assigned lawyer, or same-case collaborator; tests cover blocked wrong-case users and authorized assigned/collaborator paths. | Internal handoff surface; not a generic collaborator exposure. | `LOW` for handoff surface | Stronger case-access pattern exists here but is not reused by generic collaborator routes. |
| Case detail UI | `Frontend/src/components/CaseDetail.tsx`; `Frontend/src/lib/api.ts` | Read/write/delete | Calls `getCaseCollaborators`, `addCaseCollaborator`, and `removeCaseCollaborator`. | Uses authenticated frontend API client. | Relies on backend route authorization. | Internal UI surface. | `MEDIUM` | UI exposes collaborator management controls; backend must enforce policy. |
| Task/review assignment UI | `Frontend/src/app/tasks/page.tsx`; `Frontend/src/app/reviews/page.tsx`; `Frontend/src/app/cases/[caseId]/review/[documentId]/ReviewPageContent.tsx` | Read | Calls `getCaseCollaborators` for assignee suggestions or participant counts. | Uses authenticated frontend API client. | Relies on backend route authorization. | Internal UI surface. | `MEDIUM` | Returns internal user names/emails/roles for selected cases. |
| Client create-case flow | `Frontend/src/app/clients/[clientId]/page.tsx` | Write | After case creation, calls `addCaseCollaborator(created.id, userId, 'COLLABORATOR')`. | Uses authenticated frontend API client. | Relies on backend route authorization. | Internal UI surface. | `MEDIUM` | Backend should ensure caller may manage collaborators on the newly created case. |
| Case communications workspace | `Frontend/src/app/cases/[caseId]/communications/CommunicationsPageContent.tsx` | Read | Calls `getCaseCollaborators` for participant visibility. | Uses authenticated frontend API client. | Relies on backend route authorization. | Internal UI surface. | `MEDIUM` | Displays internal case participant/team metadata. |
| OpenAPI public metadata | `Backend/src/openapi/publicSpec.ts` | Metadata exposure | Sanitizer does not explicitly quarantine `/api/v1/cases/:caseId/collaborators`; no `Backend/swagger.yaml` file was present at the checked path. | OpenAPI JSON serving is unauthenticated, but sanitized. | Runtime auth unaffected by metadata sanitizer. | Unknown without generated/served spec inventory; route may or may not appear in source spec. | `UNKNOWN` | Future hardening should confirm public metadata does not present collaborator management as externally safe. |
| Client Portal | `Backend/src/routes/clientPortal.ts`; decision docs | External/client-facing | No approved Client Portal exposure of collaborators found. | Client Portal remains auth-first and disabled/quarantined. | No external mapper exists for collaborators. | High if ever exposed without mapper, but currently not enabled. | `LOW` current / `HIGH` if exposed | Collaborator/team metadata must stay internal unless a future external publication model explicitly maps it. |

## Authorization findings

- Generic collaborator routes require general authentication.
- No route-local case-level authorization was observed on `GET /cases/:caseId/collaborators`.
- No route-local manage-collaborator permission was observed on `POST /cases/:caseId/collaborators`.
- No route-local verification was observed that `DELETE /cases/:caseId/collaborators/:collaboratorId` deletes a collaborator belonging to the path `caseId`.
- No current-user filtering was observed on generic collaborator reads; service query filters only by path `caseId`.
- No admin-only or privileged-role requirement was observed for generic collaborator writes.
- A stronger case-access pattern exists in `Backend/src/modules/handoff-packages/authorization.ts`, where privileged roles, assigned lawyer, or same-case collaborator membership can access handoff packages. Existing tests cover that handoff surface, but this pattern is not currently reused by generic collaborator routes.

## Privacy/security findings

- Collaborator records identify internal lawyers/staff through user id/name/email/role.
- Collaborator rows reveal internal team structure and matter responsibility.
- This is lower sensitivity than legal document content, but it is still internal operational metadata.
- General-auth-only access creates cross-case leakage risk: if any authenticated user can access arbitrary `caseId` collaborator rows, they can learn team membership for matters outside their need-to-know scope.
- Mutating collaborator routes can change matter team membership unless a future hardening pass adds or proves manage permissions.
- Collaborator data is not safe for Client Portal or external exposure without a dedicated internal/external mapper, publication decision, and authorization model.

## Decision lane

`case_collaborators` remains:

`hardened internal KEEP candidate`

Reason:

- The production physical schema is present-compatible.
- The repo has active internal runtime usage.
- The data is useful internal matter/team metadata.
- However, generic collaborator read/write/delete routes appear to rely on general authentication only.
- Case-level authorization, current-user access checks, manage-collaborator permission, delete path consistency, OpenAPI metadata posture, and targeted tests remain required before a narrow internal `KEEP` decision.

CASE-COLLABORATORS-HARDEN-1 subsequently added case-level authorization for generic collaborator reads and stronger manager-only authorization for generic collaborator create/delete. It also added targeted tests for unauthenticated access, wrong-case access, authorized collaborator reads, manager writes, and delete path consistency.

This audit and hardening do not move `case_collaborators` to broad `KEEP`. A separate human decision is still required before changing the production-compatible baseline lane to full narrow internal `KEEP`.

## Hardening closeout — CASE-COLLABORATORS-HARDEN-1

Commit: `7177693`

Runtime change: narrow backend authorization hardening only.

Schema, migration, DB, Azure, frontend, Client Portal, CORS, and OpenAPI changes: no.

Read access now requires one of:

- admin / partner;
- assigned lawyer;
- creator;
- same-case collaborator.

Create/delete now require manager access through one of:

- admin / partner;
- assigned lawyer;
- creator.

Delete now validates collaborator membership using both:

- path `caseId`;
- `collaboratorId`.

Targeted tests:

- `caseCollaboratorsAuthz`;
- 9 tests passed.

Full backend validation from the hardening package:

- 13 suites / 145 tests passed.

Decision posture:

- Current lane: `hardened internal KEEP candidate`.
- Not broad `KEEP`.
- Not external/client-facing `KEEP`.
- Not Client Portal.
- Not CP-SCHEMA-1.
- Not production apply.

Remaining limitations:

- This hardening covers generic collaborator read/create/delete routes only.
- Any future external exposure requires a separate internal/external mapper and privacy review.
- Any future collaborator update route, bulk route, export route, or OpenAPI exposure must be separately reviewed.
- Client Portal remains disabled/quarantined.

## Required next package

Completed hardening package:

`CASE-COLLABORATORS-HARDEN-1`

Implemented scope:

- Added case-level authorization for collaborator reads.
- Added manage-collaborator authorization for collaborator create/delete.
- Limited collaborator managers to privileged roles, assigned lawyer, or case creator.
- Allowed same-case collaborators to read collaborator lists but not manage them.
- Ensured collaborator deletion verifies `collaboratorId` belongs to the path `caseId`.
- Added targeted tests for unauthenticated, wrong-case, authorized read, authorized write, unauthorized write/delete, and delete-wrong-case behavior.

Remaining before full internal `KEEP`:

- Confirm public OpenAPI metadata does not present collaborator management as externally safe.
- Keep Client Portal external exposure out of scope unless a separate publication/mapper model exists.
- No schema change unless separately justified.

If a future hardening pass proves the above protections, a later `CASE-COLLABORATORS-INTERNAL-KEEP-DECISION-1` can decide whether to move `case_collaborators` to narrow internal `KEEP`.

## Non-actions

This audit did not:

- change schema;
- create, edit, apply, resolve, move, or delete migrations;
- connect to any database;
- apply any DB change;
- read business data;
- touch Azure, Kudu, app settings, or deployment;
- change runtime behavior beyond collaborator authorization hardening;
- change route behavior beyond collaborator authorization hardening;
- change OpenAPI or CORS behavior;
- change auth behavior;
- change frontend behavior;
- change tests;
- run production smoke tests;
- run AI/provider calls;
- run SharePoint calls;
- run file-processing jobs;
- authorize CP-SCHEMA-1.

This closeout update did not:

- change runtime behavior;
- change route behavior;
- change tests;
- change schema;
- create migrations;
- connect to any database;
- apply any DB change;
- touch Azure, CORS, OpenAPI, frontend, auth, or Client Portal.

## Final classification

`case_collaborators_hardening_closeout_documented_no_db_change_no_runtime_change`
