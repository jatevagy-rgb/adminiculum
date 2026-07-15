# Document Editor — Side Panel Contract

Package: DOCUMENT-EDITOR-WORKBENCH-UX-LAYOUT-OVERHAUL-1

## Structure

One coherent tabbed support panel (340 px; documented band 280–440 px),
collapsible from the header ("Panel" toggle), state in session memory only.
The rail clips (`overflow-hidden`); the tablist stays visible; exactly one
scrolling body (`overflow-y-auto`) — no nested scrollable cards.

## Tabs

| Tab | Content | Counts |
| --- | --- | --- |
| Állapot | Mode C session explanation, document metadata context, honest unavailable-features list | — |
| Változók | field browser, occurrences with resolved/unresolved state, confirmed static conversion | unresolved count in label |
| Review | task-backed review with server-derived capabilities, Mode C dirty warning, compare link | linked-task count |
| Megjegyz. | document-level comments (create/resolve/reopen, plain text, bounded), "Dokumentumszintű megjegyzések" labeling | open-comment count |
| Sablon | template-readiness state (relocated from the removed header banner): capability/branch status, inactive catalog button, local DOCX import | — |
| Export | print/PDF, DOCX (local), HTML, TXT + honest fidelity note (stale "DOCX unavailable" copy corrected) | — |

## Rules

- Errors stay inside their tab with retry; a comments/review/template failure
  never breaks the editor or resets document scroll.
- Panel interactions never change the editor dirty state and never remount
  the editor instance.
- Compact empty states and warnings; the Mode C warning appears once per
  relevant surface, not repeated in stacked cards.
- No persistence of tab/collapse state beyond the session (no browser
  storage — statically guarded).
- Selected tab is preserved while the panel stays mounted; collapsing the
  panel and reopening it resets to the default tab (documented session
  behavior).
