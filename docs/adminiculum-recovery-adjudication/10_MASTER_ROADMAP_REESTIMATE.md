# Master roadmap re-estimate

## Why row counting is invalid

The PR99 `87/90` historical-evidence count means code or semantics existed somewhere. It does not prove current connection, current security, production readiness, or live acceptance. The weighted model therefore measures product convergence, not repository occupancy.

## Dimensions and weights

| Dimension | Weight | Evidence required |
|---|---:|---|
| Foundation | 25% | canonical domain model, persistence, APIs, tests, current architecture |
| Connected Product | 25% | reachable UI/API path, canonical edges, no duplicate workflow, safe DTO |
| Daily Lawyer Workflow | 20% | coherent case-centered tasks/documents/communications/time/attention journey |
| Production Readiness | 20% | current security, migrations, CI, external-provider failure handling, operations |
| Live Accepted | 10% | authorized hosted scenario evidence on the canonical release |

For each state, the reported point is the midpoint of a bounded estimate. Bounds acknowledge that repository evidence cannot prove deployment configuration or real-user acceptance.

## Weighted states

| State | Foundation | Connected Product | Daily Workflow | Production Readiness | Live Accepted | Weighted range | Reported point |
|---|---:|---:|---:|---:|---:|---:|---:|
| A - current canonical | 82-88 | 50-58 | 52-62 | 47-57 | 12-22 | 54-62 | **58%** |
| B - active recovery PRs integrated | 90-94 | 62-70 | 62-72 | 57-67 | 12-22 | 63-71 | **67%** |
| C - high-value recovery integrated | 92-96 | 76-84 | 76-86 | 70-80 | 18-28 | 73-81 | **77%** |
| D - all safe recovery integrated | 94-98 | 86-92 | 86-94 | 80-90 | 18-37 | 80-88 | **84%** |
| E - remaining core greenfield complete | 96-99 | 92-97 | 92-97 | 88-94 | 40-58 | 87-93 | **90%** |

## State definitions

- State A uses exact canonical `c0ec1dfa2f13be267cab76e91d263ea0e0df8a28`; active PR code is excluded.
- State B assumes PR92, PR94, PR93/97, PR96/98/100, and repaired PR95 are integrated in dependency order and remain green after final sync.
- State C adds the highest-value reconnects: communication projection, deadline-agenda, Task-Time, explicit publication, and Legal Analysis surfacing.
- State D adds every security-compatible recovery candidate but excludes rejected restorations and greenfield domains.
- State E includes the four true-greenfield core domains. It remains below 100 because broad live acceptance, rollout, provider operations, and long-term reliability are not repository-completion claims.

## Sensitivity and governance

A state advances only when its dependency branches are canonical and the required acceptance exists. A candidate may improve Foundation without improving Connected Product; a green CI run may improve Production Readiness without improving Live Accepted. Re-estimate at each canonical train boundary and cite evidence, rather than adjusting percentages from roadmap row counts.

```text
CURRENT_MASTER_ROADMAP_PERCENT=58% (bounded 54-62%)
AFTER_ACTIVE_RECOVERY_PERCENT=67% (bounded 63-71%)
AFTER_HIGH_VALUE_RECOVERY_PERCENT=77% (bounded 73-81%)
AFTER_ALL_SAFE_RECOVERY_PERCENT=84% (bounded 80-88%)
AFTER_TRUE_GREENFIELD_PERCENT=90% (bounded 87-93%)
```
