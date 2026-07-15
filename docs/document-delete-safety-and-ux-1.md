# Document Delete Safety and UX 1

Date: 2026-07-15
Release worktree: `C:\Users\hubay\Documents\Adminiculum-release-editor-ops`
Release branch: `release/editor-ops-workflow-1`
Deployment action: none

## User-observed gap

A user could upload a document to an ügy, but there was no usable way to remove a mistakenly or unnecessarily uploaded document afterward. This was treated as a narrow pre-deployment blocker for the editor/ops workflow release.

## Existing document storage model

- Uploaded `Document` records are metadata rows in PostgreSQL and, when upload succeeds normally, binary files are stored in SharePoint through the existing `driveService.uploadDocument` adapter.
- The `Document` model has SharePoint metadata fields such as `spItemId`, `spPath`, `spWebUrl`/response mapping, folder, type, version and case/client linkage.
- The current schema has no supported `deletedAt`, `isDeleted`, trash, tombstone, or archive field for documents.
- Uploaded `Document` records do not store local filesystem paths for normal document upload deletion. Local filesystem storage is not used as the uploaded document ownership source in this workflow.
- `workspaceText` may exist on the model, but the delete path deliberately does not select or expose it.

## Authorization rule

Deletion uses the existing document manage authorization path:

- `DELETE /api/v1/documents/:id` authenticates first.
- The route resolves the document's owning case from the database using the route document ID.
- `requireDocumentManageAccess` authorizes using the existing case manage rule.
- ADMIN/PARTNER and the responsible/owning lawyer paths are allowed by the existing case authorization convention.
- Ordinary users/collaborators without manage access are rejected before deletion.
- The frontend only shows the action in active internal case work surfaces, but backend authorization remains authoritative.

## Dependency handling

The hard-delete service blocks deletion with `409 DOCUMENT_DELETE_CONFLICT` when dependent records make deletion unsafe:

| Relation / surface | Handling |
| --- | --- |
| `AnonymousDocument.sourceDocId` | Block with `ANONYMIZED_DOCUMENT_EXISTS` because the Prisma relation is restrictive and rehydration provenance would break. |
| `Task.documentId` | Block with `TASK_REFERENCE_EXISTS`; tasks are not broadly deleted or silently detached. |
| `LegalAnalysis.documentId` with source `DOCUMENT` | Block with `LEGAL_ANALYSIS_REFERENCE_EXISTS`; legal analysis provenance stays intact. |
| Pending `DocumentReviewSuggestion` | Block with `PENDING_REVIEW_SUGGESTION_EXISTS`; open review work must be resolved first. |
| `Communication.documentId` | Detach by setting `documentId` to null in the DB transaction; communication rows are preserved. |
| `CommunicationAttachment.documentId` | Detach by setting `documentId` to null in the DB transaction; attachment metadata rows are preserved. |
| `Comment.documentId` | Existing FK is `onDelete: SetNull`; comments are not copied into the audit payload. |
| `TimelineEvent.documentId` | Existing FK is `onDelete: SetNull`; a safe deletion event is created before delete and FK nulling preserves the event. |
| Document versions / accepted review suggestions | Existing Prisma relations cascade where defined; no raw content is copied into response or audit. |

## Database and storage deletion order

The selected strategy is Branch B: safe physical deletion where supported.

1. Resolve the document from the database with an explicit scalar projection.
2. Count prohibited dependencies without broad relation includes.
3. If dependencies exist, return deterministic `409 DOCUMENT_DELETE_CONFLICT` with a safe reason code.
4. If `spItemId` exists, call the existing SharePoint deletion adapter with only the server-resolved SharePoint item ID.
5. If SharePoint deletion fails, return `502 DOCUMENT_STORAGE_DELETE_FAILED` and do not mutate the database.
6. If storage is absent/stale metadata-only, skip remote deletion and remove metadata if dependencies are clean.
7. Run DB cleanup in a transaction: detach communication links, create a content-minimal audit event, then delete the document row.

This avoids claiming success when required storage cleanup failed. It also avoids deleting arbitrary paths, URLs, or client-supplied storage identifiers.

## API contract

New backend route:

`DELETE /api/v1/documents/:id`

Success:

- `204 No Content`

Safe errors:

- `401` unauthenticated via existing auth middleware.
- `403 DOCUMENT_ACCESS_FORBIDDEN` when authenticated but lacking manage access.
- `404 DOCUMENT_NOT_FOUND` for missing/inaccessible document resolution.
- `409 DOCUMENT_DELETE_CONFLICT` with `reason` for prohibited dependencies.
- `502 DOCUMENT_STORAGE_DELETE_FAILED` when SharePoint deletion fails before DB mutation.
- `500 DOCUMENT_DELETE_FAILED` for unexpected internal failures without raw details.

Responses do not expose storage paths, raw Prisma errors, document body, `workspaceText`, attachment bytes, or extracted text.

