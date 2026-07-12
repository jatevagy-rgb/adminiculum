# Client Portal Frontend Shell Design

## Purpose

This document designs a possible future Client Portal V1 frontend shell. It is documentation-only.

This document makes no frontend implementation, no runtime change, no schema change, no migration, no DB connection, no production apply, no CP-SCHEMA-1 authorization, no Client Portal enablement, no external visibility authorization, no Document/AI enablement, no AI/provider call, and no SharePoint/export/file-processing call.

## Inputs

- `docs/client-portal-product-boundary-design.md`
- `docs/client-portal-current-code-inventory.md`
- `docs/client-portal-v1-data-contract-design.md`
- `docs/client-portal-authz-model-design.md`
- `docs/client-portal-v1-ui-ia-design.md`
- `docs/client-portal-schema-readiness-design.md`
- `docs/client-portal-runtime-skeleton-harden-design.md`
- Frontend inventory of `Frontend/src/app`, `Frontend/src/components`, and `Frontend/src/lib/api.ts`

## Current Status

- Client Portal remains disabled and quarantined.
- No dedicated frontend portal route, component tree, or API client exists in the focused inventory.
- The backend skeleton remains mounted, auth-first, double-gated, and disabled.
- No `Backend/src/modules/client-portal` service module exists.
- No approved/applied/runtime grant schema exists.
- Data contract, authorization, UI/IA, schema readiness, runtime boundary, and this frontend shell design are documentation-only.
- This frontend shell design does not authorize implementation or enablement.
- CP-SCHEMA-1 remains blocked.
- Production apply remains NO-GO.

## Frontend Shell Thesis

The Client Portal shell should be a calm, narrow, client-facing workspace organized around:

- attention;
- matters;
- shared documents;
- upload requests;
- safe updates;
- contact or responsible lawyer information.

It must not present:

- internal workflow;
- internal task board;
- litigation workspace;
- internal document review;
- internal notes;
- workload or collaborators;
- raw legal text;
- AI or legal analysis.

## Proposed Frontend Route Structure

These routes are conceptual only. No frontend route is created by this document.

| Route | V1 status | Screen purpose | DTO dependency | Forbidden content | Disabled state |
| --- | --- | --- | --- | --- | --- |
| `/portal` | Candidate V1 home | Attention summary, safe updates, next actions, responsible contact | `PortalHomeDto` | internal dashboard cards, internal tasks, workload, AI/legal analysis | Portal unavailable screen |
| `/portal/matters` | Candidate V1 | List granted matters only | `PortalMatterSummaryDto[]` | all client matters, internal case list, collaborators, internal statuses | Empty or unavailable state |
| `/portal/matters/[matterId]` | Candidate V1 | One granted matter with safe status, next steps, shared documents, upload requests | `PortalMatterDetailDto` | internal timeline, notes, litigation workspace, `workspaceText`, strategy | Non-enumerating unavailable/revoked state |
| `/portal/documents` | Candidate V1 | List explicitly shared document artifacts | `PortalDocumentSummaryDto[]` | raw document text, internal review status, storage paths, generated drafts | Empty or unavailable state |
| `/portal/documents/[documentId]` | Candidate V1 limited detail | Shared document metadata and safe access instructions only | `PortalDocumentDetailDto` | document body, `workspaceText`, raw extracted text, SharePoint path | Non-enumerating unavailable/revoked state |
| `/portal/uploads` | Candidate V1 | Client upload requests and safe status | `PortalUploadRequestDto[]` | storage destination, virus-scan internals, reviewer notes, internal document routes | Empty or expired state |
| `/portal/messages` | Deferred | Future approved external messages only | Future message DTO | raw communications, internal notes, drafts, strategy | Deferred/disabled state |
| `/portal/profile` | Optional | Minimal client identity and contact preferences | `PortalProfileDto` | auth claims dump, internal user roles, broad master data | Unavailable state |

## Shell Layout

The portal should use a separate layout from the internal app shell.

Recommended shell pieces:

- `PortalShell` — top-level client-facing frame, separate from `AppShell`.
- `PortalTopNav` — compact navigation for Home, Matters, Documents, Uploads, optional Profile.
- `PortalMobileNav` — mobile-friendly equivalent with no internal routes.
- `PortalContentContainer` — narrow readable content area.
- `PortalFooter` / legal notice — optional law-office identity and support contact.
- `PortalDisabledState` — global disabled/quarantined display.
- `PortalAccessRevokedState` — non-enumerating revoked-access display.

Layout rules:

