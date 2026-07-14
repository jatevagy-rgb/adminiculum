# Document Editor Template Local Import Bridge

## Current Supported Bridge

The supported bridge is manual and local:

1. Use an already-authorized backend/download workflow outside the editor, where available.
2. Download a `.docx` file.
3. Open the professional editor.
4. Use `DOCX import` / `Helyi DOCX import`.
5. The browser-local DOCX inspector validates the file.
6. The user confirms replacement of the current unsaved session.
7. The imported content remains an unsaved Mode C editor session.
8. Local DOCX export creates a new file.

## Explicitly Not Implemented

- Automatic generated DOCX import.
- Automatic template selection.
- Automatic generation on page load.
- Server save of imported content.
- SharePoint upload of edited content.
- Client Portal publication.
- AI/n8n conversion.
