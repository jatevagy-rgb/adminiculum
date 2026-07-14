# Document Editor Pro — Import and Export Fidelity

Package: DOCUMENT-EDITOR-PRO-CONTRACT-WORKBENCH-1

Honest capability matrix — nothing below is simulated beyond what is stated.

## Export

| Format | Status | Mechanism | Fidelity statement |
| --- | --- | --- | --- |
| Print / PDF | ✅ available | Browser print dialog + dedicated print CSS (A4, 20 mm margins, chrome hidden, page-break nodes honored, clauses/tables keep together where possible) | Labeled "Nyomtatás / PDF (böngészőből)". **No server-generated PDF claim.** Page numbers are whatever the browser adds — not app-generated. |
| HTML | ✅ available | `editorDocToStandaloneHtml` — escaped, self-contained, inline minimal CSS, generated clause numbers, resolved tokens, unresolved tokens visibly marked | No scripts, no internal ids (clause `cid`s excluded), no application classes. |
| Plain text (.txt) | ✅ available | `editorDocToPlainText` — generated clause numbering, `–`/`1.`/`a)`/`(i)` list markers, tab-separated tables, page-break markers | Structure flattened by design. |
| DOCX | ❌ unavailable | — | No Tiptap→DOCX converter exists in the installed dependency set. The existing `docxtemplater` code performs template filling, which does **not** prove arbitrary rich-content conversion. Capability false, no button rendered, blocker documented. |

Every export first runs the strict schema validator; invalid content blocks
the export with a visible notice.

## Import

| Source | Status | Mechanism | Quality statement |
| --- | --- | --- | --- |
| Paste from Word | ✅ available | `sanitizeExternalHtml` (string-level defense-in-depth) → Tiptap schema parse (hard boundary) → strict validator | Preserves paragraphs, detectable headings, bold/italic/underline, ordered/bullet lists, bounded tables, meaningful non-breaking spaces and legal punctuation. Drops styles, fonts, colors, classes, images, scripts, Office XML. **No perfect DOCX fidelity claim.** |
| Paste without formatting | ✅ available | Browser plain-text paste (Ctrl+Shift+V) / `externalHtmlToPlainText` | Text only. |
| DOCX file import | ❌ unavailable | — | No safe converter exists; uploaded DOCX files are never renamed "editable content". Deferred with an explicit future decision. |

## Round-trip

Editor JSON → HTML export → re-paste is *not* claimed to be lossless and is
not a supported workflow; the working session plus exports are the supported
paths in persistence mode C.
