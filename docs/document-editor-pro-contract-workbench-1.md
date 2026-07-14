# Professional Contract Editor 1

Package: DOCUMENT-EDITOR-PRO-CONTRACT-WORKBENCH-1
Date: 2026-07-14 · Baseline HEAD: `a319255` · Branch: `hotfix/runtime-shape-20260308`

## Purpose

Transform the preliminary Tiptap/Editor Lab sandbox into one canonical,
professional internal legal-document and contract editor with truthful
content-loading/saving semantics, structured legal clauses with derived
numbering, outline navigation, safe variables, Word-paste sanitization,
search/replace, bounded tables, honest print/export, and integration with the
existing task-backed review and compare workflows.

## Repository findings

- The previous editor surface was a sandbox (`/editor-lab`) built on
  `TipTapEditorExperimental` with a **plain-text adapter that discarded
  structure** on serialization — genuinely preliminary.
- The experimental editor components are ALSO embedded by
  `/documents/compare` and `/litigation-workspace` as their persisted
  review-suggestion workspaces (`DocumentReviewSuggestion` with
  `CONTRACT_WORKSPACE`/`LITIGATION_WORKSPACE` sources). Those surfaces serve a
  different responsibility (anchored review suggestions over loaded document
  text) and remain unchanged.
- All server document-content routes are 501-gated behind
  `ENABLE_DOCUMENT_PROCESSING` + `ENABLE_DOCUMENT_AI_PRIVACY_MODEL` (off in
  the production posture) and the only text store they use is the forbidden
  `documents.workspaceText`.
- Installed Tiptap: v3.26 (`react`, `pm`, `starter-kit`,
  `extension-underline`). No table extension was installed.
- `Comment` has no backend routes; task-backed review (document-source review
  tasks + task transitions + work-item capabilities) is the live, ungated
  review mechanism.

Full details: `docs/document-editor-pro-data-source-and-persistence-audit.md`.

## Canonical editor route

`/documents/[documentId]/edit` — `documentId = "new"` opens a standalone
working draft. `/editor-lab` now redirects to `/documents/new/edit`; the old
sandbox implementation was removed from that route. One drafting editor
remains; the compare/litigation embedded review-suggestion workspace is a
separate documented surface, not a second drafting editor.

## Persistence mode

**Mode C — explicit export-only working session.** Content lives only in the
current editor memory. The header and status panel state "Munkamenet — nincs
szerverre mentve"; leaving/reloading warns while unsaved content exists; there
is no Mentés/Új verzió action, no autosave claim, no browser-storage copy
(static-guarded). Truthful preservation paths: browser print/PDF, sanitized
standalone HTML download, plain-text download. The exact future persistence
decision needed is documented in the audit.

## Content contract

No backend editor-content endpoint exists in Mode C. The internal content
contract is the strict client-side model in `Frontend/src/lib/editor/`:
`editorModel.ts` (allow-lists + limits), `editorSchemaValidator.ts` (strict
validation run before every export), documented in
`docs/document-editor-pro-content-contract.md`.

## Tiptap schema and validation

Allowed nodes: doc, paragraph, heading(1–3), text, hardBreak, bulletList,
orderedList(+listStyle), listItem, blockquote, horizontalRule, table,
tableRow, tableCell, tableHeader, legalClause(cid), clauseHeading, pageBreak,
fieldToken(fieldId). Marks: bold, italic, underline, strike,
link(http/https/mailto). Limits: 20 000 nodes, 400 000 chars, 2 MB serialized,
tables ≤ 60×12, clause depth ≤ 3. Unknown nodes/marks/attrs, scripts, event
handlers, `javascript:`/`data:` links, base64 payloads and malformed tables
are rejected with bounded error lists; rejected content is never logged.
StarterKit's code/codeBlock are disabled to match the allow-list.

## Professional editing surface

Centered A4 canvas (794 px) with visible margins, zoom 75/90/100/110%/fit-
width, serif legal typography, focus mode, honest continuous-canvas layout
with explicit page-break nodes (labeled — no fake pagination), visible
selection/focus states, and a persistent unsaved/persistence-mode status.

## Legal clause and numbering model

`legalClause` is a nested structural node with a stable generated `cid`.
Numbers (1., 1.1., 1.1.1.) are **derived from structure** by the pure engine
(`clauseNumbering.ts`) and rendered on canvas via ProseMirror node decorations
(`data-clause-no` + CSS) — never stored as text, never serialized. The same
engine feeds the outline, plain-text export and HTML export, so insert /
delete / move / promote / demote / duplicate renumber everything
automatically. Guards: max 3 levels, no orphan levels/illegal jumps
(demote requires a previous sibling), duplicate-cid detection and repair, and
an `appendTransaction` integrity plugin assigns fresh ids when Enter-splits
copy attributes. 15 dedicated unit tests cover the operations.

## Outline and navigation

Left outline built from headings + clauses (generated numbers, stable keys),
click-to-navigate, current-clause highlight, collapse/expand, filtering,
document-top/end shortcuts, and per-clause structural actions.

## Contract insertion blocks

Structured presets (validator-clean, unit-tested): party block, recital,
definitions list, numbered clause, annex reference, signature blocks (1/2/N
parties — signature lines only, never signatures, no e-signature), fee /
milestone / annex-index tables.

## Variables and safe case context

