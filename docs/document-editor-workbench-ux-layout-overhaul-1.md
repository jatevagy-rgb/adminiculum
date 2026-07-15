# Document Editor Workbench UX and Layout Overhaul 1

Package: DOCUMENT-EDITOR-WORKBENCH-UX-LAYOUT-OVERHAUL-1
Date: 2026-07-14 · Baseline HEAD: `b923f33` · Branch: `hotfix/runtime-shape-20260308`

## Purpose

Convert the professional editor from a long scrolling page into a true
viewport-bound workbench: persistent header/toolbar/status bar, an internally
scrolling document viewport, independently scrolling support rails, calmer
chrome, and laptop-friendly responsive defaults — with every existing editor
capability and the Mode C truth preserved.

## Screenshot-observed defects

At the top of a document everything was visible; after scrolling, the document
title, mode controls and the entire formatting toolbar disappeared, the
browser page itself scrolled, the right panel scrolled awkwardly on its own,
and the canvas visually detached from the editor chrome — formatting required
scrolling back to the top.

## Repository findings / Root cause

Traced (not guessed) in `docs/document-editor-scroll-and-layout-audit.md`:
the `AppShell` root uses `min-h-screen`, so `<main>`'s `flex-1
overflow-y-auto` never received a definite height, the editor wrapper's
`h-full` resolved to `auto`, and the workbench grew to content height — **the
page/body was the real scroll surface** and all workbench chrome scrolled away
with it. Intervening packages had also added a permanently large template
banner and header-inline DOCX buttons, inflating the top chrome.

## Workbench architecture

```
AppShell (fullViewport: h-dvh · overflow-hidden · footer hidden)
└── <main> (overflow-hidden, p-0)
    └── DocumentEditorWorkbench (h-full · min-h-0 · flex-col · overflow-hidden)
        ├── Workbench header  (compact: identity · Mode C badge · review chip ·
        │                      Export/Import menu · Vázlat/Panel/Fókusz toggles)
        ├── Formatting toolbar (persistent; overflow menu; contextual table row)
        ├── Search bar / notices (conditional, thin)
        ├── Workbench body (flex · min-h-0 · overflow-hidden)
        │   ├── Outline rail (240px, collapsible, own scroll)
        │   ├── Document viewport (overflow-auto — THE document scroll)
        │   │   └── A4 page (794px, CSS zoom, no own scrollbar)
        │   └── Side panel (340px, collapsible, tabbed, body scrolls)
        └── Status bar (counts · comments · dirty truth · zoom)
```

## Viewport and scroll model

- The editor route opts into the new `fullViewport` shell mode
  (`AuthenticatedApp`/`AppShell` prop): shell root `h-dvh min-h-0
  overflow-hidden`, `<main>` `overflow-hidden p-0`, app footer hidden. No
  `body { overflow: hidden }` global — every other route keeps the historical
  page-scrolling shell (`min-h-screen` + `overflow-y-auto` untouched).
- `min-height: 0` is propagated through the flex chain (shell column,
  workbench root, workbench body).
- Only the document viewport scrolls vertically during editing; the outline
  and side-panel bodies scroll independently only when their content exceeds
  their rail; wheel-over-panel scrolls the panel; `overscroll-behavior:
  contain` and `scrollbar-gutter: stable` keep it deliberate.

## Header

Compact single row: back button, truncated document name (full name in
tooltip), reference/client/version metadata line, review-status chip, the Mode
C badge ("Munkamenet — nincs szerverre mentve" / dirty variant), an
**Export / Import** menu (print/PDF, DOCX export, HTML, TXT, DOCX import — all
labeled as local, non-server operations), and Vázlat / Panel / Fókusz toggles.
The permanently large template banner was removed from the chrome (moved to
the side panel "Sablon" tab); the loading and error states keep stable
full-height layout.

## Toolbar

Persistent below the header inside the non-scrolling chrome, `role="toolbar"`,
grouped: history · paragraph/headings · inline formatting · lists+legal lists
· structure (table, page break, Jogi blokk ▾, Mező ▾) · utilities (Keresés,
**Továbbiak ▾** with strike, blockquote, horizontal rule, clear formatting,
print). Table editing appears as a deliberate compact contextual second row
only while the caret is inside a table, so the primary row fits 1366 px.
Menus render at z-50 above all panels, close on Escape and outside click, and
return focus to their trigger.

## Document viewport and A4 canvas

Dedicated `overflow-auto` container (`data-editor-viewport`); the paper never
carries a scrollbar. Zoom switched from `transform: scale()` to the
layout-affecting CSS `zoom` property, fixing unreachable content at 110% and
dead space at 75%. The page received a hairline border and a deeper two-layer
shadow against a slightly darker workspace background (`#E7E3D4`), preserving
the serif legal typography, margins and selection visibility.

## Multi-page visual model

