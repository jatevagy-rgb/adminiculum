# Deployment Baseline Evidence Reconciliation

Date: 2026-07-15
Source branch: `hotfix/runtime-shape-20260308`
Source HEAD at reconciliation start: `052839e`
Deployment action: none
Release branch/worktree action: none

## Executive summary

This note reconciles the active artifact forensics with the later operator-provided backend deployment record for the narrow editor/ops/workflow release gate.

Result:

- Frontend baseline remains `UNIQUE_COMMIT_MATCH_HIGH_CONFIDENCE` for `dc0780e`, not exact proof.
- Backend baseline is defensibly upgraded to `EXACT_COMMIT_PROVEN_BY_OPERATOR_DEPLOY_RECORD_AND_ARTIFACT` for `8ce26c0` if the operator handoff record is accepted as deployment evidence.
- Release branch creation remains **blocked** because the frontend reconstructed baseline still requires explicit human acceptance.
- No release worktree or branch was created.

## Source inputs used

- Active frontend artifact forensics: `docs/active-artifact-git-baseline-forensics-1.md`.
- Active backend artifact forensics: `docs/backend-active-artifact-fingerprint.md`.
- Confidence scoring: `docs/active-artifact-commit-confidence-matrix.md`.
- Prior baseline audit: `docs/authoritative-deployment-baseline-audit.md`.
- Release selection gate: `docs/narrow-release-approved-change-selection.md`.
- Operator-provided reconciliation handoff: `Adminiculum — BASELINE-EVIDENCE-RECONCILIATION-AND-NARROW-RELEASE-1`.
- Local attachment for the earlier deploy request: `Adminiculum — final backend deploy for Outlook Graph adapter skeleton and COMM closeout state`.
- Git history around `dc0780e`, `2cf1594`, and `8ce26c0`.

## Evidence reconciliation table

| Evidence | Frontend/Backend | Deployment ID | Commit | Independent? | Matches artifact? | Confidence impact |
| --- | --- | --- | --- | --- | --- | --- |
| Active frontend Kudu artifact forensics | Frontend | `d21de1cb-46a1-4994-8bcd-45749c42d14e` | `dc0780e` reconstructed | Yes: artifact-derived | Yes: route manifest, package posture, and source tuple uniquely match within deployment window | Supports `UNIQUE_COMMIT_MATCH_HIGH_CONFIDENCE`; does not prove exact because no embedded SHA exists. |
| Active backend Kudu artifact forensics | Backend | `f3129580-9574-429a-a1b3-f078b1319cd7` | Range `2cf1594..8ce26c0` | Yes: artifact-derived | Yes: Graph adapter and import service present; later agenda/workload/editor modules absent | Narrows backend to runtime-equivalent range; cannot alone distinguish docs-only `8ce26c0`. |
| Current operator handoff record | Backend | `f3129580-9574-429a-a1b3-f078b1319cd7` | `8ce26c0` | Partially: operator-supplied task evidence, not embedded in artifact | Yes: described backend-only Oryx ZIP from `HEAD:Backend`; artifact contains Graph adapter/import service and lacks later modules | If accepted, upgrades backend to exact deployed commit through deployment record plus artifact non-contradiction. |
| Earlier deploy request attachment | Backend | Not a result record in itself | `8ce26c0` requested | Partially: local task attachment | Yes: requested backend-only deploy from `HEAD:Backend`; expected Graph adapter in artifact and no frontend/migration changes | Corroborates that `8ce26c0` was the intended backend deploy source, but does not by itself prove completion. |
| `docs/communication-outlook-intake-closeout.md` at `8ce26c0` | Backend | None | `2cf1594` referenced | Repo-committed documentation | Not contradictory after later deploy request: it says adapter was not deployed yet at closeout time | Explains why artifact forensics first found only a range; the later operator record is needed for exact commit. |
| Git history comparison | Both | None | merge-base `dc0780e`; backend runtime changes after `dc0780e` through `2cf1594`; `8ce26c0` docs-only | Yes: repository history | Yes: no frontend file changes from `dc0780e` to `8ce26c0`; backend changes include Outlook provider/import/adapter lineage | Supports separate component baselines and warns against blindly branching from only one component commit. |

## Backend deployment evidence reconciliation

The active backend artifact proves the following runtime markers:

- `Backend/src/modules/communications/outlookGraph.adapter.ts` is present.
- `Backend/src/modules/communications/outlookImport.service.ts` is present.
- `Backend/src/modules/communications/routes.ts` is present.
- Later agenda/workload/editor route modules are absent.
- CP-SCHEMA-1 models are absent from packaged Prisma schema.

Git history shows:

