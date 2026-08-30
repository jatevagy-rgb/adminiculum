# Deep evidence pass — continuation of PR99

This document records the second pass after draft PR99 creation. It changes
documentation only. Evidence is from exact Git objects, authoritative PR
metadata, source trees, tests, workflows, and isolated historical frontend
builds.

## Authoritative PR census

The named recovery overlay is now authoritatively classified from GitHub PR
metadata and exact heads. Open/draft status is not inferred from branch names
or commits.

| PR | exact head | state | capability | lineage / dependency | remaining truth |
|---|---|---|---|---|---|
| 92 | `971d08883aa00317ebe743299079cc1cd23baba4` | open draft | portal identity and workspace resolution | portal recovery chain; canonical descendant | live portal acceptance unproven |
| 93 | `a851f9e04021049bd3df8a6c6fb231d07b2b752b` | open draft | provider-neutral scanner adapter | security/upload line | external scanner not provisioned |
| 94 | `957d23569e317bfdf07453f0437249d6bf860284` | open draft | DOCX/PDF extraction into comparison | document comparison recovery | live storage/runtime unproven |
| 95 | `146539d7116ca90b5ce6086cffe6467ececb6ebe` | open draft | Outlook inbound workbench and communication case creation | canonical sync merge `e908d49`; PR95 rereview | body metadata stale; Graph live acceptance unproven |
| 96 | `f417adae020f27bedc26f12c40ca9e0486a3d2e5` | open draft | operational Work Package runtime | current canonical; PR98 is stacked on it | merge order and live acceptance remain open |
| 97 | `116f0c868c4f07df2a1a436dd6cd3e31001ca357` | open draft | ClamAV HTTP service | PR93 contract | provisioning/network/live acceptance unproven |
| 98 | `eceaf33235cb0f880fbb07dac46e7b03839e2eaf` | open draft | Case → Case Type → Work Package productization | stacked on PR96 | must not be counted as canonical |
| 99 | `1e3c756ebd186ddfd2efe1c7f4615e7a65d30f1f` | open draft | this recovery atlas | docs-only | intentionally incomplete |

PR91 remains `ARCHAEOLOGY_V1_INPUT`; its old canonical claim is not reused.

## Roadmap reconciliation

PR91's `MR-001` through `MR-090` register was crosschecked against the
current release tree, current remote refs, exact named PR metadata, and source
evidence. The rows are all mapped, but a mapped row is not automatically
current, connected, or live.

| row outcome | count | meaning |
|---|---:|---|
| evidenced implementation somewhere | 87 | canonical, merged, branch-only, historical, backend-only, or placeholder evidence |
| no exact implementation evidenced | 3 | persisted communication unread/reply state, outgoing mail, case-level reviewer assignment |
| current canonical and connected enough for product use | 19 | route/component plus API/route/service evidence; excludes branch-only recovery |
| partial, backend-only, navigation-orphaned, or recovery-only | 52 | at least one material link is missing or non-canonical |
| live accepted with direct runtime evidence | 0 | no production acceptance evidence was found |

The 90-row reconciliation is recorded in `33_ROADMAP_90_ROW_RECONCILIATION.md`;
the three non-built rows are not presented as greenfield work if a related but
different capability exists.

## Historical UI runtime pass

Builds were attempted in disposable detached worktrees with the repository's
existing frontend dependencies and no production endpoint or credential.

| milestone / surface | SHA | result | evidence |
|---|---|---|---|
| Dashboard / case center | `e73c1c2` | `NOT_BUILDABLE` | TypeScript error: historical `CommunicationsPageContent` passed `helperText` not present in `CaseWorkspaceNavProps` |
| Case overview / workspace | `fb8c9bb` | `BUILDABLE` | `next build` exit 0 |
| New Case intake workspace | `2729450` | `BUILDABLE` | `next build` exit 0 |
| Document workspace entry points | `511c9fb` | `BUILDABLE` | `next build` exit 0 |
| Communication inbox | `874933a` | `BUILDABLE` | `next build` exit 0 |
| Work Package compact creation | `c8809c1` | `BUILDABLE` | `next build` exit 0 |
| Tasks / Leadás workspace | `4cbe4ee` | `BUILDABLE` | `next build` exit 0 |
| Portal organization home | `338eaac` | `BUILDABLE` | `next build` exit 0 |
| canonical release frontend | `c0ec1df` | `BUILDABLE` | `next build` exit 0 |

