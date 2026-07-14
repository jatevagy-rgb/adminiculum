# Document Editor Pro — Persistence and Versioning

Package: DOCUMENT-EDITOR-PRO-CONTRACT-WORKBENCH-1

## Selected mode: C — explicit export-only working session

A Save button must either persist successfully or remain unavailable — it
must never merely update local state while claiming a server save. In this
environment no save can succeed, so:

- **No "Mentés" / "Új verzió" actions are rendered.** The unavailable-features
  panel explains why.
- **Status is always visible**: "Munkamenet — nincs szerverre mentve" (amber
  variant while unsaved changes exist).
- **Unload protection**: `beforeunload` warns while dirty; the in-app back
  action asks for confirmation and states that content is not saved on the
  server.
- **No hidden copies**: no localStorage, no sessionStorage, no IndexedDB
  (static-guarded).
- **No autosave** of any kind is claimed or implemented.
- **Exports are the preservation path**: browser print/PDF (labeled as
  browser-generated), sanitized standalone HTML, TXT with generated numbering.

## Why the other modes were rejected

| Mode | Verdict | Reason |
| --- | --- | --- |
| A — dedicated editor persistence | unavailable | no editor-content model/service exists; creating one needs a schema change (forbidden here) |
| B — file-backed version | unavailable | all content routes are 501-gated behind `ENABLE_DOCUMENT_PROCESSING` + `ENABLE_DOCUMENT_AI_PRIVACY_MODEL` (off in the production posture) and write to the forbidden `documents.workspaceText` |

## Versioning

`Document.currentVersion`/`version` are displayed as **metadata only**. No
content versions are created (metadata-only "versions" without saved content
are explicitly not created). Version comparison uses the existing
`/documents/compare` workflow.

## Concurrency

Not applicable in Mode C (nothing is written). For the future persistence
mode, the documented plan is: reuse an existing version token/updated
timestamp, return 409 on stale save, never overwrite silently, offer
reload/compare, and preserve unsaved local content until the user decides.
No optimistic-lock database fields were invented.

## Future decision required (product + schema)

Real save/autosave/versioning requires either an approved dedicated
editor-content model or an approved enablement of the gated file pipeline
(storage, retention, permission and audit model included). Until then the
editor stays honestly session-only.
