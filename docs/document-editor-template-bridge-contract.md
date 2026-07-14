# Document Editor Template Bridge Contract

## Current contract

Template bridge is not active. The editor does not call template generation or download routes automatically.

## Future safe bridge

A future bridge must use existing authorization, avoid storage-path exposure, avoid broad `templateData`, require explicit user action, return a DOCX through an approved download boundary, convert locally in the browser, show warnings, and preserve Mode C.

## Current Runtime Contract

The only implemented template-to-editor runtime contract is `GET /api/v1/contracts/editor-template-capabilities`. It reports unavailable template/generation/clause capabilities without querying storage. It is not a catalog, preview, generation, or download endpoint.
