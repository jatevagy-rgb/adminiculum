# WF01 case and document workspace checkpoint

This is a composition checkpoint for the grouped Word requirements W04–W06/W10/W12. It does not close the product requirement without live user acceptance.

## Startup and scope

- SETUP_EVIDENCE=AGENT_VERIFIED_CHECKOUT. The setup manifest was not supplied or claimed.
- Directory: `C:\Users\drHUBAYGyulaMáté\Projects\Adminiculum-workflow-lanes\wf01-dashboard`
- Branch: `astra/word-workflow-dashboard`
- START_HEAD: `e8ccff8882eea6052a4e6aafa42b105fb84137bc`; clean at startup.
- PR base: `fix/ui-foundation-typecheck-repair`. No floating-base replacement.

## Mounted behavior

`/cases/[caseId]` still enters through `CaseDetail` and `CaseWorkspaceOverview`. The overview retains its canonical workspace/responsibility/task projections, error handling and action handlers. It now presents a compact heading, four operational counters, a persisted deadline/countdown, three context sections, active assignments/deadlines, full-width communication, existing risk/document preparation, all documents, prompt results, secondary tools, and visible note threads/activity last. The former document-count and “Kijelölve” tiles were removed from the primary metrics; the complete document surface and next-step information remain.

`/cases/[caseId]/documents` mounts `WordDocumentWorkspaceHeader` before the existing workspace modes. Its identity comes from the existing resolved case, uploaded document and `canonicalActiveVersion`; the inner reader, rail and URL identity algorithms are unchanged. The header requires explicit task selection, reads server workflow permissions, and calls the existing submission draft/attachment APIs with an explicit immutable version ID. It never replaces an already attached different version, submits for review automatically, or publishes. It then opens the existing `TaskSubmissionWorkspace`, where attention, reviewer, time and review confirmation remain authoritative. “Meglévő leadás / review” also preserves access for read-only workflows.

The adjacent closure check reads the existing lifecycle projection and only enables a non-forced close when both server permission and readiness permit it. The mutation still goes through the existing lifecycle API. This is not proof that the separate closure repair is integrated, deployed or live accepted.

## Requirement status

| Behavior from W04–W06/W10/W12 | Status | Limit |
| --- | --- | --- |
| Heading, real work assignments/review counts, saved due timestamp/countdown | BUILT_AND_MOUNTED | Uses existing server projections, not new workload semantics |
| Current state, subject, goal | BUILT_AND_MOUNTED | Goal uses recorded client expectation; missing content is explicit |
| Communication, risk/document preparation, documents, AI results/prompts, notes and activity ordering | BUILT_AND_MOUNTED | Existing leaves preserved; expanded WF03/04/05 behavior awaits supplied contracts |
| Document return action and top Leadás with explicit task/exact version | BUILT_AND_MOUNTED | Generated contracts without immutable uploaded-document versions cannot use this attachment entry |
| Same canonical context tile IDs/content references on both screens | BUILT_AND_MOUNTED | Fixed canonical sections only, not user-selected placements |
| Named colored custom text tiles; saved add/edit/remove; personal reorder and placement | PERSISTENCE_GAP | No unsaved editor, browser-storage substitute, or fabricated save |
| Keyboard/drag reorder, cancel, failed-save recovery, customization save/reload | PERSISTENCE_GAP | No durable customization interface yet |
| New WF03 document flow, WF04 editable risk/prompt leaves, WF05 unified timeline/disclosure | NOT_STARTED in this host | Exact downstream commits/contracts have not been supplied |
| Product/live acceptance | NOT_STARTED | No production tests, merge or deployment |

## Persistence evidence and smallest additive proposal

The narrow check covered `Backend/prisma/schema.prisma`, the case workspace projection and intake routes/services. `Case` has separately stored intake context, `description`, notes and an assignment JSON field; `UserAutomationPreference` is automation-specific; `SystemSetting` is a global key/value store. None provides a supported case-content plus per-user layout contract. The existing `CaseInsightTiles` registry derives presentation from canonical records; it does not persist custom tiles or arrangements. Notes, assignment data, prompt drafts and global settings should not be repurposed as confidential custom-layout storage.

Propose two additive models, subject to separate approval:

