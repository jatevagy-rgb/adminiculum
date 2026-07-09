# Workload Records Exposure Audit

## Purpose

This document audits `workload_records` for runtime exposure, authorization safety, privacy sensitivity, and internal-only posture.

This is documentation-only. It makes no runtime change, no schema change, no migration, no DB connection, no production apply, and no CP-SCHEMA-1 authorization.

## Inputs

- `docs/production-schema-readonly-compare.md`
- `docs/present-compatible-keep-candidates-audit.md`
- `docs/production-compatible-baseline-human-decisions.md`
- `docs/partial-schema-drift-inventory.md`
- `docs/partial-schema-drift-triage.md`
- `Backend/prisma/schema.prisma`
- `Backend/src/index.ts`
- `Backend/src/modules/workgroups/routes.ts`
- `Backend/src/modules/workgroups/services.ts`
- `Backend/src/modules/workgroups/types.ts`
- `Backend/src/modules/workgroups/README.md`
- `Backend/src/openapi/publicSpec.ts`
- `Backend/tests`
- `Frontend/src/lib/api.ts`
- `Frontend/src/app/clients/[clientId]/workgroups/WorkgroupsPageContent.tsx`

No production DB, clone DB, Kudu, Azure, migration, smoke test, business-data query, AI/provider call, SharePoint call, or file-processing job was used.

## Confirmed baseline facts

- Production metadata result: `workload_records` is present-compatible in `docs/production-schema-readonly-compare.md`.
- Previous lane: `KEEP-BUT-HARDEN candidate` in `docs/present-compatible-keep-candidates-audit.md`.
- Present-compatible metadata does not automatically promote `workload_records` to `KEEP`.
- Client Portal remains disabled/quarantined and must not receive workload/capacity data without a separate approved external mapper.
- Production apply and CP-SCHEMA-1 remain blocked.

## Schema and model evidence

`Backend/prisma/schema.prisma` defines `WorkloadRecord` mapped to `workload_records`.

Key fields:

- `id` — UUID primary key.
- `period` — string period in `YYYY-MM` format.
- `reportedHours` — recorded workload hours as a float.
- `note` — optional free-text note.
- `createdAt` / `updatedAt` — timestamps.
- `workgroupId` — required relation to `ClientWorkgroup`.

Relationship and index shape:

- `Client.workgroups` relates one client to many `ClientWorkgroup` records.
- `ClientWorkgroup.workloadRecords` relates one workgroup to many workload records.
- `WorkloadRecord.workgroup` uses `workgroupId` with cascade delete.
- Unique constraint exists on `[workgroupId, period]`.
- Index exists on `workgroupId`.

## Usage inventory

| Area | File(s) | Read/write | Route/API exposure | Auth evidence | Role/user/case/task scoping evidence | External exposure risk | Risk level | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Workload record write | `Backend/src/modules/workgroups/routes.ts`; `Backend/src/modules/workgroups/services.ts` | Write/upsert | `POST /api/v1/workgroups/:id/workload`; accepts `period`, `reportedHours`, and optional `note`; creates or overwrites by `workgroupId + period`. | Uses `authenticate`. | No route-local role, manager, current-user, client ownership, case-level, task-level, or workgroup membership check observed before `workloadService.recordWorkload`. Service verifies only that the workgroup exists. | Internal API currently, but arbitrary authenticated write risk if a workgroup id is known. | `MEDIUM` | Mutating operation can overwrite internal capacity/workload records. |
| Workload record read | `Backend/src/modules/workgroups/routes.ts`; `Backend/src/modules/workgroups/services.ts` | Read | `GET /api/v1/workgroups/:id/workload`; returns period, hours, note, and timestamps for one workgroup. | Uses `authenticate`. | No route-local role, current-user, client ownership, case-level, task-level, or workgroup membership check observed. Service filters only by path `workgroupId`. | Internal API currently, but cross-client/workgroup leakage risk if any authenticated user can guess or obtain a workgroup id. | `MEDIUM` | Notes may contain sensitive internal planning context. |
| Workload summary read | `Backend/src/modules/workgroups/routes.ts`; `Backend/src/modules/workgroups/services.ts` | Read/aggregate | `GET /api/v1/clients/:clientId/workload-summary?period=YYYY-MM`; returns client-level total hours and per-workgroup hours/percentages. | Uses `authenticate`. | No route-local role, current-user, client ownership, case-level, task-level, or client membership check observed. Service filters by path `clientId` and active workgroups. | Internal API currently, but broad capacity summary leakage risk by client id. | `MEDIUM` | Summary exposes capacity distribution and internal workgroup structure. |
| Workgroup CRUD adjacent surface | `Backend/src/modules/workgroups/routes.ts`; `Backend/src/modules/workgroups/services.ts` | Read/write/delete workgroup metadata | `/api/v1/clients/:clientId/workgroups`; `/api/v1/workgroups/:id`; create/update/delete/list workgroups. | Uses `authenticate`. | No route-local role, current-user, client ownership, or manager check observed. | Internal API currently; adjacent to workload because workgroups are the parent for workload records. | `MEDIUM` | Soft delete and edit can affect workload visibility and grouping. |
| Frontend client workgroups page | `Frontend/src/app/clients/[clientId]/workgroups/WorkgroupsPageContent.tsx`; `Frontend/src/lib/api.ts` | Read/write | Calls workgroup CRUD, workload read/write, and workload summary endpoints from an authenticated frontend API client. | Relies on backend auth via `fetchApi`. | No frontend-side authorization model beyond route context; backend must enforce scope. | Internal UI route; no Client Portal route found for this page. | `MEDIUM` | Displays workgroup names, hours, percentages, and optional workload notes; includes record/edit/delete controls. |
| Public OpenAPI metadata | `Backend/src/openapi/publicSpec.ts` | Metadata exposure | Sanitizer quarantines `/api/v1/workgroups`, `/api/v1/clients/:clientId/workgroups`, and `/api/v1/clients/:clientId/workload-summary`. | OpenAPI JSON serving is unauthenticated, but sanitized public metadata removes workload/workgroup paths if present. | Runtime auth unaffected by metadata sanitizer. | Public metadata exposure is currently guarded/quarantined. | `LOW` current / `UNKNOWN` if spec changes | `Backend/swagger.yaml` was not present at the checked path. Runtime routes still exist regardless of public metadata. |
| Backend tests | `Backend/tests` | Test coverage | Search found no targeted workload/workgroup authorization tests. | N/A | No targeted tests proving unauthorized/wrong-client/current-user/manager behavior were found. | Test gap, not direct exposure. | `MEDIUM` | Future hardening should add route tests. |
| Client Portal docs and routes | Client Portal decision docs; `Backend/src/routes/clientPortal.ts` context | External exposure boundary | Client Portal remains disabled/quarantined; no approved portal mapper for workload records found. | Client Portal gate is separate and not enabled by this audit. | No external workload publication model exists. | Workload data is not safe for Client Portal as raw data. | `LOW` current / `HIGH` if exposed raw | Prior portal docs explicitly forbid internal workload/capacity leakage. |

