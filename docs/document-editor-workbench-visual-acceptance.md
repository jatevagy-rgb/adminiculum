# Document Editor — Workbench Visual Acceptance Matrix

Package: DOCUMENT-EDITOR-WORKBENCH-UX-LAYOUT-OVERHAUL-1

Manual matrix for the layout overhaul (no browser test framework exists and
none was added; structural behavior is locked by the layout guard suite).
Screenshots may be captured locally but are not committed.

## Core scroll architecture

1. ☐ Blank document (`/documents/new/edit`): full-height workbench, no page
   scrollbar, status bar visible.
2. ☐ Imported DOCX document renders after confirmation; scroll starts at top.
3. ☐ ~20-page-equivalent contract: smooth internal scrolling.
4. ☐ ~50-page-equivalent (within limits): still responsive.
5. ☐ Scroll to the middle → **header, toolbar, status bar all remain visible**.
6. ☐ Scroll to the bottom → same; nothing hidden beneath chrome.
7. ☐ Browser page/body does NOT scroll (no page scrollbar while editing).
8. ☐ Wheel over the document scrolls the document viewport only.
9. ☐ Wheel over the side panel scrolls the panel body only.
10. ☐ No nested card scrollbars anywhere in the panel.

## Panels and modes

11. ☐ Comments tab: create → resolve → reopen; document scroll position
    unchanged; dirty state unchanged.
12. ☐ Review tab: status, capabilities-driven actions, Mode C dirty warning.
13. ☐ Sablon tab shows template readiness (no permanent header banner).
14. ☐ Export/Import menu: print, DOCX export/import, HTML, TXT all work; no
    entry claims server saving.
15. ☐ Search (Ctrl+F): count, next/prev, replace; Escape closes.
16. ☐ Outline: navigate, filter, collapse sections, clause actions.
17. ☐ "Vázlat" toggle collapses/reopens the outline; canvas widens.
18. ☐ "Panel" toggle collapses/reopens the side panel.
19. ☐ Fókusz mód hides both rails; "Panelek visszaállítása" and Esc restore
    the previous arrangement; Mode C badge stays visible.
20. ☐ Zoom 75% → no dead scroll space below the page; 110% → bottom content
    reachable; fit-width tracks panel collapse; chrome size unchanged.

## Viewports

21. ☐ 1920×1080: outline + panel open, single-row toolbar.
22. ☐ 1440×900: outline + panel open, usable canvas.
23. ☐ 1366×768: outline defaults collapsed; toolbar single row; no horizontal
    page scroll; status bar visible.
24. ☐ 1280×800: panel collapsible; document remains priority.

## Keyboard and layering

25. ☐ Keyboard-only toolbar use (Tab + Enter), visible focus rings.
26. ☐ Keyboard-only side-panel tab switching.
27. ☐ Escape closes menus (focus returns to trigger) before exiting focus
    mode; menus render above both rails and the canvas.
28. ☐ Table caret shows the contextual table row; leaving the table hides it.

## Regression smokes

29. ☐ Print preview: chrome hidden, A4 layout, page-break honored, no
    workspace band in print.
30. ☐ `/editor-lab` still redirects to `/documents/new/edit`.
31. ☐ `/documents/compare` unchanged.
32. ☐ Other routes (e.g. `/tasks`, `/cases`) still scroll as normal pages
    (footer visible — the fixed-viewport shell applies only to the editor).
33. ☐ `/portal` unchanged parked shell.
34. ☐ Reload with unsaved content: browser warning; after discard, content
    gone; no saved claim anywhere.
