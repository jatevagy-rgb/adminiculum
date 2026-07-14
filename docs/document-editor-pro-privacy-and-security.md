# Document Editor Pro — Privacy and Security

Package: DOCUMENT-EDITOR-PRO-CONTRACT-WORKBENCH-1

## Content privacy boundaries

The editor is one of the few authorized places where full draft content may be
processed — in persistence mode C it is processed **only in the browser** and
never transmitted. Full editor content never enters:

server request logs · audit event payloads · notification titles/messages ·
Case Activity summaries · task titles/descriptions · document list DTOs ·
Case Center · Dashboard · analytics · error telemetry · Client Portal ·
AI services · n8n.

The only network calls made by editor code are ungated metadata reads and the
existing task-review actions through the shared API client:
`GET /documents/:id`, `GET /cases/:id/summary`,
`GET /cases/:id/workflow-summary`, `GET /cases/:id/work-items`,
`POST /documents/:id/tasks`, `POST /tasks/:id/(start|submit|complete)`.
None of them carries document content.

## Access control

- The route requires authentication (`AuthenticatedApp`); document metadata
  and every review action are authorized server-side by the existing
  case/document authorization (401/403/404 semantics unchanged).
- An inaccessible or missing document renders a safe error panel without
  disclosing case existence.
- No client-provided author/user id; no role derived from e-mail; no direct
  browser-to-SharePoint credentials (static-guarded: no `graph.microsoft.com`
  / `sharepoint.com` in editor code).

## Input safety (three layers)

1. **String sanitizer** on external paste: scripts, styles, Office XML,
   conditional comments, event handlers, `javascript:`/`data:`/`vbscript:`
   URLs, iframes/objects/embeds/forms/images stripped.
2. **Tiptap schema parse**: only allow-listed nodes/marks can exist at all
   (code/codeBlock disabled; link protocols restricted).
3. **Strict JSON validator** before every export/print: unknown anything,
   depth/size/table limits, link protocols, token/clause id patterns —
   bounded error output, rejected content never logged.

No `dangerouslySetInnerHTML` anywhere in the editor surface (static-guarded).

## Static guards (`Backend/tests/documentEditorProStaticGuards.test.ts`)

- no AI SDK/provider and no external conversion SaaS imports;
- no n8n, Client Portal, or realtime-collaboration coupling;
- no `workspaceText`, no gated content routes
  (`getDocumentText`, `saveWorkspaceDocumentVersion`);
- no localStorage/sessionStorage/IndexedDB persistence;
- honest session status present; no autosave/track-changes vocabulary;
- no raw `fetch`/XHR from editor code (shared API client only);
- bounded content limits present in the model and validator;
- no editor content in unrelated persistence fields
  (`templateData`, `SystemSetting`, descriptions);
- `/editor-lab` stays a redirect (no second drafting editor);
- backend gained **no** editor-content module (mode C stays honest).

## Audit posture

Mode C writes nothing, so no new audit events exist. Review-task actions keep
their existing content-minimized timeline behavior. When a persistence mode is
approved, audit may record edited/saved/version/review/export events —
**never document text or diffs**.
