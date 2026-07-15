# Authenticated Visual QA and Editor Scroll Fix 1

## Authentication method used

- Local backend and frontend were run in development mode on `localhost:3001` and `localhost:3000`.
- Authentication used the existing repository-supported localhost development login flow in `AuthenticatedApp`: the frontend showed an authenticated shell for `dr. HUBAY Gyula Máté` with `Kilépés`.
- No production auth bypass was added, no secrets were printed, and no environment files were changed or committed.

## Editor defect reproduced

- The previously reported defect was tested on `/documents/new/edit` with a long local working draft at `1366×768` and `1440×900`.
- The defect did **not** reproduce on current `92d280e`.
- Browser/page scrolling stayed stationary while the central editor viewport scrolled.

## Computed root cause

- Current code already contains the route-scoped viewport-bound shell introduced by the editor layout overhaul.
- The active height chain is:
  - application shell: `h-dvh min-h-0 overflow-hidden`;
  - editor route main: `min-h-0 overflow-hidden`;
  - workbench root: `h-full min-h-0 overflow-hidden`;
  - document viewport: `overflow-auto`;
  - side panel shell: `overflow-hidden`;
  - status bar outside the document scroll viewport.
- Because this chain is now intact, no additional editor scroll fix was required.

## Fix

- No code fix was required.
- Documentation-only evidence was added for this authenticated visual QA pass.

## Editor top/middle/bottom verification

At `1366×768`:

| Position | Browser scroll | Document viewport scroll | Header | Toolbar | Status bar | Right panel |
|---|---:|---:|---|---|---|---|
| Top | `window.scrollY = 0` | `scrollTop = 0` | visible | visible | visible | visible |
| Middle | `window.scrollY = 0` | `scrollTop = 3600` | visible | visible | visible | visible |
| Bottom | `window.scrollY = 0` | `scrollTop = 4808` | visible | visible | visible | visible |

At `1440×900`:

- Browser scroll stayed `0`.
- Document viewport height increased to roughly `731px`.
- Header, formatting toolbar, status bar, and right panel remained visible.
- The document viewport reached the bottom.

Screenshots were captured locally under:

- `C:\Users\hubay\AppData\Local\Temp\adminiculum-auth-visual-qa\editor-1366-top.png`
- `C:\Users\hubay\AppData\Local\Temp\adminiculum-auth-visual-qa\editor-1366-middle.png`
- `C:\Users\hubay\AppData\Local\Temp\adminiculum-auth-visual-qa\editor-1366-bottom.png`

## Munkaórák verification

- `/time-entries` opened in the authenticated shell at `1366×768`.
- First viewport shows `Munkaórák`, `Munkaóra rögzítése`, `Bejegyzések`, and `Kimutatás`.
- `Bejegyzések` remains the default operational tab.
- The first viewport prioritizes time-entry recording and the empty entries state; the report builder is secondary.
- No prototype/developer copy was visible in the inspected first viewport.

Screenshot:

- `C:\Users\hubay\AppData\Local\Temp\adminiculum-auth-visual-qa\time-entries-1366-first-viewport.png`

## Határidők verification

- `/deadlines` opened in the authenticated shell at `1366×768`.
- First viewport uses available width with compact urgency counters and action controls.
- Empty/error copy is concise: it does not show backend/source-of-truth implementation language.
- TEAM controls were not visible in the tested state.

Screenshot:

- `C:\Users\hubay\AppData\Local\Temp\adminiculum-auth-visual-qa\deadlines-1366-first-viewport.png`

## Záradéktár verification

- `/clause-library` was first tested with the local backend's current clause-library flag state, which returned real clause rows.
- To verify the required unavailable-state behavior, the local backend was restarted with `ENABLE_CLAUSE_LIBRARY=false`.
- In that authenticated flag-off state, `/clause-library` rendered one concise unavailable state:
  - no fake search;
  - no disabled filter matrix;
  - no empty details rail;
  - no `foundation`, `későbbi patch`, or product-function explanation copy;
  - no hardcoded substantive clauses.

Screenshot:

- `C:\Users\hubay\AppData\Local\Temp\adminiculum-auth-visual-qa\clause-library-1366-unavailable-flag-off.png`

## Remaining visual issues

- No editor scroll/chrome defect remained in the tested local authenticated session.
- `/clause-library` depends on the backend feature flag state: when `ENABLE_CLAUSE_LIBRARY=true`, it shows the real catalog; when off, it shows the concise unavailable state required by the operational-page cleanup acceptance.
- Browser console emitted unrelated in-app browser telemetry network errors from the Codex browser runtime; these did not originate from Adminiculum application code.

## Validation

- Backend/frontend validation is recorded in the final task report.
- No schema, migration, database, Azure, OpenAPI/CORS, package, Client Portal, AI, n8n, Outlook/Graph, editor persistence, or `workspaceText` change was made.