- Keep law-office identity and support contact visible.
- Do not include internal admin navigation.
- Do not link to internal case, task, document review, litigation, communication, workload, or settings routes.
- Do not reuse `Sidebar` or `AppShell` directly if they include internal routes or internal workflow assumptions.

## Component Design

| Component | Purpose | DTO dependency | Allowed fields | Forbidden fields | Visual primitive reuse |
| --- | --- | --- | --- | --- | --- |
| `PortalHomeAttentionPanel` | Show what the client should notice first | `PortalHomeDto` | safe next action, deadline, approved status | internal priority, AI score, internal task state | Tokens/cards/buttons only |
| `PortalMatterCard` | Summarize one granted matter | `PortalMatterSummaryDto` | title, client-facing status, responsible lawyer, next deadline | internal case notes, collaborators, workload | Card/badge primitives only |
| `PortalMatterStatusBadge` | Client-readable matter state | status enum from portal DTO | approved external label | raw workflow enum if not mapped | Badge styling only |
| `PortalNextActionCard` | Show client action request | action DTO | safe instruction, due date, action label | internal assignee, internal task board data | Card/button primitives only |
| `PortalDeadlineList` | Show client-visible deadlines | deadline DTO | title, date, matter label | internal scheduling metadata | List typography only |
| `PortalSharedDocumentList` | List explicitly shared documents | document summary DTO | title, type, shared date, safe status | raw text, `workspaceText`, storage refs | List/card primitives only |
| `PortalDocumentCard` | Display shared document metadata | document summary/detail DTO | title, type, publication status | review comments, extracted text, SharePoint path | Card/badge primitives only |
| `PortalUploadRequestCard` | Show requested upload | upload request DTO | request title, due date, allowed file hint | storage destination, internal reviewer note | Card/button primitives only |
| `PortalSafeUpdateTimeline` | Show approved external updates | safe update DTO | approved update text, date, public actor label | internal timeline, raw comments, audit logs | Timeline visual primitive only if content-neutral |
| `PortalResponsibleLawyerCard` | Show safe law-office contact | contact DTO | name, role, safe contact channel | internal user metadata, auth ids | Card/avatar primitive only |
| `PortalEmptyState` | Honest empty states | none or screen-specific DTO | safe no-data copy | hidden technical reason, other-client existence | Empty-state primitive if neutral |
| `PortalSkeletonState` | Loading state | none | neutral loading blocks | content-shaped fake data | Skeleton primitive if neutral |
| `PortalErrorState` | Safe error state | error code | generic retry/support copy | stack traces, ids, internal route names | Error primitive if neutral |
| `PortalAccessRevokedState` | Non-enumerating revoked/grant-denied state | none | support/contact copy | object existence details | Empty/error primitive if neutral |
| `PortalDisabledState` | Feature unavailable state | none | disabled/quarantined copy | implementation details, feature flags | Empty/error primitive if neutral |

## Visual Reuse Policy

Allowed reuse:

- typography tokens;
- spacing tokens;
- color tokens;
- neutral card primitives;
- safe badge primitive;
- button primitive;
- content-neutral empty state primitive;
- content-neutral loading skeleton primitive.

Forbidden direct reuse:

- internal `Dashboard` cards;
- internal `CaseDetail` components;
- internal task board;
- internal litigation workspace;
- internal document review, compare, anonymize, or rehydrate UI;
- internal communication widgets;
- internal workload/team board;
- internal admin/settings pages;
- any component that assumes internal DTOs, internal routes, internal workflow state, or internal actor roles.

## Mock/Static Data Strategy for Future Implementation

If a future frontend shell implementation happens before backend enablement:

- Use local synthetic mock data only.
- Do not call disabled portal routes except to display the disabled state.
- Do not use real case, client, document, lawyer, or matter names.
- Do not include real legal text.
- Do not include `workspaceText`.
- Do not copy internal DTO fixtures.
- Mark mock data as synthetic/dev-only in code comments and tests.
- Keep the route inaccessible or feature-gated unless explicitly approved.
- Prefer a global `PortalDisabledState` if product approval is not yet granted.

## Disabled and Unavailable States