Explicit `pageBreak` nodes now render as a full-bleed workspace-colored band
with inset shadows — a visible gap between paper sections — while remaining a
real `page-break-after: always` in print. No fake automatic pagination; the
page count stays labeled approximate.

## Outline and side panel

Both rails are state-driven (session memory only, `workbenchLayout.ts`), with
responsive defaults: ≥1440 both open; 1280–1439 outline collapsed; <1280 both
collapsed. The side panel widened from 288 to 340 px (inside the documented
280–440 band) and gained a **Sablon** tab (relocated template-readiness
content) plus counts on the Review/Megjegyzések tabs; its stale "DOCX export
unavailable" copy in the Export tab was corrected and a DOCX export button
added there. One panel body scrolls — no nested card scrollbars.

## Comments and review UX

Unchanged contracts: document-level comments (create/resolve/reopen, bounded
plain text, "Dokumentumszintű megjegyzések", no anchoring claims) and
task-backed review with server-derived capabilities and the Mode C dirty
warning. Panel refreshes never touch the editor instance, so document scroll
and dirty state are preserved.

## Status bar

Compact persistent bar: word/character/paragraph/clause counts, approximate
page count (labeled), open-comment count, current clause number, the truthful
"Nincs szerverre mentve" state (dirty variant emphasized), and the zoom
selector (75/90/100/110/fit-width) relocated from the header.

## Focus mode

"Fókusz mód" hides both rails and remembers their state; the button becomes
"Panelek visszaállítása" and Escape exits (search and menus consume their own
Escape first). Header, toolbar, status bar and the Mode C indicator remain —
exit and export are always available. Application side navigation is left
visible (hiding it safely would require shell-wide changes out of scope).

## Zoom

Chrome never zooms; only the canvas does. Fit-width derives from the live
viewport width via ResizeObserver with 0.5–1.6 clamping; state is session
memory; print is unaffected (print CSS resets zoom-independent layout).

## Responsive behavior

1920/1440: everything open. 1366: outline defaults collapsed, single-row
toolbar, canvas + 340 px panel usable. 1280: outline collapsed by default,
panel collapsible. Below ~1280 both rails default collapsed; the document
remains the priority. No page-level horizontal scroll is introduced.

## Accessibility

`role="toolbar"`, grouped `role="group"` controls, Hungarian aria-labels and
tooltips everywhere, `aria-pressed` on toggles, `aria-haspopup/aria-expanded`
on menus, Escape/focus-return menu behavior, `focus-visible` outlines in all
chrome, side-panel tabs with `role="tab"/aria-selected`, `sr-only` label for
the status-bar zoom control, landmark `aside` labels for both rails.

## Performance

The Tiptap editor instance is created once and never remounted by panel/tab/
zoom/focus changes (layout toggles unmount only the rails); outline/stats stay
memoized on document JSON; the single ResizeObserver watches the viewport
container; no DOM measurement per keystroke; no new observers.

## Error recovery

Metadata load failure renders a stable full-height error panel; comments,
review, and template failures stay inside their tabs with retry paths; export
validation errors surface as a thin notice without layout jumps.

## Mode C compliance

Unchanged and re-asserted: no server save, no autosave, no editor-content
versions, no restore, no browser durable storage (the layout state is React
memory only), no workspaceText, no anchored-comment claims, "Munkamenet —
nincs szerverre mentve" in the header + status bar, dirty warnings before
unload/review, DOCX import/export remain local browser operations.

## Privacy and security

No new network calls, no content in logs, no new persistence, no direct
Graph/SharePoint access, no `dangerouslySetInnerHTML`. Static guards extended
(`documentEditorWorkbenchLayoutGuards.test.ts`).

## AI and n8n compliance

No AI, no n8n — this is a frontend layout/UX package; guards unchanged plus
the new layout guard suite scans the touched surfaces.

## Validation

- Backend: `prisma validate` ✓, `tsc --noEmit` ✓, **52 suites / 544 tests** ✓
  (from 50/515; +`editorWorkbenchLayoutState` 24 tests, +layout guards; one
  intervening template-assembly assertion updated to the banner's new side-
  panel home — same intent, not weakened).
- Frontend: `tsc --noEmit` ✓, production build ✓, clean production-env
  verification with `https://prod-env-verify.invalid` ✓.

## Explicit statements

Root cause: unbounded shell height chain (`min-h-screen` → unconstrained
`flex-1` main → `h-full`=auto) made the page the scroll surface. Now the
editor route is viewport-bound and scroll is internal. No schema change; no
migration; no manual DB query; no deployment; no editor persistence; no fake
autosave; no fake track changes; no anchored comments; no Client Portal
change; no AI; no n8n; no package changes.

## Remaining editor UX work

1. Optional drag-resize for the side panel (clean architecture permitting).
2. Hiding the application sidebar in focus mode (needs a shell-level decision).
3. Overlay/drawer outline for sub-1280 widths.
4. Real pagination/page numbers remain deferred with the persistence decision.