1. `CaseWorkspaceTile`: stable ID, case ID, title, text, semantic kind, tone, content reference where applicable, author/updater and revision/timestamps. Shared content follows case read/write permissions.
2. `CaseWorkspaceLayout`: unique case ID + user ID, revision and an ordered list of tile IDs/placements (overview/document), containing presentation metadata only. A user can change only their own arrangement. Built-in tile references retain their current stable IDs; changing arrangement does not copy shared content.

Case-scoped APIs must validate references, permitted tones/kinds, size limits, case access and optimistic revision checks. Save content and layout atomically when required; reject conflicts without discarding the client draft. Removing a custom tile must not delete source documents, tasks, notes or timeline records. No schema, migration, API mount or settings change is included here.

## Follow-on host wiring manifest

Sole host owner remains WF01. No speculative imports are present.

- WF03: supply exact commit, module export and supported props. Mount in `CaseWorkspaceOverview` at the current `DocumentPreparationDashboard`/document-flow position, retaining existing upload, anonymization, restore, version, comment and delete access until equivalence is verified.
- WF04 communication: mount at `ck-comms`; risk: at the preparation/risk block after communication; prompt tools: at `ck-prompts`. Existing communication route, risk preparation and AI result handlers remain until the replacement contract is verified.
- WF05: mount within the final `aria-label="Ügytörténet"` section. Preserve `ck-notes-primary`, `ck-activity`, note/reply actions and historical deep links.
- Outer document mount: `Frontend/src/app/cases/[caseId]/documents/page.tsx`, immediately before `canonical-top-region`. Canonical tiles are read-only projections from the same workspace API. Durable selection/placement must be wired after the persistence contract exists.
- Compatible future presentation props may be `{caseId, clientId, readOnly?, onChanged?}`; this does not grant server permissions.
- No new backend registration is required for this checkpoint. Shared API, barrels, navigation, route mounts, Prisma, inner reader/review, WorkflowDialog, WF02 actions and report/invoice code were not edited.
- After exact downstream commits/contracts arrive, use one small follow-on host-wiring commit and rerun route/identity regressions. No downstream feature is declared end-to-end complete here.

## Regression inventory and execution

Focused coverage includes note visibility/replies/refresh, case handoff and time entry, ordinary/active document visibility, document preparation/risk/error states, AI results, case/document identity, version URL navigation, request races, reader range/boundary/anchor positioning, new canonical tile derivation/countdown and exact-version submission permissions/conflicts/failures.

The final focused run passed all 189 tests (19 suites, zero failures/skips), exit 0. Source ordering checks now require canonical context before work and visible notes after the closed details section. The document visibility guard requires the complete document list and canonical activity reasons instead of the removed redundant KPI; rendering and badge assertions remain intact.

Frontend typecheck passed (exit 0), including a final `--noEmit --incremental false` run. UI anti-drift guard passed (exit 0): zero new violations, 3657 pre-existing baseline entries unchanged. No production build was started (`NOT_RUN`, reserved for the integration runner). `npm ci --no-audit --no-fund` installed the existing lockfile locally, exit 0; no dependency manifest/lockfile changes or shared node_modules writes. The available Node runtime is 24.19.0 while package engines request Node 20; integration must verify its supported runtime.

`tests/wordWorkflowBrowserRunner.mjs` runs a loopback-only Next dev server and synthetic Chrome tests with a 300-second bound and cleanup of only its own process tree. Browser artifacts/logs are under ignored `Frontend/test-results/wf01/`. This evidence is distinct from source guards, DOM tests and live acceptance. Consult the final delivery report for the actual browser outcome and commit/remote/PR identities.


## Browser evidence and remaining visual boundary

The final browser checks passed on the actual case and document routes at 390/768/1440 with synthetic API fixtures (exit 0): no page overflow, long titles, missing context, shared canonical tile IDs, no default task selection, historical immutable-version attachment, reload retaining that version, read-only submission permissions, keyboard opening/focus return, and a server-blocked closure. Evidence class: ROUTE_VERIFIED_WITH_MOCK_API. Custom-tile reorder/save/cancel checks are NOT_RUN because their persistence capability is absent.

The new context/header surfaces use the existing white card token. Existing inner-reader paper/theme styling remains visible and is outside this outer-composition checkpoint; the broader no-beige-reader requirement is not claimed complete. Real closure success against the separately repaired backend and production data remain unverified. LIVE_ACCEPTED is pending.