| State | Client-facing copy direction | Non-enumerating behavior | Forbidden technical details |
| --- | --- | --- | --- |
| Portal globally disabled | "Az ügyfélportál ebben a környezetben még nem elérhető." | Do not reveal route readiness or schema state | feature flag names, stack traces |
| User not authenticated | "Jelentkezzen be a hozzáféréshez." | No portal object lookup | tenant/client identifiers |
| Portal user not provisioned | "Ehhez a felhasználóhoz nincs aktív ügyfélportál-hozzáférés." | Do not reveal client records | internal user-role mapping |
| No shared matters | "Jelenleg nincs megosztott ügy." | Do not imply all firm matters | internal case counts |
| Matter access revoked | "Ez az elem már nem elérhető. Kérjük, vegye fel a kapcsolatot az irodával." | Same shape as not found where appropriate | matter existence details |
| Document share revoked | "A dokumentum megosztása nem elérhető." | Same shape as not found where appropriate | document existence/details |
| Upload request expired | "A feltöltési kérés lejárt vagy lezárult." | Do not expose storage target | storage path or scanner state |
| Feature deferred | "Ez a funkció későbbi körben lesz elérhető." | No backend lookup | roadmap internals |
| Maintenance/unavailable | "A portál átmenetileg nem elérhető." | No object enumeration | deployment/app details |

## Privacy Checklist

Every future screen/component must prove:

- DTO allow-list only;
- no internal DTO reuse;
- no `workspaceText`;
- no raw extracted text;
- no internal notes;
- no internal tasks;
- no workload records;
- no collaborators;
- no AI/legal analysis;
- no internal audit logs;
- no storage paths;
- no SharePoint paths;
- no internal ids unless reviewed;
- content-free errors.

## API Client Design

Conceptual future frontend API module:

`Frontend/src/lib/clientPortalApi.ts`

Rules if later implemented:

- Use typed DTOs from the V1 Client Portal contract.
- Do not fall back to internal API endpoints.
- Do not reuse internal `api.ts` case/document/task functions directly.
- Handle disabled gate responses explicitly.
- Handle `401`, `501`, `404`, and `403` without enumerating resources.
- Do not request raw text endpoints.
- Do not call document compare, review, anonymize, rehydrate, generation, communication, workload, admin, or internal case endpoints.

This file is conceptual only and is not created by this task.

## Accessibility and Tone

The future portal shell should use:

- plain Hungarian client-facing language;
- clear deadlines and action labels;
- understandable status labels;
- keyboard-accessible navigation;
- visible focus states;
- readable contrast;
- mobile-friendly layout;
- calm tone with no legal jargon unless intentionally client-facing.

## Future Frontend Tests

Later implementation should add tests proving:

- shell renders disabled state when portal is disabled;
- no internal navigation links render;
- no internal DTO fields render;
- `workspaceText` marker never renders;
- mock data is synthetic;
- matter card uses only allowed DTO fields;
- document card never shows raw content;
- upload request screen never shows storage path;
- access revoked state is non-enumerating;
- messages route remains deferred/disabled;
- no internal API functions are imported;
- no internal `Dashboard`, `CaseDetail`, task board, litigation, document review, communication, workload, or admin components are imported.

## Recommended Next Package

Safer default:

`CLIENT-PORTAL-DESIGN-ROLLUP-1`

Reason: the product boundary, code inventory, data contract, authorization model, UI/IA, schema readiness, runtime skeleton boundary, and frontend shell designs are now complete enough to roll up before any implementation.

Implementation option only if a human explicitly approves frontend code changes:

`CLIENT-PORTAL-FRONTEND-SHELL-MOCK-IMPLEMENTATION-1`

That package must remain frontend-only, disabled/default-off, synthetic-data-only, and must not call live portal backend routes except for disabled-state handling.

## Follow-up — CLIENT-PORTAL-DESIGN-ROLLUP-1

- `CLIENT-PORTAL-DESIGN-ROLLUP-1` created `docs/client-portal-design-rollup.md`.
- The rollup consolidates the product boundary, code inventory, data contract,
  authorization model, UI/IA, schema readiness, runtime skeleton boundary, and frontend
  shell design.
- This frontend shell remains documentation-only. No frontend implementation, runtime,
  schema, migration, DB, Azure, OpenAPI/CORS, auth, or Client Portal enablement is
  authorized.

## Follow-up — CLIENT-PORTAL-FRONTEND-SHELL-MOCK-IMPLEMENTATION-1

- `CLIENT-PORTAL-FRONTEND-SHELL-MOCK-IMPLEMENTATION-1` added a static/mock `/portal`
  frontend shell using synthetic data only.
- The implementation demonstrates the shell, matter cards, safe next actions, document
  metadata, upload request cards, responsible lawyer card, deferred states, and disabled
  mock actions without backend integration.
- No backend API calls, internal API imports, real client/case/document data, upload,
  download, SharePoint/Graph, AI/provider, schema, migration, CP-SCHEMA-1, production
  apply, or Client Portal backend enablement is authorized by the mock shell.

