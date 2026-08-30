# Evidence index

## Exact review anchors

```text
RELEASE_BRANCH=release/editor-ops-workflow-1
CANONICAL_SHA=c0ec1dfa2f13be267cab76e91d263ea0e0df8a28
PR99_HEAD=21218f187c57394d38869c2f074983ed012c67e6
PR99_BASE=c0ec1dfa2f13be267cab76e91d263ea0e0df8a28
```

PR99 was reviewed from a detached exact-head worktree. The adjudication branch was created separately from exact canonical. No PR92-99 branch or product source was edited.

## PR99 material reviewed

All required atlas sections were read, including `07` through `14`, `26` through `30`, `32`, `33`, and `graph/*`. The remaining atlas chapters were also inspected for definitions, evidence conventions, route/UI inventories, acceptance boundaries, and active overlays.

## Graph health

PR99 reports 97 nodes and 77 edges. Twelve edges reference 11 unique node IDs absent from `nodes.csv`:

```text
SURF_COMPARE
SVC_ANNOTATIONS
SVC_REVIEW
SVC_PORTAL_AUTH
SVC_PORTAL_GRANTS
SVC_OUTLOOK
SVC_COMMUNICATIONS
SVC_WORK_PACKAGE_ADMIN
CAP_WORK_PACKAGE_RUNTIME
SVC_TIME
SURF_HANDOFF
```

`CAP_WORK_PACKAGE_RUNTIME` also conflicts with the registered `CAP_WORK_PACKAGE` identifier. Therefore graph counts and centrality are directional evidence only; source and history adjudication wins.

## Current-source corrections

- Search is current and reachable: `Frontend/src/app/search/page.tsx`, TopBar `/search`, frontend API adapter, and authorized `GET /documents/search` using Case read scope.
- Handoff is current and reachable from case handoff, documents, compare, and communications surfaces, with backend authorization and service support.
- Legal Analysis has secure backend routes/DTO/service and a frontend `LegalAnalysisIntakePanel`, but no current consumer was found. It is a surfacing candidate.
- Canonical Case creation already invokes `createCaseWorkPackageSnapshot` atomically with workflow creation. PR96/98/100 recover operational/runtime UX, not the existence of snapshot creation.
- `CaseIntakeDeadline` is persisted, while Agenda projects Case and Task dates but not typed intake deadlines.
- Prisma already relates `TimeEntry.taskId`, `TaskSubmissionTimeEntry`, and `Task.workPackageItemId`; the public time route still rejects task attribution. Historical Time-0 branches provide fail-closed attribution semantics, not billing.
- Current `bindProposalToCase` authorizes exact Case/Client and can create a Task on confirmation; it does not justify silent Case creation.
- Current portal grants/publication are strong primitives. The missing internal-intake edge is an explicit publication policy, not another portal.

## Historical and branch anchors

| Evidence | Exact SHA / ref | Use |
|---|---|---|
| Work Package runtime lineage | `9eec7bfb...` and active PR96/98/100 | immutable runtime and UI recovery |
| Document comparison | `509412df...`, active PR94 `957d23569e317bfdf07453f0437249d6bf860284` | extractor/diff/revision recovery |
| Contextual communications | `b36113a9...` | security rewrite and semantic replay |
| Communication inbox UI | `874933a8fcca4c76b40b0ff5988e3f97302d598e` | triage hierarchy replay |
| Handoff | `778105e3...` | current capability provenance |
| Legal Analysis | `2570a496...` | existing backend/panel semantics |
| Time attribution | `origin/opencode/time0-attribution-productization` at `52f8fab...`; `origin/codex/time-economics-v1` at `cb29052...` | attribution semantics only |
| Portal foundations | `9809c4c`, `35ca0e6` | identity/grant lineage |

## UI commit verification

Reachable exact references: `fb8c9bb3...`, `272945079...`, `511c9fbf...`, `40c1bf1a...`, and `874933a8...`. The first four are canonical ancestors and are regression references. Communication Inbox remains a semantic replay candidate.

`b1d1d82` and `338eaac` were absent from fetched refs and GitHub commit lookup, so they are rejected as exact historical evidence.

## Active recovery overlay

Exact metadata was fetched for PR92 through PR100 where relevant. PR100 head `0de767bdb9910e17c5fb6f6557a63795d66e1629` is a Draft stacked on PR98 head `eceaf33235cb0f880fbb07dac46e7b03839e2eaf` and recovers the Case Workspace Work Package block. Active branches are excluded from canonical completion until merged and revalidated.

```text
PR92=971d08883aa00317ebe743299079cc1cd23baba4
PR93=a851f9e04021049bd3df8a6c6fb231d07b2b752b
PR94=957d23569e317bfdf07453f0437249d6bf860284
PR95=146539d7116ca90b5ce6086cffe6467ececb6ebe
PR96=f417adae020f27bedc26f12c40ca9e0486a3d2e5
PR97=116f0c868c4f07df2a1a436dd6cd3e31001ca357
PR98=eceaf33235cb0f880fbb07dac46e7b03839e2eaf
PR100=0de767bdb9910e17c5fb6f6557a63795d66e1629
```

PR95 still requires closure of the `mailboxAddress` sync DTO provider-identifier exposure and must integrate after the Work Package case-composer train. PR96 remains gated by authorized release-data legacy inventory. PR93 and PR97 form one scanner composition chain.

## Limits of evidence

- No production database was read or mutated.
- No deployment or live environment was exercised.
- Repository CI and tests do not establish live provider configuration or real-user acceptance.
- PR99's `0/90` direct repository-audit production-acceptance count remains an evidence-boundary warning, not proof that the product has no accepted behavior.
- Completion percentages are bounded architectural estimates, not earned-value or release forecasts.

## Audit conclusion

The evidence strongly supports a recovery-first strategy: most domain primitives exist, while the largest remaining value lies in canonical convergence, missing edges, safe surfacing, and current-security rewrites. It does not support wholesale restoration or a claim that most of the product is already live.
