# 06 — Document System Archaeology

> Every generation of the document pipeline. Canonical `50945ecd`. Confidence `PROVEN`/`STRONGLY_INDICATED`/`UNPROVEN`. **Rule preserved: Word remains the primary editor — do NOT resurrect a browser clone.**

## Lineage GEN-1 → GEN-2 → GEN-3 → CURRENT

**GEN-1 (Feb–Jul 2026) — Upload-only + SharePoint + template generation.** `documents/*` + `contracts/services.ts` (2636 lines) from initial `35687fd`. Models `Document`/`DocumentVersion` (`spItemId`/`spPath`/`folder∈{DRAFT,REVIEW,APPROVED,FINAL}`); template generation from 22 DOCX; `finalize`/`reject-approval`/`back-to-review`/`create-revision`/`timeline` (contracts routes 696/761/794/827); `generation-draft` + `anonymize` tracked at `809d602`.
- **Worked:** template-based generation; SharePoint durable storage; version rows; approval/finalize lifecycle.
- **Bad:** browser editor persisted content into `workspaceText`/direct SharePoint (`saveWorkspaceDocumentVersion`, `getDocumentText`); compare was metadata-only; no review state machine; anonymization was the only real text extraction.

**GEN-2 (Jul 2026) — Work-context, comments, annotations, editor-prep.** `b923f33` (document comments), `adb0161` (editor persistence/versioning), `e321feb` (reconstruct narrow editor), `7c9a23e` (anchored annotations), `68c8a7c` (`workContext.service.ts` two-way document↔case/task links + identity block).
- **Worked:** document↔task/case contextual linking, annotation comment threads.
- **Removed/bad:** editor-persistence direction collided with truthfulness (fake autosave/track-changes).

**GEN-3 (27 Jul 2026) — True review lifecycle + deterministic structured comparison.** `57b343f` (review state machine), `d1d8fd6` (review subsystem), `adaa1af` (`diffEngine`), `322eaa4` (comparison version-text provider + schema + persistence). Review statuses `DRAFT/ASSIGNED/IN_REVIEW/RESUBMITTED/CANCELLED/READY_FOR_REVIEW/CHANGES_REQUESTED/APPROVED/READY_FOR_CLIENT/PUBLISHED/CLOSED` (`schema.prisma:1345`). Comparison segments fully typed: `ChangeType{INSERT,DELETE,REPLACE,MOVE_CANDIDATE,FORMAT_ONLY}`, `SegmentCategory{PARTY,DATE,AMOUNT,OBLIGATION,LIABILITY,TERMINATION,GOVERNING_LAW,DEFINITION}`, `ReviewState{UNREVIEWED,ACCEPTED,REJECTED,NEEDS_DISCUSSION,NOT_RELEVANT}`, per-segment task-link + annotation-link.

**CURRENT (Aug 2026) — Security hardening + export-only editor (Word primary).** `ed7d21c`/`3a30ba4` (DW0 byte-fidelity storage), `8f34837`/`4004c01` (SEC-2 upload validation), `ab006f1`/`1b3426c` (SEC-1 object authorization), `b3db2b2`/`9419115` (anonymize PII boundary). `DOCUMENT-EDITOR-PRO-CONTRACT-WORKBENCH-1`: **export-only** — `documentEditorProStaticGuards.test.ts` forbids `workspaceText`, `saveWorkspaceDocumentVersion`, `getDocumentText`, track changes, autosave, localStorage/sessionStorage, direct SharePoint/Graph, AI SDKs. Editor = TipTap workbench + `docxInterop.ts`/`htmlExport.ts`/`plainTextExport.ts`; `modules/documentEditor/` = `contentSchema.ts`+`service.ts` (validate/metadata only, no persistence routes).

## What SURVIVED (reachable at canonical)

- **Review lifecycle** — `documentReviewRouter`(/api/v1/documents) + `reviewRouter`(/api/v1/document-reviews), mounted `index.ts:293-295`; `DocumentReviewWorkflowPanel.tsx` wired into `app/cases/[caseId]/documents/page.tsx:60,1715`; API `lib/documents/reviewWorkflowApi.ts`.
- **Structured comparison** — `documentScopedComparisonRouter`+`comparisonRouter` mounted `index.ts:289-291`; `ComparisonWorkspace.tsx` into the same documents page.
- **Annotations** (`annotations.routes.ts`), **work-context / task-links** (`routes.ts:48-63`), **anonymize→rehydrate** (`AnonymizeModal.tsx`/`RehydrateModal.tsx`), **publication** (`publication/*`, `MilestonePublicationPanel`, `ClientPublicationPanel`), **version list/get/promote/download** (`routes.ts:475/490/612/630/658`).

## What SEMANTICS WERE LOST / DISCONNECTED (actionable)

1. **Text-diff over DOCX/PDF is OFF even though extraction exists.** `comparison/versionText.ts` only classifies TXT/MD/CSV/JSON/XML as extractable and returns `UNSUPPORTED('FORMAT_NOT_TEXT_EXTRACTABLE')` for DOCX/PDF (`versionText.ts:30-36,64-65`) — **despite** `textExtractor.ts` already having battle-tested mammoth DOCX + pdf-parse (`textExtractor.ts:5,101-160`, used by anonymization). **The entire Word (primary) corpus is excluded from text-diff despite the engine being in the same repo.** → **PROVEN — the single largest recoverable capability; no browser clone needed.**
2. **The AGENTS.md "compare is metadata-only" statement is superseded/FALSE** at canonical — a full `diffEngine` + typed segments + publishable comparison exists and is mounted. The doc should be corrected, not the capability removed.
3. **Two parallel compare surfaces.** Legacy `app/documents/compare/page.tsx` still calls the gated `getDocumentText`/`saveWorkspaceDocumentVersion` (`compare/page.tsx:889,2163; lib/api.ts:2098,3427`; endpoints `GET /:id/text` routes.ts:711, `POST /:id/save-workspace-version` routes.ts:987). Many pages route to `/documents/compare` (communications, generate, ReviewPageContent, clause-library, notifications, CaseDetail). Duplicates `ComparisonWorkspace`. → **STRONGLY_INDICATED consolidation opportunity.**
4. **Immutable `DocumentVersion` history SURVIVES — only legacy editor working-copy semantics were removed by design.** The case document UI already loads versions, uploads versions, downloads versions, promotes the current version and renders version history; the backend `DocumentVersion` list/get/promote-current API is complete. What was removed by design is the old editor working-copy autosave/track-changes save path (guards strip `workspaceText`/`saveWorkspaceDocumentVersion`). **No recovery is required here — it is not a lost capability.**
5. **Export-only editor intentionally has no save semantics** — correct per Word-primary rule. **DO NOT resurrect a browser Word clone.**

## Recommendation

Recover the **DOCX/PDF text-diff** by routing the comparison resolver through the existing `textExtractor.ts` (mammoth/pdf-parse) instead of its current TEXT-only gate. Retire/redirect the legacy `app/documents/compare/page.tsx` to the mounted `ComparisonWorkspace`. Surface the review lifecycle from the case-documents page (backend endpoints exist). Version-history presentation needs no change — immutable `DocumentVersion` flow already works.