Explicit field-token allow-list (case/client/lawyer display fields, document
title, today's date, manual party/amount/date fields). Tokens render as
distinct chips; the side panel lists occurrences with resolved/unresolved
state; conversion to static text is explicit and confirmed; resolution uses a
minimal context assembled from already-authorized metadata
(`getCaseSummary` + `getCaseWorkflowSummary`) — no raw objects, no sensitive
identifiers, no expression syntax, no writeback.

## Word paste and sanitization

`pasteSanitizer.ts` strips scripts/styles/Office XML/conditional comments/
event handlers/unsafe protocols/fonts/colors/classes/images, unwraps
presentational wrappers, preserves paragraphs, headings, b/i/u, lists and
bounded tables, and normalizes whitespace while keeping meaningful
non-breaking spaces. Applied via `transformPastedHTML` before the schema
parse (the hard boundary). Plain-text paste remains available. No DOCX
fidelity claim is made. Representative Word-HTML fixtures are unit-tested.

## Tables and page layout

Official `@tiptap/extension-table@3.26.0` (the single, explained package
addition): insert, add/remove row/column, merge/split, header-row toggle,
bounded size, keyboard navigation. Print CSS: A4 @page, 20 mm margins, chrome
hidden, page-break nodes become real breaks, clauses/tables avoid page splits,
headings avoid break-after. Page numbers and headers/footers are deferred
(documented) — no Word-identical layout claim.

## Save, versioning and concurrency

Mode C: no save path exists, so no save button, no autosave, no version
actions, no concurrency machinery — and none are simulated. Version metadata
(current version number) is displayed as metadata only. Stale-save/409
semantics become relevant only when a real persistence mode is approved.

## Review and compare integration

The review panel lists this document's linked tasks from the case work-items
contract (backend-derived capabilities): create review task
(`POST /documents/:id/tasks`, kind REVIEW), start, submit for review, approve,
return for correction (`startTask`/`submitTask`/`completeTask`), open task.
Approval is explicitly labeled internal workflow approval — not signature,
filing, sending, or proof of validity. Compare deep-links to
`/documents/compare` as the truthful redline ("Verziók összehasonlítása").

## Comments

The `Comment` model has no backend routes → comments are truthfully
unavailable in the editor (listed in the unavailable-features panel). No fake
anchored comments; anchor support would require schema + route work
(documented).

## Import and export

Print/PDF via the browser (labeled), sanitized standalone HTML (escaped, no
scripts/internal ids), TXT with generated numbering. DOCX import/export:
unavailable — no reliable converter exists in the installed set; capability
false, no dead buttons, blocker documented. Every export first runs the strict
validator.

## Privacy and authorization

The editor loads only ungated metadata (`GET /documents/:id`, case summary,
work items) through the shared API client; full draft content never leaves
the browser and never enters logs, notifications, activity, audit, task DTOs
or lists. Static guards enforce: no `workspaceText`, no gated content routes,
no direct SharePoint/Graph, no raw fetch, no `dangerouslySetInnerHTML`, no
browser-storage persistence, no content in unrelated fields.

## AI and n8n compliance

No AI SDK/API, no AI clause generation/analysis/modification, no n8n. The
editor may later feed the separately approved manual AI work-package flow; no
AI integration exists here. Guarded statically.

## Unsupported or deferred functionality

DOCX import/export; server save/autosave; content versioning/restore; page
numbers; headers/footers; footnotes; anchored comments; comment routes; live
track changes; realtime collaboration; images. Each is shown honestly as
unavailable in the UI where relevant and recorded in the audit document.

## Validation

- Backend: `prisma validate` ✓, `tsc --noEmit` ✓, **43 suites / 468 tests** ✓
  (from 38/408; +5 suites: clause numbering, schema validation, paste
  sanitizer, tokens/presets/export, static guards — pure editor logic is
  imported directly from the framework-free Frontend modules).
- Frontend: `tsc --noEmit` ✓, production build ✓, clean production-env
  verification with the documented non-routable URL ✓ (see final report).

## Explicit statements

Selected persistence mode: **C (export-only working session)**. No schema
change; no migration; no manual DB query; no deployment; no Client Portal
change; no AI API; no n8n; no fake autosave; no fake track changes; no
workspaceText; no unrelated JSON storage; DOCX fidelity: none (feature
unavailable, not simulated); actual versioning capability: metadata display
only, no content versions.

## Remaining editor work

1. Approved persistence model (Mode A or ungated Mode B) → real save,
   autosave, versions, 409 concurrency.
2. Comment routes (+ future anchored-comment schema).
3. DOCX converter decision (import quality warnings, export fidelity tests).
4. Template→editor conversion for `ContractTemplate` content.
5. Page numbers/headers/footers once a truthful layout mechanism exists.

## DOCUMENT-EDITOR-PERSISTENCE-VERSIONING-READINESS-1 update

This document is superseded/qualified by `docs/document-editor-persistence-versioning-readiness-1.md` for server persistence questions. The professional editor remains **Mode C — export-only working session**: no server save, no autosave, no real editor-content versions, no restore, no document-level comments, no `workspaceText`, no unrelated-field storage, no AI, and no n8n. The backend now exposes only a metadata/capability endpoint and a strict future `TIPTAP_JSON` validator.

## DOCUMENT-EDITOR-DOCX-INTEROPERABILITY-TEMPLATE-BRIDGE-1 update

The professional editor now supports **local browser-only DOCX import/export for a conservative supported subset**. This is not server persistence: no save, no autosave, no server version, no restore, no `workspaceText`, no external conversion service, no AI, and no n8n. Unsupported Word features are warned or rejected; the exported DOCX is a newly generated file, not Word-perfect round-trip fidelity.