## Authorization and exposure findings

- Workload and workgroup routes are mounted under `/api/v1` from `Backend/src/index.ts`.
- Workload routes use general `authenticate` middleware.
- No route-local role-scoping, admin/partner/manager-only check, current-user filtering, client ownership check, workgroup membership check, case-level authorization, or task-level authorization was observed for workload read/write/summary routes.
- `recordWorkload` validates period format and checks only that the parent workgroup exists before upserting.
- `getWorkloadByWorkgroup` filters only by path `workgroupId`.
- `getClientWorkloadSummary` filters only by path `clientId` and period, then aggregates active workgroups.
- Workgroup CRUD is adjacent and similarly general-auth only in the inspected route layer.
- No targeted workload authorization tests were found in `Backend/tests`.
- Public OpenAPI sanitizer explicitly removes workgroup/workload paths from served public metadata if they are present, reducing public metadata exposure but not proving runtime authorization safety.
- The module README contains an RBAC table suggesting Admin/Lawyer/Client permissions, including future client read-only summary, but inspected route code does not implement that RBAC model.

## Privacy/security findings

- Workload records expose internal capacity, staffing, productivity, and matter/client activity patterns.
- `reportedHours`, per-workgroup percentages, and optional notes can reveal client workload distribution and internal operational context.
- Workgroup names/descriptions may reveal client teams, legal support structure, compliance areas, or matter context.
- Client-level workload summary can indirectly reveal client/matter relationship intensity even without case IDs.
- This data can be safe as an internal tool if access is scoped to a need-to-know role, client team, responsible lawyer, manager, or admin/partner role.
- Raw workload records are not safe for Client Portal or external exposure without an approved external publication model, strict field mapper, aggregate-only policy, and privacy/GDPR review.
- The current inspected implementation appears to rely on general authentication rather than scoped authorization, so cross-client/team leakage remains a blocker for a narrow internal `KEEP` decision.

## Decision lane

`workload_records` remains:

`KEEP-BUT-HARDEN candidate`

Reason:

- The production physical schema is present-compatible.
- The repo has active internal runtime and frontend usage.
- The data can be useful internal client/workgroup capacity metadata.
- Public OpenAPI metadata currently quarantines workload/workgroup paths.
- However, inspected runtime routes rely on general authentication, with no visible client/workgroup/role/current-user scoped authorization or targeted tests.
- Workload data can expose internal capacity, productivity, client relationship intensity, and optional internal notes.

This audit does not move `workload_records` to `KEEP`. It also does not move workload data to Client Portal, external visibility, CP-SCHEMA-1, production apply, or DB migration replay.

## Required next package

Recommended next package:

`WORKLOAD-RECORDS-HARDEN-1`

Suggested purpose:

- Add or prove internal role/user/client/workgroup scoping for workload and adjacent workgroup routes.
- Define who may read workload records and summaries: admin/partner, responsible lawyer, client team member, workgroup manager, or other approved internal role.
- Define who may create/update/delete workgroups and upsert workload records.
- Ensure wrong-client, wrong-workgroup, and ordinary authenticated-user access is rejected.
- Preserve public OpenAPI quarantine unless a separate exposure decision changes it.
- Keep Client Portal and external visibility out of scope.
- Add targeted route tests for unauthenticated, unauthorized, authorized read, authorized write, wrong-client/workgroup, and public metadata behavior.
- No schema change unless separately justified.

If a future hardening package proves those protections, a later `WORKLOAD-RECORDS-INTERNAL-KEEP-DECISION-1` can decide whether to move `workload_records` to narrow internal `KEEP`.

## Non-actions

This audit did not:

- change schema;
- create, edit, apply, resolve, move, or delete migrations;
- connect to any database;
- apply any DB change;
- read business data;
- touch Azure, Kudu, app settings, or deployment;
- change runtime behavior;
- change route behavior;
- change OpenAPI or CORS behavior;
- change auth behavior;
- change frontend behavior;
- change tests;
- run production smoke tests;
- run AI/provider calls;
- run SharePoint calls;
- run file-processing jobs;
- authorize CP-SCHEMA-1.

## Final classification

`workload_records_exposure_audited_no_db_change_no_runtime_change`
