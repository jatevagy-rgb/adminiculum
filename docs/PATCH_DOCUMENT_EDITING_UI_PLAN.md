# PATCH PLAN: Document Editing + UI Surface Improvements

**Date**: 2026-04-30  
**Plan Type**: Pre-implementation planning report  
**Canonical Branch**: `hotfix/runtime-shape-20260308`  
**Status**: PLANNING ONLY — do not implement until reviewed

---

## 1. PURPOSE AND CONTEXT

This document is the planning artifact for the next product patch focused on document editing UI and surface improvements. It is not an implementation report. It documents:

- Files inspected and current state
- Pain points identified in the document workflow
- Proposed patch scope (narrow, frontend-only)
- Explicitly out-of-scope items
- Implementation risk assessment
- Verification checklist

This plan builds on the prior `PATCH_REPORT_DocumentEditing_UIUpdate_20260415.md` and the boxed topology state (`Backend/` + `Frontend/` canonical structure). UI-3 closeout is respected — this patch does not reopen the UI-3 workstream.

---

## 2. FILES INSPECTED (Planning Phase)

### 2.1 Document Surfaces (Frontend)

| File | Purpose | Key Observations |
|------|---------|------------------|
| `Frontend/src/components/documents/AnonymizeModal.tsx` | Anonymization workflow modal | Functional; clipboard handlers were recently hardened (async + try/catch) |
| `Frontend/src/components/documents/RehydrateModal.tsx` | Rehydration workflow modal | Functional; same clipboard pattern applied |
| `Frontend/src/app/cases/[caseId]/documents/page.tsx` | Document ledger with family grouping | Detail panel (right sidebar) has cramped typography per prior audit |
| `Frontend/src/app/cases/[caseId]/generate/GenerationPageContent.tsx` | Template-based document generation | Right sidebar mixes readiness checks and action results; non-fatal useMemo lint warning at line 258 (schema.fields dependency) |
| `Frontend/src/app/cases/[caseId]/review/[documentId]/page.tsx` | Document review with approve/reject workflow | Visual hierarchy issues: dense layout, no workflow status indicator |
| `Frontend/src/app/documents/compare/page.tsx` | Document comparison surface | Currently metadata/lineage comparison only; no text-diff capability |

### 2.2 Backend Document Services

| File | Route | Status |
|------|-------|--------|
| `Backend/src/modules/generation-draft/service.ts` | `POST /api/v1/contracts/generate` | Functional |
| `Backend/src/modules/generation-draft/routes.ts` | Draft generation routes | Functional |
| `Backend/src/modules/anonymize/services.ts` | `POST /api/v1/documents/anonymize` | Functional |
| `Backend/src/modules/contracts/routes.ts` | `POST /api/v1/contracts/:id/revision`, `/finalize` | Functional |

### 2.3 Configuration

| File | Status |
|------|--------|
| `Backend/templates/` | 22 DOCX templates tracked in git |
| `Backend/prisma/schema.prisma` | Contains `CaseCollaborator` model and `Client.color` field unreachable at runtime (per prior audit — deferred to schema-cleanup pass) |
| `Frontend/.dockerignore`, `Backend/.dockerignore` | Docker build hygiene in place |
| `Frontend/Dockerfile`, `Backend/Dockerfile` | Templates included in Backend image (line 45: `COPY templates/ ./templates/`) |

---

## 3. CURRENT DOCUMENT FLOW

```
[Generate] → Template + Variables → Contract Draft
    ↓
[Review] → Approve/Reject/Finalize
    ↓
[Anonymize] → AI task selection → Anonymized text workspace → Submit
    ↓
[Rehydrate] → Import AI response → Restore names → Final document
    ↓
[Compare] → Side-by-side metadata view (NOT text diff)
    ↓
[SharePoint] → Sync document to case folder
```

**Known gaps in the flow**:
1. No inline field editing after generation — must regenerate entire document
2. No text-diff in compare surface — only metadata comparison
3. Review page has no workflow status bar
4. Document ledger detail panel is visually cramped

---

## 4. PAIN POINTS (Prioritized by User Impact)

### 4.1 High Priority

| # | Pain Point | Surface | User Impact |
|---|-----------|---------|-------------|
| P1 | **No text-diff in compare surface** | `/documents/compare/page.tsx` | Users expecting Word-compare-style diff see only metadata panel — disorienting |
| P2 | **No workflow status bar on review page** | `/cases/:id/review/:id/page.tsx` | Users do not know where they are in GENERATED → IN_REVIEW → APPROVED → FINAL state machine |
| P3 | **No guided review helper text** | `/cases/:id/review/:id/page.tsx` | First-time users do not understand approve/reject/finalize actions |

### 4.2 Medium Priority

| # | Pain Point | Surface | User Impact |
|---|-----------|---------|-------------|
| P4 | **Document ledger detail panel cramped** | `/cases/:id/documents/page.tsx` | Notes section has small fonts; action buttons are hard to locate |
| P5 | **No sticky action bar on document ledger** | `/cases/:id/documents/page.tsx` | Key actions (Download, Review, Anonymize) are small hover buttons — easy to miss |
| P6 | **Generation page sidebar confusing for new users** | `GenerationPageContent.tsx` | Not immediately clear what action to take first |

### 4.3 Low Priority / Out of Scope

| # | Pain Point | Status |
|---|-----------|--------|
| L1 | No inline field editing after generation | Out of scope — requires backend generation rework |
| L2 | No document content preview in review page | Out of scope — requires SharePoint download + render |
| L3 | Dashboard external news CORS errors | Separate frontend/external-feed issue |

---

## 5. PROPOSED PATCH SCOPE

### 5.1 Narrow Patch: Review Page + Compare Surface (Frontend Only)

