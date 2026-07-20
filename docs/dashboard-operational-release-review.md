# Dashboard Operational Release Review

## Dashboard contract

The integrated Dashboard contains one `Műszerfal` page title and preserves the existing quick actions, seven-day Adminiculum deadline calendar, task/deadline/review panels, and communication panel. It does not add a multicolored KPI wall.

## `Itt folytasd`

The backend emits at most one actor-authorized actionable item with a deterministic action code. Supported actions are `START_TASK`, `OPEN_TASK`, `CONTINUE_SUBMISSION`, `OPEN_REVIEW`, `CONTINUE_RETURNED_WORK`, and `RECORD_EXTERNAL_COMPLETION` when their persisted prerequisites hold.

The eligibility filter excludes completed/DONE/cancelled tasks, terminal cases, approved-and-finished work, superseded/cancelled submissions, stale records, unknown actions, `VIEW_COMPLETED`, inaccessible work, and work assigned to another actor. Authenticated QA confirmed the UI showed the draft action `Leadás folytatása` and did not show the synthetic terminal item `Feladat lezárva`.

The required honest empty state remains available when no eligible candidate exists:

- `Nincs félbehagyott vagy azonnali beavatkozást igénylő munkája.`
- `Az új feladatokat és határidőket az alábbi áttekintésekben találja.`

## Operational case groups

Only persisted evidence produces these groups:

1. `Határidő közeleg` — overdue/critical first.
2. `Nálunk van a következő lépés`.
3. `Review alatt`.
4. `Ügyfélre várunk`.
5. `Nincs meghatározott következő lépés`.

`Ellenoldalra várunk`, `Hatóságra várunk`, and `Bíróságra várunk` are not fabricated from free text or communication content. An ordinary persisted description can remain visible as content without being promoted into an unsupported operational group.

## Client color behavior

Operational rows use the same relationship-backed `ClientAccent` as other modules. Status, priority, urgency, waiting-party state, and selection remain separate semantic indicators. A missing color renders neutral.

## Visual and functional QA

- 1366×768 and 1440×900 authenticated sweeps covered Dashboard, Clients, Cases, Tasks, Review, and Communications.
- Dashboard title count: 1.
- Actionable resume item: present and correct.
- Terminal synthetic task: absent.
- Operational open-case count and all five persisted groups: rendered.
- Seven-day calendar and communication panel: preserved.
- No document-level horizontal overflow at either viewport.
- Final clean pass: no console error, CORS error, failed fetch, or visible error state.

Screenshots were retained outside git under `%TEMP%/adminiculum-client-color-dashboard-qa/`; screenshots and synthetic fixtures are not release artifacts.

## Conclusion

The corrected Dashboard contract is ready for production approval only as part of the complete migration/backend/frontend sequence. This document does not authorize execution.

## Visual Hierarchy Follow-up

`codex/dashboard-visual-hierarchy-1` is a frontend-only candidate based on production evidence commit `7ea97cde24ab9ba3b80b806c7822fd42363f38ca`. It reduces action/card uniformity, moves concrete daily work above the weekly preview, bounds the operational list, and compacts empty states without changing this document's accepted backend behavior. Fourteen authenticated local screenshots and clean frontend/backend validation support release integration review. No deployment has occurred from the feature branch.
