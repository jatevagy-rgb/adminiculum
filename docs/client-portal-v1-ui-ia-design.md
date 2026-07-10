# Client Portal V1 UI / IA Design

## Purpose

This is a documentation-only UI and information architecture design for a possible future Client Portal V1. It makes no frontend implementation, no runtime change, no schema change, no migration, no DB connection, no production apply, no CP-SCHEMA-1 authorization, no Client Portal enablement, no external visibility authorization, no Document/AI enablement, no AI/provider call, and no SharePoint/export/file-processing call.

## Inputs

- `docs/client-portal-product-boundary-design.md`
- `docs/client-portal-current-code-inventory.md`
- `docs/client-portal-v1-data-contract-design.md`
- `docs/client-portal-authz-model-design.md`
- `docs/production-compatible-baseline-final-rollup.md`
- `docs/production-apply-no-go-reconfirmation.md`
- `docs/production-compatible-baseline-human-decisions.md`
- Existing frontend app routes and components, inspected only for visual/style context and internal/external distinction.

## Current status

- Client Portal remains disabled/quarantined.
- No frontend portal exists.
- The backend skeleton remains disabled and double-gated.
- The data contract and authorization model are documentation-only.
- This UI/IA design does not authorize implementation or enablement.
- CP-SCHEMA-1 remains blocked.
- Production apply remains NO-GO.

## V1 UX thesis

The client portal should answer: what is happening in my matter, what do I need to do, what documents are available, and what has changed — without exposing internal legal work.

The portal is not the internal Adminiculum dashboard. It should be simpler, calmer, and organized around client attention, active matters, safe statuses, shared documents, requested uploads, client-visible deadlines, and safe published updates.

## Primary navigation

| Navigation item | Purpose | V1 status | Required data contract | Forbidden content |
| --- | --- | --- | --- | --- |
| Home | Show client attention items and the safest overview after login. | Candidate | `PortalMeDto`, matter/task/upload/document summaries derived from granted DTOs. | Internal dashboard cards, workload, collaborator lists, internal case metrics. |
| Matters | List granted matters only. | Candidate | `PortalMatterListItemDto` | Internal case list DTOs, strategy, internal notes, ungranted matters. |
| Documents | Show explicitly shared documents only. | Candidate | `PortalDocumentListItemDto`, `PortalDocumentDetailDto` | Raw text, `workspaceText`, storage paths, all internal documents. |
| Uploads / Requests | Show requested client actions and file upload requests. | Candidate | `PortalUploadRequestDto`, safe `PortalTaskDto` subset | SharePoint paths, reviewer notes, AI/extraction status, arbitrary file dump. |
| Messages | Client-visible communication only if later approved. | Deferred | `PortalMessageThreadDto` | Internal communications, drafts, provider metadata, privileged strategy. |
| Profile / Contact | Show own portal identity and law office contact. | Optional | `PortalMeDto` | Broad client master data, tokens, auth claims, internal role data. |

## Home screen

Home is the first screen after login and should prioritize actionability over internal workflow detail.

| Section | Data source DTO | Empty state | Click target | Forbidden content | Privacy note |
| --- | --- | --- | --- | --- | --- |
| Needs your attention | `PortalTaskDto`, `PortalUploadRequestDto`, selected matter summary fields. | `Nincs jelenleg teendője.` | Task detail, upload request, or matter detail. | Internal tasks, internal priority, workload, lawyer-only checklists. | Only client-facing requests with active grants appear. |
| Active matters | `PortalMatterListItemDto` | `Jelenleg nincs megosztott ügye.` | `/portal/matters/:matterId` | Internal case status, notes, collaborators, strategy. | Only active matter grants are listed. |
| Requested uploads | `PortalUploadRequestDto` | `Nincs bekért dokumentum.` | `/portal/uploads` or upload request detail. | Storage destination, SharePoint path, AI/extraction status. | Upload requests must be explicitly granted and active. |
| Upcoming client-visible deadlines | Published deadline fields from `PortalMatterListItemDto` / `PortalTaskDto`. | `Nincs közelgő, ügyfélnek megosztott határidő.` | Matter or task context. | Internal deadlines, internal escalation, litigation stage. | Deadlines are visible only if deliberately published. |
| Recently shared documents | `PortalDocumentListItemDto` | `Még nincs megosztott dokumentum.` | Document detail. | Raw document text, all internal docs, review comments. | Matter grant plus document share required. |
| Latest safe updates | Published matter update fields from `PortalMatterDetailDto`. | `Még nincs megosztott frissítés.` | Matter detail. | Internal timeline, notes, audit logs, strategy. | Updates are publication artifacts, not internal timeline rows. |
| Responsible lawyer/contact card | `PortalMatterListItemDto` / `PortalMatterDetailDto` display fields. | `Kapcsolattartó megjelenítése később.` | Profile/contact or matter detail. | Internal user IDs, staffing/workload, collaborator list. | Display names only; no internal allocation data. |