No screenshots were captured: no milestone was run with a safe fixture-backed
browser session, so `HISTORICAL_UI_RUNTIME_SCREENSHOTS=UNPROVEN`.

## Deletion archaeology

`git log --all --diff-filter=D -- Backend/src Frontend/src` found six deleted
source-path instances across five deletion commits:

| deleted path | disposition | reason |
|---|---|---|
| `Frontend/src/lib/mockData.ts` | `SECURITY_UNSAFE_DO_NOT_RECOVER` | pre-corpus/demo leakage risk; later deletion explicitly blocks fake product state |
| `Backend/src/modules/client-workspace/companyProfileAnswerService.ts` | `REPLACED` | replaced by the current client-company answer/read-model line |
| `Backend/src/modules/client-workspace/companyProfileQuestionRegistry.ts` | `REPLACED` | replaced by the current company-profile/question registry line |
| `Frontend/src/components/cases/CaseCenterOverview.tsx` | `REPLACED` | superseded by summary-first `CaseWorkspaceOverview` |
| `Frontend/src/lib/communicationWorkspace.test.ts` | `REPLACED` | test harness canonicalized; deletion is not evidence that communication semantics disappeared |

No deleted route was restored. Deletion classification is deliberately
conservative: `REPLACED` is not a recommendation to resurrect the deleted
file.

## Route/API consumer proof

The expanded route register now records the strongest source-level chain for
the primary surfaces. A missing UI consumer or missing service edge is marked
in the matrix rather than inferred from a route name.

| capability | UI → API client | HTTP route | guard | service / persistence | status |
|---|---|---|---|---|---|
| case overview | `CaseDetail` / workspace components | case detail routes | internal case authorization | case services, Case/Timeline | connected |
| document upload/version | document workspace | document upload/version routes | object auth + upload validation/scanner | document/sharepoint services | connected in code |
| document diff | `ComparisonWorkspace` | comparison routes | document/version auth | comparison resolver + diff engine | metadata current; text recovery |
| communications | communications pages | communications routes | workforce/case guards | communication services, Communication | partial/context split |
| create case from communication | communication action | `/:id/create-case` | workforce + transaction | `casesService.createCase`, Case/Task/Timeline | connected on PR95 only |
| Work Package | case/work-package surfaces | work-package routes | workforce + case auth | work-package/task services | active recovery |
| review/decision | review workspace | review/task routes | task/document auth | review services, review models | connected in code |
| portal | portal pages | portal/client-identity routes | portal identity/grant | portal read models | live-unproven |
| compliance | company/org surfaces | compliance routes | client/org scope | evaluator/proposal services | island; partial cross-link |
| time | time entry page | time routes | workforce/case scope | time entry/report services | partial |
| handoff | case handoff component | handoff routes | case/object auth | handoff service | navigation-orphaned |
| clause library | clause page | clause routes | workforce auth | clause/assembly services | partial |

## Model and migration chronology

The chronology is semantic, not a dump of every column migration.

| domain | evidenced evolution | current evidence |
|---|---|---|
| Case / Matter | Matter-era case identity was retained while Case became the primary workspace; intake and Work Package snapshots add transactional opening semantics | Case, Matter, intake, case workflow services |
| Task | basic task CRUD evolved into lifecycle, submission, review decision, String-ID, dependency, and time-link semantics | task services, submission/review models, `/tasks` |
| Work Package / Workflow | template → immutable case snapshot → runtime items → DAG workflow/task provenance | Work Package models, orchestration, PR96/98 |
| Document | upload/download/version lifecycle remained; editor working-copy/autosave semantics were removed under Word-primary contract | DocumentVersion, workspace, comparison/review modules |
| Review / Annotation | structured comparison and anchored annotations became separate from document versions; decisions are persisted review semantics | review models/services and review UI |
| Communication | ledger rows gained case/client/document scalar links, provider conversation identity, import normalization, and guarded case creation; no persisted unread/reply/outgoing model | communication routes/services and Outlook adapter |
| Client / Organization / Portal | client identity split from portal identity, then workspace/membership/grant and organization mode were added | portal identity/grant services and portal routes |
| Time | TimeEntry and timesheet reporting exist, but task/deadline/work-package edges are not uniformly surfaced | time routes, reports, workload |
| Compliance | facts/answer state → applicability/requirements → findings → proposals → initiatives; proposal binds to an existing case | compliance modules and client-company surfaces |
| Contracts / Clause | clause library and template-based generation coexist; generation remains template-backed and Word-primary | clause, contracts, generation-draft |
| Anonymization / LegalAnalysis | anonymize → AI intake → rehydrate remains a security-sensitive document path; legal analysis is an intake/readiness surface, not legal-certainty output | anonymize and legal-analysis modules |

