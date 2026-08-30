# UI recovery decisions

Historical UI is a design reference, never a whole-screen restore. Five listed SHAs are exact and reachable. Two are not resolvable and therefore cannot support an exact recovery decision.

## Case Overview - `fb8c9bb3c05170d50f6eed307112ce8842c6ee54` / PR41

- Current relation: ancestor of canonical; summary-first semantics already evolved into the current Case Workspace.
- Recover UI semantics: case identity first, attention/next action, concise status/responsibility/deadline, active work below summary.
- Do not recover: dense sidebar generations, duplicated case controls, technical workflow identifiers.
- Decision: `KEEP_AS_IS`; use the historical commit as a regression reference, not a replay source.

## Case Intake - `272945079da871f905e8b56c07a1a915cfb7e128`

- Current relation: ancestor of canonical; typed intake still exists. PR98 supplies the compact Work Package flow.
- Recover UI semantics: progressive contextual sections, one primary create action, clear required/optional choices, honest validation.
- Do not recover: six-step wizard, broad field dump, template/version/provenance IDs.
- Decision: `KEEP_AS_IS` for full intake; `MERGE_CURRENT_RECOVERY` for PR98 compact flow.

## Documents - `511c9fbf57a6a0ec7ad11be2082d9c0f1b1893ac` / PR63

- Current relation: ancestor of canonical and still visible in the case Document Workspace.
- Recover UI semantics: case context, explicit version/review/compare/publication actions, trustworthy empty states.
- Do not recover: duplicate routes, hidden object scope, browser-editor-first navigation.
- Decision: `KEEP_AS_IS`; preserve through PR94 and specialist-panel work.

## Contract Workspace - `40c1bf1aecd6a44403152ad9271f3f1929b00623`

- Current relation: ancestor of canonical.
- Recover UI semantics: active-document header, linked work summary, work instruction, technical details behind secondary disclosure, responsive shell.
- Do not recover: browser Word clone, autosave/track-change working copy, editor toolbar as the primary product.
- Decision: `KEEP_AS_IS` with semantic regression checks.

## Communication Inbox - `874933a8fcca4c76b40b0ff5988e3f97302d598e` / PR69

- Current relation: not an ancestor of canonical; current inbox is a different composition.
- Recover UI semantics: triage hierarchy, sender/subject/effective time, safe case/client context, one next action, truthful unread/reply state only when persisted.
- Do not recover: broad action density, client selection as authority, inferred/fake reply state, raw provider IDs.
- Decision: `SEMANTIC_REPLAY` after PR95 and the contextual read-model security rewrite.

## Navigation - `b1d1d82`

- Evidence result: SHA is absent from all fetched refs and GitHub's commit API.
- Current product: the current shell already has the six-item workforce navigation and a top-bar Search action.
- Recover UI semantics: none may be attributed to this unresolved SHA.
- Do not recover: another primary navigation, redirect-only modules, technical admin surfaces at first level.
- Decision: `DO_NOT_RECOVER` from this reference; preserve current navigation.

## Organization Portal - `338eaac`

- Evidence result: SHA is absent from all fetched refs and GitHub's commit API.
- Current product: current Portal V2 already exposes Organization mode, real matters/actions/documents/company data, and customer-safe work summary; PR92 repairs workspace identity selection.
- Recover UI semantics: truthful loading/empty/unavailable/zero distinctions remain mandatory, but cannot be credited to the unresolved SHA.
- Do not recover: synthetic Demo data, fake progress, raw internal IDs, cross-workspace fallback.
- Decision: `KEEP_AS_IS` plus PR92; no historical screen restore.

## Confirmed UI semantic recovery

`UI_RECOVERY_CANDIDATES_CONFIRMED=5`: the five exact reachable candidates are valid regression/semantic references. Of those, only Communication requires active semantic replay; four are already canonical ancestors. The two unresolved SHA references are rejected as exact evidence.

```text
RECOVER_UI_SEMANTICS=summary-first case context; progressive intake; case-aware document hierarchy; active-document context; communication triage and one primary action; truthful state distinctions
DO_NOT_RECOVER_UI_SEMANTICS=whole historical screens; browser Word clone; mock portal; duplicated navigation; technical IDs; fake state/progress/tasks; client-supplied authority; unresolved-SHA claims
```
