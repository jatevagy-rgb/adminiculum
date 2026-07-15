# Narrow Release Component Baseline Assembly

Date: 2026-07-15
Branch: `release/editor-ops-workflow-1`
Deployment action: none

## Accepted baselines

| Component | Accepted baseline | Classification | Assembly action |
| --- | --- | --- | --- |
| Frontend | `dc0780e` | `UNIQUE_COMMIT_MATCH_HIGH_CONFIDENCE`, human accepted | Worktree created from `dc0780e`. |
| Backend | `8ce26c0` | `EXACT_COMMIT_PROVEN_BY_OPERATOR_DEPLOY_RECORD_AND_ARTIFACT` | `Backend/` restored from `8ce26c0` and committed as baseline assembly. |

## Baseline assembly commit

`27ab674 release: reconstruct deployed frontend and backend baseline`

The baseline assembly intentionally brought forward the deployed backend Outlook provider/import/adapter baseline that was not present at the frontend baseline commit.

## Cross-component restoration

- Restored `Backend/` from `8ce26c0`.
- Left `Frontend/` at `dc0780e` before approved release layering.
- Did not restore root deployment files, Azure config, Client Portal files, OpenAPI/CORS hardening, later docs, or package files outside the approved release surface.

## Safety posture

- No deployment.
- No Azure config change.
- No DB operation.
- No migration execution.
- No feature flag change.
