# Document Editor DOCX Interoperability and Template Bridge 1

## Purpose

Add privacy-preserving local DOCX import/export to the professional editor without changing Mode C persistence semantics.

## Repository findings

The editor already has strict Tiptap schema, Mode C unsaved-session warning, HTML/TXT/print export, and backend metadata/capability contracts. Backend has DOCX generation/template libraries, but those are not browser editor conversion primitives.

## Selected implementation branch

Branch A — safe local DOCX import and export for a conservative legal-document subset.

## Selected libraries

Added `jszip@3.10.1` to `Frontend` for local browser DOCX ZIP inspection, parsing, and package generation. No external converter was added.

## Local conversion architecture

Local file → `inspectDocxFile` → XML subset conversion → frontend schema validation → warning/confirmation → current in-memory Tiptap session. Export validates editor JSON and generates a new `.docx` package locally.

## DOCX security inspection

Inspection enforces `.docx`, MIME allow-list, compressed size, entry count, per-entry size, total uncompressed size where available, required `word/document.xml`, path traversal rejection, macro rejection, embedded object rejection, and remote image/external image rejection.

## Import pipeline

Import supports headings, paragraphs, text marks, typed decimal legal clauses, simple tables, page breaks, and visible text. The current editor content is replaced only after user confirmation.

## Import fidelity

Fidelity levels are `FULLY_SUPPORTED_SUBSET`, `SUPPORTED_WITH_WARNINGS`, `FLATTENED`, and `REJECTED`. Warnings are shown before replacement.

## Tiptap mapping

DOCX paragraphs map to Tiptap paragraphs/headings/legal clauses; tables map to editor tables; page breaks map to `pageBreak`; supported marks map to bold/italic/underline/strike.

## Legal clause numbering

Typed decimal numbering such as `1.` and `1.2` is conservatively converted to structured legal clauses. Ambiguous/custom Word numbering is preserved as text/list-like content with warnings.

## Tables and page breaks

Tables are bounded by editor row/column limits. Explicit page breaks are preserved as editor page breaks.

## Tracked changes and comments policy

Tracked changes are flattened into visible text with warning. Word comments are removed with warning. No live Word track changes or document comment model is claimed.

## Images and embedded content policy

Embedded images are detected and removed with warning. Remote images and embedded OLE/macro content are rejected.

## Export pipeline

Export creates a fresh DOCX package with document XML, styles, content types, and internal relationships. It does not update, upload, or overwrite the source file.

## Field-token export

Resolved tokens export as visible text. Unresolved tokens export as marker text with warning.

## Page layout and Word fidelity

Export uses an approximate A4 section. It is not Word-perfect and does not preserve the original DOCX layout, headers, footers, comments, images, tracked changes, or complex styles.

## Template bridge

Direct template bridge is not implemented. Existing backend template/generated DOCX flows remain feature-gated/download-only. A user may import an already downloaded authorized DOCX locally.

## Editor UI

The editor header now contains quiet `DOCX import` and `DOCX export` actions beside existing export/print controls.

## Privacy and security

Import/export happens locally in the browser. No DOCX content is sent to backend, audit, notifications, tasks, Case Activity, AI, n8n, Client Portal, telemetry, or external converters.

## Mode C persistence compliance

Mode C remains unchanged: no server save, no autosave, no persisted editor-content version, no restore, no comments, no `workspaceText`, and no unrelated-field storage. DOCX export does not clear dirty state.

## AI and n8n compliance

No AI API, AI conversion, n8n workflow, or external conversion service was introduced.

## Unsupported or deferred functionality

Legacy `.doc`, macros, OLE, remote images, live tracked changes, Word comments, footnotes/endnotes, headers/footers/page numbers, images, complex numbering, custom styles, DOCX round-trip fidelity, and automatic template generation remain unsupported/deferred.

## Validation

Tests cover DOCX inspection, import/export, unsafe packages, warning detection, and static safety. Full validation is recorded in the final task report.

## Remaining interoperability work

Potential future work: richer numbering import, image policy, headers/footers, a reviewed template-download bridge, worker-based large document conversion, and more extensive real-world DOCX fixture testing.