This patch addresses P1, P2, P3 with minimal surface area. No backend changes, no new API routes, no database changes.

#### Change 1: Review Page — Workflow Status Bar + Helper Text
**File**: `Frontend/src/app/cases/[caseId]/review/[documentId]/page.tsx`

Add a horizontal workflow status bar at the top showing:
```
[GENERATED] → [IN_REVIEW] → [APPROVED] → [FINAL]
```
With current document status highlighted. Also add helper text explaining the decision buttons.

#### Change 2: Compare Page — Honest Empty State for Text Diff
**File**: `Frontend/src/app/documents/compare/page.tsx`

Improve the empty state when no text-diff is available. Currently the page says it does metadata comparison only. Add a more helpful message explaining what the compare surface does and that text-diff is a future enhancement.

#### Change 3: Compare Page — Visual Metadata Comparison Improvement
**File**: `Frontend/src/app/documents/compare/page.tsx`

If two documents are selected, show their metadata in a cleaner side-by-side layout rather than stacked panels.

### 5.2 Files to Touch

| # | File | Change Type |
|---|------|-------------|
| 1 | `Frontend/src/app/cases/[caseId]/review/[documentId]/page.tsx` | Add workflow status bar + helper text |
| 2 | `Frontend/src/app/documents/compare/page.tsx` | Improve empty state messaging + metadata layout |

**Total files: 2 frontend files**  
**No backend changes**  
**No new routes, models, or API endpoints**

---

## 6. OUT OF SCOPE

The following are explicitly NOT part of this patch:

| Item | Reason |
|------|--------|
| Backend/generation-draft logic changes | Generation backend is functional; inline field editing requires significant rework |
| SharePoint download/render for in-app preview | Requires SharePoint integration work |
| New API routes | No new endpoints needed for these UI changes |
| Prisma schema changes | Schema-cleanup pass is a separate workstream |
| `CaseCollaborator` model work | Deferred to schema-cleanup pass |
| `Client.color` field work | Deferred to schema-cleanup pass |
| Dashboard external news CORS | Separate issue, non-blocking |
| Anonymization modal changes | Recently hardened; not part of this patch |
| Document ledger detail panel refresh | Medium priority; defer to follow-up patch |
| Sticky action bar on document ledger | Medium priority; defer to follow-up patch |
| UI-3 workstream reopening | UI-3 is closed per explicit instruction |

---

## 7. RISK ASSESSMENT

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Changes to review page break existing review flow | Low | High | Only add new UI elements; do not modify existing decision handlers |
| Compare page changes affect metadata comparison | Low | Medium | Only improve layout; no logic changes to metadata retrieval |
| New status bar conflicts with existing page layout | Medium | Low | Status bar is inserted at top; existing content below is untouched |
| Frontend build introduces new TypeScript errors | Low | Low | Run `npx tsc --noEmit` after changes before commit |

---

## 8. IMPLEMENTATION CHECKLIST (For When Approved)

- [ ] Create new branch: `kilo/document-editing-ui-patch` from `hotfix/runtime-shape-20260308`
- [ ] Inspect `Frontend/src/app/cases/[caseId]/review/[documentId]/page.tsx` for insertion point of workflow status bar
- [ ] Add workflow status bar component (GENERATED → IN_REVIEW → APPROVED → FINAL)
- [ ] Add helper text before decision panel
- [ ] Inspect `Frontend/src/app/documents/compare/page.tsx` empty state
- [ ] Improve empty state messaging (explain metadata comparison only)
- [ ] Improve metadata side-by-side layout
- [ ] Run `cd Frontend && npx tsc --noEmit` — verify no new errors
- [ ] Verify `next build` succeeds
- [ ] Do NOT commit unless explicitly instructed

---

## 9. VERIFICATION CHECKLIST (Manual Runtime)

### Review Page
- [ ] Navigate to `/cases/:id/review/:documentId` with a document in GENERATED status
- [ ] Verify workflow status bar renders at top with GENERATED highlighted
- [ ] Change document status to IN_REVIEW; verify bar updates
- [ ] Verify helper text appears before decision buttons
- [ ] Verify approve/reject/finalize buttons still function

### Compare Page
- [ ] Navigate to `/documents/compare` with no documents selected
- [ ] Verify empty state message is clear and informative
- [ ] Select two documents from different versions
- [ ] Verify metadata comparison renders in side-by-side layout
- [ ] Verify no text-diff is shown (documented limitation)

---

## 10. PRIOR ART REFERENCE

This plan references and builds upon:

- `PATCH_REPORT_DocumentEditing_UIUpdate_20260415.md` — prior audit of document surfaces with proposed workflow status bar and detail panel refresh
- `IMPLEMENTATION_REPORT_CompareLineageDeepening_20260406.md` — compare surface lineage work
- `BOXED_PRODUCT_PHASE*_20260408.md` — boxed topology reports confirming canonical structure

---

## 11. DECISION REQUIRED

Before implementation begins, the following decisions are needed:

1. **Approve narrow scope** (review page + compare surface) or **expand scope** to include document ledger detail panel refresh?
2. **Priority order**: Should compare surface improvements (P1) or review page workflow bar (P2, P3) be tackled first?
3. **Text-diff future**: Should the compare surface be documented as "metadata only, text-diff deferred" or should a basic text-diff be included in this patch scope?

---

## 12. UNCERTAINTIES

- Whether the compare surface currently supports any document type besides contracts (e.g., uploaded documents vs. generated drafts)
- Whether the metadata comparison layout has existing responsive breakpoints that could conflict with a side-by-side improvement
- Whether the review page workflow state machine (`GENERATED → IN_REVIEW → APPROVED → FINAL`) is fully implemented in the backend or if any transitions are non-functional

---

**End of planning document. Implementation not authorized until reviewed and approved.**