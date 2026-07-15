# Document Editor — Toolbar and Chrome Contract

Package: DOCUMENT-EDITOR-WORKBENCH-UX-LAYOUT-OVERHAUL-1

## Workbench header (compact, persistent)

Left: back button ("← Ügy", dirty-confirm on leave), truncated document name
(full name via `title`), metadata line (case reference · client · metadata
version). Right: review-status chip (≥md widths, backend work-item derived),
Mode C badge ("Munkamenet — nincs szerverre mentve" / "Nem mentett — nincs
szerverre mentve"), **Export / Import ▾** menu, and the Vázlat / Panel /
Fókusz toggles (`aria-pressed`). No permanent explanatory paragraphs — long
explanations live in the side panel tabs.

## Export / Import menu (header)

Print/PDF (browser), DOCX export (local file), HTML download, TXT download,
DOCX import (local file, replaces content after confirmation). Every entry is
labeled as a local, non-server operation. Export never clears the dirty state.

## Formatting toolbar

Persistent, `role="toolbar"`, grouped with `role="group"` + Hungarian labels:

| Group | Controls |
| --- | --- |
| Előzmények | undo, redo |
| Bekezdés | paragraph, C1, C2, C3 |
| Karakterformázás | bold, italic, underline |
| Listák és pontok | bullet, decimal, a), (i), indent, outdent |
| Szerkezet | table insert, page break, Jogi blokk ▾, Mező ▾ |
| Eszközök | Keresés, **Továbbiak ▾** |

**Továbbiak ▾** (overflow, low-frequency): strike, blockquote, horizontal
rule, clear formatting, print. **Contextual table row**: +Sor/−Sor/+Oszl/−Oszl
/Fejléc/Egyesít/Tábla törlése appears only while the caret is inside a table —
the deliberate, compact second row; the primary row stays single-line at
1366 px.

## Menu behavior contract

Dropdowns: `aria-haspopup="menu"`, `aria-expanded`, absolute in non-scrolling
chrome at `z-50`, bounded height with internal scroll, Escape closes and
returns focus to the trigger, outside click closes, `role="menu"/menuitem"`.

## Status bar

Word/character/paragraph/clause counts, approximate page count (labeled
approximate), open-comment count, current clause number, truthful dirty/"Nincs
szerverre mentve" state, zoom selector (75/90/100/110/fit-width; `sr-only`
label). No save indicator of any kind exists anywhere in the chrome.
