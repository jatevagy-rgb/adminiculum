# Document Editor DOCX Acceptance

## Accepted now

- Local `.docx` inspection and subset import.
- Local `.docx` export as a fresh generated file.
- Warnings for unsupported features.
- Rejection of macros, embedded objects, unsafe ZIP paths, missing main document and remote images.
- Mode C warning remains visible and dirty state is not cleared by export.
- No external converter, AI, n8n, server upload, schema, migration or deployment.

## Manual scenarios

Test ordinary contract, nested clauses, tables, page breaks, tracked changes, comments, images, header/footer/page numbers, macro document, embedded object, external hyperlink, remote image, oversized/malformed DOCX, unresolved tokens, export round-trip subset, dirty-session import confirmation, keyboard operation, common laptop width, and `/portal` unchanged.
