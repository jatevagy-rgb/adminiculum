# Document Editor Pro — Template and Variable Safety

Package: DOCUMENT-EDITOR-PRO-CONTRACT-WORKBENCH-1

## Field tokens (editor variables)

The editor's variables are an **explicit allow-list** in
`Frontend/src/lib/editor/fieldTokens.ts`:

| Field id | Source | Auto-resolves from |
| --- | --- | --- |
| `case.displayName` | Ügy | case workflow summary |
| `case.reference` | Ügy | case number |
| `client.displayName` | Ügyfél | case summary client name |
| `client.role` | Ügy | `cases.clientRole` |
| `lawyer.displayName` | Ügy | responsible lawyer display name |
| `document.title` | Dokumentum | document file name |
| `date.today` | Rendszer | current date |
| `party.name`, `party.seat`, `party.representative`, `amount.value`, `date.custom` | Kézi | never (manual placeholders) |

Rules enforced (validator + unit tests):

- unknown field ids are **rejected by the schema validator** — a token outside
  the list cannot exist in a valid document;
- resolution reads a minimal, explicitly assembled context — never a raw
  case/client object; no object-traversal or expression syntax exists;
- no sensitive identifiers (tax number, registration number, address, notes,
  e-mail, phone) are insertable by default — asserted by tests;
- unresolved tokens render as visible `{{ … }}` chips and are counted in the
  side panel; exports keep them visibly marked;
- conversion to static text is an explicit, confirmed user action, converts
  only resolved tokens, and **never writes back** to case/client data.

## ContractTemplate / ContractGeneration boundary

`ContractTemplate.variables` and `ContractGeneration.templateData` are broad
JSON fields used by the existing docxtemplater generation flow. This package
treats them cautiously:

- the editor does **not** read or expand them;
- template generation remains a separate flow producing DOCX files;
- generated DOCX files are **not** presented as directly editable content —
  converting a template into editor content requires a future, explicit
  conversion step (documented blocker);
- no broad JSON is returned to the editor frontend and no server file path is
  exposed by editor code.

**Risk note**: because those fields are unstructured JSON, any future
template→editor conversion must map them through an explicit allow-list, not
pass them through.

## DOCUMENT-EDITOR-DOCX-INTEROPERABILITY-TEMPLATE-BRIDGE-1 update

The professional editor now supports **local browser-only DOCX import/export for a conservative supported subset**. This is not server persistence: no save, no autosave, no server version, no restore, no `workspaceText`, no external conversion service, no AI, and no n8n. Unsupported Word features are warned or rejected; the exported DOCX is a newly generated file, not Word-perfect round-trip fidelity.

## Template Assembly Variable Boundary

`DOCUMENT-EDITOR-TEMPLATE-ASSEMBLY-CLAUSE-CATALOG-1` does not accept runtime generation variables from the editor. Future template variables must use explicit key/type/source allow-lists and must not use broad `templateData`, raw object paths, `workspaceText`, communication content, internal notes, or arbitrary nested JSON.
