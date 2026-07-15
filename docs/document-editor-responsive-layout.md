# Document Editor — Responsive Layout

Package: DOCUMENT-EDITOR-WORKBENCH-UX-LAYOUT-OVERHAUL-1

Defaults come from `defaultWorkbenchLayout(viewportWidth)` (pure, unit-tested)
applied once at mount; the user can toggle any rail afterwards (session
memory).

| Viewport | Outline (240px) | Side panel (340px) | Toolbar | Canvas at 100% |
| --- | --- | --- | --- | --- |
| 1920×1080 | open | open | full single row | 794px + generous gutters |
| 1440×900 | open | open | full single row | 794px usable |
| 1366×768 | **collapsed by default** | open | single row (overflow menu holds low-frequency actions; table row contextual) | 794px usable |
| 1280×800 | collapsed by default | open (collapsible) | single row | 794px fits with panel |
| <1280 | collapsed | **collapsed by default** | wraps deliberately | document prioritized; fit-width zoom recommended |

Rules:

- no page-level horizontal scrolling at any listed width — the canvas
  viewport scrolls horizontally only if a fixed zoom exceeds available space;
- both rails fully open are possible at any width, but the defaults prevent
  an unusably narrow document on common laptops;
- status bar hides secondary counts (`characters`, `paragraphs`) on narrow
  widths; review chip hides below `md`;
- a full phone editing experience is intentionally not attempted: below
  desktop widths the layout stays functional (rails collapsed, wrap-tolerant
  chrome) but is not a supported editing target — this is a documented,
  truthful limitation rather than a broken pretend-mobile UI.
