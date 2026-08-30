# UI connectivity audit

## Broken or uncertain links

1. **Case creation → Work Package:** modern compact UI is on PR98, not audited canonical; `CONNECTED_CODE_ONLY` until merged and accepted.
2. **Document compare → text extraction:** comparison UI exists, but DOCX/PDF support is a recovery-line capability; `BACKEND_NOT_SURFACED` for the audited release.
3. **Outlook status → live Graph:** status reflects gate/configuration, not a successful provider call; `LIVE_UNPROVEN`.
4. **Search/classification → navigation:** backend/API evidence exists; a strong current user action path was not established; `BACKEND_NOT_SURFACED`.
5. **Handoff package → primary case workflow:** route/service exists, but primary navigation and case workspace integration are weak; `NAVIGATION_ORPHANED`.
6. **Clause library → case workflow:** route/API exists, but contextual entry and standalone surface are not coherent across generations; `PARTIALLY_CONNECTED`.
7. **Intake deadline → agenda:** fields/services exist; mapping contract is not exhaustively proven; `CONNECTED_CODE_ONLY`.
8. **Internal intake → portal publication:** portal publication is real, but automatic grant conversion for internally created matters is not established; `ROUTE_ORPHANED` at the product-flow edge.
9. **Task → time:** both surfaces are real but the universal contextual link is not proven; `PARTIALLY_CONNECTED`.

## UI principles applied

Prefer semantic replay of contextual labels, case/client context, one primary action, truthful loading/empty/unavailable states, and no technical IDs. Do not resurrect entire historical screens.