Home must not show the internal task board, workload data, collaborator lists, internal case metrics, internal dashboard modules, litigation workspace state, or raw document text.

## Matters list screen

The matters list shows granted matters only.

Core content:

- matter display name or external matter label;
- client-facing status label;
- next client action;
- next client-visible deadline;
- needs-attention marker;
- responsible lawyer display name;
- shared document count;
- open upload request count.

Empty state:

> No matters are currently shared with you.

Forbidden content:

- internal status;
- internal deadlines;
- internal notes;
- case collaborators;
- workload records;
- litigation strategy;
- internal task counts;
- ungranted matter names.

## Matter detail screen

The matter detail screen is the safe client-facing workspace for one granted matter.

Sections:

- safe matter header;
- client-facing status;
- what happens next;
- client actions;
- shared documents;
- upload requests;
- client-visible deadlines;
- safe timeline updates;
- responsible lawyer/contact;
- optional messages preview, deferred.

Forbidden content:

- internal timeline;
- litigation workspace;
- review guidance;
- internal tasks;
- internal document review state;
- raw document text;
- `documents.workspaceText`;
- legal analysis;
- AI outputs;
- internal communications unless explicitly published later.

## Shared documents screen

The shared documents screen lists only documents explicitly shared with the portal user.

Core content:

- document display name;
- safe document type;
- shared date;
- shared by display name;
- safe description or instructions;
- version label if safe;
- download action only after a separate grant-scoped storage/download design.

Forbidden content:

- all internal documents;
- storage paths;
- SharePoint paths;
- local filesystem paths;
- raw extracted text;
- `documents.workspaceText`;
- internal filenames if unsafe;
- internal review status;
- review comments;
- AI/anonymization metadata.

No document preview may be derived from raw text in V1.

## Uploads / Requests screen

The uploads/requests screen shows active requests addressed to the portal user.

Core content:

- request title;
- client-facing description;
- due date;
- allowed file types;
- maximum file size;
- status;
- upload instructions;
- completed upload receipts or status, if later implemented.

Forbidden content:

- internal storage destination;
- SharePoint path;
- extraction/anonymization status;
- AI processing status;
- internal reviewer notes;
- backend job identifiers;
- arbitrary upload surfaces not backed by an active request.

Uploads must remain request-scoped; the client should not see a general-purpose document dump.

## Messages screen, deferred

Messages are deferred from V1 unless the communication visibility model is separately approved.

If later included:

- only explicitly client-visible threads/messages appear;
- each thread requires matter grant plus message visibility grant;
- replies require explicit reply permission;
- internal communications remain hidden;
- lawyer drafts remain hidden;
- privileged strategy remains hidden;
- raw provider metadata remains hidden.

## Profile / Contact screen, optional

The profile/contact screen may show:

- the portal user's display name and email;
- linked client display names;
- responsible law office contact information;
- safe support/contact instructions.

Editing contact info is deferred unless separately designed. Broad client master data, internal client identity fields, auth claims, tokens, and internal role information must not appear.

## Disabled / unavailable states

| State | Client-facing behavior | Privacy rule |
| --- | --- | --- |
| Portal globally disabled | Controlled unavailable message. | Do not mention internal flags, Prisma, routes, or stack traces. |
| No matters shared | `No matters are currently shared with you.` | Do not reveal whether internal matters exist. |
| Matter access revoked | Non-enumerating not-found/access-unavailable copy. | Do not reveal prior access, internal IDs, or matter existence. |
| Document share revoked | Non-enumerating document unavailable copy. | Do not reveal document existence or storage details. |
| Upload request expired | Request no longer available; contact law office if needed. | Do not expose internal storage or review status. |
| Session expired | Ask user to sign in again. | No resource details in the expired-session response. |
| Unauthorized / not found | Non-enumerating not-found/access-unavailable copy. | Avoid existence leaks. |
| Maintenance / feature unavailable | Calm unavailable state with contact option. | No stack traces, feature flag names, DB, route, or Azure details. |