- `2cf1594` adds the Outlook Graph adapter skeleton.
- `8ce26c0` is a docs-only closeout commit after `2cf1594`.
- A backend-only Oryx ZIP built from `HEAD:Backend` at `8ce26c0` would be runtime-equivalent to one built from `2cf1594` for backend source, except for repository metadata outside `Backend/`.

The current operator handoff explicitly states that the same active backend deployment ID `f3129580-9574-429a-a1b3-f078b1319cd7` was deployed from commit `8ce26c0` using a backend-only Oryx ZIP from `HEAD:Backend`, and that production smoke matched the active artifact behavior.

There is no artifact contradiction. Therefore the strongest defensible backend classification is:

`EXACT_COMMIT_PROVEN_BY_OPERATOR_DEPLOY_RECORD_AND_ARTIFACT`

Caveat: the exact proof depends on accepting the operator deployment record supplied in the handoff. The artifact alone remains range-only.

## Frontend baseline decision

The frontend artifact evidence remains strong but not exact:

- unique top-scoring candidate: `dc0780e`;
- package/dependency posture matches: Next `15.2.4`, no `jszip`, no Tiptap table extension;
- route manifest matches the pre-editor and pre-portal frontend;
- UI/source marker tuple uniquely matched `dc0780e` in the deployment window;
- no material contradiction was found;
- no equivalent-scoring alternative candidate was found in the deployment window.

Classification:

`UNIQUE_COMMIT_MATCH_HIGH_CONFIDENCE`

Human decision entry:

- Frontend release baseline reconstructed candidate: `dc0780e`.
- Status: `HUMAN_ACCEPTANCE_REQUIRED`.
- Codex did not silently accept this reconstructed baseline on behalf of the owner.

## Common baseline assembly finding

Git checks showed:

- merge-base of `dc0780e` and `8ce26c0`: `dc0780e`;
- `8ce26c0` descends from `dc0780e`;
- there are no frontend file changes in `dc0780e..8ce26c0`;
- backend commits in `dc0780e..8ce26c0` include Outlook provider/import/service/adapter changes.

If human acceptance is later granted, the safest branch assembly is still explicit component restoration:

1. create a separate worktree and branch, not from current `052839e`;
2. start from `dc0780e` or a reviewed common-base assembly;
3. restore `Backend/` from `8ce26c0`;
4. preserve/review only necessary root files;
5. verify zero accidental Prisma/migration/Client Portal/OpenAPI/CORS drift before layering approved changes.

## Hard gate evaluation

| Gate | Status | Reason |
| --- | --- | --- |
| Backend baseline | PASS, conditional on accepting the operator record | Same backend deployment ID and commit `8ce26c0` are operator-recorded; artifact contains no contradiction. |
| Frontend baseline | BLOCKED | `dc0780e` is high-confidence reconstructed, not exact; prompt requires explicit human acceptance and marks status `HUMAN_ACCEPTANCE_REQUIRED`. |
| Release worktree creation | BLOCKED | Phase 4 says to stop if explicit human acceptance is not present. |
| Schema/migration exclusion | Not evaluated on release branch | No release branch was created. |
| Client Portal/OpenAPI/CORS exclusion | Not evaluated on release branch | No release branch was created. |
| Runtime compatibility | Not evaluated on release branch | No release branch was created. |

## Narrow release branch decision

No release branch or worktree was created.

Blocked target:

- Worktree: `C:\Users\hubay\Documents\Adminiculum-release-editor-ops`
- Branch: `release/editor-ops-workflow-1`

Reason: frontend reconstructed baseline `dc0780e` still requires explicit human acceptance before branch creation.

## Exact commands for later branch creation after acceptance

These commands are recorded for a later prompt only. They were not run by this task.

```powershell
git fetch origin
git worktree add C:\Users\hubay\Documents\Adminiculum-release-editor-ops -b release/editor-ops-workflow-1 dc0780e
cd C:\Users\hubay\Documents\Adminiculum-release-editor-ops
git restore --source 8ce26c0 -- Backend
git status
git diff -- Backend Frontend Backend\prisma\schema.prisma Backend\prisma\migrations
```

After this, the later task must inspect root/package/shared files and commit a separate baseline assembly only if the diff proves the intended component restoration and no blocked files are included.

## Go / no-go

Current result:

`NO_GO_FRONTEND_BASELINE_HUMAN_ACCEPTANCE_REQUIRED`

Final classification for this reconciliation step:

`baseline_reconciled_narrow_release_1_frontend_human_acceptance_required`

## Safety confirmation

- No deployment was performed.
- No Azure configuration was changed.
- No App Service was restarted.
- No production database was queried.
- No Prisma migration command was run.
- No release branch was created.
- No release worktree was created.
- No runtime, schema, migration, Client Portal, OpenAPI, CORS, auth, package, or frontend behavior change was made.
