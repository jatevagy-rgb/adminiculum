# Codex Handoff Rules

Use this document when Codex is asked to work while local Kilo/MiniMax work is also active.

## Mandatory rules

- Always read `AGENTS.md` first.
- Always create a separate task branch.
- Never commit directly to `main`.
- Do not assume local unpushed changes exist on GitHub.
- If the task depends on recent local work, ask the user to confirm it is pushed.
- Keep prototype/UI lab work isolated unless explicitly asked to integrate.
- Do not modify backend/auth/Prisma/SharePoint unless explicitly instructed.
- Never commit secrets.
- Never commit `.env` files.
- Do not commit uploads.
- Do not commit generated documents.

## Coordination checklist

1. Confirm task scope and branch name.
2. Confirm whether local Kilo/MiniMax changes were pushed.
3. Summarize plan and likely changed files before implementation.
4. Implement only scoped changes.
5. Report changed files and verification steps.

## Ready-to-copy prompt preface for Codex

"Before starting, read AGENTS.md and docs/CODEX_HANDOFF_RULES.md. Create a separate branch for this task. Do not commit directly to main. Do not modify backend/auth/Prisma/SharePoint unless explicitly instructed. Keep any prototype work isolated. Start by summarizing your plan and likely changed files."

