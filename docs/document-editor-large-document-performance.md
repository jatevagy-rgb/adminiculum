# Document Editor Large Document Performance

## Local limits

- Editor nodes: 20,000
- Text length: 400,000 characters
- Serialized size: 2 MB
- Table size: 60×12
- DOCX compressed size: 10 MB
- DOCX entries: 600
- DOCX total uncompressed size: 30 MB

## Implemented behavior

The workbench warns when the editor approaches the text limit. DOCX import is inspected locally and rejected for unsafe or oversized packages before replacing editor content.

## Recovery

Import replacement requires confirmation. Cancellation and conversion failure preserve the current document.
