# Methodology and evidence

## Scope

Repository: `github.com/jatevagy-rgb/adminiculum`. No database, Azure, deployment, application, schema, migration, workflow, package, or runtime mutation was performed.

## Evidence classes

- `PROVEN`: directly observed at an exact SHA, file, route, component, model, test, workflow, branch ref, or authoritative PR metadata.
- `STRONGLY_INDICATED`: supported by multiple repository signals but not exhaustively runtime-verified.
- `UNPROVEN`: repository evidence is insufficient; includes live connectivity, external configuration, and historical UI runtime unless separately built.
- `CONTRADICTED`: a claim conflicts with the audited canonical tree or authoritative lifecycle metadata.

## Sources used

- `git fetch origin --prune`
- `git log --all`, `git log --all -- <path>`, `git rev-list`, `git branch -a`, `git tag`
- exact `git show` and `git diff` reads
- `git merge-base` and ahead/behind comparisons
- current canonical source tree
- PR91 metadata and its `docs/adminiculum-archaeology/*` artifacts, treated only as `ARCHAEOLOGY_V1_INPUT`
- authoritative PR metadata for PR91 and PR98; focused prior review evidence for PR92–PR97

## Canonical resolution

`release/editor-ops-workflow-1` = `c0ec1dfa2f13be267cab76e91d263ea0e0df8a28`, parent `50945ecd309c4c609fc48d07218fe42917ab8e82`.

`main` = `1b2f8794f4f85a3f0d49fb687cdfab490ed0569c` at audit time. The local audit branch starts from the release SHA, as requested.

## Limitations

- The repository contains 206 remote branch refs after prune and approximately 1,350 reachable commits; not every commit receives a capability row.
- GitHub PR lifecycle is authoritative only where queried. Branch ancestry is not a substitute for merged/unmerged status.
- Historical frontend runtime builds were not executed against production; no historical screenshot is claimed here. Marked `HISTORICAL_UI_RUNTIME_UNPROVEN`.
- CI green metadata is not accepted as proof when commands are masked, skipped, or `continue-on-error`.
- Counts in this atlas are evidence inventories, not product completion percentages.