## Visual hierarchy and tone

- Use plain language and a calm legal/professional tone.
- Put “what needs my attention” first.
- Make client-visible deadlines and requested actions visually prominent.
- Keep statuses understandable and client-facing.
- Mark documents clearly as shared, not merely present internally.
- Avoid internal jargon unless deliberately client-facing.
- Use styling primitives and visual language consistent with Adminiculum, but avoid reusing internal dashboard semantics that imply lawyer workflow, workload, strategy, or review state.

## Component inventory

| Component | Purpose | DTO dependency | Forbidden fields |
| --- | --- | --- | --- |
| `PortalShell` | Portal layout shell and safe navigation. | `PortalMeDto` | Internal app nav, admin routes, internal dashboard links. |
| `PortalTopNav` | Home/matters/documents/uploads/profile navigation. | `PortalMeDto` feature booleans | Internal routes, feature flags, role internals. |
| `PortalHomeAttentionPanel` | Highlight client actions. | `PortalTaskDto`, `PortalUploadRequestDto` | Internal priorities, workload, lawyer checklists. |
| `PortalMatterCard` | Granted matter summary. | `PortalMatterListItemDto` | Internal case DTO fields, collaborators, strategy. |
| `PortalStatusBadge` | Client-facing status display. | Published status field | Internal workflow status unless published. |
| `PortalClientActionCard` | Client-facing task/action. | `PortalTaskDto` | Internal task board fields. |
| `PortalDeadlineList` | Client-visible deadlines. | Published deadline fields | Internal deadlines/escalations. |
| `PortalSharedDocumentList` | Shared document metadata. | `PortalDocumentListItemDto` | Raw text, `workspaceText`, storage paths. |
| `PortalUploadRequestCard` | Upload request summary/action. | `PortalUploadRequestDto` | Storage destination, reviewer notes, AI/extraction state. |
| `PortalSafeUpdateTimeline` | Published client-visible updates. | `PortalMatterDetailDto` safe updates | Internal timeline, audit logs, notes, strategy. |
| `PortalResponsibleLawyerCard` | Display contact person. | Matter/contact display fields | User IDs, staffing/workload, collaborators. |
| `PortalEmptyState` | Honest empty states. | none or screen-specific | Internal object existence hints. |
| `PortalAccessRevokedState` | Non-enumerating revoked/unavailable state. | none | Prior access details, internal IDs. |
| `PortalDisabledState` | Feature disabled/unavailable state. | none | Flag names, Prisma errors, stack traces. |

## Route map

Conceptual frontend routes:

- `/portal`
- `/portal/matters`
- `/portal/matters/:matterId`
- `/portal/documents`
- `/portal/uploads`
- `/portal/messages` deferred
- `/portal/profile` optional

These routes are not implemented, not authorized, and no frontend files are changed by this design.

## Backend contract dependency

| Screen/component | Conceptual endpoint / DTO |
| --- | --- |
| Portal shell/profile | `GET /api/v1/client-portal/me` / `PortalMeDto` |
| Home attention panel | `PortalTaskDto`, `PortalUploadRequestDto`, safe matter/document summaries |
| Matters list | `GET /api/v1/client-portal/matters` / `PortalMatterListItemDto[]` |
| Matter detail | `GET /api/v1/client-portal/matters/:matterId` / `PortalMatterDetailDto` |
| Shared documents | `GET /api/v1/client-portal/matters/:matterId/documents` / `PortalDocumentListItemDto[]` |
| Document detail | `GET /api/v1/client-portal/documents/:documentId` / `PortalDocumentDetailDto` |
| Tasks/actions | `GET /api/v1/client-portal/tasks` / `PortalTaskDto[]` |
| Upload requests | `GET /api/v1/client-portal/uploads` / `PortalUploadRequestDto[]` |
| Messages | Deferred / `PortalMessageThreadDto` |

## Privacy checklist per screen

