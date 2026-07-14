# Document Editor Pro — Data Source and Persistence Audit

Package: DOCUMENT-EDITOR-PRO-CONTRACT-WORKBENCH-1
Date: 2026-07-14 · Baseline HEAD: `a319255` · Branch: `hotfix/runtime-shape-20260308`

This audit determined how editable document content can truthfully be loaded
and persisted before any save/autosave/version behavior was built. The result
is the **persistence-mode classification: Mode C — explicit export-only
working session** (see the reasoning below the table).

## Audit table

| Concept | Existing component/model/route | Current capability | Persistence source | Production-compatible? | V1 disposition | Safety notes |
| --- | --- | --- | --- | --- | --- | --- |
| Tiptap editor | `TipTapEditorExperimental.tsx`, `/editor-lab` (pre-package) | Preliminary sandbox; plain-text adapter loses structure | none (React memory) | yes (UI only) | superseded by canonical workbench | old sandbox route now redirects |
| Tiptap JSON | `onDocumentJsonChange` callback only | produced but discarded | none | yes | canonical internal format; strict validator added | arbitrary JSON is rejected |
| HTML serialization | none for drafting | — | — | — | sanitized standalone HTML export added (`htmlExport.ts`) | escaped output, no scripts/IDs |
| DOCX loading | none (no converter installed; `docxtemplater` is template-fill only) | not supported | — | — | `DEFERRED` — no safe converter | uploads are not "editable content" |
| DOCX export | none (no Tiptap→DOCX converter) | not supported | — | — | `DEFERRED` — capability false, no button | fidelity claims forbidden |
| PDF/print export | none dedicated | browser print available | — | yes | `SUPPORTED_NOW` via print CSS, labeled "böngészőből" | no server-side PDF claim |
| Document save | `POST /documents/:id/save-workspace-version` | writes `documents.workspaceText` | `workspaceText` | **no** — 501-gated (`ENABLE_DOCUMENT_PROCESSING` + `ENABLE_DOCUMENT_AI_PRIVACY_MODEL` both required) and `workspaceText` is a forbidden editor store | `PRESENT_NOT_PRODUCTION_COMPATIBLE` / `PRIVACY_BLOCKED` | never called by the editor |
| Autosave | none | — | — | — | not implemented (would be fake) | honest "Nincs szerverre mentve" status instead |
| New version | `POST /documents/:id/version` (base64 file upload) | 501-gated | SharePoint file | `FEATURE_GATED` (off in production posture) | `DEFERRED` — `canSaveNewVersion` false | no metadata-only fake versions |
| Version restore | none | — | — | — | `DEFERRED` | — |
| Compare | `/documents/compare` + review-suggestion workspace | works (persisted `DocumentReviewSuggestion`) | Prisma | yes | `SUPPORTED_NOW` — deep-linked from editor as the truthful redline | labeled "Verziók összehasonlítása" |
| Comments | `Comment` model (documentId, caseId) | **no backend routes exist** (`prisma.comment` unused) | Prisma model only | model yes, API no | `DEFERRED` — truthfully unavailable in editor | no fake anchored comments |
| Anchored comments | none (no range/anchor fields) | — | — | `SCHEMA_CHANGE_REQUIRED` | `DEFERRED` | not simulated in comment content |
| Task-backed review | `POST /documents/:id/tasks` (ungated) + task transitions + case work-items capabilities | works | Prisma tasks | yes | `SUPPORTED_NOW` — editor review panel uses it | server-derived capabilities only |
| Track changes | none (no change-op model) | — | — | `SCHEMA_CHANGE_REQUIRED` | `DEFERRED` — compare workflow is the redline mechanism | no cosmetic toggle built |
| Templates | `ContractTemplate` + `docxtemplater` generation | DOCX file generation | file path + `variables` JSON | yes (existing flow) | kept separate — generated DOCX is not directly editable; documented future conversion requirement | `variables`/`templateData` treated as broad JSON, not expanded |
| Variables | `ContractGeneration.templateData` (broad JSON) | template-fill only | JSON | risky if broadened | editor uses its own strict field-token allow-list instead | no raw object traversal |
| Contract generation | `ContractGeneration` routes | works | Prisma + files | yes | unchanged; linked, not embedded | — |
| SharePoint versioning | `driveService`, `DocumentVersion` | metadata + SP identifiers | SharePoint | yes (metadata) | metadata display only | no direct browser→SharePoint access |
| Local file export | none | — | — | — | added: HTML + TXT Blob downloads | content stays local |
| Paste from Word | none | — | — | — | added: string-level sanitizer + schema parse boundary | no perfect-fidelity claim |
| Tables | not installed | — | — | — | added `@tiptap/extension-table@3.26.0` (official, version-matched; the single package addition) | bounded 60×12 |
| Images | `Document` binary via gated routes | 501-gated | SharePoint | `FEATURE_GATED` | `DEFERRED` — `<img>` stripped on paste | no base64 payloads |
| Headers/footers | none | — | — | `SCHEMA_CHANGE_REQUIRED` (no safe document-level config) | `DEFERRED` | not stored in unrelated fields |
| Page numbers | none | — | — | — | `DEFERRED` — print CSS cannot claim them truthfully with a continuous canvas | documented |
| Footnotes | none | — | — | — | `DEFERRED` | — |
| Realtime collaboration | none | — | — | — | out of scope by design (no Yjs/Hocuspocus) | static guard enforces |

## Persistence-mode reasoning (Mode C)

- **Mode A (dedicated editor persistence): unavailable.** No editor-content
  model/service exists; `Document`/`DocumentVersion` hold metadata and
  SharePoint identifiers only. Creating one would require a schema change,
  which this package forbids.
- **Mode B (file-backed version): unavailable in the production posture.**
  Every content route (`GET /documents/:id/text`, `POST /documents/:id/version`,
  `POST /documents/:id/save-workspace-version`, `GET /documents/:id/download`,
  `POST /documents`) is gated behind `ENABLE_DOCUMENT_PROCESSING` **and**
  `ENABLE_DOCUMENT_AI_PRIVACY_MODEL`, which are off in the production-
  compatible posture (enforced by `documentAiBoundary.test.ts`). Additionally,
  the only text-persistence field those routes use is `documents.workspaceText`,
  which is explicitly forbidden as editor storage by privacy policy and by this
  package.
- **Mode C (export-only working session): selected.** The professional editing
  experience is fully built; content lives only in current React/editor memory;
  the UI displays "Munkamenet — nincs szerverre mentve"; unload warns; exports
  (browser print/PDF, sanitized HTML, TXT) are the truthful preservation paths;
  Mentés/Új verzió are not rendered as active actions; no localStorage/
  sessionStorage copy exists (static-guarded).

## Future persistence decision required

Enabling real save/versioning requires a product/schema decision: either an
approved dedicated editor-content model (with format, access, version and
concurrency semantics) or enabling the gated file-backed pipeline together
with an approved storage/retention/audit model — both outside this package.

## Explicit non-goals confirmed

No AI API, no n8n, no Client Portal change, no schema change, no migration,
no external conversion SaaS, no e-signature, no court filing, no realtime
collaboration.

## DOCUMENT-EDITOR-PERSISTENCE-VERSIONING-READINESS-1 update

This document is superseded/qualified by `docs/document-editor-persistence-versioning-readiness-1.md` for server persistence questions. The professional editor remains **Mode C — export-only working session**: no server save, no autosave, no real editor-content versions, no restore, no document-level comments, no `workspaceText`, no unrelated-field storage, no AI, and no n8n. The backend now exposes only a metadata/capability endpoint and a strict future `TIPTAP_JSON` validator.