## Follow-up — CLIENT-PORTAL-FRONTEND-MOCK-SHELL-SAFETY-POLISH-1

- `CLIENT-PORTAL-FRONTEND-MOCK-SHELL-SAFETY-POLISH-1` polished the static/mock `/portal`
  shell without adding backend integration.
- The shell now makes the synthetic-data notice, "Figyelmet igényel" first screen,
  secondary active-matter section, metadata-only documents, inactive upload/download
  actions, and deferred messages/profile states clearer.
- It remains frontend-only and synthetic-data-only. No backend API calls, internal API
  imports, schema/migration changes, DB access, Azure changes, auth changes,
  OpenAPI/CORS changes, Client Portal backend enablement, external visibility,
  CP-SCHEMA-1 readiness, or production apply readiness are authorized.

## Follow-up — Client Portal mock subroutes

- Static/mock subroutes now exist for `/portal/matters`, `/portal/matters/[matterId]`,
  `/portal/documents`, and `/portal/uploads`.
- They remain frontend-only, synthetic-data-only, and API-free.
- The subroutes demonstrate mock matter list/detail, metadata-only document list, and
  inactive upload request list without real data, backend calls, internal API imports,
  upload/download implementation, messages, or document-content preview.

## Follow-up — CLIENT-PORTAL-FRONTEND-MOCK-ROUTES-SAFETY-CLOSEOUT-1

- `CLIENT-PORTAL-FRONTEND-MOCK-ROUTES-SAFETY-CLOSEOUT-1` completed a safety closeout for
  `/portal`, `/portal/matters`, `/portal/matters/[matterId]`, `/portal/documents`, and
  `/portal/uploads`.
- The closeout confirmed no `fetch(`, no `@/lib/api`, no internal workflow component
  imports, no `workspaceText`, no file input, no form submission, no active
  upload/download/message behavior, and no internal app navigation links in the mock
  route tree.
- Client Portal backend remains disabled/quarantined; external visibility remains
  unauthorized; CP-SCHEMA-1 and production apply remain blocked.

## Final Decision Statement

This design does not implement a frontend shell. Client Portal remains quarantined. CP-SCHEMA-1 remains blocked. Production apply remains NO-GO. External visibility remains unauthorized. The runtime skeleton remains disabled. No schema migration is authorized. No frontend route or component is authorized by this document.

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

`client_portal_frontend_shell_designed_no_db_change_no_runtime_change`

## Follow-up — CLIENT-PORTAL-FRONTEND-MOCK-UX-POLISH-1

- `CLIENT-PORTAL-FRONTEND-MOCK-UX-POLISH-1` polished the static/mock Client Portal route tree for clearer client-facing review.
- The mock shell now has more consistent navigation, active-route affordance, clearer synthetic-data notice, improved matter/document/upload card hierarchy, metadata counts, and clearer disabled/deferred action copy.
- The route tree remains frontend-only, synthetic-data-only, typed against frontend-local Portal V1 DTO types, and API-free.
- No backend API calls, internal API imports, backend/schema/migration/DB/Prisma business access, OpenAPI/CORS exposure, Azure change, upload/download/message implementation, external visibility, CP-SCHEMA-1 readiness, production apply readiness, or Client Portal backend enablement is authorized.

## Closeout — CLIENT-PORTAL-FRONTEND-MOCK-UX-CLOSEOUT-1

- `CLIENT-PORTAL-FRONTEND-MOCK-UX-CLOSEOUT-1` reviewed the polished static/mock Client Portal route tree after `99b4da8`.
- The route tree remains frontend-only, synthetic-only, typed against frontend-local Portal V1 DTO types, and API-free.
- No backend API calls, internal API imports, `documents.workspaceText`, file input, real form action, active upload/download/message implementation, or real client/case/document data were introduced.
- No backend/schema/migration/DB/Prisma business access, Azure, OpenAPI/CORS, package, auth, or production behavior change was made.
- Client Portal backend remains disabled/quarantined, external visibility remains unauthorized, and CP-SCHEMA-1 plus production apply remain blocked.

## Checkpoint — CLIENT-PORTAL-IMPLEMENTATION-CHECKPOINT-1

- `CLIENT-PORTAL-IMPLEMENTATION-CHECKPOINT-1` confirms the frontend route tree remains static/mock, synthetic-only, DTO-typed, and API-free.
- No frontend API integration, internal API import, real data, file input, upload/download/message behavior, backend/schema/migration/DB change, CP-SCHEMA-1 readiness, production apply readiness, external visibility, or Client Portal enablement is authorized.
