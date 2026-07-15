# Document Editor Review, Comments and Quality Hardening 1

## Purpose

Harden the professional editor as a daily review workbench while preserving Mode C: export-only browser session, no server save, no autosave, no hidden browser persistence, and no reviewer access claim for unsaved content.

## Repository findings

- The professional editor already runs at `/documents/[documentId]/edit` with Tiptap structure, outline, fields, search, local DOCX import/export, HTML/TXT/print export, task-backed review, and compare deep links.
- `Comment.documentId` exists, but no safe document-comment route/service/DTO/authorization contract exists.
- The backend editor metadata contract explicitly returns `canComment=false`, `comments=false`, and `anchoredComments=false`.
- Existing review flow is task-backed and capability-driven. It is not a second review state machine.

## Selected comments branch

Follow-up `DOCUMENT-COMMENTS-BACKEND-AND-EDITOR-1` upgraded this decision to **Branch A — document-level comments** using the existing `Comment.documentId` relation.

Mutation support: create, resolve, and reopen. Delete and anchored comments remain unavailable.

Anchored comments: false.

Remaining blocker: retention/delete policy and a real anchored-range model.

## Document comments contract

The professional editor shows real document-level comments through explicit backend DTOs. It does not simulate comments in memory and does not store selected text, anchors, comment text, or editor content in another field.

## Review-state contract

The implemented normalized truth is:

- `persistenceMode`: `EXPORT_ONLY`
- `serverSaved`: `false`
- `reviewerCanAccessCurrentSession`: `false`
- task actions and capabilities come from existing work-item/task APIs.

## Mode C review safety

Dirty review task creation/submission now requires an explicit confirmation:

> A jelenlegi szerkesztési munkamenet nincs az Adminiculum szerverére mentve. A review-feladat a dokumentum rekordjához kapcsolódik, nem ehhez a helyi szerkesztési állapothoz.

The export action and review action remain separate. No upload, export, save, or dirty-state clearing is triggered by review actions.

## Compare integration

Compare wording now uses **Mentett források összehasonlítása**. It does not claim live track changes or current-browser-session comparison.

## Editor commands

Toolbar commands keep disabled states and bounded notices. Clause operations remain atomic through the existing pure transforms and `applyClauseOperation`.

## Keyboard accessibility

The side panel now documents the supported shortcut map: bold, italic, underline, undo, redo, editor search, search navigation, and Escape close behavior.

## Outline and search

Outline navigation still moves editor selection. Search highlights are plugin state only and are not exported or persisted.

## Large-document performance

The side panel documents editor and DOCX limits. The workbench warns near the text limit and keeps import replacement behind confirmation.

## Error recovery

Metadata, template capability, review, DOCX import, and export failures use bounded messages. Recoverable failures do not reload the page or replace content.

## Common laptop layout

The existing collapsible/focus-mode design remains: outline and side panel are hidden on smaller breakpoints, focus mode removes chrome, and the canvas scrolls inside the workbench.

## Dependency vulnerability follow-up

`npm audit --json` still reports four moderate advisories: `next` via nested `postcss`, nested `postcss`, dev-tool `brace-expansion`, and dev-tool `js-yaml`. No `npm audit fix --force` or unsafe downgrade/major upgrade was run.

## Privacy and audit

No audit/notification/activity content writes were added. Comment text, document text, editor JSON, selected text, DOCX XML, storage paths, prompts, and review notes remain out of generic audit and notifications.

## AI and n8n compliance

No AI provider, SDK, generated review, redline, n8n workflow, direct DB automation, or editor-state automation was added.

## Unsupported or deferred functionality

- document-level comments;
- anchored comments;
- server editor save/autosave/restore/versioning;
- live track changes;
- reviewer visibility into unsaved browser content;
- automatic upload/export on review.

## Validation

Run record belongs in the final task report. Required commands: backend Prisma validate, backend typecheck/tests, frontend typecheck/build, `npm audit --json`, `verify:prod-env`, and git whitespace checks.

## Remaining editor work

The next safe implementation prompt is a dedicated document-comment backend contract only after authorization, DTO, audit minimization, and route tests are approved.

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
