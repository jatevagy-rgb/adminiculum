# Kilo/MiniMax Local Rules

These rules apply to local machine execution for Kilo Coder / MiniMax.

## Start-of-task rules

- Always inspect current status first:

```bash
git status
```

- Do not start new implementation when unrelated uncommitted changes are present.
- If the tree is dirty with unrelated files, ask for direction before proceeding.

## Scope and safety rules

- Do not touch backend-sensitive areas unless explicitly requested.
- Prefer small, reviewable patches.
- Never run destructive Prisma commands.
- Never delete migrations.
- Never commit `.env` files or secrets.

## Delivery rules

- Always include a final report with:
  - changed files
  - verification/build checks run
  - intentionally untouched sensitive files
  - any uncertainties or limitations

