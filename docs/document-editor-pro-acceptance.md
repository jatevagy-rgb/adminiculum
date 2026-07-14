# Document Editor Pro — Manual Acceptance Matrix

Package: DOCUMENT-EDITOR-PRO-CONTRACT-WORKBENCH-1

No frontend test framework exists (and none may be added), so frontend
acceptance relies on TypeScript + production build + the pure-function unit
suites + this manual matrix. Scenarios marked ☐ are for the human operator;
static/logic-backed items note their automated coverage.

## Scenarios

1. ☐ **New blank contract** — open `/documents/new/edit`; empty A4 canvas,
   session status "Munkamenet — nincs szerverre mentve", no Mentés button.
2. ☐ **Existing document context** — open `/documents/<id>/edit` for an
   accessible document; header shows name/case/client; content starts blank
   (metadata context only — no server content route exists; the status panel
   explains this).
3. ☐ **Inaccessible/missing document** — safe error panel, no case-existence
   disclosure.
4. ☐ **Ten-page agreement** — paste/compose ~10 pages; typing, zoom and
   outline stay responsive.
5. ☐ **20+ page agreement** — still usable; approximate page count updates.
6. ☐ **Clause insertion between 4.2 and 4.3** — outline ⋯ → "Beszúrás utána"
   on 4.2 → new clause becomes 4.3, old 4.3 renumbers to 4.4 automatically.
   (Renumbering logic unit-tested.)
7. ☐ **Move clause 7 under clause 5** — "Szint le" on 7 after moving below 5
   → becomes 5.x; all following clauses renumber. (Unit-tested.)
8. ☐ **Promote/demote subclause** — level guards reject >3 levels and orphan
   jumps with a visible notice. (Unit-tested.)
9. ☐ **Word paste with lists and table** — formatting/lists/table survive;
   fonts/colors/classes/scripts do not. (Sanitizer unit-tested with Word
   fixtures.)
10. ☐ **Insert party block** — labeled table with manual token fields.
11. ☐ **Insert definition block** — ordered definitions with bold terms.
12. ☐ **Insert signature block (2 fél)** — side-by-side signature lines; no
    signature images, no e-signature.
13. ☐ **Insert unresolved field** — `party.name` chip renders `{{ … }}`;
    Változók tab counts it as unresolved.
14. ☐ **Resolve safe case/client field** — with document context,
    `client.displayName` resolves in panel and exports; conversion to static
    text asks for confirmation. (Token logic unit-tested.)
15. ☐ **Search and replace** — Ctrl+F; live count, next/prev, case-sensitive,
    whole-word, replace, replace-all with confirmation.
16. ☐ **Add and edit table** — insert 3×3, add/remove row/column, header
    toggle, merge/split; 60×12 limits enforced by validator.
17. ☐ **Insert page break** — labeled dashed marker on canvas; real page
    break in print preview.
18. — **Save success**: not applicable (mode C; no save path — verified by
    static guard instead).
19. — **Save failure**: not applicable (no save attempt exists).
20. — **Stale-version 409**: not applicable in mode C (documented for the
    future persistence mode).
21. ☐ **Submit review** — Review tab → create review task → task appears in
    Tasks/Workbench; "Review-ra küldés" when capability allows.
22. ☐ **Approve/return** — approve/return buttons appear only with
    server-derived capability; transition refreshes the panel.
23. ☐ **Open compare** — "Verziók összehasonlítása (redline)" deep-links to
    `/documents/compare` with case+document preselected.
24. ☐ **Print/PDF** — chrome hidden, A4 margins, clause numbers preserved,
    page-break honored; browser PDF output labeled truthfully.
25. — **DOCX export**: intentionally absent (no converter) — verify no DOCX
    button exists and the Export tab explains the blocker.
26. ☐ **Reload in export-only mode** — with unsaved content, reload triggers
    the browser warning; after discard, content is gone and the UI never
    claimed it was saved.
27. ☐ **Keyboard-only navigation** — toolbar/panels reachable by Tab; visible
    focus rings; Ctrl+B/I/U, Ctrl+Z/Y, Ctrl+F work; Escape closes search.
28. ☐ **Common laptop width (~1366px)** — outline + canvas usable; side panel
    hidden below xl breakpoint by design; no horizontal body scroll.
29. ☐ **Focus mode** — hides both panels; canvas centered; toggle restores.
30. ☐ **`/portal` regression smoke** — unchanged parked shell (no editor
    coupling; enforced by static guard).

## Automated coverage summary

Backend 43 suites / 468 tests, including: clause numbering & operations (15),
schema validation (13), Word-paste sanitizer (9), field tokens / presets /
HTML export / stats (12), editor static safety (11).

## DOCUMENT-EDITOR-PERSISTENCE-VERSIONING-READINESS-1 update

This document is superseded/qualified by `docs/document-editor-persistence-versioning-readiness-1.md` for server persistence questions. The professional editor remains **Mode C — export-only working session**: no server save, no autosave, no real editor-content versions, no restore, no document-level comments, no `workspaceText`, no unrelated-field storage, no AI, and no n8n. The backend now exposes only a metadata/capability endpoint and a strict future `TIPTAP_JSON` validator.
