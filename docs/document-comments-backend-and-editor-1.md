# Document Comments Backend and Editor 1

## Purpose

Add real document-level comments to the professional editor without enabling editor-content persistence, anchored comments, fake highlights, review automation, or content leakage.

## Repository findings

- `Comment` has `documentId`, `caseId`, `userId`, `content`, `isResolved`, `createdAt`, and `updatedAt`.
- Existing case authorization supports read and manage checks.
- No existing safe delete/retention policy exists for comments.
- Editor Mode C remains export-only and does not save current browser content.

## Selected branch

Selected branch: **Branch A — full document-level comments without delete**.

## Comment model

The implementation uses the existing `Comment` model only. No schema change, migration, DB query, or production deployment was performed.

## API contract

- `GET /api/v1/documents/:id/comments`
- `POST /api/v1/documents/:id/comments`
- `POST /api/v1/documents/:id/comments/:commentId/resolve`
- `POST /api/v1/documents/:id/comments/:commentId/reopen`

No delete route is exposed.

## Authorization and capabilities

Document access is checked through the owning case. Any authenticated user with document read access may list/create comments. Resolve/reopen is allowed to the author or a case manager/privileged case actor. Capabilities are backend-derived.

## Comment transitions

Open comments can be resolved. Resolved comments can be reopened. Repeated resolve/reopen returns `409`.

## Content safety

Comments are bounded plain text only. The route rejects client actor ids, arbitrary status, document/case ids, selected text, editor JSON, anchors, HTML, embedded base64 data, excessive length, and control characters.

## Editor panel

The professional editor side panel now includes “Dokumentumszintű megjegyzések” with create, resolve, reopen, loading, error, retry, empty state, character counter, and Ctrl/Cmd+Enter submit. Comment actions do not modify editor dirty state.

## Review integration

Comments and review tasks remain separate. Comments do not create tasks, submit review, approve/return review, alter deadlines, or attach unsaved editor content.

## Case Activity and notifications

No Case Activity, audit, notification, task title/description, or external message is created from comment content in this pass.

## Retention and deletion

Delete remains unsupported (`canDelete=false`) until a retention/delete policy is approved. Resolve/reopen preserves the comment row.

## Mode C compliance

No server editor-content save, no autosave, no restore, no `workspaceText`, no localStorage/sessionStorage comment cache, and no reviewer access claim for unsaved content.

## Privacy and security

DTO mapping is explicit; no raw Prisma rows, broad includes, private user fields, storage paths, document text, editor JSON, selected text, or audit metadata are returned.

## AI and n8n compliance

No AI provider, AI comment generation, AI review, AI redlining, n8n persistence, n8n state ownership, or direct database automation was added.

## Unsupported or deferred functionality

Anchored comments, text highlights, selection ranges, comment editing, delete/soft-delete, resolvedAt/resolvedBy, notifications, activity entries, external e-mail/Teams messages, and review automation remain deferred.

## Validation

See final task report for exact command results.

## Remaining comment work

Approve retention/delete policy and anchored-range schema before delete or inline comments can be considered.

## DOCUMENT-EDITOR-WORKBENCH-UX-LAYOUT-OVERHAUL-1 update

The editor became a viewport-bound workbench: the editor route now uses the
`fullViewport` application-shell mode (h-dvh, non-scrolling `<main>`), so the
header, formatting toolbar and status bar stay visible while only the document
viewport scrolls; the outline and side panel scroll independently and are
collapsible with responsive defaults. DOCX import/export moved into the header
"Export / Import" menu (also available on the side panel Export tab), the
template-readiness banner moved into the side panel "Sablon" tab, and zoom
moved to the status bar. All persistence semantics are unchanged: Mode C,
"Munkamenet — nincs szerverre mentve", no autosave, no browser storage, no
anchored comments, no track changes. See
`docs/document-editor-workbench-ux-layout-overhaul-1.md` and
`docs/document-editor-workbench-layout-contract.md`.
