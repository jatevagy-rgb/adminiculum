# Branching Policy

## Naming convention

- `kilo/<short-task-name>` for Kilo/MiniMax local work
- `codex/<short-task-name>` for Codex GitHub work
- `fix/<short-task-name>` for targeted fixes
- `ui-lab/<short-task-name>` for isolated UI experiments

## Main branch rules

- Never commit directly to `main`.
- Never develop directly on `main`.
- `main` should only receive reviewed merges.

## PR / review recommendation

- Open a PR for every task branch.
- Require at least one review before merge when possible.
- Include changed file summary and validation steps in PR description.

## When to merge

- Merge only after review and successful checks.
- Ensure no overlap/conflict with other active agent branches.

## When to discard a branch

- Discard if work is obsolete, duplicated by another merged PR, or exploratory and no longer needed.

## Recovery when local changes exist

If you have uncommitted local changes:

```bash
git status
git stash push -m "wip/<task-name>"
git checkout main
git pull origin main
git checkout -b kilo/<new-task-name>
git stash pop
```

## Exact recommended commands

### Create a new local Kilo branch

```bash
git status
git checkout main
git pull origin main
git checkout -b kilo/<task-name>
```

### Check what changed

```bash
git status
git diff
```

### Push a branch

```bash
git add .
git commit -m "<clear message>"
git push -u origin <branch-name>
```

### Pull latest main

```bash
git checkout main
git pull origin main
```

### Delete a local branch after merge

```bash
git checkout main
git pull origin main
git branch -d <branch-name>
```

### Delete a remote branch after merge

```bash
git push origin --delete <branch-name>
```

