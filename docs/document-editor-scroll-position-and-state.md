# Document Editor — Scroll Position and State Stability

Package: DOCUMENT-EDITOR-WORKBENCH-UX-LAYOUT-OVERHAUL-1

## Editor instance stability

The Tiptap editor is created once per route mount (`useEditor` with a stable
extension set) and is **never destroyed or recreated** by: side-panel tab
changes, panel/outline collapse, focus mode, zoom, comment create/resolve/
reopen, review-task refresh, template-capability refresh, metadata refresh,
notices, or window resize. Layout toggles unmount only the rails around the
viewport; the `EditorContent` node stays mounted, so document scroll position
and the unsaved content survive every chrome interaction.

## Preserved-position matrix

| Action | Document scroll | Dirty state |
| --- | --- | --- |
| Comment create/resolve/reopen | preserved | unchanged (guarded) |
| Review task create/transition/refresh | preserved | unchanged |
| Side-panel tab change / collapse / reopen | preserved | unchanged |
| Outline collapse / reopen | preserved | unchanged |
| Focus mode enter/exit | preserved | unchanged |
| Zoom change | position kept at the same content offset (CSS zoom re-lays out; small visual drift possible and accepted) | unchanged |
| Toolbar command | ProseMirror keeps selection in view | becomes dirty (content change) |
| Local export (print/DOCX/HTML/TXT) | preserved | **unchanged — export never clears dirty** |
| DOCX import (confirmed) | reset to top (explicit content replacement) | dirty |

## State inventory (all session memory)

`layout` (outline/side-panel/focus + restore flags), `zoom`/`fitWidth`,
selected side-panel tab, search state, comment draft. None of it is persisted
to browser storage or the server (statically guarded); reload truthfully
discards it along with unsaved content — after the browser's unsaved-changes
warning.

## React-key hygiene

No conditional `key` on the editor subtree; rails render conditionally as
siblings of the viewport; menus/portals live in the chrome. Outline and stats
recompute memoized on document JSON only.
