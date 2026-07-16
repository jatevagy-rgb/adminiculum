# Operational UX Simplification 1

## Scope

This branch simplifies the authenticated internal legal workbench without deployment, schema changes, migrations, Azure changes, package changes, Client Portal work, AI expansion, or external integrations.

Base: `origin/release/editor-ops-workflow-1` at `e447168`

Branch: `codex/operational-ux-simplification-1`

Worktree: `C:\Users\hubay\Documents\Adminiculum-operational-ux`

## Screenshot-Derived Problems

- Operational pages began below large explanatory blocks and duplicate navigation.
- Dashboard, case detail, communications, litigation, and handoff mixed several jobs in parallel.
- Empty states preserved large multi-column layouts.
- Case identity and matter navigation repeated across headers, cards, and side rails.
- The editor repeated local/export-only explanations and placed document work too low.
- Raw backend failures were visible on case agenda, case workflow summary, and document text requests.
- Technical enum values such as `CLIENT_INPUT`, `TODO`, and event identifiers appeared in user-facing areas.

## Final Information Architecture

Global navigation remains compact:

- Napi munka: Műszerfal, Feladatok, Kommunikáció, Review sor
- Ügyek és dokumentumok: Ügyek, Záradéktár, Ügyfelek, Verzió-összevetés
- Iroda: Munkaórák, Határidők, Beállítások

Matter navigation is canonical:

- Áttekintés
- Dokumentumok
- Feladatok
- Kommunikáció
- Határidők
- Munkaórák

Specialist document and litigation workspaces remain contextual entry points instead of additional global navigation.

## Consolidated Components

- `OperationalPageHeader`: compact title, count, context, and primary/secondary actions.
- `CompactState`: contracted loading and empty states.
- `SafePanelError`: panel-level safe failure with optional retry.
- `QuietLink`: visually secondary navigation.
- `CaseWorkspaceNav`: one matter identity header and one tab set.
- `CaseCenterOverview`: focused matter overview with next action, active work, documents, deadline/communication, and recent events.
- `DashboardFocused`: operational daily workbench replacing the multi-panel dashboard composition.

## Route Changes

### Dashboard

- Prioritizes one real task, deadline, or active matter.
- Preserves a simplified four-card semantic summary grid for active matters, tasks, deadlines, and review.
- Uses a compact daily queue, deadline panel, review panel, and optional communication signal.
- News and recent document activity are collapsed below operational work.
- Deleted document events cannot become the primary action.
- Technical activity identifiers are mapped to readable labels.

### Tasks

- Removes the explanatory launcher and duplicate quick-navigation areas.
- Moves count, filters, search, and creation action above a compact task table.
- Keeps selected task context in a conditional drawer instead of a permanent rail.
- Preserves real workflow actions and server-provided capabilities.

### Cases

- Moves filters and at least five rows into the first 1366×768 viewport.
- Uses one row action.
- Aligns the active count with the same non-closed status rule used by the active filter.
- Maps `CLIENT_INPUT` to `Ügyféltől érkezett`.

### Case Center

- Replaces the long dashboard-like overview with one next-step panel.
- Shows up to five active work items and recent documents.
- Keeps deadline and communication summaries compact.
- Limits recent events to five metadata-safe entries.
- Moves management detail into a collapsed section.

### Case Documents And Activity

- Uses a compact document rail and one selected-document work area.
- Automatically selects the first real document when no deep link is supplied.
- Hides empty generated/modified categories.
- Keeps delete secondary and preserves confirmation and authorization behavior.
- Collapses timeline and supporting management panels.

### Case Communications

- Uses the canonical matter header.
- Replaces the sparse multi-rail layout with communication list/compose and selected detail.
- Does not reserve a permanent follow-up rail without a selected communication.

### Document Review And Editor

- Keeps one compact sticky editor chrome.
- Moves the document canvas higher.
- Uses the document canvas as the scrolling owner while window scroll stays fixed.
- Shows the export-only warning once:
  `A munkapéldány helyi szerkesztésű; a végleges dokumentumot exportálni kell.`
- Removes repeated track-changes and future-backend explanations.
- Keeps review, comments, templates, variables, and export in contextual tabs.

### Litigation Workspace

- Uses a compact three-step control: Ellenfél irata, Válaszpontok, Beadvány.
- Shows one dominant working step at a time.
- Removes the separate dossier rail and methodology essay.
- Maps document type and folder values to readable Hungarian labels.
- Keeps one concise export warning.

