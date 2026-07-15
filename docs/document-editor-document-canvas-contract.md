# Document Editor — Document Canvas Contract

Package: DOCUMENT-EDITOR-WORKBENCH-UX-LAYOUT-OVERHAUL-1

## Viewport

- `.editor-canvas-scroll` is the single document scroll container:
  `overflow-auto`, fills remaining workbench height (`flex-1 min-w-0` inside a
  `min-h-0 overflow-hidden` body), `scrollbar-gutter: stable`,
  `overscroll-behavior: contain`, `data-editor-viewport` marker.
- Outline clicks, search navigation and clause operations scroll THIS
  container (ProseMirror `scrollIntoView`); comments/review/template panel
  activity never resets document scroll (the editor instance is never
  remounted by panel state).
- DOCX import replaces content (and thus scroll) only after the explicit
  user confirmation.

## Paper

- A4 surface: 794 px wide, `min-height` 1123 px, 72 px (~19 mm visual)
  padding, hairline border + layered shadow on a darker calm workspace
  (`#E7E3D4`), centered with side gutters.
- Serif legal typography (Georgia/Times), 15 px / 1.65 line height —
  roughly 80–95 characters per line at 100% zoom; headings hierarchy, clause
  hanging numbers, tables fit the page width (`table-layout: fixed`), long
  words wrap (`overflow-wrap`), selection and caret remain clearly visible.
- The paper node itself never scrolls and never carries a scrollbar.

## Zoom

CSS `zoom` property on the page node (layout-affecting — scrollHeight always
matches the visual size; `transform: scale` is forbidden and guarded).
Levels: 75/90/100/110% and fit-width (derived from live container width,
clamped 0.5–1.6). Chrome and print are unaffected by editor zoom.

## Multi-page representation (honest)

Continuous canvas with explicit `pageBreak` nodes. On screen a page break is a
full-bleed workspace-colored band with inset shading and an "Oldaltörés"
label — visually separating paper sections without a fragile DOM-splitting
pagination engine. In print it is a real `page-break-after: always` and the
band styling is removed. Page counts remain explicitly approximate.
