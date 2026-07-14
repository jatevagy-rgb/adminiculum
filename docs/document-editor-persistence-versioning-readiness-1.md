# Document Editor Persistence and Versioning Readiness 1

## Purpose

Prepare the professional document editor for future persistence and versioning without pretending that server-side saving exists today.

## Repository findings

- The editor route `/documents/[documentId]/edit` is a Tiptap workbench in explicit export-only mode.
- `Document` metadata contains SharePoint identifiers, `version`, `currentVersion`, and `workspaceText`, but none are approved editor-source storage.
- `DocumentVersion` tracks metadata and SharePoint labels, not validated Tiptap source content.
- `Comment` is generic free text and is not a safe hidden editor-content store.
- SharePoint upload/version helpers do not prove editor JSON load/save/version-content retrieval/restore/concurrency.

## Selected persistence mode

Selected mode: **Mode C — export-only working session**.

Review hardening follow-up: dirty review task creation/submission must display the Mode C warning and must not upload, export, save, attach current browser content, or mark the session clean.

Document comments follow-up: comments are document metadata and do not persist editor source content, current browser text, selected text, or Tiptap JSON.

## Hard-gate evaluation

Mode A failed because there is no dedicated editor-content persistence model or service. Mode B failed because backend-controlled full-content load/save, exact `TIPTAP_JSON` association, version-content retrieval, restore, retention, deletion/archive, and stale-write token semantics are not proven.

## Canonical stored-content format

Future persisted source format is `TIPTAP_JSON` using `StoredEditorContentEnvelope` from the stored-content contract. HTML remains export-only.

## Server-side validation

`Backend/src/modules/documentEditor/contentSchema.ts` adds a pure strict validator for future `TIPTAP_JSON` envelopes. It rejects unknown nodes/marks/attrs, unsafe links, base64 payloads, prototype keys, duplicate clause ids, malformed tables, oversize payloads, and excessive depth.

## Editor metadata and capability contract

`GET /api/v1/documents/:id/editor` returns scalar metadata and capabilities only. It authenticates first, authorizes by owning case, returns Mode C capabilities, and excludes SharePoint identifiers, paths, `workspaceText`, raw Prisma rows, and content.

## Content load and save

No content load route exists. No save route exists. No working save button was added.

## Versioning

No real editor-content version list/open/restore exists. Version capability flags are false.

## Concurrency

No persistence token exists. The metadata endpoint returns `versionToken: null`. Future implementation must use a genuine ETag, checksum, storage version, or stable content-version identity.

## Autosave

Autosave remains unavailable. `availability.autosave` is false.

## Comments

Document-level comments are not implemented for the professional editor. Generic `Comment.content` is not used as hidden editor storage or anchored comments.

## Review and compare integration

The task-backed review flow remains intact. In Mode C, review tasks refer to document metadata/source context, not the current unsaved editor session. Compare links remain metadata/version-context only and are not Word track changes.

## Audit and logging

No editor content is accepted by the new endpoint. Future content routes must emit content-minimal audit only after successful durable persistence and must never log rejected content.

## Retention, archive and recovery

Retention, archive, physical deletion, backup, and recovery behavior for stored editor source remain unresolved human decisions.

## Feature flags

No persistence feature flag was added because no persistence implementation was added. Future persistence should be separately gated, default off.

## Frontend integration

The editor now reads `/documents/:id/editor` for metadata/capability truth. The header still displays `Munkamenet — nincs szerverre mentve` / `Nem mentett munkamenet — nincs szerverre mentve` and does not show fake save/version controls.

## Privacy and authorization

The metadata endpoint uses explicit scalar selection, document/case authorization, and no storage paths. No Client Portal, OpenAPI/CORS, Azure, schema, migration, AI, n8n, SharePoint/Graph, or deployment change occurred.

## AI and n8n compliance

No AI API, AI drafting, AI review, n8n workflow ownership, or n8n DB/storage access was introduced.

## Unsupported or deferred functionality

Server save, autosave, real editor versions, restore, document-level comments, DOCX import/export, live track changes, and automatic merge/conflict resolution remain unsupported.

## Validation

Targeted validator/metadata/static tests were added. Full validation is recorded in the final task report.

## Remaining persistence work

Approve storage model, retention/deletion/archive policy, content-version identity, concurrency token, audit model, and migration strategy before implementing real persistence.

## DOCUMENT-EDITOR-DOCX-INTEROPERABILITY-TEMPLATE-BRIDGE-1 update

The professional editor now supports **local browser-only DOCX import/export for a conservative supported subset**. This is not server persistence: no save, no autosave, no server version, no restore, no `workspaceText`, no external conversion service, no AI, and no n8n. Unsupported Word features are warned or rejected; the exported DOCX is a newly generated file, not Word-perfect round-trip fidelity.

## Template Assembly Mode C Confirmation

The template assembly package preserves Mode C. Generated-template workflows do not create server editor content, autosave, versions, restore points, comments, or `workspaceText` persistence. Review tasks remain linked to stored document metadata, not the unsaved editor session.
