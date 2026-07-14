# Document Editor Persistence Acceptance

## Accepted now

- Mode C warning remains visible.
- No save/autosave/version/restore/comment controls are presented as available.
- Backend metadata endpoint reports `EXPORT_ONLY` and false persistence capabilities.
- Backend validator exists for future `TIPTAP_JSON` payloads.
- Static guards prevent workspaceText, browser storage, fake autosave, fake versions, AI, n8n, and direct frontend SharePoint/Graph coupling in the editor surface.

## Not accepted yet

- Server content load/save.
- Real content versions.
- Restore.
- Concurrency conflict handling.
- Document-level/anchored comments.
- DOCX import/export.
- Live track changes.

## Production apply note

No deployment is authorized by this document. No schema or migration changed.
