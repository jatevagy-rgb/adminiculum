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
