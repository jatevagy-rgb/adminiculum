# Document Editor — Accessibility (Layout Chrome)

Package: DOCUMENT-EDITOR-WORKBENCH-UX-LAYOUT-OVERHAUL-1

## Landmarks and semantics

- `<header>` (workbench header), `role="toolbar"` with `role="group"`
  sub-groups (Hungarian `aria-label`s), two labeled `<aside>` rails
  ("Dokumentum vázlat sáv", "Szerkesztői oldalpanel"), `<footer>` status bar.
- Side-panel tabs: `role="tablist"/tab` + `aria-selected`.
- The Tiptap surface keeps `role="textbox"`, `aria-multiline`, Hungarian
  `aria-label`.

## Controls

- Every toolbar/header control has a Hungarian `aria-label`/`title`; toggles
  expose `aria-pressed`; menus expose `aria-haspopup="menu"` +
  `aria-expanded`; disabled states are real `disabled` attributes.
- No icon-only unlabeled controls (glyph buttons carry full labels).
- The status-bar zoom `<select>` has an `sr-only` label + `aria-label`.

## Keyboard

- Tab reaches header → toolbar → rails → status bar; `focus-visible` outlines
  on all chrome controls (`[data-editor-chrome] :focus-visible`).
- Ctrl+B/I/U, Ctrl+Z/Y (Tiptap), Ctrl+F opens search.
- Escape: closes an open menu (focus returns to its trigger) → closes the
  search bar → exits focus mode; the layered order is enforced by
  stopPropagation in the inner handlers.
- Toolbar commands keep editor focus (`chain().focus()`); menu close restores
  trigger focus; native dialogs restore focus per browser behavior.
- No keyboard trap: rails and menus are normal DOM order; focus mode leaves
  header/toolbar/status bar reachable.

## Announcements and contrast

- Notices render with `role="status"` (polite); state badges are text, not
  color-only. Chrome text ≥10.5px with the palette's dark-on-light pairs;
  active states use the high-contrast dark-green fill with ivory text.
- Text resize: chrome uses wrap-tolerant flex rows; the canvas is zoomable
  independently of browser text scaling.

No ARIA roles were added merely to satisfy static checks; the layout guards
assert only structural semantics that the UI genuinely implements.
