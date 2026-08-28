# 12 — Regressed Capabilities Report

> Capabilities that demonstrably worked or were more complete BEFORE, and are now absent/degraded/unreachable, and were NOT removed as an intentional frozen-product decision. Non-accusatory reconstruction. Confidence `PROVEN`/`STRONGLY_INDICATED`.

| CAPABILITY | OLD WORKING EVIDENCE | CURRENT REGRESSION | WHEN LOST | LIKELY CAUSAL CHANGE | RECOVERY PATH |
|---|---|---|---|---|---|
| Case→work-package on modern creation | `createCaseWorkPackageSnapshot` wired in legacy `createCase` (`services.ts:525`) | Missing on `createCaseIntake`, communication create-case, portal conversion | WP consolidation (`9eec7bf`) | work-package snapshot added only to the legacy path; newer create paths were built without calling it | Call `createCaseWorkPackageSnapshot(tx,…)` from the other 3 creation paths (PROVEN gap) |
| Internal intake → portal visibility | CP1 portal-intake conversion yields grant+publication | Internal intake/communication cases create zero portal artifacts | CP1 split | internal create paths never wired grant/publication | Add a "publish to portal" step (schema/permission work) |
| DOCX/PDF text-diff | extraction engine present (`textExtractor.ts` mammoth/pdf-parse, used by anonymize) | Comparison resolver gates DOCX/PDF as `FORMAT_NOT_TEXT_EXTRACTABLE` | GEN-3 comparison? no, engine exists but not wired | comparison `versionText.ts` only classifies TXT/MD/CSV/JSON/XML | Route resolver through `textExtractor.ts` — **no backend build** (PROVEN) |
| Version-history presentation | DocumentVersion backend complete; docs page receives `versions` prop | Editor version-history UI stripped; not surfaced from docs page | editor hardening (`DOCUMENT-EDITOR-PRO-*`) | guards removed autosave/track-changes in the editor; version presentation lost | Re-surface version list/get/promote from the case documents page (PROVEN backend intact) |
| Direct grant→browse portal ease | Gen-1/2: admin grants → user immediately browses | Now 3 gates (identity → workspace membership approval → case grant) | identity generation (`9809c4c`…`35ca0e6`) | security-hardened multi-gate membership flow | Intentional; ease-regression only, not feature loss. Optionally add an "approve + grant in one step" admin action |
| Intake typed deadlines → agenda | `CaseIntakeDeadline` typed | `Case.deadline` not mirror-set → `agenda` (reads `Case.deadline`) may miss intake deadlines | intake redesign | typed deadline model split from the single-deadline agenda model | Mirror/merge intake deadlines to the deadline/agenda surface (STRONGLY_INDICATED) |
| Communication→responsible | other paths set `assignedLawyerId` | communication `create-case` leaves responsible null | comm create-case build | assigned lawyer not wired into the comm path | Set `assignedLawyerId` in comm `create-case` (PROVEN) |
| Case status → SharePoint folder move | V1 workflow engine moved SP folders on status change | DAG engine superseded; no SP folder move | DAG takeover | V1 de-prioritized | Re-evaluate if SP-folder organization still desired (READ_COMPATIBILITY_ONLY) |

## Non-regressions (intentional, correctly superseded — do NOT treat as lost)

- Browser-editor save/autosave/track-changes removal — **intentional** (Word-primary rule), do NOT restore.
- V2 `cases/workflow.ts` state machine — dead code, semantics re-expressed in DAG engine, do NOT restore.
- Mock portal generation (`mockPortalData`) — never merged, violates product-truthfulness, do NOT restore.
