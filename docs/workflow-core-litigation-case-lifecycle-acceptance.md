# Workflow Core Litigation & Case Lifecycle — Acceptance

`WORKFLOW-CORE-LITIGATION-CASE-LIFECYCLE-1`

Backend behavior is covered by automated tests (`tests/caseLifecycle.test.ts`,
`tests/litigationDossier.test.ts`,
`tests/litigationCaseLifecycleStaticGuards.test.ts`). The frontend has no test
framework, so UI items below are verified via TypeScript, production build, and
manual smoke (this document).

## Functional checklist

- [x] Current case lifecycle status is visible (`GET /cases/:id/lifecycle`,
      Litigation Workspace + Case Detail).
- [x] Closure blockers are truthful and operational (derived from tasks,
      deadlines, reviews, handoff, responsible lawyer).
- [x] Unsupported lifecycle states are hidden — no `CLOSING` state is offered
      (`availability.closingState = false`, `canStartClosing = false`).
- [x] The litigation dossier is understandable (evidence, pleadings, procedural
      dates sections).
- [x] Issues / evidence / pleadings are distinguishable, and unavailable areas
      (issues, evidence relations, filing status, parties) are shown truthfully
      rather than as decorative empty panels.
- [x] Document content remains hidden (metadata only; no `workspaceText`, no raw
      text — asserted by tests).
- [x] Backend capabilities control which actions are offered.
- [x] Review actions integrate with the existing Tasks surface
      (`canCreateReviewTask`).
- [x] Procedural dates integrate with Agenda (canonical engine reused).
- [x] Case Center recomputes after a lifecycle transition (content-minimized
      `CASE_STATUS_CHANGED` timeline event; existing next-action engine).
- [x] Case Activity remains content-minimal.
- [x] No legal-truth claims; readiness wording is operational only.
- [x] No AI; no n8n; no external filing (static guards).
- [x] No Client Portal regression (no `/portal` code touched; guards).

## HTTP status matrix (verified by tests)

| Scenario | Status |
|---|---|
| Unauthenticated lifecycle/dossier request | `401` |
| Manager guard rejects non-manager on close/reopen/archive | `403` |
| Unknown/inaccessible case | `404` |
| Close blocked by operational blockers | `409 CLOSURE_BLOCKED` (+ `blockers`) |
| Invalid lifecycle transition (e.g., reopen an active case) | `409 INVALID_LIFECYCLE_TRANSITION` |
| Ready close / valid reopen / valid archive | `200` |

## Manual UI smoke (common laptop width)

- [ ] `/litigation-workspace` renders lifecycle header + dossier sections; empty
      dossier shows truthful “unavailable” copy, not blank cards.
- [ ] Case Detail shows the compact litigation/lifecycle summary and a link to the
      workspace.
- [ ] Active case, closed case, blocked closure (blockers listed), successful
      closure, and reopened case each render correctly.
- [ ] Keyboard focus order and visible focus are preserved on new controls.
- [ ] Stale-state close returns `409` and the UI surfaces the blockers/conflict.
- [ ] `/portal` unchanged (regression smoke only).

## Out of scope (deferred — schema change required)

Structured issues/claims/allegations, evidence items & relations with
supporting/contradicting classification, pleading filing status/supersede,
hearing typing, opposing party, court/authority reference, legal significance,
burden of proof, dedicated `CLOSING`/`closedAt`/`archivedAt` schema.