### Handoff Package

- Uses centered, bounded content instead of an empty half-page shell.
- Keeps package state, prerequisite, save action, and direct document/review navigation together.

### Deadlines

- Aligns scope and status filters with the title.
- Keeps time buckets compact.
- Uses a small zero-result state directly below the filters.

### Time Entries

- Keeps entry recording primary and reports secondary.
- Keeps case context, filters, summary, and empty action within the first viewport.

### Clause Library

- Preserves real loaded clause data when available.
- Uses one short unavailable explanation and one return action when gated.
- Removes future/foundation copy and competing unavailable-state actions.

## Removed Or Downgraded UI

- Six-card dashboard KPI dock reduced to four compact operational cards; quick-open duplication and competing news prominence removed.
- Tasks and cases launcher essays and duplicate navigation.
- Repeated case context and long permanent case side rail.
- Multiple empty communication columns.
- Low-information document activity cards.
- Editor mode philosophy, repeated local-state warnings, and future-backend copy.
- Litigation methodology explanations and simultaneously expanded steps.
- Handoff empty split layout.
- Oversized deadline and time-entry empty containers.

## Runtime Errors Found

Authenticated local QA reproduced three production-compatible contract failures:

1. `GET /api/v1/agenda?scope=CASE...` returned `500` because task-status values were used in a `CaseStatus` filter.
2. `GET /api/v1/cases/:caseId/workflow-summary` returned `500` because the query selected the production-absent `Communication.direction` column.
3. `GET /api/v1/documents/:id/text` returned `500` because a full Prisma document projection selected a production-absent field.

The gated contract-generation list also produced expected `501` noise on case/document routes.

## Runtime Error Resolution

- Agenda now uses persisted closed case statuses only: `FINAL`, `CANCELLED`, `ARCHIVED`.
- Workflow summary omits `Communication.direction` from the DB select and returns `direction: null`.
- Document text uses an explicit scalar projection containing only production-compatible fields.
- Contract list callers check the ungated editor capability endpoint before requesting the gated generation list.
- Regression tests cover all three compatibility corrections.
- Secondary frontend failures still use compact safe states; errors are not globally swallowed.

## Preserved Features

- Task start/submit/approve/return/block behavior.
- Case creation, responsibility, collaborators, and workplan behavior.
- Document upload, download, delete confirmation, review navigation, and SharePoint behavior.
- Communication compose and follow-up behavior.
- Litigation local drafting and export behavior.
- Editor review/comments/template/field/export controls.
- Handoff package persistence and review queue entry.
- Existing auth and authorization boundaries.

## Deferred Issues

- Frontend has no `test` package script; no package change was made to invent one.
- Existing npm audit findings remain: frontend 4 moderate; backend 1 critical, 7 high, 9 moderate, 2 low. Dependency remediation requires a separate package-review ticket.
- The known `ClientHouseStylePanel.tsx` `<img>` build warning remains unrelated.
- Existing workspace-root inference warnings remain unchanged.
- Local document source contained no visible extracted body text in the selected editor record; editor layout and scrolling were still exercised without creating fake content.

## Safety

- No deployment.
- No production or Azure access.
- No schema or migration change.
- No database migration or DB push.
- No package or lockfile change.
- No OpenAPI, CORS, auth, Client Portal, AI/n8n, Outlook/Graph, or feature-flag change.
- Authenticated QA used the established local database and local development auth only.

## Independent Review Addendum

An isolated independent review continued from the product-owner-approved source follow-up `84774be`, which retained the simplified four-card dashboard grid. Review corrections were committed as `01949dc`.

Corrections made during review:

- dashboard case count now uses the API pagination total;
- unavailable dashboard sources no longer display false zero values;
- unexpected contract capability errors are no longer hidden as a disabled empty list;
- case matter/status values use Hungarian display labels;
- remaining technical copy and `HU_ONLY` display values were removed from target surfaces;
- focused static tests were strengthened.

Final independent evidence:

- 45/45 authenticated route/viewport checks returned `200`;
- 42/42 backend suites and 422/422 tests passed;
- extracted frontend artifact built, passed the production env guard, and passed 15/15 route smoke;
- extracted backend artifact built and passed health/auth boundary smoke;
- all protected-area zero-diff gates remained zero.

Independent decision:

`GO_FOR_OPERATIONAL_UX_RELEASE_APPROVAL`

This does not authorize deployment.
