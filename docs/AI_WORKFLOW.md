# AI Workflow (Kilo/MiniMax + Codex)

This project supports a dual-agent workflow:

- Local machine: Kilo Coder / MiniMax
- GitHub-based tasks: Codex

`main` on GitHub is the source of truth.

## Core principles

- Never work directly on `main`.
- Always create a task branch.
- Always commit and push local work before handing off to Codex.
- Always pull latest `main` before starting new local Kilo/MiniMax work.
- Never let two agents modify the same file at the same time.

## Daily safe workflow

1. Start local work:

```bash
git checkout main
git pull origin main
git checkout -b kilo/<task-name>
```

2. Let Kilo/MiniMax work.

3. Review changes:

```bash
git status
git diff
```

4. Commit and push:

```bash
git add .
git commit -m "<message>"
git push -u origin kilo/<task-name>
```

5. If Codex is needed:

- Ensure local work is already pushed.
- Ask Codex to work on a separate branch.
- Do not modify the same files locally until Codex finishes.

6. After Codex PR merge:

```bash
git checkout main
git pull origin main
```

## What can go wrong?

- Unpushed local changes diverge from GitHub state.
- Codex works from stale GitHub history.
- Merge conflicts from overlapping edits.
- Both agents editing the same file in parallel.
- Secrets accidentally committed (`.env`, keys, tokens).
- Build artifacts accidentally committed (`.next`, `dist`, uploads, generated outputs).

