# Document Editor — Workbench Layout Contract

Package: DOCUMENT-EDITOR-WORKBENCH-UX-LAYOUT-OVERHAUL-1

Binding structural rules for the editor route (guarded by
`Backend/tests/documentEditorWorkbenchLayoutGuards.test.ts`):

1. **Viewport binding** — the editor route renders inside the `fullViewport`
   shell mode: `AppShell` root `h-dvh min-h-0 overflow-hidden`, `<main>`
   `overflow-hidden p-0 min-h-0`, app footer hidden. Only the editor route
   passes `fullViewport`; the default shell is untouched for all other routes.
   No global `body { overflow: hidden }`.
2. **Height chain** — every flex ancestor between the shell and the scroll
   regions carries `min-h-0`; the workbench root is
   `flex h-full min-h-0 flex-col overflow-hidden`.
3. **One document scroll region** — `.editor-canvas-scroll`
   (`data-editor-viewport`) is the only vertical scroll surface for the
   document (`overflow-auto`, `scrollbar-gutter: stable`,
   `overscroll-behavior: contain`). The A4 page node never has its own
   scrollbar.
4. **Independent rail scrolling** — the outline body and the side-panel body
   scroll with `overflow-y-auto` inside clipped (`overflow-hidden`) rails;
   rail headers/tabs stay visible.
5. **Persistent chrome** — workbench header, toolbar, conditional notice rows
   and status bar live OUTSIDE the scroll regions (`data-editor-chrome`) and
   remain visible at any document position.
6. **Menus above panels** — toolbar/header dropdowns render at `z-50` inside
   the non-scrolling chrome (no clipping inside scroll containers); native
   dialogs (confirm/file picker) are used for confirmations.
7. **Layout state is session memory** — `lib/editor/workbenchLayout.ts`; no
   localStorage/sessionStorage/IndexedDB, no server persistence.
8. **Zoom affects layout truthfully** — the canvas uses the CSS `zoom`
   property (never `transform: scale`) so the viewport's scrollHeight always
   matches the visual size; chrome never zooms.
9. **Print isolation** — `@media print` hides all chrome and prints the page
   alone; explicit page-break nodes are real page breaks.
10. **No second editor route** — `/editor-lab` stays a redirect.
