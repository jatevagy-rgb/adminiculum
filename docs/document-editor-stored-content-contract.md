# Document Editor Stored Content Contract

## Status

Review-ready contract only. No runtime persistence route stores this payload today.

## Canonical format

`TIPTAP_JSON` is the only proposed editable source format. HTML, TXT, print, and PDF are exports, not canonical source.

```ts
type StoredEditorContentEnvelope = {
  schemaVersion: 1;
  documentId: string;
  format: "TIPTAP_JSON";
  content: TiptapDocumentDto;
  metadata: {
    createdAt: string;
    createdByUserId: string;
    editorVersion: string;
  };
};
```

## Excluded fields

Do not include case/client snapshots, access-role snapshots, review comments, storage paths, SharePoint ids, audit details, notification payloads, AI fields, secrets, arbitrary JSON, or resolved private field values.

## Field tokens

Field tokens remain structured tokens until a user explicitly converts resolved tokens to static text in the editor. Dynamic resolved values should not be persisted unnecessarily.

## DOCUMENT-EDITOR-DOCX-INTEROPERABILITY-TEMPLATE-BRIDGE-1 update

The professional editor now supports **local browser-only DOCX import/export for a conservative supported subset**. This is not server persistence: no save, no autosave, no server version, no restore, no `workspaceText`, no external conversion service, no AI, and no n8n. Unsupported Word features are warned or rejected; the exported DOCX is a newly generated file, not Word-perfect round-trip fidelity.
