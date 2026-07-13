# Intake & Matter Opening — Acceptance (WORKFLOW-CORE-INTAKE-MATTER-OPENING-1)

Automated coverage: `Backend/tests/intakeReadiness.test.ts`, `intakeQueue.test.ts`,
`clientLookup.test.ts`, `openingTasks.test.ts`, `intakeMatterOpeningStaticGuards.test.ts`
(38 suites / 408 backend tests total). Frontend: TypeScript + production build + clean-env
`verify:prod-env` (no frontend test framework exists — manual checklist below).

## Manual acceptance checklist

Backend/API behavior (covered by automated tests, spot-check via UI):

- [ ] Empty intake queue renders a truthful empty state at `/intake`.
- [ ] Queue summary counts (total / ready / blocked / missing lawyer) match the listed items.
- [ ] TEAM scope is offered only to ADMIN/PARTNER; others get MY_INTAKES/MY_CASES only.
- [ ] Client search under 2 characters is rejected client-side and server-side (400).
- [ ] A similar-name candidate shows the amber „Hasonló név — emberi ellenőrzés szükséges" badge
      and is never labeled a confirmed duplicate.
- [ ] Creating a client that collides on a unique field surfaces the 409 without any merge.
- [ ] New-matter wizard: „Tovább" is disabled until the client step (selection or new-client name)
      and the matter step (description + client role) are complete.
- [ ] Conflict step shows the unavailable notice — no checkbox, nothing submittable.
- [ ] Review step lists exactly what will be created and names the unavailable items.
- [ ] Submission reports per-step results; a failed later step leaves earlier results visible
      (documented non-atomic sequence).
- [ ] Created case appears in the intake queue in `CLIENT_INPUT` with correct readiness.
- [ ] Opening tasks appear in Case Workbench, global Tasks, and (with due date) Agenda.
- [ ] Re-submitting the same opening-task codes reports them as skipped, not duplicated.
- [ ] Initial deadline appears on Case Detail and in Agenda via the canonical deadline engine.
- [ ] Case Detail intake panel: blocked case shows blockers + no activate button
      (`canActivateMatter=false`); ready case shows „Ügy aktiválása".
- [ ] Activation moves the case to `DRAFT`; the panel collapses to the opening summary; Case
      Center next action recomputes.
- [ ] Stale-state 409: activating an already-activated case (second tab) shows the error without
      corrupting state.
- [ ] Decline moves the case to `CANCELLED`; it disappears from the intake queue and active work
      queues; nothing is deleted.
- [ ] Case Activity shows content-minimized entries for activation/decline (no client data).
- [ ] Dashboard intake panel appears only when intake work exists; links go to `/intake`.
- [ ] No legal/compliance-certification wording anywhere (operational wording only).
- [ ] Common laptop width (~1366×768): queue, wizard, and Case Detail panel lay out without
      horizontal scrolling.
- [ ] Keyboard: wizard inputs, selects, checkboxes and buttons are reachable in order; Enter in
      the search field triggers lookup.
- [ ] `/portal` unchanged (regression smoke only).

## Explicitly out of scope (truthfully unavailable in UI)

Conflict-review recording, engagement state, parties/opposing parties, identity verification
status, prospective-client state, client merge, decline reason codes.
