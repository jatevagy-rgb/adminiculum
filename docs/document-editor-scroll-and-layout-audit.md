# Document Editor — Scroll and Layout Audit

Package: DOCUMENT-EDITOR-WORKBENCH-UX-LAYOUT-OVERHAUL-1
Date: 2026-07-14 · Baseline HEAD: `b923f33` · Branch: `hotfix/runtime-shape-20260308`

## Exact root cause of the disappearing controls (traced, not guessed)

The workbench component itself was already a flex column with an internal
`overflow-auto` document viewport — but its **height chain never bound to the
viewport**:

1. `AppShell` root: `min-h-screen flex …` — a *minimum* height, so the shell
   grows with content instead of being fixed to the viewport.
2. `<main>`: `flex-1 overflow-y-auto p-4 lg:p-5` — because the shell root can
   grow, `flex-1` receives no definite height, so `overflow-y-auto` never
   clips anything.
3. Editor wrapper `<div class="h-full min-h-0">` — `h-full` against an
   auto-height parent resolves to `auto`.
4. Workbench root `flex h-full min-h-0 flex-col` — with `h-full = auto`, the
   workbench grew to its full content height; its internal
   `overflow-auto` viewport also grew and never scrolled.

Result: **the page/body was the real scroll surface.** The workbench header,
formatting toolbar and status bar were ordinary flow children of that page, so
scrolling a long document scrolled them out of view — exactly the screenshot
defect. The right side panel (with its own `overflow-y-auto` body but an
unbounded rail height) produced the awkward independent/nested scrolling.

Aggravating factors added by intervening packages: a permanently large
"Sablonból munkapéldány" banner section, notice rows, and header-inline DOCX
buttons increased the fixed chrome height above the canvas.

## Audit table

| Element | Current height model | Current overflow | Current position | Intended role | Defect | Corrected behavior |
| --- | --- | --- | --- | --- | --- | --- |
| `body` | auto | default (page scroll) | static | app canvas | became the document scroll surface on the editor route | unchanged globally; on the editor route the shell is viewport-bound so body never scrolls |
| Root layout (`app/layout.tsx`) | auto | default | static | Next root | none itself | unchanged |
| `AppShell` root | `min-h-screen` (growable) | visible | static | app frame | allowed the shell to exceed the viewport | `fullViewport` mode: `h-dvh min-h-0 overflow-hidden` (editor route only) |
| Shell content column | `flex-1 flex flex-col` | visible | static | column for topbar/main/footer | no `min-h-0` → children couldn't shrink | `min-h-0` added |
| `<main>` | `flex-1` | `overflow-y-auto` | static | page scroller for normal routes | unconstrained → never clipped; padding boxed the editor | `fullViewport` mode: `overflow-hidden p-0 min-h-0`; normal routes unchanged |
| App footer | fixed content height | — | static | brand footer | consumed workbench height | hidden in `fullViewport` mode (the workbench status bar takes the role) |
| Editor route container | `h-full min-h-0` | — | static | hand height to workbench | `h-full` of auto = auto | now receives a real bound from the fixed shell |
| Workbench root | `flex h-full min-h-0 flex-col` | visible | static | full-height workbench | grew with content | + `overflow-hidden`; now truly viewport-bound |
| Workbench header | content height | visible | flow | persistent identity/actions | scrolled away with the page; oversized (DOCX buttons, long badge) | compact single row in non-scrolling chrome; import/export in a menu |
| Toolbar | content height | visible | flow | persistent formatting | scrolled away with the page | stays in non-scrolling chrome; overflow menu ("Továbbiak"); contextual table row |
| Template banner section | content height | visible | flow | template readiness info | permanently large explanatory block | removed from chrome → side panel "Sablon" tab |
| Workbench body | `flex min-h-0 flex-1` | visible | flow | rail/canvas/rail row | rails/canvas grew with content | + `overflow-hidden`; children clip properly |
| Outline rail | `w-60` | none on rail | flow (`hidden lg:block`) | navigation | breakpoint-only visibility, no toggle | state-driven (`workbenchLayout`), collapsible, internal `overflow-y-auto` |
| Document viewport (`.editor-canvas-scroll`) | `flex-1 min-w-0` | `overflow-auto` | flow | THE document scroll surface | never actually scrolled (parent chain unbounded) | now the primary scroll region; `scrollbar-gutter: stable`; `overscroll-behavior: contain` |
| A4 page | fixed 794px, `min-height` | visible | flow | paper surface | `transform: scale()` broke scrollHeight at ≠100% zoom (unreachable bottom at 110%, dead space at 75%) | CSS `zoom` (layout-affecting) + border/deeper shadow |
| Side panel rail | `w-72`, `hidden xl:block` | none on rail | flow | support panel | breakpoint-only, narrow, unbounded height | 340 px, state-driven collapse, rail clips, body scrolls |
| Side panel body | `min-h-0 flex-1` | `overflow-y-auto` | flow | tab content scroller | correct locally, broken by parent chain | unchanged; now actually bounded |
| Status bar | content height | visible | flow | counts/zoom/state | scrolled away | non-scrolling chrome; zoom moved here; comment/review/dirty state added |
| Dialogs | — | — | native (`window.confirm`, file picker) | confirmations | none (native, always on top) | unchanged |
| Toolbar dropdowns | `max-h-80` | `overflow-y-auto` | absolute in chrome (z-30) | menus | fine, but raised | z-50, Escape closes, focus returns to trigger, outside-click closes |

## Why sticky positioning alone would not have fixed it

`position: sticky` on the toolbar would have stuck it to the nearest scrolling
ancestor — the page — while the side panel, status bar and outline still
behaved as parts of one long page. The correction is the scroll architecture:
one viewport-bound frame, one document scroll region, independent rail
scrolling. This is what was implemented.
