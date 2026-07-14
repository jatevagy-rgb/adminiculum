# Document Editor DOCX Data Source and Library Audit

## Repository capability table

| Capability | Existing implementation | Runtime | Safe for editor? | V1 disposition | Notes |
|---|---|---|---|---|---|
| DOCX package parsing | New frontend `jszip` dependency | Browser local only | Yes, bounded | SUPPORTED | No upload and no external converter. |
| DOCX HTML conversion | none | n/a | n/a | NOT USED | Avoided; mapped XML subset directly to editor JSON. |
| DOCX structure conversion | `Frontend/src/lib/editor/docxInterop.ts` | Browser local only | Yes for subset | SUPPORTED_WITH_WARNINGS | Paragraphs, headings, typed decimal clauses, tables, page breaks, marks. |
| DOCX generation | `docxInterop.ts` + `jszip` | Browser local only | Yes for subset | SUPPORTED_WITH_WARNINGS | Generates a fresh `.docx`, not original round-trip. |
| template filling | Backend `docxtemplater`/contract generation | Backend gated flows | Not directly editor-safe | DOWNLOAD_ONLY / FEATURE_GATED | No automatic bridge implemented. |
| document download | existing backend document download | Auth/backend | Safe only through existing route | DOWNLOAD_ONLY | Not widened. |
| local file import | New hidden input in editor | Browser | Yes | SUPPORTED | File never leaves browser. |
| file-size validation | `DOCX_LIMITS` | Browser | Yes | SUPPORTED | Conservative compressed/entry/total limits. |
| ZIP inspection | `inspectDocxFile` | Browser | Yes | SUPPORTED | Detects path traversal, missing `document.xml`, macro/embedded/remote objects. |
| MIME detection | extension + MIME allow-list | Browser | Partial | SUPPORTED | Browser MIME may be empty; extension still required. |
| external relationships | package rel inspection | Browser | Yes | WARN/REJECT | Remote images reject; external links flattened. |
| macros | `vbaProject.bin` detection | Browser | Yes | REJECT | No macro execution/preservation. |
| embedded objects | `word/embeddings`, OLE detection | Browser | Yes | REJECT | No OLE import. |
| comments | comments parts / refs | Browser | Yes | WARNING | Removed/flattened; no document comment model. |
| tracked changes | `w:ins`, `w:del`, moves | Browser | Partial | WARNING | Flattened visible text; no live track changes. |
| footnotes/endnotes | parts/refs | Browser | Yes | WARNING | Removed/unsupported. |
| headers/footers/page numbers | parts | Browser | Yes | WARNING | Not imported/exported as layout features. |
| images | media/drawing detection | Browser | Yes | WARNING/REJECT remote | Embedded images removed; remote images rejected. |
| tables | XML subset mapping | Browser | Yes within editor limits | SUPPORTED_WITH_LIMITS | Oversized tables simplified. |
| numbering | typed decimal clause detection | Browser | Partial | SUPPORTED_WITH_WARNINGS | Ambiguous Word numbering normalized. |
| styles | basic Heading1-3 only | Browser | Partial | SUPPORTED_WITH_WARNINGS | Custom styles not round-tripped. |

## Candidate library table

| Library | Role | Browser support | License | External calls? | Dependency impact | Selected? | Reason |
|---|---|---|---|---|---|---|---|
| `jszip@3.10.1` | Read/write DOCX ZIP packages | Yes | MIT per package metadata | No | Added to `Frontend` only | Yes | Minimal package primitive; no conversion service. |
| `mammoth` | DOCX to HTML | Backend dependency only | BSD-2-Clause in package ecosystem | No | Would add heavier browser conversion | No | HTML conversion would obscure unsupported-feature handling. |
| `docx` | DOCX generation | Backend dependency only | MIT in package ecosystem | No | Larger browser surface | No | V1 can generate subset directly through OOXML + ZIP. |
| `docxtemplater` / `pizzip` | Template filling | Backend dependency | MIT/commercial ecosystem depending plugins | No | Existing backend only | No frontend use | Not arbitrary editor DOCX conversion. |

## Selected path

Branch A: local import and export for a conservative supported subset. Fidelity is explicitly bounded; unsupported Word features are reported or rejected.