## Expanded graph and recomputed structure

The graph now separates document upload, version, diff, review, annotation,
decision, approval, publication, and client explanation. It also separates
portal identity/workspace/grant, communication import/association/case
creation, and Work Package template/snapshot/runtime/task creation.

Top connectivity cuts after expansion:

1. **Case → Work Package snapshot/runtime** — unlocks task provenance,
   workflow execution, requiredness, and case-centered progress.
2. **Communication → Case** — turns inbound triage into the daily legal-work
   spine; PR95 is active recovery, not canonical.
3. **Case → Document → Review** — connects the strongest current storage,
   version, review, annotation, and decision capabilities.
4. **Case → Time / Task → Time** — reconnects operational work to billing and
   capacity without inventing billing.
5. **Organization → Portal grant → Client-visible publication** — joins
   organization/compliance work to the customer-facing surface.

Product islands:

- compliance/company: missing durable edges from finding/proposal/initiative
  to case/work package/client-visible progress;
- clause/contracts: strong backend and pages, weak relationship to case review
  and publication;
- time/workload: operational data exists, but task/deadline/work-package
  context is inconsistently carried through;
- communication: global ledger, case context, client context, and Outlook
  provider identity are separate projections;
- handoff: backend and component exist, but primary navigation is not a
  reliable entry point.

## Three-state quantification

These are row/capability-register counts, not claims about deployment:

```text
BUILT_SOMEWHERE_COUNT=87/90 roadmap rows evidenced
CURRENTLY_CONNECTED_COUNT=19/90 roadmap rows at current source-level connectivity threshold
LIVE_ACCEPTED_COUNT=0/90 with direct production acceptance evidence
LIVE_ACCEPTANCE_FOR_REMAINDER=UNPROVEN
```

The denominator is the PR91 90-row roadmap register. A row can be built
somewhere while still being branch-only, backend-only, partially connected,
or live-unproven. This is why the counts must not be collapsed.

## PR95 exact-head independent rereview

`146539d7116ca90b5ce6086cffe6467ececb6ebe` descends from both the prior
reviewed head `4e2679bf2f8599498b21d02e802d7dc5e7d02981` and canonical
`c0ec1dfa2f13be267cab76e91d263ea0e0df8a28`. The communication route derives
client scope from persisted `communication.clientId`, rejects a mismatched
request selector, validates assignees with canonical `isWorkforceRole`, and
delegates to `casesService.createCase` inside the caller-owned transaction.
Exact-head CI includes the PostgreSQL Work Package regression (3 tests passed).

The Outlook status route is customer-safe and the frontend does not report
sync success when `result.success` is false. The sync DTO nevertheless
returns configured `mailboxAddress`, a provider mailbox identifier that
conflicts with the stated safe-output boundary. Classify `P1=1` for DTO
correction; do not classify this as body-metadata-only. The PR body wording
about “ACTIVE user validation” is stale because the implementation also
enforces canonical workforce role and activity policy.

## Remaining bounded unknowns

- complete authoritative metadata for every historical/closed PR outside the
  high-signal families;
- browser screenshots and fixture-backed runtime interaction for historical
  milestones;
- live Azure, Graph, SharePoint, scanner, and portal acceptance;
- exhaustive per-column migration chronology;
- complete API-client inventory beyond the primary registered surfaces.

```text
AUDIT_COMPLETE=NO
```
