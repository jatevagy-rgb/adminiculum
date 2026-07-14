# Document Editor Pro — Content Contract

Package: DOCUMENT-EDITOR-PRO-CONTRACT-WORKBENCH-1

## Where the contract lives

Persistence mode C means there is **no backend editor-content endpoint**: the
content contract is the strict client-side model in
`Frontend/src/lib/editor/`, shared verbatim by the Tiptap layer, the outline,
both exporters and the Node-side unit tests.

- `editorModel.ts` — node/mark allow-lists, attribute vocabulary, hard limits.
- `editorSchemaValidator.ts` — `validateEditorDocument(json)` strict
  validation (run after paste-parse and before every export/print).

## Conceptual DTO (implemented client-side)

```ts
persistence: {
  mode: "EXPORT_ONLY";        // the only truthful mode in this environment
  serverSaved: false;         // always
}
capabilities: {
  canEdit: true,              // session editing
  canSave: false,             // no enabled persistence route
  canSaveNewVersion: false,
  canSubmitForReview: true,   // via document-source review task (server-authorized)
  canApprove: server-derived, // work-item capabilities
  canReturnForCorrection: server-derived,
  canCompare: true,           // /documents/compare deep link
  canExportDocx: false,       // no converter
  canExportPdf: true,         // browser print, labeled
  canPrint: true,
  canComment: false,          // Comment model has no routes
}
```

## Allowed vocabulary

Nodes: `doc, paragraph, heading(level 1–3), text, hardBreak, bulletList,
orderedList(start, listStyle ∈ decimal|lower-alpha|lower-roman), listItem,
blockquote, horizontalRule, table, tableRow, tableCell(colspan,rowspan,colwidth),
tableHeader(...), legalClause(cid), clauseHeading, pageBreak, fieldToken(fieldId)`.

Marks: `bold, italic, underline, strike, link(href http/https/mailto,
target _blank only)`.

## Limits

| Limit | Value |
| --- | --- |
| max nesting depth | 24 |
| max nodes | 20 000 |
| max total text | 400 000 chars |
| max serialized size | 2 000 000 bytes |
| max table size | 60 rows × 12 columns |
| max clause depth | 3 |
| clause id pattern | `^c[A-Za-z0-9_-]{3,40}$` |

## Rejections

Unknown node/mark/attr/property keys; nested `doc`; structurally illegal
placement (child rules per node); marks on non-text nodes; atoms with content;
non-text nodes carrying `text`; `javascript:`/`data:`/`vbscript:` links; field
tokens outside the allow-list; clause depth/table/count/size overruns.
Error output is bounded (≤ ~26 entries); rejected content is never logged.

## Error behavior

Client-side validation failures surface as an in-editor notice and block the
export; there is no server round-trip in Mode C, so HTTP 400/409 semantics are
documented for the future persistence mode, not implemented.

## Content boundaries

Full draft content never appears in document lists, Case Activity, Dashboard,
notifications, audit events, task DTOs, Case Center, work items, logs or error
messages — in Mode C it never leaves the browser at all.