## Frontend confirmation UX

`CaseDetail` now includes document deletion in the existing document surfaces:

- selected document action area;
- ügyfél dokumentumai list rows.

UX behavior:

- destructive Hungarian label: `Dokumentum törlése` / `Törlés`;
- explicit confirmation dialog with `Végleges törlés` and `Mégse`;
- duplicate submit is blocked while deletion is running;
- success feedback appears after the row list is refreshed;
- 403/409/502/general errors get safe Hungarian copy;
- no fake undo or reversible claim is shown;
- no editor delete action was added.

## Audit and privacy

Deletion creates a `TimelineEvent` using existing audit/event infrastructure and content-minimal payload:

- action type;
- document ID;
- case ID;
- actor ID;
- safe document type/category/folder;
- SharePoint item presence boolean.

It intentionally excludes:

- filename;
- storage paths / URLs;
- raw document text;
- `workspaceText`;
- comments;
- extracted text;
- attachment bytes;
- external tokens.

Because the `TimelineEvent.documentId` FK uses `onDelete: SetNull`, the event can remain after hard deletion while its payload preserves a safe ID reference for audit context.

## Browser verification

Authenticated local browser verification passed with a disposable synthetic metadata-only local document.

Smoke result:

- case used: `46a0ff22-49e1-4296-b0f2-bf6a28b506b0`;
- synthetic document ID: `0491d5d3-ad92-4bd6-a8fe-a58aaa59418b`;
- delete request: `DELETE http://localhost:3001/api/v1/documents/0491d5d3-ad92-4bd6-a8fe-a58aaa59418b`;
- delete response: `204`;
- direct former document detail: `404`;
- direct former document editor metadata: `404`;
- direct former document comments: `404`;
- forbidden network leaks: `0`;
- known non-blocking local contracts `501` console noise was observed because contract generation is unavailable in the local smoke environment.

Verified flow:

1. synthetic local document appeared in `/cases/{caseId}/documents`;
2. `Dokumentum törlése` opened the confirmation dialog;
3. `Mégse` cancelled deletion and the row remained visible;
4. second confirmation with `Végleges törlés` deleted the row;
5. success feedback appeared;
6. row stayed absent after refresh;
7. former direct document/editor/comment API access returned safe missing behavior.

Screenshots were captured under:

`C:\Users\hubay\AppData\Local\Temp\adminiculum-doc-delete-browser-1784127543425`

Screenshots remain uncommitted.

## Regression tests

Added focused backend tests:

- route auth rejects unauthenticated deletion before DB access;
- missing/inaccessible document returns safe 404 before service calls;
- unauthorized authenticated user is rejected;
- ADMIN and assigned lawyer paths can reach deletion;
- success returns `204 No Content`;
- dependency conflicts return safe `409 DOCUMENT_DELETE_CONFLICT` reason codes;
- SharePoint failure returns `502` and does not falsely succeed;
- service test proves dependency preflight, server-resolved `spItemId`, storage-before-DB order, communication detach, audit creation, and document delete;
- static guards ensure no `workspaceText`, storage path, broad include, local/session storage, or raw content behavior is introduced.

## Release impact

- Runtime change: yes, narrow backend document delete endpoint and frontend delete UX.
- Schema change: no.
- Migration change: no.
- Database migration/apply: no.
- Azure/deploy/config change: no.
- Client Portal/OpenAPI/CORS expansion: no.
- Feature flags changed: no.
- AI/n8n/Outlook/Graph enablement: no.
- Package files changed: no.

## Validation

Completed:

- `git diff --check` passed with Windows LF/CRLF warnings only.
- `cd Backend && npx.cmd prisma validate` passed with process-scoped placeholder `DATABASE_URL`.
- `cd Backend && npx.cmd tsc --noEmit` passed.
- `cd Backend && npm.cmd test -- documentDelete.route.test.ts documentDelete.service.test.ts documentDeleteStaticSafety.test.ts --runInBand` passed, 3 suites / 13 tests.
- `cd Backend && npm.cmd test -- --runInBand` passed, 41 suites / 413 tests.
- `cd Backend && npm.cmd run build` passed.
- `cd Backend && npm.cmd audit --json` completed with pre-existing findings: 2 low / 9 moderate / 7 high / 1 critical.
- `cd Frontend && npx.cmd tsc --noEmit` passed.
- `cd Frontend && npm.cmd run build` passed with known existing `<img>` and workspace-root warnings.
- `cd Frontend && npm.cmd run verify:prod-env` passed.
- `cd Frontend && npm.cmd audit --json` completed with pre-existing findings: 4 moderate.
- Authenticated local browser delete smoke passed with synthetic data.

## Release recommendation

`GO_FOR_EXPLICIT_PRODUCTION_DEPLOYMENT_APPROVAL`

This document does not authorize deployment. It records that document deletion safety and UX has passed local validation and is ready for explicit deployment approval as part of the narrow release branch.