| Screen | Grant required | Forbidden fields | Required response posture |
| --- | --- | --- | --- |
| Home | Active portal user plus grants for each summarized item. | `workspaceText`, internal tasks, workload, collaborators, raw notes. | Empty lists are acceptable; no internal existence leaks. |
| Matters | Active matter view grant. | Internal status/deadlines/notes/strategy. | Only granted matters listed. |
| Matter detail | Active matter view grant. | Internal timeline, legal analysis, raw text, AI outputs. | Safe published fields only. |
| Documents | Matter grant plus document share grant. | Raw document text, storage paths, `workspaceText`. | Only explicitly shared documents. |
| Uploads | Matter grant plus upload request grant. | Storage destination, reviewer notes, AI/extraction state. | Request-scoped only. |
| Messages | Deferred message/thread grants. | Internal communications, drafts, privileged notes. | Hidden until separately approved. |
| Profile/contact | Active portal user. | Tokens, auth claims, internal roles, broad master data. | Minimal identity and contact display. |

Every screen must use external allow-list DTOs, content-free errors, and non-enumerating denial states.

## V1 deferrals

- messages;
- contact editing;
- document preview;
- document download implementation;
- upload implementation;
- notifications/email;
- multi-organization switching;
- e-signature;
- AI summaries;
- SharePoint sync;
- payments/billing;
- public links;
- client-visible time logs;
- client-visible exports.

## Future frontend implementation requirements

A later implementation package should:

- build a static shell first;
- use mock/synthetic UI-only data only if no backend contract is available, with clear non-production labeling;
- avoid real API enablement until backend contract, authz, schema readiness, and feature gates are approved;
- never expose `documents.workspaceText`;
- place portal routes behind explicit feature-gated behavior;
- use explicit TypeScript DTO typings from the portal contract;
- add tests for forbidden fields where practical;
- avoid reusing internal `Dashboard`, `CaseDetail`, task, document, or communication components if they contain internal data assumptions;
- allow visual primitive reuse only for styling, spacing, typography, badges, empty states, and shell patterns that do not imply internal workflow.

## Recommended next package

`CLIENT-PORTAL-SCHEMA-READINESS-DESIGN-1`

The product boundary, current code inventory, data contract, authorization model, and UI/IA are now designed. The next design should map required schema support without creating migrations or authorizing CP-SCHEMA-1.

## Follow-up — CLIENT-PORTAL-SCHEMA-READINESS-DESIGN-1

- `CLIENT-PORTAL-SCHEMA-READINESS-DESIGN-1` created
  `docs/client-portal-schema-readiness-design.md`.
- The schema readiness design maps portal screens and DTOs to future portal identity,
  grant, publication, upload, submission, and audit schema families.
- This UI/IA design remains documentation-only. No frontend, runtime, schema, migration,
  DB, Azure, OpenAPI/CORS, or Client Portal enablement is authorized.

## Follow-up — CLIENT-PORTAL-FRONTEND-SHELL-DESIGN-1

- `CLIENT-PORTAL-FRONTEND-SHELL-DESIGN-1` created
  `docs/client-portal-frontend-shell-design.md`.
- The frontend shell design turns this UI/IA into a future route, layout, component,
  visual reuse, disabled-state, API-client, privacy, and test plan.
- This UI/IA design remains documentation-only. No frontend implementation, runtime,
  schema, migration, DB, Azure, OpenAPI/CORS, auth, or Client Portal enablement is
  authorized.

## Final decision statement

This design does not implement the portal UI. Client Portal remains quarantined. CP-SCHEMA-1 remains blocked. Production apply remains NO-GO. External visibility remains unauthorized. The runtime skeleton remains disabled. No schema migration is authorized.

## Non-actions

- No runtime changed.
- No schema changed.
- No migration was created.
- No DB connection was used.
- No DB apply was performed.
- No business data was read.
- No Azure deployment or app setting was changed.
- No route behavior changed.
- No OpenAPI or CORS behavior changed.
- No frontend changed.
- No tests changed.
- No Client Portal was enabled.
- No Document/AI flag was enabled.
- No AI/provider call was made.
- No file processing was run.
- No SharePoint/Graph call was made.
- No export or generation job was run.

## Final classification

`client_portal_v1_ui_ia_designed_no_db_change_no_runtime_change`
