# Duplication decisions

The goal is one domain architecture with multiple intentional views, not one code path per historical UI.

| Duplication | Canonical winner | Best semantics | Best UI | Security winner | Keep | Replay from | Deprecate | Delete later |
|---|---|---|---|---|---|---|---|---|
| Workflow engines | DAG orchestration + Work Package + Task lifecycle + Document Review | Explicit templates, provenance, immutable snapshots, guarded transitions | Case Workspace progress and task/review workbenches | Current task/document/case auth | `caseWorkflowOrchestration`, current lifecycle services, PR96 runtime | Useful work-item labels and readiness rules | `cases/workflow.ts` predecessor and dead V2 state path | Only after route/import/test proof |
| Case creation | Canonical case composer using `casesService.createCase` and current intake validation | One transaction for client, assignee, Case Type, Work Package, workflow, timeline | Current intake workspace plus PR98 compact flow | Current workforce helper and server-owned scope | Current base composer | Typed participants/deadlines/thread links from `intakeCreate.service`; PR98 compact choices | Direct `tx.case.create` in communications and parallel legacy routes | After every caller converges |
| Work Package | Canonical template admin + snapshot + PR96 runtime | immutable requiredness, revision guards, explicit task creation | PR98 compact creation + PR100 case block | canonical case auth and workforce eligibility | Current admin/snapshot; PR96/98/100 in order | PR87/WP5 semantics only where active stack lacks them | stale PR53/65/66/67 branches as merge sources | Close/archive after canonical proof |
| Communications | Canonical Communication ledger/routes | b361 dual-link fail-closed projection and deterministic aggregation | Current inbox with historical triage hierarchy | current case/client auth | canonical persistence and import | PR83/85 read-model semantics | duplicated branch pages/services | after semantic replay tests |
| Comparison | Current comparison persistence/auth + PR94 extractor | typed statuses, extraction revision, bounded input | current Comparison Workspace | current document/version object auth | canonical comparison service | PR94 exact head | metadata-only as a separate product concept | retain metadata inside unified view |
| Portal modes | Current identity/workspace/grant resolver | explicit Individual vs Organization workspace | current Portal V2 shells | current `clientPortalAuth` and grants | both intentional modes behind one resolver | PR92 identity fix | mock/synthetic portal and client-supplied workspace authority | permanently |
| Compliance | Canonical Fact -> Rule -> Finding -> Proposal chain | temporal/scope fail-closed evaluation and case-bound proposal | company/org safe surfaces | current workforce/customer DTO split | canonical chain | navigation and case action only | demo-only logic as product implementation | keep fixtures only as fixtures |
| Extraction providers | PR94 shared extractor | one 25 MB/5M shared policy plus 2 MB/400k comparison policy | no provider UI | current object auth and safe error mapping | shared extractor | PR94 | ad hoc per-route parsing | after consumer inventory |
| Time/workload | Canonical TimeEntry/reporting plus Time-0 attribution semantics | fail-closed case/task attribution | current time/workload surfaces | current user/case/task authorization | current persistence and reports | `52f8fab` attribution classifier | duplicate `cb29052` WIP service where overlapping | after one accepted attribution API |
| Storage | Canonical SharePoint/Graph boundary with SEC-2/PR71 semantics | authorize -> validate -> scan -> store -> safe failure | current Document Workspace | current document object auth and scanner | production drive service | none from mock adapters | local/fixture adapters outside tests | never ship test adapters |

## Case creation convergence contract

The full intake and compact intake can remain different user experiences, but both must call one domain composer. The composer owns server-derived client scope, active workforce eligibility, atomic Case/Work Package/workflow creation, and timeline provenance. Optional participants, typed deadlines, and communication links are composable transaction inputs, not a reason for a second Case constructor.

## Intentional non-duplicates

- Individual and Organization portal modes are different authorized projections, not duplicate portals.
- Document review, Task review, and future Case reviewer are different object levels.
- Client question threads and future Outlook thread state are different domains.
- Recorded time and billing are different products.

`DUPLICATIONS_RESOLVED=10`.
