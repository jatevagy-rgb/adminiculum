# Document Editor Pro — Review and Compare Integration

Package: DOCUMENT-EDITOR-PRO-CONTRACT-WORKBENCH-1

## Task-backed review (reused, not reinvented)

The editor's Review panel uses the existing, ungated task-backed review
workflow:

- **List**: `GET /cases/:caseId/work-items`, filtered to `type === 'TASK'`
  with `source.type === 'DOCUMENT'` and `source.id === documentId`. Work items
  carry **backend-derived capabilities** — the frontend never infers reviewer
  authority.
- **Create**: "Review-feladat létrehozása" → `POST /documents/:id/tasks`
  (`kind: REVIEW`) — the constrained source-linked task boundary with its
  payload allow-list.
- **Transitions**: Elkezdés → `POST /tasks/:id/start`; Review-ra küldés →
  `POST /tasks/:id/submit`; Jóváhagyás → `POST /tasks/:id/complete`
  (approved); Visszaküldés javításra → `POST /tasks/:id/complete` (rejected).
  Buttons render only when the corresponding work-item capability is true.
- **After a transition** the panel refreshes the work items; the same contract
  feeds Case Workbench, global Tasks, Case Center and Case Activity, so those
  surfaces stay consistent without duplicated logic.

Approval is **internal workflow approval** — the panel says so explicitly. It
is not an electronic signature, not filing, not sending to the client, not
external publication, and not proof of legal validity.

## Compare (the truthful redline)

Live track changes is **not** implemented (no change-operation model exists;
a cosmetic toggle would be dishonest). The supported redline mechanism is the
existing compare workflow:

- the editor links to
  `/documents/compare?caseId=…&documentId=…` labeled
  **"Verziók összehasonlítása (redline)"**;
- the compare page's embedded review-suggestion workspace (persisted
  `DocumentReviewSuggestion` records with `CONTRACT_WORKSPACE` /
  `LITIGATION_WORKSPACE` sources) remains the anchored-suggestion surface and
  was intentionally left unchanged by this package.

## Comments

`Comment` has a Prisma model but **no backend routes**; the editor therefore
shows comments as unavailable (no fake anchored comments, no positions stored
in metadata, no selected text stored in comment bodies). Adding document
comments requires new routes; anchored comments additionally require schema
support — both documented as future work.

## DOCUMENT-EDITOR-PERSISTENCE-VERSIONING-READINESS-1 update

This document is superseded/qualified by `docs/document-editor-persistence-versioning-readiness-1.md` for server persistence questions. The professional editor remains **Mode C — export-only working session**: no server save, no autosave, no real editor-content versions, no restore, no document-level comments, no `workspaceText`, no unrelated-field storage, no AI, and no n8n. The backend now exposes only a metadata/capability endpoint and a strict future `TIPTAP_JSON` validator.
